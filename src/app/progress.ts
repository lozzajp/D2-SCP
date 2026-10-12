import { CHEST_SEED_COUNT, MAX_CHEST_DRAWS } from "../chest/chestStream";
import {
  CHEST_AREAS,
  DEFAULT_AREA,
  DEFAULT_PLAYERS,
  chestArea,
  isChestArea,
  isPlayerCount,
  PLAYER_COUNTS,
  tableKey,
  type ChestAreaId,
  type ChestAreaInfo,
  type PatternTable,
  type PlayerCount,
} from "../chest/areas";
import {
  AVAILABLE_ROUTE_MODES,
  CHEST_RUNES,
  DEFAULT_MIN_RUNE,
  MAX_PICK_WAIT_SECONDS,
  PLATFORM_FIRE_RATES,
  defaultRunePick,
  type RouteMode,
  type Rune,
  type RunePicks,
  type RunePlanOptions,
} from "../chest/runePlan";
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
import { GAME_VERSIONS, PLATFORMS, type GameVersionId, type PlatformId } from "../gamble/settings";
import { hasSavedState, loadState } from "../features/seedFinder/state";
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
const AREA_BASE_ROUTES: readonly RouteId[] = ["direct", RIVER_OF_FLAME];
const WAYPOINT_AREA: ChestAreaId = "lowerKurast";
export const WAYPOINT_TARGET = "waypoints";
export type CalibrateTarget = ChestAreaId | typeof WAYPOINT_TARGET;
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

export interface PickedPlan extends PatternTable {
  draw: number;
  seed: number;
  rune: Rune;
  wait: number;
  distance: number;
  fireRate: number;
  stops: WaypointId[];
  otherSeeds?: KnownSeed[];
}

export type PlanSort = "soonest" | "best";
export const PLAN_SORTS: readonly PlanSort[] = ["soonest", "best"];

export type PlanRoute = Pick<RunePlanOptions, "distance" | "fireRate" | "mode" | "direct" | "waypointAdds">;
export type RouteGap = "direct" | "fireRate" | "river" | "waypoints";

interface AreaSaved {
  chests: Record<ChestSlot, ChestEntry>;
  distanceToFirstChest: number | null;
  routeSamples: RouteSample[];
  calibrationRoute: RouteId;
  recalibrate: RouteId[];
}

interface Saved {
  seed: KnownSeed | null;
  seedHistory: PreviousSeed[];
  platform: PlatformId | null;
  charLevel: number | null;
  version: GameVersionId | null;
  fireRate: number | null;
  area: ChestAreaId;
  players: PlayerCount;
  areas: Record<ChestAreaId, AreaSaved>;
  plan: PickedPlan | null;
  lastPlan: PickedPlan | null;
  planAreas: ChestAreaId[];
  planPlayers: PlayerCount[];
  planSort: PlanSort;
  routeMode: RouteMode;
  runePicks: Record<Rune, RunePick>;
  calibratingWaypoints: boolean;
}

export interface RunePick {
  on: boolean;
  wait: number;
}

