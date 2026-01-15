import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader";

export const runtime = "nodejs";

const BodySchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
});

async function requireUser(req: Request) {
  const supa = supabaseFromAuthHeader(req);
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return { supa, userId: data.user.id };
}

export async function POST(req: Request) {
  try {
    const { supa, userId } = await requireUser(req);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { projectId, conversationId } = parsed.data;

    // 1) Verify project belongs to user (RLS should already enforce, but we want explicit)
    const { data: project, error: pErr } = await supa
      .from("projects")
      .select("id, persona_id, framework_version")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    if (pErr) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 2) If a conversationId was provided, verify it belongs to user + project
    if (conversationId) {
      const { data: convo, error: cErr } = await supa
        .from("conversations")
        .select("id, project_id, user_id, created_at")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .eq("project_id", projectId)
        .single();

      if (cErr) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }

      return NextResponse.json({
        project,
        conversation: convo,
        created: false,
      });
    }

    // 3) Otherwise create a new conversation under this project
    const { data: created, error: insErr } = await supa
      .from("conversations")
      .insert({
        user_id: userId,
        project_id: projectId,
      })
      .select("id, project_id, user_id, created_at")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      project,
      conversation: created,
      created: true,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
