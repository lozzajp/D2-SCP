export const WAYPOINTS = [
  { id: "coldPlains", act: 1, name: "Cold Plains" },
  { id: "stonyField", act: 1, name: "Stony Field" },
  { id: "darkWood", act: 1, name: "Dark Wood" },
  { id: "blackMarsh", act: 1, name: "Black Marsh" },
  { id: "outerCloister", act: 1, name: "Outer Cloister" },
  { id: "jail1", act: 1, name: "Jail Level 1" },
  { id: "innerCloister", act: 1, name: "Inner Cloister" },
  { id: "catacombs2", act: 1, name: "Catacombs Level 2" },
  { id: "lutGholein", act: 2, name: "Lut Gholein" },
  { id: "sewers2", act: 2, name: "Sewers Level 2" },
  { id: "dryHills", act: 2, name: "Dry Hills" },
  { id: "hallsOfTheDead2", act: 2, name: "Halls of the Dead Level 2" },
  { id: "farOasis", act: 2, name: "Far Oasis" },
  { id: "lostCity", act: 2, name: "Lost City" },
  { id: "palaceCellar1", act: 2, name: "Palace Cellar Level 1" },
  { id: "arcaneSanctuary", act: 2, name: "Arcane Sanctuary" },
  { id: "canyonOfTheMagi", act: 2, name: "Canyon of the Magi" },
  { id: "kurastDocks", act: 3, name: "Kurast Docks" },
  { id: "spiderForest", act: 3, name: "Spider Forest" },
  { id: "greatMarsh", act: 3, name: "Great Marsh" },
  { id: "flayerJungle", act: 3, name: "Flayer Jungle" },
  { id: "kurastBazaar", act: 3, name: "Kurast Bazaar" },
  { id: "upperKurast", act: 3, name: "Upper Kurast" },
  { id: "travincal", act: 3, name: "Travincal" },
  { id: "duranceOfHate2", act: 3, name: "Durance of Hate Level 2" },
  { id: "pandemoniumFortress", act: 4, name: "Pandemonium Fortress" },
  { id: "cityOfTheDamned", act: 4, name: "City of the Damned" },
  { id: "riverOfFlame", act: 4, name: "River of Flame" },
  { id: "harrogath", act: 5, name: "Harrogath" },
  { id: "frigidHighlands", act: 5, name: "Frigid Highlands" },
  { id: "arreatPlateau", act: 5, name: "Arreat Plateau" },
  { id: "crystallinePassage", act: 5, name: "Crystalline Passage" },
  { id: "glacialTrail", act: 5, name: "Glacial Trail" },
  { id: "hallsOfPain", act: 5, name: "Halls of Pain" },
  { id: "frozenTundra", act: 5, name: "Frozen Tundra" },
  { id: "ancientsWay", act: 5, name: "The Ancients' Way" },
  { id: "worldstoneKeep2", act: 5, name: "Worldstone Keep Level 2" },
] as const;

export type WaypointId = (typeof WAYPOINTS)[number]["id"];
export type RouteId = "direct" | WaypointId;

export const RIVER_OF_FLAME: WaypointId = "riverOfFlame";
export const ROUTE_IDS: readonly RouteId[] = ["direct", ...WAYPOINTS.map((waypoint) => waypoint.id)];

const NAMES = new Map<RouteId, string>([["direct", "Direct"], ...WAYPOINTS.map((wp) => [wp.id, wp.name] as const)]);

export function isRouteId(id: unknown): id is RouteId {
  return typeof id === "string" && NAMES.has(id as RouteId);
}

export function routeName(route: RouteId): string {
  return NAMES.get(route)!;
}

export interface RouteSample {
  route: RouteId;
  draw: number;
  gameSeed: number | null;
  preset?: true;
}

export function averageDraw(samples: readonly RouteSample[], route: RouteId): number | null {
  const draws = samples.filter((sample) => sample.route === route).map((sample) => sample.draw);
  return draws.length === 0 ? null : draws.reduce((sum, draw) => sum + draw, 0) / draws.length;
}

