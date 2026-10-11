import type { PoolOrder } from "../data/poolOrders";

export type GameVersionId = "d2r" | "row";

export interface GameVersion {
  id: GameVersionId;
  label: string;
  rowPool: boolean;
}

export const GAME_VERSIONS: readonly GameVersion[] = [
  { id: "d2r", label: "Diablo II: Resurrected", rowPool: false },
  { id: "row", label: "D2R: Reign of the Warlock", rowPool: true },
];

export type PlatformId = "pc" | "switch" | "xbox" | "ps";

export const PLATFORMS: readonly { id: PlatformId; label: string; poolOrder: PoolOrder }[] = [
  { id: "pc", label: "PC", poolOrder: "msvc" },
  { id: "switch", label: "Switch", poolOrder: "musl" },
  { id: "xbox", label: "Xbox", poolOrder: "msvc" },
  { id: "ps", label: "PlayStation", poolOrder: "ps5" },
];

export const POOL_ORDERS: readonly { id: PoolOrder; label: string }[] = [
  { id: "msvc", label: "MSVC CRT qsort (PC, Xbox)" },
  { id: "musl", label: "musl smoothsort (Switch)" },
  { id: "ps5", label: "PS5 measured (PlayStation)" },
  { id: "freebsd", label: "BSD qsort" },
  { id: "stable", label: "Stable / file order (glibc)" },
  { id: "gcc", label: "GCC introsort (std::sort)" },
  { id: "msvc-std", label: "MSVC std::sort" },
  { id: "reverse", label: "Reverse file order" },
];

export function gameVersion(id: GameVersionId): GameVersion {
  return GAME_VERSIONS.find((version) => version.id === id) ?? GAME_VERSIONS[0];
}

export function platformPoolOrder(id: PlatformId): PoolOrder {
  return PLATFORMS.find((platform) => platform.id === id)?.poolOrder ?? "msvc";
}
