import { CHEST_SEED_COUNT, MAX_CHEST_DRAWS } from "../chest/chestStream";
import { AVAILABLE_ROUTE_MODES, CHEST_RUNES, PLATFORM_FIRE_RATES, type RouteMode, type Rune } from "../chest/runePlan";
import {
  RIVER_OF_FLAME,
  ROUTE_IDS,
  WAYPOINTS,
  averageDraw,
  isRouteId,
  routeAdds,
  type RouteId,
  type RouteSample,
  type WaypointId,
} from "../chest/waypoints";
import { isChestDrop } from "../data/chestDrops";
import presetCalibration from "../data/lozzajpCalibration.json";
import { PLATFORMS, type PlatformId } from "../gamble/settings";
import { loadState } from "../features/seedFinder/state";
import { STORE_SEED_DRAWS, type GameType } from "../rng/gameSeed";

export interface KnownSeed {
  gameSeed: number;
  gameType: GameType;
}

export interface PreviousSeed extends KnownSeed {
  foundAt: number;
}

const MAX_SEED_HISTORY = 10;
const MAX_RECALIBRATE = ROUTE_IDS.length;
const CALIBRATE_ORDER: readonly RouteId[] = ["direct", RIVER_OF_FLAME, ...ROUTE_IDS.filter((route) => route !== "direct" && route !== RIVER_OF_FLAME)];
const STORAGE_KEY = "d2lkscp-progress";
const GAME_TYPES = Object.keys(STORE_SEED_DRAWS) as GameType[];
const CHEST_SLOTS: readonly ChestSlot[] = ["first", "refine"];
const PRESET_SAMPLES: readonly RouteSample[] = cleanRouteSamples(
  Object.entries(presetCalibration.draws).map(([route, draw]) => ({ route, draw, gameSeed: null, preset: true })),
);

export interface CalibrateSuggestion {
  route: RouteId;
  runs: number;
  flagged: boolean;
}

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  seedFlag: "D2R -seed game",
  normal: "Normal D2R game",
};

export interface GameSettings {
  distanceToFirstChest: number | null;
  fireRate: number | null;
}

export type ChestSlot = "first" | "refine";

export interface ChestEntry {
  drops: readonly string[];
  exact: boolean;
  seed: number | null;
}

export interface PickedPlan {
  draw: number;
  seed: number;
  rune: Rune;
  wait: number;
  distance: number;
  fireRate: number;
  stops: WaypointId[];
}

interface Saved {
  seed: KnownSeed | null;
  seedHistory: PreviousSeed[];
  platform: PlatformId;
  charLevel: number;
  chests: Record<ChestSlot, ChestEntry>;
  plan: PickedPlan | null;
  settings: GameSettings;
  routeSamples: RouteSample[];
  calibrationRoute: RouteId;
  recalibrate: RouteId[];
  routeMode: RouteMode;
  minRune: Rune;
  advanced: boolean;
}

const DEFAULT_MIN_RUNE: Rune = "Pul";

