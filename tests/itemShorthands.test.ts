import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items";
import { poolOrderItems, type PoolOrder } from "../src/data/poolOrders";
import { ITEM_SHORTHANDS } from "../src/features/seedFinder/itemShorthands";

const ORDERS: PoolOrder[] = ["msvc", "msvc-std", "gcc", "musl", "freebsd", "stable", "reverse", "ps5"];
const gambleNames = [
  ...new Set(ORDERS.flatMap((order) => ["base", "row"].flatMap((variant) => poolOrderItems(order, variant as "base" | "row")))),
].map((item) => ITEMS[item].name);
const allNames = [...gambleNames, "Fake Ass"];
const wordsOf = (name: string) => name.toLowerCase().split(/[\s-]+/);
const CHOSEN_OVERLAPS = new Set(["co", "gl", "gr", "pl"]);

describe("gamble item shorthands", () => {
  it("covers every multi-word gamble item, and only gamble items", () => {
    const names = Object.keys(ITEM_SHORTHANDS);
    expect(names.filter((name) => !allNames.includes(name))).toEqual([]);
    expect(allNames.filter((name) => wordsOf(name).length > 1 && !names.includes(name))).toEqual([]);
  });

  it("are unique", () => {
    const values = Object.values(ITEM_SHORTHANDS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("never steal what people type for another item, except chosen overlaps", () => {
    for (const [name, shorthand] of Object.entries(ITEM_SHORTHANDS)) {
      if (CHOSEN_OVERLAPS.has(shorthand)) continue;
      const clashes = allNames.filter((other) => other !== name && wordsOf(other).some((word) => word.startsWith(shorthand)));
      expect(clashes, `${name} (${shorthand})`).toEqual([]);
    }
  });
});
