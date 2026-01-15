import { NextRequest, NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MemoryService } from "@/lib/memory/memoryService";
import { toMemValue } from "@/lib/memory/value";

export async function GET(req: NextRequest) {
  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId"); // may be null
  const includeDiscarded = url.searchParams.get("includeDiscarded") === "true";

  const admin = supabaseAdmin();
  const svc = new MemoryService({
    supabase,
    admin,
    userId: data.user.id,
    projectId: projectId ?? null,
  });

  const items = await svc.listItems({ includeDiscarded });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  const admin = supabaseAdmin();
  const svc = new MemoryService({
    supabase,
    admin,
    userId: data.user.id,
    projectId: (body.projectId ?? null) as string | null,
  });

  const item = await svc.upsertItem({
    mem_key: String(body.mem_key ?? body.key ?? "").trim(),
    mem_value: toMemValue(body.mem_value ?? body.value ?? body.text ?? ""),
    display_text: String(body.display_text ?? body.displayText ?? body.mem_key ?? body.key ?? "Memory"),
    trigger_terms: body.trigger_terms ?? body.triggerTerms ?? [],
    emotional_weight: body.emotional_weight ?? body.emotionalWeight ?? "neutral",
    relational_context: body.relational_context ?? body.relationalContext ?? [],
    reveal_policy: body.reveal_policy ?? body.revealPolicy ?? "normal",
    pinned: !!body.pinned,
    is_locked: !!body.is_locked,
  });

  return NextResponse.json({ item });
}
