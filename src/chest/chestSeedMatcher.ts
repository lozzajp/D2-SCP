import type { ChestPatterns } from "./patterns";

export type LockState = "locked" | "unlocked" | "either";

export interface ChestScore {
  seed: number;
  lock: LockState;
  matched: number;
  extra: number;
}

export interface ChestMatch extends ChestScore {
  missing: string[];
  notSeen: string[];
}

export interface ChestSearch {
  entered: number;
  matches: ChestMatch[];
  tied: number;
  candidates: ChestScore[];
}

export function findChestSeeds(patterns: ChestPatterns, drops: readonly string[], exact = false, limit = 5): ChestSearch {
  const wanted = new Uint16Array(patterns.names.length);
  for (const name of drops) {
    const id = patterns.idOf(name);
    if (id !== undefined) wanted[id]++;
  }
  const used = new Uint16Array(patterns.names.length);
  const { itemIds, itemStart, unlockedEnd } = patterns;
  const scored: ChestScore[] = [];

  for (let s = 0; s < patterns.seedCount; s++) {
    const start = itemStart[s];
    const end = itemStart[s + 1];
    const openEnd = unlockedEnd[s];
    let matched = 0;
    let matchedOpen = 0;
    for (let i = start; i < end; i++) {
      if (i === openEnd) matchedOpen = matched;
      const id = itemIds[i];
      if (used[id] < wanted[id]) {
        used[id]++;
        matched++;
      }
    }
    if (openEnd === end) matchedOpen = matched;
    for (let i = start; i < end; i++) used[itemIds[i]] = 0;

    if (openEnd === end) scored.push({ seed: s + 1, lock: "either", matched, extra: end - start - matched });
    else if (matched > matchedOpen) scored.push({ seed: s + 1, lock: "locked", matched, extra: end - start - matched });
    else scored.push({ seed: s + 1, lock: "unlocked", matched: matchedOpen, extra: openEnd - start - matchedOpen });
  }

  const kept = exact ? scored.filter((score) => score.matched === drops.length && score.extra === 0) : scored;
  kept.sort((a, b) => b.matched - a.matched || a.extra - b.extra || a.seed - b.seed);
  const best = kept[0];
  let tied = 0;
  while (best && tied < kept.length && kept[tied].matched === best.matched && kept[tied].extra === best.extra) tied++;

  return {
    entered: drops.length,
    tied,
    candidates: best && best.matched > 0 ? kept.filter((score) => score.matched === best.matched) : [],
    matches: kept
      .slice(0, limit)
      .filter((score) => score.matched > 0)
      .map((score) => ({ ...score, ...differences(patterns, score.seed, score.lock, drops) })),
  };
}

export function chestDrop(patterns: ChestPatterns, seed: number, lock: LockState): string[] {
  const { unlockedCycles, cycles } = patterns.pattern(seed);
  return cycles.slice(0, lock === "unlocked" ? unlockedCycles : cycles.length).flat();
}

function differences(patterns: ChestPatterns, seed: number, lock: LockState, drops: readonly string[]) {
  const notSeen = chestDrop(patterns, seed, lock);
  const missing: string[] = [];
  for (const name of drops) {
    const index = notSeen.indexOf(name);
    if (index === -1) missing.push(name);
    else notSeen.splice(index, 1);
  }
  return { missing, notSeen };
}
