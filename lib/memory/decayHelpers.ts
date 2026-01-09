export function calculateDecayStrength(
  currentStrength: number,
  lastReinforcedAt: string | Date,
  halfLifeDays = 60
): number {
  const now = Date.now();
  const last = new Date(lastReinforcedAt).getTime();
  const days = Math.max(0, (now - last) / (1000 * 60 * 60 * 24));
  const factor = Math.pow(0.5, days / halfLifeDays);
  return Math.max(0.1, Math.min(3.0, currentStrength * factor));
}

export function applyIncrementalDecay(currentStrength: number): number {
  return Math.max(0.5, currentStrength * 0.98);
}
