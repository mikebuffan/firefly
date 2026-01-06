// lib/memory/friendBasicsSchema.ts
import { z } from "zod";

export const FriendBasicsSchema = z.object({
  facts: z.array(
    z.object({
      kind: z.enum(["person", "pet", "relationship", "life_anchor", "project"]),
      // instead of key:
      id: z.string().min(2),       // e.g. "Ember", "Mike", "FireflyApp"
      field: z.string().optional(),// e.g. "age"
      title: z.string(),
      content: z.string(),
      importance: z.number().min(3).max(10),
      confidence: z.number().min(0.5).max(1),
    })
  ),
});
export type FriendBasicsExtract = z.infer<typeof FriendBasicsSchema>;