export class PlayerProgress {
  private readonly saved: Saved;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage) {
    this.storage = storage;
    this.saved = load(storage);
  }

  get knownSeed(): KnownSeed | null {
    return this.saved.seed;
  }

  get seedHistory(): readonly PreviousSeed[] {
    return this.saved.seedHistory;
  }

  setKnownSeed(seed: KnownSeed | null): void {
    const old = this.saved.seed;
    if (seed?.gameSeed !== old?.gameSeed || seed?.gameType !== old?.gameType) {
      for (const slot of CHEST_SLOTS) {
        this.saved.chests[slot] = { drops: [], exact: this.saved.chests[slot].exact, seed: null };
      }
      this.saved.plan = null;
    }
    this.saved.seed = seed;
    if (seed && !this.saved.seedHistory.some((past) => sameSeed(past, seed))) {
      this.saved.seedHistory = [{ ...seed, foundAt: Date.now() }, ...this.saved.seedHistory].slice(0, MAX_SEED_HISTORY);
    }
    if (seed && this.saved.settings.fireRate === null) this.useFireRateOf(this.saved.platform);
    this.changed();
  }

  get platform(): PlatformId {
    return this.saved.platform;
  }

  setPlatform(platform: PlatformId): void {
    this.saved.platform = platform;
    this.useFireRateOf(platform);
    this.changed();
  }

  private useFireRateOf(platform: PlatformId): void {
    this.saved.settings.fireRate = PLATFORM_FIRE_RATES[platform] ?? this.saved.settings.fireRate;
  }

  get charLevel(): number {
    return this.saved.charLevel;
  }

  setCharLevel(level: number): void {
    const clean = cleanCharLevel(Math.round(level));
    if (clean === null || clean === this.saved.charLevel) return;
    this.saved.charLevel = clean;
    this.changed();
  }

  get settings(): GameSettings {
    return { ...this.saved.settings };
  }

  get advanced(): boolean {
    return this.saved.advanced;
  }

  setAdvanced(advanced: boolean): void {
    this.saved.advanced = advanced;
    this.changed();
  }

  updateSettings(changes: Partial<GameSettings>): void {
    this.saved.settings = cleanSettings({ ...this.saved.settings, ...changes });
    this.changed();
  }

  get routeSamples(): readonly RouteSample[] {
    return this.saved.routeSamples;
  }

  get calibrationRoute(): RouteId {
    return this.saved.calibrationRoute;
  }

  setCalibrationRoute(route: RouteId): void {
    this.saved.calibrationRoute = route;
    this.changed();
  }

  flagRecalibrate(routes: readonly RouteId[]): void {
    const next = [...new Set(routes)].slice(0, MAX_RECALIBRATE);
    if (next.length === this.saved.recalibrate.length && next.every((route, index) => route === this.saved.recalibrate[index])) return;
    this.saved.recalibrate = next;
    this.changed();
  }

  calibrateNext(limit = 5): CalibrateSuggestion[] {
    const runs = new Map<RouteId, number>();
    for (const { route, preset } of this.saved.routeSamples) if (!preset) runs.set(route, (runs.get(route) ?? 0) + 1);
    const runsOf = (route: RouteId) => runs.get(route) ?? 0;
    const fresh = CALIBRATE_ORDER.filter((route) => runsOf(route) === 0);
    const fewest = CALIBRATE_ORDER.filter((route) => runsOf(route) > 0).sort((a, b) => runsOf(a) - runsOf(b));
    return [...new Set([...fresh, ...this.saved.recalibrate, ...fewest])]
      .slice(0, limit)
      .map((route) => ({ route, runs: runsOf(route), flagged: this.saved.recalibrate.includes(route) }));
  }

  addRouteSample(route: RouteId, draw: number): void {
    if (!Number.isInteger(draw) || draw < 1 || draw > MAX_CHEST_DRAWS) return;
    const gameSeed = this.saved.seed?.gameSeed ?? null;
    const kept = this.saved.routeSamples.filter((sample) => gameSeed === null || sample.gameSeed !== gameSeed);
    this.saved.routeSamples = [...kept, { route, draw, gameSeed }];
    this.saved.recalibrate = this.saved.recalibrate.filter((flagged) => flagged !== route);
    this.useDirectAverage();
    this.changed();
  }

  removeRouteSample(sample: RouteSample): void {
    this.saved.routeSamples = this.saved.routeSamples.filter((kept) => kept !== sample);
    this.useDirectAverage();
    this.changed();
  }

  clearRoute(route: RouteId): void {
    this.saved.routeSamples = this.saved.routeSamples.filter((kept) => kept.route !== route);
    this.useDirectAverage();
    this.changed();
  }

  importRouteSamples(samples: readonly RouteSample[], replace: boolean): void {
    let next = replace ? [] : [...this.saved.routeSamples];
    for (const sample of samples) {
      const { route, draw, gameSeed, preset } = sample;
      if (next.some((kept) => kept.route === route && kept.draw === draw && kept.gameSeed === gameSeed && kept.preset === preset)) continue;
      if (gameSeed !== null) next = next.filter((kept) => kept.gameSeed !== gameSeed);
      next.push(preset ? { route, draw, gameSeed, preset } : { route, draw, gameSeed });
    }
    this.saved.routeSamples = next;
    this.useDirectAverage();
    this.changed();
  }

  get usingPresetCalibration(): boolean {
    return this.saved.routeSamples.some((sample) => sample.preset);
  }

  setPresetCalibration(on: boolean): void {
    const own = this.saved.routeSamples.filter((sample) => !sample.preset);
    this.saved.routeSamples = on ? [...own, ...PRESET_SAMPLES] : own;
    this.useDirectAverage();
    this.changed();
  }

  private useDirectAverage(): void {
    const direct = averageDraw(this.saved.routeSamples, "direct");
    if (direct !== null) this.saved.settings.distanceToFirstChest = Math.round(direct);
  }

  get riverAdds(): number | null {
    return routeAdds(this.saved.routeSamples, RIVER_OF_FLAME, this.saved.settings.distanceToFirstChest);
  }

  get riverStart(): number | null {
    const distance = this.saved.settings.distanceToFirstChest;
    const adds = this.riverAdds;
    return distance === null || adds === null ? null : distance + adds;
  }

  get waypointAdds(): Map<WaypointId, number> {
    const adds = new Map<WaypointId, number>();
    for (const { id } of WAYPOINTS) {
      const value = routeAdds(this.saved.routeSamples, id, this.saved.settings.distanceToFirstChest);
      if (value !== null) adds.set(id, value);
    }
    return adds;
  }

  get routeMode(): RouteMode {
    return this.saved.routeMode;
  }

  setRouteMode(mode: RouteMode): void {
    if (!AVAILABLE_ROUTE_MODES.includes(mode)) return;
    this.saved.routeMode = mode;
    this.changed();
  }

  chest(slot: ChestSlot): ChestEntry {
    return this.saved.chests[slot];
  }

  updateChest(slot: ChestSlot, changes: Partial<ChestEntry>): void {
    const chest = { ...this.saved.chests[slot] };
    if (changes.drops !== undefined) chest.drops = cleanDrops(changes.drops);
    if (changes.exact !== undefined) chest.exact = changes.exact;
    if (changes.seed !== undefined) chest.seed = cleanChestSeed(changes.seed);
    this.saved.chests[slot] = chest;
    this.changed();
  }

  get plan(): PickedPlan | null {
    return this.saved.plan;
  }

  setPlan(plan: PickedPlan | null): void {
    this.saved.plan = cleanPlan(plan);
    this.changed();
  }

  get minRune(): Rune {
    return this.saved.minRune;
  }

  setMinRune(rune: Rune): void {
    this.saved.minRune = rune;
    this.changed();
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  private changed(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.saved));
    } catch {
    }
    for (const listener of this.listeners) listener();
  }
}

