import type { Feature } from "../../app/feature";
import { guidePanel, type GuideStep } from "../../app/guidePanel";
import { el } from "../../ui/dom";
import { renderCalibrationPanel } from "./calibrationPanel";
import { renderChestSeedPanel } from "../chestEntry/chestSeedPanel";
import { renderDropsPanel } from "../chestEntry/dropsPanel";
import { renderRoutePicker, renderRoutesPanel } from "./routesPanel";

const ROUTE_STEPS: readonly GuideStep[] = [
  "Find your game seed from Act 1 steps.",
  ["Pick a route below. Start with ", el("strong", { textContent: "Direct" }), " and ", el("strong", { textContent: "River of Flame" }), ": rune plans need both."],
  ["Direct: take the Rogue Camp waypoint straight to ", el("strong", { textContent: "Act 3: Lower Kurast" }), "."],
  ["Via a waypoint: take the Rogue Camp waypoint to it, then immediately take the waypoint to ", el("strong", { textContent: "Act 3: Lower Kurast" }), "."],
  "Take the most direct route to the first super chest you have on your map and open it.",
  "Note the contents below, find your chest, and add its draw to the route.",
  "Direct is usually around 70-75, and each waypoint adds about 50-60.",
  "If nothing comes up for the first 1,000 draws you may have the game seed wrong.",
  "If chest seeds are conflicting, run a new game for that measurement.",
  "Measure each route a few times: the average is used, so one odd run won't throw it off.",
];

export const chestCalibration: Feature = {
  id: "calibrate",
  title: "Calibrate your routes",
  summary: "Measure where your first Lower Kurast chest lands going direct, and via each waypoint you use.",
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
          steps: ROUTE_STEPS,
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
