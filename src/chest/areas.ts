import type { Rune } from "./runePlan";

export const PLAYER_COUNTS = [1, 3, 5, 7] as const;

export type PlayerCount = (typeof PLAYER_COUNTS)[number];

export interface ChestAreaInfo {
  id: "lowerKurast" | "riverOfFlame";
  name: string;
  short: string;
  act: number;
  players: readonly PlayerCount[];
  topRune: Rune;
}

export const CHEST_AREAS = [
  { id: "lowerKurast", name: "Lower Kurast", short: "LK", act: 3, players: PLAYER_COUNTS, topRune: "Ber" },
  { id: "riverOfFlame", name: "River of Flame", short: "RoF", act: 4, players: PLAYER_COUNTS, topRune: "Cham" },
] as const satisfies readonly ChestAreaInfo[];

export type ChestAreaId = (typeof CHEST_AREAS)[number]["id"];

export const DEFAULT_AREA: ChestAreaId = "lowerKurast";
export const DEFAULT_PLAYERS: PlayerCount = 7;

export interface PatternTable {
  area: ChestAreaId;
  players: PlayerCount;
}

export function chestArea(id: ChestAreaId): ChestAreaInfo {
  return CHEST_AREAS.find((area) => area.id === id)!;
}

export function isChestArea(id: unknown): id is ChestAreaId {
  return CHEST_AREAS.some((area) => area.id === id);
}

export function tableKey({ area, players }: PatternTable): string {
  return `${area}-p${players}`;
}

export function isPlayerCount(players: unknown): players is PlayerCount {
  return PLAYER_COUNTS.some((count) => count === players);
}
