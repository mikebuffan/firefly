  import { z } from "zod";

  export const EmotionalWeight = z.enum(["light", "neutral", "heavy"]);
  export type EmotionalWeight = z.infer<typeof EmotionalWeight>;

  export const RevealPolicy = z.enum(["normal", "user_trigger_only", "never"]);
  export type RevealPolicy = z.infer<typeof RevealPolicy>;

  export const MemoryMode = z.enum(["recording", "respectful", "listening"]);
  export type MemoryMode = z.infer<typeof MemoryMode>;

  /**
   * IMPORTANT:
   * Keep "pet" to avoid breaking friend/pet ops (even if you later decide not to use it).
   */
  export const RelationalContext = z.enum([
    "self",
    "child",
    "partner",
    "parent",
    "work",
    "health",
    "legal",
    "home",
    "identity",
    "pet",
  ]);
  export type RelationalContext = z.infer<typeof RelationalContext>;

  // --- KV memory manager types (new) ---
  export type MemoryTier = "core" | "normal" | "sensitive";

  export type MemoryItem = {
    key: string;
    value: Record<string, any>;
    tier: MemoryTier;
    user_trigger_only: boolean;
    importance: number; // 1..10
    confidence: number; // 0..1

    // optional “kv memory manager” fields:
    folder_slug?: string | null;
    pinned?: boolean;
    locked?: boolean;
    evidence?: string;
  };

  export type MemoryUpsertResult = {
    created: string[];
    updated: string[];
    locked: string[];
    ignored: string[];
  };
