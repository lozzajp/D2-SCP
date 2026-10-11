export function formatSeed(seed: number): string {
  return String(seed >>> 0);
}

export function parseSeed(text: string): number | null {
  const digits = text.replace(/[\s,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return value < 2 ** 32 ? value : null;
}

export function formatCount(count: number): string {
  if (count >= 1e9) return `${(count / 1e9).toFixed(2)}B`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(0)}k`;
  return count.toFixed(0);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}

export function waitTenths(seconds: number): number {
  return Math.max(0, Math.ceil(seconds * 10 - 1e-6));
}

export function formatWait(seconds: number): string {
  const tenths = waitTenths(seconds);
  const whole = Math.floor(tenths / 10);
  const part = `${whole % 60}.${tenths % 10}s`;
  return whole < 60 ? part : `${Math.floor(whole / 60)}m ${part.padStart(5, "0")}`;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
