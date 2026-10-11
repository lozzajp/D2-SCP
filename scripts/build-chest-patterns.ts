import { readFileSync, writeFileSync } from "node:fs";
import { encodeChestPatterns, type SeedPattern } from "../src/chest/patterns.ts";

const [lockedPath = "../superchest_area79_hell_p7_locked.csv", unlockedPath = "../superchest_area79_hell_p7_unlocked.csv"] =
  process.argv.slice(2);
const outPath = new URL("../src/data/lk_hell_p7.bin", import.meta.url);

function readCycles(path: string): string[][][] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).slice(1);
  return lines.map((line, index) => {
    const match = /^(\d+),(\d+),"(.*)"$/.exec(line);
    if (!match || Number(match[1]) !== index + 1) throw new Error(`${path}: unexpected row ${index + 2}`);
    const cycles = match[3].split(" | ").map((cycle) => (cycle === "-" ? [] : cycle.split(", ")));
    if (cycles.length !== Number(match[2])) throw new Error(`${path}: cycle count mismatch on seed ${index + 1}`);
    return cycles;
  });
}

const locked = readCycles(lockedPath);
const unlocked = readCycles(unlockedPath);
if (locked.length !== 65534 || unlocked.length !== 65534) throw new Error("Expected 65534 seeds in each file.");

const patterns: SeedPattern[] = locked.map((cycles, s) => {
  const open = unlocked[s];
  const prefix = open.length <= cycles.length && open.every((cycle, c) => cycle.join() === cycles[c].join());
  if (!prefix || cycles.length - open.length > 1) throw new Error(`Seed ${s + 1}: unlocked drop is not the locked drop minus one cycle.`);
  return { unlockedCycles: open.length, cycles };
});

const bytes = encodeChestPatterns(patterns);
writeFileSync(outPath, bytes);
console.log(`Wrote ${bytes.length.toLocaleString()} bytes for ${patterns.length} seeds.`);
