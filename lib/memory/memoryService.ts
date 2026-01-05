import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoryItemRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  mem_key: string;
  mem_value: string;
  display_text: string;
  trigger_terms: string[];
  emotional_weight: "light" | "neutral" | "heavy";
  relational_context: string[];
  reveal_policy: "normal" | "user_trigger_only" | "never";
  strength: number;
  correction_count: number;
  is_locked: boolean;
  repair_flag: boolean;
  updated_at: string;
  last_reinforced_at: string | null;
  pinned: boolean;
  discarded_at: string | null;
  confirmed_at: string | null;
};

export type MemoryDeps = {
  supabase: SupabaseClient;  // bearer (RLS reads)
  admin: SupabaseClient;     // service role writes when needed
  userId: string;            // authed user
  projectId: string | null;  // scope
};

export class MemoryService {
  constructor(private ctx: {
    supabase: any;
    admin: any;
    userId: string;
    projectId: string | null;
  }) {}

  private baseQuery() {
    return this.ctx.admin
      .from("memory_items")
      .select("*")
      .eq("user_id", this.ctx.userId)
      .eq("project_id", this.ctx.projectId);
  }

  async listItems(opts?: { includeDiscarded?: boolean }) {
    let q = this.baseQuery().order("pinned", { ascending: false }).order("updated_at", { ascending: false });

    if (!opts?.includeDiscarded) {
      q = q.is("discarded_at", null);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MemoryItemRow[];
  }

  async upsertItem(input: {
    mem_key: string;
    mem_value: string;
    display_text: string;
    trigger_terms?: string[];
    emotional_weight?: "light" | "neutral" | "heavy";
    relational_context?: string[];
    reveal_policy?: "normal" | "user_trigger_only" | "never";
    pinned?: boolean;
    is_locked?: boolean;
  }) {
    const now = new Date().toISOString();

    const payload = {
      user_id: this.ctx.userId,
      project_id: this.ctx.projectId,
      mem_key: input.mem_key,
      mem_value: input.mem_value,
      display_text: input.display_text,
      trigger_terms: input.trigger_terms ?? [],
      emotional_weight: input.emotional_weight ?? "neutral",
      relational_context: input.relational_context ?? [],
      reveal_policy: input.reveal_policy ?? "normal",
      pinned: input.pinned ?? false,
      is_locked: input.is_locked ?? false,
      updated_at: now,
      last_reinforced_at: now,
    };

    const { data, error } = await this.ctx.admin
      .from("memory_items")
      .upsert(payload, { onConflict: "user_id,project_id,mem_key" })
      .select("*")
      .single();

    if (error) throw error;
    return data as MemoryItemRow;
  }

  async applyOps(ops: any[]): Promise<string[]> {
    const appliedIds: string[] = [];

    for (const o of ops ?? []) {
      const op = String(o?.op ?? "").toUpperCase();

      const mem_key = o.mem_key ?? o.key ?? o.memKey;
      const mem_value = o.mem_value ?? o.value ?? o.memValue;
      const display_text = o.display_text ?? o.displayText ?? o.display ?? `${mem_key}: ${mem_value}`;

      const id = o.id ?? o.memory_id ?? o.memoryId;

      if (op === "CORRECT") {
        const now = new Date().toISOString();

        if (id) {
          const { data, error } = await this.ctx.admin
            .from("memory_items")
            .update({
              mem_key,
              mem_value,
              display_text,
              trigger_terms: o.trigger_terms ?? o.triggerTerms ?? [],
              emotional_weight: o.emotional_weight ?? o.emotionalWeight ?? "neutral",
              relational_context: o.relational_context ?? o.relationalContext ?? [],
              reveal_policy: o.reveal_policy ?? o.revealPolicy ?? "normal",
              pinned: o.pinned ?? false,
              repair_flag: o.repair_flag ?? o.repairFlag ?? false,
              correction_count: (o.correction_count ?? o.correctionCount) ?? undefined,
              updated_at: now,
              last_reinforced_at: now,
            })
            .eq("id", id)
            .eq("user_id", this.ctx.userId)
            .eq("project_id", this.ctx.projectId)
            .select("id")
            .single();

          if (error) throw error;
          if (data?.id) appliedIds.push(data.id);
          continue;
        }

        const row = await this.upsertItem({
          mem_key,
          mem_value,
          display_text,
          trigger_terms: o.trigger_terms ?? o.triggerTerms ?? [],
          emotional_weight: o.emotional_weight ?? o.emotionalWeight ?? "neutral",
          relational_context: o.relational_context ?? o.relationalContext ?? [],
          reveal_policy: o.reveal_policy ?? o.revealPolicy ?? "normal",
          pinned: o.pinned ?? false,
          is_locked: o.is_locked ?? o.isLocked ?? false,
        });

        appliedIds.push(row.id);
        continue;
      }

      // Optional: support simple ops if they show up later
      if (op === "PIN" && id) {
        const row = await this.pin(id, Boolean(o.pinned ?? true));
        appliedIds.push(row.id);
        continue;
      }

      if (op === "DISCARD" && id) {
        const row = await this.discard(id);
        appliedIds.push(row.id);
        continue;
      }

      if (op === "CONFIRM" && id) {
        const row = await this.confirmFact(id);
        appliedIds.push(row.id);
        continue;
      }
    }
    return Array.from(new Set(appliedIds));
  }

  async pin(id: string, pinned: boolean) {
    const { data, error } = await this.ctx.admin
      .from("memory_items")
      .update({ pinned, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.ctx.userId)
      .eq("project_id", this.ctx.projectId)
      .select("*")
      .single();
    if (error) throw error;
    return data as MemoryItemRow;
  }

  async discard(id: string) {
    const { data, error } = await this.ctx.admin
      .from("memory_items")
      .update({ discarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.ctx.userId)
      .eq("project_id", this.ctx.projectId)
      .select("*")
      .single();
    if (error) throw error;
    return data as MemoryItemRow;
  }

  async confirmFact(id: string) {
    const { data, error } = await this.ctx.admin
      .from("memory_items")
      .update({ confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.ctx.userId)
      .eq("project_id", this.ctx.projectId)
      .select("*")
      .single();
    if (error) throw error;
    return data as MemoryItemRow;
  }
}
