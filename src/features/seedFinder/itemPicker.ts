import { boardItemType } from "./boardItems";
import { createPicker, type Picker } from "../../ui/picker";
import { itemCategory } from "./itemStyle";

export function createItemPicker(
  items: readonly number[],
  onPick: (item: number) => boolean,
  onHighlight?: (item: number | null) => void,
): Picker {
  const entries = items.map((item) => {
    const { name, width, height } = boardItemType(item);
    const category = itemCategory(item);
    const demoted = category === "belt" || category === "jewelry";
    return { value: item, name, detail: `${width}×${height}`, category, demoted };
  });
  return createPicker(entries, onPick, undefined, onHighlight);
}
