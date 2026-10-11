import { AMULET, CORONET, DIADEM, ITEMS, RING, TIARA } from "../data/items";
import type { Rng } from "../rng/rng";
import { GRID_COLUMNS, NO_CELL, WindowGrid } from "./layout";
import type { GamblePool } from "./pool";

export const WINDOW_SLOTS = 14;

export const Quality = { Magic: 4, Set: 5, Rare: 6, Unique: 7 } as const;
export type Quality = (typeof Quality)[keyof typeof Quality];

export type UpgradeTier = 0 | 1 | 2;

export interface GambleItem {
  base: number;
  upgraded: number;
  upgradeTier: UpgradeTier;
  quality: Quality;
  itemLevel: number;
  x: number;
  y: number;
}

export function generateWindow(rng: Rng, charLevel: number, pool: GamblePool): GambleItem[] {
  const items: GambleItem[] = [];
  for (let slot = 0; slot < WINDOW_SLOTS; slot++) {
    const itemLevel = rollItemLevel(rng, charLevel);
    let base = rollPoolItem(rng, pool, itemLevel);
    if (slot === 0) base = RING;
    if (slot === 1) base = AMULET;
    const upgraded = rollUpgrade(rng, base, itemLevel);
    base = shownBase(base, upgraded);
    const quality = qualityFromRoll(rng.nextBelow(100000), upgraded, itemLevel);
    items.push({ base, upgraded, upgradeTier: upgradeTier(base, upgraded), quality, itemLevel, x: -1, y: -1 });
  }
  layOutWindow(items);
  return items;
}

export function rollItemLevel(rng: Rng, charLevel: number): number {
  return Math.max(5, Math.min(99, charLevel - 5 + rng.nextBelow(10)));
}

export function rollPoolItem(rng: Rng, pool: GamblePool, itemLevel: number): number {
  const count = pool.countUpToLevel[itemLevel];
  if (count === 0) return pool.items[0];
  return pool.items[rng.nextBelow(count)];
}

export function rollUpgrade(rng: Rng, item: number, itemLevel: number): number {
  const { uber, ultra } = ITEMS[item];
  if (uber < 0) return item;
  const uberChance = (itemLevel - ITEMS[uber].level) * 90 + 1;
  if (uberChance <= 0) return item;
  if (rng.nextBelow(10000) < uberChance) return uber;

  if (ultra < 0) return item;
  const ultraChance = (itemLevel - ITEMS[ultra].level) * 33 + 1;
  if (ultraChance <= 0) return item;
  return rng.nextBelow(10000) < ultraChance ? ultra : item;
}

export function shownBase(base: number, upgraded: number): number {
  return upgraded === TIARA || upgraded === DIADEM ? CORONET : base;
}

export function qualityFromRoll(roll: number, item: number, itemLevel: number): Quality {
  if (roll >= 10150) return Quality.Magic;
  const { uniqueLevel, setLevel } = ITEMS[item];
  if (roll < 50 && uniqueLevel >= 0 && uniqueLevel <= itemLevel) return Quality.Unique;
  if (roll < 150 && setLevel >= 0 && setLevel <= itemLevel) return Quality.Set;
  return Quality.Rare;
}

function upgradeTier(base: number, upgraded: number): UpgradeTier {
  if (upgraded === base) return 0;
  return upgraded === ITEMS[base].uber ? 1 : 2;
}

export function layOutWindow(items: GambleItem[]): void {
  const grid = new WindowGrid();
  for (const item of items) {
    const { width, height } = ITEMS[item.base];
    const cell = grid.place(width, height);
    item.x = cell === NO_CELL ? -1 : cell % GRID_COLUMNS;
    item.y = cell === NO_CELL ? -1 : Math.floor(cell / GRID_COLUMNS);
  }
}
