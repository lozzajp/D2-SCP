import { routeName, type RouteId } from "../chest/waypoints";
import { button, el } from "../ui/dom";
import { plural } from "../ui/format";
import type { PlayerProgress } from "./progress";

const HINT = "Some waypoints you might want to calibrate next.";

export function renderCalibrateNextList(progress: PlayerProgress, onPick: (route: RouteId) => void = () => {}): HTMLElement {
  const list = el("ol", { className: "seed-history" });
  const render = () => {
    const picked = progress.calibrationRoute;
    list.replaceChildren(
      ...progress.calibrateNext().map(({ route, runs, flagged }) =>
        el(
          "li",
          {},
          el("span", { textContent: route === "direct" ? "Direct (no waypoint)" : routeName(route) }),
          el("span", {
            className: "muted",
            textContent: runs === 0 ? "Not calibrated" : `${flagged ? "Refine: off, " : ""}${plural(runs, "run")}`,
          }),
          button(
            route === picked ? "Selected" : "Calibrate",
            () => {
              progress.setCalibrationRoute(route);
              onPick(route);
            },
            route === picked ? "small" : "small primary",
          ),
        ),
      ),
    );
  };
  progress.subscribe(render);
  render();
  return el("div", {}, el("p", { className: "hint", textContent: HINT }), list);
}
