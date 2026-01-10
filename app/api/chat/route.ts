import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { openAIChat } from "@/lib/providers/openai";
import { buildPromptContext } from "@/lib/prompt/buildPromptContext";
import { extractMemoryFromText } from "@/lib/memory/extractor";
import { upsertMemoryItems, reinforceMemoryUse, updateMemoryStrength } from "@/lib/memory/store";
import { postcheckResponse } from "@/lib/safety/postcheck";
import { logMemoryEvent } from "@/lib/memory/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const NullableUuid = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z.string().uuid().optional()
);

const Body = z.object({
  projectId: NullableUuid,
  conversationId: NullableUuid,
  userText: z.string().min(1),
});

async function getOrCreateDefaultProjectId(supabase: any, userId: string): Promise<string> {
  const { data: existing, error: e1 } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("name", "Default Project")
    .maybeSingle();

  if (e1) throw e1;
  if (existing?.id) return existing.id as string;

  const { data: created, error: e2 } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
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
  userId: string;
  projectId: string;
  conversationId?: string;
}) {
  const { supabase, userId, projectId, conversationId } = params;

  // ✅ Defensive check: only use valid UUIDs
  const isUuid = conversationId && /^[0-9a-fA-F-]{36}$/.test(conversationId);

  if (isUuid) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .single();

    if (!error && data?.id) return data.id as string;
  }

  // Otherwise create new
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
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
  userId: string,
  conversationId: string,
  limit = 30
): Promise<Msg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role,content,created_at,deleted_at,expires_at")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((m: any) => ({ role: m.role, content: m.content }));
}

async function cleanupExpiredMessagesBestEffort(supabase: any, userId: string) {
  await supabase
    .from("messages")
    .delete()
    .eq("user_id", userId)
    .lt("expires_at", new Date().toISOString())
    .not("expires_at", "is", null);
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const { projectId: maybeProjectId, conversationId, userText } = parsed.data;
    await cleanupExpiredMessagesBestEffort(supabase, userId);

    // 1) Resolve project
    const projectId = maybeProjectId ?? (await getOrCreateDefaultProjectId(supabase, userId));

    // 2) Ensure project exists
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, persona_id, framework_version")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    if (pErr) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    // 3) Get or create conversation safely
    const convoId = await getOrCreateConversation({ supabase, userId, projectId, conversationId });

    // 4) Save user message
    await supabase.from("messages").insert({
      project_id: projectId,
      conversation_id: convoId,
      user_id: userId,
      role: "user",
      content: userText,
    });

    // 5) Build system prompt
    const systemPrompt = await buildPromptContext({
      authedUserId: userId,
      projectId,
      conversationId: convoId,
      latestUserText: userText,
    });

    const history = await loadRecentMessages(supabase, userId, convoId, 30);
    const messagesForModel: Msg[] = [{ role: "system", content: systemPrompt }, ...history];

    // 6) Generate AI response
    const aiResponse = await openAIChat({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5",
      messages: messagesForModel,
    });
    const assistantText = (aiResponse as any)?.choices?.[0]?.message?.content ?? "";

    // 7) Safety filter
    const postcheck = await postcheckResponse({
      authedUserId: userId,
      projectId,
      assistantText,
    });
    if (!postcheck.approved) {
      return NextResponse.json(
        { ok: true, assistantText: postcheck.replacement, flagged: true },
        { status: 200 }
      );
    }

    // 8) Save assistant message
    await supabase.from("messages").insert({
      project_id: projectId,
      conversation_id: convoId,
      user_id: userId,
      role: "assistant",
      content: assistantText,
    });

    // 9) Memory extraction & reinforcement
    const extracted = await extractMemoryFromText({ userText, assistantText });
    await upsertMemoryItems(userId, extracted, projectId);
    await reinforceMemoryUse(userId, [], projectId);

    // ✅ Fix: use actual conversation UUID instead of string
    await updateMemoryStrength(convoId, 0.2);

    // 10) Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", convoId)
      .eq("user_id", userId);

    // 11) Log event
    await logMemoryEvent("chat_completed", { userId, projectId });

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
