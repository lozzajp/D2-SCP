// GPU port of WindowMatcher.matchesAfterHead: one invocation tests one store seed.
// WGSL has no u64, so the RNG's 32x32->64 multiply is split into 16-bit halves.

const MULTIPLIER: u32 = 0x6ac690c5u;
const MULT_LO: u32 = 0x90c5u;
const MULT_HI: u32 = 0x6ac6u;
const SEED_CARRY: u32 = 666u;
const HEAD_DRAWS: u32 = 6u;
const LEVEL_ROLLS: u32 = 10u;
const WINDOW_SLOTS: u32 = 14u;
const GRID: u32 = 10u;
const WORKGROUP: u32 = 64u;

// Config layout (all u32): [0..9] pool count per level roll, then these.
const CFG_TOP_LEFT: u32 = 10u;
const CFG_RING: u32 = 11u;
const CFG_AMULET: u32 = 12u;
const CFG_ITEM_COUNT: u32 = 13u;
const CFG_MAX_MATCHES: u32 = 14u;
const CFG_OBSERVED_COUNT: u32 = 15u;
const CFG_OBSERVED: u32 = 16u; // (item, cell) pairs

struct Chunk {
  base: u32,
  count: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> chunk: Chunk;
@group(0) @binding(1) var<storage, read> pool: array<u32>;
// Per pool position: 1 if that pick can appear before the top-left item.
@group(0) @binding(2) var<storage, read> passes: array<u32>;
// Per item: bit 0 tall, bits 8..15 width, bits 16..23 height.
@group(0) @binding(3) var<storage, read> itemInfo: array<u32>;
// Per (level roll, item): uber chance, ultra chance, shown if uber, shown if ultra.
@group(0) @binding(4) var<storage, read> upgrade: array<vec4<u32>>;
@group(0) @binding(5) var<storage, read> config: array<u32>;
// [0] match count, [1..] matching store seeds.
@group(0) @binding(6) var<storage, read_write> result: array<atomic<u32>>;

struct Rng {
  lo: u32,
  hi: u32,
}

fn advance(rng: ptr<function, Rng>) {
  let a = (*rng).lo;
  let a0 = a & 0xffffu;
  let a1 = a >> 16u;
  let p00 = a0 * MULT_LO;
  let p01 = a0 * MULT_HI;
  let p10 = a1 * MULT_LO;
  let p11 = a1 * MULT_HI;
  let mid = (p00 >> 16u) + (p01 & 0xffffu) + (p10 & 0xffffu);
  let productHi = p11 + (p01 >> 16u) + (p10 >> 16u) + (mid >> 16u);
  let productLo = a * MULTIPLIER;
  let lo = productLo + (*rng).hi;
  (*rng).lo = lo;
  (*rng).hi = productHi + select(0u, 1u, lo < productLo);
}

fn isFree(rows: ptr<function, array<u32, 10>>, x: u32, y: u32, width: u32, height: u32) -> bool {
  let mask = ((1u << width) - 1u) << x;
  for (var row = y; row < y + height; row++) {
    if (((*rows)[row] & mask) != 0u) {
      return false;
    }
  }
  return true;
}

// WindowGrid.place: 1-high items pack from the right, everything else from the left; columns first.
fn place(rows: ptr<function, array<u32, 10>>, width: u32, height: u32) -> i32 {
  let fromRight = height == 1u;
  for (var i = 0u; i <= GRID - width; i++) {
    let x = select(i, GRID - width - i, fromRight);
    for (var y = 0u; y + height <= GRID; y++) {
      if (isFree(rows, x, y, width, height)) {
        let mask = ((1u << width) - 1u) << x;
        for (var row = y; row < y + height; row++) {
          (*rows)[row] |= mask;
        }
        return i32(x + y * GRID);
      }
    }
  }
  return -1;
}

@compute @workgroup_size(WORKGROUP)
fn main(@builtin(global_invocation_id) id: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let index = id.x + id.y * groups.x * WORKGROUP;
  if (index >= chunk.count) {
    return;
  }
  let seed = chunk.base + index;

  var rng = Rng(seed, SEED_CARRY);
  for (var i = 0u; i < HEAD_DRAWS; i++) {
    advance(&rng);
  }

  let topLeftItem = config[CFG_TOP_LEFT];
  let itemCount = config[CFG_ITEM_COUNT];
  var slots: array<u32, 14>;
  slots[0] = config[CFG_RING];
  slots[1] = config[CFG_AMULET];
  var topLeftFound = false;

  for (var slot = 2u; slot < WINDOW_SLOTS; slot++) {
    advance(&rng);
    let levelRoll = rng.lo % LEVEL_ROLLS;
    advance(&rng);
    let pick = rng.lo % config[levelRoll];
    var item = pool[pick];
    if (!topLeftFound && passes[pick] == 0u) {
      return;
    }

    let chances = upgrade[levelRoll * itemCount + item];
    if (chances.x > 0u) {
      advance(&rng);
      if (rng.lo % 10000u < chances.x) {
        item = chances.z;
      } else if (chances.y > 0u) {
        advance(&rng);
        if (rng.lo % 10000u < chances.y) {
          item = chances.w;
        }
      }
    }
    advance(&rng);

    if (!topLeftFound && (itemInfo[item] & 1u) != 0u) {
      if (item != topLeftItem) {
        return;
      }
      topLeftFound = true;
    }
    slots[slot] = item;
  }
  if (!topLeftFound) {
    return;
  }

  // containsAllObserved: every observed item claims a distinct slot.
  let observedCount = config[CFG_OBSERVED_COUNT];
  var taken = 0u;
  for (var o = 0u; o < observedCount; o++) {
    let item = config[CFG_OBSERVED + o * 2u];
    var slot = 0u;
    while (slot < WINDOW_SLOTS && (((taken >> slot) & 1u) != 0u || slots[slot] != item)) {
      slot++;
    }
    if (slot == WINDOW_SLOTS) {
      return;
    }
    taken |= 1u << slot;
  }

  // layoutMatches: lay the window out and check each observed item sits where it was seen.
  var rows: array<u32, 10>;
  var cells: array<i32, 14>;
  for (var slot = 0u; slot < WINDOW_SLOTS; slot++) {
    let info = itemInfo[slots[slot]];
    cells[slot] = place(&rows, (info >> 8u) & 0xffu, (info >> 16u) & 0xffu);
  }
  for (var o = 0u; o < observedCount; o++) {
    let item = config[CFG_OBSERVED + o * 2u];
    let cell = i32(config[CFG_OBSERVED + o * 2u + 1u]);
    var slot = 0u;
    while (slot < WINDOW_SLOTS && cells[slot] != cell) {
      slot++;
    }
    if (slot == WINDOW_SLOTS || slots[slot] != item) {
      return;
    }
  }

  let at = atomicAdd(&result[0], 1u);
  if (at < config[CFG_MAX_MATCHES]) {
    atomicStore(&result[1u + at], seed);
  }
}
