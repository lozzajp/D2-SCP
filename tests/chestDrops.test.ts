import { describe, expect, it } from "vitest";
import { CHEST_DROPS, chestDropsFor, isChestDrop } from "../src/data/chestDrops";

describe("CHEST_DROPS", () => {
  it("lists every Hell LK and River of Flame chest drop once", () => {
    expect(CHEST_DROPS).toHaveLength(541);
    expect(new Set(CHEST_DROPS.map((drop) => drop.name)).size).toBe(CHEST_DROPS.length);
    expect(chestDropsFor("lowerKurast")).toHaveLength(526);
    expect(chestDropsFor("riverOfFlame")).toHaveLength(541);
  });

  it("has runes El to Cham in rune order, Jah and Cham only in River of Flame", () => {
    const runes = CHEST_DROPS.filter((drop) => drop.category === "rune").map((drop) => drop.name);
    expect(runes[0]).toBe("El Rune");
    expect(runes.at(-1)).toBe("Cham Rune");
    expect(isChestDrop("Zod Rune")).toBe(false);
    const lkRunes = chestDropsFor("lowerKurast").filter((drop) => drop.category === "rune");
    expect(lkRunes.at(-1)?.name).toBe("Ber Rune");
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
