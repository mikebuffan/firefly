import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  return _admin;
}
