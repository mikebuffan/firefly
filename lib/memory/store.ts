// lib/memory/store.ts
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LOCK_ON_CORRECTION_COUNT } from "@/lib/memory/rules";
import type { MemoryItem, MemoryUpsertResult } from "@/lib/memory/types";
import { embedText, memoryToEmbedString } from "@/lib/memory/embeddings";

const ITEMS_TABLE = "memory_items";
const EVENTS_TABLE = "memory_pending";

type RevealPolicy = "normal" | "user_trigger_only" | "never";

/** Store text in mem_value (your schema), even if caller passes object */
function toTextValue(v: any): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** A stable display string if caller doesn't provide one */
function toDisplayText(key: string, memValue: string) {
  return `${key}: ${memValue}`;
}

/** DB uses reveal_policy string; your extracted MemoryItem uses user_trigger_only boolean */
function revealPolicyFrom(item: MemoryItem): RevealPolicy {
  return item.user_trigger_only ? "user_trigger_only" : "normal";
}

/** DB uses pinned boolean to represent "core" memory in your retrieval mapping */
function pinnedFrom(item: MemoryItem): boolean {
  return item.tier === "core";
}

/** Your DB uses numeric strength. Map importance (1..10) into sane strength. */
function strengthFromImportance(importance?: number): number {
  const imp = Number(importance ?? 5);
  // 1..10 -> ~1.0..3.0 (tunable later)
  return Math.max(1, Math.min(3, 0.5 + imp / 4));
}

/**
 * IMPORTANT:
 * Your uniqueness index is (user_id, project_id, mem_key).
 * If projectId is null, Postgres allows multiple nulls in a UNIQUE index.
 * So you should prefer projectId (recommended), which you already pass now.
 */
