import { describe, expect, it } from "vitest";
import { addToBoard, canMoveTo, cleanBoard, MAX_BOARD_ITEMS, searchBlocker, type Board } from "../src/features/seedFinder/board";
import { defaultState, loadState, offeredItemTypes, saveState, searchParamsOf, type AppState } from "../src/features/seedFinder/state";
import { FAKE_ASS, searchedItems } from "../src/features/seedFinder/boardItems";
import { AMULET, itemIndex, ITEMS, RING } from "../src/data/items";

const HELM = itemIndex("cap");
const BELT = itemIndex("lbl");
const TALL = ITEMS.findIndex((item) => item.width === 2 && item.height === 4);

describe("addToBoard", () => {
  it("places items the way the game packs the window", () => {
    const board: Board = [];
    for (const item of [HELM, HELM, RING, BELT, AMULET]) expect(addToBoard(board, item)).toBe(true);
    expect(board).toEqual([
      { item: HELM, x: 0, y: 0 },
      { item: HELM, x: 0, y: 2 },
      { item: RING, x: 9, y: 0 },
      { item: BELT, x: 8, y: 1 },
      { item: AMULET, x: 9, y: 2 },
    ]);
  });

  it("refuses items that don't fit", () => {
    const board: Board = [];
    for (let i = 0; i < 10; i++) expect(addToBoard(board, TALL)).toBe(true);
    expect(addToBoard(board, TALL)).toBe(false);
    expect(board).toHaveLength(10);
  });

  it("stops at the window's item limit", () => {
    const board: Board = [];
    for (let i = 0; i < MAX_BOARD_ITEMS; i++) expect(addToBoard(board, RING)).toBe(true);
    expect(addToBoard(board, RING)).toBe(false);
    expect(board).toHaveLength(MAX_BOARD_ITEMS);
  });
});

describe("canMoveTo", () => {
  const board: Board = [
    { item: HELM, x: 0, y: 0 },
    { item: HELM, x: 4, y: 4 },
  ];

  it("allows free cells, including ones the item itself covers", () => {
    expect(canMoveTo(board, 0, 2, 0)).toBe(true);
    expect(canMoveTo(board, 0, 1, 1)).toBe(true);
    expect(canMoveTo(board, 0, 8, 8)).toBe(true);
  });

  it("rejects overlaps and the window's edges", () => {
    expect(canMoveTo(board, 0, 3, 3)).toBe(false);
    expect(canMoveTo(board, 0, 5, 5)).toBe(false);
    expect(canMoveTo(board, 0, 9, 0)).toBe(false);
    expect(canMoveTo(board, 0, 0, 9)).toBe(false);
    expect(canMoveTo(board, 0, -1, 0)).toBe(false);
  });
});

describe("searchBlocker", () => {
  const offered = new Set(offeredItemTypes(defaultState().setup));
  const rings = (count: number, from = 0): Board =>
    Array.from({ length: count }, (_, i) => ({ item: RING, x: 9, y: from + i }));

  it("wants enough items", () => {
    expect(searchBlocker([{ item: HELM, x: 0, y: 0 }, ...rings(2)], offered)).toMatch(/2 more to go/);
  });

  it("wants a tall item in the top-left corner", () => {
    expect(searchBlocker(rings(6), offered)).toMatch(/top-left/i);
  });

  it("rejects items the setup can't offer", () => {
    const board = [{ item: HELM, x: 0, y: 0 }, ...rings(4)];
    const withoutHelms = new Set([...offered].filter((item) => item !== HELM));
    expect(searchBlocker(board, withoutHelms)).toMatch(new RegExp(ITEMS[HELM].name));
  });

  it("is happy with a searchable board", () => {
    expect(searchBlocker([{ item: HELM, x: 0, y: 0 }, ...rings(4)], offered)).toBeNull();
  });

  it("doesn't count Fake Ass placeholders, and won't anchor on one", () => {
    const fake = { item: FAKE_ASS, x: 2, y: 0 };
    expect(searchBlocker([{ item: HELM, x: 0, y: 0 }, fake, ...rings(3)], offered)).toMatch(/1 more to go/);
    expect(searchBlocker([{ item: HELM, x: 0, y: 0 }, fake, ...rings(4)], offered)).toBeNull();
    expect(searchBlocker([{ item: FAKE_ASS, x: 0, y: 0 }, ...rings(5)], offered)).toMatch(/Fake Ass/);
  });
});

