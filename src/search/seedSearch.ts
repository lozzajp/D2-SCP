import type { SearchParams, WorkerRequest, WorkerResponse } from "./protocol";

export const STORE_SEED_COUNT = 2 ** 32;
const CHUNK_SIZE = 2 ** 24;
export const MAX_MATCHES = 400;
const MAX_THREADS = 16;

export type SearchOutcome = "complete" | "capped" | "cancelled" | "failed";

export interface SearchWorker {
  postMessage(request: WorkerRequest): void;
  terminate(): void;
}

export type SearchWorkerFactory = (
  onResponse: (response: WorkerResponse) => void,
  onCrash: (message: string) => void,
) => SearchWorker;

export interface SearchListener {
  onProgress(): void;
  onEnd(outcome: SearchOutcome, error?: string): void;
}

export interface SearchOptions {
  threads?: number;
  seedCount?: number;
  chunkSize?: number;
  maxMatches?: number;
  createWorker?: SearchWorkerFactory;
}

export class SeedSearch {
  readonly matches: number[] = [];
  seedsTested = 0;
  outcome: SearchOutcome | null = null;
  readonly threads: number;
  readonly seedCount: number;

  private readonly params: SearchParams;
  private readonly listener: SearchListener;
  private readonly chunkSize: number;
  private readonly maxMatches: number;
  private readonly createWorker: SearchWorkerFactory;
  private readonly workers: SearchWorker[] = [];
  private nextChunkStart = 0;
  private busyWorkers = 0;

  constructor(params: SearchParams, listener: SearchListener, options: SearchOptions = {}) {
    this.params = params;
    this.listener = listener;
    this.threads = options.threads ?? defaultThreadCount();
    this.seedCount = options.seedCount ?? STORE_SEED_COUNT;
    this.chunkSize = options.chunkSize ?? CHUNK_SIZE;
    this.maxMatches = options.maxMatches ?? MAX_MATCHES;
    this.createWorker = options.createWorker ?? createWebWorker;
  }

  start(): void {
    for (let i = 0; i < this.threads; i++) {
      const worker = this.createWorker(
        (response) => this.handle(worker, response),
        (message) => this.finish("failed", message),
      );
      this.workers.push(worker);
      worker.postMessage({ type: "init", params: this.params });
    }
  }

  cancel(): void {
    this.finish("cancelled");
  }

  private handle(worker: SearchWorker, response: WorkerResponse): void {
    if (this.outcome) return;
    switch (response.type) {
      case "ready":
        this.assignChunk(worker);
        break;
      case "progress":
        this.seedsTested += response.seeds;
        this.listener.onProgress();
        break;
      case "match":
        this.matches.push(response.storeSeed);
        if (this.matches.length >= this.maxMatches) this.finish("capped");
        else this.listener.onProgress();
        break;
      case "done":
        this.busyWorkers--;
        this.assignChunk(worker);
        break;
      case "error":
        this.finish("failed", response.message);
        break;
    }
  }

  private assignChunk(worker: SearchWorker): void {
    if (this.nextChunkStart >= this.seedCount) {
      if (this.busyWorkers === 0) this.finish("complete");
      return;
    }
    const start = this.nextChunkStart;
    const end = Math.min(this.seedCount, start + this.chunkSize);
    this.nextChunkStart = end;
    this.busyWorkers++;
    worker.postMessage({ type: "scan", start, end });
  }

  private finish(outcome: SearchOutcome, error?: string): void {
    if (this.outcome) return;
    this.outcome = outcome;
    for (const worker of this.workers) worker.terminate();
    this.matches.sort((a, b) => a - b);
    this.listener.onEnd(outcome, error);
  }
}

function defaultThreadCount(): number {
  return Math.min(MAX_THREADS, Math.max(1, navigator.hardwareConcurrency || 4));
}

function createWebWorker(
  onResponse: (response: WorkerResponse) => void,
  onCrash: (message: string) => void,
): SearchWorker {
  const worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => onResponse(event.data);
  worker.onerror = (event) => {
    event.preventDefault();
    onCrash(event.message || "A search worker failed to start.");
  };
  return worker;
}
