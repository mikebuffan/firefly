import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader";
import { createClient } from "@supabase/supabase-js";

const claimCache = new Map<string, { userId: string; exp: number }>();
const CACHE_TTL = 60_000; // 60s

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new Error("Missing Authorization header");
  const token = authHeader.replace("Bearer ", "");

  const cached = claimCache.get(token);
  if (cached && Date.now() < cached.exp) {
    return { userId: cached.userId, supabase: getSupabaseClient(token) };
  }

  const supabase = getSupabaseClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Invalid or expired token");

  claimCache.set(token, { userId: user.id, exp: Date.now() + CACHE_TTL });
  return { userId: user.id, supabase };
}

function getSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function requireUserId(req: Request): Promise<string> {
  const { userId } = await requireUser(req);
  return userId;
}
