import type { PoolOrder } from "../data/poolOrders";
import type { ObservedItem } from "./windowMatcher";

export interface SearchParams {
  charLevel: number;
  poolOrder: PoolOrder;
  rowPool: boolean;
  observed: ObservedItem[];
}

export type WorkerRequest =
  | { type: "init"; params: SearchParams }
  | { type: "scan"; start: number; end: number };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; seeds: number }
  | { type: "match"; storeSeed: number }
  | { type: "done" }
  | { type: "error"; message: string };
