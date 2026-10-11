import type { PlatformId } from "../gamble/settings";
import type { GameType } from "../rng/gameSeed";
import { chestSeedStream } from "./chestStream";
import type { ChestPatterns } from "./patterns";
import { RIVER_OF_FLAME, STOP_COST, WaypointHops, type WaypointId } from "./waypoints";

export const RUNES = [
  "El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul", "Amn", "Sol", "Shael", "Dol", "Hel", "Io", "Lum",
  "Ko", "Fal", "Lem", "Pul", "Um", "Mal", "Ist", "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber", "Jah", "Cham", "Zod",
] as const;
export type Rune = (typeof RUNES)[number];
export const CHEST_RUNES: readonly Rune[] = RUNES.slice(0, RUNES.indexOf("Ber") + 1);

export const MAX_WAIT_SECONDS = 600;
export const MAX_BER_WAIT_SECONDS = 1500;
export const PLATFORM_FIRE_RATES: Partial<Record<PlatformId, number>> = { pc: 3, ps: 1.7 };
export const FIRE_RATE_NOTE = "known range 1.0 - 3.0: PC about 3.0, PS5 about 1.7";
const LOOK_BEYOND = 6000;
const FIRST_CHEST_DRAW = 3;

const RANK = new Map<string, number>(RUNES.map((rune, rank) => [rune, rank]));

export function isRune(name: unknown): name is Rune {
  return typeof name === "string" && RANK.has(name);
}

export interface ChestRunes {
  always: Rune[];
  ifLocked: Rune[];
}

export interface RuneTarget {
  draw: number;
  seed: number;
  rune: Rune;
  needsLock: boolean;
  runes: ChestRunes;
  stops: WaypointId[];
  start: number;
  wait: number;
  off: number;
}

export interface RunePlan {
  targets: RuneTarget[];
  next?: RuneTarget;
  early: RuneTarget[];
}

export type RouteMode = "wait" | "waypoints" | "combo" | "repeats";
export const ROUTE_MODES: readonly RouteMode[] = ["wait", "waypoints", "combo", "repeats"];
export const AVAILABLE_ROUTE_MODES: readonly RouteMode[] = ["wait", "waypoints", "combo"];
export const WAYPOINT_TOLERANCE = 20;
export const MAX_REPEAT_DRAW = 10_000;

export interface RunePlanOptions {
  gameSeed: number;
  gameType: GameType;
  distance: number;
  fireRate: number;
  minRune: Rune;
  includeEarly?: boolean;
  mode?: RouteMode;
  direct?: number;
  waypointAdds?: ReadonlyMap<WaypointId, number>;
}

export function isLongWait(target: RuneTarget): boolean {
  return target.wait > MAX_WAIT_SECONDS;
}

export function chestRunes(patterns: ChestPatterns, seed: number): ChestRunes {
  const { unlockedCycles, cycles } = patterns.pattern(seed);
  return { always: runesIn(cycles.slice(0, unlockedCycles)), ifLocked: runesIn(cycles.slice(unlockedCycles)) };
}

export function planRunes(patterns: ChestPatterns, options: RunePlanOptions): RunePlan {
  const { distance, fireRate, minRune } = options;
  const mode = options.mode ?? "wait";
  const adds = options.waypointAdds ?? new Map<WaypointId, number>();
  if (mode === "waypoints") return planWaypoints(patterns, options, new WaypointHops(adds));
  if (mode === "repeats") return planRepeats(patterns, options, adds);

  const hops = new WaypointHops(mode === "combo" ? adds : new Map(), [RIVER_OF_FLAME]);
  const first = Math.max(FIRST_CHEST_DRAW, Math.ceil(distance));
  const last = Math.floor(distance + MAX_WAIT_SECONDS * fireRate) + hops.max;
  const lastBer = Math.floor(distance + MAX_BER_WAIT_SECONDS * fireRate) + hops.max;
  const stream = chestSeedStream(options.gameSeed, options.gameType, Math.max(lastBer, last + LOOK_BEYOND));
  const route = (draw: number, seed: number, runes: Pick<RuneTarget, "rune" | "needsLock" | "runes">): RuneTarget => {
    const hop = hops.atMost(draw - distance);
    const start = distance + hop.total;
    return { draw, seed, ...runes, stops: [...hop.stops, RIVER_OF_FLAME], start, wait: (draw - start) / fireRate, off: 0 };
  };

  const targets: RuneTarget[] = [];
  for (let draw = first; draw <= lastBer; draw++) {
    const seed = stream[draw - 1];
    const runes = chestRunes(patterns, seed);
    const wanted = qualify(runes, minRune);
    if (!wanted) continue;
    const target = route(draw, seed, wanted);
    if (target.wait <= MAX_WAIT_SECONDS) targets.push(target);
    else if (target.wait <= MAX_BER_WAIT_SECONDS && qualify(runes, "Ber")) targets.push(route(draw, seed, qualify(runes, "Ber")!));
  }
  const early: RuneTarget[] = [];
  if (options.includeEarly) {
    for (let draw = FIRST_CHEST_DRAW; draw < first; draw++) {
      const wanted = qualify(chestRunes(patterns, stream[draw - 1]), minRune);
      if (wanted) early.push({ ...route(draw, stream[draw - 1], wanted), start: distance, wait: (draw - distance) / fireRate });
    }
  }
  if (targets.length > 0) return { targets, early };
  for (let draw = first; draw <= last + LOOK_BEYOND; draw++) {
    const wanted = qualify(chestRunes(patterns, stream[draw - 1]), minRune);
    if (wanted) return { targets, early, next: route(draw, stream[draw - 1], wanted) };
  }
  return { targets, early };
}

