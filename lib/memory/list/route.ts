import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { userId: authedUserId } = await requireUser(req);

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("memory_items")
    .select("key,value,tier,user_trigger_only,importance,confidence,locked,correction_count,last_seen_at,mention_count")
    .eq("user_id", authedUserId)
    .order("importance", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}
