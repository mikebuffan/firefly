// 🔧 Purpose: Retrieves memory context with semantic or normal recall, caching results.
// 🧠 Notes:
// - Keeps your 3-minute cache and full record parsing.
// - Adds retry protection via safeQuery for vector RPC calls.

import { supabaseAdmin, safeQuery } from "@/lib/supabase/admin";
import { openAIEmbed } from "@/lib/providers/openai";

const memoryCache = new Map<string, any>();
const CACHE_TTL = 1000 * 60 * 3;
const cacheExpiry = new Map<string, number>();

function parseMaybeJson(s: any) {
  if (typeof s !== "string") return s;
  const t = s.trim();
  if (!t) return s;
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { return JSON.parse(t); } catch { return s; }
  }
  return s;
}

function avoidingNull(display: any, key: string, val: string) {
  return display ?? `${key}: ${val}`;
}

export async function getMemoryContext(params: {
  authedUserId: string;
  projectId?: string | null;
  latestUserText: string;
  useVectorSearch?: boolean;
  useCache?: boolean;
}) {
  const { authedUserId, projectId, latestUserText, useVectorSearch = false, useCache = true } = params;

  const cacheKey = `${authedUserId}:${projectId || "none"}`;
  const now = Date.now();
  if (useCache && memoryCache.has(cacheKey) && (cacheExpiry.get(cacheKey) || 0) > now) {
    return memoryCache.get(cacheKey);
  }

  const admin = supabaseAdmin();
  let items: any[] = [];

  if (useVectorSearch && latestUserText?.length > 10) {
    const embedding = await openAIEmbed(latestUserText);
   const { data, error }: { data: any[] | null; error: any } = await safeQuery(async (c) => {
    const { data, error } = await c.rpc("match_memories", {
      query_embedding: embedding,
      match_threshold: 0.75,
      match_count: 30,
      p_project_id: projectId,
    });
    return { data, error };
  }, "matchMemories");

    if (error) throw error;
    items = data ?? [];
  } else {
    const q = admin
      .from("memory_items")
      .select(
        "id, user_id, project_id, mem_key, mem_value, display_text, reveal_policy, strength, is_locked, pinned, discarded_at, confirmed_at, last_reinforced_at"
      )
      .eq("user_id", authedUserId)
      .is("discarded_at", null)
      .order("pinned", { ascending: false })
      .order("strength", { ascending: false })
      .order("last_reinforced_at", { ascending: false })
      .limit(50);

    const { data, error } = projectId ? await q.eq("project_id", projectId) : await q;
    if (error) throw error;
    items = data ?? [];
  }

  const parsed = items.map((r: any) => ({
    key: r.mem_key,
    value: parseMaybeJson(r.mem_value),
    display_text: avoidingNull(r.display_text, r.mem_key, r.mem_value),
    reveal_policy: r.reveal_policy,
    pinned: r.pinned,
    strength: Number(r.strength ?? 1),
    locked: !!r.is_locked,
  }));

  const result = {
    core: parsed.filter((i) => i.pinned),
    normal: parsed.filter((i) => !i.pinned && i.reveal_policy === "normal"),
    sensitive: parsed.filter((i) => i.reveal_policy === "user_trigger_only"),
    keysUsed: [],
  };

  if (useCache) {
    memoryCache.set(cacheKey, result);
    cacheExpiry.set(cacheKey, now + CACHE_TTL);
  }

  return result;
}
