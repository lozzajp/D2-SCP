import type { Feature } from "../../app/feature";
import type { PickedPlan, PlayerProgress } from "../../app/progress";
import { openSettingsMenu } from "../../app/settingsMenu";
import { CHEST_AREAS, chestArea } from "../../chest/areas";
import { hasRepeats, RIVER_OF_FLAME, routeText } from "../../chest/waypoints";
import { GAME_VERSIONS, PLATFORMS } from "../../gamble/settings";
import { gameSeedsFromStoreSeed } from "../../rng/gameSeed";
import { MAX_MATCHES, SeedSearch, type SearchOutcome } from "../../search/seedSearch";
import { button, el } from "../../ui/dom";
import { formatCount, formatDuration, formatSeed, parseSeed, waitTenths } from "../../ui/format";
import { renderRunePlanPanel, renderSeedPlans, waitText } from "../runePlanner/runePlanPanel";
import { cleanBoard, type Board } from "../seedFinder/board";
import { searchedItems } from "../seedFinder/boardItems";
import { renderBoardInput, type BoardInput } from "../seedFinder/boardInput";
import { NORMAL_D2R_GAME } from "../seedFinder/gameSeeds";
import { AUTO_DELAY_MS, QUICK_ITEMS, renderQuickOptions } from "../seedFinder/quickSearch";
import { loadState, searchParamsOf, type Setup } from "../seedFinder/state";
import { renderMatchBody, type UseSeed } from "../seedFinder/matchBody";
import { RateMeter } from "../seedFinder/rateMeter";

const BOARD_KEY = "d2lkscp-repeat-board";

export const run: Feature = {
  id: "run",
  title: "Run",
  summary: "Fill in the gamble window, get your seed, pick a rune plan.",
  ready: true,
  createPage(progress) {
    const page = new RunPage(progress);
    return { root: page.root, onShow: () => page.show() };
  },
};

interface Search {
  search: SeedSearch;
  setup: Setup;
  board: Board;
  shown: number;
  rate: RateMeter;
  quick: boolean;
  stoppedOnFirst: boolean;
}

class RunPage {
  readonly root: HTMLElement;
  private readonly board: Board = loadBoard();
  private setup: Setup | null;
  private run: Search | null = null;
  private refreshQueued = false;

  private readonly setupLine = el("p", { className: "hint" });
  private readonly inputBox = el("div");
  private readonly searchButton = button("Find seed", () => this.start(), "primary");
  private readonly stopButton = button("Stop", () => this.stop());
  private readonly fill = el("div", { className: "progress-fill" });
  private readonly stats = el("p", { className: "stats" });
  private readonly searchBox = el("div", { hidden: true }, el("div", { className: "progress" }, this.fill), this.stats);
  private readonly warning = el("div");
  private readonly matches = el("div", { className: "candidates" });
  private readonly options = renderQuickOptions("d2lkscp-repeat", "repeat-options", true);
  private readonly plan: HTMLElement;
  private readonly seedPlans = el("div", { className: "seed-plans", hidden: true });
  private readonly afterPlan: HTMLElement;
  private readonly seedInput = el("input", { type: "text", inputMode: "numeric", placeholder: "e.g. 638589163", spellcheck: false, autocomplete: "off" });
  private boardKey = "";
  private input: BoardInput | null = null;
  private autoTimer = 0;
  private seedKey: string;

  private readonly progress: PlayerProgress;

  constructor(progress: PlayerProgress) {
    this.progress = progress;
    this.setup = this.currentSetup();
    this.seedKey = seedKeyOf(progress);
    this.plan = el("div", { hidden: progress.knownSeed === null }, renderRunePlanPanel(progress));
    this.afterPlan = el("div", { className: "page", hidden: true }, renderRunSteps(progress), renderAfterRun());
    this.stopButton.hidden = true;
    this.options.auto.addEventListener("change", () => this.input?.refresh());
    this.root = el(
      "div",
      { className: "page" },
      renderCalibrationBanner(progress),
      el(
        "section",
        { className: "panel" },
        el("header", { className: "panel-head" }, el("h2", { textContent: "Gamble window" })),
        el("p", {
          className: "lead",
          textContent:
            "Start a new game in Act 1, run straight to Gheed and fill in his first gamble window. Positions matter, and the top-left item is needed.",
        }),
        this.setupLine,
        this.inputBox,
        this.options.root,
        el("div", { className: "step-footer" }, this.stopButton, this.searchButton),
        this.searchBox,
        this.warning,
        this.matches,
        this.manualSeed(),
      ),
      this.plan,
      this.seedPlans,
      el(
        "div",
        { className: "new-run" },
        button("New Run", () => this.newRun(), "primary"),
        button("Wrong chest? Check out Refine", () => (location.hash = "#/refine"), "refine-cta"),
      ),
      this.afterPlan,
    );
    this.renderInput();
    progress.subscribe(() => this.changed());
    this.changed();
  }

