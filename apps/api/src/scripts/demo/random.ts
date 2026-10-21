/**
 * Seeded PRNG (mulberry32) so the demo seed is reproducible: the same run
 * always yields the same catalog, customers and orders.
 */

interface Random {
  /** [0, 1) */
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (probability: number) => boolean;
  /** `count` distinct items, in random order. */
  sample: <T>(items: readonly T[], count: number) => T[];
}

const createRandom = (seed: number): Random => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;
  const sample = <T>(items: readonly T[], count: number): T[] => {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
    }
    return pool.slice(0, count);
  };
  return { next, int, pick, chance: (p) => next() < p, sample };
};

export type { Random };
export { createRandom };
