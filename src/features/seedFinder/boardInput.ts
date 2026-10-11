import { addToBoard, MAX_BOARD_ITEMS, MIN_SEARCH_ITEMS, nextFreeCell, nextSpot, searchBlocker, type Board } from "./board";
import { renderBoardEditor } from "./boardEditor";
import { createItemPicker } from "./itemPicker";
import { boardItemType, FAKE_ASS, pickableItems, searchedItems } from "./boardItems";
import { offeredItemTypes, type Setup } from "./state";
import { button, el } from "../../ui/dom";

const CELL_SIZE = 40;

export interface BoardInput {
  root: HTMLElement;
  focus(options?: FocusOptions): void;
}

export function renderBoardInput(board: Board, setup: Setup, onChange: (blocker: string | null) => void): BoardInput {
  const offered = offeredItemTypes(setup);
  const offeredSet = new Set(offered);

  const boardBox = el("div", { className: "board-box" });
  const caption = el("p", { className: "caption" });
  const note = el("p", { className: "note" });
  const clear = button(
    "Clear board",
    () => {
      board.length = 0;
      changed();
      picker.focus();
    },
    "small",
  );

  const picker = createItemPicker(
    pickableItems(offered),
    (item) => {
      const added = addToBoard(board, item);
      changed(added ? "" : `No room for ${boardItemType(item).name}: move or remove something first.`);
      return added;
    },
    (item) => {
      highlighted = item;
      showPreview();
    },
  );
  let highlighted: number | null = null;
  const preview = el("div", { className: "tile-preview" });

  function showPreview(): void {
    const spot = highlighted === null ? null : nextSpot(board, highlighted);
    preview.remove();
    if (!spot) return;
    const { width, height } = boardItemType(highlighted!);
    preview.style.setProperty("--x", String(spot.x));
    preview.style.setProperty("--y", String(spot.y));
    preview.style.setProperty("--w", String(width));
    preview.style.setProperty("--h", String(height));
    boardBox.firstElementChild?.append(preview);
  }

  function changed(notice = ""): void {
    boardBox.replaceChildren(
      renderBoardEditor(board, CELL_SIZE, (item) => offeredSet.has(item) || item === FAKE_ASS, (removed) => {
        changed();
        if (removed) picker.focus({ preventScroll: true });
      }),
    );
    const next = nextFreeCell(board);
    if (next) {
      const cell = el("div", { className: "next-cell", title: "Next square to fill" });
      cell.style.setProperty("--x", String(next.x));
      cell.style.setProperty("--y", String(next.y));
      boardBox.firstElementChild?.prepend(cell);
    }
    showPreview();

    const blocker = searchBlocker(board, offeredSet);
    const searched = searchedItems(board).length;
    caption.textContent =
      `${board.length}/${MAX_BOARD_ITEMS} items placed` + (searched < board.length ? `, ${searched} searched` : "");
    note.textContent =
      notice || blocker || "Ready to search. 6 or more items usually narrow it down to a single seed.";
    note.classList.toggle("warning", notice !== "" || (blocker !== null && searched >= MIN_SEARCH_ITEMS));
    clear.disabled = board.length === 0;
    picker.setDisabled(board.length >= MAX_BOARD_ITEMS, `The window holds at most ${MAX_BOARD_ITEMS} items`);
    onChange(blocker);
  }

  const root = el(
    "div",
    { className: "items-layout" },
    el("div", { className: "board-column" }, boardBox, caption, note, clear),
    picker.root,
  );
  changed();
  return { root, focus: (options) => picker.focus(options) };
}
