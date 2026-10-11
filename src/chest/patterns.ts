const MAGIC = "LKSC";
const VERSION = 1;

export interface SeedPattern {
  unlockedCycles: number;
  cycles: string[][];
}

export class ChestPatterns {
  readonly names: readonly string[];
  readonly seedCount: number;
  readonly itemIds: Uint16Array;
  readonly itemStart: Uint32Array;
  readonly unlockedEnd: Uint32Array;
  private readonly cycleSizes: Uint8Array;
  private readonly cycleStart: Uint32Array;
  private readonly unlockedCycles: Uint8Array;
  private readonly idByName: Map<string, number>;

  constructor(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = new TextDecoder();
    if (text.decode(bytes.subarray(0, 4)) !== MAGIC || bytes[4] !== VERSION) {
      throw new Error("Not a chest pattern file.");
    }
    const nameCount = view.getUint16(5, true);
    const nameBytes = view.getUint32(7, true);
    let at = 11;
    this.names = text.decode(bytes.subarray(at, at + nameBytes)).split("\n");
    if (this.names.length !== nameCount) throw new Error("Chest pattern file has a bad name table.");
    at += nameBytes;
    this.idByName = new Map(this.names.map((name, id) => [name, id]));

    this.seedCount = view.getUint16(at, true);
    at += 2;
    const itemIds: number[] = [];
    const cycleSizes: number[] = [];
    this.itemStart = new Uint32Array(this.seedCount + 1);
    this.unlockedEnd = new Uint32Array(this.seedCount);
    this.cycleStart = new Uint32Array(this.seedCount + 1);
    this.unlockedCycles = new Uint8Array(this.seedCount);
    for (let s = 0; s < this.seedCount; s++) {
      const unlocked = bytes[at++];
      const locked = bytes[at++];
      this.unlockedCycles[s] = unlocked;
      this.itemStart[s] = itemIds.length;
      this.cycleStart[s] = cycleSizes.length;
      for (let c = 0; c < locked; c++) {
        if (c === unlocked) this.unlockedEnd[s] = itemIds.length;
        const size = bytes[at++];
        cycleSizes.push(size);
        for (let i = 0; i < size; i++) {
          const first = bytes[at++];
          itemIds.push(first < 0x80 ? first : ((first & 0x7f) << 8) | bytes[at++]);
        }
      }
      if (locked === unlocked) this.unlockedEnd[s] = itemIds.length;
    }
    this.itemStart[this.seedCount] = itemIds.length;
    this.cycleStart[this.seedCount] = cycleSizes.length;
    if (at !== bytes.length) throw new Error("Chest pattern file has trailing bytes.");
    this.itemIds = Uint16Array.from(itemIds);
    this.cycleSizes = Uint8Array.from(cycleSizes);
  }

  idOf(name: string): number | undefined {
    return this.idByName.get(name);
  }

  pattern(seed: number): SeedPattern {
    const s = seed - 1;
    const cycles: string[][] = [];
    let item = this.itemStart[s];
    for (let c = this.cycleStart[s]; c < this.cycleStart[s + 1]; c++) {
      const cycle: string[] = [];
      for (let i = 0; i < this.cycleSizes[c]; i++) cycle.push(this.names[this.itemIds[item++]]);
      cycles.push(cycle);
    }
    return { unlockedCycles: this.unlockedCycles[s], cycles };
  }
}

export function encodeChestPatterns(patterns: readonly SeedPattern[]): Uint8Array {
  const counts = new Map<string, number>();
  for (const { cycles } of patterns) {
    for (const name of cycles.flat()) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || (a < b ? -1 : 1));
  const idOf = new Map(names.map((name, id) => [name, id]));
  const nameBytes = new TextEncoder().encode(names.join("\n"));

  const out: number[] = [...new TextEncoder().encode(MAGIC), VERSION];
  const u16 = (n: number) => out.push(n & 0xff, n >> 8);
  u16(names.length);
  out.push(nameBytes.length & 0xff, (nameBytes.length >> 8) & 0xff, (nameBytes.length >> 16) & 0xff, nameBytes.length >>> 24);
  for (const byte of nameBytes) out.push(byte);
  u16(patterns.length);
  for (const { unlockedCycles, cycles } of patterns) {
    if (unlockedCycles > cycles.length || cycles.length > 255) throw new Error("Bad cycle counts.");
    out.push(unlockedCycles, cycles.length);
    for (const cycle of cycles) {
      if (cycle.length > 255) throw new Error("Too many items in one cycle.");
      out.push(cycle.length);
      for (const name of cycle) {
        const id = idOf.get(name)!;
        if (id < 0x80) out.push(id);
        else out.push(0x80 | (id >> 8), id & 0xff);
      }
    }
  }
  return Uint8Array.from(out);
}
