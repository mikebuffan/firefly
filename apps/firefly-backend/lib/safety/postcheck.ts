import { classifyRisk } from "@/lib/safety/classifyRisk";
import { logMemoryEvent } from "@/lib/memory/logger";

/**
 * Checks final assistant responses for safety and alignment before storage.
 */
export async function postcheckResponse({
  authedUserId,
  projectId,
  assistantText,
}: {
  authedUserId: string;
  projectId?: string | null;
  assistantText: string;
}) {
  const risk = await classifyRisk(assistantText);

  if (risk === "high") {
    await logMemoryEvent("safety_alert", { authedUserId, projectId, text: assistantText });
    return {
      approved: false,
      risk,
      replacement:
        "I'm sensing distress in this topic — would you like me to bring in a resource or grounding exercise?",
    };
  }

  if (risk === "medium") {
    await logMemoryEvent("safety_warning", { authedUserId, projectId, text: assistantText });
  }

  return { approved: true, risk };
}
