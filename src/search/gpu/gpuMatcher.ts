import { AMULET, CIRCLET, CORONET, ITEMS, RING } from "../../data/items";
import { cellOf } from "../../gamble/layout";
import type { GamblePool } from "../../gamble/pool";
import { shownBase } from "../../gamble/window";
import { validateObserved, type ObservedItem } from "../windowMatcher";
import shaderSource from "./windowMatcher.wgsl?raw";

// The DOM lib ships no WebGPU types and the project avoids extra dependencies, so the API is untyped here.
type Gpu = any;

const BUFFER = { MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80 } as const;
const MAP_READ = 0x1;

const WORKGROUP = 64;
const GROUPS_X = 4096;
const GROUPS_Y = 64;
export const GPU_CHUNK = WORKGROUP * GROUPS_X * GROUPS_Y; // 2^24 seeds per dispatch
const CHUNKS_PER_SYNC = 8;
const LEVEL_ROLLS = 10;
const STORE_SEED_COUNT = 2 ** 32;

export interface GpuScanResult {
  matches: number[];
  total: number;
  capped: boolean;
}

export async function gpuAdapterName(): Promise<string | null> {
  const gpu: Gpu = (navigator as Gpu).gpu;
  if (!gpu) return null;
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  const info = adapter.info ?? {};
  return [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" ") || "unknown GPU";
}

export class GpuWindowMatcher {
  private readonly device: Gpu;
  private readonly pipeline: Gpu;
  private readonly bindGroup: Gpu;
  private readonly chunkBuffer: Gpu;
  private readonly resultBuffer: Gpu;
  private readonly readBuffer: Gpu;
  private readonly owned: Gpu[];
  private readonly maxMatches: number;

