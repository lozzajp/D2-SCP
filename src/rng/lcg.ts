import { MULTIPLIER, Rng } from "./rng";

export const TWO_POW_32 = 2n ** 32n;
export const MODULUS = BigInt(MULTIPLIER) * TWO_POW_32 - 1n;

export function stateToBigInt(rng: Rng): bigint {
  return BigInt(rng.hi) * TWO_POW_32 + BigInt(rng.lo);
}

export function rngFromBigInt(state: bigint): Rng {
  return new Rng(Number(state % TWO_POW_32), Number(state / TWO_POW_32));
}

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    exponent >>= 1n;
  }
  return result;
}

export function jump(rng: Rng, steps: number): Rng {
  const factor = steps >= 0 ? BigInt(MULTIPLIER) : TWO_POW_32;
  const multiplier = modPow(factor, BigInt(Math.abs(steps)), MODULUS);
  return rngFromBigInt((stateToBigInt(rng) * multiplier) % MODULUS);
}
