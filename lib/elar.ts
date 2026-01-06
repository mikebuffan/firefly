type ElarInput = {
  emotion?: string | null;
  intensity?: number | null; // 0-10
  userPreference?: "softer" | "firmer" | "neutral";
};

export function elar(input: ElarInput) {
  const emotion = (input.emotion ?? "").toLowerCase();
  const intensity = Math.max(0, Math.min(10, input.intensity ?? 0));
  const pref = input.userPreference ?? "neutral";

  const tone =
    pref === "firmer"
      ? "firm"
      : pref === "softer"
      ? "soft"
      : intensity >= 7
      ? "soft"
      : "neutral";

  // Keep it compact and human; no therapy voice.
  const label =
    emotion && emotion !== "unknown" ? `It sounds like ${emotion}. ` : "";
  const acknowledge =
    tone === "firm"
      ? "I’m with you. Let’s move. "
      : tone === "soft"
      ? "I’m here. We can take this one step at a time. "
      : "Okay. ";

  const redirect =
    intensity >= 8
      ? "Pick one tiny action you can do in 2 minutes. Then we’ll do the next one."
      : "Tell me the single most important thing to handle first.";

  return `${label}${acknowledge}${redirect}`;
}