  private constructor(device: Gpu, tables: Tables, maxMatches: number) {
    this.device = device;
    this.maxMatches = maxMatches;
    const storage = (data: Uint32Array) => {
      const buffer = device.createBuffer({ size: Math.max(16, data.byteLength), usage: BUFFER.STORAGE | BUFFER.COPY_DST });
      device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    };
    const pool = storage(tables.pool);
    const passes = storage(tables.passes);
    const itemInfo = storage(tables.itemInfo);
    const upgrade = storage(tables.upgrade);
    const config = storage(tables.config);
    const resultSize = (1 + maxMatches) * 4;
    this.resultBuffer = device.createBuffer({ size: resultSize, usage: BUFFER.STORAGE | BUFFER.COPY_SRC | BUFFER.COPY_DST });
    this.readBuffer = device.createBuffer({ size: resultSize, usage: BUFFER.MAP_READ | BUFFER.COPY_DST });
    this.chunkBuffer = device.createBuffer({ size: 16, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
    this.owned = [pool, passes, itemInfo, upgrade, config, this.resultBuffer, this.readBuffer, this.chunkBuffer];

    const module = device.createShaderModule({ code: shaderSource });
    this.pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [this.chunkBuffer, pool, passes, itemInfo, upgrade, config, this.resultBuffer].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
  }

  static async create(
    charLevel: number,
    pool: GamblePool,
    observed: readonly ObservedItem[],
    maxMatches = 400,
  ): Promise<GpuWindowMatcher> {
    const gpu: Gpu = (navigator as Gpu).gpu;
    if (!gpu) throw new Error("WebGPU isn't available in this browser.");
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter.");
    const device = await adapter.requestDevice();
    const tables = buildTables(charLevel, pool, observed, maxMatches);
    device.pushErrorScope("validation");
    const matcher = new GpuWindowMatcher(device, tables, maxMatches);
    const error = await device.popErrorScope();
    if (error) {
      matcher.destroy();
      throw new Error(`WebGPU setup failed: ${error.message}`);
    }
    return matcher;
  }

  /**
   * Scans store seeds [start, end). Every few chunks it reads back what was found so far:
   * onBatch gets the seeds scanned since the last batch and any new matches, and may return true to stop early.
   */
  async scan(
    start = 0,
    end = STORE_SEED_COUNT,
    onBatch?: (seeds: number, newMatches: number[]) => boolean | void,
  ): Promise<GpuScanResult> {
    const { device } = this;
    device.queue.writeBuffer(this.resultBuffer, 0, new Uint32Array(1 + this.maxMatches));
    let words: Uint32Array = new Uint32Array(1);
    let reported = 0;
    let batchStart = start;
    for (let base = start; base < end; ) {
      for (let i = 0; i < CHUNKS_PER_SYNC && base < end; i++, base += GPU_CHUNK) {
        const count = Math.min(GPU_CHUNK, end - base);
        device.queue.writeBuffer(this.chunkBuffer, 0, new Uint32Array([base >>> 0, count, 0, 0]));
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(GROUPS_X, Math.ceil(count / (WORKGROUP * GROUPS_X)));
        pass.end();
        device.queue.submit([encoder.finish()]);
      }
      const scannedTo = Math.min(base, end);
      words = await this.readResults();
      const found = Math.min(words[0], this.maxMatches);
      const fresh = Array.from(words.subarray(1 + reported, 1 + found));
      reported = found;
      const stop = onBatch?.(scannedTo - batchStart, fresh);
      batchStart = scannedTo;
      if (stop) break;
    }

    const total = words[0];
    const matches = Array.from(words.subarray(1, 1 + Math.min(total, this.maxMatches))).sort((a, b) => a - b);
    return { matches, total, capped: total > this.maxMatches };
  }

  private async readResults(): Promise<Uint32Array> {
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.resultBuffer, 0, this.readBuffer, 0, this.readBuffer.size);
    this.device.queue.submit([encoder.finish()]);
    await this.readBuffer.mapAsync(MAP_READ);
    const words = new Uint32Array(this.readBuffer.getMappedRange().slice(0));
    this.readBuffer.unmap();
    return words;
  }

  destroy(): void {
    for (const buffer of this.owned) buffer.destroy();
    this.device.destroy();
  }
}

interface Tables {
  pool: Uint32Array;
  passes: Uint32Array;
  itemInfo: Uint32Array;
  upgrade: Uint32Array;
  config: Uint32Array;
}

// Mirrors the WindowMatcher constructor's tables, packed for the shader.
function buildTables(charLevel: number, pool: GamblePool, observed: readonly ObservedItem[], maxMatches: number): Tables {
  validateObserved(observed);
  const topLeft = observed.find((o) => o.x === 0 && o.y === 0)!;
  const isTall = (item: number) => ITEMS[item].height > 1;

  const passes = Uint32Array.from(pool.items, (item) => {
    const mayBecomeCoronet = item === CIRCLET || item === CORONET;
    return isTall(item) && !mayBecomeCoronet && item !== topLeft.item ? 0 : 1;
  });
  const itemInfo = Uint32Array.from(ITEMS, (item) => (item.height > 1 ? 1 : 0) | (item.width << 8) | (item.height << 16));

  const upgrade = new Uint32Array(LEVEL_ROLLS * ITEMS.length * 4);
  const config = new Uint32Array(16 + observed.length * 2);
  for (let roll = 0; roll < LEVEL_ROLLS; roll++) {
    const itemLevel = Math.max(5, Math.min(99, charLevel - 5 + roll));
    config[roll] = pool.countUpToLevel[itemLevel];
    for (const { index, uber, ultra } of ITEMS) {
      const at = (roll * ITEMS.length + index) * 4;
      if (uber >= 0) {
        upgrade[at] = Math.max(0, (itemLevel - ITEMS[uber].level) * 90 + 1);
        upgrade[at + 2] = shownBase(index, uber);
      }
      if (ultra >= 0) {
        upgrade[at + 1] = Math.max(0, (itemLevel - ITEMS[ultra].level) * 33 + 1);
        upgrade[at + 3] = shownBase(index, ultra);
      }
    }
  }
  config[10] = topLeft.item;
  config[11] = RING;
  config[12] = AMULET;
  config[13] = ITEMS.length;
  config[14] = maxMatches;
  config[15] = observed.length;
  observed.forEach((o, i) => {
    config[16 + i * 2] = o.item;
    config[17 + i * 2] = cellOf(o.x, o.y);
  });

  return { pool: Uint32Array.from(pool.items), passes, itemInfo, upgrade, config };
}
