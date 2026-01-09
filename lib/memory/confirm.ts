import { z } from "zod";
import { openai } from "@/lib/providers/openai";

const ConfirmSchema = z.object({
  shouldAsk: z.boolean().default(false),
  question: z.string().default(""),
  pendingOps: z.array(z.any()).default([]),
});

export async function proposeConfirmation(input: {
  userText: string;
  droppedOps: any[];
}) {
  if (!input.droppedOps?.length) {
    return { shouldAsk: false, question: "", pendingOps: [] };
  }

  const system = `
Decide whether to ask ONE confirmation question for a high-value memory.
Ask only if it is people/pets/core preference/anchor.
Choose the single most important item.
Return JSON only: { "shouldAsk": boolean, "question": string, "pendingOps": any[] }.
`.trim();

  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-5";

  const user = `
User text:
${input.userText}

Dropped ops (candidate memory ops to confirm):
${JSON.stringify(input.droppedOps).slice(0, 8000)}

Return JSON only.
`.trim();

  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const txt = resp.choices[0]?.message?.content ?? "{}";

  let obj: any = {};
  try {
    obj = JSON.parse(txt);
  } catch {
    obj = {};
  }

  const parsed = ConfirmSchema.safeParse(obj);
  if (!parsed.success) {
    return { shouldAsk: false, question: "", pendingOps: [] };
  }

  return parsed.data;
}