async function findExisting(params: {
  authedUserId: string;
  projectId: string | null;
  key: string;
}) {
  const admin = supabaseAdmin();
  const { authedUserId, projectId, key } = params;

  let q = admin
    .from(ITEMS_TABLE)
    .select("*")
    .eq("user_id", authedUserId)
    .eq("mem_key", key);

  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

async function logEvent(params: {
  authedUserId: string;
  projectId: string | null;
  key: string;
  event_type: string;
  payload: any;
}) {
  const admin = supabaseAdmin();
  const { authedUserId, projectId, key, event_type, payload } = params;

  // If your memory_pending schema differs, this is the only place you'll need to adjust.
  const { error } = await admin.from(EVENTS_TABLE).insert({
    user_id: authedUserId,
    project_id: projectId,
    memory_key: key,
    event_type,
    payload,
  });

  // Don't crash the whole app if event logging fails (optional)
  if (error) {
    console.warn("memory_pending insert failed:", error);
  }
}

export async function upsertMemoryItems(
  authedUserId: string,
  items: MemoryItem[],
  projectId: string | null = null
): Promise<MemoryUpsertResult> {
  const admin = supabaseAdmin();
  const result: MemoryUpsertResult = { created: [], updated: [], locked: [], ignored: [] };

  for (const item of items) {
    const key = item.key?.trim();
    if (!key) continue;

    const memValue = toTextValue(item.value);
    const displayText = toDisplayText(key, memValue);
    const reveal_policy = revealPolicyFrom(item);
    const pinned = pinnedFrom(item);
    const strength = strengthFromImportance(item.importance);

    const embedding = await embedText(memoryToEmbedString(key, item.value));

    const existing = await findExisting({ authedUserId, projectId, key });

    if (!existing) {
      const { error } = await admin.from(ITEMS_TABLE).insert({
        user_id: authedUserId,
        project_id: projectId,
        mem_key: key,
        mem_value: memValue,
        display_text: displayText,
        reveal_policy,
        strength,
        pinned,
        is_locked: false,
        correction_count: 0,
        last_reinforced_at: new Date().toISOString(),
        embedding,
      });
      if (error) throw error;

      await logEvent({
        authedUserId,
        projectId,
        key,
        event_type: "create",
        payload: {
          key,
          mem_value: memValue,
          tier: item.tier,
          reveal_policy,
          pinned,
          strength,
        },
      });

      result.created.push(key);
      continue;
    }

    if (existing.is_locked) {
      // Locked: do not overwrite content, but we can lightly reinforce
      const { error } = await admin
        .from(ITEMS_TABLE)
        .update({
          last_reinforced_at: new Date().toISOString(),
          strength: Number(existing.strength ?? 1) + 0.05,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) throw error;

      await logEvent({
        authedUserId,
        projectId,
        key,
        event_type: "locked_ignore",
        payload: { reason: "is_locked", attempted_value: memValue },
      });

      result.ignored.push(key);
      result.locked.push(key);
      continue;
    }

    // Update existing: overwrite mem_value + bump strength + update embedding
    const nextStrength = Math.max(Number(existing.strength ?? 1), strength) + 0.2;

    const { error } = await admin
      .from(ITEMS_TABLE)
      .update({
        mem_value: memValue,
        display_text: displayText,
        reveal_policy,
        pinned,
        strength: nextStrength,
        last_reinforced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        embedding,
      })
      .eq("id", existing.id);

    if (error) throw error;

    await logEvent({
      authedUserId,
      projectId,
      key,
      event_type: "update",
      payload: { before: existing.mem_value, after: memValue, strength: nextStrength },
    });

    result.updated.push(key);
  }

  return result;
}

export async function correctMemoryItem(params: {
  authedUserId: string;
  key: string;
  newValue: Record<string, any> | string;
  projectId?: string | null;
}) {
  const admin = supabaseAdmin();
  const { authedUserId, key, newValue } = params;
  const projectId = params.projectId ?? null;

  const cleanKey = key.trim();
  if (!cleanKey) return { locked: false };

  const memValue = toTextValue(newValue);
  const displayText = toDisplayText(cleanKey, memValue);
  const embedding = await embedText(memoryToEmbedString(cleanKey, newValue));

  const existing = await findExisting({ authedUserId, projectId, key: cleanKey });

  if (!existing) {
    const { error } = await admin.from(ITEMS_TABLE).insert({
      user_id: authedUserId,
      project_id: projectId,
      mem_key: cleanKey,
      mem_value: memValue,
      display_text: displayText,
      reveal_policy: "normal",
      pinned: true, // corrections are usually "core"
      strength: 3,
      correction_count: 1,
      is_locked: false,
      last_reinforced_at: new Date().toISOString(),
      embedding,
    });
    if (error) throw error;

    await logEvent({
      authedUserId,
      projectId,
      key: cleanKey,
      event_type: "correct_create",
      payload: { newValue, correction_count: 1 },
    });

    return { locked: false };
  }

  const nextCorrectionCount = (existing.correction_count ?? 0) + 1;
  const shouldLock = nextCorrectionCount >= LOCK_ON_CORRECTION_COUNT;

  const { error } = await admin
    .from(ITEMS_TABLE)
    .update({
      mem_value: memValue,
      display_text: displayText,
      embedding,
      correction_count: nextCorrectionCount,
      is_locked: shouldLock,
      pinned: true,
      strength: Math.max(Number(existing.strength ?? 1), 2.5),
      updated_at: new Date().toISOString(),
      last_reinforced_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (error) throw error;

  await logEvent({
    authedUserId,
    projectId,
    key: cleanKey,
    event_type: shouldLock ? "lock" : "correct",
    payload: { newValue, correction_count: nextCorrectionCount },
  });

  return { locked: shouldLock };
}

export async function reinforceMemoryUse(
  authedUserId: string,
  keysUsed: string[],
  projectId: string | null = null
) {
  const admin = supabaseAdmin();
  if (!keysUsed.length) return;

  const now = new Date().toISOString();

  for (const key of keysUsed) {
    const cleanKey = key.trim();
    if (!cleanKey) continue;

    const existing = await findExisting({ authedUserId, projectId, key: cleanKey });
    if (!existing) continue;
    if (existing.is_locked) continue;

    // Reinforcement = strength bump + updated reinforcement timestamp
    const nextStrength = Number(existing.strength ?? 1) + 0.15;

    const { error } = await admin
      .from(ITEMS_TABLE)
      .update({
        strength: nextStrength,
        last_reinforced_at: now,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) throw error;

    await logEvent({
      authedUserId,
      projectId,
      key: cleanKey,
      event_type: "reinforce",
      payload: { reinforce: true, strength: nextStrength },
    });
  }
}
