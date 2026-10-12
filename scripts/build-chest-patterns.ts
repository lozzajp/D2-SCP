import { readFileSync, writeFileSync } from "node:fs";
import { encodeChestPatterns, type SeedPattern } from "../src/chest/patterns.ts";

const AREAS = [
  { area: 79, out: "lk" },
  { area: 107, out: "rof" },
];
const PLAYERS = [1, 3, 5, 7];
const TABLES = AREAS.flatMap(({ area, out }) =>
  PLAYERS.map((players) => ({ source: `superchest_area${area}_hell_p${players}`, out: `${out}_hell_p${players}` })),
);
const [sourceDir = ".."] = process.argv.slice(2);

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

for (const { source, out } of TABLES) {
  const locked = readCycles(`${sourceDir}/${source}_locked.csv`);
  const unlocked = readCycles(`${sourceDir}/${source}_unlocked.csv`);
  if (locked.length !== 65534 || unlocked.length !== 65534) throw new Error(`${source}: expected 65534 seeds in each file.`);

  const patterns: SeedPattern[] = locked.map((cycles, s) => {
    const open = unlocked[s];
    const prefix = open.length <= cycles.length && open.every((cycle, c) => cycle.join() === cycles[c].join());
    if (!prefix || cycles.length - open.length > 1) throw new Error(`${source} seed ${s + 1}: unlocked drop is not the locked drop minus one cycle.`);
    return { unlockedCycles: open.length, cycles };
  });

  const bytes = encodeChestPatterns(patterns);
  writeFileSync(new URL(`../src/data/${out}.bin`, import.meta.url), bytes);
  console.log(`${out}: wrote ${bytes.length.toLocaleString()} bytes for ${patterns.length} seeds.`);
}
