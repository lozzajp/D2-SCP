import { canMoveTo, type Board } from "./board";
import { boardItemType } from "./boardItems";
import { GRID_COLUMNS, GRID_ROWS } from "../../gamble/layout";
import { el } from "../../ui/dom";
import { renderWindowGrid } from "./windowGrid";

const DRAG_THRESHOLD_PX = 5;

export function renderBoardEditor(
  board: Board,
  cellSize: number,
  isOffered: (item: number) => boolean,
  onChange: (removed: boolean) => void,
): HTMLElement {
  const tiles = board.map(({ item, x, y }) => ({
    item,
    x,
    y,
    className: isOffered(item) ? "editable" : "editable unavailable",
    title: isOffered(item) ? boardItemType(item).name : `${boardItemType(item).name}: can't appear with the current setup`,
  }));
  const { grid, tileElements } = renderWindowGrid(tiles, cellSize);

  tileElements.forEach((tile, index) => {
    const remove = el("button", {
      type: "button",
      className: "tile-remove",
      textContent: "×",
      title: "Remove",
      onclick: () => {
        board.splice(index, 1);
        onChange(true);
      },
    });
    remove.addEventListener("pointerdown", (event) => event.stopPropagation());
    tile.append(remove);

    makeDraggable(tile, grid, board[index].item, cellSize, (x, y) => {
      if (canMoveTo(board, index, x, y)) {
        board[index].x = x;
        board[index].y = y;
      }
      onChange(false);
    });
  });
  return grid;
}

function makeDraggable(
  tile: HTMLElement,
  grid: HTMLElement,
  item: number,
  cellSize: number,
  onDrop: (x: number, y: number) => void,
): void {
  const { width, height } = boardItemType(item);

  tile.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    down.preventDefault();
    tile.setPointerCapture(down.pointerId);

    const box = tile.getBoundingClientRect();
    const grabX = clamp(Math.floor((down.clientX - box.left) / cellSize), 0, width - 1);
    const grabY = clamp(Math.floor((down.clientY - box.top) / cellSize), 0, height - 1);
    let dragging = false;

    const move = (event: PointerEvent) => {
      const dx = event.clientX - down.clientX;
      const dy = event.clientY - down.clientY;
      if (!dragging && dx * dx + dy * dy > DRAG_THRESHOLD_PX ** 2) {
        dragging = true;
        tile.classList.add("dragging");
      }
      if (dragging) tile.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const end = (event: PointerEvent) => {
      tile.removeEventListener("pointermove", move);
      tile.removeEventListener("pointerup", end);
      tile.removeEventListener("pointercancel", end);
      tile.classList.remove("dragging");
      tile.style.transform = "";
      if (!dragging || event.type === "pointercancel") return;

      const gridBox = grid.getBoundingClientRect();
      const column = Math.floor((event.clientX - gridBox.left - grid.clientLeft) / cellSize);
      const row = Math.floor((event.clientY - gridBox.top - grid.clientTop) / cellSize);
      onDrop(clamp(column - grabX, 0, GRID_COLUMNS - width), clamp(row - grabY, 0, GRID_ROWS - height));
    };

    tile.addEventListener("pointermove", move);
    tile.addEventListener("pointerup", end);
    tile.addEventListener("pointercancel", end);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