export function routeAdds(samples: readonly RouteSample[], route: WaypointId, distance: number | null): number | null {
  const average = averageDraw(samples, route);
  const direct = averageDraw(samples, "direct") ?? distance;
  return average === null || direct === null ? null : Math.round(average - direct);
}

export function routeText(stops: readonly WaypointId[]): string {
  if (stops.length === 0) return "Direct";
  if (!hasRepeats(stops)) return stops.map(routeName).join(" → ");
  const groups: { pass: string; laps: number }[] = [];
  for (const pass of passes(stops)) {
    const text = pass.map(routeName).join(" → ");
    const last = groups.at(-1);
    if (last?.pass === text) last.laps++;
    else groups.push({ pass: text, laps: 1 });
  }
  return groups.map(({ pass, laps }) => (laps > 1 ? `${laps} laps of (${pass})` : pass)).join(", then ");
}

function passes(stops: readonly WaypointId[]): WaypointId[][] {
  const result: WaypointId[][] = [];
  for (const stop of stops) {
    const pass = result.at(-1);
    if (pass && ORDER.get(stop)! > ORDER.get(pass.at(-1)!)!) pass.push(stop);
    else result.push([stop]);
  }
  return result;
}

const ORDER = new Map<WaypointId, number>(WAYPOINTS.map(({ id }, index) => [id, index]));

export function hasRepeats(stops: readonly WaypointId[]): boolean {
  return new Set(stops).size < stops.length;
}

export interface Hop {
  stops: WaypointId[];
  total: number;
}

export const STOP_COST = 5;

export class WaypointHops {
  readonly max: number;
  private readonly fewest: (WaypointId[] | undefined)[];

  constructor(adds: ReadonlyMap<WaypointId, number>, exclude: readonly WaypointId[] = []) {
    const items = WAYPOINTS.flatMap(({ id }) => {
      const value = adds.get(id) ?? 0;
      return value > 0 && !exclude.includes(id) ? [[id, value] as const] : [];
    });
    this.max = items.reduce((sum, [, value]) => sum + value, 0);
    this.fewest = new Array(this.max + 1);
    this.fewest[0] = [];
    for (const [id, value] of items) {
      for (let total = this.max; total >= value; total--) {
        const before = this.fewest[total - value];
        const current = this.fewest[total];
        if (before && (!current || before.length + 1 < current.length)) this.fewest[total] = [...before, id];
      }
    }
  }

  closest(draws: number): Hop {
    const nearest = (this.nearest ??= this.nearestTable());
    const total = nearest[Math.max(0, Math.min(this.max, draws))];
    return { stops: this.fewest[total]!, total };
  }

  private nearest?: Int32Array;

  private nearestTable(): Int32Array {
    const size = this.max + 1;
    const best = new Int32Array(size);
    const cost = new Float64Array(size);
    for (let at = 0; at < size; at++) {
      const own = this.fewest[at] ? STOP_COST * this.fewest[at]!.length : Infinity;
      if (at > 0 && cost[at - 1] + 1 <= own) {
        best[at] = best[at - 1];
        cost[at] = cost[at - 1] + 1;
      } else {
        best[at] = at;
        cost[at] = own;
      }
    }
    for (let at = size - 2; at >= 0; at--) {
      if (cost[at + 1] + 1 < cost[at]) {
        best[at] = best[at + 1];
        cost[at] = cost[at + 1] + 1;
      }
    }
    return best;
  }

  atMost(draws: number): Hop {
    return this.pick((total) => (total <= draws ? draws - total : Infinity));
  }

  private pick(gap: (total: number) => number): Hop {
    let best: Hop = { stops: [], total: 0 };
    let bestCost = gap(0);
    this.fewest.forEach((stops, total) => {
      const cost = stops ? gap(total) + STOP_COST * stops.length : Infinity;
      if (cost < bestCost) {
        best = { stops: stops!, total };
        bestCost = cost;
      }
    });
    return best;
  }
}
