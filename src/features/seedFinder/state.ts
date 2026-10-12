import { ITEMS } from "../../data/items";
import type { PoolOrder } from "../../data/poolOrders";
import { gamblePool, poolItemTypes } from "../../gamble/pool";
import {
  GAME_VERSIONS,
  gameVersion,
  PLATFORMS,
  platformPoolOrder,
  POOL_ORDERS,
  type GameVersionId,
  type PlatformId,
} from "../../gamble/settings";
import { generateWindow, type GambleItem } from "../../gamble/window";
import { Rng } from "../../rng/rng";
import type { SearchParams } from "../../search/protocol";
import { cleanBoard, type Board } from "./board";
import { searchedItems } from "./boardItems";

export interface Setup {
  version: GameVersionId;
  platform: PlatformId;
  poolOrderOverride: PoolOrder | null;
  charLevel: number;
}

export interface AppState {
  setup: Setup;
  board: Board;
}

const STORAGE_KEY = "d2lkscp-seed-finder";

export function hasSavedState(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

export function defaultState(): AppState {
  return {
    setup: { version: "row", platform: "pc", poolOrderOverride: null, charLevel: 92 },
    board: [],
  };
}

export function poolOrderOf(setup: Setup): PoolOrder {
  return setup.poolOrderOverride ?? platformPoolOrder(setup.platform);
}

export function firstWindowOf(storeSeed: number, setup: Setup): GambleItem[] {
  const pool = gamblePool(poolOrderOf(setup), gameVersion(setup.version).rowPool);
  return generateWindow(Rng.fromSeed(storeSeed), setup.charLevel, pool);
}

export function searchParamsOf(state: AppState): SearchParams {
  const { setup, board } = state;
  return {
    charLevel: setup.charLevel,
    poolOrder: poolOrderOf(setup),
    rowPool: gameVersion(setup.version).rowPool,
    observed: searchedItems(board).map(({ item, x, y }) => ({ item, x, y })),
  };
}

export function offeredItemTypes(setup: Setup): number[] {
  const pool = gamblePool(poolOrderOf(setup), gameVersion(setup.version).rowPool);
  const maxItemLevel = Math.max(5, Math.min(99, setup.charLevel + 4));
  return poolItemTypes(pool)
    .filter((item) => ITEMS[item].level <= maxItemLevel)
    .sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name));
}

export function loadState(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): AppState {
  const state = defaultState();
  let saved: { setup?: Partial<Record<keyof Setup, unknown>>; board?: unknown };
  try {
    saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return state;
  }

  const setup = saved.setup ?? {};
  const s = state.setup;
  s.version = oneOf(setup.version, GAME_VERSIONS.map((v) => v.id), s.version);
  s.platform = oneOf(setup.platform, PLATFORMS.map((p) => p.id), s.platform);
  s.poolOrderOverride = oneOf(setup.poolOrderOverride, [null, ...POOL_ORDERS.map((o) => o.id)], null);
  const level = setup.charLevel;
  if (typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 99) s.charLevel = level;
  state.board = cleanBoard(saved.board);
  return state;
}

export function saveState(state: AppState, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
