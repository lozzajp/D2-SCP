import { describe, expect, it } from "vitest";
import type { ChestScore } from "../src/chest/chestSeedMatcher";
import { chestSeedStream, findChestDraws } from "../src/chest/chestStream";

const score = (seed: number, extra: number): ChestScore => ({ seed, lock: "either", matched: 3, extra });

describe("chestSeedStream", () => {
  it("rolls the D2LK Ber chest at draw 411", () => {
    const stream = chestSeedStream(638589163, "seedFlag");
    expect(stream).toHaveLength(1000);
    expect(stream.indexOf(4468) + 1).toBe(411);
  });

  it("only gives valid chest seeds", () => {
    for (const seed of chestSeedStream(123456789, "normal")) {
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(65534);
    }
  });
});

describe("findChestDraws", () => {
  const stream = Uint16Array.from([10, 20, 30, 20, 40]);

  it("ranks picked seeds, then closer matches, then earlier draws", () => {
    const hits = findChestDraws(stream, [score(20, 0), score(30, 2), score(40, 0)], [30]);
    expect(hits.map((hit) => [hit.draw, hit.seed])).toEqual([
      [3, 30],
      [2, 20],
      [4, 20],
      [5, 40],
    ]);
    expect(hits[0]).toMatchObject({ picked: true, score: { extra: 2 } });
  });

  it("finds nothing for seeds that never come up", () => {
    expect(findChestDraws(stream, [score(99, 0)], [98])).toEqual([]);
  });
});
