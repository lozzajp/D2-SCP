import { WAYPOINT_TARGET, type KnownSeed, type PickedPlan, type PlanRoute, type PlanSort, type PlayerProgress, type RouteGap } from "../../app/progress";
import { planTables, type TableInput, type TableTarget } from "../../chest/allPlans";
import { CHEST_AREAS, PLAYER_COUNTS, chestArea, tableKey, type ChestAreaId, type PatternTable } from "../../chest/areas";
import { loadChestPatterns } from "../../chest/loadPatterns";
import type { ChestPatterns } from "../../chest/patterns";
import { rerollSeconds, runeChances, REROLL_SECONDS } from "../../chest/rerollValue";
import {
  AVAILABLE_ROUTE_MODES,
  CHEST_RUNES,
  chestRunes,
  FIRE_RATE_NOTE,
  isLongWait,
  LONG_WAIT_RUNE,
  MAX_BER_WAIT_SECONDS,
  MAX_WAIT_SECONDS,
  WAYPOINT_TOLERANCE,
  type RouteMode,
  type Rune,
  type RuneTarget,
} from "../../chest/runePlan";
import { RIVER_OF_FLAME, routeText, type WaypointId } from "../../chest/waypoints";
import { button, choiceTabs, el, field } from "../../ui/dom";
import { formatDuration, formatSeed, formatWait, plural, waitTenths } from "../../ui/format";
import { renderWaitTimer } from "./waitTimer";

const SHOWN_PLANS = 25;

type Tables = Map<string, ChestPatterns>;

let allTables: Promise<Tables> | undefined;

function loadAllTables(): Promise<Tables> {
  allTables ??= Promise.all(
    CHEST_AREAS.flatMap(({ id }) =>
      PLAYER_COUNTS.map((players) => loadChestPatterns({ area: id, players }).then((patterns) => [tableKey({ area: id, players }), patterns] as const)),
    ),
  ).then(
    (entries) => new Map(entries),
    (error: unknown) => {
      allTables = undefined;
      throw error;
    },
  );
  return allTables;
}

interface Planned {
  targets: TableTarget[];
  gaps: { area: ChestAreaId; gap: RouteGap }[];
  routes: Map<ChestAreaId, PlanRoute>;
}

function planFor(progress: PlayerProgress, seed: KnownSeed, tables: Tables): Planned {
  const inputs: TableInput[] = [];
  const gaps: Planned["gaps"] = [];
  const routes = new Map<ChestAreaId, PlanRoute>();
  for (const area of progress.planAreas) {
    const route = progress.planRoute(area);
    if (typeof route === "string") {
      gaps.push({ area, gap: route });
      continue;
    }
    routes.set(area, route);
    for (const players of progress.planPlayers) {
      const table = { area, players };
      inputs.push({ table, patterns: tables.get(tableKey(table))!, route });
    }
  }
  return { targets: planTables(inputs, seed, progress.minRune, progress.planSort), gaps, routes };
}

export function renderRunePlanPanel(progress: PlayerProgress): HTMLElement {
  const count = el("span", { className: "badge", hidden: true });
  const seedLine = el("p", { className: "hint" });
  const body = el("div", { className: "plan-body" }, el("p", { className: "muted", textContent: "Loading chest drop patterns…" }));
  const list = createPlanList(progress);
  let tables: Tables | undefined;

  function render(): void {
    const known = progress.knownSeed;
    seedLine.replaceChildren(
      ...(known
        ? ["For game seed ", el("code", { textContent: formatSeed(known.gameSeed) }), "."]
        : ["Find this game's seed above to see its plans."]),
    );
    count.hidden = true;
    if (!known || !tables) {
      body.replaceChildren(...(tables ? [] : [el("p", { className: "muted", textContent: "Loading chest drop patterns…" })]));
      return;
    }
    const shown = list.render(known, tables);
    count.hidden = false;
    count.textContent = `${plural(shown, "plan")}`;
    count.classList.toggle("done", shown > 0);
    body.replaceChildren(list.root);
  }

  progress.subscribe(render);
  render();
  loadAllTables().then(
    (loaded) => {
      tables = loaded;
      render();
    },
    (error: unknown) => body.replaceChildren(loadError(error)),
  );

  return el(
    "section",
    { className: "panel plans-panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Rune plans" }), count),
    seedLine,
    renderPlanFilters(progress),
    body,
    renderPlayersWarning(progress),
    renderWaitTimer(progress, renderPickedLine(progress)),
  );
}

