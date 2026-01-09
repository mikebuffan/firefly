import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().min(1),
  system: z.string().optional(),
  // optional overrides for quick testing:
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const { message, system, model } = parsed.data;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  const client = new OpenAI({ apiKey });

  try {
    // NOTE: This uses the Chat Completions API via the OpenAI SDK for simplicity.
    // If you already use Responses API elsewhere, we can swap to that next.
    const resp = await client.chat.completions.create({
      model: model ?? process.env.OPENAI_MODEL ?? "gpt-5",
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user", content: message },
      ],
    });

    const reply = resp.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({
      ok: true,
      model: resp.model,
      reply,
      usage: resp.usage ?? null,
      raw_id: resp.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "OpenAI error",
        // helpful for debugging:
        status: e?.status ?? null,
        code: e?.code ?? null,
        type: e?.type ?? null,
      },
      { status: 500 }
    );
  }
}