import type { ChestAreaId } from "../chest/areas";
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

const RIVER_OF_FLAME_ONLY = new Set([
  "Jah Rune",
  "Cham Rune",
  "Champion Sword",
  "Conquest Sword",
  "Crusader Bow",
  "Feral Claws",
  "Grand Matron Bow",
  "Scourge",
  "Seraph Rod",
  "Winged Knife",
  "Balrog Skin",
  "Crusader Gauntlets",
  "Earth Spirit",
  "Hellforge Plate",
  "Troll Nest",
]);

const LOWER_KURAST_DROPS = CHEST_DROPS.filter((drop) => !RIVER_OF_FLAME_ONLY.has(drop.name));

export function chestDropsFor(area: ChestAreaId): readonly ChestDrop[] {
  return area === "riverOfFlame" ? CHEST_DROPS : LOWER_KURAST_DROPS;
}

export function isChestDrop(name: string): boolean {
  return DROP_NAMES.has(name);
}
