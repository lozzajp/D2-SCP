import { describe, expect, it } from "vitest";
import {
  gameSeedsFromStoreSeed,
  smallestMultipleInRange,
  solveLinearInRange,
  storeSeedFromGameSeed,
  STORE_SEED_DRAWS,
} from "../src/rng/gameSeed";
import { randomInt, seededRandom } from "./helpers";

describe("smallestMultipleInRange", () => {
  it("agrees with brute force for every small case", () => {
    for (let m = 1; m <= 24; m++) {
      for (let k = 0; k < m; k++) {
        for (let low = 0; low < m; low++) {
          for (let high = low; high < m; high++) {
            let expected: bigint | null = null;
            for (let x = 0; x < m; x++) {
              const value = (k * x) % m;
              if (value >= low && value <= high) {
                expected = BigInt(x);
                break;
              }
            }
            const actual = smallestMultipleInRange(BigInt(k), BigInt(m), BigInt(low), BigInt(high));
            if (actual !== expected) expect({ k, m, low, high, actual }).toEqual({ k, m, low, high, actual: expected });
          }
        }
      }
    }
  });
});

describe("solveLinearInRange", () => {
  it("agrees with brute force on random cases", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 3000; i++) {
      const m = randomInt(random, 1, 400);
      const k = randomInt(random, 0, m - 1);
      const c = randomInt(random, 0, m - 1);
      const low = randomInt(random, 0, m - 1);
      const high = randomInt(random, low, m - 1);
      const count = randomInt(random, 0, 3 * m);

      const expected: bigint[] = [];
      for (let x = 0; x < count; x++) {
        const value = (k * x + c) % m;
        if (value >= low && value <= high) expected.push(BigInt(x));
      }
      const actual = solveLinearInRange(BigInt(k), BigInt(c), BigInt(m), BigInt(low), BigInt(high), BigInt(count));
      expect(actual).toEqual(expected);
    }
  });
});

describe("game seed <-> store seed", () => {
  it("knows the D2LK Ber game", () => {
    expect(storeSeedFromGameSeed(638589163, STORE_SEED_DRAWS.seedFlag)).toBe(3945434417);
    expect(gameSeedsFromStoreSeed(3945434417, STORE_SEED_DRAWS.seedFlag)).toContain(638589163);
  });

  it("finds known game seeds for a store seed", () => {
    expect(gameSeedsFromStoreSeed(1161875147, 3)).toContain(2335768039);
    expect(gameSeedsFromStoreSeed(1161875147, 4)).toContain(2052438884);
  });

  it("recovers random game seeds for any number of draws", () => {
    const random = seededRandom(11);
    for (let i = 0; i < 1000; i++) {
      const gameSeed = random();
      const draws = randomInt(random, 1, 8);
      const seeds = gameSeedsFromStoreSeed(storeSeedFromGameSeed(gameSeed, draws), draws);
      expect(seeds).toContain(gameSeed);
    }
  });

  it("with zero draws the store seed is the game seed", () => {
    expect(gameSeedsFromStoreSeed(42, 0)).toEqual([42]);
    expect(gameSeedsFromStoreSeed(0xffffffff, 0)).toEqual([0xffffffff]);
  });

  it("only returns seeds that really produce the store seed", () => {
    const random = seededRandom(13);
    let total = 0;
    const samples = 2000;
    for (let i = 0; i < samples; i++) {
      const storeSeed = random();
      const seeds = gameSeedsFromStoreSeed(storeSeed, 4);
      for (const seed of seeds) expect(storeSeedFromGameSeed(seed, 4)).toBe(storeSeed);
      expect([...seeds].sort((a, b) => a - b)).toEqual(seeds);
      total += seeds.length;
    }
    expect(total / samples).toBeGreaterThan(0.9);
    expect(total / samples).toBeLessThan(1.1);
  });
});

describe("normal D2R games", () => {
  it("finds the game seed 4 draws behind a PS5 store seed", () => {
    expect(gameSeedsFromStoreSeed(832556779, STORE_SEED_DRAWS.normal)).toEqual([1617983173]);
  });
});
