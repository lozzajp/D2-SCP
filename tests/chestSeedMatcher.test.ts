import { beforeAll, describe, expect, it } from "vitest";
import patternsData from "../src/data/lk_hell_p7.bin?inline";
import { chestDrop, findChestSeeds } from "../src/chest/chestSeedMatcher";
import { ChestPatterns, encodeChestPatterns, type SeedPattern } from "../src/chest/patterns";
import { CHEST_DROPS } from "../src/data/chestDrops";

let patterns: ChestPatterns;
beforeAll(async () => {
  patterns = new ChestPatterns(new Uint8Array(await (await fetch(patternsData)).arrayBuffer()));
});

describe("chest pattern file", () => {
  it("round-trips patterns", () => {
    const input: SeedPattern[] = [
      { unlockedCycles: 2, cycles: [["Gold", "Gold"], [], ["Ber Rune"]] },
      { unlockedCycles: 1, cycles: [["Arrows"]] },
    ];
    const decoded = new ChestPatterns(encodeChestPatterns(input));
    expect(decoded.seedCount).toBe(2);
    expect(decoded.pattern(1)).toEqual(input[0]);
    expect(decoded.pattern(2)).toEqual(input[1]);
  });

  it("covers every chest seed with known drop names", () => {
    expect(patterns.seedCount).toBe(65534);
    const known = new Set(CHEST_DROPS.map((drop) => drop.name));
    expect(patterns.names.filter((name) => !known.has(name))).toEqual([]);
    expect(patterns.names).toHaveLength(CHEST_DROPS.length);
  });

  it("holds the known Ber seed", () => {
    const { unlockedCycles, cycles } = patterns.pattern(4468);
    expect(cycles.slice(0, unlockedCycles)).toHaveLength(9);
    expect(cycles[0].slice(0, 3)).toEqual(["Ber Rune", "Scroll of Town Portal", "Gold"]);
  });
});

describe("findChestSeeds", () => {
  const lockedOnly = () => {
    for (let seed = 1; ; seed++) {
      const { unlockedCycles, cycles } = patterns.pattern(seed);
      if (cycles.length > unlockedCycles && cycles.at(-1)!.length > 0) return seed;
    }
  };

  it("finds an unlocked chest from its full drop in any order", () => {
    const drops = chestDrop(patterns, 4468, "unlocked").reverse();
    const result = findChestSeeds(patterns, drops);
    expect(result.tied).toBe(1);
    expect(result.matches[0]).toMatchObject({ seed: 4468, matched: drops.length, extra: 0, missing: [], notSeen: [] });
    expect(result.matches[0].lock).not.toBe("locked");
  });

  it("tells a locked chest apart from an unlocked one", () => {
    const seed = lockedOnly();
    expect(findChestSeeds(patterns, chestDrop(patterns, seed, "locked")).matches[0]).toMatchObject({ seed, lock: "locked", extra: 0 });
    expect(findChestSeeds(patterns, chestDrop(patterns, seed, "unlocked")).matches[0]).toMatchObject({ seed, lock: "unlocked", extra: 0 });
  });

  it("still ranks the right seed first with a missed pickup and a wrong entry", () => {
    const drops = chestDrop(patterns, 4468, "unlocked").slice(1);
    drops.push("Zod Rune");
    const best = findChestSeeds(patterns, drops).matches[0];
    expect(best).toMatchObject({ seed: 4468, matched: drops.length - 1, missing: ["Zod Rune"], notSeen: ["Ber Rune"] });
  });

  it("reports ties when too few items are entered", () => {
    expect(findChestSeeds(patterns, ["Gold"]).tied).toBeGreaterThan(1);
  });

  it("only lists seeds that drop at least one entered item", () => {
    const result = findChestSeeds(patterns, ["Ber Rune"]);
    expect(result.matches.map((match) => match.seed).sort((a, b) => a - b)).toEqual([4468, 47052]);
    expect(result.candidates).toHaveLength(2);
  });

  it("with exact match, drops seeds that drop more than was entered", () => {
    expect(findChestSeeds(patterns, ["Ber Rune"], true).matches).toEqual([]);

    const drops = chestDrop(patterns, 4468, "unlocked");
    const exact = findChestSeeds(patterns, drops, true);
    expect(exact.matches.map((match) => match.seed)).toEqual([4468]);
    expect(exact.candidates.map((score) => score.seed)).toEqual([4468]);
    expect(findChestSeeds(patterns, ["War Sword"], true).matches.every((match) => match.extra === 0)).toBe(true);
  });
});
