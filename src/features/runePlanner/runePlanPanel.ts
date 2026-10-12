import type { KnownSeed, PickedPlan, PlayerProgress } from "../../app/progress";
import { MAX_CHEST_DRAWS } from "../../chest/chestStream";
import { loadChestPatterns } from "../../chest/loadPatterns";
import type { ChestPatterns } from "../../chest/patterns";
import {
  AVAILABLE_ROUTE_MODES,
  CHEST_RUNES,
  FIRE_RATE_NOTE,
  allowsLongWait,
  isLongWait,
  LONG_WAIT_RUNE,
  MAX_BER_WAIT_SECONDS,
  MAX_REPEAT_DRAW,
  MAX_WAIT_SECONDS,
  planRunes,
  WAYPOINT_TOLERANCE,
  type RouteMode,
  type Rune,
  type RunePlanOptions,
  type RuneTarget,
} from "../../chest/runePlan";
import { RIVER_OF_FLAME, routeText, type WaypointId } from "../../chest/waypoints";
import { button, choiceTabs, el, field } from "../../ui/dom";
import { formatDuration, formatSeed, formatWait, plural, waitTenths } from "../../ui/format";
import { rerollSeconds, runeChances, REROLL_SECONDS } from "../../chest/rerollValue";
import { renderWaitTimer } from "./waitTimer";

export interface RunePlanPanelOptions {
  showEarly?: boolean;
}

