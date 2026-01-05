import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryOp } from "@/lib/memory/extractSchema";

type Ctx = {
  admin: SupabaseClient;
  authedUserId: string;          // <-- canonical user identity for writes
  projectId: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export async function applyMemoryOps(ctx: Ctx, ops: MemoryOp[]) {
  const touched: string[] = [];

  for (const op of ops) {
    if (op.op === "NO_STORE") continue;

    if (op.op === "DISCARD") {
      const id = await discardKey(ctx, op.mem_key);
      if (id) touched.push(id);
      continue;
    }

    if (op.op === "UPSERT") {
      const id = await upsertKey(ctx, op);
      if (id) touched.push(id);
      continue;
    }

    if (op.op === "CORRECT") {
      const id = await correctKey(ctx, op);
      if (id) touched.push(id);
      continue;
    }
  }

  return Array.from(new Set(touched));
}

async function getExisting(ctx: Ctx, mem_key: string) {
  const { data } = await ctx.admin
    .from("memory_items")
    .select("*")
    .eq("user_id", ctx.authedUserId)
    .eq("project_id", ctx.projectId)
    .eq("mem_key", mem_key)
    .maybeSingle();

  return data ?? null;
}

async function upsertKey(ctx: Ctx, op: MemoryOp) {
  const now = new Date().toISOString();
  const existing = await getExisting(ctx, op.mem_key);

  // If locked, do not overwrite value unless it is a CORRECT op (handled elsewhere).
  if (existing?.is_locked) return (existing.id as string) ?? null;

  const nextStrength = clamp(Number(existing?.strength ?? 1.0) + 0.35, 0.1, 3.0);

  const payload = {
    user_id: ctx.authedUserId,
    project_id: ctx.projectId,
    mem_key: op.mem_key,
    mem_value: op.mem_value,
    display_text: op.display_text,
    trigger_terms: op.trigger_terms ?? existing?.trigger_terms ?? [],
    emotional_weight: op.emotional_weight ?? existing?.emotional_weight ?? "neutral",
    relational_context: op.relational_context ?? existing?.relational_context ?? [],
    reveal_policy: op.reveal_policy ?? existing?.reveal_policy ?? "normal",
    strength: nextStrength,
    last_reinforced_at: now,
    correction_count: existing?.correction_count ?? 0,
    is_locked: existing?.is_locked ?? false,
    repair_flag: existing?.repair_flag ?? false,
    updated_at: now,
  };

  const { data, error } = await ctx.admin
    .from("memory_items")
    .upsert(payload, { onConflict: "user_id,project_id,mem_key" })
    .select("id")
    .single();

  if (error) return null;
  return (data?.id as string) ?? null;
}

async function correctKey(ctx: Ctx, op: MemoryOp) {
  const now = new Date().toISOString();
  const existing = await getExisting(ctx, op.mem_key);

  const nextCount = Number(existing?.correction_count ?? 0) + 1;
  const lockNow = nextCount >= 2;
  const nextStrength = clamp(Number(existing?.strength ?? 1.0) + 0.6, 0.1, 3.0);

  const payload = {
    user_id: ctx.authedUserId,
    project_id: ctx.projectId,
    mem_key: op.mem_key,
    mem_value: op.mem_value,
    display_text: op.display_text,
    trigger_terms: op.trigger_terms ?? existing?.trigger_terms ?? [],
    emotional_weight: op.emotional_weight ?? existing?.emotional_weight ?? "neutral",
    relational_context: op.relational_context ?? existing?.relational_context ?? [],
    reveal_policy: op.reveal_policy ?? existing?.reveal_policy ?? "normal",
    strength: nextStrength,
    last_reinforced_at: now,
    correction_count: nextCount,
    is_locked: lockNow,
    repair_flag: true,
    updated_at: now,
  };

  const { data, error } = await ctx.admin
    .from("memory_items")
    .upsert(payload, { onConflict: "user_id,project_id,mem_key" })
    .select("id")
    .single();

  if (error) return null;
  return (data?.id as string) ?? null;
}

async function discardKey(ctx: Ctx, mem_key: string) {
  const existing = await getExisting(ctx, mem_key);
  if (!existing?.id) return null;

  await ctx.admin.from("memory_items").delete().eq("id", existing.id);
  return existing.id as string;
}
