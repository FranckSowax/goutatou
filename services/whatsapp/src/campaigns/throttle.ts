export function nextSendDelayMs(minMs: number, maxMs: number, rng: () => number = Math.random): number {
  if (maxMs <= minMs) return minMs
  return Math.round(minMs + rng() * (maxMs - minMs))
}