export function renderSeedPlans(progress: PlayerProgress, seeds: readonly KnownSeed[], intro?: HTMLElement): HTMLElement {
  const sections = el("div", { className: "seed-plans" }, el("p", { className: "muted", textContent: "Loading chest drop patterns…" }));
  const lists = seeds.map((seed) => ({ seed, list: createPlanList(progress, seed) }));
  let tables: Tables | undefined;

  function render(): void {
    if (!tables) return;
    const loaded = tables;
    sections.replaceChildren(
      ...lists.map(({ seed, list }) => {
        list.render(seed, loaded);
        return el(
          "section",
          { className: "seed-plan" },
          el("h3", {}, "If your game seed is ", el("code", { textContent: formatSeed(seed.gameSeed) })),
          list.root,
        );
      }),
    );
  }

  progress.subscribe(render);
  loadAllTables().then(
    (loaded) => {
      tables = loaded;
      render();
    },
    (error: unknown) => sections.replaceChildren(loadError(error)),
  );

  return el(
    "section",
    { className: "panel plans-panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Rune plans per seed" })),
    renderPlanFilters(progress),
    intro ?? false,
    sections,
    renderPlayersWarning(progress),
    renderWaitTimer(progress, renderPickedLine(progress)),
  );
}

function renderPickedLine(progress: PlayerProgress): HTMLElement {
  const root = el("ol", { className: "draw-hits rune-plan picked-plan", hidden: true });
  let tables: Tables | undefined;

  function render(): void {
    const plan = progress.plan;
    const patterns = plan && tables?.get(tableKey(plan));
    root.hidden = !plan || !patterns;
    if (!plan || !patterns || !tables) return root.replaceChildren();
    const runes = chestRunes(patterns, plan.seed);
    const viaRiver = plan.stops.at(-1) === RIVER_OF_FLAME;
    const target: TableTarget = {
      ...plan,
      runes,
      needsLock: !runes.always.includes(plan.rune),
      start: plan.distance,
      off: viaRiver ? 0 : plan.distance - plan.draw,
    };
    root.replaceChildren(targetRow(target, null, verdicts(tables, plan.fireRate)(target).tag));
  }

  progress.subscribe(render);
  loadAllTables().then((loaded) => {
    tables = loaded;
    render();
  }, () => {});
  return root;
}

function renderPlayersWarning(progress: PlayerProgress): HTMLElement {
  const root = el("p", { className: "players-warning" });
  const render = () => {
    const last = progress.lastPlan;
    const plan = progress.plan;
    root.hidden = !last || !!plan;
    if (root.hidden || !last) return;
    const lastText = el("strong", { textContent: `/players ${last.players}` });
    const lastWhat = ` (${chestArea(last.area).name}, ${last.rune})`;
    root.className = "players-warning hint";
    root.replaceChildren(
      "Your last game was on ",
      lastText,
      `${lastWhat}. Pick a plan with a different player count and you'll need to change it in game.`,
    );
  };
  progress.subscribe(render);
  render();
  return root;
}

export function renderRunePreview(progress: PlayerProgress, seed: KnownSeed): HTMLElement {
  const root = el("div", { className: "rune-preview" }, el("p", { className: "muted", textContent: "Checking runes…" }));
  loadAllTables().then(
    (tables) => {
      const { targets, gaps } = planFor(progress, seed, tables);
      const minRune = progress.minRune;
      if (targets.length === 0) {
        root.replaceChildren(
          el(
            "p",
            { className: "muted" },
            gaps.length === progress.planAreas.length
              ? "Calibrate an area to see which runes you can plan for."
              : `No ${minRune} or better in reach for this seed.`,
          ),
        );
        return;
      }
      const byTable = new Map<string, TableTarget[]>();
      for (const target of targets) {
        const key = tableKey(target);
        byTable.set(key, [...(byTable.get(key) ?? []), target]);
      }
      root.replaceChildren(
        el("p", { className: "lead", textContent: `Runes you can plan for (${minRune}+):` }),
        el(
          "ul",
          { className: "rune-summary" },
          ...[...byTable.values()].map((found) =>
            el("li", {}, tableTag(found[0]), " ", ...runeSummary(found)),
          ),
        ),
      );
    },
    () => root.replaceChildren(el("p", { className: "muted", textContent: "Couldn't load chest patterns to check runes." })),
  );
  return root;
}