  show(): void {
    if (this.run) return;
    this.setup = this.currentSetup();
    this.renderInput();
  }

  private changed(): void {
    const setup = this.currentSetup();
    if (setup === null) {
      this.setupLine.className = "lead error";
      this.setupLine.replaceChildren(
        "Set your character level, platform and version in ",
        el("a", { href: "#/calibrate", textContent: "Player Settings on the Calibrate page" }),
        " before filling in the gamble window.",
      );
    } else {
      const versionLabel = GAME_VERSIONS.find(({ id }) => id === setup.version)?.label ?? setup.version;
      const platformLabel = PLATFORMS.find(({ id }) => id === setup.platform)?.label ?? setup.platform;
      this.setupLine.className = "hint";
      this.setupLine.replaceChildren(
        `${versionLabel}, ${platformLabel}, character level ${setup.charLevel}. `,
        el("a", { href: "#/run", textContent: "Change in settings", onclick: openSettingsMenu }),
        ".",
      );
    }
    const seedKey = seedKeyOf(this.progress);
    if (seedKey !== this.seedKey) {
      this.seedKey = seedKey;
      if (!this.run && this.seedPlans.hidden) this.plan.hidden = this.progress.knownSeed === null;
    }
    this.afterPlan.hidden = this.progress.plan === null || (this.plan.hidden && this.seedPlans.hidden);
    if (this.run || JSON.stringify(setup) === JSON.stringify(this.setup)) return;
    this.setup = setup;
    this.renderInput();
  }

  private currentSetup(): Setup | null {
    const { platform, charLevel, version } = this.progress;
    if (platform === null || charLevel === null || version === null) return null;
    return { ...loadState().setup, version, platform, charLevel };
  }

  private renderInput(): BoardInput | null {
    this.boardKey = JSON.stringify(this.board);
    if (this.setup === null) {
      this.input = null;
      this.inputBox.replaceChildren();
      this.searchButton.disabled = true;
      this.options.root.hidden = true;
      return null;
    }
    this.options.root.hidden = false;
    const input = renderBoardInput(
      this.board,
      this.setup,
      (blocker) => {
        saveBoard(this.board);
        this.searchButton.disabled = blocker !== null || this.run !== null;
        this.autoSearch(blocker);
      },
      () => (this.options.auto.checked ? QUICK_ITEMS : null),
    );
    this.input = input;
    this.inputBox.replaceChildren(input.root);
    return input;
  }

  private autoSearch(blocker: string | null): void {
    const key = JSON.stringify(this.board);
    if (key === this.boardKey) return;
    this.boardKey = key;
    clearTimeout(this.autoTimer);
    if (!this.options.auto.checked || blocker !== null || searchedItems(this.board).length < QUICK_ITEMS) return;
    this.autoTimer = window.setTimeout(() => this.start(true), AUTO_DELAY_MS);
  }

