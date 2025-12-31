import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseServer";
import { PERSONAS } from "@/lib/persona";
import { analyzeCues } from "@/lib/cues";
import { buildNextMove } from "@/lib/flow";
import { buildSystemPrompt } from "@/lib/promptBuilder";
import { generateWithOpenAI } from "@/lib/providers/openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conversationId: z.string().uuid(),
  userText: z.string().min(1),
});

function supabaseFromAuthHeader(req: Request) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const authHeader = req.headers.get("authorization") || "";

  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

async function requireUserId(req: Request) {
  const supa = supabaseFromAuthHeader(req);
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user.id; // <-- this becomes your canonical userId
}

// This should create the conversation row if you have a conversations table.
// If you *don’t* have a conversations table, delete this function and its call.
async function ensureConversation(db: ReturnType<typeof supabaseAdmin>, authedUserId: string, conversationId: string) {
  const { error } = await db.from("conversations").upsert(
    { id: conversationId, user_id: authedUserId },
    { onConflict: "id" }
  );
  if (error) throw error;
}

async function getUserProfile(db: ReturnType<typeof supabaseAdmin>, authedUserId: string) {
  const { data, error } = await db
    .from("user_profile")
    .select("*")
    .eq("user_id", authedUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getMemory(db: ReturnType<typeof supabaseAdmin>, authedUserId: string) {
  const { data, error } = await db
    .from("memory_items")
    .select("*")
    .eq("user_id", authedUserId)
    .order("weight", { ascending: false })
    .limit(12);

  if (error) throw error;

  const memoryFacts = (data || []).map((d: any) => `${d.kind}:${d.key}=${d.value}`);
  const redirectHook = (data || []).find((d: any) => d.kind === "redirect")?.value;
  const addressAs = (data || []).find((d: any) => d.kind === "preference" && d.key === "address_as")?.value;

  return { memoryFacts, redirectHook, addressAs };
}

export async function POST(req: Request) {
  const authedUserId = await requireUserId(req);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { conversationId, userText } = parsed.data;
  const userId = authedUserId;

  const db = supabaseAdmin();

  const gate = await requireActiveSubscription(db, authedUserId);
  if (!gate.ok) return NextResponse.json({ error: "Subscription required" }, { status: 402 });

  async function requireActiveSubscription(
    db: ReturnType<typeof supabaseAdmin>,
    authedUserId: string
  ) {
    const { data, error } = await db
      .from("billing_subscriptions")
      .select("status, current_period_end")
      .eq("user_id", authedUserId)
      .maybeSingle();

    if (error) throw error;

    const active = data?.status === "active" || data?.status === "trialing";
    if (!active) return { ok: false as const, reason: data?.status ?? "none" };

    return { ok: true as const };
  }

  // 1) Ensure conversation exists (optional, only if you have conversations table)
  await ensureConversation(db, authedUserId, conversationId);

  // 2) Store USER message
  const { error: userInsertErr } = await db.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: userText,
  });
  if (userInsertErr) {
    return NextResponse.json({ error: userInsertErr.message }, { status: 500 });
  }

  // 3) Build response
  const profile = await getUserProfile(db, authedUserId);
  const persona = PERSONAS[(profile?.persona_variant || "arbor_masc") as keyof typeof PERSONAS];

  const cues = analyzeCues(userText);
  const memory = await getMemory(db, authedUserId);

  const systemPrompt = buildSystemPrompt(persona, memory.memoryFacts);
  const nextMove = buildNextMove({
    persona,
    cues,
    memory: {
      addressAs: memory.addressAs || persona.addressingDefault,
      redirectHook: memory.redirectHook,
    },
  });

  let assistantText = nextMove.prompt;

  // 4) If OpenAI enabled, generate the assistant reply
  if (process.env.OPENAI_API_KEY) {
    assistantText = await generateWithOpenAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
      // optional draft:
      { role: "assistant", content: nextMove.prompt },
    ]);

    if (!assistantText) assistantText = "I’m here. Say one sentence about what you want next.";
  }

  // 5) Store ASSISTANT message
  const { error: assistantInsertErr } = await db.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: assistantText,
  });
  if (assistantInsertErr) {
    return NextResponse.json({ error: assistantInsertErr.message }, { status: 500 });
  }

  await db.rpc("bump_usage_turn", { p_user_id: authedUserId  });

  // 6) Return response to client
  return NextResponse.json({
    cues,
    nextMoveType: nextMove.type,
    assistantText,
  });
}
