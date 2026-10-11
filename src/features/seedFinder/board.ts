import { boardItemType, FAKE_ASS, searchedItems } from "./boardItems";
import { GRID_COLUMNS, GRID_ROWS, NO_CELL, WindowGrid } from "../../gamble/layout";
import { WINDOW_SLOTS } from "../../gamble/window";
import { validateObserved, type ObservedItem } from "../../search/windowMatcher";

export type Board = ObservedItem[];

export const MAX_BOARD_ITEMS = WINDOW_SLOTS;
export const MIN_SEARCH_ITEMS = 5;

export function addToBoard(board: Board, item: number): boolean {
  const spot = nextSpot(board, item);
  if (!spot) return false;
  board.push({ item, ...spot });
  return true;
}

export function nextSpot(board: Board, item: number): { x: number; y: number } | null {
  if (board.length >= MAX_BOARD_ITEMS) return null;
  const { width, height } = boardItemType(item);
  const cell = occupiedGrid(board).place(width, height);
  if (cell === NO_CELL) return null;
  return { x: cell % GRID_COLUMNS, y: Math.floor(cell / GRID_COLUMNS) };
}

export function nextFreeCell(board: Board): { x: number; y: number } | null {
  const grid = occupiedGrid(board);
  for (let x = 0; x < GRID_COLUMNS; x++) {
    for (let y = 0; y < GRID_ROWS; y++) if (grid.isFree(x, y, 1, 2)) return { x, y };
  }
  return null;
}

export function canMoveTo(board: Board, index: number, x: number, y: number): boolean {
  const { width, height } = boardItemType(board[index].item);
  return occupiedGrid(board, index).isFree(x, y, width, height);
}

export function searchBlocker(board: Board, offeredItems: ReadonlySet<number>): string | null {
  const searched = searchedItems(board);
  const missing = MIN_SEARCH_ITEMS - searched.length;
  if (missing > 0) return `Place at least ${MIN_SEARCH_ITEMS} items, not counting Fake Ass (${missing} more to go).`;
  const unavailable = searched.find(({ item }) => !offeredItems.has(item));
  if (unavailable) {
    return `${boardItemType(unavailable.item).name} can't be in this window with the current setup (character level or game version).`;
  }
  if (board.some(({ item, x, y }) => item === FAKE_ASS && x === 0 && y === 0)) {
    return "The top-left item anchors the search, so it can't be a Fake Ass: identify it if you can.";
  }
  try {
    validateObserved(searched);
  } catch (error) {
    return (error as Error).message;
  }
  return null;
}

export function cleanBoard(entries: unknown): Board {
  if (!Array.isArray(entries)) return [];
  const board: Board = [];
  const grid = new WindowGrid();
  for (const entry of entries) {
    const { item, x, y } = (entry ?? {}) as Partial<ObservedItem>;
    if (!Number.isInteger(item) || !Number.isInteger(x) || !Number.isInteger(y)) continue;
    const type = boardItemType(item!);
    if (!type || board.length >= MAX_BOARD_ITEMS || !grid.isFree(x!, y!, type.width, type.height)) continue;
    grid.occupy(x!, y!, type.width, type.height);
    board.push({ item: item!, x: x!, y: y! });
  }
  return board;
}

function occupiedGrid(board: Board, skipIndex = -1): WindowGrid {
  const grid = new WindowGrid();
  board.forEach(({ item, x, y }, index) => {
    if (index !== skipIndex) grid.occupy(x, y, boardItemType(item).width, boardItemType(item).height);
  });
  return grid;
}
