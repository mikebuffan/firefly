import { z } from "zod";
import { openai } from "@/lib/providers/openai";
import { SENSITIVE_CATEGORIES } from "./rules";
import type { MemoryItem } from "./types";

// Minimal item: model might return only key/value
const MinimalItemSchema = z.object({
  key: z.string().min(3),
  value: z.any(),
});

// Full item (your ideal output)
const FullItemSchema = z.object({
  key: z.string().min(3),
  value: z.record(z.string(), z.any()),
  tier: z.enum(["core", "normal", "sensitive"]),
  user_trigger_only: z.boolean(),
  importance: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
});

// Accept either
const AnyItemSchema = z.union([FullItemSchema, MinimalItemSchema]);

const ExtractionSchema = z.object({
  items: z.array(AnyItemSchema).max(20),
});

function normalizeToRecord(val: any): Record<string, any> {
  // Your downstream code wants a record/object.
  // If the model returns a primitive (like "green"), wrap it.
  if (val && typeof val === "object" && !Array.isArray(val)) return val as Record<string, any>;
  return { value: val };
}

function defaultTierFor(key: string): "core" | "normal" | "sensitive" {
  const lk = key.toLowerCase();
  const isSensitive = SENSITIVE_CATEGORIES.some((c) => lk.includes(c));
  return isSensitive ? "sensitive" : "normal";
}

function defaultImportanceFor(tier: "core" | "normal" | "sensitive") {
  if (tier === "core") return 8;
  if (tier === "sensitive") return 7;
  return 6;
}

function defaultConfidenceFor(tier: "core" | "normal" | "sensitive") {
  if (tier === "core") return 0.95;
  if (tier === "sensitive") return 0.9;
  return 0.9;
}

export async function extractMemoryFromText(params: {
  userText: string;
  assistantText?: string;
}): Promise<MemoryItem[]> {
  const { userText, assistantText } = params;

  const system = `
You extract stable, user-affirmed memory for a "friend-like" AI.

Return STRICT JSON only in this shape:
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

RULES:
- Do not invent.
- Only store what the user explicitly stated or confirmed.
- Prefer "friend basics": important people, pets, preferences, boundaries, ongoing projects, name/tone preferences, key life anchors.
- Sensitive (diagnoses, trauma, self-harm, medical, substance use, sex): tier="sensitive" AND user_trigger_only=true.
- If uncertain, omit.
Key naming:
- people.<Name>
- preferences.<topic>
- boundaries.<topic>
- projects.<name>
- user.<field>
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
  } catch (e) {
    // TEMP DEBUG (keep until stable)
    console.warn("Memory extraction parse failed. raw=", raw);
    return [];
  }

  const normalized: MemoryItem[] = parsed.items.map((it: any) => {
    const key = String(it.key).trim();

    const tier: "core" | "normal" | "sensitive" =
      it.tier ? it.tier : defaultTierFor(key);

    const lk = key.toLowerCase();
    const isSensitive = SENSITIVE_CATEGORIES.some((c) => lk.includes(c));

    const user_trigger_only =
      typeof it.user_trigger_only === "boolean"
        ? it.user_trigger_only
        : tier === "sensitive" || isSensitive;

    const value = normalizeToRecord(it.value);

    const importance =
      typeof it.importance === "number" ? it.importance : defaultImportanceFor(tier);

    const confidence =
      typeof it.confidence === "number" ? it.confidence : defaultConfidenceFor(tier);

    // Force sensitive rule
    if (tier === "sensitive" || isSensitive) {
      return {
        key,
        value,
        tier: "sensitive",
        user_trigger_only: true,
        importance: Math.min(10, Math.max(1, importance)),
        confidence: Math.min(1, Math.max(0, confidence)),
      };
    }

    return {
      key,
      value,
      tier,
      user_trigger_only,
      importance: Math.min(10, Math.max(1, importance)),
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  });

  return normalized;
}
