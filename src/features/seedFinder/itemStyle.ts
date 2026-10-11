import { ITEMS } from "../../data/items";

export type ItemCategory = "weapon" | "helm" | "armor" | "shield" | "gloves" | "boots" | "belt" | "jewelry" | "placeholder";

const CATEGORY_CODES: Record<Exclude<ItemCategory, "weapon" | "placeholder">, string[]> = {
  jewelry: ["rin", "amu"],
  helm: ["cap", "skp", "hlm", "fhl", "ghm", "crn", "msk", "bhm", "ci0", "ci1", "ci2", "ci3"],
  armor: ["qui", "lea", "hla", "stu", "rng", "scl", "chn", "brs", "spl", "plt", "fld", "gth", "ful", "aar", "ltp"],
  shield: ["buc", "sml", "lrg", "kit", "tow", "gts", "bsh", "spk"],
  gloves: ["lgl", "vgl", "mgl", "tgl", "hgl"],
  boots: ["lbt", "vbt", "mbt", "tbt", "hbt"],
  belt: ["lbl", "vbl", "mbl", "tbl", "hbl"],
};

const categoryByCode = new Map<string, ItemCategory>();
for (const [category, codes] of Object.entries(CATEGORY_CODES)) {
  for (const code of codes) categoryByCode.set(code, category as ItemCategory);
}

const normalVersion = new Map<number, number>();
for (const item of ITEMS) {
  if (item.uber >= 0 && !normalVersion.has(item.uber)) normalVersion.set(item.uber, item.index);
  if (item.ultra >= 0 && !normalVersion.has(item.ultra)) normalVersion.set(item.ultra, item.index);
}

export function itemCategory(item: number): ItemCategory {
  if (item < 0) return "placeholder";
  const normal = normalVersion.get(item) ?? item;
  return categoryByCode.get(ITEMS[normal].code) ?? "weapon";
}
