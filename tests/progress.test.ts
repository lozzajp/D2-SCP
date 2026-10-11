import { describe, expect, it } from "vitest";
import { cleanRouteSamples, PlayerProgress } from "../src/app/progress";
import { ROUTE_IDS } from "../src/chest/waypoints";

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set("d2lkscp-progress", initial);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe("PlayerProgress", () => {
  it("starts with no seed", () => {
    expect(new PlayerProgress(memoryStorage()).knownSeed).toBeNull();
  });

  it("remembers the character level, taking it from an older seed finder save", () => {
    const storage = memoryStorage();
    storage.setItem("d2lkscp-seed-finder", JSON.stringify({ setup: { charLevel: 85 } }));
    const progress = new PlayerProgress(storage);
    expect(progress.charLevel).toBe(85);
    progress.setCharLevel(70.4);
    progress.setCharLevel(150);
    expect(new PlayerProgress(storage).charLevel).toBe(70);
  });

  it("remembers a saved seed and tells subscribers", () => {
    const storage = memoryStorage();
    const progress = new PlayerProgress(storage);
    let calls = 0;
    progress.subscribe(() => calls++);
    progress.setKnownSeed({ gameSeed: 638589163, gameType: "seedFlag" });
    expect(calls).toBe(1);
    expect(new PlayerProgress(storage).knownSeed).toEqual({ gameSeed: 638589163, gameType: "seedFlag" });
  });

  it.each([
    "not json",
    JSON.stringify({ seed: { gameSeed: -1, gameType: "seedFlag" } }),
    JSON.stringify({ seed: { gameSeed: 2 ** 32, gameType: "normal" } }),
    JSON.stringify({ seed: { gameSeed: 1.5, gameType: "classic" } }),
    JSON.stringify({ seed: { gameSeed: 5, gameType: "bogus" } }),
  ])("ignores bad saved data %s", (saved) => {
    expect(new PlayerProgress(memoryStorage(saved)).knownSeed).toBeNull();
  });

  it("remembers chest drops per slot, dropping unknown names, but starts with exact match off", () => {
    const storage = memoryStorage();
    new PlayerProgress(storage).updateChest("first", { drops: ["Gold", "Ber Rune", "Gold"] });
    new PlayerProgress(storage).updateChest("refine", { drops: ["Ist Rune"], exact: true });
    expect(new PlayerProgress(storage).chest("first")).toEqual({ drops: ["Gold", "Ber Rune", "Gold"], exact: false, seed: null });
    expect(new PlayerProgress(storage).chest("refine")).toEqual({ drops: ["Ist Rune"], exact: false, seed: null });

    const tampered = memoryStorage(JSON.stringify({ chests: { first: { drops: ["Gold", "Zod Rune", 5] } } }));
    expect(new PlayerProgress(tampered).chest("first").drops).toEqual(["Gold"]);
  });

  it("remembers chest seeds, ignoring impossible ones", () => {
    const storage = memoryStorage();
    expect(new PlayerProgress(storage).chest("first").seed).toBeNull();
    new PlayerProgress(storage).updateChest("first", { seed: 4468 });
    expect(new PlayerProgress(storage).chest("first").seed).toBe(4468);
    expect(new PlayerProgress(storage).chest("refine").seed).toBeNull();

    for (const seed of [0, 65535, 1.5, "4468"]) {
      expect(new PlayerProgress(memoryStorage(JSON.stringify({ chests: { first: { seed } } }))).chest("first").seed).toBeNull();
    }
  });

  it("moves the old first chest fields into the first slot", () => {
    const saved = JSON.stringify({ firstChestDrops: ["Gold"], firstChestExact: true, firstChestSeed: 4468 });
    const progress = new PlayerProgress(memoryStorage(saved));
    expect(progress.chest("first")).toEqual({ drops: ["Gold"], exact: false, seed: 4468 });
    expect(progress.chest("refine")).toEqual({ drops: [], exact: false, seed: null });
  });

  it("forgets chests and the plan when the game changes, but not when the same seed is saved again", () => {
    const progress = new PlayerProgress(memoryStorage());
    progress.setKnownSeed({ gameSeed: 1, gameType: "seedFlag" });
    progress.updateChest("first", { drops: ["Gold"], seed: 4468, exact: true });
    progress.updateChest("refine", { drops: ["Ber Rune"], seed: 4468 });
    progress.setPlan({ draw: 411, seed: 4468, rune: "Ber", wait: 5, distance: 400, fireRate: 2, stops: ["riverOfFlame"] });
    progress.setKnownSeed({ gameSeed: 1, gameType: "seedFlag" });
    expect(progress.chest("first").seed).toBe(4468);
    expect(progress.plan).not.toBeNull();

    progress.setKnownSeed({ gameSeed: 2, gameType: "seedFlag" });
    expect(progress.chest("first")).toEqual({ drops: [], exact: true, seed: null });
    expect(progress.chest("refine")).toEqual({ drops: [], exact: false, seed: null });
    expect(progress.plan).toBeNull();
  });

  it("remembers the picked plan, ignoring bad ones", () => {
    const storage = memoryStorage();
    const plan = { draw: 411, seed: 4468, rune: "Ber" as const, wait: 5.5, distance: 400, fireRate: 2, stops: ["travincal" as const] };
    new PlayerProgress(storage).setPlan(plan);
    expect(new PlayerProgress(storage).plan).toEqual(plan);

    for (const bad of [{ ...plan, rune: "Zod" }, { ...plan, seed: 0 }, { ...plan, fireRate: 0 }, { ...plan, draw: "411" }, { ...plan, stops: ["direct"] }]) {
      expect(new PlayerProgress(memoryStorage(JSON.stringify({ plan: bad }))).plan).toBeNull();
    }
    const { stops: _, ...old } = plan;
    expect(new PlayerProgress(memoryStorage(JSON.stringify({ plan: old }))).plan?.stops).toEqual(["riverOfFlame"]);

    const long = { ...plan, draw: 1450, distance: 1460, wait: 0 };
    new PlayerProgress(storage).setPlan(long);
    expect(new PlayerProgress(storage).plan).toEqual(long);
  });

  it("remembers the route mode, defaulting to waiting at River of Flame", () => {
    const storage = memoryStorage();
    expect(new PlayerProgress(storage).routeMode).toBe("wait");
    new PlayerProgress(storage).setRouteMode("combo");
    expect(new PlayerProgress(storage).routeMode).toBe("combo");
    expect(new PlayerProgress(memoryStorage(JSON.stringify({ routeMode: "fly" }))).routeMode).toBe("wait");
  });

  it("remembers settings, and keeps them when the game seed changes", () => {
    const storage = memoryStorage();
    const progress = new PlayerProgress(storage);
    progress.updateSettings({ fireRate: 1.7 });
    progress.updateSettings({ distanceToFirstChest: 411 });
    expect(new PlayerProgress(storage).settings).toEqual({ distanceToFirstChest: 411, fireRate: 1.7 });

    progress.setKnownSeed({ gameSeed: 1, gameType: "seedFlag" });
    progress.setKnownSeed({ gameSeed: 2, gameType: "seedFlag" });
    expect(progress.settings).toEqual({ distanceToFirstChest: 411, fireRate: 1.7 });
  });

  it.each([0, 2.5, 1001, "411"])("only keeps a distance that is a whole number of draws, not %s", (distance) => {
    const progress = new PlayerProgress(memoryStorage());
    progress.updateSettings({ distanceToFirstChest: distance as number });
    expect(progress.settings.distanceToFirstChest).toBeNull();
  });

  it.each([0, -1, Number.NaN, "3"])("only keeps a fire rate above 0, not %s", (fireRate) => {
    const progress = new PlayerProgress(memoryStorage());
    progress.updateSettings({ fireRate: fireRate as number });
    expect(progress.settings.fireRate).toBeNull();
  });

  it("keeps fire rates outside the known range", () => {
    const progress = new PlayerProgress(memoryStorage());
    progress.updateSettings({ fireRate: 4.5 });
    expect(progress.settings.fireRate).toBe(4.5);
  });

  it("remembers the platform, and sets the fire rate seen on it", () => {
    const storage = memoryStorage();
    const progress = new PlayerProgress(storage);
    expect(progress.platform).toBe("pc");
    progress.setPlatform("ps");
    expect(progress.settings.fireRate).toBe(1.7);
    progress.updateSettings({ fireRate: 2.2 });
    progress.setPlatform("xbox");
    expect(progress.settings.fireRate).toBe(2.2);
    expect(new PlayerProgress(storage).platform).toBe("xbox");
    expect(new PlayerProgress(memoryStorage(JSON.stringify({ platform: "n64" }))).platform).toBe("pc");
  });

  it("fills in the platform's fire rate when a seed is found, without replacing one already set", () => {
    const progress = new PlayerProgress(memoryStorage());
    progress.setKnownSeed({ gameSeed: 1, gameType: "seedFlag" });
    expect(progress.settings.fireRate).toBe(3);
    progress.updateSettings({ fireRate: 2.5 });
    progress.setKnownSeed({ gameSeed: 2, gameType: "seedFlag" });
    expect(progress.settings.fireRate).toBe(2.5);
  });

  it("remembers the minimum rune, Pul by default", () => {
    const storage = memoryStorage();
    expect(new PlayerProgress(storage).minRune).toBe("Pul");
    new PlayerProgress(storage).setMinRune("Ber");
    expect(new PlayerProgress(storage).minRune).toBe("Ber");
    expect(new PlayerProgress(memoryStorage(JSON.stringify({ minRune: "Bear" }))).minRune).toBe("Pul");
    expect(new PlayerProgress(memoryStorage(JSON.stringify({ minRune: "Jah" }))).minRune).toBe("Pul");
  });

  it("ignores bad saved settings", () => {
    const saved = JSON.stringify({ settings: { distanceToFirstChest: -5, fireRate: "fast", gameSeed: 1 } });
    expect(new PlayerProgress(memoryStorage(saved)).settings).toEqual({ distanceToFirstChest: null, fireRate: null });
  });

  it("averages route samples, with direct samples setting the distance", () => {
    const storage = memoryStorage();
    const progress = new PlayerProgress(storage);
    expect(progress.riverStart).toBeNull();
    progress.setKnownSeed({ gameSeed: 1, gameType: "normal" });
    progress.addRouteSample("direct", 70);
    progress.setKnownSeed({ gameSeed: 2, gameType: "normal" });
    progress.addRouteSample("direct", 75);
    expect(progress.settings.distanceToFirstChest).toBe(73);
    expect(progress.riverAdds).toBeNull();

    progress.setKnownSeed({ gameSeed: 3, gameType: "normal" });
    progress.addRouteSample("riverOfFlame", 125);
    expect(progress.riverAdds).toBe(53);
    expect(progress.riverStart).toBe(126);

    progress.updateSettings({ distanceToFirstChest: 93 });
    expect(progress.riverStart).toBe(146);

    const reloaded = new PlayerProgress(storage);
    expect(reloaded.routeSamples).toEqual([
      { route: "direct", draw: 70, gameSeed: 1 },
      { route: "direct", draw: 75, gameSeed: 2 },
      { route: "riverOfFlame", draw: 125, gameSeed: 3 },
    ]);
    reloaded.removeRouteSample(reloaded.routeSamples[1]);
    expect(reloaded.settings.distanceToFirstChest).toBe(70);
  });

  it("suggests routes to calibrate: never measured, then the latest Refine's, then the fewest runs", () => {
    const storage = memoryStorage();
    const progress = new PlayerProgress(storage);
    const next = (from = progress) => from.calibrateNext().map(({ route }) => route);
    expect(next()).toEqual(["direct", "riverOfFlame", "coldPlains", "stonyField", "darkWood"]);
    for (const route of ROUTE_IDS) progress.addRouteSample(route, 100);
    expect(next()).toEqual(["direct", "riverOfFlame", "coldPlains", "stonyField", "darkWood"]);

    let changes = 0;
    progress.subscribe(() => changes++);
    progress.flagRecalibrate(["direct", "travincal"]);
    progress.flagRecalibrate(["direct", "travincal"]);
    expect(changes).toBe(1);
    expect(progress.calibrateNext()[1]).toEqual({ route: "travincal", runs: 1, flagged: true });
    progress.flagRecalibrate(["riverOfFlame"]);
    expect(next()).toEqual(["riverOfFlame", "direct", "coldPlains", "stonyField", "darkWood"]);
    progress.addRouteSample("riverOfFlame", 150);
    progress.addRouteSample("direct", 70);
    expect(next(new PlayerProgress(storage))).toEqual(["coldPlains", "stonyField", "darkWood", "blackMarsh", "outerCloister"]);
  });

  it("imports route samples by merging, one per game, or by replacing", () => {
    const progress = new PlayerProgress(memoryStorage());
    progress.setKnownSeed({ gameSeed: 1, gameType: "normal" });
    progress.addRouteSample("direct", 70);
    progress.setKnownSeed({ gameSeed: 2, gameType: "normal" });
    progress.addRouteSample("travincal", 120);
    const file = cleanRouteSamples([
      { route: "direct", draw: 70, gameSeed: 1 },
      { route: "riverOfFlame", draw: 110, gameSeed: 2 },
      { route: "direct", draw: 64, gameSeed: null },
      { route: "nowhere", draw: 5, gameSeed: null },
    ]);
    expect(file).toHaveLength(3);

    progress.importRouteSamples(file, false);
    expect(progress.routeSamples).toEqual([
      { route: "direct", draw: 70, gameSeed: 1 },
      { route: "riverOfFlame", draw: 110, gameSeed: 2 },
      { route: "direct", draw: 64, gameSeed: null },
    ]);
    expect(progress.settings.distanceToFirstChest).toBe(67);

    progress.importRouteSamples([{ route: "travincal", draw: 130, gameSeed: null }], true);
    expect(progress.routeSamples).toEqual([{ route: "travincal", draw: 130, gameSeed: null }]);
  });

  it("adds lozzajp's calibration as removable presets that don't count as the player's runs", () => {
    const storage = memoryStorage();
    const progress = new PlayerProgress(storage);
    progress.setKnownSeed({ gameSeed: 1, gameType: "normal" });
    progress.addRouteSample("direct", 60);
    progress.setPresetCalibration(true);
    const reloaded = new PlayerProgress(storage);
    expect(reloaded.usingPresetCalibration).toBe(true);
    expect(reloaded.routeSamples.filter((sample) => sample.preset)).toHaveLength(ROUTE_IDS.length);
    expect(reloaded.waypointAdds.size).toBe(ROUTE_IDS.length - 1);
    expect(reloaded.calibrateNext()[0]).toEqual({ route: "riverOfFlame", runs: 0, flagged: false });

    reloaded.setPresetCalibration(false);
    expect(reloaded.routeSamples).toEqual([{ route: "direct", draw: 60, gameSeed: 1 }]);
    expect(reloaded.settings.distanceToFirstChest).toBe(60);
  });

  it("clears every sample for one route only", () => {
    const progress = new PlayerProgress(memoryStorage());
    progress.addRouteSample("direct", 70);
    progress.addRouteSample("travincal", 144);
    progress.addRouteSample("travincal", 120);
    progress.clearRoute("travincal");
    expect(progress.routeSamples.map((sample) => sample.route)).toEqual(["direct"]);
  });

  it("keeps one route sample per game", () => {
    const progress = new PlayerProgress(memoryStorage());
    progress.setKnownSeed({ gameSeed: 1, gameType: "normal" });
    progress.addRouteSample("direct", 70);
    progress.addRouteSample("travincal", 144);
    expect(progress.routeSamples).toEqual([{ route: "travincal", draw: 144, gameSeed: 1 }]);
  });

  it("remembers the route being calibrated, Direct by default", () => {
    const storage = memoryStorage();
    expect(new PlayerProgress(storage).calibrationRoute).toBe("direct");
    new PlayerProgress(storage).setCalibrationRoute("travincal");
    expect(new PlayerProgress(storage).calibrationRoute).toBe("travincal");
    expect(new PlayerProgress(memoryStorage(JSON.stringify({ calibrationRoute: "cow level" }))).calibrationRoute).toBe("direct");
  });

  it("turns an older River of Flame distance into a River of Flame sample", () => {
    const progress = new PlayerProgress(memoryStorage(JSON.stringify({ settings: { distanceToFirstChest: 125, fireRate: 1.7 } })));
    expect(progress.settings).toEqual({ distanceToFirstChest: null, fireRate: 1.7 });
    expect(progress.routeSamples).toEqual([{ route: "riverOfFlame", draw: 125, gameSeed: null }]);
    progress.updateSettings({ distanceToFirstChest: 72 });
    expect(progress.riverStart).toBe(125);
  });

  it("drops bad saved route samples", () => {
    const routeSamples = [
      { route: "direct", draw: 72, gameSeed: 5 },
      { route: "moo moo farm", draw: 72, gameSeed: 5 },
      { route: "direct", draw: 0, gameSeed: 5 },
      { route: "direct", draw: 72, gameSeed: -1 },
    ];
    expect(new PlayerProgress(memoryStorage(JSON.stringify({ routeSamples }))).routeSamples).toEqual([
      { route: "direct", draw: 72, gameSeed: 5 },
    ]);
  });
});
