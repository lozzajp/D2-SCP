import type { PatternTable } from "./areas";
import type { ChestPatterns } from "./patterns";
import { RUNES, planRunes, type Rune, type RunePlanOptions, type RuneTarget } from "./runePlan";

export interface TableTarget extends RuneTarget, PatternTable {}

export interface TableInput {
  table: PatternTable;
  patterns: ChestPatterns;
  route: Omit<RunePlanOptions, "gameSeed" | "gameType" | "minRune">;
}

export type TargetSort = "soonest" | "best";

const RANK = new Map<string, number>(RUNES.map((rune, rank) => [rune, rank]));

export function planTables(
  inputs: readonly TableInput[],
  seed: Pick<RunePlanOptions, "gameSeed" | "gameType">,
  minRune: Rune,
  sort: TargetSort = "soonest",
): TableTarget[] {
  const targets = inputs.flatMap(({ table, patterns, route }) =>
    planRunes(patterns, { ...seed, ...route, minRune }).targets.map((target) => ({ ...target, ...table })),
  );
  return sortTargets(targets, sort);
}

export function sortTargets(targets: readonly TableTarget[], sort: TargetSort): TableTarget[] {
  const soonest = (a: TableTarget, b: TableTarget) => a.wait - b.wait || a.draw - b.draw || a.players - b.players;
  const best = (a: TableTarget, b: TableTarget) => RANK.get(b.rune)! - RANK.get(a.rune)! || Number(a.needsLock) - Number(b.needsLock);
  return [...targets].sort(sort === "best" ? (a, b) => best(a, b) || soonest(a, b) : (a, b) => soonest(a, b) || best(a, b));
}
