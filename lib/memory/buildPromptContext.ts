import type { MemoryItem } from "@/lib/memory/memoryService";
import { selectItemsForPrompt } from "@/lib/memory/selectForPrompt";

export function buildPromptContext(args: {
  allItems: MemoryItem[];
  userText: string;
  decayMs: number;
}) {
  const { allItems, userText, decayMs } = args;
  const now = Date.now();

  // 1) Apply decay (does NOT delete)
  const decayed = allItems.filter((i) => {
    if (i.discarded) return false;
    if (i.pinned || i.locked) return true;
    const t = new Date(i.last_mentioned_at).getTime();
    return now - t <= decayMs;
  });

  // 2) Apply reveal policy gating (user-trigger-only)
  const allowed = selectItemsForPrompt(decayed as any, userText);

  // 3) Group for model prompt
  const by = (cat: string) => allowed.filter((i) => i.category === cat);
  const context = {
    people: by("people").map((i) => i.text),
    issues: by("issues").map((i) => i.text),
    constraints: by("constraints").map((i) => i.text),
    hypotheses: by("hypotheses").map((i) => `(${i.status}) ${i.text}`),
    notes: by("notes").map((i) => i.text),
  };

  const hypothesisHeavy =
    context.hypotheses.length >= 3 && context.constraints.length === 0 && context.issues.length === 0;

  return {
    context,
    fallbackPrompt: hypothesisHeavy
      ? "I’m not sure which part matters most right now. Focus: people involved, the decision you’re making, or the idea itself?"
      : null,
  };
}
