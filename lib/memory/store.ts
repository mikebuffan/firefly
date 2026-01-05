import { supabaseAdmin } from "@/lib/supabase/admin";
import { LOCK_ON_CORRECTION_COUNT } from "@/lib/memory/rules";
import type { MemoryItem, MemoryUpsertResult } from "@/lib/memory/types";
import { embedText, memoryToEmbedString } from "@/lib/memory/embeddings";

const ITEMS_TABLE = "memory_items";
const EVENTS_TABLE = "memory_pending";

export async function upsertMemoryItems(
  authedUserId: string,
  items: MemoryItem[]
): Promise<MemoryUpsertResult> {
  const admin = supabaseAdmin(); // ✅
  const result: MemoryUpsertResult = { created: [], updated: [], locked: [], ignored: [] };

  for (const item of items) {
    const key = item.key.trim();

    const { data: existing, error: exErr } = await admin
      .from(ITEMS_TABLE)
      .select("*")
      .eq("user_id", authedUserId)
      .eq("key", key)
      .maybeSingle();
    if (exErr) throw exErr;

    const embedding = await embedText(memoryToEmbedString(key, item.value));

    if (!existing) {
      const { error: insErr } = await admin.from(ITEMS_TABLE).insert({
        user_id: authedUserId,
        key,
        value: item.value,
        tier: item.tier,
        user_trigger_only: item.user_trigger_only,
        importance: item.importance,
        confidence: item.confidence,
        embedding,
        mention_count: 1,
        last_seen_at: new Date().toISOString(),
      });
      if (insErr) throw insErr;

      await admin.from(EVENTS_TABLE).insert({
        user_id: authedUserId,
        memory_key: key,
        event_type: "create",
        payload: item,
      });

      result.created.push(key);
      continue;
    }

    if (existing.locked) {
      await admin
        .from(ITEMS_TABLE)
        .update({
          last_seen_at: new Date().toISOString(),
          mention_count: (existing.mention_count ?? 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      result.ignored.push(key);
      continue;
    }

    const mergedValue = { ...(existing.value ?? {}), ...(item.value ?? {}) };

    const { error: updErr } = await admin
      .from(ITEMS_TABLE)
      .update({
        value: mergedValue,
        tier: item.tier,
        user_trigger_only: item.user_trigger_only,
        importance: Math.max(existing.importance ?? 5, item.importance),
        confidence: Math.max(existing.confidence ?? 0.7, item.confidence),
        embedding,
        mention_count: (existing.mention_count ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updErr) throw updErr;

    await admin.from(EVENTS_TABLE).insert({
      user_id: authedUserId,
      memory_key: key,
      event_type: "update",
      payload: { before: existing.value, after: mergedValue },
    });

    result.updated.push(key);
  }

  return result;
}

export async function correctMemoryItem(params: {
  authedUserId: string;
  key: string;
  newValue: Record<string, any>;
  projectId?: string | null;
}) {
  const admin = supabaseAdmin(); // ✅
  const { authedUserId, key, newValue } = params;

  const { data: existing, error } = await admin
    .from(ITEMS_TABLE)
    .select("*")
    .eq("user_id", authedUserId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;

  const embedding = await embedText(memoryToEmbedString(key, newValue));

  if (!existing) {
    await admin.from(ITEMS_TABLE).insert({
      user_id: authedUserId,
      key,
      value: newValue,
      tier: "core",
      user_trigger_only: false,
      importance: 9,
      confidence: 1,
      source: "corrected",
      correction_count: 1,
      locked: false,
      embedding,
    });

    await admin.from(EVENTS_TABLE).insert({
      user_id: authedUserId,
      memory_key: key,
      event_type: "correct",
      payload: { newValue, correction_count: 1 },
    });

    return { locked: false };
  }

  const nextCorrectionCount = (existing.correction_count ?? 0) + 1;
  const shouldLock = nextCorrectionCount >= LOCK_ON_CORRECTION_COUNT;

  await admin
    .from(ITEMS_TABLE)
    .update({
      value: newValue,
      embedding,
      correction_count: nextCorrectionCount,
      locked: shouldLock,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      source: "corrected",
      confidence: 1,
    })
    .eq("id", existing.id);

  await admin.from(EVENTS_TABLE).insert({
    user_id: authedUserId,
    memory_key: key,
    event_type: shouldLock ? "lock" : "correct",
    payload: { newValue, correction_count: nextCorrectionCount },
  });

  return { locked: shouldLock };
}

export async function reinforceMemoryUse(authedUserId: string, keysUsed: string[]) {
  const admin = supabaseAdmin(); // ✅
  if (!keysUsed.length) return;
  const now = new Date().toISOString();

  for (const key of keysUsed) {
    const { data: row } = await admin
      .from(ITEMS_TABLE)
      .select("id,confidence,mention_count")
      .eq("user_id", authedUserId)
      .eq("key", key)
      .maybeSingle();

    if (!row) continue;

    const nextConfidence = Math.min(1, Number(row.confidence ?? 0.7) + 0.03);

    await admin
      .from(ITEMS_TABLE)
      .update({
        confidence: nextConfidence,
        mention_count: (row.mention_count ?? 1) + 1,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("id", row.id);

    await admin.from(EVENTS_TABLE).insert({
      user_id: authedUserId,
      memory_key: key,
      event_type: "update",
      payload: { reinforce: true, confidence: nextConfidence },
    });
  }
}
