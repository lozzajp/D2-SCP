import { beforeAll, describe, expect, it } from "vitest";
import patternsData from "../src/data/lk_hell_p7.bin?inline";
import rofP7Data from "../src/data/rof_hell_p7.bin?inline";
import { ChestPatterns } from "../src/chest/patterns";
import {
  CHEST_RUNES,
  MAX_BER_WAIT_SECONDS,
  MAX_REPEAT_DRAW,
  MAX_WAIT_SECONDS,
  allowsLongWait,
  chestRunes,
  isLongWait,
  planRunes,
  runesUpTo,
  type Rune,
  type RunePlanOptions,
  WAYPOINT_TOLERANCE,
} from "../src/chest/runePlan";
import { routeText, WaypointHops, type WaypointId } from "../src/chest/waypoints";

let patterns: ChestPatterns;
beforeAll(async () => {
  patterns = new ChestPatterns(new Uint8Array(await (await fetch(patternsData)).arrayBuffer()));
});

const berGame: RunePlanOptions = { gameSeed: 638589163, gameType: "seedFlag", distance: 400, fireRate: 2, minRune: "Ber" };

describe("chestRunes", () => {
  it("never finds a rune above Ber in Lower Kurast", () => {
    expect(CHEST_RUNES.at(-1)).toBe("Cham");
    expect(runesUpTo("Ber").at(-1)).toBe("Ber");
    const found = new Set<string>();
    for (let seed = 1; seed <= patterns.seedCount; seed++) {
      const runes = chestRunes(patterns, seed);
      for (const rune of [...runes.always, ...runes.ifLocked]) found.add(rune);
    }
    expect(found.has("Ber")).toBe(true);
    expect([...found].filter((rune) => !runesUpTo("Ber").includes(rune as Rune))).toEqual([]);
  });

  it("finds Jah and Cham in River of Flame, nothing above", async () => {
    const rof = new ChestPatterns(new Uint8Array(await (await fetch(rofP7Data)).arrayBuffer()));
    const found = new Set<string>();
    for (let seed = 1; seed <= rof.seedCount; seed++) {
      const runes = chestRunes(rof, seed);
      for (const rune of [...runes.always, ...runes.ifLocked]) found.add(rune);
    }
    expect(found.has("Jah")).toBe(true);
    expect(found.has("Cham")).toBe(true);
    expect([...found].filter((rune) => !CHEST_RUNES.includes(rune as Rune))).toEqual([]);
    expect(allowsLongWait("Cham")).toBe(true);
    expect(allowsLongWait("Lo")).toBe(false);
  });

  it("finds the Ber in chest seed 4468", () => {
    const runes = chestRunes(patterns, 4468);
    expect([...runes.always, ...runes.ifLocked]).toContain("Ber");
  });
});

