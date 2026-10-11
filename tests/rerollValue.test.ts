import { beforeAll, describe, expect, it } from "vitest";
import patternsData from "../src/data/lk_hell_p7.bin?inline";
import { ChestPatterns } from "../src/chest/patterns";
import { rerollSeconds, runeChances } from "../src/chest/rerollValue";

let patterns: ChestPatterns;
beforeAll(async () => {
  patterns = new ChestPatterns(new Uint8Array(await (await fetch(patternsData)).arrayBuffer()));
});

describe("runeChances", () => {
  it("counts chests dropping each rune or better", () => {
    const chances = runeChances(patterns);
    const count = (rune: "Vex" | "Ohm" | "Lo" | "Sur" | "Ber") => Math.round(chances.get(rune)! * patterns.seedCount);
    expect([count("Ber"), count("Sur"), count("Lo"), count("Ohm"), count("Vex")]).toEqual([2, 11, 13, 18, 24]);
    expect(chances.get("El")).toBeGreaterThan(chances.get("Vex")!);
  });
});

describe("rerollSeconds", () => {
  const chance = (atLeast: number) => atLeast / 65534;

  it("matches the worked averages at 1.7 draws a second and a minute per reroll", () => {
    expect(rerollSeconds(chance(24), 1.7, "Vex") / 60).toBeCloseTo(7.7, 1);
    expect(rerollSeconds(chance(11), 1.7, "Sur") / 60).toBeCloseTo(11.2, 1);
  });

  it("is limited by the longest wait the planner offers", () => {
    const ber = rerollSeconds(chance(2), 1.7, "Ber") / 60;
    expect(ber).toBeGreaterThan(25);
    expect(ber).toBeLessThan(27);
    expect(rerollSeconds(0, 1.7, "Ber")).toBe(Infinity);
  });
});
