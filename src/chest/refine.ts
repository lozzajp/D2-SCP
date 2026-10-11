export type RefineAdvice = "variance" | "distance" | "far" | "seed";

export function refineAdvice(offset: number): RefineAdvice {
  const off = Math.abs(offset);
  if (off <= 20) return "variance";
  if (off <= 50) return "distance";
  if (off < 1000) return "far";
  return "seed";
}
