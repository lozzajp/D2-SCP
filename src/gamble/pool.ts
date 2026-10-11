import { ITEMS } from "../data/items";
import { poolOrderItems, type PoolOrder } from "../data/poolOrders";

export interface GamblePool {
  items: readonly number[];
  countUpToLevel: readonly number[];
}

const cache = new Map<string, GamblePool>();

export function gamblePool(order: PoolOrder, rowPool: boolean): GamblePool {
  const key = `${order}/${rowPool}`;
  let pool = cache.get(key);
  if (!pool) {
    const items = poolOrderItems(order, rowPool ? "row" : "base");
    const countUpToLevel = Array.from(
      { length: 100 },
      (_, level) => items.filter((item) => ITEMS[item].level <= level).length,
    );
    pool = { items, countUpToLevel };
    cache.set(key, pool);
  }
  return pool;
}

export function poolItemTypes(pool: GamblePool): number[] {
  return [...new Set(pool.items)];
}
