import { z } from "zod";
import { openai } from "@/lib/providers/openai";
import { SENSITIVE_CATEGORIES } from "@/lib/memory/rules";
import type { MemoryItem } from "@/lib/memory/types";
import { logMemoryEvent } from "@/lib/memory/logger";

// Accept string/number/bool/object/null, then normalize to a record
const ValueSchema = z.union([
  z.record(z.string(), z.any()),
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const MemoryItemSchema = z.object({
  key: z.string().min(3),
  value: ValueSchema,
  tier: z.enum(["core", "normal", "sensitive"]).optional().default("normal"),
  user_trigger_only: z.boolean().optional().default(false),
  importance: z.number().int().min(1).max(10).optional().default(5),
  confidence: z.number().min(0).max(1).optional().default(0.85),
});

const ExtractionSchema = z.object({
  items: z.array(MemoryItemSchema).max(20).default([]),
});

function normalizeValueToRecord(v: any): Record<string, any> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  // wrap primitives as { value: ... }
  return { value: v };
}

export async function extractMemoryFromText(params: {
  userText: string;
  assistantText?: string;
}): Promise<MemoryItem[]> {
  const { userText, assistantText } = params;

  if (/i\s+meant|correction|let\s+me\s+clarify/i.test(userText)) {
    await logMemoryEvent("correction_detected", { text: userText });
  }

  const system = `
You extract stable, user-affirmed memory for a "friend-like" AI.
STRICT RULES:
- Do not invent.
- Do not infer demographics unless explicitly stated by the user.
- Prefer "friend basics": important people, pets, preferences, boundaries, ongoing projects, name/tone preferences, key life anchors.
- If it's sensitive (diagnoses, trauma, self-harm, medical, substance use, sex), store it but mark:
  tier="sensitive" and user_trigger_only=true.
- If uncertain, omit.

Return JSON only with shape:
{
  "items": [
    {
      "key": "preferences.color",
      "value": { "value": "green" },
      "tier": "normal",
      "user_trigger_only": false,
      "importance": 6,
      "confidence": 0.9
    }
  ]
}
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
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";

  let parsed: z.infer<typeof ExtractionSchema>;
  try {
    parsed = ExtractionSchema.parse(JSON.parse(raw));
  } catch {
    console.warn("Memory extraction parse failed. raw=", raw);
    return [];
  }

  return parsed.items.map((it) => {
    const lk = it.key.toLowerCase();
    const isSensitive = SENSITIVE_CATEGORIES.some((c) => lk.includes(c));

    const normalized: MemoryItem = {
      ...it,
      value: normalizeValueToRecord(it.value),
    } as any;

    if (isSensitive || normalized.tier === "sensitive") {
      return { ...normalized, tier: "sensitive", user_trigger_only: true };
    }
    return normalized;
  });
}
