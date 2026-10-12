import type { Feature } from "../../app/feature";
import { guidePanel, type GuideStep } from "../../app/guidePanel";
import type { PlayerProgress } from "../../app/progress";
import { hasRepeats, RIVER_OF_FLAME, routeText } from "../../chest/waypoints";
import { button, el } from "../../ui/dom";
import { waitTenths } from "../../ui/format";
import { startNewRun } from "../seedFinder/seedFinderFeature";
import { renderRunePlanPanel, waitText } from "./runePlanPanel";

function introSteps(progress: PlayerProgress): readonly GuideStep[] {
  return [
    progress.hasWaypointRoutes
      ? "Make sure you calibrated your Direct route plus River of Flame or the waypoints you'll use in step 2, and started a new game in Act 1."
      : "Make sure you calibrated your Direct route in step 2, and started a new game in Act 1.",
    "Get your seed for the new game in Act 1 gamble window, and wait in Act 1, use below planner to see what runes you can get.",
  ];
}

function afterSteps(progress: PlayerProgress, travelStep: Node, waitStep: Node): readonly GuideStep[] {
  return [
    ["Pick your plan and rune you want to aim for, noting the route and wait time."],
    ["Use the wait timer under your plans (it beeps at 10 seconds left and the last 5 seconds), or have a stopwatch ready."],
    [travelStep],
    [waitStep],
    [
      progress.hasWaypointRoutes
        ? "Take the waypoint to Act 3 Lower Kurast and go open your first chest as per your calibration route."
        : "Go open your first chest as per your calibration route.",
    ],
    ["Open all other super chests too for more attempts."],
    ["Note what your planned chest dropped and ", el("a", { href: "#/refine", textContent: "refine your timing in step 4" }), "."],
  ];
}

function routeSteps(progress: PlayerProgress): [HTMLElement, HTMLElement] {
  const travel = el("span", {});
  const wait = el("span", {});
  const finish = progress.hasWaypointRoutes ? "Lower Kurast." : "the super chest.";
  const leave = progress.hasWaypointRoutes ? "take the waypoint straight away." : "head to the chest straight away.";
  const render = () => {
    const plan = progress.plan;
    const stops = plan?.stops ?? [RIVER_OF_FLAME];
    const viaRiver = stops.at(-1) === RIVER_OF_FLAME;
    const hops = viaRiver ? stops.slice(0, -1) : stops;
    const tenths = plan ? waitTenths(plan.wait) : null;
    const pace = hasRepeats(hops) ? "without waiting, counting your laps" : "without waiting";
    travel.replaceChildren(
      ...(hops.length > 0 ? [`Take waypoints through ${routeText(hops)} ${pace}, then `] : ["Take the Rogue Camp waypoint to "]),
      ...(viaRiver
        ? ["Act 4 River of Flame ", el("strong", { textContent: "on the timer's START (or start your stopwatch as you do)." })]
        : [finish]),
    );
    wait.replaceChildren(
      ...(!viaRiver || tenths === 0
        ? [`Don't wait, ${leave}`]
        : [
            "Wait by the River of Flame waypoint for ",
            !plan || tenths === null
              ? "your plan's wait time (pick a plan above)"
              : el("strong", { textContent: waitText(plan.wait).replace(/^Wait /, "") }),
            ", do not move or pause game.",
          ]),
    );
  };
  progress.subscribe(render);
  render();
  return [travel, wait];
}

export const runePlanner: Feature = {
  id: "runes",
  title: "Plan for good runes",
  summary: (progress) =>
    progress.hasWaypointRoutes
      ? "See which runes your chest can land on, and the waypoint route or River of Flame wait for each."
      : "See which runes your chest can land on, and the River of Flame wait for each.",
  ready: true,
  createPage(progress) {
    return {
      root: el(
        "div",
        { className: "page" },
        guidePanel({ title: this.title, progress, steps: introSteps(progress) }),
        renderRunePlanPanel(progress),
        guidePanel({ title: "Running your plan", steps: afterSteps(progress, ...routeSteps(progress)), keepInAdvanced: true }),
        el("div", { className: "new-run" }, button("New Run", startNewRun, "primary")),
      ),
    };
  },
};