export function renderRunePlanPanel(progress: PlayerProgress, { showEarly = false }: RunePlanPanelOptions = {}): HTMLElement {
  const count = el("span", { className: "badge" });
  const status = el("p", { className: "lead" });
  const results = el("div", {});
  let patterns: ChestPatterns | undefined;

  const distance = numberInput("1", "1", String(MAX_CHEST_DRAWS), "e.g. 72", (value) =>
    progress.updateSettings({ distanceToFirstChest: value }),
  );
  const fireRate = numberInput("0.1", "0", "", "1.0 - 3.0", (value) =>
    progress.updateSettings({ fireRate: value }),
  );
  const riverAdds = el("span", { className: "hint" });
  const modeTabs = el("div", {});
  const modeHint = el("p", { className: "hint" });
  const minRune = el("select", {}, ...progress.chestRunes.map((rune) => el("option", { value: rune, textContent: `${rune} or better` })));
  minRune.addEventListener("change", () => {
    const rune = progress.chestRunes.find((chestRune) => chestRune === minRune.value);
    if (rune) progress.setMinRune(rune);
  });
  const waypoints = progress.hasWaypointRoutes;

  function render(): void {
    const settings = progress.settings;
    if (document.activeElement !== distance) distance.value = settings.distanceToFirstChest?.toString() ?? "";
    if (document.activeElement !== fireRate) fireRate.value = settings.fireRate?.toString() ?? "";
    minRune.value = progress.minRune;
    const adds = progress.riverAdds;
    riverAdds.textContent = !waypoints
      ? "Your Direct draw, then wait by the River of Flame waypoint"
      : adds === null
        ? "River of Flame not measured yet"
        : `+ ${adds} for River of Flame = draw ${progress.riverStart ?? "—"}`;
    const mode = progress.routeMode;
    modeTabs.replaceChildren(
      choiceTabs(
        MODE_TABS.filter((tab) => AVAILABLE_ROUTE_MODES.includes(tab.id)),
        mode,
        (picked) => progress.setRouteMode(picked),
      ),
    );
    modeHint.textContent = waypoints ? MODE_HINTS[mode] : "Go to River of Flame, wait by the waypoint, then walk to the chest.";
    count.textContent = "";
    count.hidden = true;
    results.replaceChildren();

    const known = progress.knownSeed;
    const routing = routeOptions(progress);
    const missing = !known
      ? ["You'll need this game's seed first: ", el("a", { href: "#/seed", textContent: "find it in step 1" }), "."]
      : !("distance" in routing)
        ? routing
        : !patterns
          ? ["Loading chest drop patterns…"]
          : null;
    if (missing) {
      status.className = "lead";
      status.replaceChildren(...missing);
      return;
    }
    const options = routing as RouteOptions;

    const plan = planRunes(patterns!, {
      gameSeed: known!.gameSeed,
      gameType: known!.gameType,
      ...options,
      minRune: progress.minRune,
      includeEarly: showEarly && mode === "wait",
    });
    const early = earlyList(plan.early, options.distance);
    if (plan.targets.length === 0) {
      status.className = "lead error";
      const next = plan.next ? ` The next one is about ${formatDuration(plan.next.wait)} away.` : "";
      status.textContent = `${noTargetsText(progress.minRune, mode)}${next} Reroll the game for a new seed, try another route, or lower your minimum rune.`;
      if (early) results.replaceChildren(early);
      return;
    }
    count.textContent = `${plural(plan.targets.length, "Plan")} Available`;
    count.hidden = false;
    count.classList.add("done");
    status.className = "lead";
    const verdict = verdicts(patterns!, options.fireRate);
    const noneWorth = plan.targets.every((target) => !verdict(target).worth);
    status.textContent =
      "Rune plans, pick one, if you're lucky to have some grouped together within 100 draws, pick the earliest one to increase chances of it appearing in a later chest or later runes popping later too:" +
      (noneWorth ? " None of these beat rerolling on average, so a new game is likely the faster bet." : "");
    results.replaceChildren(
      ...(early ? [early] : []),
      el(
        "ol",
        { className: "draw-hits rune-plan" },
        ...plan.targets.map((target) =>
          targetRow(target, pickButton(target, options.fireRate), waitText(target.wait), verdict(target).tag),
        ),
      ),
    );
  }

  function pickButton(target: RuneTarget, fireRate: number): HTMLButtonElement {
    const picked = progress.plan;
    const isPicked = picked?.draw === target.draw && picked.seed === target.seed && sameStops(picked.stops, target.stops);
    return button(
      isPicked ? "Planned" : "Use this plan",
      () => {
        progress.setPlan(planOf(target, fireRate));
        timer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      },
      isPicked ? "small" : "small primary",
    );
  }

  const timer = renderWaitTimer(progress);

  progress.subscribe(render);
  render();
  loadChestPatterns(progress.chestTable).then(
    (loaded) => {
      patterns = loaded;
      render();
    },
    (error: unknown) => {
      status.className = "lead error";
      status.textContent = error instanceof Error ? error.message : "Couldn't load chest patterns.";
    },
  );

  return el(
    "section",
    { className: "panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Your rune plans" }), count),
    field("Distance to first chest", distance, riverAdds),
    field("Fire rate", el("span", { className: "with-unit" }, fireRate, "×/s"), el("span", { className: "hint", textContent: `(${FIRE_RATE_NOTE})` })),
    field("Keep runes", minRune),
    waypoints && field("Route", modeTabs),
    modeHint,
    el("p", {
      className: "hint",
      textContent: `Waits stop at ${MAX_WAIT_SECONDS}s (${MAX_WAIT_SECONDS / 60} minutes), or ${MAX_BER_WAIT_SECONDS / 60} minutes for ${LONG_WAIT_RUNE} or better since they're so rare. If your rune needs longer than that, you're better off rerolling the game and seed.`,
    }),
    el("p", {
      className: "hint",
      textContent: `Each plan says whether it beats rerolling, which takes about ${REROLL_SECONDS / 60} minute per new game and seed search on average.`,
    }),
    status,
    results,
    timer,
  );
}