  private newRun(): void {
    this.stop();
    this.board.length = 0;
    saveBoard(this.board);
    this.searchBox.hidden = true;
    this.warning.replaceChildren();
    this.matches.replaceChildren();
    this.seedInput.value = "";
    this.hidePlans();
    this.setup = this.currentSetup();
    this.renderInput()?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  private manualSeed(): HTMLElement {
    const input = this.seedInput;
    const error = el("span", { className: "error" });
    const use = () => {
      const gameSeed = parseSeed(input.value);
      if (gameSeed === null) {
        error.textContent = "Enter a whole number from 0 to 4294967295.";
        return;
      }
      error.textContent = "";
      const known = this.progress.knownSeed;
      const gameType = known?.gameSeed === gameSeed ? known.gameType : NORMAL_D2R_GAME.type;
      this.stop();
      this.progress.setKnownSeed({ gameSeed, gameType });
      this.showPlan();
    };
    input.addEventListener("input", () => (error.textContent = ""));
    input.addEventListener("keydown", (event) => event.key === "Enter" && use());
    let synced: string | null = null;
    const sync = () => {
      const known = this.progress.knownSeed;
      const key = seedKeyOf(this.progress);
      if (key === synced) return;
      synced = key;
      if (document.activeElement !== input && known) input.value = formatSeed(known.gameSeed);
    };
    this.progress.subscribe(sync);
    sync();
    return el(
      "div",
      { className: "manual-seed" },
      el("label", { textContent: "Manul Seed: (testing, or using last seed if you closed window)" }),
      input,
      button("Use seed", use, "primary"),
      error,
    );
  }

  private hidePlans(): void {
    this.plan.hidden = true;
    this.seedPlans.hidden = true;
    this.seedPlans.replaceChildren();
    this.afterPlan.hidden = true;
  }

  private start(scroll = false): void {
    if (this.setup === null) return;
    this.stop();
    const setup = structuredClone(this.setup);
    const board = structuredClone(this.board);
    const search: SeedSearch = new SeedSearch(searchParamsOf({ setup, board }), {
      onProgress: () => this.queueRefresh(),
      onEnd: (outcome, error) => this.ended(search, outcome, error),
    });
    const quick = this.options.quick.checked && searchedItems(board).length >= QUICK_ITEMS;
    this.run = { search, setup, board, shown: 0, rate: new RateMeter(), quick, stoppedOnFirst: false };
    this.warning.replaceChildren();
    this.matches.replaceChildren();
    this.hidePlans();
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

  private refresh(run: Search): void {
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

  private showNewMatches(run: Search): void {
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

  private useFirstMatch(run: Search, storeSeed: number): boolean {
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
    this.seedPlans.replaceChildren();
    this.plan.hidden = false;
    this.afterPlan.hidden = this.progress.plan === null;
    this.scrollTo(this.plan);
  }

  private showSeedPlans(gameSeeds: readonly number[]): void {
    this.plan.hidden = true;
    this.progress.retirePlan();
    this.seedPlans.replaceChildren(
      renderSeedPlans(
        this.progress,
        gameSeeds.map((gameSeed) => ({ gameSeed, gameType: NORMAL_D2R_GAME.type })),
        el(
          "p",
          { className: "lead warning" },
          el("strong", { textContent: `Your window comes from ${gameSeeds.length} different game seeds. ` }),
          "Restarting the game for a new window is safest. Otherwise pick a plan from one of them, " +
            `knowing it's wrong if that isn't your seed. A good rune with a short wait time, is probably worth the 1/${gameSeeds.length} shot at it.`,
        ),
      ),
    );
    this.seedPlans.hidden = false;
    this.scrollTo(this.seedPlans);
  }

  private renderMatch(run: Search, storeSeed: number, index: number): HTMLElement {
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
      el("div", { className: "candidate-body" }, renderMatchBody(storeSeed, run.setup, run.board, useSeed)),
    );
  }

  private ended(search: SeedSearch, outcome: SearchOutcome, error?: string): void {
    const run = this.run;
    if (run?.search !== search) return;
    this.run = null;
    this.showNewMatches(run);
    this.searchButton.disabled = this.setup === null;
    this.stopButton.hidden = true;
    this.stats.textContent = run.stoppedOnFirst
      ? `Stopped at ${((search.seedsTested / search.seedCount) * 100).toFixed(1)}%: used the first window found.`
      : endText(outcome, search, error);

    const found = search.matches;
    if (outcome === "complete" && found.length === 0) {
      this.searchBox.hidden = true;
      this.warning.replaceChildren(
        el(
          "div",
          { className: "no-match" },
          el("span", { className: "badge no-match-badge", textContent: "No window matches" }),
          el("p", {
            textContent: "Check the items and their positions, or your platform and character level. Fix them and search again, or start a fresh game for a new window.",
          }),
          el(
            "div",
            { className: "no-match-actions" },
            button("Check my items", () => {
              this.scrollTo(this.inputBox);
              this.inputBox.querySelector<HTMLElement>("input, select, button")?.focus({ preventScroll: true });
            }, "primary"),
            button("New Run", () => this.newRun()),
          ),
        ),
      );
      this.scrollTo(this.warning);
      return;
    }
    const gameSeeds = found.length === 1 ? gameSeedsFromStoreSeed(found[0], NORMAL_D2R_GAME.draws) : [];
    if (gameSeeds.length > 1 && (run.stoppedOnFirst || outcome === "complete")) this.showSeedPlans(gameSeeds);
    else if (outcome === "complete") this.scrollTo(this.plan.hidden ? this.matches : this.plan);
  }

  private scrollTo(element: HTMLElement): void {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function seedKeyOf(progress: PlayerProgress): string {
  const known = progress.knownSeed;
  return known ? `${known.gameSeed}:${known.gameType}` : "";
}

function renderCalibrationBanner(progress: PlayerProgress): HTMLElement {
  const root = el("section");
  const render = () => {
    const calibrated = CHEST_AREAS.filter(({ id }) => progress.isCalibrated(id));
    if (calibrated.length === 0) {
      root.className = "panel calibration-banner first-time";
      root.replaceChildren(
        el("header", { className: "panel-head" }, el("h2", { textContent: "First time here?" })),
        el(
          "p",
          { className: "lead" },
          "Plans need to know how long your route to the chest takes. That's a one-off: ",
          el("a", { href: "#/calibrate", textContent: "calibrate an area" }),
          " over a few games, then come back here for every run. New to super chests? Start with ",
          el("a", { href: "#/guide", textContent: "the guide" }),
          ".",
        ),
      );
      return;
    }
    root.className = "calibration-banner";
    root.replaceChildren(
      el(
        "p",
        { className: "hint" },
        "Calibrated: ",
        ...CHEST_AREAS.flatMap(({ id, name }, index) => {
          const distance = progress.distanceIn(id);
          return [
            index > 0 ? " · " : "",
            el("span", {
              className: distance === null ? "cal-missing" : "cal-ok",
              textContent: distance === null ? `✘ ${name}` : `✔ ${name} (${distance})`,
            }),
          ];
        }),
        ". ",
        el("a", { href: "#/calibrate", textContent: calibrated.length < CHEST_AREAS.length ? "Calibrate another area" : "Recalibrate" }),
      ),
    );
  };
  progress.subscribe(render);
  render();
  return root;
}

function renderRunSteps(progress: PlayerProgress): HTMLElement {
  const steps = el("ol", { className: "guide-steps" });
  const render = () => {
    const plan = progress.plan;
    if (plan) steps.replaceChildren(...runSteps(plan).map((step) => el("li", {}, ...step)));
  };
  progress.subscribe(render);
  render();
  return el(
    "section",
    { className: "panel guide" },
    el("header", { className: "panel-head" }, el("h2", { textContent: "Running your plan" })),
    steps,
  );
}

function runSteps(plan: PickedPlan): (string | Node)[][] {
  const area = chestArea(plan.area);
  const lk = plan.area === "lowerKurast";
  const viaRiver = plan.stops.at(-1) === RIVER_OF_FLAME;
  const hops = viaRiver ? plan.stops.slice(0, -1) : plan.stops;
  const tenths = waitTenths(plan.wait);
  const pace = hasRepeats(hops) ? "without waiting, counting your laps" : "without waiting";
  const travel: (string | Node)[] = [
    ...(hops.length > 0 ? [`Take waypoints through ${routeText(hops)} ${pace}, then `] : ["Take the Rogue Camp waypoint to "]),
    ...(viaRiver
      ? ["Act 4 River of Flame ", el("strong", { textContent: "on the timer's START (or start your stopwatch as you do)." })]
      : [`${area.name}.`]),
  ];
  const wait: (string | Node)[] =
    !viaRiver || tenths === 0
      ? [`Don't wait, ${lk ? "take the waypoint straight away." : "head to the chest straight away."}`]
      : [
          "Wait by the River of Flame waypoint for ",
          el("strong", { textContent: waitText(plan.wait).replace(/^Wait /, "") }),
          ", do not move or pause game.",
        ];
  return [
    ["Set ", el("strong", { textContent: `/players ${plan.players}` }), " if you haven't already."],
    ["Use the wait timer above (it beeps at 10 seconds left and the last 5 seconds), or have a stopwatch ready."],
    travel,
    wait,
    [
      lk
        ? "Take the waypoint to Act 3 Lower Kurast and go open your first chest as per your calibration route."
        : "Go open your first chest as per your calibration route.",
    ],
    ["Open all other super chests too for more attempts."],
  ];
}

function renderAfterRun(): HTMLElement {
  return el(
    "section",
    { className: "panel after-run" },
    el("header", { className: "panel-head" }, el("h2", { textContent: "After the run" })),
    el(
      "p",
      { className: "lead" },
      "Got your rune? Hit New Run for the next game. Missed it? Note what your planned chest dropped and ",
      el("a", { href: "#/refine", textContent: "check how close you landed" }),
      ". A few draws out is normal, but if you keep missing the same way your timing can be refined.",
    ),
  );
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
      if (count === 0) return "No window matches. Check the items and their positions, or your platform and character level.";
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
