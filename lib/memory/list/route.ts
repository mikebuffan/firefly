import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const authedUserId = await requireUserId();

  const { data, error } = await supabaseAdmin
    .from("memory_kv_items")
    .select("key,value,tier,user_trigger_only,importance,confidence,locked,correction_count,last_seen_at,mention_count")
    .eq("user_id", authedUserId)
    .order("importance", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}
