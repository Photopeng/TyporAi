export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const boundedAttempt = Math.max(0, Math.min(attempt, 8));
  const base = Math.min(10_000, 250 * 2 ** boundedAttempt);
  return Math.round(base * (0.8 + random() * 0.4));
}
