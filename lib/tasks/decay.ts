import { supabaseAdmin } from "@/lib/supabase/admin";
import { logMemoryEvent } from "@/lib/memory/logger";
import { applyIncrementalDecay } from "@/lib/memory/decayHelpers";

export async function runMemoryDecay(userId: string) {
  const client = supabaseAdmin();

  const { data: memories, error } = await client
    .from("memory_items")
    .select("id, strength, last_reinforced_at")
    .eq("user_id", userId)
    .limit(500);

  if (error) throw error;
  if (!memories?.length) return;

  const decayOps = memories.map(m => ({
    id: m.id,
    next_strength: applyIncrementalDecay(Number(m.strength ?? 1)),
  }));

  for (const op of decayOps) {
    await client
      .from("memory_items")
      .update({
        strength: op.next_strength,
        updated_at: new Date().toISOString(),
      })
      .eq("id", op.id);
  }

  await logMemoryEvent("decay_cycle", { userId, decayed: decayOps.length });
}
