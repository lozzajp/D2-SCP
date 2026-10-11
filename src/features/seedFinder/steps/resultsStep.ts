import { firstWindowOf, type Setup } from "../state";
import type { GambleItem } from "../../../gamble/window";
import { MAX_MATCHES } from "../../../search/seedSearch";
import type { GameType } from "../../../rng/gameSeed";
import { gameSeedsFromStoreSeed } from "../../../rng/gameSeed";
import type { ObservedItem } from "../../../search/windowMatcher";
import { button, el } from "../../../ui/dom";
import { formatSeed } from "../../../ui/format";
import { NORMAL_D2R_GAME, renderGameSeeds, SEEDINGS, seedValue } from "../gameSeeds";
import { renderWindowGrid, windowTiles } from "../windowGrid";
import type { SearchResult, StepView, Wizard } from "../wizard";
import type { PlayerProgress } from "../../../app/progress";
import { renderRunePreview } from "../../runePlanner/runePlanPanel";

const PREVIEW_CELL_SIZE = 36;
const OPEN_MATCHES = 5;

export type UseSeed = (gameSeed: number, gameType: GameType) => void;

export function renderResultsStep(wizard: Wizard): StepView {
  const result = wizard.result;
  const footer = el(
    "div",
    { className: "step-footer" },
    button("← Change items", () => wizard.goTo("items")),
    button("← Setup", () => wizard.goTo("setup")),
    button("Start fresh", () => {
      wizard.state.board.length = 0;
      wizard.save();
      wizard.goTo("items");
    }),
  );
  if (!result) return { root: el("div", { className: "step" }, el("p", { textContent: "Nothing searched yet." }), footer) };

  const seeds = result.storeSeeds;
  const useSeed: UseSeed = (gameSeed, gameType) => wizard.progress.setKnownSeed({ gameSeed, gameType });
  if (seeds.length === 0) return { root: el("div", { className: "step" }, ...summarize(result, wizard.progress), footer) };

  const candidates = el("div", { className: "candidates" });
  seeds.forEach((storeSeed, index) =>
    candidates.append(renderCandidate(result, storeSeed, index, seeds.length <= OPEN_MATCHES, useSeed, wizard.progress)),
  );

  return {
    root: el("div", { className: "step" }, ...summarize(result, wizard.progress), candidates, footer),
  };
}

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
    ...(unsure && progress ? [renderRunePreview(progress, { gameSeed, gameType: NORMAL_D2R_GAME.type }, false)] : []),
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

function summarize(result: SearchResult, progress: PlayerProgress): HTMLElement[] {
  const count = result.storeSeeds.length;
  const partial =
    result.outcome === "cancelled"
      ? ` The search was stopped after ${(result.coverage * 100).toFixed(1)}% of the seeds, so there may be more.`
      : "";

  if (result.outcome === "failed") {
    return [lead(`The search failed: ${result.error ?? "unknown error"}`, "lead error")];
  }
  if (result.usedFirst) {
    const stopped = `Used the first window found, stopping at ${(result.coverage * 100).toFixed(1)}%.`;
    if (gameSeedsFromStoreSeed(result.storeSeeds[0], NORMAL_D2R_GAME.draws).length > 1) {
      return [lead(`${stopped} It comes from several game seeds, so pick one below or restart for a new window.`, "lead warning")];
    }
    return [
      lead(`${stopped} Its game seed is saved: check the window below matches your game.`, "lead success"),
      el("div", { className: "next-steps" }, ...nextSteps(progress, "Calibrate your routes", "Go straight to plan")),
    ];
  }
  if (count === 0) {
    return [
      lead(`No store seed matched.${partial} The usual causes:`),
      el(
        "ul",
        { className: "tips" },
        el("li", { textContent: "The board doesn't match the window. Compare item by item, especially the top-left one." }),
        el("li", {
          textContent:
            "Wrong character level, game version or platform in the setup. Consoles order the pool differently: " +
            "check the platform, or try the Advanced pool orders.",
        }),
        el("li", {
          textContent:
            "It isn't the first window of the game. Refreshing or buying changes it, so start a new game and enter its first window.",
        }),
      ),
    ];
  }
  if (result.outcome === "capped") {
    return [
      lead(
        `Stopped at ${MAX_MATCHES} matches: these items are too common to pin down one seed. ` +
          "Go back and add 2 or 3 more items; that usually narrows it to one.",
      ),
    ];
  }
  if (count === 1) {
    return [lead(`Found it: one store seed matches your window.${partial}`, "lead success")];
  }
  return [
    lead(
      `${count} store seeds match. All of them show the items you entered, so compare the rest of each window ` +
        `with the game.${partial}`,
    ),
  ];
}

function lead(text: string, className = "lead"): HTMLElement {
  return el("p", { className, textContent: text });
}

function renderCandidate(result: SearchResult, storeSeed: number, index: number, open: boolean, useSeed: UseSeed, progress: PlayerProgress): HTMLElement {
  const body = el("div", { className: "candidate-body" });
  const normalSeeds = gameSeedsFromStoreSeed(storeSeed, NORMAL_D2R_GAME.draws);
  const card = el(
    "details",
    { className: "candidate", open },
    el(
      "summary",
      {},
      el("span", { className: "candidate-number", textContent: `#${index + 1}` }),
      ...(normalSeeds.length > 0
        ? [el("span", { textContent: "Game seed " }), ...normalSeeds.map((seed) => el("code", { textContent: formatSeed(seed) }))]
        : [el("span", { textContent: "Store seed " }), el("code", { textContent: formatSeed(storeSeed) })]),
    ),
    body,
  );

  let rendered = false;
  const renderBody = () => {
    if (rendered || !card.open) return;
    rendered = true;
    body.append(renderCandidateBody(result, storeSeed, useSeed, progress));
  };
  card.addEventListener("toggle", renderBody);
  renderBody();
  return card;
}

function renderCandidateBody(result: SearchResult, storeSeed: number, useSeed: UseSeed, progress: PlayerProgress): HTMLElement {
  const ambiguous = gameSeedsFromStoreSeed(storeSeed, NORMAL_D2R_GAME.draws).length > 1;
  return renderMatchBody(
    storeSeed,
    result.setup,
    result.board,
    useSeed,
    () =>
      ambiguous
        ? nextSteps(progress, null, "Try a shot at a plan")
        : nextSteps(progress, "First time? Calibrate your routes", "Calibrated routes? Go straight to plan"),
    progress,
  );
}

function nextSteps(progress: PlayerProgress, calibrate: string | null, plan: string): HTMLElement[] {
  const seed = progress.knownSeed;
  return [
    ...(seed ? [renderRunePreview(progress, seed)] : []),
    ...(calibrate ? [el("a", { className: "button-link", href: "#/calibrate", textContent: calibrate })] : []),
    el("a", { className: "button-link", href: "#/runes", textContent: plan }),
  ];
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