function createPlanList(progress: PlayerProgress, forSeed?: KnownSeed): { root: HTMLElement; render(seed: KnownSeed, tables: Tables): number } {
  const root = el("div", { className: "plan-list" });
  let showAll = false;
  let lastSeed = "";

  function render(seed: KnownSeed, tables: Tables): number {
    const seedKey = `${seed.gameSeed}:${seed.gameType}`;
    if (seedKey !== lastSeed) {
      lastSeed = seedKey;
      showAll = false;
    }
    const { targets, gaps, routes } = planFor(progress, seed, tables);
    const verdict = verdicts(tables, progress.settings.fireRate ?? 1);
    const notes = gaps.map(({ area, gap }) => gapNote(progress, area, gap));
    if (progress.planAreas.length === 0 || progress.planPlayers.length === 0) {
      root.replaceChildren(el("p", { className: "lead", textContent: "Pick at least one area and player count above to see plans." }));
      return 0;
    }
    if (targets.length === 0) {
      root.replaceChildren(
        ...notes,
        ...(routes.size > 0
          ? [
              el("p", {
                className: "lead error",
                textContent: `No ${progress.minRune} or better in reach for this seed. Reroll the game for a new seed, try another route or player count, or lower your lowest rune.`,
              }),
            ]
          : []),
      );
      return 0;
    }
    const shown = showAll ? targets : targets.slice(0, SHOWN_PLANS);
    const noneWorth = targets.every((target) => !verdict(target).worth);
    root.replaceChildren(
      ...notes,
      ...(noneWorth
        ? [el("p", { className: "lead warning", textContent: "None of these beat rerolling on average, so a new game is likely the faster bet." })]
        : []),
      el(
        "ol",
        { className: "draw-hits rune-plan" },
        ...shown.map((target) => targetRow(target, pickButton(target, routes.get(target.area)!), verdict(target).tag)),
      ),
      ...(targets.length > shown.length
        ? [
            el(
              "div",
              { className: "step-footer" },
              button(`Show all ${targets.length} plans`, () => {
                showAll = true;
                render(seed, tables);
              }, "small"),
            ),
          ]
        : []),
    );
    return targets.length;

    function pickButton(target: TableTarget, route: PlanRoute): HTMLButtonElement {
      const picked = progress.plan;
      const known = progress.knownSeed;
      const isPicked =
        !!picked &&
        known?.gameSeed === seed.gameSeed &&
        tableKey(picked) === tableKey(target) &&
        picked.draw === target.draw &&
        picked.seed === target.seed &&
        sameStops(picked.stops, target.stops);
      return button(
        isPicked ? "Planned" : "Use this plan",
        () => {
          if (forSeed) progress.setKnownSeed(forSeed);
          progress.setPlan(planOf(target, route.fireRate));
          const timer = root.closest(".plans-panel")?.querySelector(".wait-timer");
          requestAnimationFrame(() => timer?.scrollIntoView({ behavior: "smooth", block: "start" }));
        },
        isPicked ? "small" : "small primary",
      );
    }
  }

  return { root, render };
}

const SORT_TABS: readonly { id: PlanSort; label: string }[] = [
  { id: "soonest", label: "Soonest first" },
  { id: "best", label: "Best rune first" },
];

const MODE_TABS: readonly { id: RouteMode; label: string }[] = [
  { id: "wait", label: "River of Flame wait" },
  { id: "waypoints", label: "Waypoints only" },
  { id: "combo", label: "Waypoints + River of Flame" },
];

const MODE_HINTS: Partial<Record<RouteMode, string>> = {
  wait: "Go to River of Flame and wait, then take the waypoint to Lower Kurast or walk to the River of Flame chest.",
  waypoints: `Hop through measured waypoints, no waiting, landing within ${WAYPOINT_TOLERANCE} draws of the chest. Less exact than waiting: each stop adds its own variance. River of Flame plans use your Lower Kurast waypoint calibrations.`,
  combo: "Hop through measured waypoints to get as close as possible, then River of Flame and wait out the rest. River of Flame plans use your Lower Kurast waypoint calibrations.",
};

