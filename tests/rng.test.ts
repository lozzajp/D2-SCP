import { describe, expect, it } from "vitest";
import { jump, rngFromBigInt, stateToBigInt } from "../src/rng/lcg";
import { MULTIPLIER, Rng } from "../src/rng/rng";
import { randomInt, seededRandom } from "./helpers";

function nextWithBigInt(lo: number, hi: number): [number, number] {
  const product = BigInt(lo) * BigInt(MULTIPLIER) + BigInt(hi);
  return [Number(product & 0xffffffffn), Number(product >> 32n)];
}

describe("Rng", () => {
  it("matches a BigInt implementation of the MWC step", () => {
    const random = seededRandom(1);
    const states: [number, number][] = [
      [0, 0],
      [0xffffffff, MULTIPLIER - 1],
      [0xffffffff, 0],
      [0, MULTIPLIER - 1],
    ];
    for (let i = 0; i < 10000; i++) states.push([random(), random() % MULTIPLIER]);

    for (const [lo, hi] of states) {
      const rng = new Rng(lo, hi);
      const value = rng.next();
      const [expectedLo, expectedHi] = nextWithBigInt(lo, hi);
      expect([value, rng.lo, rng.hi]).toEqual([expectedLo, expectedLo, expectedHi]);
    }
  });

  it("is seeded as (seed, 666)", () => {
    const rng = Rng.fromSeed(123);
    expect([rng.lo, rng.hi]).toEqual([123, 666]);
  });

  it("reproduces the store seed of the D2LK Ber game", () => {
    expect(Rng.fromSeed(638589163).skip(4).lo).toBe(3945434417);
  });
});

describe("lcg view", () => {
  it("round-trips states through BigInt", () => {
    const rng = new Rng(0xdeadbeef, 12345);
    expect(rngFromBigInt(stateToBigInt(rng))).toEqual(rng);
  });

  it("jumps ahead exactly like stepping", () => {
    const random = seededRandom(2);
    for (let i = 0; i < 200; i++) {
      const rng = Rng.fromSeed(random());
      const steps = randomInt(random, 0, 60);
      expect(jump(rng, steps)).toEqual(rng.clone().skip(steps));
    }
  });

  it("jumps back to where it started", () => {
    const random = seededRandom(3);
    for (let i = 0; i < 200; i++) {
      const rng = Rng.fromSeed(random()).skip(randomInt(random, 0, 20));
      const steps = randomInt(random, 1, 1000);
      expect(jump(jump(rng, steps), -steps)).toEqual(rng);
    }
  });
});