describe("Fake Ass placeholder", () => {
  it("takes a claw's space, survives saving, and stays out of the search", () => {
    const board: Board = [];
    for (const item of [HELM, FAKE_ASS, HELM]) expect(addToBoard(board, item)).toBe(true);
    expect(board[1]).toEqual({ item: FAKE_ASS, x: 0, y: 2 });
    expect(board[2]).toEqual({ item: HELM, x: 0, y: 5 });
    expect(cleanBoard(board)).toEqual(board);
    const state: AppState = { ...defaultState(), board };
    expect(searchParamsOf(state).observed.map(({ item }) => item)).toEqual([HELM, HELM]);
    expect(searchedItems(board)).toHaveLength(2);
  });
});

describe("cleanBoard", () => {
  it("keeps valid entries and drops the rest", () => {
    const saved = [
      { item: HELM, x: 0, y: 0 },
      { item: HELM, x: 1, y: 1 },
      { item: RING, x: 10, y: 0 },
      { item: ITEMS.length, x: 5, y: 5 },
      { item: RING, x: 9.5, y: 0 },
      null,
      "ring",
      { item: RING, x: 9, y: 9 },
    ];
    expect(cleanBoard(saved)).toEqual([
      { item: HELM, x: 0, y: 0 },
      { item: RING, x: 9, y: 9 },
    ]);
  });

  it("returns an empty board for anything but an array", () => {
    expect(cleanBoard(undefined)).toEqual([]);
    expect(cleanBoard({ item: RING, x: 0, y: 0 })).toEqual([]);
  });
});

describe("saved state", () => {
  function memoryStorage(saved?: string) {
    const data = new Map<string, string>();
    if (saved !== undefined) data.set("d2lkscp-seed-finder", saved);
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  }

  it("starts from the defaults", () => {
    expect(loadState(memoryStorage())).toEqual(defaultState());
    expect(loadState(memoryStorage("not json"))).toEqual(defaultState());
    expect(loadState(memoryStorage("null"))).toEqual(defaultState());
    const denied = { getItem: (): string => { throw new Error("denied"); } };
    expect(loadState(denied)).toEqual(defaultState());
  });

  it("round-trips", () => {
    const state: AppState = {
      setup: { version: "d2r", platform: "switch", poolOrderOverride: "gcc", charLevel: 77 },
      board: [
        { item: HELM, x: 0, y: 0 },
        { item: RING, x: 9, y: 0 },
      ],
    };
    const storage = memoryStorage();
    saveState(state, storage);
    expect(loadState(storage)).toEqual(state);
  });

  it("replaces invalid values one by one", () => {
    const saved = {
      setup: { version: "d3", platform: "ps", poolOrderOverride: "bogus", charLevel: 120 },
      board: "nope",
    };
    const { setup, board } = loadState(memoryStorage(JSON.stringify(saved)));
    const defaults = defaultState().setup;
    expect(setup).toEqual({ ...defaults, platform: "ps" });
    expect(board).toEqual([]);
  });

  it("ignores storage that can't be written", () => {
    const full = { setItem: () => { throw new Error("quota"); } };
    expect(() => saveState(defaultState(), full)).not.toThrow();
  });
});

describe("offeredItemTypes", () => {
  it("offers only items the item level can reach, sorted by name", () => {
    const setup = { ...defaultState().setup, charLevel: 1 };
    const offered = offeredItemTypes(setup);
    expect(offered).toContain(RING);
    expect(offered).toContain(AMULET);
    for (const item of offered) expect(ITEMS[item].level).toBeLessThanOrEqual(5);
    const names = offered.map((item) => ITEMS[item].name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("offers more at higher levels, up to the whole pool", () => {
    const low = offeredItemTypes({ ...defaultState().setup, charLevel: 30 });
    const high = offeredItemTypes({ ...defaultState().setup, charLevel: 99 });
    expect(high.length).toBeGreaterThan(low.length);
    for (const item of low) expect(high).toContain(item);
  });
});
