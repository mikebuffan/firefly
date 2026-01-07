import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getMemoryContext(params: {
  authedUserId: string;
  projectId?: string | null;
  latestUserText: string;
}) {
  const { authedUserId, projectId } = params;
  const admin = supabaseAdmin();

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

  // If you want per-project memory, keep this:
  const { data, error } = projectId ? await q.eq("project_id", projectId) : await q;

  if (error) throw error;

  // Convert your schema -> the format buildPromptContext expects
  const items = (data ?? []).map((r: any) => ({
    key: r.mem_key,
    value: r.mem_value,           // still text; OK for now
    display_text: avoidingNull(r.display_text, r.mem_key, r.mem_value),
    reveal_policy: r.reveal_policy,
    pinned: r.pinned,
    strength: Number(r.strength ?? 1),
    locked: !!r.is_locked,
  }));

  return {
    core: items.filter((i) => i.pinned),
    normal: items.filter((i) => !i.pinned && i.reveal_policy === "normal"),
    sensitive: items.filter((i) => i.reveal_policy === "user_trigger_only"),
    keysUsed: [], // you can fill this later
  };
}

function avoidingNull(display: any, key: string, val: string) {
  return display ?? `${key}: ${val}`;
}
