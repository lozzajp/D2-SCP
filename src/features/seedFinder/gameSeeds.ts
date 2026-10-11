import { gameSeedsFromStoreSeed, STORE_SEED_DRAWS, type GameType } from "../../rng/gameSeed";
import { button, copyButton, el } from "../../ui/dom";
import { formatSeed } from "../../ui/format";

export interface Seeding {
  type: GameType;
  draws: number;
  label: string;
}

export const SEED_FLAG_GAME: Seeding = { type: "seedFlag", draws: STORE_SEED_DRAWS.seedFlag, label: "D2R -seed game" };
export const NORMAL_D2R_GAME: Seeding = { type: "normal", draws: STORE_SEED_DRAWS.normal, label: "Normal D2R game" };
export const SEEDINGS: readonly Seeding[] = [SEED_FLAG_GAME, NORMAL_D2R_GAME];

export function renderGameSeeds(
  storeSeed: number,
  seedings: readonly Seeding[],
  onUse?: (gameSeed: number, type: GameType) => void,
): HTMLElement {
  const list = el("dl", { className: "seed-list" });
  for (const { type, draws, label } of seedings) {
    const gameSeeds = gameSeedsFromStoreSeed(storeSeed, draws);
    const values = gameSeeds.map((gameSeed) => {
      const value = seedValue(gameSeed);
      if (onUse) value.append(button("Use this seed", () => onUse(gameSeed, type), "small"));
      return value;
    });
    list.append(
      el("dt", { textContent: label, title: `The store is seeded after ${draws} game RNG draws` }),
      el(
        "dd",
        {},
        ...(values.length > 0 ? values : [el("span", { className: "muted", textContent: "none: no game seed leads to this store seed" })]),
      ),
    );
  }
  return list;
}

export function seedValue(seed: number): HTMLElement {
  const text = formatSeed(seed);
  return el("span", { className: "seed-value" }, el("code", { textContent: text }), copyButton(text));
}
