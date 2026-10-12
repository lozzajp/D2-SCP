import { describe, expect, it } from "vitest";
import { sortTargets, type TableTarget } from "../src/chest/allPlans";

function target(rune: TableTarget["rune"], wait: number, extra: Partial<TableTarget> = {}): TableTarget {
  return { area: "lowerKurast", players: 7, rune, wait, draw: 400 + wait * 2, needsLock: false, ...extra } as TableTarget;
}

describe("sortTargets", () => {
  const targets = [
    target("Ist", 10),
    target("Ber", 30, { needsLock: true }),
    target("Ber", 40),
    target("Ist", 10, { players: 1, area: "riverOfFlame" }),
    target("Vex", 2),
  ];

  it("puts the shortest wait first, then the lower player count", () => {
    expect(sortTargets(targets, "soonest").map(({ rune, wait, players }) => `${rune}${wait}p${players}`)).toEqual([
      "Vex2p7",
      "Ist10p1",
      "Ist10p7",
      "Ber30p7",
      "Ber40p7",
    ]);
  });

  it("puts the best rune first, unlocked chests before locked ones", () => {
    expect(sortTargets(targets, "best").map(({ rune, wait, needsLock }) => `${rune}${wait}${needsLock ? "L" : ""}`)).toEqual([
      "Ber40",
      "Ber30L",
      "Vex2",
      "Ist10",
      "Ist10",
    ]);
  });
});
