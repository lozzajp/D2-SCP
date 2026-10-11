import { parseCsv } from "./csv";
import itemsCsv from "./items.csv?raw";

export interface ItemType {
  index: number;
  code: string;
  name: string;
  level: number;
  width: number;
  height: number;
  uber: number;
  ultra: number;
  setLevel: number;
  uniqueLevel: number;
}

export const ITEMS: readonly ItemType[] = parseCsv(itemsCsv).map((row, i) => {
  if (Number(row.index) !== i) throw new Error(`items.csv: row ${i} has index ${row.index}`);
  return {
    index: i,
    code: row.code,
    name: row.name,
    level: Number(row.level),
    width: Number(row.invw),
    height: Number(row.invh),
    uber: Number(row.uber),
    ultra: Number(row.ultra),
    setLevel: Number(row.set_level),
    uniqueLevel: Number(row.unique_level),
  };
});

const indexByCode = new Map<string, number>();
for (const item of ITEMS) if (!indexByCode.has(item.code)) indexByCode.set(item.code, item.index);

export function itemIndex(code: string): number {
  const index = indexByCode.get(code);
  if (index === undefined) throw new Error(`Unknown item code "${code}"`);
  return index;
}

export const RING = itemIndex("rin");
export const AMULET = itemIndex("amu");
export const CIRCLET = itemIndex("ci0");
export const CORONET = itemIndex("ci1");
export const TIARA = itemIndex("ci2");
export const DIADEM = itemIndex("ci3");
