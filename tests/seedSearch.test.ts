import { describe, expect, it } from "vitest";
import { gamblePool } from "../src/gamble/pool";
import { generateWindow } from "../src/gamble/window";
import { Rng } from "../src/rng/rng";
import type { SearchParams, WorkerRequest, WorkerResponse } from "../src/search/protocol";
import { createSearchHandler, PROGRESS_INTERVAL } from "../src/search/searchHandler";
import {
  SeedSearch,
  type SearchOptions,
  type SearchOutcome,
  type SearchWorkerFactory,
} from "../src/search/seedSearch";
import { WindowMatcher, type ObservedItem } from "../src/search/windowMatcher";

const CHAR_LEVEL = 70;
const POOL = gamblePool("msvc", false);

function observeWindow(seed: number, extra: number): ObservedItem[] {
  const placed = generateWindow(Rng.fromSeed(seed), CHAR_LEVEL, POOL)
    .slice(2)
    .filter((item) => item.x >= 0);
  const topLeft = placed.find((item) => item.x === 0 && item.y === 0)!;
  const others = placed.filter((item) => item !== topLeft).slice(0, extra);
  return [topLeft, ...others].map(({ base, x, y }) => ({ item: base, x, y }));
}

function findObservableSeed(): number {
  for (let seed = 700_001; ; seed++) {
    const window = generateWindow(Rng.fromSeed(seed), CHAR_LEVEL, POOL);
    if (window.some((item) => item.x === 0 && item.y === 0)) return seed;
  }
}

const SEED = findObservableSeed();

function params(observed: ObservedItem[]): SearchParams {
  return { charLevel: CHAR_LEVEL, poolOrder: "msvc", rowPool: false, observed };
}

function inProcessWorkers(log: WorkerRequest[] = []): SearchWorkerFactory & { terminated: () => number } {
  let terminated = 0;
  const factory: SearchWorkerFactory = (onResponse) => {
    let alive = true;
    const handle = createSearchHandler((response) => queueMicrotask(() => alive && onResponse(response)));
    return {
      postMessage(request) {
        log.push(request);
        setTimeout(() => alive && handle(request));
      },
      terminate() {
        if (alive) terminated++;
        alive = false;
      },
    };
  };
  return Object.assign(factory, { terminated: () => terminated });
}

interface Ended {
  search: SeedSearch;
  outcome: SearchOutcome;
  error?: string;
  endCalls: () => number;
  progressCalls: () => number;
}

