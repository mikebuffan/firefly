import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader";

export async function requireUser(req: Request): Promise<{
  userId: string;
  supabase: SupabaseClient;
}> {
  const supabase = supabaseFromAuthHeader(req);

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }

  return { supabase, userId: data.user.id };
}

export async function requireUserId(req: Request): Promise<string> {
  const { userId } = await requireUser(req);
  return userId;
}
