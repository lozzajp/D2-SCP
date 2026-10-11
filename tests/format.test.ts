import { describe, expect, it } from "vitest";
import { formatSeed, formatWait, parseSeed } from "../src/ui/format";

describe("formatSeed", () => {
  it("shows seeds as plain decimal numbers", () => {
    expect(formatSeed(664697567)).toBe("664697567");
    expect(formatSeed(0)).toBe("0");
    expect(formatSeed(-1)).toBe("4294967295");
  });
});

describe("formatWait", () => {
  it("shows waits to a tenth of a second, rounded up", () => {
    expect(formatWait(312.4)).toBe("5m 12.4s");
    expect(formatWait(122.37)).toBe("2m 02.4s");
    expect(formatWait(8.4)).toBe("8.4s");
    expect(formatWait(5.5)).toBe("5.5s");
    expect(formatWait(0)).toBe("0.0s");
  });
});

describe("parseSeed", () => {
  it("reads decimal seeds, ignoring spaces and commas", () => {
    expect(parseSeed("664697567")).toBe(664697567);
    expect(parseSeed(" 1,161,875,147 ")).toBe(1161875147);
    expect(parseSeed("0")).toBe(0);
    expect(parseSeed("4294967295")).toBe(4294967295);
  });

  it("rejects anything that isn't a whole number from 0 to 4294967295", () => {
    for (const text of ["", "  ", "abc", "0x279E7ADF", "12.5", "-1", "1e9", "4294967296"]) {
      expect(parseSeed(text), text).toBeNull();
    }
  });
});
