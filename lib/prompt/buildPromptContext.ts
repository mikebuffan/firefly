import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMemoryContext } from "@/lib/memory/retrieval";
import { assembleMemoryBlock } from "@/lib/memory/assembleMemoryBlock";
import { logMemoryEvent } from "@/lib/memory/logger";
import type { MemoryItem } from "@/lib/memory/types";

const promptCache = new Map<string, string>();
const PROMPT_CACHE_TTL = 1000 * 30; // 30 seconds
const cacheExpiry = new Map<string, number>();

type BuildPromptParams = {
  authedUserId: string;
  projectId?: string | null;
  conversationId?: string | null;
  latestUserText: string;
};

/**
 * Builds the complete OpenAI system prompt context.
 * Combines persona, framework rules, and scoped memories.
 */
export async function buildPromptContext({
  authedUserId,
  projectId = null,
  conversationId = null,
  latestUserText,
}: BuildPromptParams): Promise<string> {
  const cacheKey = `${authedUserId}:${projectId}:${conversationId}`;
  const now = Date.now();
  if (promptCache.has(cacheKey) && (cacheExpiry.get(cacheKey) ?? 0) > now) {
    return promptCache.get(cacheKey)!;
  }

  const admin = supabaseAdmin();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("persona, framework_version, description")
    .eq("user_id", authedUserId)
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) throw projectError;

  const persona = project?.persona ?? "Firefly Friend";
  const frameworkVersion = project?.framework_version ?? "v1.0";
  const philosophy = project?.description ?? "Empathetic, direct, grounded tone with Firefly philosophy.";

  // Pull user memory context
  const memContext = await getMemoryContext({
    authedUserId,
    projectId,
    latestUserText,
    useVectorSearch: true,
  });

  const allItems = [...memContext.core, ...memContext.normal, ...memContext.sensitive];
  const decayMs = 1000 * 60 * 60 * 24 * 30; // 30 days

  const { context, fallbackPrompt } = assembleMemoryBlock({
    allItems,
    userText: latestUserText,
    decayMs,
  });

  const memoryText = Object.entries(context)
    .filter(([, arr]) => arr.length)
    .map(([cat, arr]) => `${cat.toUpperCase()}:\n${arr.map((x) => `- ${x}`).join("\n")}`)
    .join("\n\n");

  const systemPrompt = `
You are ${persona}, an AI companion operating under the Firefly ${frameworkVersion} framework.

Behavioral philosophy:
${philosophy}

Relevant context:
${memoryText || "(none)"}

Engage with empathy, continuity, and directness. Do not fabricate, overextrapolate, or alter facts.
Maintain tone and memory alignment across sessions.

${fallbackPrompt ? "\n\n" + fallbackPrompt : ""}
`.trim();

  promptCache.set(cacheKey, systemPrompt);
  cacheExpiry.set(cacheKey, now + PROMPT_CACHE_TTL);

  await logMemoryEvent("prompt_built", { authedUserId, projectId, tokenLength: systemPrompt.length });
  return systemPrompt;
}
