import { GAME_TYPE_LABELS, type PlayerProgress } from "../../app/progress";
import type { ChestSearch } from "../../chest/chestSeedMatcher";
import { CHEST_SEED_COUNT, MAX_CHEST_DRAWS, chestSeedStream, findChestDraws, type DrawHit } from "../../chest/chestStream";
import { averageDraw, routeName } from "../../chest/waypoints";
import { button, el } from "../../ui/dom";
import { formatSeed, plural } from "../../ui/format";

const SHOWN = 10;
const WAYPOINT_ADDS = 50;
const WITHIN_EXPECTED = 20;
const WITHIN_WAYPOINT = 50;
const WITHIN_GUESS = 200;

export interface CalibrationPanel {
  root: HTMLElement;
  setSearch(search: ChestSearch | undefined): void;
}

export function renderCalibrationPanel(progress: PlayerProgress): CalibrationPanel {
  const saved = el("span", { className: "badge" });
  const status = el("p", { className: "lead" });
  const extraSeeds = el("input", { type: "text", placeholder: "e.g. 4468, 47052", spellcheck: false });
  const results = el("div", {});
  let search: ChestSearch | undefined;
  let stream: { key: string; seeds: Uint16Array } | undefined;

  extraSeeds.addEventListener("input", render);

  function render(): void {
    const route = progress.calibrationRoute;
    const count = progress.routeSamples.filter((sample) => sample.route === route).length;
    saved.textContent = count === 0 ? `${routeName(route)}: not measured` : `${routeName(route)}: ${plural(count, "sample")}`;
    saved.classList.toggle("done", count > 0);

    const known = progress.knownSeed;
    if (!known) {
      status.className = "lead";
      status.replaceChildren("You'll need your game seed first: ", el("a", { href: "#/seed", textContent: "find it in step 1" }), ".");
      results.replaceChildren();
      return;
    }
    const key = `${known.gameSeed}:${known.gameType}`;
    if (stream?.key !== key) stream = { key, seeds: chestSeedStream(known.gameSeed, known.gameType) };

    const picked = [...typedSeeds(extraSeeds.value), progress.chest("first").seed].filter((seed) => seed !== null);
    const candidates = search?.candidates ?? [];
    if (picked.length === 0 && candidates.length === 0) {
      status.className = "lead";
      status.textContent = "Enter your chest's drops above, or type chest seeds below, to find which draw your chest came from.";
      results.replaceChildren();
      return;
    }

    const hits = findChestDraws(stream.seeds, candidates, picked);
    const checked = plural(new Set([...picked, ...candidates.map((score) => score.seed)]).size, "chest seed");
    const against = `the first ${MAX_CHEST_DRAWS} draws of game seed ${formatSeed(known.gameSeed)} (${GAME_TYPE_LABELS[known.gameType]})`;
    if (hits.length === 0) {
      status.className = "lead error";
      status.textContent = `None of ${checked} come up in ${against}. Double-check your game seed and drops.`;
      results.replaceChildren();
      return;
    }
    const single = hits.length === 1 ? expectation(hits[0].draw) : null;
    status.className = !single ? "lead" : single.unexpected ? "lead warning" : "lead success";
    status.textContent = single
      ? `Found your chest at draw ${hits[0].draw}, ${single.text} Checked ${checked} against ${against}.`
      : `${plural(hits.length, "draw")} fit, checking ${checked} against ${against}. Add more drops to narrow it down or select \"exact matches\".`;
    results.replaceChildren(
      el("ol", { className: "draw-hits" }, ...hits.slice(0, SHOWN).map((hit) => hitRow(hit, known.gameSeed))),
      ...(hits.length > SHOWN ? [el("p", { className: "hint", textContent: `…and ${hits.length - SHOWN} more.` })] : []),
    );
  }

  function hitRow(hit: DrawHit, gameSeed: number): HTMLElement {
    const route = progress.calibrationRoute;
    const isSaved = progress.routeSamples.some(
      (sample) => sample.gameSeed === gameSeed && sample.route === route && sample.draw === hit.draw,
    );
    const pickLabel = hit.seed === progress.chest("first").seed ? "Your selected chest seed" : "Typed seed";
    return el(
      "li",
      { className: hit.picked ? "picked" : "" },
      el("strong", { textContent: `Draw ${hit.draw}` }),
      el("span", {}, "Chest seed ", el("code", { textContent: String(hit.seed) })),
      hit.picked && el("span", { className: "badge picked-badge", textContent: `✔ ${pickLabel}` }),
      el("span", { className: "muted", textContent: describe(hit, search?.entered ?? 0) }),
      button(
        isSaved ? `Added to ${routeName(route)}` : `Add to ${routeName(route)}`,
        () => progress.addRouteSample(route, hit.draw),
        isSaved ? "small" : "small primary",
      ),
    );
  }

  function expectation(draw: number): { text: string; unexpected: boolean } {
    const route = progress.calibrationRoute;
    const gameSeed = progress.knownSeed?.gameSeed;
    const others = progress.routeSamples.filter((sample) => sample.gameSeed !== gameSeed);
    const measured = averageDraw(others, route);
    const direct = progress.settings.distanceToFirstChest;
    const expected =
      measured !== null ? Math.round(measured) : route === "direct" ? direct : direct === null ? null : direct + WAYPOINT_ADDS;
    if (expected === null) {
      const text =
        route === "direct"
          ? "your first Direct measurement."
          : `each waypoint usually adds about +${WAYPOINT_ADDS} draws over Direct, so measure Direct too.`;
      return { text, unexpected: false };
    }
    const basis =
      measured !== null
        ? `your ${routeName(route)} average`
        : route === "direct"
          ? "your distance to first chest"
          : `Direct ${direct} + ${WAYPOINT_ADDS}`;
    const off = draw - expected;
    const gap = Math.abs(off);
    const guessed = measured === null && route !== "direct";
    const unexpected = gap > (guessed ? WITHIN_GUESS : route === "direct" ? WITHIN_EXPECTED : WITHIN_WAYPOINT);
    const text =
      gap === 0
        ? `exactly the ${expected} expected from ${basis}.`
        : unexpected
          ? `${plural(gap, "draw")} ${off < 0 ? "earlier" : "later"} than the ${expected} expected from ${basis}. Worth double-checking the route you ran, one odd run can happen.`
          : guessed
            ? `${plural(gap, "draw")} from the rough ${expected} guessed from ${basis}: waypoints vary from a few draws to nearly 200, so that's fine.`
            : `only ${plural(gap, "draw")} from the ${expected} expected from ${basis}, within expectations of a single calibration.`;
    return { text, unexpected };
  }

  progress.subscribe(render);
  render();

  return {
    root: el(
      "section",
      { className: "panel" },
      el("div", { className: "panel-head" }, el("h2", { textContent: "Find your draw" }), saved),
      el("p", {
        className: "lead",
        textContent:
          "Every chest seed is rolled from your game seed, one draw at a time. The draw that gave your first chest measures your route: add it to the route you ran. Only one route counts per game, adding another replaces it.",
      }),
      el("label", { className: "field" }, el("span", { className: "field-label", textContent: "Extra chest seeds" }), extraSeeds),
      status,
      results,
    ),
    setSearch(next) {
      search = next;
      render();
    },
  };
}

function typedSeeds(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .filter((part) => /^\d+$/.test(part))
    .map(Number)
    .filter((seed) => seed >= 1 && seed <= CHEST_SEED_COUNT);
}

function describe(hit: DrawHit, entered: number): string {
  const sources: string[] = [];
  if (hit.score) {
    sources.push(`${hit.score.matched}/${entered} matched`);
    sources.push(hit.score.extra === 0 ? "exact match" : `${hit.score.extra} not entered`);
  }
  return sources.join(", ");
}
