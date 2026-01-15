import type { PersonaConfig } from "@/lib/persona";
import type { CueSignals } from "@/lib/cues";

export type Memory = {
  addressAs?: string;
  redirectHook?: string;
  humorHook?: string;
};

export function buildNextMove(args: {
  persona: PersonaConfig;
  cues: CueSignals;
  memory: Memory;
}) {
  const { persona, cues, memory } = args;
  const firmness = persona.firmnessLevel;
  const humor = persona.humorLevel;
  const address = memory.addressAs || persona.addressingDefault;

  if (cues.goingDownScore >= 35) {
    return {
      type: "name_storm" as const,
      prompt: [
        `${address}… okay. I’m here.`,
        `No fixing yet—just point at it.`,
        `What are the top **three** things crowding your head right now?`,
        `They can be short: “money / tired / kid stuff.”`
      ].join("\n")
    };
  }

  if (cues.comingUpScore >= 25) {
    const hook = memory.redirectHook;
    const playfulLine = humor >= 2
      ? `Quick detour—because I can hear you coming back up.`
      : `Quick detour.`;

    const q = hook
      ? `You said your escape is **${hook}**—what’s the first thing you do when you walk in?`
      : `If you could go anywhere for one hour tonight, where are you going?`;

    return {
      type: "redirect_then_return" as const,
      prompt: [
        `${playfulLine}`,
        q,
        "",
        `Then we’ll come back and check how your body feels.`
      ].join("\n")
    };
  }

  const firmLine = firmness >= 2 ? `Let’s keep this simple and real.` : `Let’s take it slow.`;
  return {
    type: "gentle_checkin" as const,
    prompt: [
      `${address}, I’m with you.`,
      firmLine,
      `What’s the one part of today that’s taking the most energy to carry?`
    ].join("\n")
  };
}
