import { z } from "zod";
import { openai } from "@/lib/providers/openai";
import { SENSITIVE_CATEGORIES } from "./rules";
import type { MemoryItem } from "./types";

const MemoryValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.record(z.string(), z.any()),
  z.array(z.any()),
  z.null(),
]);

const MemoryItemSchema = z.object({
  key: z.string().min(3),
  value: MemoryValueSchema,
  tier: z.enum(["core", "normal", "sensitive"]),
  user_trigger_only: z.boolean(),
  importance: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
});

const ExtractionSchema = z.object({
  items: z.array(MemoryItemSchema).max(20),
});

export async function extractMemoryFromText(params: {
  userText: string;
  assistantText?: string;
}): Promise<MemoryItem[]> {
  const { userText, assistantText } = params;

  const system = `
You extract stable, user-affirmed memory for a "friend-like" AI.
STRICT RULES:
- Do not invent.
- Do not infer demographics unless explicitly stated by the user.
- Prefer "friend basics": important people, pets, preferences, boundaries, ongoing projects, name/tone preferences, key life anchors.
- If it's sensitive (diagnoses, trauma, self-harm, medical, substance use, sex), store it but mark:
  tier="sensitive" and user_trigger_only=true.
- If uncertain, omit.
Key naming:
- people.<Name>
- preferences.<topic>
- boundaries.<topic>
- projects.<name>
- user.<field>
Return JSON only with shape: {"items":[...]}.
`.trim();

  const user = `
USER:
${userText}
ASSISTANT:
${assistantText ?? "(none)"}
Return JSON only.
`.trim();

  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-5";
  const resp = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";

  function normalizeValueToRecord(
    key: string,
    value: unknown
  ): Record<string, any> {
    // already an object (and not an array)
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, any>;
    }

    // normalize primitives/arrays/null into a standard shape
    return { value };
  }

  let parsed: z.infer<typeof ExtractionSchema>;
  try {
    parsed = ExtractionSchema.parse(JSON.parse(raw));
  } catch (e) {
    // TEMP DEBUG (keep until stable)
    console.warn("Memory extraction parse failed. raw=", raw);
    return [];
  }

  return parsed.items.map((it) => {
    const lk = it.key.toLowerCase();
    const isSensitive = SENSITIVE_CATEGORIES.some((c) => lk.includes(c));

    const normalized: MemoryItem = {
      ...it,
      value: normalizeValueToRecord(it.key, it.value),
      tier: isSensitive || it.tier === "sensitive" ? "sensitive" : it.tier,
      user_trigger_only: isSensitive || it.tier === "sensitive" ? true : it.user_trigger_only,
    };

    return normalized;
  });
}