function load(storage: Pick<Storage, "getItem"> | undefined): Saved {
  let data: Partial<Saved> & { firstChestDrops?: unknown; firstChestExact?: unknown; firstChestSeed?: unknown } = {};
  try {
    data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
  }
  const first = data.chests?.first ?? { drops: data.firstChestDrops, exact: data.firstChestExact, seed: data.firstChestSeed };
  const settings = cleanSettings(data.settings);
  let routeSamples = cleanRouteSamples(data.routeSamples);
  if (data.routeSamples === undefined && settings.distanceToFirstChest !== null) {
    routeSamples = [{ route: RIVER_OF_FLAME, draw: settings.distanceToFirstChest, gameSeed: null }];
    settings.distanceToFirstChest = null;
  }
  return {
    seed: cleanSeed(data.seed),
    seedHistory: cleanSeedHistory(data.seedHistory),
    platform: PLATFORMS.some((platform) => platform.id === data.platform) ? data.platform! : "pc",
    charLevel: cleanCharLevel(data.charLevel) ?? loadState(storage).setup.charLevel,
    chests: { first: cleanChest(first), refine: cleanChest(data.chests?.refine) },
    plan: cleanPlan(data.plan),
    settings,
    routeSamples,
    calibrationRoute: isRouteId(data.calibrationRoute) ? data.calibrationRoute : "direct",
    recalibrate: Array.isArray(data.recalibrate) ? [...new Set(data.recalibrate.filter(isRouteId))].slice(0, MAX_RECALIBRATE) : [],
    routeMode: AVAILABLE_ROUTE_MODES.includes(data.routeMode as RouteMode) ? data.routeMode! : "wait",
    minRune: CHEST_RUNES.includes(data.minRune as Rune) ? data.minRune! : DEFAULT_MIN_RUNE,
    advanced: data.advanced === true,
  };
}

