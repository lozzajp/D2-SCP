import { CHEST_SEED_COUNT, MAX_CHEST_DRAWS } from "../chest/chestStream";
import {
  CHEST_AREAS,
  DEFAULT_AREA,
  DEFAULT_PLAYERS,
  chestArea,
  isChestArea,
  isPlayerCount,
  tableKey,
  type ChestAreaId,
  type ChestAreaInfo,
  type PatternTable,
  type PlayerCount,
} from "../chest/areas";
import { AVAILABLE_ROUTE_MODES, CHEST_RUNES, PLATFORM_FIRE_RATES, runesUpTo, type RouteMode, type Rune } from "../chest/runePlan";
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
const AREA_ROUTES: Record<ChestAreaId, readonly RouteId[]> = { lowerKurast: ROUTE_IDS, riverOfFlame: ["direct"] };
const PRESET_AREA: ChestAreaId = "lowerKurast";
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

interface AreaSaved {
  chests: Record<ChestSlot, ChestEntry>;
  plan: PickedPlan | null;
  distanceToFirstChest: number | null;
  routeSamples: RouteSample[];
  calibrationRoute: RouteId;
  recalibrate: RouteId[];
}

interface Saved {
  seed: KnownSeed | null;
  seedHistory: PreviousSeed[];
  platform: PlatformId;
  charLevel: number;
  fireRate: number | null;
  area: ChestAreaId;
  players: PlayerCount;
  areas: Record<ChestAreaId, AreaSaved>;
  routeMode: RouteMode;
  minRune: Rune;
  advanced: boolean;
}

const DEFAULT_MIN_RUNE: Rune = "Pul";

export class PlayerProgress {
  private readonly saved: Saved;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly tableListeners = new Set<() => void>();

  constructor(storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage) {
    this.storage = storage;
    this.saved = load(storage);
  }

  private get here(): AreaSaved {
    return this.saved.areas[this.saved.area];
  }

  get area(): ChestAreaInfo {
    return chestArea(this.saved.area);
  }

  get players(): PlayerCount {
    const allowed: readonly PlayerCount[] = this.area.players;
    return allowed.includes(this.saved.players) ? this.saved.players : allowed[0];
  }

  get chestTable(): PatternTable {
    return { area: this.saved.area, players: this.players };
  }

  setArea(area: ChestAreaId): void {
    if (area === this.saved.area) return;
    this.changeTable(() => (this.saved.area = area));
  }

  setPlayers(players: PlayerCount): void {
    if (players === this.saved.players || !this.area.players.includes(players)) return;
    this.changeTable(() => {
      this.saved.players = players;
      for (const slot of CHEST_SLOTS) this.here.chests[slot] = { ...this.here.chests[slot], seed: null };
      this.here.plan = null;
    });
  }

  onTableChange(listener: () => void): void {
    this.tableListeners.add(listener);
  }

  private changeTable(change: () => void): void {
    const before = tableKey(this.chestTable);
    change();
    this.save();
    if (tableKey(this.chestTable) === before) return;
    this.listeners.clear();
    for (const listener of this.tableListeners) listener();
  }

  get calibrationRoutes(): readonly RouteId[] {
    return AREA_ROUTES[this.saved.area];
  }

  get hasWaypointRoutes(): boolean {
    return this.calibrationRoutes.length > 1;
  }

