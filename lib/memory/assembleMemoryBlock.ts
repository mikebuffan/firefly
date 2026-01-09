import type { MemoryItemRow } from "@/lib/memory/memoryService";
import { selectItemsForPrompt } from "@/lib/memory/selectForPrompt";

/**
 * Builds contextual memory blocks for use in system prompt.
 * Applies decay, reveal policy gating, and organizes by category.
 */
export function assembleMemoryBlock(args: {
  allItems: MemoryItemRow[];
  userText: string;
  decayMs: number;
}) {
  const { allItems, userText, decayMs } = args;
  const now = Date.now();

  // 1) Apply temporal decay
  const decayed = allItems.filter((i) => {
    if (i.discarded_at) return false;
    if (i.pinned || i.is_locked) return true;
    const t = new Date(i.last_reinforced_at ?? i.updated_at).getTime();
    return now - t <= decayMs;
  });

  // 2) Apply reveal policy gating
  const allowed = selectItemsForPrompt(decayed as any, userText);

  // 3) Group by category
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
