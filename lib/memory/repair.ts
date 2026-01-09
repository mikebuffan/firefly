export function detectRepairSignal(userText: string) {
  const t = userText.toLowerCase();
  return [
    "no that's not",
    "that’s not what i meant",
    "that's not what i meant",
    "you misunderstood",
    "you got that wrong",
    "not like that",
    "i didn't say that",
    "i didnt say that",
  ].some((p) => t.includes(p));
}
