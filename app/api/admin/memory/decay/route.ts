// app/api/admin/memory/decay/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Require auth (and optionally require admin role later)
  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: items, error: selErr } = await admin
    .from("memory_items")
    .select("id,strength,last_reinforced_at,created_at")
    .limit(5000);

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });

  const now = Date.now();
  const halfLifeDays = 60;

  for (const it of items ?? []) {
    const last = new Date(it.last_reinforced_at ?? it.created_at ?? new Date()).getTime();
    const days = Math.max(0, (now - last) / (1000 * 60 * 60 * 24));
    const factor = Math.pow(0.5, days / halfLifeDays);
    const next = Math.max(0.1, Math.min(3.0, Number(it.strength ?? 1.0) * factor));

    const { error: updErr } = await admin
      .from("memory_items")
      .update({ strength: next })
      .eq("id", it.id);

    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, processed: (items ?? []).length });
}
