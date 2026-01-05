import { NextRequest, NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabase/bearer";

// For now: stub. Later you can store/retrieve from DB table `user_settings`.
export async function GET(req: NextRequest) {
  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json({ enabled: true, ttl_hours: 24 });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const enabled = !!body.enabled;
  const ttl_hours = Number(body.ttl_hours ?? 24);

  // TODO: persist (DB). For now return accepted values.
  return NextResponse.json({ ok: true, enabled, ttl_hours });
}