export function renderSeedPlans(progress: PlayerProgress, seeds: readonly KnownSeed[], onPick: () => void): HTMLElement {
  const root = el("div", { className: "seed-plans" }, el("p", { className: "muted", textContent: "Loading chest drop patterns…" }));
  const routing = routeOptions(progress);
  if (!("distance" in routing)) {
    root.replaceChildren(el("p", { className: "muted" }, ...routing));
    return root;
  }
  const options = routing;
  const mode = progress.routeMode;

  const render = (patterns: ChestPatterns) => {
    const verdict = verdicts(patterns, options.fireRate);
    root.replaceChildren(
      ...seeds.map((seed) => {
        const plan = planRunes(patterns, { ...seed, ...options, minRune: progress.minRune, includeEarly: mode === "wait" });
        const early = earlyList(plan.early, options.distance);
        const pick = (target: RuneTarget) => {
          const known = progress.knownSeed;
          const picked = progress.plan;
          const isPicked =
            known?.gameSeed === seed.gameSeed &&
            picked?.draw === target.draw &&
            picked.seed === target.seed &&
            sameStops(picked.stops, target.stops);
          return button(
            isPicked ? "Planned" : "Use this plan",
            () => {
              progress.setKnownSeed(seed);
              progress.setPlan(planOf(target, options.fireRate));
              render(patterns);
              timerBox.hidden = false;
              timerBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
              onPick();
            },
            isPicked ? "small" : "small primary",
          );
        };
        return el(
          "section",
          { className: "panel" },
          el(
            "header",
            { className: "panel-head" },
            el("h2", {}, "Plans if your game seed is ", el("code", { textContent: formatSeed(seed.gameSeed) })),
          ),
          early,
          plan.targets.length === 0
            ? el("p", { className: "muted", textContent: noTargetsText(progress.minRune, mode) })
            : el(
                "ol",
                { className: "draw-hits rune-plan" },
                ...plan.targets.map((target) => targetRow(target, pick(target), waitText(target.wait), verdict(target).tag)),
              ),
        );
      }),
      timerBox,
    );
  };
  const timerBox = el("div", { className: "panel", hidden: true }, renderWaitTimer(progress));
  loadChestPatterns(progress.chestTable).then(render, (error: unknown) => {
    root.replaceChildren(
      el("p", { className: "lead error", textContent: error instanceof Error ? error.message : "Couldn't load chest patterns." }),
    );
  });
  return root;
}

export function renderRunePreview(progress: PlayerProgress, seed: KnownSeed, suggestCalibration = true): HTMLElement {
  const current = el("p", { className: "muted", textContent: "Checking runes…" });
  const others = el("p", { className: "hint", hidden: true });
  const root = el("div", { className: "rune-preview" }, current, others);
  const routing = routeOptions(progress);
  if (!("distance" in routing)) {
    current.replaceChildren("To see the runes you can plan for: ", ...routing);
    return root;
  }
  const options = routing;
  const minRune = progress.minRune;
  const mode = progress.routeMode;
  const targetsFor = (patterns: ChestPatterns) => planRunes(patterns, { ...seed, ...options, minRune }).targets;
  loadChestPatterns(progress.chestTable).then(
    (patterns) => {
      const targets = targetsFor(patterns);
      if (targets.length === 0) {
        const none = noTargetsText(minRune, mode);
        current.replaceChildren(
          ...(suggestCalibration
            ? [`${none} This is a good opportunity to `, el("a", { href: "#/calibrate", textContent: "calibrate another route" }), "."]
            : [none]),
        );
      } else {
        current.className = "lead";
        current.replaceChildren(`Runes you can plan for (${minRune}+): `, ...runeSummary(targets, mode), ".");
      }
      renderOtherPlayers(progress, others, targetsFor, mode);
    },
    () => {
      current.textContent = "Couldn't load chest patterns to check runes.";
    },
  );
  return root;
}

