import { MODULUS, TWO_POW_32, modPow } from "./lcg";
import { MULTIPLIER, Rng, SEED_CARRY } from "./rng";

export const STORE_SEED_DRAWS = { seedFlag: 4, normal: 4 } as const;
export const OBJECT_STREAM_DRAWS = { seedFlag: 2, normal: 3 } as const;

export type GameType = keyof typeof STORE_SEED_DRAWS;

export function storeSeedFromGameSeed(gameSeed: number, draws: number): number {
  return Rng.fromSeed(gameSeed).skip(draws).lo;
}

export function gameSeedsFromStoreSeed(storeSeed: number, draws: number): number[] {
  const back = modPow(TWO_POW_32, BigInt(draws), MODULUS);
  const perCarry = (back * TWO_POW_32) % MODULUS;
  const offset = (back * BigInt(storeSeed >>> 0)) % MODULUS;
  const freshLow = BigInt(SEED_CARRY) * TWO_POW_32;
  const freshHigh = freshLow + TWO_POW_32 - 1n;

  const seeds: number[] = [];
  for (const carry of solveLinearInRange(perCarry, offset, MODULUS, freshLow, freshHigh, BigInt(MULTIPLIER))) {
    const gameSeed = Number((perCarry * carry + offset) % MODULUS - freshLow);
    if (storeSeedFromGameSeed(gameSeed, draws) === storeSeed >>> 0) seeds.push(gameSeed);
  }
  return seeds.sort((a, b) => a - b);
}

export function solveLinearInRange(
  k: bigint,
  c: bigint,
  m: bigint,
  low: bigint,
  high: bigint,
  count: bigint,
): bigint[] {
  const solutions: bigint[] = [];
  let start = 0n;
  while (start < count) {
    const atStart = (k * start + c) % m;
    const from = mod(low - atStart, m);
    const to = mod(high - atStart, m);
    const d = from <= to ? smallestMultipleInRange(k, m, from, to) : 0n;
    if (d === null || start + d >= count) break;
    solutions.push(start + d);
    start += d + 1n;
  }
  return solutions;
}

export function smallestMultipleInRange(k: bigint, m: bigint, low: bigint, high: bigint): bigint | null {
  if (low === 0n) return 0n;
  k %= m;
  if (k === 0n) return null;

  const direct = ceilDiv(low, k);
  if (direct * k <= high) return direct;

  const wraps = smallestMultipleInRange(m % k, k, k - (high % k), k - (low % k));
  return wraps === null ? null : ceilDiv(low + m * wraps, k);
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}
