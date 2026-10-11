import type { Feature } from "../../app/feature";
import type { PlayerProgress } from "../../app/progress";
import { renderRunePlanPanel, renderSeedPlans } from "../runePlanner/runePlanPanel";
import { cleanBoard, type Board } from "../seedFinder/board";
import { searchedItems } from "../seedFinder/boardItems";
import { renderBoardInput, type BoardInput } from "../seedFinder/boardInput";
import { NORMAL_D2R_GAME } from "../seedFinder/gameSeeds";
import { loadState, searchParamsOf, type Setup } from "../seedFinder/state";
import { renderMatchBody, type UseSeed } from "../seedFinder/steps/resultsStep";
import { RateMeter } from "../seedFinder/steps/searchStep";
import { AUTO_DELAY_MS, QUICK_ITEMS, renderQuickOptions } from "../seedFinder/quickSearch";
import { gameSeedsFromStoreSeed } from "../../rng/gameSeed";
import { MAX_MATCHES, SeedSearch, type SearchOutcome } from "../../search/seedSearch";
import { button, el } from "../../ui/dom";
import { formatCount, formatDuration, formatSeed } from "../../ui/format";

const BOARD_KEY = "d2lkscp-repeat-board";

export const repeat: Feature = {
  id: "repeat",
  title: "Repeat (advanced)",
  summary: "Fast iterations once you're calibrated: enter a window, confirm the seed, plan.",
  ready: true,
  createPage(progress) {
    const page = new RepeatPage(progress);
    return { root: page.root, onShow: () => page.show() };
  },
};

interface Run {
  search: SeedSearch;
  setup: Setup;
  board: Board;
  shown: number;
  rate: RateMeter;
  quick: boolean;
  stoppedOnFirst: boolean;
}

class RepeatPage {
  readonly root: HTMLElement;
  private readonly board: Board = loadBoard();
  private setup: Setup;
  private run: Run | null = null;
  private refreshQueued = false;

  private readonly inputBox = el("div");
  private readonly searchButton = button("Find seed", () => this.start(), "primary");
  private readonly stopButton = button("Stop", () => this.stop());
  private readonly fill = el("div", { className: "progress-fill" });
  private readonly stats = el("p", { className: "stats" });
  private readonly searchBox = el("div", { hidden: true }, el("div", { className: "progress" }, this.fill), this.stats);
  private readonly warning = el("div");
  private readonly matches = el("div", { className: "candidates" });
  private readonly options = renderQuickOptions("d2lkscp-repeat");
  private readonly quickBox = this.options.quick;
  private readonly autoBox = this.options.auto;
  private readonly plan: HTMLElement;
  private readonly seedPlans = el("div", { className: "seed-plans", hidden: true });
  private boardKey = "";
  private autoTimer = 0;

  private readonly progress: PlayerProgress;

  constructor(progress: PlayerProgress) {
    this.progress = progress;
    this.setup = this.currentSetup();
    this.plan = el("div", { hidden: true }, renderRunePlanPanel(progress, { showEarly: true }));
    this.stopButton.hidden = true;
    this.root = el(
      "div",
      { className: "page" },
      el(
        "section",
        { className: "panel" },
        el("header", { className: "panel-head" }, el("h2", { textContent: "Repeat" })),
        this.inputBox,
        this.options.root,
        el("div", { className: "step-footer" }, this.stopButton, this.searchButton),
        this.searchBox,
        this.warning,
        this.matches,
      ),
      this.plan,
      this.seedPlans,
      el("div", { className: "new-run" }, button("New Run", () => this.newRun(), "primary")),
    );
    this.renderInput();
    progress.subscribe(() => {
      const { platform, charLevel } = this.currentSetup();
      if (this.run || (platform === this.setup.platform && charLevel === this.setup.charLevel)) return;
      this.setup = this.currentSetup();
      this.renderInput();
    });
  }

  show(): void {
    if (this.run) return;
    this.setup = this.currentSetup();
    this.renderInput();
  }

  private currentSetup(): Setup {
    return { ...loadState().setup, platform: this.progress.platform, charLevel: this.progress.charLevel };
  }

