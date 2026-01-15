import type { MemoryOp } from "@/lib/memory/extractSchema";
import { extractFriendBasics } from "@/lib/memory/friendBasics";

export function friendBasicsToOps(userText: string): MemoryOp[] {
  const basics = extractFriendBasics(userText);
  const ops: MemoryOp[] = [];

  for (const p of basics.people) {
    ops.push({
      op: "UPSERT",
      mem_key: `person.${p.name}`,
      mem_value: JSON.stringify(p),
      display_text: `${p.name} — ${p.relationship}`,
      trigger_terms: [p.name, p.relationship, p.role],
      confidence: 0.99,
      emotional_weight: "neutral",
      relational_context: [p.role === "child" ? "child" : p.role === "partner" ? "partner" : p.role === "parent" ? "parent" : "self"],
      reveal_policy: "normal",
    });
  }

  for (const pet of basics.pets) {
    ops.push({
      op: "UPSERT",
      mem_key: `pet.${pet.name}`,
      mem_value: JSON.stringify(pet),
      display_text: `${pet.name} — ${pet.species}`,
      trigger_terms: [pet.name, pet.species, pet.breed ?? ""].filter(Boolean),
      confidence: 0.99,
      emotional_weight: "neutral",
      relational_context: ["pet", "home"],
      reveal_policy: "normal",
    });
  }

  return ops.slice(0, 2);
}
