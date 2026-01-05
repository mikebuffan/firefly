import { openai } from "@/lib/providers/openai";

const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims

export async function embedText(text: string): Promise<number[]> {
  const cleaned = text.slice(0, 8000);
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: cleaned,
  });
  return res.data[0]!.embedding as number[];
}

export function memoryToEmbedString(key: string, value: any) {
  return `key:${key}\nvalue:${JSON.stringify(value)}`;
}
