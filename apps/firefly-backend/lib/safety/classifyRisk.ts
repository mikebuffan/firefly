import { openAIChat } from "@/lib/providers/openai";

export type RiskLevel = "none" | "low" | "medium" | "high";

export async function classifyRisk(userInput: string): Promise<RiskLevel> {
  if (!userInput || userInput.length < 5) return "none";

  const res = await openAIChat({
    model: process.env.OPENAI_MODEL ?? "gpt-5",
    messages: [
      {
        role: "system",
        content:
          "You are a mental health safety classifier. Determine the level of emotional or behavioral risk in the user's statement. " +
          "Return one of: none, low, medium, high. Be cautious but not alarmist.",
      },
      { role: "user", content: userInput },
    ],
  });

  const content =
    (res as any)?.choices?.[0]?.message?.content?.trim()?.toLowerCase?.() || "none";

  if (["none", "low", "medium", "high"].includes(content)) return content as RiskLevel;
  return "none";
}
