import { GAME_TYPE_LABELS, type PickedPlan, type PlayerProgress } from "../../app/progress";
import type { ChestSearch } from "../../chest/chestSeedMatcher";
import { MAX_CHEST_DRAWS, chestSeedStream, findChestDraws, type DrawHit } from "../../chest/chestStream";
import { refineAdvice } from "../../chest/refine";
import { MAX_WAIT_SECONDS } from "../../chest/runePlan";
import { routeName, routeText } from "../../chest/waypoints";
import { button, el } from "../../ui/dom";
import { formatSeed, plural } from "../../ui/format";
import { waitText } from "../runePlanner/runePlanPanel";

const SHOWN = 10;
const RECALIBRATE_WITHIN = 100;

export interface RefinePanel {
  root: HTMLElement;
  setSearch(search: ChestSearch | undefined): void;
}

export function renderPlanSummary(progress: PlayerProgress): HTMLElement {
  const body = el("div", {});
  const render = () => {
    const plan = progress.plan;
    body.replaceChildren(
      plan
        ? el(
            "p",
            { className: "lead" },
            el("strong", { textContent: `${plan.rune} Rune` }),
            ` at draw ${plan.draw} (chest seed `,
            el("code", { textContent: String(plan.seed) }),
            `). Route: ${routeText(plan.stops)}. ${waitText(plan.wait)}, planned from draw ${plan.distance} and fire rate ${plan.fireRate}×/s.`,
            plan.wait > MAX_WAIT_SECONDS &&
              el("span", { className: "long-wait-tag", textContent: ` Long ${plan.rune} wait: any timing error grows with it.` }),
          )
        : el(
            "p",
            { className: "lead" },
            "No plan picked yet. ",
            el("a", { href: "#/runes", textContent: "Pick one in step 3" }),
            ", run it, then come back with your chest's drops.",
          ),
    );
  };
  progress.subscribe(render);
  render();
  return el("section", { className: "panel" }, el("div", { className: "panel-head" }, el("h2", { textContent: "Your plan" })), body);
}

