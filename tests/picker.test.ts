import { describe, expect, it } from "vitest";
import { matches, preferredIndex } from "../src/ui/picker";

const find = (text: string, names: readonly string[]) =>
  names.filter((name) => matches(text, name.toLowerCase()));

const DEMOTED = new Set(["Ring", "Amulet", "Heavy Belt", "Belt"]);
const preferred = (text: string, names: readonly string[]) => {
  const candidates = find(text, names).map((name) => {
    const lower = name.toLowerCase();
    return { label: name, name: lower, words: lower.split(/[\s-]+/), demoted: DEMOTED.has(name) };
  });
  return candidates[preferredIndex(text, candidates)]?.label;
};

describe("picker preselect", () => {
  const names = ["Ring", "Amulet", "Heavy Belt", "Belt", "Heavy Boots", "Ring Mail", "Light Gauntlets", "Gauntlets", "Short Sword"];

  it("prefers anything over rings, amulets and belts", () => {
    for (const text of ["ri", "rin", "ring"]) expect(preferred(text, names)).toBe("Ring Mail");
    expect(preferred("heavy b", names)).toBe("Heavy Boots");
    expect(preferred("bel", names)).toBe("Belt");
  });

  it("prefers word starts, then the shortest name", () => {
    expect(preferred("gaunt", names)).toBe("Gauntlets");
    expect(preferred("s", ["Glass", "Short Sword"])).toBe("Short Sword");
  });
});

describe("picker matches", () => {
  const names = ["Balanced Knife", "Balanced Axe", "Axe", "Short Sword", "Light Gauntlets", "Gauntlets"];

  it("finds text anywhere in the name", () => {
    expect(find("gaunt", names)).toEqual(["Light Gauntlets", "Gauntlets"]);
    expect(find("t sw", names)).toEqual(["Short Sword"]);
  });

  it("matches typed words to the start of the name's words, in order", () => {
    expect(find("balance knif", names)).toEqual(["Balanced Knife"]);
    expect(find("bal kni", names)).toEqual(["Balanced Knife"]);
    expect(find("bal axe", names)).toEqual(["Balanced Axe"]);
    expect(find("li ga", names)).toEqual(["Light Gauntlets"]);
    expect(find("kni bal", names)).toEqual([]);
    expect(find("al ni", names)).toEqual([]);
  });
});