function cleanCharLevel(level: unknown): number | null {
  return Number.isInteger(level) && (level as number) >= 1 && (level as number) <= 99 ? (level as number) : null;
}

function cleanChest(chest: unknown): ChestEntry {
  const { drops, seed } = (chest ?? {}) as Partial<Record<keyof ChestEntry, unknown>>;
  return { drops: cleanDrops(drops), exact: false, seed: cleanChestSeed(seed) };
}

function cleanPlan(plan: unknown): PickedPlan | null {
  const { draw, seed, rune, wait, distance, fireRate, stops } = (plan ?? {}) as Partial<Record<keyof PickedPlan, unknown>>;
  const route = stops === undefined ? [RIVER_OF_FLAME] : stops;
  const valid =
    Number.isInteger(draw) &&
    (draw as number) >= 1 &&
    cleanChestSeed(seed) !== null &&
    CHEST_RUNES.includes(rune as Rune) &&
    typeof wait === "number" &&
    Number.isFinite(wait) &&
    wait >= 0 &&
    Number.isInteger(distance) &&
    (distance as number) >= 1 &&
    cleanSettings({ fireRate }).fireRate !== null &&
    Array.isArray(route) &&
    route.every((stop) => isRouteId(stop) && stop !== "direct");
  return valid ? ({ draw, seed, rune, wait, distance, fireRate, stops: [...route] } as PickedPlan) : null;
}

export function cleanRouteSamples(samples: unknown): RouteSample[] {
  if (!Array.isArray(samples)) return [];
  return samples.flatMap((entry) => {
    const { route, draw, gameSeed, preset } = (entry ?? {}) as Partial<Record<keyof RouteSample, unknown>>;
    const valid =
      isRouteId(route) &&
      Number.isInteger(draw) &&
      (draw as number) >= 1 &&
      (draw as number) <= MAX_CHEST_DRAWS &&
      (gameSeed === null || (Number.isInteger(gameSeed) && (gameSeed as number) >= 0 && (gameSeed as number) < 2 ** 32));
    if (!valid) return [];
    const sample: RouteSample = { route, draw: draw as number, gameSeed: gameSeed as number | null };
    return [preset === true ? { ...sample, preset: true as const } : sample];
  });
}

function cleanChestSeed(seed: unknown): number | null {
  return Number.isInteger(seed) && (seed as number) >= 1 && (seed as number) <= CHEST_SEED_COUNT ? (seed as number) : null;
}

function cleanSettings(settings: unknown): GameSettings {
  const { distanceToFirstChest, fireRate } = (settings ?? {}) as Partial<GameSettings>;
  const distance =
    Number.isInteger(distanceToFirstChest) && distanceToFirstChest! >= 1 && distanceToFirstChest! <= MAX_CHEST_DRAWS;
  const fire = typeof fireRate === "number" && Number.isFinite(fireRate) && fireRate > 0;
  return {
    distanceToFirstChest: distance ? distanceToFirstChest! : null,
    fireRate: fire ? fireRate : null,
  };
}

function cleanSeed(seed: unknown): KnownSeed | null {
  const { gameSeed, gameType } = (seed ?? {}) as Partial<KnownSeed>;
  const valid =
    Number.isInteger(gameSeed) && gameSeed! >= 0 && gameSeed! < 2 ** 32 && GAME_TYPES.includes(gameType as GameType);
  return valid ? { gameSeed: gameSeed!, gameType: gameType! } : null;
}

function cleanSeedHistory(history: unknown): PreviousSeed[] {
  if (!Array.isArray(history)) return [];
  return history.flatMap((entry) => {
    const seed = cleanSeed(entry);
    const foundAt = (entry as Partial<PreviousSeed> | null)?.foundAt;
    return seed && typeof foundAt === "number" && Number.isFinite(foundAt) ? [{ ...seed, foundAt }] : [];
  }).slice(0, MAX_SEED_HISTORY);
}

function sameSeed(a: KnownSeed, b: KnownSeed): boolean {
  return a.gameSeed === b.gameSeed && a.gameType === b.gameType;
}

function cleanDrops(drops: unknown): string[] {
  return Array.isArray(drops) ? drops.filter((name) => typeof name === "string" && isChestDrop(name)) : [];
}
