import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseFromAuthHeader(req: Request): SupabaseClient {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new Error("Missing Authorization header");
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Error("Invalid Authorization header (expected Bearer token)");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
}
