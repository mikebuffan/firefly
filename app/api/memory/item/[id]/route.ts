import { NextRequest, NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MemoryService } from "@/lib/memory/memoryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? body.projectId ?? null;

  const admin = supabaseAdmin();
  const svc = new MemoryService({
    supabase,
    admin,
    userId: data.user.id,
    projectId,
  });

  if (body.action === "pin") {
    const item = await svc.pin(id, !!body.pinned);
    return NextResponse.json({ item });
  }

  if (body.action === "discard") {
    const item = await svc.discard(id);
    return NextResponse.json({ item });
  }

  if (body.action === "confirmFact") {
    const item = await svc.confirmFact(id);
    return NextResponse.json({ item });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
