import { createClient } from "@supabase/supabase-js";

const claimCache = new Map<string, { authedUserId: string; exp: number }>();
const CACHE_TTL = 60_000; // 60 s

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing or invalid Authorization header");
  const token = authHeader.replace("Bearer ", "");

  const cached = claimCache.get(token);
  if (cached && Date.now() < cached.exp) {
    return { authedUserId: cached.authedUserId, supabase: getSupabaseClient(token) };
  }

  const supabase = getSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Invalid or expired token");

  claimCache.set(token, { authedUserId: data.user.id, exp: Date.now() + CACHE_TTL });
  return { authedUserId: data.user.id, supabase };
}

function getSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function requireUserId(req: Request): Promise<string> {
  const { authedUserId } = await requireUser(req);
  return authedUserId;
}
