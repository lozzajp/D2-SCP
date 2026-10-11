import { MULTIPLIER, Rng } from "../rng/rng";
import { jump } from "../rng/lcg";

const TWO_POW_32 = 0x1_0000_0000;

export class SeedWalker {
  lo: number;
  hi: number;
  readonly stepLo: number;
  readonly stepHi: number;

  constructor(seed: number, draws: number) {
    const state = jump(Rng.fromSeed(seed), draws);
    const step = jump(new Rng(1, 0), draws);
    this.lo = state.lo;
    this.hi = state.hi;
    this.stepLo = step.lo;
    this.stepHi = step.hi;
  }

  next(): void {
    let lo = this.lo + this.stepLo;
    let hi = this.hi + this.stepHi;
    if (lo >= TWO_POW_32) {
      lo -= TWO_POW_32;
      hi += 1;
    }
    if (hi > MULTIPLIER - 1 || (hi === MULTIPLIER - 1 && lo === TWO_POW_32 - 1)) {
      hi -= MULTIPLIER;
      lo += 1;
      if (lo === TWO_POW_32) {
        lo = 0;
        hi += 1;
      }
    }
    this.lo = lo;
    this.hi = hi;
  }
}
