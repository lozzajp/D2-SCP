import { boardItemType } from "./boardItems";
import type { GambleItem } from "../../gamble/window";
import type { ObservedItem } from "../../search/windowMatcher";
import { el } from "../../ui/dom";
import { itemCategory } from "./itemStyle";

export interface Tile {
  item: number;
  x: number;
  y: number;
  title?: string;
  className?: string;
}

export function renderWindowGrid(tiles: readonly Tile[], cellSize: number): { grid: HTMLElement; tileElements: HTMLElement[] } {
  const grid = el("div", { className: "window-grid" });
  grid.style.setProperty("--cell", `${cellSize}px`);
  const tileElements = tiles.map((tile) => grid.appendChild(renderTile(tile)));
  return { grid, tileElements };
}

function renderTile(tile: Tile): HTMLElement {
  const type = boardItemType(tile.item);
  const narrow = type.width === 1 && type.height > 1;
  const element = el(
    "div",
    { className: ["tile", narrow && "narrow", tile.className].filter(Boolean).join(" "), title: tile.title ?? type.name },
    el("span", { className: "tile-name", textContent: type.name }),
  );
  element.style.setProperty("--x", String(tile.x));
  element.style.setProperty("--y", String(tile.y));
  element.style.setProperty("--w", String(type.width));
  element.style.setProperty("--h", String(type.height));
  element.dataset.category = itemCategory(tile.item);
  return element;
}

export function windowTiles(window: readonly GambleItem[], entered: readonly ObservedItem[] = []): Tile[] {
  return window
    .filter((item) => item.x >= 0)
    .map((item) => ({
      item: item.base,
      x: item.x,
      y: item.y,
      className: entered.some((e) => e.item === item.base && e.x === item.x && e.y === item.y) ? "entered" : "",
    }));
}
