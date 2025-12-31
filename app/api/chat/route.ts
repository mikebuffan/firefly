import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { supabaseAdmin } from "../../../src/lib/supabaseServer";
import { PERSONAS } from "../../../src/lib/persona";
import { analyzeCues } from "../../../src/lib/cues";
import { buildNextMove } from "../../../src/lib/flow";
import { buildSystemPrompt } from "../../../src/lib/promptBuilder";


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BodySchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().uuid(),
  userText: z.string().min(1),
});

async function ensureConversation(userId: string, conversationId: string) {
  // Create the conversation row if it doesn't exist (prevents FK insert failures)
  await supabaseAdmin.from("conversations").upsert(
    { id: conversationId, user_id: userId },
    { onConflict: "id" }
  );
}

async function getUserProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function getMemory(userId: string) {
  const { data } = await supabaseAdmin
    .from("memory_items")
    .select("*")
    .eq("user_id", userId)
    .order("weight", { ascending: false })
    .limit(12);

  const memoryFacts = (data || []).map((d: any) => `${d.kind}:${d.key}=${d.value}`);
  const redirectHook = (data || []).find((d: any) => d.kind === "redirect")?.value;
  const addressAs = (data || []).find((d: any) => d.kind === "preference" && d.key === "address_as")?.value;

  return { memoryFacts, redirectHook, addressAs };
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, conversationId, userText } = parsed.data;

  await ensureConversation(userId, conversationId);

  await supabaseAdmin.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: userText,
  });

  const profile = await getUserProfile(userId);
  const persona = PERSONAS[(profile?.persona_variant || "arbor_masc") as keyof typeof PERSONAS];

  const cues = analyzeCues(userText);
  const memory = await getMemory(userId);

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

  // If OpenAI key is set, use LLM; otherwise return nextMove.prompt
  if (process.env.OPENAI_API_KEY) {
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const llm = await openai.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
        { role: "assistant", content: nextMove.prompt },
      ],
    });

    assistantText =
      llm.output_text?.trim() ||
      "I’m here. Say one sentence about what you want next.";
  }

  await supabaseAdmin.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: assistantText,
  });

  return NextResponse.json({
    cues,
    nextMoveType: nextMove.type,
    assistantText,
  });
}

export const dynamic = "force-dynamic";