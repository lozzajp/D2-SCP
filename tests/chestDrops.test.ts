import { describe, expect, it } from "vitest";
import { CHEST_DROPS, isChestDrop } from "../src/data/chestDrops";

describe("CHEST_DROPS", () => {
  it("lists every Hell LK chest drop once", () => {
    expect(CHEST_DROPS).toHaveLength(525);
    expect(new Set(CHEST_DROPS.map((drop) => drop.name)).size).toBe(CHEST_DROPS.length);
  });

  it("has runes El to Ber in rune order", () => {
    const runes = CHEST_DROPS.filter((drop) => drop.category === "rune").map((drop) => drop.name);
    expect(runes[0]).toBe("El Rune");
    expect(runes.at(-1)).toBe("Ber Rune");
    expect(isChestDrop("Zod Rune")).toBe(false);
  });

  it("categorises common drops", () => {
    const categoryOf = (name: string) => CHEST_DROPS.find((drop) => drop.name === name)?.category;
    expect(categoryOf("Gold")).toBe("misc");
    expect(categoryOf("Super Healing Potion")).toBe("potion");
    expect(categoryOf("Flawless Skull")).toBe("gem");
    expect(categoryOf("Grand Charm")).toBe("jewelry");
    expect(categoryOf("Kite Shield")).toBe("armor");
    expect(categoryOf("Long Sword")).toBe("weapon");
  });
});
