/** FNV-1a: a small, stable hash of a string. */
export function hash(text: string): number {
  let h = 2166136261;

  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

/**
 * Indexes 0..n-1 in a shuffled order that's always the same for the same seed,
 * so quiz options don't jump around when you come back to a question.
 */
export function shuffledIndexes(n: number, seed: string): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = hash(seed) || 1;

  for (let i = n - 1; i > 0; i--) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;

    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }

  return order;
}

/** Like shuffledIndexes, but never returns the original order (for "put these in order" questions). */
export function scrambledIndexes(n: number, seed: string): number[] {
  const order = shuffledIndexes(n, seed);
  return order.every((v, i) => v === i) ? [...order.slice(1), order[0]] : order;
}
