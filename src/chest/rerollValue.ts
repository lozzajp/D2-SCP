import type { ChestPatterns } from "./patterns";
import { MAX_BER_WAIT_SECONDS, MAX_WAIT_SECONDS, RUNES, chestRunes, type Rune } from "./runePlan";

export const REROLL_SECONDS = 60;

const chanceCache = new WeakMap<ChestPatterns, Map<Rune, number>>();

export function runeChances(patterns: ChestPatterns): Map<Rune, number> {
  const cached = chanceCache.get(patterns);
  if (cached) return cached;
  const counts = new Array<number>(RUNES.length).fill(0);
  for (let seed = 1; seed <= patterns.seedCount; seed++) {
    const { always, ifLocked } = chestRunes(patterns, seed);
    const best = Math.max(-1, ...[...always, ...ifLocked].map((rune) => RUNES.indexOf(rune)));
    if (best >= 0) counts[best]++;
  }
  const chances = new Map<Rune, number>();
  let atLeast = 0;
  for (let rank = RUNES.length - 1; rank >= 0; rank--) {
    atLeast += counts[rank];
    chances.set(RUNES[rank], atLeast / patterns.seedCount);
  }
  chanceCache.set(patterns, chances);
  return chances;
}

export function rerollSeconds(chance: number, fireRate: number, rune: Rune, rerollSeconds = REROLL_SECONDS): number {
  const perSecond = chance * fireRate;
  if (perSecond <= 0) return Infinity;
  const longest = rune === "Ber" ? MAX_BER_WAIT_SECONDS : MAX_WAIT_SECONDS;
  const expected = (limit: number) => {
    const miss = Math.exp(-perSecond * limit);
    const hit = 1 - miss;
    return rerollSeconds / hit + 1 / perSecond - (limit * miss) / hit;
  };
  let low = 1;
  let high = longest;
  for (let step = 0; step < 100; step++) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    if (expected(a) <= expected(b)) high = b;
    else low = a;
  }
  return expected((low + high) / 2);
}