export function renderPlanFilters(progress: PlayerProgress): HTMLElement {
  const root = el("div", { className: "plan-filters" });
  const minRune = el("select", {}, ...CHEST_RUNES.map((rune) => el("option", { value: rune, textContent: `${rune} or better` })));
  minRune.addEventListener("change", () => {
    const rune = CHEST_RUNES.find((chestRune) => chestRune === minRune.value);
    if (rune) progress.setMinRune(rune);
  });
  const areas = el("div", {});
  const players = el("div", {});
  const sort = el("div", {});
  const modes = el("div", {});
  const modeHint = el("p", { className: "hint" });
  const coarseBadge = el("span", { className: "badge coarse-badge", textContent: "Waypoints are coarse jumps, more inaccurate than waiting, unless you spent time calibrating them very well." });
  const modeField = field("Route", modes);

  function render(): void {
    areas.replaceChildren(
      toggleChips(
        CHEST_AREAS.map(({ id, name }) => ({ id, label: progress.isCalibrated(id) ? name : `${name} (not calibrated)` })),
        progress.planAreas,
        (area) => progress.togglePlanArea(area),
      ),
    );
    players.replaceChildren(
      toggleChips(
        PLAYER_COUNTS.map((count) => ({ id: count, label: `/players ${count}` })),
        progress.planPlayers,
        (count) => progress.togglePlanPlayers(count),
      ),
    );
    sort.replaceChildren(choiceTabs(SORT_TABS, progress.planSort, (picked) => progress.setPlanSort(picked)));
    modes.replaceChildren(
      choiceTabs(MODE_TABS.filter((tab) => AVAILABLE_ROUTE_MODES.includes(tab.id)), progress.routeMode, (picked) => progress.setRouteMode(picked)),
    );
    modeHint.textContent = MODE_HINTS[progress.routeMode] ?? "";
    coarseBadge.hidden = progress.routeMode !== "waypoints" && progress.routeMode !== "combo";
    minRune.value = progress.minRune;
  }

  progress.subscribe(render);
  render();
  root.append(
    field("Areas", areas),
    field("Players", players),
    field("Lowest rune", minRune),
    modeField,
    coarseBadge,
    modeHint,
    field("Sort", sort),
    el(
      "details",
      { className: "advanced" },
      el("summary", { textContent: "How plans are chosen" }),
      el("p", {
        textContent:
          "Every area and /players setting drops different items from the same chest seeds, so plans cover each one you have switched on. " +
          "Each plan is tagged with its area and player count: set that in game before you open the chest.",
      }),
      el("p", {
        textContent: `Waits stop at ${MAX_WAIT_SECONDS / 60} minutes, or ${MAX_BER_WAIT_SECONDS / 60} minutes for ${LONG_WAIT_RUNE} or better since they're so rare. Past that you're better off rerolling the game.`,
      }),
      el("p", {
        textContent: `Each plan says whether it beats rerolling, which takes about ${REROLL_SECONDS / 60} minute per new game and seed search on average.`,
      }),
      el("p", {
        textContent:
          "If you're lucky to have some grouped together within 100 draws, pick the earliest one to increase chances of it appearing in a later chest or later runes popping later too.",
      }),
    ),
  );
  return root;
}

function toggleChips<T>(options: readonly { id: T; label: string }[], selected: readonly T[], onToggle: (id: T) => void): HTMLElement {
  const chips = el("div", { className: "tabs" });
  for (const option of options) {
    const on = selected.includes(option.id);
    const chip = button(option.label, () => onToggle(option.id), on ? "tab active" : "tab");
    chip.setAttribute("aria-pressed", String(on));
    chips.append(chip);
  }
  return chips;
}

function gapNote(progress: PlayerProgress, area: ChestAreaId, gap: RouteGap): HTMLElement {
  const name = chestArea(area).name;
  const calibrate = (text: string) =>
    el("a", { href: "#/calibrate", textContent: text, onclick: () => progress.setArea(area) });
  switch (gap) {
    case "direct":
      return el("p", { className: "hint" }, `${name} isn't calibrated yet: `, calibrate("calibrate it once"), " to add its plans.");
    case "fireRate":
      return el("p", { className: "lead" }, ...fireRateField(progress));
    case "river":
      return el(
        "p",
        { className: "hint" },
        `${name} waits need River of Flame measured: `,
        calibrate("calibrate it"),
        ", or switch its route to Waypoints only.",
      );
    case "waypoints": {
      const from = progress.waypointAreaFor(area);
      const link = el("a", { href: "#/calibrate", textContent: "calibrate them", onclick: () => progress.setCalibrateTarget(WAYPOINT_TARGET) });
      const shared = from === area ? "" : ` (shared from ${chestArea(from).name} Waypoint Hopping)`;
      return el("p", { className: "hint" }, `${name} waypoint routes need some measured waypoints${shared}: `, link, ".");
    }
  }
}

function fireRateField(progress: PlayerProgress): (Node | string)[] {
  const input = el("input", { type: "number", step: "0.1", min: "0", placeholder: "1.0 - 3.0" });
  input.addEventListener("change", () => {
    const value = Number(input.value);
    progress.updateSettings({ fireRate: input.value.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null });
  });
  return ["Enter your fire rate to see plans: ", el("span", { className: "with-unit" }, input, "×/s"), el("span", { className: "hint", textContent: ` (${FIRE_RATE_NOTE})` })];
}