export class PlayerProgress {
  private readonly saved: Saved;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly tableListeners = new Set<() => void>();
  private readonly scoped = new Set<() => void>();
  private collecting = false;

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
    if (!isChestArea(area) || (area === this.saved.area && !this.saved.calibratingWaypoints)) return;
    this.switchTable(area, this.saved.players, false);
    this.changed();
  }

  get calibrateTarget(): CalibrateTarget {
    return this.saved.calibratingWaypoints ? WAYPOINT_TARGET : this.saved.area;
  }

  setCalibrateTarget(target: CalibrateTarget): void {
    if (target === this.calibrateTarget) return;
    if (target === WAYPOINT_TARGET) this.switchTable(WAYPOINT_AREA, this.saved.players, true);
    else if (isChestArea(target)) this.switchTable(target, this.saved.players, false);
    else return;
    this.changed();
  }

  setPlayers(players: PlayerCount): void {
    if (players === this.saved.players || !isPlayerCount(players)) return;
    this.switchTable(this.saved.area, players, this.saved.calibratingWaypoints);
    this.changed();
  }

  useTable({ area, players }: PatternTable): void {
    if (!isChestArea(area) || !isPlayerCount(players) || tableKey({ area, players }) === tableKey(this.chestTable)) return;
    this.switchTable(area, players, this.saved.calibratingWaypoints && area === WAYPOINT_AREA);
    this.changed();
  }

  onTableChange(listener: () => void): void {
    this.tableListeners.add(listener);
  }

  tableScoped<T>(build: () => T): T {
    const was = this.collecting;
    this.collecting = true;
    try {
      return build();
    } finally {
      this.collecting = was;
    }
  }

  private switchTable(area: ChestAreaId, players: PlayerCount, waypoints: boolean): void {
    const before = `${tableKey(this.chestTable)}:${this.calibrateTarget}`;
    if (players !== this.saved.players) {
      this.saved.players = players;
      for (const saved of Object.values(this.saved.areas)) {
        for (const slot of CHEST_SLOTS) saved.chests[slot] = { ...saved.chests[slot], seed: null };
      }
    }
    this.saved.area = area;
    this.saved.calibratingWaypoints = waypoints && area === WAYPOINT_AREA;
    this.save();
    if (`${tableKey(this.chestTable)}:${this.calibrateTarget}` === before) return;
    for (const listener of this.scoped) this.listeners.delete(listener);
    this.scoped.clear();
    for (const listener of this.tableListeners) listener();
  }

  get calibrationRoutes(): readonly RouteId[] {
    return AREA_ROUTES[this.saved.area];
  }

  get calibratingRoutes(): readonly RouteId[] {
    const routes = this.calibrationRoutes;
    if (this.saved.area !== WAYPOINT_AREA) return routes;
    return routes.filter((route) => this.saved.calibratingWaypoints === !AREA_BASE_ROUTES.includes(route));
  }

  get hasWaypointRoutes(): boolean {
    return this.calibrationRoutes.length > 1;
  }

  hasWaypointsIn(area: ChestAreaId): boolean {
    return AREA_ROUTES[area].length > 1;
  }

  isCalibrated(area: ChestAreaId): boolean {
    return this.saved.areas[area].distanceToFirstChest !== null;
  }

  distanceIn(area: ChestAreaId): number | null {
    return this.saved.areas[area].distanceToFirstChest;
  }

  riverAddsIn(area: ChestAreaId): number | null {
    return riverAddsOf(this.saved.areas[area], area);
  }

  get waypointHopCount(): number {
    const routes = new Set(this.saved.areas[WAYPOINT_AREA].routeSamples.map((sample) => sample.route));
    return [...routes].filter((route) => !AREA_BASE_ROUTES.includes(route)).length;
  }

  get waypointDirectMissing(): boolean {
    return this.saved.areas[WAYPOINT_AREA].distanceToFirstChest === null;
  }

  waypointAreaFor(area: ChestAreaId): ChestAreaId {
    return this.hasWaypointsIn(area) ? area : WAYPOINT_AREA;
  }

  private planWaypointAdds(area: ChestAreaId): Map<WaypointId, number> {
    const from = this.waypointAreaFor(area);
    const adds = waypointAddsOf(this.saved.areas[from], from);
    if (from !== area) adds.delete(RIVER_OF_FLAME);
    return adds;
  }

  planRoute(area: ChestAreaId): PlanRoute | RouteGap {
    const saved = this.saved.areas[area];
    const direct = saved.distanceToFirstChest;
    const fireRate = this.saved.fireRate;
    if (direct === null) return "direct";
    if (fireRate === null) return "fireRate";
    const mode = this.saved.routeMode;
    const waypointAdds = this.planWaypointAdds(area);
    if (mode === "waypoints" || mode === "repeats") {
      const needed = mode === "repeats" ? 2 : 1;
      if ([...waypointAdds.values()].filter((value) => value > 0).length < needed) return "waypoints";
      return { distance: direct, direct, fireRate, mode, waypointAdds };
    }
    const river = riverStartOf(saved, area);
    if (river === null) return "river";
    return { distance: river, direct, fireRate, mode, waypointAdds };
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
      }
      if (this.saved.plan) this.saved.lastPlan = this.saved.plan;
      this.saved.plan = null;
    }
    this.saved.seed = seed;
    if (seed && !this.saved.seedHistory.some((past) => sameSeed(past, seed))) {
      this.saved.seedHistory = [{ ...seed, foundAt: Date.now() }, ...this.saved.seedHistory].slice(0, MAX_SEED_HISTORY);
    }
    if (seed && this.saved.fireRate === null && this.saved.platform !== null) this.useFireRateOf(this.saved.platform);
    this.changed();
  }

  get platform(): PlatformId | null {
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

  get charLevel(): number | null {
    return this.saved.charLevel;
  }

  setCharLevel(level: number): void {
    const clean = cleanCharLevel(Math.round(level));
    if (clean === null || clean === this.saved.charLevel) return;
    this.saved.charLevel = clean;
    this.changed();
  }

  get version(): GameVersionId | null {
    return this.saved.version;
  }

  setVersion(version: GameVersionId): void {
    if (version === this.saved.version) return;
    this.saved.version = version;
    this.changed();
  }

  get playerSettingsMissing(): boolean {
    return this.saved.platform === null || this.saved.charLevel === null || this.saved.version === null;
  }

  get settings(): GameSettings {
    return { distanceToFirstChest: this.here.distanceToFirstChest, fireRate: this.saved.fireRate };
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
    const routes = this.calibratingRoutes;
    return routes.includes(this.here.calibrationRoute) ? this.here.calibrationRoute : routes[0];
  }

  setCalibrationRoute(route: RouteId): void {
    if (!this.calibratingRoutes.includes(route)) return;
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
    const order = CALIBRATE_ORDER.filter((route) => this.calibratingRoutes.includes(route));
    const fresh = order.filter((route) => runsOf(route) === 0);
    const fewest = order.filter((route) => runsOf(route) > 0).sort((a, b) => runsOf(a) - runsOf(b));
    const flagged = this.here.recalibrate.filter((route) => this.calibratingRoutes.includes(route));
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
    return riverAddsOf(this.here, this.saved.area);
  }

  get riverStart(): number | null {
    return riverStartOf(this.here, this.saved.area);
  }

  get waypointAdds(): Map<WaypointId, number> {
    return waypointAddsOf(this.here, this.saved.area);
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
    return this.saved.plan;
  }

  get lastPlan(): PickedPlan | null {
    return this.saved.lastPlan;
  }

  setPlan(plan: PickedPlan | null): void {
    const clean = cleanPlan(plan, this.chestTable);
    this.saved.plan = clean;
    if (clean) this.switchTable(clean.area, clean.players, this.saved.calibratingWaypoints && clean.area === WAYPOINT_AREA);
    this.changed();
  }

  retirePlan(): void {
    if (!this.saved.plan) return;
    this.saved.lastPlan = this.saved.plan;
    this.saved.plan = null;
    this.changed();
  }

  get planAreas(): readonly ChestAreaId[] {
    return this.saved.planAreas;
  }

  togglePlanArea(area: ChestAreaId): void {
    const on = !this.saved.planAreas.includes(area);
    this.saved.planAreas = CHEST_AREAS.map(({ id }) => id).filter((id) => (id === area ? on : this.saved.planAreas.includes(id)));
    this.changed();
  }

  get planPlayers(): readonly PlayerCount[] {
    return this.saved.planPlayers;
  }

  togglePlanPlayers(players: PlayerCount): void {
    const on = !this.saved.planPlayers.includes(players);
    this.saved.planPlayers = PLAYER_COUNTS.filter((count) => (count === players ? on : this.saved.planPlayers.includes(count)));
    this.changed();
  }

  get planSort(): PlanSort {
    return this.saved.planSort;
  }

  setPlanSort(sort: PlanSort): void {
    if (!PLAN_SORTS.includes(sort)) return;
    this.saved.planSort = sort;
    this.changed();
  }

  get runePicks(): Readonly<Record<Rune, RunePick>> {
    return this.saved.runePicks;
  }

  get pickedRunes(): RunePicks {
    return new Map(CHEST_RUNES.filter((rune) => this.saved.runePicks[rune].on).map((rune) => [rune, this.saved.runePicks[rune].wait]));
  }

  setRunePick(rune: Rune, change: Partial<RunePick>): void {
    if (!CHEST_RUNES.includes(rune)) return;
    this.saved.runePicks[rune] = cleanRunePick(change, this.saved.runePicks[rune]);
    this.changed();
  }

  setAllRunePicks(change: Partial<RunePick>): void {
    for (const rune of CHEST_RUNES) this.saved.runePicks[rune] = cleanRunePick(change, this.saved.runePicks[rune]);
    this.changed();
  }

  pickRunesFrom(min: Rune): void {
    const from = CHEST_RUNES.indexOf(min);
    if (from < 0) return;
    CHEST_RUNES.forEach((rune, index) => (this.saved.runePicks[rune] = cleanRunePick({ on: index >= from }, this.saved.runePicks[rune])));
    this.changed();
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
    if (this.collecting) this.scoped.add(listener);
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
    minRune?: unknown;
  };

function load(storage: Pick<Storage, "getItem"> | undefined): Saved {
  let data: LegacySaved = {};
  let returning = false;
  try {
    const raw = storage?.getItem(STORAGE_KEY) ?? null;
    returning = raw !== null || hasSavedState(storage);
    data = JSON.parse(raw ?? "{}") ?? {};
  } catch {
  }
  const legacy = returning ? loadState(storage).setup : null;
  const savedAreas = (data.areas ?? null) as Partial<Record<ChestAreaId, unknown>> | null;
  const areas = Object.fromEntries(
    CHEST_AREAS.map(({ id }) => [id, savedAreas ? cleanArea(savedAreas[id], id) : id === DEFAULT_AREA ? legacyArea(data) : cleanArea(null, id)]),
  ) as Record<ChestAreaId, AreaSaved>;
  const fireRate = savedAreas ? cleanSettings({ fireRate: data.fireRate }).fireRate : cleanSettings(data.settings).fireRate;
  const area = isChestArea(data.area) ? data.area : DEFAULT_AREA;
  const players = isPlayerCount(data.players) ? data.players : DEFAULT_PLAYERS;
  const areaPlan = (savedAreas?.[area] as { plan?: unknown } | undefined)?.plan;
  return {
    seed: cleanSeed(data.seed),
    seedHistory: cleanSeedHistory(data.seedHistory),
    platform: "platform" in data ? (PLATFORMS.some((platform) => platform.id === data.platform) ? data.platform! : null) : (legacy?.platform ?? null),
    charLevel: "charLevel" in data ? cleanCharLevel(data.charLevel) : (legacy?.charLevel ?? null),
    version: "version" in data ? (GAME_VERSIONS.some((version) => version.id === data.version) ? data.version! : null) : (legacy?.version ?? null),
    fireRate,
    area,
    players,
    areas,
    plan: cleanPlan(data.plan ?? areaPlan, { area, players }),
    lastPlan: cleanPlan(data.lastPlan, { area, players }),
    planAreas: cleanList(data.planAreas, CHEST_AREAS.map(({ id }) => id)),
    planPlayers: cleanList(data.planPlayers, PLAYER_COUNTS),
    planSort: PLAN_SORTS.includes(data.planSort as PlanSort) ? data.planSort! : "soonest",
    routeMode: AVAILABLE_ROUTE_MODES.includes(data.routeMode as RouteMode) ? data.routeMode! : "wait",
    runePicks: cleanRunePicks(data.runePicks, data.minRune),
    calibratingWaypoints: data.calibratingWaypoints === true && area === WAYPOINT_AREA,
  };
}

function cleanRunePicks(saved: unknown, minRune: unknown): Record<Rune, RunePick> {
  const picks = (saved !== null && typeof saved === "object" ? saved : {}) as Partial<Record<Rune, unknown>>;
  const min = CHEST_RUNES.includes(minRune as Rune) ? (minRune as Rune) : DEFAULT_MIN_RUNE;
  return Object.fromEntries(CHEST_RUNES.map((rune) => [rune, cleanRunePick(picks[rune], defaultRunePick(rune, min))])) as Record<Rune, RunePick>;
}

function cleanRunePick(pick: unknown, fallback: RunePick): RunePick {
  const { on, wait } = (pick ?? {}) as Partial<Record<keyof RunePick, unknown>>;
  const validWait = typeof wait === "number" && Number.isFinite(wait) && wait >= 0 && wait <= MAX_PICK_WAIT_SECONDS;
  return { on: typeof on === "boolean" ? on : fallback.on, wait: validWait ? wait : fallback.wait };
}

function cleanList<T>(saved: unknown, all: readonly T[]): T[] {
  return Array.isArray(saved) ? all.filter((item) => saved.includes(item)) : [...all];
}

function riverAddsOf(saved: AreaSaved, area: ChestAreaId): number | null {
  if (AREA_ROUTES[area].length === 1) return 0;
  return routeAdds(saved.routeSamples, RIVER_OF_FLAME, saved.distanceToFirstChest);
}

function riverStartOf(saved: AreaSaved, area: ChestAreaId): number | null {
  const distance = saved.distanceToFirstChest;
  const adds = riverAddsOf(saved, area);
  return distance === null || adds === null ? null : distance + adds;
}

function waypointAddsOf(saved: AreaSaved, area: ChestAreaId): Map<WaypointId, number> {
  const adds = new Map<WaypointId, number>();
  for (const { id } of WAYPOINTS) {
    if (!AREA_ROUTES[area].includes(id)) continue;
    const value = routeAdds(saved.routeSamples, id, saved.distanceToFirstChest);
    if (value !== null) adds.set(id, value);
  }
  return adds;
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

function cleanPlan(plan: unknown, fallback: PatternTable): PickedPlan | null {
  const { draw, seed, rune, wait, distance, fireRate, stops, area, players, otherSeeds } = (plan ?? {}) as Partial<Record<keyof PickedPlan, unknown>>;
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
  if (!valid) return null;
  const others = cleanOtherSeeds(otherSeeds);
  return {
    draw,
    seed,
    rune,
    wait,
    distance,
    fireRate,
    stops: [...route],
    area: isChestArea(area) ? area : fallback.area,
    players: isPlayerCount(players) ? players : fallback.players,
    ...(others.length > 0 ? { otherSeeds: others } : {}),
  } as PickedPlan;
}

function cleanOtherSeeds(seeds: unknown): KnownSeed[] {
  if (!Array.isArray(seeds)) return [];
  return seeds
    .filter((seed): seed is KnownSeed => {
      const { gameSeed, gameType } = (seed ?? {}) as Partial<Record<keyof KnownSeed, unknown>>;
      return Number.isInteger(gameSeed) && (gameSeed as number) >= 0 && (gameSeed as number) < 2 ** 32 && GAME_TYPES.includes(gameType as GameType);
    })
    .slice(0, 16)
    .map(({ gameSeed, gameType }) => ({ gameSeed, gameType }));
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
