/**
 * Deterministic PRNG seeded from a string (e.g. a player id), so contract
 * generation is reproducible across seed runs instead of changing every
 * time the script is re-run against the same data.
 */
function hashStringToUint32(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 - small, fast, good-enough-for-simulation PRNG. */
export function createSeededRandom(seed: string): () => number {
  let state = hashStringToUint32(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a random number in [min, max). */
export function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