describe("planRunes", () => {
  it("lists the Ber chest at draw 411 with the wait to reach it", () => {
    const { targets } = planRunes(patterns, berGame);
    const ber = targets.find((target) => target.draw === 411);
    expect(ber).toMatchObject({ seed: 4468, rune: "Ber", wait: 5.5 });
  });

  it("only lists chests within the longest wait, soonest first, at the minimum rune or better", () => {
    const { targets } = planRunes(patterns, { ...berGame, fireRate: 1, minRune: "Pul" });
    expect(targets.map((target) => [target.draw, target.rune])).toEqual([
      [411, "Ber"],
      [605, "Gul"],
    ]);
    for (const target of targets) {
      expect(target.wait).toBeGreaterThanOrEqual(0);
      expect(target.wait).toBeLessThanOrEqual(MAX_WAIT_SECONDS);
      const runes = target.needsLock ? target.runes.ifLocked : target.runes.always;
      expect(runes).toContain(target.rune);
    }
  });

  it("skips chests the player has already passed", () => {
    const { targets } = planRunes(patterns, { ...berGame, distance: 412 });
    expect(targets.every((target) => target.draw >= 412)).toBe(true);
  });

  it("waits longer for a Ber, but not for lesser runes", () => {
    const fireRate = 11 / 1100;
    const { targets } = planRunes(patterns, { ...berGame, fireRate, minRune: "El" });
    const ber = targets.find((target) => target.draw === 411);
    expect(ber).toMatchObject({ rune: "Ber" });
    expect(ber!.wait).toBeCloseTo(1100);
    expect(isLongWait(ber!)).toBe(true);
    for (const target of targets.filter(isLongWait)) expect(target.rune).toBe("Ber");
    expect(targets.every((target) => target.wait <= MAX_BER_WAIT_SECONDS)).toBe(true);
    expect(planRunes(patterns, { ...berGame, fireRate: 11 / 1600 }).targets).toEqual([]);
  });

  it("says how far away the next rune is when none is in reach", () => {
    const plan = planRunes(patterns, { ...berGame, distance: 606, fireRate: 1, minRune: "Vex" });
    expect(plan.targets).toEqual([]);
    expect(plan.next).toMatchObject({ draw: 2017, rune: "Sur", wait: 1411 });
    expect(planRunes(patterns, { ...berGame, distance: 606, fireRate: 1 }).next).toBeUndefined();
  });

  it("waits at River of Flame by default", () => {
    const ber = planRunes(patterns, berGame).targets.find((target) => target.draw === 411);
    expect(ber).toMatchObject({ stops: ["riverOfFlame"], start: 400, off: 0 });
  });

  it("hops waypoints before River of Flame in combo mode, waiting out the rest", () => {
    const waypointAdds = new Map<WaypointId, number>([["travincal", 100], ["riverOfFlame", 50]]);
    const { targets } = planRunes(patterns, { ...berGame, distance: 300, mode: "combo", waypointAdds });
    const ber = targets.find((target) => target.draw === 411);
    expect(ber).toMatchObject({ stops: ["travincal", "riverOfFlame"], start: 400, wait: 5.5, off: 0 });
  });

  it("lands near a chest with waypoints alone, within the tolerance", () => {
    const waypointAdds = new Map<WaypointId, number>([["travincal", 100]]);
    const { targets } = planRunes(patterns, { ...berGame, distance: 300, direct: 300, mode: "waypoints", waypointAdds });
    const ber = targets.find((target) => target.draw === 411);
    expect(ber).toMatchObject({ stops: ["travincal"], start: 400, wait: 0, off: -11 });
    for (const target of targets) expect(Math.abs(target.off)).toBeLessThanOrEqual(WAYPOINT_TOLERANCE);
  });

  it("reaches far chests with full laps of the waypoints, then a last pass", () => {
    const waypointAdds = new Map<WaypointId, number>([["travincal", 100], ["lostCity", 60], ["coldPlains", 12]]);
    const options = { ...berGame, distance: 300, direct: 300, minRune: "Vex" as Rune, mode: "repeats" as const, waypointAdds };
    const { targets } = planRunes(patterns, options);
    const far = targets.filter((target) => target.draw > 300 + 172 + WAYPOINT_TOLERANCE);
    expect(far.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.draw).toBeLessThanOrEqual(MAX_REPEAT_DRAW);
      expect(Math.abs(target.off)).toBeLessThanOrEqual(WAYPOINT_TOLERANCE);
      const total = target.stops.reduce((sum, stop) => sum + waypointAdds.get(stop)!, 0);
      expect(300 + total).toBe(target.start);
      target.stops.forEach((stop, index) => expect(stop).not.toBe(target.stops[index - 1]));
    }
    expect(routeText(far.at(-1)!.stops)).toMatch(/^\d+ laps of \(Cold Plains → Lost City → Travincal\)(, then .+)?$/);
  });
});

describe("routeText", () => {
  it("counts laps for routes that revisit waypoints", () => {
    expect(routeText(["coldPlains", "lostCity", "travincal", "coldPlains", "lostCity", "travincal", "lostCity"])).toBe(
      "2 laps of (Cold Plains → Lost City → Travincal), then Lost City",
    );
    expect(routeText(["coldPlains", "travincal"])).toBe("Cold Plains → Travincal");
  });
});

describe("WaypointHops", () => {
  const hops = new WaypointHops(
    new Map<WaypointId, number>([["coldPlains", 10], ["travincal", 50], ["riverOfFlame", 55], ["dryHills", 40]]),
  );

  it("adds up to the most every waypoint can give", () => {
    expect(hops.max).toBe(155);
  });

  it("picks the closest total, with fewest stops, in act order", () => {
    expect(hops.closest(50)).toEqual({ stops: ["travincal"], total: 50 });
    expect(hops.closest(100)).toEqual({ stops: ["dryHills", "riverOfFlame"], total: 95 });
    expect(hops.closest(3)).toEqual({ stops: [], total: 0 });
  });

  it("won't take an extra stop to save only a few draws", () => {
    expect(hops.closest(58)).toEqual({ stops: ["riverOfFlame"], total: 55 });
  });

  it("never goes past the goal with atMost", () => {
    expect(hops.atMost(54)).toEqual({ stops: ["travincal"], total: 50 });
    expect(hops.atMost(9)).toEqual({ stops: [], total: 0 });
    expect(new WaypointHops(new Map([["riverOfFlame", 55]]), ["riverOfFlame"]).max).toBe(0);
  });
});
