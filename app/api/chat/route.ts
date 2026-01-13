import { NextResponse } from "next/server";
import { requireUser } from "@firefly/shared/lib/auth/requireUser";
import { openAIChat } from "@firefly/shared/lib/providers/openai";
import { buildPromptContext } from "@firefly/shared/lib/prompt/buildPromptContext";
import { extractMemoryFromText } from "@firefly/shared/lib/memory/extractor";
import { upsertMemoryItems, reinforceMemoryUse, updateMemoryStrength } from "@firefly/shared/lib/memory/store";
import { postcheckResponse } from "@firefly/shared/lib/safety/postcheck";
import { logMemoryEvent } from "@firefly/shared/lib/safety/postcheck";
import { ChatRequestSchema } from "@firefly/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant" | "system"; content: string };

async function getOrCreateDefaultProjectId(supabase: any, authedUserId: string): Promise<string> {
  const { data: existing, error: e1 } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", authedUserId)
    .eq("name", "Default Project")
    .maybeSingle();

  if (e1) throw e1;
  if (existing?.id) return existing.id as string;

  const { data: created, error: e2 } = await supabase
    .from("projects")
    .insert({
      user_id: authedUserId,
      name: "Default Project",
      persona_id: "arbor",
      framework_version: "v1",
    })
    .select("id")
    .single();

  if (e2) throw e2;
  return created.id as string;
}

async function getOrCreateConversation(params: {
  supabase: any;
  authedUserId: string;
  projectId: string;
  conversationId?: string;
}) {
  const { supabase, authedUserId, projectId, conversationId } = params;

  const isUuid = conversationId && /^[0-9a-fA-F-]{36}$/.test(conversationId);

  if (isUuid) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", authedUserId)
      .eq("project_id", projectId)
      .single();

    if (!error && data?.id) return data.id as string;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: authedUserId,
      project_id: projectId,
      title: null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function loadRecentMessages(
  supabase: any,
  authedUserId: string,
  conversationId: string,
  limit = 30
): Promise<Msg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role,content,created_at,deleted_at,expires_at")
    .eq("user_id", authedUserId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((m: any) => ({ role: m.role, content: m.content }));
}

async function cleanupExpiredMessagesBestEffort(supabase: any, authedUserId: string) {
  await supabase
    .from("messages")
    .delete()
    .eq("user_id", authedUserId)
    .lt("expires_at", new Date().toISOString())
    .not("expires_at", "is", null);
}

export async function POST(req: Request) {
  try {
    const { supabase, authedUserId } = await requireUser(req);

    const raw = await req.json().catch(() => ({}));
    const parsed = ChatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const { projectId: maybeProjectId, conversationId, userText } = parsed.data;

    await cleanupExpiredMessagesBestEffort(supabase, authedUserId);

    const projectId = maybeProjectId ?? (await getOrCreateDefaultProjectId(supabase, authedUserId));

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, persona_id, framework_version")
      .eq("id", projectId)
      .eq("user_id", authedUserId)
      .single();

    if (pErr) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    const convoId = await getOrCreateConversation({ supabase, authedUserId, projectId, conversationId });

    await supabase.from("messages").insert({
      project_id: projectId,
      conversation_id: convoId,
      user_id: authedUserId,
      role: "user",
      content: userText,
    });

    const systemPrompt = await buildPromptContext({
      authedUserId,
      projectId,
      conversationId: convoId,
      latestUserText: userText,
    });

    const history = await loadRecentMessages(supabase, authedUserId, convoId, 30);
    const messagesForModel: Msg[] = [{ role: "system", content: systemPrompt }, ...history];

    const aiResponse = await openAIChat({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5",
      messages: messagesForModel,
    });

    const assistantText = (aiResponse as any)?.choices?.[0]?.message?.content ?? "";

    const postcheck = await postcheckResponse({
      authedUserId,
      projectId,
      assistantText,
    });

    if (!postcheck.approved) {
      return NextResponse.json(
        { ok: true, assistantText: postcheck.replacement, flagged: true, projectId, conversationId: convoId },
        { status: 200 }
      );
    }

    await supabase.from("messages").insert({
      project_id: projectId,
      conversation_id: convoId,
      user_id: authedUserId,
      role: "assistant",
      content: assistantText,
    });

    const extracted = await extractMemoryFromText({ userText, assistantText });
    await upsertMemoryItems(authedUserId, extracted, projectId);
    await reinforceMemoryUse(authedUserId, [], projectId);
    await updateMemoryStrength(convoId, 0.2);

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", convoId)
      .eq("user_id", authedUserId);

    await logMemoryEvent("chat_completed", { authedUserId, projectId });

    return NextResponse.json({
      ok: true,
      projectId,
      conversationId: convoId,
      assistantText,
    });
  } catch (err: any) {
    console.error("chat route error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "server_error" }, { status: 500 });
  }
}
