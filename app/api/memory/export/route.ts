import { NextRequest, NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MemoryService } from "@/lib/memory/memoryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? undefined;
  const conversationId = url.searchParams.get("conversationId") ?? undefined;
  const projectId = url.searchParams.get("projectId") ?? null;

  const admin = supabaseAdmin();

  const svc = new MemoryService({
    supabase,
    admin,
    userId: data.user.id,
    projectId,
  });

  const includeDiscarded = url.searchParams.get("includeDiscarded") === "true";
  const items = await svc.listItems({ includeDiscarded });

  const md =
    `# Arbor / Firefly Memory Export\nGenerated: ${new Date().toISOString()}\n\n` +
    items.map((i: any) => `- (${i.category}/${i.status}) ${i.text}`).join("\n");

  return new NextResponse(md, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
