import { supabaseAdmin, safeQuery } from "@/lib/supabase/admin";
import { LOCK_ON_CORRECTION_COUNT } from "@/lib/memory/rules";
import type { MemoryItem, MemoryUpsertResult } from "@/lib/memory/types";
import { embedText, memoryToEmbedString } from "@/lib/memory/embeddings";
import { logMemoryEvent } from "@/lib/memory/logger";
import { getServerSupabase } from "@/lib/supabase/server";

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

/** DB uses reveal_policy string; extracted MemoryItem uses user_trigger_only boolean */
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
  return Math.max(1, Math.min(3, 0.5 + imp / 4));
}

/**
 * IMPORTANT:
 * uniqueness index is (user_id, project_id, mem_key)
 * when projectId is null, UNIQUE won't prevent duplicates (NULL != NULL)
 * so prefer passing projectId (you already do).
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

/** Write to memory_pending for event tracking */
async function logEvent(params: {
  authedUserId: string;
  projectId: string | null;
  key: string;
  event_type: string;
  payload: any;
}) {
  const admin = supabaseAdmin();
  const { authedUserId, projectId, key, event_type, payload } = params;

  const { error } = await admin.from(EVENTS_TABLE).insert({
    user_id: authedUserId,
    project_id: projectId,
    question: "memory_event",
    ops: { kind: "memory_event", event_type },
    memory_key: key,
    event_type,
    payload,
  });

  if (error) console.warn("memory_pending insert failed:", error);
}

/** Ensure embedding is a plain number[] (pgvector expects array) */
function normalizeEmbedding(emb: any): number[] {
  if (Array.isArray(emb)) return emb;
  if (emb?.data && Array.isArray(emb.data)) return emb.data;
  if (emb?.embedding && Array.isArray(emb.embedding)) return emb.embedding;
  return [];
}

/**
 * 🚀 Main Upsert Logic
 * Fully original logic preserved, wrapped in safeQuery for resilience.
 */
export async function upsertMemoryItems(
  authedUserId: string,
  items: MemoryItem[],
  projectId: string | null = null
): Promise<MemoryUpsertResult> {
  const start = Date.now();

  const result = await safeQuery(async (client) => {
    const admin = supabaseAdmin();
    const res: MemoryUpsertResult = { created: [], updated: [], locked: [], ignored: [] };

    for (const item of items) {
      const key = item.key?.trim();
      if (!key) continue;

      const memValue = toTextValue(item.value);
      const displayText = toDisplayText(key, memValue);
      const reveal_policy = revealPolicyFrom(item);
      const pinned = pinnedFrom(item);
      const strength = strengthFromImportance(item.importance);

      const rawEmbedding = await embedText(memoryToEmbedString(key, item.value));
      const embedding = normalizeEmbedding(rawEmbedding);

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

        res.created.push(key);
        continue;
      }

      if (existing.is_locked) {
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

        res.ignored.push(key);
        res.locked.push(key);
        continue;
      }

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
        payload: {
          before: existing.mem_value,
          after: memValue,
          strength: nextStrength,
        },
      });

      res.updated.push(key);
    }

    return res;
  }, "upsertMemoryItems");

  const duration = Date.now() - start;
  await logMemoryEvent("upsert_summary", {
    items: items.length,
    created: result.created.length,
    updated: result.updated.length,
    duration,
  });

  return result;
}

/**
 * 🧠 Correction Handler
 */
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

  const rawEmbedding = await embedText(memoryToEmbedString(cleanKey, newValue));
  const embedding = normalizeEmbedding(rawEmbedding);

  const existing = await findExisting({ authedUserId, projectId, key: cleanKey });

  if (!existing) {
    const { error } = await admin.from(ITEMS_TABLE).insert({
      user_id: authedUserId,
      project_id: projectId,
      mem_key: cleanKey,
      mem_value: memValue,
      display_text: displayText,
      reveal_policy: "normal",
      pinned: true,
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

/**
 * 🔁 Memory strength reinforcement RPC
 */
export async function updateMemoryStrength(memoryId: string, delta: number) {
  const supabase = await getServerSupabase(); // ✅ Fix: added await
  const { data, error } = await supabase.rpc("update_memory_strength", {
    p_memory_id: memoryId,
    p_delta: delta,
  });
  if (error) throw error;
  await logMemoryEvent("reinforce", { memoryId, delta });
  return data;
}

/**
 * 📈 Reinforce memory usage for referenced items
 */
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
    if (!existing || existing.is_locked) continue;

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
