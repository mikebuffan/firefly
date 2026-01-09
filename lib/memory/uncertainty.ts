export function shouldAvoidClaims(memoryForPrompt: any[]) {
  return !memoryForPrompt || memoryForPrompt.length === 0;
}

export function uncertaintyInstruction(noMemory: boolean) {
  if (!noMemory) return "";
  return `
If you do not have retrieved memory about a claimed fact, do not pretend.
Ask a short clarifying question or speak generally.
Never state "as you said earlier" unless it is present in retrieved memory.
`.trim();
}
