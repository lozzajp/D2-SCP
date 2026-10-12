import type { Feature } from "../../app/feature";
import { guidePanel, type GuideStep } from "../../app/guidePanel";
import type { PlayerProgress } from "../../app/progress";
import { el } from "../../ui/dom";
import { renderCalibrationPanel } from "./calibrationPanel";
import { renderChestSeedPanel } from "../chestEntry/chestSeedPanel";
import { renderDropsPanel } from "../chestEntry/dropsPanel";
import { renderRoutePicker, renderRoutesPanel } from "./routesPanel";

function routeSteps(progress: PlayerProgress): readonly GuideStep[] {
  const area = el("strong", { textContent: `Act ${progress.area.act}: ${progress.area.name}` });
  if (!progress.hasWaypointRoutes) {
    return [
      "Find your game seed from Act 1 steps.",
      ["Direct: take the Rogue Camp waypoint straight to ", area, "."],
      "Take the most direct route to the first super chest you have on your map and open it.",
      "Note the contents below, find your chest, and add its draw to Direct.",
      "If nothing comes up for the first 1,000 draws you may have the game seed wrong.",
      "If chest seeds are conflicting, run a new game for that measurement.",
      "Measure Direct a few times: the average is used, so one odd run won't throw it off.",
    ];
  }
  return [
    "Find your game seed from Act 1 steps.",
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

export const chestCalibration: Feature = {
  id: "calibrate",
  title: "Calibrate your routes",
  summary: (progress) =>
    progress.hasWaypointRoutes
      ? `Measure where your first ${progress.area.name} chest lands going direct, and via each waypoint you use.`
      : `Measure where your first ${progress.area.name} chest lands going direct.`,
  ready: true,
  createPage(progress) {
    const calibration = renderCalibrationPanel(progress);
    return {
      root: el(
        "div",
        { className: "page" },
        guidePanel({
          title: "Run to your first chest - Calibrate each route once or a few times",
          progress,
          lead: "",
          steps: routeSteps(progress),
        }),
        renderRoutePicker(progress),
        renderDropsPanel(progress, "first"),
        renderChestSeedPanel(progress, "first", calibration.setSearch),
        calibration.root,
        renderRoutesPanel(progress),
      ),
    };
  },
};
