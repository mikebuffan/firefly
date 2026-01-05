import { z } from "zod";
import { MemoryMode } from "@/lib/memory/types";
import { openai } from "@/lib/providers/openai";

const TurnClassSchema = z.object({
  memory_mode: MemoryMode.default("recording"),
  should_extract: z.boolean().default(true),
  user_state: z.enum(["calm", "active", "overwhelmed", "venting", "crisis"]).default("active"),
  notes: z.string().default(""),
});

export type TurnClass = z.infer<typeof TurnClassSchema>;

export async function classifyTurn(userText: string): Promise<TurnClass> {
  const system = `
You classify the user's current conversational state and the appropriate memory behavior.
Output JSON only.
Rules:
- "recording": normal memory extraction.
- "respectful": user is venting/overwhelmed; extract less, avoid confirm questions unless explicit.
- "listening": user wants presence; do not extract unless they explicitly say "remember".
Set should_extract=false if listening.
`.trim();

  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-5";

  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
  });

  const txt = resp.choices[0]?.message?.content ?? "{}";

  let obj: any = {};
  try {
    obj = JSON.parse(txt);
  } catch {
    obj = {};
  }

  const parsed = TurnClassSchema.safeParse(obj);
  if (!parsed.success) {
    return { memory_mode: "recording", should_extract: true, user_state: "active", notes: "" };
  }
  return parsed.data;
}
