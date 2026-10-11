import { ITEMS, itemIndex, type ItemType } from "../../data/items";
import type { ObservedItem } from "../../search/windowMatcher";

export const FAKE_ASS = -1;
const FAKE_ASS_TYPE: Pick<ItemType, "name" | "width" | "height"> = { name: "Fake Ass", width: 1, height: 3 };
const KATAR = itemIndex("ktr");

export function boardItemType(item: number): Pick<ItemType, "name" | "width" | "height"> {
  return item === FAKE_ASS ? FAKE_ASS_TYPE : ITEMS[item];
}

export function searchedItems(board: readonly ObservedItem[]): ObservedItem[] {
  return board.filter(({ item }) => item !== FAKE_ASS);
}

export function pickableItems(offered: readonly number[]): number[] {
  if (!offered.includes(KATAR)) return [...offered];
  return [...offered, FAKE_ASS].sort((a, b) => boardItemType(a).name.localeCompare(boardItemType(b).name));
}
