import type { SupabaseClient } from "@supabase/supabase-js";

export type Ctx = {
  supabase: SupabaseClient;        // bearer client (user-scoped)
  admin?: SupabaseClient;          // service role (optional, explicit)
  userId: string;
};
