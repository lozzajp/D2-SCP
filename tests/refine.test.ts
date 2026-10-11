import { describe, expect, it } from "vitest";
import { refineAdvice } from "../src/chest/refine";

describe("refineAdvice", () => {
  it.each([
    [0, "variance"],
    [-20, "variance"],
    [21, "distance"],
    [-50, "distance"],
    [51, "far"],
    [-999, "far"],
    [1000, "seed"],
  ])("%s draws out is %s", (offset, advice) => {
    expect(refineAdvice(offset)).toBe(advice);
  });
});