function renderOtherPlayers(
  progress: PlayerProgress,
  root: HTMLElement,
  targetsFor: (patterns: ChestPatterns) => RuneTarget[],
  mode: RouteMode,
): void {
  const area = progress.area.id;
  const counts = progress.area.players.filter((players) => players !== progress.players);
  if (counts.length === 0) return;
  Promise.all(counts.map((players) => loadChestPatterns({ area, players }))).then(
    (tables) => {
      const found = counts
        .map((players, index) => ({ players, targets: targetsFor(tables[index]) }))
        .filter(({ targets }) => targets.length > 0);
      root.hidden = false;
      if (found.length === 0) {
        root.textContent = `Other player counts (${counts.map((players) => `/players ${players}`).join(", ")}) have no ${progress.minRune}+ in reach either.`;
        return;
      }
      root.replaceChildren(
        "Other player counts change what the chests drop: ",
        ...found.flatMap(({ players, targets }, index) => [
          index > 0 ? "; " : "",
          button(`/players ${players}`, () => progress.setPlayers(players), "small"),
          " ",
          ...runeSummary(targets, mode),
        ]),
        ". Pick one to switch, then type it in game before opening the chest.",
      );
    },
    () => {},
  );
}

function runeSummary(targets: readonly RuneTarget[], mode: RouteMode): (Node | string)[] {
  const byRune = new Map<Rune, RuneTarget[]>();
  for (const target of targets) byRune.set(target.rune, [...(byRune.get(target.rune) ?? []), target]);
  const runes = [...byRune.keys()].sort((a, b) => CHEST_RUNES.indexOf(b) - CHEST_RUNES.indexOf(a));
  const noWaits = mode === "waypoints" || mode === "repeats";
  return runes.flatMap((rune, index) => {
    const found = byRune.get(rune)!;
    const soonest = Math.min(...found.map((target) => target.wait));
    const count = found.length > 1 ? ` ×${found.length}` : "";
    const wait = noWaits ? "" : ` (from ${formatDuration(soonest)})`;
    return [index > 0 ? ", " : "", el("strong", { textContent: rune }), `${count}${wait}`];
  });
}

function numberInput(
  step: string,
  min: string,
  max: string,
  placeholder: string,
  onChange: (value: number | null) => void,
): HTMLInputElement {
  const input = el("input", { type: "number", step, min, max, placeholder });
  input.addEventListener("change", () => onChange(input.value.trim() === "" ? null : Number(input.value)));
  return input;
}

function noTargetsText(minRune: Rune, mode: RouteMode): string {
  if (mode === "waypoints") return `No ${minRune} or better within ${WAYPOINT_TOLERANCE} draws of a waypoint route.`;
  if (mode === "repeats") return `No ${minRune} or better up to draw ${MAX_REPEAT_DRAW.toLocaleString("en-US")}.`;
  if (allowsLongWait(minRune)) return `No ${minRune}${minRune === CHEST_RUNES.at(-1) ? "" : " or better"} within ${MAX_BER_WAIT_SECONDS}s.`;
  return `No ${minRune} or better within ${MAX_WAIT_SECONDS}s, or ${LONG_WAIT_RUNE} or better within ${MAX_BER_WAIT_SECONDS}s.`;
}

const MODE_TABS: readonly { id: RouteMode; label: string }[] = [
  { id: "wait", label: "River of Flame wait" },
  { id: "waypoints", label: "Waypoints only" },
  { id: "combo", label: "Waypoints + River of Flame" },
  { id: "repeats", label: "Waypoints with repeats" },
];

const MODE_HINTS: Record<RouteMode, string> = {
  wait: "Go to River of Flame, wait, then Lower Kurast.",
  waypoints: `Hop through measured waypoints, no waiting, landing within ${WAYPOINT_TOLERANCE} draws of the chest. Less exact than waiting: each stop adds its own variance.`,
  combo: "Hop through measured waypoints to get as close as possible, then River of Flame and wait out the rest.",
  repeats:
    `Lap every measured waypoint in act order as many times as needed, then a last pass through the ones that land nearest, to reach chests up to draw ${MAX_REPEAT_DRAW.toLocaleString("en-US")}: for rare runes no wait can reach. ` +
    "By the time a lap brings you back, each area has been empty long enough to reload. Assumes every visit adds its calibrated draws again, " +
    "so it's rough: errors add up over many visits.",
};

type RouteOptions = Pick<RunePlanOptions, "distance" | "fireRate" | "mode" | "direct" | "waypointAdds">;