function planWaypoints(patterns: ChestPatterns, options: RunePlanOptions, hops: WaypointHops): RunePlan {
  const direct = options.direct ?? options.distance;
  const first = Math.max(FIRST_CHEST_DRAW, direct - WAYPOINT_TOLERANCE);
  const last = direct + hops.max + WAYPOINT_TOLERANCE;
  const stream = chestSeedStream(options.gameSeed, options.gameType, last);
  const targets: RuneTarget[] = [];
  for (let draw = first; draw <= last; draw++) {
    const seed = stream[draw - 1];
    const wanted = qualify(chestRunes(patterns, seed), options.minRune);
    if (!wanted) continue;
    const hop = hops.closest(draw - direct);
    const start = direct + hop.total;
    if (Math.abs(start - draw) > WAYPOINT_TOLERANCE) continue;
    targets.push({ draw, seed, ...wanted, stops: hop.stops, start, wait: 0, off: start - draw });
  }
  return { targets, early: [] };
}

function planRepeats(patterns: ChestPatterns, options: RunePlanOptions, adds: ReadonlyMap<WaypointId, number>): RunePlan {
  const direct = options.direct ?? options.distance;
  const hops = new WaypointHops(adds);
  const lap = hops.closest(hops.max).stops;
  const first = Math.max(FIRST_CHEST_DRAW, direct - WAYPOINT_TOLERANCE);
  const stream = chestSeedStream(options.gameSeed, options.gameType, MAX_REPEAT_DRAW);
  const targets: RuneTarget[] = [];
  for (let draw = first; draw <= MAX_REPEAT_DRAW; draw++) {
    const seed = stream[draw - 1];
    const wanted = qualify(chestRunes(patterns, seed), options.minRune);
    if (!wanted) continue;
    const goal = draw - direct;
    let best: { stops: WaypointId[]; total: number; cost: number } | undefined;
    const most = Math.max(0, Math.floor(goal / hops.max));
    for (let laps = Math.max(0, most - 1); laps <= most + 1; laps++) {
      const hop = hops.closest(goal - laps * hops.max);
      const total = laps * hops.max + hop.total;
      const cost = Math.abs(total - goal) + STOP_COST * (laps * lap.length + hop.stops.length);
      if (best && cost >= best.cost) continue;
      const stops = joinRoute(hop.stops, Array.from({ length: laps }, () => lap).flat());
      if (stops) best = { stops, total, cost };
    }
    if (!best) continue;
    const start = direct + best.total;
    if (Math.abs(start - draw) > WAYPOINT_TOLERANCE) continue;
    targets.push({ draw, seed, ...wanted, stops: best.stops, start, wait: 0, off: start - draw });
  }
  return { targets, early: [] };
}

function joinRoute(pass: readonly WaypointId[], laps: readonly WaypointId[]): WaypointId[] | undefined {
  for (const route of [[...laps, ...pass], [...pass, ...laps]]) {
    if (route.every((stop, index) => index === 0 || stop !== route[index - 1])) return route;
  }
  return undefined;
}

function qualify(runes: ChestRunes, minRune: Rune): Pick<RuneTarget, "rune" | "needsLock" | "runes"> | undefined {
  const min = RANK.get(minRune)!;
  const always = bestRune(runes.always);
  if (always && RANK.get(always)! >= min) return { rune: always, needsLock: false, runes };
  const locked = bestRune(runes.ifLocked);
  if (locked && RANK.get(locked)! >= min) return { rune: locked, needsLock: true, runes };
  return undefined;
}

function bestRune(runes: readonly Rune[]): Rune | undefined {
  return runes.reduce<Rune | undefined>((best, rune) => (best && RANK.get(best)! >= RANK.get(rune)! ? best : rune), undefined);
}

function runesIn(cycles: readonly string[][]): Rune[] {
  return cycles.flat().flatMap((name) => {
    const rune = name.endsWith(" Rune") ? name.slice(0, -5) : "";
    return isRune(rune) ? [rune] : [];
  });
}
