import { NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader"; // your existing helper

export async function POST(req: Request) {
  try {
    const supa = supabaseFromAuthHeader(req);
    const { data, error } = await supa.auth.getUser();
    if (error || !data?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const authedUserId = data.user.id;

    // wipe prefs + working + summaries
    const a = await supa.from("user_prefs").delete().eq("user_id", authedUserId);
    if (a.error) throw a.error;

    const b = await supa.from("user_working_context").delete().eq("user_id", authedUserId);
    if (b.error) throw b.error;

    const c = await supa.from("user_memory_summaries").delete().eq("user_id", authedUserId);
    if (c.error) throw c.error;

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("MEMORY_RESET_ERROR", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
    