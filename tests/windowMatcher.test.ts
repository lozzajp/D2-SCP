import { describe, expect, it } from "vitest";
import { itemIndex, ITEMS } from "../src/data/items";
import type { PoolOrder } from "../src/data/poolOrders";
import { gamblePool, type GamblePool } from "../src/gamble/pool";
import { generateWindow } from "../src/gamble/window";
import { Rng } from "../src/rng/rng";
import { validateObserved, WindowMatcher, type ObservedItem } from "../src/search/windowMatcher";
import { randomInt, seededRandom } from "./helpers";

function naiveMatches(seed: number, charLevel: number, pool: GamblePool, observed: ObservedItem[]): boolean {
  const window = generateWindow(Rng.fromSeed(seed), charLevel, pool);
  return observed.every((o) => window.some((item) => item.base === o.item && item.x === o.x && item.y === o.y));
}

function observe(seed: number, charLevel: number, pool: GamblePool, extra: number, random: () => number) {
  const window = generateWindow(Rng.fromSeed(seed), charLevel, pool).filter((item) => item.x >= 0);
  const topLeft = window.find((item) => item.x === 0 && item.y === 0);
  if (!topLeft) return null;
  const others = window.filter((item) => item !== topLeft);
  const observed: ObservedItem[] = [{ item: topLeft.base, x: 0, y: 0 }];
  while (observed.length < 1 + extra && others.length > 0) {
    const [item] = others.splice(random() % others.length, 1);
    observed.push({ item: item.base, x: item.x, y: item.y });
  }
  return observed;
}

function scanAll(matcher: WindowMatcher, start: number, end: number): number[] {
  const found: number[] = [];
  matcher.scan(start, end, (seed) => found.push(seed));
  return found;
}

const ORDERS: PoolOrder[] = ["msvc", "musl", "ps5", "gcc"];

describe("WindowMatcher", () => {
  it("agrees with the naive check on every seed of a range (weak observation, many matches)", () => {
    const random = seededRandom(21);
    for (let round = 0; round < 6; round++) {
      const pool = gamblePool(ORDERS[round % ORDERS.length], round % 2 === 1);
      const charLevel = randomInt(random, 1, 99);
      const start = random();
      const end = Math.min(2 ** 32, start + 3000);
      const observed = observe(start, charLevel, pool, 0, random);
      if (!observed) continue;

      const matcher = new WindowMatcher(charLevel, pool, observed);
      const expected: number[] = [];
      for (let seed = start; seed < end; seed++) if (naiveMatches(seed, charLevel, pool, observed)) expected.push(seed);

      expect(expected.length).toBeGreaterThan(1);
      expect(scanAll(matcher, start, end)).toEqual(expected);
      expect(expected.filter((seed) => matcher.matches(seed))).toEqual(expected);
    }
  });

  it("finds the right seed from a handful of items", () => {
    const random = seededRandom(22);
    let tested = 0;
    while (tested < 12) {
      const pool = gamblePool(ORDERS[tested % ORDERS.length], tested % 3 === 0);
      const charLevel = randomInt(random, 1, 99);
      const seed = random();
      const observed = observe(seed, charLevel, pool, 5, random);
      if (!observed) continue;
      tested++;

      const start = Math.max(0, seed - 20000);
      const end = Math.min(2 ** 32, seed + 20000);
      const found = scanAll(new WindowMatcher(charLevel, pool, observed), start, end);
      expect(found).toContain(seed);
      for (const other of found) expect(naiveMatches(other, charLevel, pool, observed)).toBe(true);
    }
  });

  it("scans right up to the last seed", () => {
    const pool = gamblePool("msvc", false);
    const last = 2 ** 32 - 1;
    const observed = observe(last, 60, pool, 2, seededRandom(23))!;
    const found = scanAll(new WindowMatcher(60, pool, observed), last - 5000, 2 ** 32);
    expect(found).toContain(last);
  });

  it("matches coronets that are upgraded circlets", () => {
    const pool = gamblePool("msvc", false);
    const coronet = itemIndex("ci1");
    let seed = 0;
    for (; ; seed++) {
      const window = generateWindow(Rng.fromSeed(seed), 90, pool);
      const topLeft = window.find((item) => item.x === 0 && item.y === 0);
      if (topLeft?.base === coronet && topLeft.upgraded !== coronet) break;
    }
    const observed = observe(seed, 90, pool, 4, seededRandom(24))!;
    expect(new WindowMatcher(90, pool, observed).matches(seed)).toBe(true);
  });
});

describe("validateObserved", () => {
  const helm = itemIndex("cap");
  const ring = itemIndex("rin");

  it("accepts a sensible window", () => {
    expect(() => validateObserved([{ item: helm, x: 0, y: 0 }, { item: ring, x: 9, y: 0 }])).not.toThrow();
  });

  it.each([
    ["no items", []],
    ["no top-left item", [{ item: helm, x: 2, y: 0 }]],
    ["a one-high top-left item", [{ item: ring, x: 0, y: 0 }]],
    ["an item outside the window", [{ item: helm, x: 0, y: 0 }, { item: helm, x: 9, y: 0 }]],
    ["two items in one cell", [{ item: helm, x: 0, y: 0 }, { item: ring, x: 0, y: 0 }]],
    ["an unknown item", [{ item: ITEMS.length, x: 0, y: 0 }]],
  ])("rejects %s", (_, observed) => {
    expect(() => validateObserved(observed as ObservedItem[])).toThrow();
  });
});
