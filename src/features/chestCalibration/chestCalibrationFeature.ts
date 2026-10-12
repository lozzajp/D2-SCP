import type { Feature } from "../../app/feature";
import { guidePanel, type GuideStep } from "../../app/guidePanel";
import { renderPlayerSettingsPanel } from "../../app/playerSettings";
import { WAYPOINT_TARGET, type CalibrateTarget, type PlayerProgress } from "../../app/progress";
import { CHEST_AREAS } from "../../chest/areas";
import { choiceTabs, el, field } from "../../ui/dom";
import { plural } from "../../ui/format";
import { renderCalibrationPanel } from "./calibrationPanel";
import { renderChestSeedPanel } from "../chestEntry/chestSeedPanel";
import { renderDropsPanel } from "../chestEntry/dropsPanel";
import { renderRoutePicker, renderRoutesPanel } from "./routesPanel";

function routeSteps(progress: PlayerProgress): readonly GuideStep[] {
  const area = el("strong", { textContent: `Act ${progress.area.act}: ${progress.area.name}` });
  const seedStep: GuideStep = ["Get your game seed from the Act 1 gamble window on the ", el("a", { href: "#/run", textContent: "Run page" }), ", then come back here."];
  const chestSteps: GuideStep[] = [
    "Take the most direct route to the first super chest you have on your map and open it.",
    "Note the contents below, find your chest, and add its draw to the route.",
  ];
  const checks: GuideStep[] = [
    "If nothing comes up for the first 1,000 draws you may have the game seed wrong.",
    "If chest seeds are conflicting, run a new game for that measurement.",
  ];
  const target = progress.calibrateTarget;
  if (target === WAYPOINT_TARGET) {
    return [
      seedStep,
      ["Waypoint hopping measures what each waypoint adds, using your ", area, " chest. You can measure waypoints any time; their adds show once Lower Kurast Direct is calibrated."],
      ["Pick a waypoint below, take the Rogue Camp waypoint to it, then immediately take the waypoint to ", area.cloneNode(true), "."],
      ...chestSteps,
      "Each waypoint usually adds about 50-60 draws over Direct.",
      ...checks,
      "Measure each waypoint a few times: the average is used, so one odd run won't throw it off.",
      "These work for both Lower Kurast and River of Flame waypoint routes.",
    ];
  }
  if (progress.calibratingRoutes.length === 1) {
    return [
      seedStep,
      ["Direct: take the Rogue Camp waypoint straight to ", area, "."],
      "Take the most direct route to the first super chest you have on your map and open it.",
      "Note the contents below, find your chest, and add its draw to Direct.",
      ...checks,
      "Measure Direct a few times: the average is used, so one odd run won't throw it off.",
    ];
  }
  return [
    seedStep,
    ["Measure ", el("strong", { textContent: "Direct" }), " and ", el("strong", { textContent: "River of Flame" }), ": rune plans need both."],
    ["Direct: take the Rogue Camp waypoint straight to ", area, "."],
    ["River of Flame: take the Rogue Camp waypoint to Act 4 River of Flame, then immediately take the waypoint to ", area.cloneNode(true), "."],
    ...chestSteps,
    "Direct is usually around 70-75, and River of Flame adds about 50-60.",
    ...checks,
    "Measure each route a few times: the average is used, so one odd run won't throw it off.",
    "Want to hop through other waypoints too? Calibrate them under Waypoint Hopping above.",
  ];
}

function renderAreaPanel(progress: PlayerProgress): HTMLElement {
  const status = el("ul", { className: "area-status" });
  const directFirst = el(
    "p",
    { className: "badge coarse-badge direct-first" },
    "No Lower Kurast Direct calibrated yet: you need one Direct first for waypoint adds to work. ",
    el("a", { href: "#/calibrate", textContent: "Calibrate Lower Kurast", onclick: () => progress.setArea("lowerKurast") }),
  );
  const render = () => {
    directFirst.hidden = progress.calibrateTarget !== WAYPOINT_TARGET || !progress.waypointDirectMissing;
    const hops = progress.waypointHopCount;
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
      el(
        "li",
        { className: hops === 0 ? "" : "done" },
        el("strong", { textContent: "Waypoint Hopping" }),
        " ",
        el("span", {
          className: hops === 0 ? "badge" : "badge done",
          textContent: hops === 0 ? "Optional, none measured" : `${plural(hops, "waypoint")} measured`,
        }),
      ),
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
      field("Calibrating", choiceTabs<CalibrateTarget>(
        [
          ...CHEST_AREAS.map(({ id, name, act }) => ({ id, label: `Act ${act}: ${name}` })),
          { id: WAYPOINT_TARGET, label: "Waypoint Hopping" },
        ],
        progress.calibrateTarget,
        (id) => progress.setCalibrateTarget(id),
      )),
      field("Players", choiceTabs(
        progress.area.players.map((count) => ({ id: count, label: `/players ${count}` })),
        progress.players,
        (count) => progress.setPlayers(count),
      )),
    ),
    directFirst,
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
    progress.calibrateTarget === WAYPOINT_TARGET
      ? `Measure what each waypoint adds on the way to your first ${progress.area.name} chest.`
      : `Measure where your first ${progress.area.name} chest lands going direct${progress.calibratingRoutes.length > 1 ? " and via River of Flame" : ""}.`,
  ready: true,
  tableScoped: true,
  createPage(progress) {
    const calibration = renderCalibrationPanel(progress);
    return {
      root: el(
        "div",
        { className: "page" },
        renderPlayerSettingsPanel(progress),
        renderAreaPanel(progress),
        guidePanel({
          title:
            progress.calibrateTarget === WAYPOINT_TARGET
              ? `Hop through a waypoint to your first ${progress.area.name} chest`
              : `Run to your first ${progress.area.name} chest`,
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