function loadError(error: unknown): HTMLElement {
  return el("p", { className: "lead error", textContent: error instanceof Error ? error.message : "Couldn't load chest patterns." });
}

function planOf(target: TableTarget, fireRate: number): PickedPlan {
  const { draw, seed, rune, wait, start, stops, area, players } = target;
  return { draw, seed, rune, wait, distance: start, fireRate, stops, area, players };
}

function sameStops(a: readonly WaypointId[], b: readonly WaypointId[]): boolean {
  return a.length === b.length && a.every((stop, index) => stop === b[index]);
}

export function tableTag(table: PatternTable): HTMLElement {
  const tag = el("span", { className: "badge table-badge", textContent: `${chestArea(table.area).short} · /players ${table.players}` });
  tag.dataset.area = table.area;
  tag.title = `${chestArea(table.area).name}, /players ${table.players}`;
  return tag;
}

function routeTag(target: RuneTarget): HTMLElement | false {
  if (target.stops.length === 1 && target.stops[0] === RIVER_OF_FLAME) return false;
  const off = target.off === 0 ? "" : `, about ${Math.abs(target.off)} draws ${target.off < 0 ? "early" : "late"}`;
  return el("span", { className: "muted", textContent: `Route: ${routeText(target.stops)}${off}` });
}

interface Verdict {
  worth: boolean;
  tag: HTMLElement;
}

function verdicts(tables: Tables, fireRate: number): (target: TableTarget) => Verdict {
  const averages = new Map<string, number>();
  return (target) => {
    const key = `${tableKey(target)}:${target.rune}`;
    let average = averages.get(key);
    if (average === undefined) {
      const chances = runeChances(tables.get(tableKey(target))!);
      average = rerollSeconds(chances.get(target.rune) ?? 0, fireRate, target.rune);
      averages.set(key, average);
    }
    const worth = target.wait <= average;
    return {
      worth,
      tag: el("span", {
        className: worth ? "verdict worth" : "verdict reroll",
        textContent: `${worth ? "Beats rerolling" : "Reroll is faster"} (avg ${formatDuration(average)})`,
        title: `Rerolling until you get ${target.rune} or better takes about ${formatDuration(average)} on average.`,
      }),
    };
  };
}

export function waitText(wait: number): string {
  const tenths = waitTenths(wait);
  if (tenths === 0) return "No wait";
  return tenths < 600 ? `Wait ${formatWait(wait)}` : `Wait ${formatWait(wait)} (${(tenths / 10).toFixed(1)}s)`;
}

function targetRow(target: TableTarget, pick: HTMLButtonElement | null, verdict: HTMLElement): HTMLElement {
  const others = [...target.runes.always, ...target.runes.ifLocked.map((rune) => `${rune} (if locked)`)];
  others.splice(others.indexOf(target.needsLock ? `${target.rune} (if locked)` : target.rune), 1);
  const rune = el("span", { className: "chest-item", textContent: `${target.rune} Rune` });
  rune.dataset.category = "rune";
  const long = isLongWait(target);
  return el(
    "li",
    { className: long ? "long-wait" : "" },
    el("strong", { textContent: waitText(target.wait) }),
    rune,
    tableTag(target),
    long && el("span", { className: "long-wait-tag", textContent: `Long ${target.rune} wait, past the usual ${MAX_WAIT_SECONDS / 60} minutes` }),
    verdict,
    target.needsLock && el("span", { className: "badge locked-badge", textContent: "Locked Chest (21% Spawn Chance)" }),
    routeTag(target),
    el("span", { className: "muted" }, `Draw ${target.draw}, chest seed `, el("code", { textContent: String(target.seed) })),
    others.length > 0 && el("span", { className: "muted", textContent: `Also ${others.join(", ")}` }),
    pick ?? false,
  );
}

function runeSummary(targets: readonly RuneTarget[]): (Node | string)[] {
  const byRune = new Map<Rune, RuneTarget[]>();
  for (const target of targets) byRune.set(target.rune, [...(byRune.get(target.rune) ?? []), target]);
  const runes = [...byRune.keys()].sort((a, b) => CHEST_RUNES.indexOf(b) - CHEST_RUNES.indexOf(a));
  return runes.flatMap((rune, index) => {
    const found = byRune.get(rune)!;
    const soonest = Math.min(...found.map((target) => target.wait));
    const count = found.length > 1 ? ` ×${found.length}` : "";
    const wait = soonest > 0 ? ` (from ${formatDuration(soonest)})` : "";
    return [index > 0 ? ", " : "", el("strong", { textContent: rune }), `${count}${wait}`];
  });
}