  get chestRunes(): readonly Rune[] {
    return runesUpTo(this.area.topRune);
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
      for (const area of Object.values(this.saved.areas)) {
        for (const slot of CHEST_SLOTS) area.chests[slot] = { drops: [], exact: area.chests[slot].exact, seed: null };
        area.plan = null;
      }
    }
    this.saved.seed = seed;
    if (seed && !this.saved.seedHistory.some((past) => sameSeed(past, seed))) {
      this.saved.seedHistory = [{ ...seed, foundAt: Date.now() }, ...this.saved.seedHistory].slice(0, MAX_SEED_HISTORY);
    }
    if (seed && this.saved.fireRate === null) this.useFireRateOf(this.saved.platform);
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
    this.saved.fireRate = PLATFORM_FIRE_RATES[platform] ?? this.saved.fireRate;
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
    return { distanceToFirstChest: this.here.distanceToFirstChest, fireRate: this.saved.fireRate };
  }

  get advanced(): boolean {
    return this.saved.advanced;
  }

  setAdvanced(advanced: boolean): void {
    this.saved.advanced = advanced;
    this.changed();
  }

  updateSettings(changes: Partial<GameSettings>): void {
    const settings = cleanSettings({ ...this.settings, ...changes });
    this.here.distanceToFirstChest = settings.distanceToFirstChest;
    this.saved.fireRate = settings.fireRate;
    this.changed();
  }

  get routeSamples(): readonly RouteSample[] {
    return this.here.routeSamples;
  }

  get calibrationRoute(): RouteId {
    return this.here.calibrationRoute;
  }

  setCalibrationRoute(route: RouteId): void {
    if (!this.calibrationRoutes.includes(route)) return;
    this.here.calibrationRoute = route;
    this.changed();
  }

  flagRecalibrate(routes: readonly RouteId[]): void {
    const next = [...new Set(routes)].filter((route) => this.calibrationRoutes.includes(route)).slice(0, MAX_RECALIBRATE);
    const flagged = this.here.recalibrate;
    if (next.length === flagged.length && next.every((route, index) => route === flagged[index])) return;
    this.here.recalibrate = next;
    this.changed();
  }

  calibrateNext(limit = 5): CalibrateSuggestion[] {
    const runs = new Map<RouteId, number>();
    for (const { route, preset } of this.here.routeSamples) if (!preset) runs.set(route, (runs.get(route) ?? 0) + 1);
    const runsOf = (route: RouteId) => runs.get(route) ?? 0;
    const order = CALIBRATE_ORDER.filter((route) => this.calibrationRoutes.includes(route));
    const fresh = order.filter((route) => runsOf(route) === 0);
    const fewest = order.filter((route) => runsOf(route) > 0).sort((a, b) => runsOf(a) - runsOf(b));
    const flagged = this.here.recalibrate;
    return [...new Set([...fresh, ...flagged, ...fewest])]
      .slice(0, limit)
      .map((route) => ({ route, runs: runsOf(route), flagged: flagged.includes(route) }));
  }

  addRouteSample(route: RouteId, draw: number): void {
    if (!Number.isInteger(draw) || draw < 1 || draw > MAX_CHEST_DRAWS || !this.calibrationRoutes.includes(route)) return;
    const gameSeed = this.saved.seed?.gameSeed ?? null;
    const kept = this.here.routeSamples.filter((sample) => gameSeed === null || sample.gameSeed !== gameSeed);
    this.here.routeSamples = [...kept, { route, draw, gameSeed }];
    this.here.recalibrate = this.here.recalibrate.filter((flagged) => flagged !== route);
    this.useDirectAverage();
    this.changed();
  }

  removeRouteSample(sample: RouteSample): void {
    this.here.routeSamples = this.here.routeSamples.filter((kept) => kept !== sample);
    this.useDirectAverage();
    this.changed();
  }

  clearRoute(route: RouteId): void {
    this.here.routeSamples = this.here.routeSamples.filter((kept) => kept.route !== route);
    this.useDirectAverage();
    this.changed();
  }

  importRouteSamples(samples: readonly RouteSample[], replace: boolean): void {
    let next = replace ? [] : [...this.here.routeSamples];
    for (const sample of samples) {
      const { route, draw, gameSeed, preset } = sample;
      if (!this.calibrationRoutes.includes(route) || (preset && !this.offersPresetCalibration)) continue;
      if (next.some((kept) => kept.route === route && kept.draw === draw && kept.gameSeed === gameSeed && kept.preset === preset)) continue;
      if (gameSeed !== null) next = next.filter((kept) => kept.gameSeed !== gameSeed);
      next.push(preset ? { route, draw, gameSeed, preset } : { route, draw, gameSeed });
    }
    this.here.routeSamples = next;
    this.useDirectAverage();
    this.changed();
  }

  get offersPresetCalibration(): boolean {
    return this.saved.area === PRESET_AREA;
  }

  get usingPresetCalibration(): boolean {
    return this.here.routeSamples.some((sample) => sample.preset);
  }

  setPresetCalibration(on: boolean): void {
    if (on && !this.offersPresetCalibration) return;
    const own = this.here.routeSamples.filter((sample) => !sample.preset);
    this.here.routeSamples = on ? [...own, ...PRESET_SAMPLES] : own;
    this.useDirectAverage();
    this.changed();
  }

  private useDirectAverage(): void {
    const direct = averageDraw(this.here.routeSamples, "direct");
    if (direct !== null) this.here.distanceToFirstChest = Math.round(direct);
  }

  get riverAdds(): number | null {
    if (this.saved.area === "riverOfFlame") return 0;
    return routeAdds(this.here.routeSamples, RIVER_OF_FLAME, this.here.distanceToFirstChest);
  }

  get riverStart(): number | null {
    const distance = this.here.distanceToFirstChest;
    const adds = this.riverAdds;
    return distance === null || adds === null ? null : distance + adds;
  }

  get waypointAdds(): Map<WaypointId, number> {
    const adds = new Map<WaypointId, number>();
    for (const { id } of WAYPOINTS) {
      if (!this.calibrationRoutes.includes(id)) continue;
      const value = routeAdds(this.here.routeSamples, id, this.here.distanceToFirstChest);
      if (value !== null) adds.set(id, value);
    }
    return adds;
  }

  get routeMode(): RouteMode {
    return this.hasWaypointRoutes ? this.saved.routeMode : "wait";
  }

  setRouteMode(mode: RouteMode): void {
    if (!AVAILABLE_ROUTE_MODES.includes(mode)) return;
    this.saved.routeMode = mode;
    this.changed();
  }

  chest(slot: ChestSlot): ChestEntry {
    return this.here.chests[slot];
  }

  updateChest(slot: ChestSlot, changes: Partial<ChestEntry>): void {
    const chest = { ...this.here.chests[slot] };
    if (changes.drops !== undefined) chest.drops = cleanDrops(changes.drops);
    if (changes.exact !== undefined) chest.exact = changes.exact;
    if (changes.seed !== undefined) chest.seed = cleanChestSeed(changes.seed);
    this.here.chests[slot] = chest;
    this.changed();
  }

  get plan(): PickedPlan | null {
    return this.here.plan;
  }

  setPlan(plan: PickedPlan | null): void {
    this.here.plan = cleanPlan(plan);
    this.changed();
  }

  get minRune(): Rune {
    const runes = this.chestRunes;
    return runes.includes(this.saved.minRune) ? this.saved.minRune : runes.at(-1)!;
  }

  setMinRune(rune: Rune): void {
    this.saved.minRune = rune;
    this.changed();
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  private changed(): void {
    this.save();
    for (const listener of this.listeners) listener();
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.saved));
    } catch {
    }
  }
}