function routeOptions(progress: PlayerProgress): RouteOptions | (string | Node)[] {
  const { distanceToFirstChest: direct, fireRate } = progress.settings;
  const mode = progress.routeMode;
  const adds = progress.waypointAdds;
  if (direct === null) {
    return ["Enter your distance to first chest. ", el("a", { href: "#/calibrate", textContent: "Calibrate Direct in step 2" }), " if you haven't yet."];
  }
  if (fireRate === null) return [`Enter your fire rate (${FIRE_RATE_NOTE}).`];
  if (mode === "waypoints" || mode === "repeats") {
    const needed = mode === "repeats" ? 2 : 1;
    if ([...adds.values()].filter((value) => value > 0).length < needed) {
      return [
        mode === "repeats" ? "Measure at least two waypoints first: " : "Measure some waypoints first: ",
        el("a", { href: "#/calibrate", textContent: "calibrate them in step 2" }),
        ".",
      ];
    }
    return { distance: direct, direct, fireRate, mode, waypointAdds: adds };
  }
  const river = progress.riverStart;
  if (river === null) return ["Measure River of Flame: ", el("a", { href: "#/calibrate", textContent: "calibrate it in step 2" }), "."];
  return { distance: river, direct, fireRate, mode, waypointAdds: adds };
}

function planOf(target: RuneTarget, fireRate: number): PickedPlan {
  const { draw, seed, rune, wait, start, stops } = target;
  return { draw, seed, rune, wait, distance: start, fireRate, stops };
}

function sameStops(a: readonly WaypointId[], b: readonly WaypointId[]): boolean {
  return a.length === b.length && a.every((stop, index) => stop === b[index]);
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

function verdicts(patterns: ChestPatterns, fireRate: number): (target: RuneTarget) => Verdict {
  const chances = runeChances(patterns);
  const averages = new Map<Rune, number>();
  return (target) => {
    let average = averages.get(target.rune);
    if (average === undefined) {
      average = rerollSeconds(chances.get(target.rune) ?? 0, fireRate, target.rune);
      averages.set(target.rune, average);
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

function earlyList(early: readonly RuneTarget[], distance: number): HTMLElement | null {
  if (early.length === 0) return null;
  return el(
    "div",
    { className: "too-early" },
    el("p", {
      className: "hint",
      textContent: `Too early, for interest: these land before leaving River of Flame straight away (draw ${distance}), so you can't wait for them. One just short of it might still drop if you leave straight away.`,
    }),
    el(
      "ol",
      { className: "draw-hits rune-plan" },
      ...early.map((target) => targetRow(target, null, `${plural(distance - target.draw, "draw")} early`)),
    ),
  );
}

function targetRow(
  target: RuneTarget,
  pick: HTMLButtonElement | null,
  label = waitText(target.wait),
  verdict: HTMLElement | null = null,
): HTMLElement {
  const others = [
    ...target.runes.always,
    ...target.runes.ifLocked.map((rune) => `${rune} (if locked)`),
  ];
  others.splice(others.indexOf(target.needsLock ? `${target.rune} (if locked)` : target.rune), 1);
  const rune = el("span", { className: "chest-item", textContent: `${target.rune} Rune` });
  rune.dataset.category = "rune";
  const long = isLongWait(target);
  return el(
    "li",
    { className: long ? "long-wait" : "" },
    el("strong", { textContent: label }),
    rune,
    long && el("span", { className: "long-wait-tag", textContent: `Long ${target.rune} wait, past the usual ${MAX_WAIT_SECONDS / 60} minutes` }),
    verdict,
    target.needsLock && el("span", { className: "badge locked-badge", textContent: "Locked Chest (21% Spawn Chance)" }),
    routeTag(target),
    el("span", { className: "muted" }, `Draw ${target.draw}, chest seed `, el("code", { textContent: String(target.seed) })),
    others.length > 0 && el("span", { className: "muted", textContent: `Also ${others.join(", ")}` }),
    pick,
  );
}
