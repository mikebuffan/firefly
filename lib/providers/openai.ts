import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Unified OpenAI client with responses + chat + embedding support
 * Fully compatible with OpenAI SDK v4+
 */

export type ModelMessage = {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
};

// Singleton client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Ensures client exists and key is valid
 */
function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required");
  return new OpenAI({ apiKey: key });
}

/**
 * Legacy-compatible call using Responses API
 */
export async function generateWithOpenAI(messages: ModelMessage[]) {
  const model = process.env.OPENAI_MODEL ?? "gpt-5";
  const client = getClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.responses.create({
        model,
        input: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });

      return res.output_text?.trim() || "";
    } catch (err: any) {
      if (attempt === 2) throw err;
      if (err.status === 429 || err.status >= 500) {
        const delay = 250 * (attempt + 1);
        console.warn(`OpenAI retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error("OpenAI: exhausted retries");
}

/**
 * Modern chat endpoint (chat.completions)
 */
export async function openAIChat({
  model = process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
  messages,
  stream = false,
  maxRetries = 3,
}: {
  model?: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  maxRetries?: number;
}) {
  // Map to correct OpenAI SDK type
  const formatted: ChatCompletionMessageParam[] = messages.map(m => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: formatted,
        stream,
      });
      return res;
    } catch (err: any) {
      if (attempt === maxRetries - 1) throw err;
      if (err.status === 429) {
        const delay = 250 * (attempt + 1);
        console.warn(`Chat API rate-limited. Retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
}

/**
 * Embeddings (for memory vectorization)
 */
export async function openAIEmbed(text: string) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

/**
 * Optional: simple telemetry logger
 */
export function logOpenAIEvent(event: string, meta?: any) {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[OpenAI] ${event}`, meta || "");
  }
}
