import { AMULET, CIRCLET, CORONET, ITEMS, RING } from "../data/items";
import { cellOf, GRID_COLUMNS, GRID_ROWS, WindowGrid } from "../gamble/layout";
import type { GamblePool } from "../gamble/pool";
import { shownBase, WINDOW_SLOTS } from "../gamble/window";
import { MULTIPLIER, Rng } from "../rng/rng";
import { SeedWalker } from "./seedWalker";

const HEAD_DRAWS = 6;
const LEVEL_ROLLS = 10;
const TWO_POW_32 = 0x1_0000_0000;
const ONE_OVER_TWO_POW_32 = 2 ** -32;

function nextLo(lo: number, hi: number): number {
  return (Math.imul(lo, MULTIPLIER) + hi) >>> 0;
}
function nextHi(lo: number, hi: number, newLo: number): number {
  return ((lo * MULTIPLIER + hi - newLo) * ONE_OVER_TWO_POW_32 + 0.5) | 0;
}
function slot2Pick(lo: number, hi: number, poolCountByRoll: Int32Array): number {
  const levelLo = nextLo(lo, hi);
  const levelHi = nextHi(lo, hi, levelLo);
  return nextLo(levelLo, levelHi) % poolCountByRoll[levelLo % LEVEL_ROLLS];
}

export interface ObservedItem {
  item: number;
  x: number;
  y: number;
}

export class WindowMatcher {
  private readonly pool: Int32Array;
  private readonly topLeftItem: number;
  private readonly observed: { item: number; cell: number }[];
  private readonly poolCountByRoll = new Int32Array(LEVEL_ROLLS);

  private readonly uberChance: Int32Array;
  private readonly ultraChance: Int32Array;
  private readonly shownIfUber: Int32Array;
  private readonly shownIfUltra: Int32Array;
  private readonly isTall: Uint8Array;

  private readonly passesBeforeTopLeft: Uint8Array;

  private readonly slots = new Int32Array(WINDOW_SLOTS);
  private readonly slotCells = new Int32Array(WINDOW_SLOTS);
  private readonly slotTaken = new Uint8Array(WINDOW_SLOTS);
  private readonly grid = new WindowGrid();

  constructor(charLevel: number, pool: GamblePool, observed: readonly ObservedItem[]) {
    validateObserved(observed);
    const topLeft = observed.find((o) => o.x === 0 && o.y === 0)!;
    this.pool = Int32Array.from(pool.items);
    this.topLeftItem = topLeft.item;
    this.observed = observed.map((o) => ({ item: o.item, cell: cellOf(o.x, o.y) }));

    this.isTall = new Uint8Array(ITEMS.length);
    for (const item of ITEMS) this.isTall[item.index] = item.height > 1 ? 1 : 0;

    this.passesBeforeTopLeft = new Uint8Array(pool.items.length);
    pool.items.forEach((item, position) => {
      const mayBecomeCoronet = item === CIRCLET || item === CORONET;
      const ruledOut = this.isTall[item] && !mayBecomeCoronet && item !== topLeft.item;
      this.passesBeforeTopLeft[position] = ruledOut ? 0 : 1;
    });

    const tableSize = LEVEL_ROLLS * ITEMS.length;
    this.uberChance = new Int32Array(tableSize);
    this.ultraChance = new Int32Array(tableSize);
    this.shownIfUber = new Int32Array(tableSize);
    this.shownIfUltra = new Int32Array(tableSize);
    for (let roll = 0; roll < LEVEL_ROLLS; roll++) {
      const itemLevel = Math.max(5, Math.min(99, charLevel - 5 + roll));
      this.poolCountByRoll[roll] = pool.countUpToLevel[itemLevel];
      for (const { index, uber, ultra } of ITEMS) {
        const at = roll * ITEMS.length + index;
        if (uber >= 0) {
          this.uberChance[at] = Math.max(0, (itemLevel - ITEMS[uber].level) * 90 + 1);
          this.shownIfUber[at] = shownBase(index, uber);
        }
        if (ultra >= 0) {
          this.ultraChance[at] = Math.max(0, (itemLevel - ITEMS[ultra].level) * 33 + 1);
          this.shownIfUltra[at] = shownBase(index, ultra);
        }
      }
    }

    this.slots[0] = RING;
    this.slots[1] = AMULET;
  }

