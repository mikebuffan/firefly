import { z } from "zod";
import { EmotionalWeight, RelationalContext, RevealPolicy } from "@/lib/memory/types";

export const MemoryOpSchema = z.object({
  op: z.enum(["UPSERT", "CORRECT", "DISCARD", "NO_STORE"]),
  mem_key: z.string().min(3),
  mem_value: z.string().min(1),
  display_text: z.string().min(3),
  trigger_terms: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.75),

  emotional_weight: EmotionalWeight.default("neutral"),
  relational_context: z.array(RelationalContext).default([]),
  reveal_policy: RevealPolicy.default("normal"),

  previous_value: z.string().optional(),
});

export const ExtractResponseSchema = z.object({
  ops: z.array(MemoryOpSchema).max(3).default([]),
});

export type MemoryOp = z.infer<typeof MemoryOpSchema>;
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;
