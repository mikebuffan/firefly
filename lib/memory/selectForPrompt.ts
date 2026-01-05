export type RevealPolicy = "always" | "user_trigger_only" | "never";

export type MemoryItemForPrompt = {
  discarded: boolean;
  pinned: boolean;
  locked: boolean;
  reveal_policy: RevealPolicy;
  trigger_terms: string[];
  text: string;
  category: string;
  status: string;
  last_mentioned_at: string;
};

function norm(s: string) {
  return (s || "").toLowerCase();
}

// Very simple trigger matching: keyword containment.
// Later you can replace with embeddings, but keep this deterministic for v1.
export function messageTriggersItem(item: MemoryItemForPrompt, userText: string): boolean {
  const u = norm(userText);
  for (const t of item.trigger_terms || []) {
    const tt = norm(t);
    if (tt && u.includes(tt)) return true;
  }
  // Fallback: if user explicitly references the memory phrase (lightly)
  const key = norm(item.text).slice(0, 32);
  return key.length >= 10 && u.includes(key);
}

export function selectItemsForPrompt(items: MemoryItemForPrompt[], userText: string) {
  return items.filter((i) => {
    if (i.discarded) return false;
    if (i.reveal_policy === "never") return false;
    if (i.reveal_policy === "always") return true;
    // user_trigger_only
    return messageTriggersItem(i, userText);
  });
}
