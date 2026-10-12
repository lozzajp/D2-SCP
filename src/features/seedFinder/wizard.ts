import type { Board } from "./board";
import { searchedItems } from "./boardItems";
import type { PlayerProgress } from "../../app/progress";
import { NORMAL_D2R_GAME } from "./gameSeeds";
import { QUICK_ITEMS } from "./quickSearch";
import { saveState, searchParamsOf, type AppState, type Setup } from "./state";
import { gameSeedsFromStoreSeed } from "../../rng/gameSeed";
import { SeedSearch, type SearchOutcome } from "../../search/seedSearch";
import { el } from "../../ui/dom";
import { renderItemsStep } from "./steps/itemsStep";
import { renderResultsStep } from "./steps/resultsStep";
import { renderSearchStep } from "./steps/searchStep";
import { renderSetupStep } from "./steps/setupStep";

export type StepId = "setup" | "items" | "search" | "results";

const STEPS: readonly { id: StepId; label: string }[] = [
  { id: "setup", label: "1. Setup" },
  { id: "items", label: "2. Items" },
  { id: "search", label: "3. Search" },
  { id: "results", label: "4. Results" },
];

export interface StepView {
  root: HTMLElement;
  onShow?(): void;
  refresh?(): void;
}

export interface SearchRun {
  search: SeedSearch;
  setup: Setup;
  board: Board;
  quick: boolean;
  usedFirst: boolean;
}

export interface SearchResult {
  setup: Setup;
  board: Board;
  outcome: SearchOutcome;
  error?: string;
  storeSeeds: number[];
  coverage: number;
  usedFirst: boolean;
}

export class Wizard {
  readonly root: HTMLElement;
  readonly state: AppState;
  readonly progress: PlayerProgress;
  run: SearchRun | null = null;
  result: SearchResult | null = null;

  private readonly crumbs = new Map<StepId, HTMLElement>();
  private readonly body = el("div", { className: "wizard-body" });
  private step: StepId = "setup";
  private view: StepView | null = null;
  private refreshQueued = false;
  fresh = true;

  constructor(state: AppState, progress: PlayerProgress) {
    this.state = state;
    this.progress = progress;
    state.setup.platform = progress.platform;
    state.setup.charLevel = progress.charLevel;
    progress.subscribe(() => {
      if (state.setup.platform === progress.platform && state.setup.charLevel === progress.charLevel) return;
      state.setup.platform = progress.platform;
      state.setup.charLevel = progress.charLevel;
      this.save();
      if (this.step === "setup" || this.step === "items") this.goTo(this.step);
    });
    const crumbs = el("ol", { className: "crumbs" });
    for (const { id, label } of STEPS) {
      const crumb = el("li", { textContent: label });
      this.crumbs.set(id, crumb);
      crumbs.append(crumb);
    }
    this.root = el(
      "section",
      { className: "panel wizard" },
      el("header", { className: "panel-head" }, el("h2", { textContent: "Find my seed" }), crumbs),
      this.body,
    );
  }

  save(): void {
    saveState(this.state);
  }

  goTo(step: StepId): void {
    this.step = step;
    if (step !== "setup") this.fresh = false;
    for (const [id, crumb] of this.crumbs) crumb.classList.toggle("active", id === step);
    this.view = renderStep(this, step);
    this.body.replaceChildren(this.view.root);
    this.view.onShow?.();
  }

  startSearch(quick = false): void {
    if (this.run) return;
    const search: SeedSearch = new SeedSearch(searchParamsOf(this.state), {
      onProgress: () => {
        this.takeFirstMatch();
        this.queueRefresh();
      },
      onEnd: (outcome, error) => this.searchEnded(search, outcome, error),
    });
    this.run = {
      search,
      setup: structuredClone(this.state.setup),
      board: structuredClone(this.state.board),
      quick: quick && searchedItems(this.state.board).length >= QUICK_ITEMS,
      usedFirst: false,
    };
    this.result = null;
    search.start();
    this.goTo("search");
  }

  private takeFirstMatch(): void {
    const run = this.run;
    if (!run?.quick || run.search.matches.length === 0) return;
    run.quick = false;
    if (run.search.matches.length > 1) return;
    const gameSeeds = gameSeedsFromStoreSeed(run.search.matches[0], NORMAL_D2R_GAME.draws);
    if (gameSeeds.length === 0) return;
    run.usedFirst = true;
    if (gameSeeds.length === 1) this.progress.setKnownSeed({ gameSeed: gameSeeds[0], gameType: NORMAL_D2R_GAME.type });
    run.search.cancel();
  }

  cancelSearch(): void {
    const run = this.run;
    this.run = null;
    run?.search.cancel();
    this.goTo("items");
  }

  stopAndReview(): void {
    this.run?.search.cancel();
  }

  newRun(): void {
    const run = this.run;
    this.run = null;
    run?.search.cancel();
    this.result = null;
    this.state.board.length = 0;
    this.save();
    this.goTo("items");
  }

  private searchEnded(search: SeedSearch, outcome: SearchOutcome, error?: string): void {
    const run = this.run;
    if (run?.search !== search) return;
    this.run = null;
    this.result = {
      setup: run.setup,
      board: run.board,
      outcome,
      error,
      storeSeeds: [...search.matches],
      coverage: search.seedsTested / search.seedCount,
      usedFirst: run.usedFirst,
    };
    this.goTo("results");
  }

  private queueRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.view?.refresh?.();
    });
  }
}

function renderStep(wizard: Wizard, step: StepId): StepView {
  switch (step) {
    case "setup":
      return renderSetupStep(wizard);
    case "items":
      return renderItemsStep(wizard);
    case "search":
      return renderSearchStep(wizard);
    case "results":
      return renderResultsStep(wizard);
  }
}
