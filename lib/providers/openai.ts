import OpenAI from "openai";

export type ModelMessage = {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
};

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required");
  return new OpenAI({ apiKey: key });
}

export async function generateWithOpenAI(messages: ModelMessage[]) {
  const model = process.env.OPENAI_MODEL ?? "gpt-5";

  const client = getClient();
  const res = await client.responses.create({
    model,
    input: messages.map(m => ({ role: m.role, content: m.content })),
  });

  return res.output_text?.trim() || "";
}