  private renderInput(): BoardInput {
    this.boardKey = JSON.stringify(this.board);
    const input = renderBoardInput(this.board, this.setup, (blocker) => {
      saveBoard(this.board);
      this.searchButton.disabled = blocker !== null || this.run !== null;
      this.autoSearch(blocker);
    });
    this.inputBox.replaceChildren(input.root);
    return input;
  }

  private autoSearch(blocker: string | null): void {
    const key = JSON.stringify(this.board);
    if (key === this.boardKey) return;
    this.boardKey = key;
    clearTimeout(this.autoTimer);
    if (!this.autoBox.checked || blocker !== null || searchedItems(this.board).length < QUICK_ITEMS) return;
    this.autoTimer = window.setTimeout(() => this.start(true), AUTO_DELAY_MS);
  }

  private newRun(): void {
    this.stop();
    this.board.length = 0;
    this.searchBox.hidden = true;
    this.warning.replaceChildren();
    this.matches.replaceChildren();
    this.plan.hidden = true;
    this.seedPlans.hidden = true;
    this.setup = this.currentSetup();
    this.renderInput().focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  private start(scroll = false): void {
    this.stop();
    const setup = structuredClone(this.setup);
    const board = structuredClone(this.board);
    const search: SeedSearch = new SeedSearch(searchParamsOf({ setup, board }), {
      onProgress: () => this.queueRefresh(),
      onEnd: (outcome, error) => this.ended(search, outcome, error),
    });
    const quick = this.quickBox.checked && searchedItems(board).length >= QUICK_ITEMS;
    this.run = { search, setup, board, shown: 0, rate: new RateMeter(), quick, stoppedOnFirst: false };
    this.warning.replaceChildren();
    this.matches.replaceChildren();
    this.plan.hidden = true;
    this.seedPlans.hidden = true;
    this.searchBox.hidden = false;
    this.fill.style.width = "0";
    this.stats.textContent = "Starting workers…";
    this.searchButton.disabled = true;
    this.stopButton.hidden = false;
    search.start();
    if (scroll) this.searchBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  private stop(): void {
    clearTimeout(this.autoTimer);
    this.run?.search.cancel();
  }

  private queueRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      if (this.run) this.refresh(this.run);
    });
  }

  private refresh(run: Run): void {
    const { search } = run;
    const fraction = search.seedsTested / search.seedCount;
    this.fill.style.width = `${(fraction * 100).toFixed(2)}%`;
    if (search.seedsTested > 0) {
      const perSecond = run.rate.update(search.seedsTested);
      const secondsLeft = (search.seedCount - search.seedsTested) / perSecond;
      this.stats.textContent =
        `${(fraction * 100).toFixed(1)}% · ${formatCount(perSecond)} seeds/s · ${formatDuration(secondsLeft)} left` +
        (search.matches.length > 0 ? " · still checking for other matching windows" : "");
    }
    this.showNewMatches(run);
  }

  private showNewMatches(run: Run): void {
    const found = run.search.matches;
    if (found.length === run.shown) return;
    for (const storeSeed of found.slice(run.shown)) this.matches.append(this.renderMatch(run, storeSeed, run.shown++));
    this.warning.replaceChildren();
    if (run.quick && found.length === 1 && this.useFirstMatch(run, found[0])) return;
    run.quick = false;
    if (found.length > 1) {
      this.warning.append(
        el(
          "p",
          { className: "lead warning" },
          el("strong", { textContent: `${found.length} different windows match your items! ` }),
          "Compare each window below with your game, item by item. If you can't tell them apart, " +
            "restart the game for a new window rather than guessing.",
        ),
      );
    }
  }

  private useFirstMatch(run: Run, storeSeed: number): boolean {
    run.quick = false;
    const gameSeeds = gameSeedsFromStoreSeed(storeSeed, NORMAL_D2R_GAME.draws);
    if (gameSeeds.length === 0) {
      this.warning.append(
        el("p", {
          className: "lead warning",
          textContent: "The first window found has no normal game seed, so it wasn't used. Still searching.",
        }),
      );
      return false;
    }
    run.stoppedOnFirst = true;
    if (gameSeeds.length === 1) {
      this.progress.setKnownSeed({ gameSeed: gameSeeds[0], gameType: NORMAL_D2R_GAME.type });
      this.warning.append(
        el(
          "p",
          { className: "lead success" },
          `Used the first seed found: ${formatSeed(gameSeeds[0])}. Check its window matches your game, then pick a plan below.`,
        ),
      );
    }
    run.search.cancel();
    if (gameSeeds.length === 1) this.showPlan();
    return true;
  }

  private showPlan(): void {
    this.seedPlans.hidden = true;
    this.plan.hidden = false;
    this.scrollTo(this.plan);
  }

  private showSeedPlans(gameSeeds: readonly number[]): void {
    this.plan.hidden = true;
    this.seedPlans.replaceChildren(
      el(
        "p",
        { className: "lead warning" },
        el("strong", { textContent: `Your window comes from ${gameSeeds.length} different game seeds. ` }),
        "Restarting the game for a new window is safest. Otherwise pick a plan from one of them, " +
          `knowing it's wrong if that isn't your seed. But for example a quick Ber is probably worth the 1/${gameSeeds.length} shot at it.`,
      ),
      renderSeedPlans(
        this.progress,
        gameSeeds.map((gameSeed) => ({ gameSeed, gameType: NORMAL_D2R_GAME.type })),
        () => {},
      ),
    );
    this.seedPlans.hidden = false;
    this.scrollTo(this.seedPlans);
  }

  private renderMatch(run: Run, storeSeed: number, index: number): HTMLElement {
    const gameSeeds = gameSeedsFromStoreSeed(storeSeed, NORMAL_D2R_GAME.draws);
    const useSeed: UseSeed = (gameSeed, gameType) => {
      this.progress.setKnownSeed({ gameSeed, gameType });
      this.showPlan();
    };
    return el(
      "details",
      { className: "candidate", open: index < 5 },
      el(
        "summary",
        {},
        el("span", { className: "candidate-number", textContent: `#${index + 1}` }),
        el("span", { textContent: gameSeeds.length > 0 ? "Game seed " : "Store seed " }),
        ...(gameSeeds.length > 0 ? gameSeeds : [storeSeed]).map((seed) => el("code", { textContent: formatSeed(seed) })),
      ),
      el(
        "div",
        { className: "candidate-body" },
        renderMatchBody(storeSeed, run.setup, run.board, useSeed),
      ),
    );
  }

  private ended(search: SeedSearch, outcome: SearchOutcome, error?: string): void {
    const run = this.run;
    if (run?.search !== search) return;
    this.run = null;
    this.showNewMatches(run);
    this.searchButton.disabled = false;
    this.stopButton.hidden = true;
    this.stats.textContent = run.stoppedOnFirst
      ? `Stopped at ${((search.seedsTested / search.seedCount) * 100).toFixed(1)}%: used the first window found.`
      : endText(outcome, search, error);

    const found = search.matches;
    const gameSeeds = found.length === 1 ? gameSeedsFromStoreSeed(found[0], NORMAL_D2R_GAME.draws) : [];
    if (gameSeeds.length > 1 && (run.stoppedOnFirst || outcome === "complete")) this.showSeedPlans(gameSeeds);
    else if (outcome === "complete") this.scrollTo(this.plan.hidden ? this.matches : this.plan);
  }

  private scrollTo(element: HTMLElement): void {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function endText(outcome: SearchOutcome, search: SeedSearch, error?: string): string {
  const count = search.matches.length;
  switch (outcome) {
    case "failed":
      return `The search failed: ${error ?? "unknown error"}`;
    case "capped":
      return `Stopped at ${MAX_MATCHES} matches: add more items to narrow it down.`;
    case "cancelled":
      return `Stopped at ${((search.seedsTested / search.seedCount) * 100).toFixed(1)}%, so there may be more matches.`;
    case "complete":
      if (count === 0) return "No window matches. Check the items and their positions, or the setup in step 1.";
      return count === 1 ? "Done: only this window matches." : `Done: ${count} windows match.`;
  }
}

function loadBoard(): Board {
  try {
    return cleanBoard(JSON.parse(localStorage.getItem(BOARD_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function saveBoard(board: Board): void {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(board));
  } catch {
  }
}
