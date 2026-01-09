import { NextResponse } from "next/server";
import { generateWithOpenAI } from "@/lib/providers/openai";

export async function GET() {
  const text = await generateWithOpenAI([
    { role: "system", content: "You are Arbor. Respond briefly." },
    { role: "user", content: "Say 'OpenAI OK' and nothing else." },
  ]);

  return NextResponse.json({ ok: true, text });
}