  scan(start: number, end: number, onMatch: (storeSeed: number) => void): void {
    const { poolCountByRoll, passesBeforeTopLeft } = this;
    const walker = new SeedWalker(start, HEAD_DRAWS);
    const { stepLo, stepHi } = walker;
    let { lo, hi } = walker;
    let seed = start;

    for (; seed + 4 <= end; seed += 4) {
      const lo0 = lo, hi0 = hi;
      lo += stepLo; hi += stepHi;
      if (lo >= TWO_POW_32) { lo -= TWO_POW_32; hi += 1; }
      if (hi > MULTIPLIER - 1 || (hi === MULTIPLIER - 1 && lo === TWO_POW_32 - 1)) { hi -= MULTIPLIER; lo += 1; if (lo === TWO_POW_32) { lo = 0; hi += 1; } }
      const lo1 = lo, hi1 = hi;
      lo += stepLo; hi += stepHi;
      if (lo >= TWO_POW_32) { lo -= TWO_POW_32; hi += 1; }
      if (hi > MULTIPLIER - 1 || (hi === MULTIPLIER - 1 && lo === TWO_POW_32 - 1)) { hi -= MULTIPLIER; lo += 1; if (lo === TWO_POW_32) { lo = 0; hi += 1; } }
      const lo2 = lo, hi2 = hi;
      lo += stepLo; hi += stepHi;
      if (lo >= TWO_POW_32) { lo -= TWO_POW_32; hi += 1; }
      if (hi > MULTIPLIER - 1 || (hi === MULTIPLIER - 1 && lo === TWO_POW_32 - 1)) { hi -= MULTIPLIER; lo += 1; if (lo === TWO_POW_32) { lo = 0; hi += 1; } }
      const lo3 = lo, hi3 = hi;
      lo += stepLo; hi += stepHi;
      if (lo >= TWO_POW_32) { lo -= TWO_POW_32; hi += 1; }
      if (hi > MULTIPLIER - 1 || (hi === MULTIPLIER - 1 && lo === TWO_POW_32 - 1)) { hi -= MULTIPLIER; lo += 1; if (lo === TWO_POW_32) { lo = 0; hi += 1; } }

      const pass0 = passesBeforeTopLeft[slot2Pick(lo0, hi0, poolCountByRoll)];
      const pass1 = passesBeforeTopLeft[slot2Pick(lo1, hi1, poolCountByRoll)];
      const pass2 = passesBeforeTopLeft[slot2Pick(lo2, hi2, poolCountByRoll)];
      const pass3 = passesBeforeTopLeft[slot2Pick(lo3, hi3, poolCountByRoll)];
      if (pass0 && this.matchesAfterHead(lo0, hi0)) onMatch(seed);
      if (pass1 && this.matchesAfterHead(lo1, hi1)) onMatch(seed + 1);
      if (pass2 && this.matchesAfterHead(lo2, hi2)) onMatch(seed + 2);
      if (pass3 && this.matchesAfterHead(lo3, hi3)) onMatch(seed + 3);
    }

    walker.lo = lo;
    walker.hi = hi;
    for (; seed < end; seed++) {
      if (passesBeforeTopLeft[slot2Pick(walker.lo, walker.hi, poolCountByRoll)] && this.matchesAfterHead(walker.lo, walker.hi)) {
        onMatch(seed);
      }
      walker.next();
    }
  }

  matches(storeSeed: number): boolean {
    const head = Rng.fromSeed(storeSeed).skip(HEAD_DRAWS);
    return this.matchesAfterHead(head.lo, head.hi);
  }

  private matchesAfterHead(lo: number, hi: number): boolean {
    const { pool, poolCountByRoll, passesBeforeTopLeft, isTall, slots } = this;
    const { uberChance, ultraChance, shownIfUber, shownIfUltra } = this;
    let topLeftFound = false;
    let next = 0;

    for (let slot = 2; slot < WINDOW_SLOTS; slot++) {
      next = nextLo(lo, hi); hi = nextHi(lo, hi, next); lo = next;
      const levelRoll = lo % LEVEL_ROLLS;
      next = nextLo(lo, hi); hi = nextHi(lo, hi, next); lo = next;
      const pick = lo % poolCountByRoll[levelRoll];
      let item = pool[pick];
      if (!topLeftFound && !passesBeforeTopLeft[pick]) return false;

      const at = levelRoll * ITEMS.length + item;
      if (uberChance[at] > 0) {
        next = nextLo(lo, hi); hi = nextHi(lo, hi, next); lo = next;
        if (lo % 10000 < uberChance[at]) {
          item = shownIfUber[at];
        } else if (ultraChance[at] > 0) {
          next = nextLo(lo, hi); hi = nextHi(lo, hi, next); lo = next;
          if (lo % 10000 < ultraChance[at]) item = shownIfUltra[at];
        }
      }
      next = nextLo(lo, hi); hi = nextHi(lo, hi, next); lo = next;

      if (!topLeftFound && isTall[item]) {
        if (item !== this.topLeftItem) return false;
        topLeftFound = true;
      }
      slots[slot] = item;
    }
    return topLeftFound && this.containsAllObserved() && this.layoutMatches();
  }

  private containsAllObserved(): boolean {
    this.slotTaken.fill(0);
    for (const { item } of this.observed) {
      let slot = 0;
      while (slot < WINDOW_SLOTS && (this.slotTaken[slot] || this.slots[slot] !== item)) slot++;
      if (slot === WINDOW_SLOTS) return false;
      this.slotTaken[slot] = 1;
    }
    return true;
  }

  private layoutMatches(): boolean {
    this.grid.clear();
    for (let slot = 0; slot < WINDOW_SLOTS; slot++) {
      const { width, height } = ITEMS[this.slots[slot]];
      this.slotCells[slot] = this.grid.place(width, height);
    }
    for (const { item, cell } of this.observed) {
      const slot = this.slotCells.indexOf(cell);
      if (slot < 0 || this.slots[slot] !== item) return false;
    }
    return true;
  }
}

export function validateObserved(observed: readonly ObservedItem[]): void {
  if (observed.length === 0 || observed.length > WINDOW_SLOTS) {
    throw new Error(`Enter between 1 and ${WINDOW_SLOTS} items.`);
  }
  const cells = new Set<number>();
  for (const { item, x, y } of observed) {
    const type = ITEMS[item];
    if (!type) throw new Error(`Unknown item index ${item}.`);
    if (x < 0 || y < 0 || x + type.width > GRID_COLUMNS || y + type.height > GRID_ROWS) {
      throw new Error(`${type.name} at (${x},${y}) is outside the window.`);
    }
    if (cells.has(cellOf(x, y))) throw new Error(`Two items share the cell (${x},${y}).`);
    cells.add(cellOf(x, y));
  }
  const topLeft = observed.find((o) => o.x === 0 && o.y === 0);
  if (!topLeft) throw new Error("The item in the top-left corner (0,0) is needed: the search anchors on it.");
  if (ITEMS[topLeft.item].height < 2) {
    throw new Error("The top-left item is always 2+ cells high (1-high items are packed from the right).");
  }
}
