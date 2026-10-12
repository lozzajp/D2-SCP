import type { Feature } from "../../app/feature";
import { guidePanel, type GuideStep } from "../../app/guidePanel";
import type { PlayerProgress } from "../../app/progress";
import { CHEST_AREAS } from "../../chest/areas";
import { choiceTabs, el, field } from "../../ui/dom";
import { renderCalibrationPanel } from "./calibrationPanel";
import { renderChestSeedPanel } from "../chestEntry/chestSeedPanel";
import { renderDropsPanel } from "../chestEntry/dropsPanel";
import { renderRoutePicker, renderRoutesPanel } from "./routesPanel";

function routeSteps(progress: PlayerProgress): readonly GuideStep[] {
  const area = el("strong", { textContent: `Act ${progress.area.act}: ${progress.area.name}` });
  const seedStep: GuideStep = ["Get your game seed from the Act 1 gamble window on the ", el("a", { href: "#/run", textContent: "Run page" }), ", then come back here."];
  if (!progress.hasWaypointRoutes) {
    return [
      seedStep,
      ["Direct: take the Rogue Camp waypoint straight to ", area, "."],
      "Take the most direct route to the first super chest you have on your map and open it.",
      "Note the contents below, find your chest, and add its draw to Direct.",
      "If nothing comes up for the first 1,000 draws you may have the game seed wrong.",
      "If chest seeds are conflicting, run a new game for that measurement.",
      "Measure Direct a few times: the average is used, so one odd run won't throw it off.",
    ];
  }
  return [
    seedStep,
    ["Pick a route below. Start with ", el("strong", { textContent: "Direct" }), " and ", el("strong", { textContent: "River of Flame" }), ": rune plans need both."],
    ["Direct: take the Rogue Camp waypoint straight to ", area, "."],
    ["Via a waypoint: take the Rogue Camp waypoint to it, then immediately take the waypoint to ", area.cloneNode(true), "."],
    "Take the most direct route to the first super chest you have on your map and open it.",
    "Note the contents below, find your chest, and add its draw to the route.",
    "Direct is usually around 70-75, and each waypoint adds about 50-60.",
    "If nothing comes up for the first 1,000 draws you may have the game seed wrong.",
    "If chest seeds are conflicting, run a new game for that measurement.",
    "Measure each route a few times: the average is used, so one odd run won't throw it off.",
  ];
}

function renderAreaPanel(progress: PlayerProgress): HTMLElement {
  const status = el("ul", { className: "area-status" });
  const render = () => {
    status.replaceChildren(
      ...CHEST_AREAS.map(({ id, name }) => {
        const distance = progress.distanceIn(id);
        return el(
          "li",
          { className: distance === null ? "" : "done" },
          el("strong", { textContent: name }),
          " ",
          el("span", {
            className: distance === null ? "badge" : "badge done",
            textContent: distance === null ? "Not calibrated" : `Calibrated, direct ${distance}`,
          }),
        );
      }),
    );
  };
  progress.subscribe(render);
  render();
  return el(
    "section",
    { className: "panel calibrate-intro" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Calibrate once per area" })),
    el("p", {
      className: "lead",
      textContent:
        "Calibration is a one-off: it measures how many chest draws your route to the first super chest takes. " +
        "Do it for each area you want to farm, then head to Run for every game after. Only come back if you change how you run.",
    }),
    status,
    el(
      "div",
      { className: "area-picker" },
      field("Calibrating", choiceTabs(
        CHEST_AREAS.map(({ id, name, act }) => ({ id, label: `Act ${act}: ${name}` })),
        progress.area.id,
        (id) => progress.setArea(id),
      )),
      field("Players", choiceTabs(
        progress.area.players.map((count) => ({ id: count, label: `/players ${count}` })),
        progress.players,
        (count) => progress.setPlayers(count),
      )),
    ),
    el("p", {
      className: "hint",
      textContent: "Set the same /players in game while calibrating. Your route distance works for every player count afterwards.",
    }),
  );
}

export const chestCalibration: Feature = {
  id: "calibrate",
  title: "Calibrate",
  summary: (progress) =>
    progress.hasWaypointRoutes
      ? `Measure where your first ${progress.area.name} chest lands going direct, and via each waypoint you use.`
      : `Measure where your first ${progress.area.name} chest lands going direct.`,
  ready: true,
  tableScoped: true,
  createPage(progress) {
    const calibration = renderCalibrationPanel(progress);
    return {
      root: el(
        "div",
        { className: "page" },
        renderAreaPanel(progress),
        guidePanel({
          title: `Run to your first ${progress.area.name} chest`,
          progress,
          steps: routeSteps(progress),
        }),
        renderRoutePicker(progress),
        renderDropsPanel(progress, "first"),
        renderChestSeedPanel(progress, "first", calibration.setSearch),
        calibration.root,
        renderRoutesPanel(progress),
        el(
          "div",
          { className: "new-run" },
          el("a", { className: "button-link primary", href: "#/run", textContent: "Done calibrating? Start running →" }),
        ),
      ),
    };
  },
};
