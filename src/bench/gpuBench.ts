import { ITEMS } from "../data/items";
import type { PoolOrder } from "../data/poolOrders";
import { gamblePool, type GamblePool } from "../gamble/pool";
import { generateWindow } from "../gamble/window";
import { Rng } from "../rng/rng";
import { gpuAdapterName, GpuWindowMatcher } from "../search/gpu/gpuMatcher";
import { WindowMatcher, type ObservedItem } from "../search/windowMatcher";

const CHECK_SEEDS = 2 ** 22;
const STORE_SEED_COUNT = 2 ** 32;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = $("log");
const progress = $("progress");
const runButton = $<HTMLButtonElement>("run");

function line(text: string, className = ""): void {
  const span = document.createElement("div");
  span.textContent = text;
  if (className) span.className = className;
  log.append(span);
}

function randomU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** A random store seed whose window has a tall top-left item, plus `count` observed items from it. */
function observeRandomWindow(charLevel: number, pool: GamblePool, count: number): { seed: number; observed: ObservedItem[] } {
  for (;;) {
    const seed = randomU32();
    const window = generateWindow(Rng.fromSeed(seed), charLevel, pool).filter((item) => item.x >= 0);
    const topLeft = window.find((item) => item.x === 0 && item.y === 0);
    if (!topLeft || ITEMS[topLeft.base].height < 2) continue;
    const others = window.filter((item) => item !== topLeft);
    const observed: ObservedItem[] = [{ item: topLeft.base, x: 0, y: 0 }];
    while (observed.length < count && others.length > 0) {
      const [item] = others.splice(randomU32() % others.length, 1);
      observed.push({ item: item.base, x: item.x, y: item.y });
    }
    return { seed, observed };
  }
}

const rate = (seeds: number, ms: number) => `${((seeds / ms) * 1e3 / 1e6).toFixed(1)}M seeds/s`;
const sameSeeds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((seed, i) => seed === b[i]);

async function bench(): Promise<void> {
  log.replaceChildren();
  progress.style.width = "0";
  const poolOrder = $<HTMLSelectElement>("order").value as PoolOrder;
  const rowPool = $<HTMLInputElement>("row").checked;
  const charLevel = Number($<HTMLInputElement>("level").value);
  const seen = Number($<HTMLInputElement>("seen").value);
  const pool = gamblePool(poolOrder, rowPool);

  const adapter = await gpuAdapterName();
  if (!adapter) {
    line("WebGPU is not available here. On iPhone it needs iOS 26 or later in Safari.", "bad");
    line(`isSecureContext: ${window.isSecureContext}`, "muted");
    return;
  }
  line(`GPU: ${adapter}`);
  line(`Threads (CPU): ${navigator.hardwareConcurrency || "?"}`, "muted");

  // 1. Correctness: a weak observation gives many matches; GPU and CPU must agree exactly.
  const weak = observeRandomWindow(charLevel, pool, 2);
  const start = Math.min(weak.seed, STORE_SEED_COUNT - CHECK_SEEDS);
  const end = start + CHECK_SEEDS;
  const cpuMatcher = new WindowMatcher(charLevel, pool, weak.observed);
  const cpuMatches: number[] = [];
  const cpuStart = performance.now();
  cpuMatcher.scan(start, end, (seed) => cpuMatches.push(seed));
  const cpuMs = performance.now() - cpuStart;

  const checkMatcher = await GpuWindowMatcher.create(charLevel, pool, weak.observed, 100_000);
  const gpuCheck = await checkMatcher.scan(start, end);
  checkMatcher.destroy();
  const agrees = !gpuCheck.capped && sameSeeds(cpuMatches, gpuCheck.matches);
  line(
    `Check on ${CHECK_SEEDS.toLocaleString()} seeds: CPU ${cpuMatches.length} matches, GPU ${gpuCheck.total} → ${agrees ? "identical" : "MISMATCH"}`,
    agrees ? "ok" : "bad",
  );
  line(`CPU single thread: ${rate(CHECK_SEEDS, cpuMs)}`, "muted");
  if (!agrees) {
    const missing = cpuMatches.filter((seed) => !gpuCheck.matches.includes(seed)).slice(0, 5);
    const extra = gpuCheck.matches.filter((seed) => !cpuMatches.includes(seed)).slice(0, 5);
    line(`missing on GPU: ${missing.join(", ") || "-"}; extra on GPU: ${extra.join(", ") || "-"}`, "bad");
    return;
  }

  // 2. Speed: the full 2^32 store seed space, as a real search would do it.
  const target = observeRandomWindow(charLevel, pool, seen);
  line(`Searching all 2^32 seeds for a window of ${target.observed.length} items (answer: ${target.seed})…`);
  const matcher = await GpuWindowMatcher.create(charLevel, pool, target.observed);
  const fullStart = performance.now();
  let done = 0;
  const result = await matcher.scan(0, STORE_SEED_COUNT, (seeds) => {
    done += seeds;
    progress.style.width = `${(done / STORE_SEED_COUNT) * 100}%`;
  });
  const fullMs = performance.now() - fullStart;
  matcher.destroy();

  const found = result.matches.includes(target.seed);
  line(`Full search: ${(fullMs / 1000).toFixed(1)} s, ${rate(STORE_SEED_COUNT, fullMs)}`, "ok");
  line(`${result.total} matching seed(s): ${result.matches.slice(0, 10).join(", ")}${found ? " ✓ includes the answer" : ""}`, found ? "ok" : "bad");
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  try {
    await bench();
  } catch (error) {
    line(error instanceof Error ? error.message : String(error), "bad");
  } finally {
    runButton.disabled = false;
  }
});
