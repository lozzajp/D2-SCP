import { parseCsv } from "./csv";
import { itemIndex } from "./items";
import poolOrdersCsv from "./pool_orders.csv?raw";

export type PoolOrder = "msvc" | "msvc-std" | "gcc" | "musl" | "freebsd" | "stable" | "reverse" | "ps5";
export type PoolVariant = "base" | "row";

const rows = parseCsv(poolOrdersCsv);

export function poolOrderItems(order: PoolOrder, variant: PoolVariant): number[] {
  const items = rows
    .filter((row) => row.order === order && row.variant === variant)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((row) => itemIndex(row.code));
  if (items.length === 0) throw new Error(`pool_orders.csv has no ${order}/${variant} pool`);
  return items;
}