export function renderRefinePanel(progress: PlayerProgress): RefinePanel {
  const badge = el("span", { className: "badge" });
  const status = el("p", { className: "lead" });
  const results = el("div", {});
  let search: ChestSearch | undefined;
  let stream: { key: string; seeds: Uint16Array } | undefined;
  let selected = 0;
  let selectionKey = "";

  function render(): void {
    badge.hidden = true;
    results.replaceChildren();
    const known = progress.knownSeed;
    const plan = progress.plan;
    if (!known || !plan) {
      status.className = "lead";
      status.textContent = !known ? "You'll need this game's seed first." : "Pick a plan first, then come back with your chest's drops.";
      return;
    }

    const picked = [progress.chest("refine").seed].filter((seed) => seed !== null);
    const candidates = search?.candidates ?? [];
    if (picked.length === 0 && candidates.length === 0) {
      status.className = "lead";
      status.textContent = "Enter your chest's drops above to see which draw it landed on.";
      return;
    }

    const draws = plan.draw + MAX_CHEST_DRAWS;
    const key = `${known.gameSeed}:${known.gameType}:${draws}`;
    if (stream?.key !== key) stream = { key, seeds: chestSeedStream(known.gameSeed, known.gameType, draws) };
    const hits = findChestDraws(stream.seeds, candidates, picked, plan.draw);
    if (hits.length === 0) {
      status.className = "lead error";
      status.replaceChildren(
        `None of these chest seeds come up in the first ${draws} draws of game seed ${formatSeed(known.gameSeed)} (${GAME_TYPE_LABELS[known.gameType]}), so your game seed was probably wrong. `,
        el("a", { href: "#/seed", textContent: "Find your game seed again" }),
        ", or double-check your drops.",
      );
      return;
    }

    const hitsKey = hits.map((hit) => hit.draw).join(",");
    if (hitsKey !== selectionKey) {
      selectionKey = hitsKey;
      selected = 0;
    }
    const hit = hits[selected];
    status.className = "lead";
    status.textContent =
      hits.length === 1
        ? "Found the draw your chest landed on."
        : `${plural(hits.length, "draw")} fit, best matches nearest your plan first. Pick the one that was your chest, or add more drops.`;
    results.replaceChildren(
      el("ol", { className: "draw-hits" }, ...hits.slice(0, SHOWN).map((row, index) => hitRow(row, index, plan))),
      ...(hits.length > SHOWN ? [el("p", { className: "hint", textContent: `…and ${hits.length - SHOWN} more.` })] : []),
      refinement(hit, plan),
    );
    const offset = hit.draw - plan.draw;
    badge.hidden = false;
    badge.textContent = offset === 0 ? "On plan" : `${plural(Math.abs(offset), "draw")} ${offset > 0 ? "late" : "early"}`;
    badge.classList.toggle("done", refineAdvice(offset) === "variance");
  }

  function hitRow(hit: DrawHit, index: number, plan: PickedPlan): HTMLElement {
    const isSelected = index === selected;
    return el(
      "li",
      { className: isSelected ? "picked" : "" },
      el("strong", { textContent: `Draw ${hit.draw}` }),
      el("span", { textContent: offsetText(hit.draw - plan.draw) }),
      el("span", { className: "muted" }, "Chest seed ", el("code", { textContent: String(hit.seed) })),
      hit.picked && el("span", { className: "badge picked-badge", textContent: "✔ Your selected chest seed" }),
      hit.score && el("span", { className: "muted", textContent: hit.score.extra === 0 ? "exact match" : `${hit.score.extra} not entered` }),
      button(
        isSelected ? "Selected" : "This was my chest",
        () => {
          selected = index;
          render();
        },
        isSelected ? "small" : "small primary",
      ),
    );
  }

  function refinement(hit: DrawHit, plan: PickedPlan): HTMLElement {
    const offset = hit.draw - plan.draw;
    if (offset === 0) {
      return el("div", { className: "refine" }, el("p", { className: "lead", textContent: "Spot on: your chest landed on the planned draw." }));
    }
    const seconds = Math.abs(offset) / plan.fireRate;
    const kind = refineAdvice(offset);
    if (kind !== "variance" && Math.abs(offset) <= RECALIBRATE_WITHIN) {
      queueMicrotask(() => progress.flagRecalibrate(["direct", ...plan.stops]));
    }
    const remeasure = ["direct" as const, ...plan.stops].filter((route) => progress.calibrationRoutes.includes(route));
    const recalibrate = el("a", {
      href: "#/calibrate",
      textContent: `measure ${remeasure.map(routeName).join(", ").replace(/, ([^,]*)$/, " and $1")} again in step 2`,
    });

    let advice: Node[];
    switch (kind) {
      case "variance":
        advice = [
          el("p", {
            className: "lead",
            textContent: "Within 20 draws is just variance that's hard to control. You're calibrated well, so keep trying.",
          }),
        ];
        break;
      case "distance":
        advice = [
          el(
            "p",
            { className: "lead" },
            "21 to 50 draws out: your route calibration is likely off. Add more samples, ",
            recalibrate,
            ", so their averages settle.",
          ),
        ];
        break;
      case "far":
        advice = [
          el(
            "p",
            { className: "lead" },
            "Over 50 draws out: your route calibration is likely off, or a route was run differently. ",
            recalibrate,
            ". If that doesn't help, check your game seed.",
          ),
        ];
        break;
      case "seed":
        advice = [
          el(
            "p",
            { className: "lead error" },
            "Over 1,000 draws out: your game seed was probably wrong. ",
            el("a", { href: "#/seed", textContent: "Find your game seed again" }),
            ".",
          ),
        ];
        break;
    }
    return el(
      "div",
      { className: "refine" },
      el("p", {
        className: "lead",
        textContent: `Your chest landed ${offsetText(offset)}, about ${seconds.toFixed(1)}s ${offset > 0 ? "late" : "early"}.`,
      }),
      ...advice,
    );
  }

  progress.subscribe(render);
  render();

  return {
    root: el(
      "section",
      { className: "panel" },
      el("div", { className: "panel-head" }, el("h2", { textContent: "How close was it?" }), badge),
      status,
      results,
    ),
    setSearch(next) {
      search = next;
      render();
    },
  };
}

function offsetText(offset: number): string {
  if (offset === 0) return "on the planned draw";
  return `${plural(Math.abs(offset), "draw")} ${offset > 0 ? "later" : "earlier"} than planned`;
}