function runSearch(searchParams: SearchParams, options: SearchOptions, onProgress?: (search: SeedSearch) => void) {
  return new Promise<Ended>((resolve) => {
    let endCalls = 0;
    let progressCalls = 0;
    const search: SeedSearch = new SeedSearch(
      searchParams,
      {
        onProgress() {
          progressCalls++;
          onProgress?.(search);
        },
        onEnd(outcome, error) {
          endCalls++;
          resolve({ search, outcome, error, endCalls: () => endCalls, progressCalls: () => progressCalls });
        },
      },
      options,
    );
    search.start();
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("SeedSearch", () => {
  const seedCount = 2 ** 20 + 12345;
  const chunkSize = 2 ** 17;

  it("finds the same seeds as a direct scan, sorted, with every seed tested once", async () => {
    const observed = observeWindow(SEED, 1);
    const expected: number[] = [];
    new WindowMatcher(CHAR_LEVEL, POOL, observed).scan(0, seedCount, (seed) => expected.push(seed));
    expect(expected).toContain(SEED);
    expect(expected.length).toBeGreaterThan(3);

    const log: WorkerRequest[] = [];
    const workers = inProcessWorkers(log);
    const ended = await runSearch(params(observed), {
      threads: 3,
      seedCount,
      chunkSize,
      maxMatches: 1_000_000,
      createWorker: workers,
    });

    expect(ended.outcome).toBe("complete");
    expect(ended.search.outcome).toBe("complete");
    expect(ended.search.matches).toEqual(expected);
    expect(ended.search.seedsTested).toBe(seedCount);
    expect(workers.terminated()).toBe(3);

    const scans = log.flatMap((request) => (request.type === "scan" ? [request] : [])).sort((a, b) => a.start - b.start);
    expect(scans.length).toBe(Math.ceil(seedCount / chunkSize));
    scans.forEach((scan, i) => expect(scan.start).toBe(i === 0 ? 0 : scans[i - 1].end));
    expect(scans.at(-1)!.end).toBe(seedCount);

    await settle();
    expect(ended.endCalls()).toBe(1);
  });

  it("stops at the match cap", async () => {
    const ended = await runSearch(params(observeWindow(SEED, 0)), {
      threads: 2,
      seedCount,
      chunkSize,
      maxMatches: 5,
      createWorker: inProcessWorkers(),
    });
    expect(ended.outcome).toBe("capped");
    expect(ended.search.matches).toHaveLength(5);
    expect(ended.search.matches).toEqual([...ended.search.matches].sort((a, b) => a - b));
  });

  it("fails with the worker's message when the items are invalid", async () => {
    const ended = await runSearch(params([]), { threads: 2, seedCount, chunkSize, createWorker: inProcessWorkers() });
    expect(ended.outcome).toBe("failed");
    expect(ended.error).toMatch(/between 1 and 14 items/);
    await settle();
    expect(ended.endCalls()).toBe(1);
  });

  it("fails when a worker crashes", async () => {
    const crashing: SearchWorkerFactory = (_, onCrash) => {
      setTimeout(() => onCrash("boom"));
      return { postMessage() {}, terminate() {} };
    };
    const ended = await runSearch(params(observeWindow(SEED, 1)), { threads: 2, seedCount, createWorker: crashing });
    expect(ended.outcome).toBe("failed");
    expect(ended.error).toBe("boom");
    await settle();
    expect(ended.endCalls()).toBe(1);
  });

  it("can be cancelled, after which nothing changes", async () => {
    const workers = inProcessWorkers();
    const ended = await runSearch(
      params(observeWindow(SEED, 1)),
      { threads: 2, chunkSize: 2 ** 16, maxMatches: 1_000_000, createWorker: workers },
      (search) => search.seedsTested > 0 && search.cancel(),
    );
    expect(ended.outcome).toBe("cancelled");
    expect(workers.terminated()).toBe(2);

    const tested = ended.search.seedsTested;
    expect(tested).toBeGreaterThan(0);
    expect(tested).toBeLessThan(ended.search.seedCount);
    const progressCalls = ended.progressCalls();
    ended.search.cancel();
    await settle();
    expect(ended.search.seedsTested).toBe(tested);
    expect(ended.progressCalls()).toBe(progressCalls);
    expect(ended.endCalls()).toBe(1);
  });
});

describe("search worker handler", () => {
  it("scans in progress-sized pieces right up to the last seed", () => {
    const sent: WorkerResponse[] = [];
    const handle = createSearchHandler((response) => sent.push(response));
    const last = 2 ** 32 - 1;
    const pool = gamblePool("musl", true);
    const window = generateWindow(Rng.fromSeed(last), 60, pool).filter((item) => item.x >= 0);
    const observed = window.slice(0, 6).map(({ base, x, y }) => ({ item: base, x, y }));
    if (!observed.some((o) => o.x === 0 && o.y === 0)) throw new Error("test seed needs a top-left item");

    handle({ type: "init", params: { charLevel: 60, poolOrder: "musl", rowPool: true, observed } });
    handle({ type: "scan", start: 2 ** 32 - PROGRESS_INTERVAL - 1000, end: 2 ** 32 });

    expect(sent[0]).toEqual({ type: "ready" });
    expect(sent.at(-1)).toEqual({ type: "done" });
    expect(sent.flatMap((r) => (r.type === "progress" ? [r.seeds] : []))).toEqual([PROGRESS_INTERVAL, 1000]);
    expect(sent.flatMap((r) => (r.type === "match" ? [r.storeSeed] : []))).toContain(last);
  });

  it("reports a scan before init as an error", () => {
    const sent: WorkerResponse[] = [];
    createSearchHandler((response) => sent.push(response))({ type: "scan", start: 0, end: 10 });
    expect(sent).toEqual([{ type: "error", message: expect.stringMatching(/before init/) }]);
  });
});
