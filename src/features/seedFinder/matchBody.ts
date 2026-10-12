import type { PlayerProgress } from "../../app/progress";
import type { GambleItem } from "../../gamble/window";
import { gameSeedsFromStoreSeed, type GameType } from "../../rng/gameSeed";
import type { ObservedItem } from "../../search/windowMatcher";
import { button, el } from "../../ui/dom";
import { renderRunePreview } from "../runePlanner/runePlanPanel";
import { NORMAL_D2R_GAME, renderGameSeeds, SEEDINGS, seedValue } from "./gameSeeds";
import { firstWindowOf, type Setup } from "./state";
import { renderWindowGrid, windowTiles } from "./windowGrid";

const PREVIEW_CELL_SIZE = 36;

export type UseSeed = (gameSeed: number, gameType: GameType) => void;

function renderNormalSeeds(storeSeed: number, useSeed: UseSeed, progress?: PlayerProgress): HTMLElement {
  const gameSeeds = gameSeedsFromStoreSeed(storeSeed, NORMAL_D2R_GAME.draws);
  if (gameSeeds.length === 0) {
    return el(
      "div",
      { className: "normal-seeds" },
      lead("No game seed leads to this window, so it's probably not yours. Check the window below against your game."),
    );
  }
  const unsure = gameSeeds.length > 1;
  const rows = gameSeeds.flatMap((gameSeed) => [
    el(
      "div",
      { className: "normal-seed" },
      el("span", { textContent: `${NORMAL_D2R_GAME.label} seed` }),
      seedValue(gameSeed),
      unsure
        ? button("Use this seed anyway", () => useSeed(gameSeed, NORMAL_D2R_GAME.type), "small")
        : button("That's my window! Use this seed!", () => useSeed(gameSeed, NORMAL_D2R_GAME.type), "small primary"),
    ),
    ...(unsure && progress ? [renderRunePreview(progress, { gameSeed, gameType: NORMAL_D2R_GAME.type })] : []),
  ]);
  return el(
    "div",
    { className: "normal-seeds" },
    ...(unsure
      ? [
          el(
            "p",
            { className: "lead warning" },
            el("strong", { textContent: `This window comes from ${gameSeeds.length} different game seeds, ` }),
            "and there's no way to tell which one is yours. It is highly recommended restarting the game for a new window " +
              `that gives a single seed. It may be worth trying out the 1/${gameSeeds.length} chance if for example one of the seeds has a Ber within 20s wait or good deal. Do not alter your calibrations and refinements based on running this.`,
          ),
          el("p", {
            className: "hint",
            textContent:
              "You can still pick one, but if it's the wrong one by chance, your plan will be wrong too. " +
              "(Advanced) A chest calibrate/refine step will prove it if you are curious, but do not alter your refinements based on the wrong seed.",
          }),
        ]
      : []),
    ...rows,
  );
}

function lead(text: string, className = "lead"): HTMLElement {
  return el("p", { className, textContent: text });
}

export function renderMatchBody(
  storeSeed: number,
  setup: Setup,
  board: ObservedItem[],
  useSeed: UseSeed,
  nextSteps?: () => HTMLElement[],
  progress?: PlayerProgress,
): HTMLElement {
  const firstWindow = firstWindowOf(storeSeed, setup);
  const next = el("div", { className: "next-steps", hidden: true });
  const useAndPrompt: UseSeed = (gameSeed, gameType) => {
    useSeed(gameSeed, gameType);
    if (!nextSteps) return;
    next.replaceChildren(el("p", { className: "lead success", textContent: "Seed saved! What next?" }), ...nextSteps());
    next.hidden = false;
    next.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return el(
    "div",
    {},
    renderNormalSeeds(storeSeed, useAndPrompt, progress),
    next,
    el(
      "div",
      { className: "candidate-windows" },
      windowFigure("First window", "should match your game exactly (✓ = items you entered).", firstWindow, board),
    ),
    el(
      "details",
      { className: "advanced" },
      el("summary", { textContent: "Advanced: store seed and -seed games" }),
      el(
        "div",
        { className: "candidate-seeds" },
        el("h4", { textContent: "Store seed" }),
        seedValue(storeSeed),
        el("h4", { textContent: "Game seed" }),
        renderGameSeeds(storeSeed, SEEDINGS, useAndPrompt),
      ),
    ),
  );
}

function windowFigure(title: string, caption: string, window: GambleItem[], entered: ObservedItem[] = []): HTMLElement {
  return el(
    "figure",
    { className: "window-figure" },
    renderWindowGrid(windowTiles(window, entered), PREVIEW_CELL_SIZE).grid,
    el("figcaption", {}, el("strong", { textContent: title }), `: ${caption}`),
  );
}
