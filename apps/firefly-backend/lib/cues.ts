export type CueSignals = {
  comingUpScore: number;
  goingDownScore: number;
  signals: string[];
};

const COMING_UP_MARKERS = ["lol", "lmao", "🤣", "😄", "paint", "fun", "rave", "story", "remember when"];
const GOING_DOWN_MARKERS = ["done", "can't", "nothing matters", "falling apart", "hate", "i'm miserable", "i don't care"];

export function analyzeCues(userText: string): CueSignals {
  const t = userText.toLowerCase();
  const signals: string[] = [];
  let coming = 0;
  let going = 0;

  const humorHits = COMING_UP_MARKERS.filter(m => t.includes(m)).length;
  if (humorHits) { coming += 20 + humorHits * 8; signals.push("humor/story markers"); }

  const downHits = GOING_DOWN_MARKERS.filter(m => t.includes(m)).length;
  if (downHits) { going += 25 + downHits * 10; signals.push("spiral markers"); }

  const exclam = (userText.match(/!/g) || []).length;
  if (exclam >= 3) { going += 10; signals.push("high exclamation"); }

  if (userText.trim().length < 12) { going += 8; signals.push("very short response"); }
  if (userText.trim().length > 160) { coming += 8; signals.push("long form engagement"); }

  coming = Math.max(0, Math.min(100, coming));
  going = Math.max(0, Math.min(100, going));
  return { comingUpScore: coming, goingDownScore: going, signals };
}
