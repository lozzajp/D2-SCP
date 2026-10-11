import chestDropsCsv from "./chest_drops.csv?raw";
import { parseCsv } from "./csv";

export type DropCategory = "misc" | "potion" | "gem" | "rune" | "jewelry" | "weapon" | "armor";

export interface ChestDrop {
  name: string;
  category: DropCategory;
}

export const CHEST_DROPS: readonly ChestDrop[] = parseCsv(chestDropsCsv).map((row) => ({
  name: row.name,
  category: row.category as DropCategory,
}));

const DROP_NAMES = new Set(CHEST_DROPS.map((drop) => drop.name));

export function isChestDrop(name: string): boolean {
  return DROP_NAMES.has(name);
}