type LegacySaved = Partial<Saved> &
  Partial<Omit<AreaSaved, "distanceToFirstChest">> & {
    settings?: unknown;
    firstChestDrops?: unknown;
    firstChestExact?: unknown;
    firstChestSeed?: unknown;
  };

function load(storage: Pick<Storage, "getItem"> | undefined): Saved {
  let data: LegacySaved = {};
  try {
    data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
  }
  const savedAreas = (data.areas ?? null) as Partial<Record<ChestAreaId, unknown>> | null;
  const areas = Object.fromEntries(
    CHEST_AREAS.map(({ id }) => [id, savedAreas ? cleanArea(savedAreas[id], id) : id === DEFAULT_AREA ? legacyArea(data) : cleanArea(null, id)]),
  ) as Record<ChestAreaId, AreaSaved>;
  const fireRate = savedAreas ? cleanSettings({ fireRate: data.fireRate }).fireRate : cleanSettings(data.settings).fireRate;
  return {
    seed: cleanSeed(data.seed),
    seedHistory: cleanSeedHistory(data.seedHistory),
    platform: PLATFORMS.some((platform) => platform.id === data.platform) ? data.platform! : "pc",
    charLevel: cleanCharLevel(data.charLevel) ?? loadState(storage).setup.charLevel,
    fireRate,
    area: isChestArea(data.area) ? data.area : DEFAULT_AREA,
    players: isPlayerCount(data.players) ? data.players : DEFAULT_PLAYERS,
    areas,
    routeMode: AVAILABLE_ROUTE_MODES.includes(data.routeMode as RouteMode) ? data.routeMode! : "wait",
    minRune: CHEST_RUNES.includes(data.minRune as Rune) ? data.minRune! : DEFAULT_MIN_RUNE,
    advanced: data.advanced === true,
  };
}

function legacyArea(data: LegacySaved): AreaSaved {
  const first = data.chests?.first ?? { drops: data.firstChestDrops, exact: data.firstChestExact, seed: data.firstChestSeed };
  const settings = cleanSettings(data.settings);
  let routeSamples = data.routeSamples;
  if (routeSamples === undefined && settings.distanceToFirstChest !== null) {
    routeSamples = [{ route: RIVER_OF_FLAME, draw: settings.distanceToFirstChest, gameSeed: null }];
    settings.distanceToFirstChest = null;
  }
  return cleanArea(
    { ...data, chests: { first, refine: data.chests?.refine }, distanceToFirstChest: settings.distanceToFirstChest, routeSamples },
    DEFAULT_AREA,
  );
}

function cleanArea(area: unknown, id: ChestAreaId): AreaSaved {
  const data = (area ?? {}) as Partial<Record<keyof AreaSaved, unknown>>;
  const routes = AREA_ROUTES[id];
  const allowed = (route: unknown): route is RouteId => isRouteId(route) && routes.includes(route);
  const chests = (data.chests ?? {}) as Partial<Record<ChestSlot, unknown>>;
  return {
    chests: { first: cleanChest(chests.first), refine: cleanChest(chests.refine) },
    plan: cleanPlan(data.plan),
    distanceToFirstChest: cleanSettings({ distanceToFirstChest: data.distanceToFirstChest }).distanceToFirstChest,
    routeSamples: cleanRouteSamples(data.routeSamples).filter(
      (sample) => allowed(sample.route) && (!sample.preset || id === PRESET_AREA),
    ),
    calibrationRoute: allowed(data.calibrationRoute) ? data.calibrationRoute : "direct",
    recalibrate: Array.isArray(data.recalibrate) ? [...new Set(data.recalibrate.filter(allowed))].slice(0, MAX_RECALIBRATE) : [],
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
