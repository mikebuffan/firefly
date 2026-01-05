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

  // NEW columns we will add:
  pinned: boolean;
  discarded_at: string | null;
  confirmed_at: string | null;
};

export class MemoryService {
  constructor(
    private deps: {
      supabase: SupabaseClient; // bearer: auth + read (RLS)
      admin: SupabaseClient;   // service role: writes (bypass RLS if needed)
      userId: string;
      projectId: string | null;
    }
  ) {}

  private baseQuery() {
    return this.deps.admin
      .from("memory_items")
      .select("*")
      .eq("user_id", this.deps.userId)
      .eq("project_id", this.deps.projectId);
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
      user_id: this.deps.userId,
      project_id: this.deps.projectId,
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

    const { data, error } = await this.deps.admin
      .from("memory_items")
      .upsert(payload, { onConflict: "user_id,project_id,mem_key" })
      .select("*")
      .single();

    if (error) throw error;
    return data as MemoryItemRow;
  }

  async pin(id: string, pinned: boolean) {
    const { data, error } = await this.deps.admin
      .from("memory_items")
      .update({ pinned, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.deps.userId)
      .eq("project_id", this.deps.projectId)
      .select("*")
      .single();
    if (error) throw error;
    return data as MemoryItemRow;
  }

  async discard(id: string) {
    const { data, error } = await this.deps.admin
      .from("memory_items")
      .update({ discarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.deps.userId)
      .eq("project_id", this.deps.projectId)
      .select("*")
      .single();
    if (error) throw error;
    return data as MemoryItemRow;
  }

  async confirmFact(id: string) {
    const { data, error } = await this.deps.admin
      .from("memory_items")
      .update({ confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.deps.userId)
      .eq("project_id", this.deps.projectId)
      .select("*")
      .single();
    if (error) throw error;
    return data as MemoryItemRow;
  }
}
