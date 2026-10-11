import type { ChestScore } from "./chestSeedMatcher";
import { OBJECT_STREAM_DRAWS, type GameType } from "../rng/gameSeed";
import { Rng } from "../rng/rng";

export const CHEST_SEED_COUNT = 65534;
export const MAX_CHEST_DRAWS = 1000;

export function chestSeedStream(gameSeed: number, gameType: GameType, draws = MAX_CHEST_DRAWS): Uint16Array {
  const objects = Rng.fromSeed(Rng.fromSeed(gameSeed).skip(OBJECT_STREAM_DRAWS[gameType]).lo);
  const seeds = new Uint16Array(draws);
  for (let i = 0; i < draws; i++) seeds[i] = objects.nextBelow(CHEST_SEED_COUNT) + 1;
  return seeds;
}

export interface DrawHit {
  draw: number;
  seed: number;
  score?: ChestScore;
  picked: boolean;
}

export function findChestDraws(
  stream: Uint16Array,
  candidates: readonly ChestScore[],
  picked: readonly number[],
  near = 0,
): DrawHit[] {
  const scores = new Map(candidates.map((score) => [score.seed, score]));
  const pickedSeeds = new Set(picked);
  const hits: DrawHit[] = [];
  stream.forEach((seed, index) => {
    if (pickedSeeds.has(seed) || scores.has(seed)) {
      hits.push({ draw: index + 1, seed, score: scores.get(seed), picked: pickedSeeds.has(seed) });
    }
  });
  const rank = (hit: DrawHit) => (hit.picked ? -1 : hit.score!.extra);
  return hits.sort((a, b) => rank(a) - rank(b) || Math.abs(a.draw - near) - Math.abs(b.draw - near) || a.draw - b.draw);
}
