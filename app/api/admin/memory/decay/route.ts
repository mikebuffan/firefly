import { NextRequest, NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateDecayStrength } from "@/lib/memory/decayHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  for (const it of items ?? []) {
    const next = calculateDecayStrength(
      Number(it.strength ?? 1),
      it.last_reinforced_at ?? it.created_at
    );

    const { error: updErr } = await admin
      .from("memory_items")
      .update({ strength: next })
      .eq("id", it.id);

    if (updErr)
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, processed: (items ?? []).length });
}
