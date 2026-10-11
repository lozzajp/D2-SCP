export const MULTIPLIER = 0x6ac690c5;
export const SEED_CARRY = 666;
const TWO_POW_32 = 0x1_0000_0000;

export class Rng {
  lo: number;
  hi: number;

  constructor(lo: number, hi: number) {
    this.lo = lo >>> 0;
    this.hi = hi >>> 0;
  }

  static fromSeed(seed: number): Rng {
    return new Rng(seed, SEED_CARRY);
  }

  clone(): Rng {
    return new Rng(this.lo, this.hi);
  }

  next(): number {
    const lo = this.lo;
    const hi = this.hi;
    this.lo = (Math.imul(lo, MULTIPLIER) + hi) >>> 0;
    this.hi = Math.round((lo * MULTIPLIER + hi - this.lo) / TWO_POW_32);
    return this.lo;
  }

  nextBelow(n: number): number {
    return this.next() % n;
  }

  skip(steps: number): this {
    for (let i = 0; i < steps; i++) this.next();
    return this;
  }
}
