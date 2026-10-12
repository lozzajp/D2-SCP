import { el } from "../ui/dom";
import type { Feature, Page } from "./feature";
import type { PlayerProgress } from "./progress";

function prerequisites(progress: PlayerProgress): string[] {
  return [
    "Always start game in Act 1",
    progress.hasWaypointRoutes
      ? "Hell unlocked with LK waypoint and Act 4 River of Flame waypoint"
      : "Hell unlocked with Act 4 River of Flame waypoint",
    "A decent map with at least one of the super chest huts next to waypoint",
    `Player count set to ${progress.players}`,
    "Terror Zones Off",
    "Mercenary dead",
    "Auto Gold Pickup Off (whilst calibrating/refining)",
    "Loot Filter Off (whilst calibrating/refining)",
    "Follow routes outlined here, or if you're own, make sure you run it the same every time",
    "Run or teleport and telekinesis is fine, just keep it the same every time",
  ];
}

export function createHomePage(features: readonly Feature[], progress: PlayerProgress): Page {
  const cards = el("ol", { className: "step-cards" });

  const render = () => {
    cards.replaceChildren(
      ...features.map((feature, index) => {
        const done = feature.isDone?.(progress) ?? false;
        const status = done ? "Done" : feature.ready ? "Start" : "Coming soon";
        return el(
          "li",
          {},
          el(
            "a",
            { className: `step-card${feature.ready ? "" : " not-ready"}${done ? " done" : ""}`, href: `#/${feature.id}` },
            el("span", { className: "step-number", textContent: String(index + 1) }),
            el("h3", { textContent: feature.title }),
            el("p", { textContent: typeof feature.summary === "string" ? feature.summary : feature.summary(progress) }),
            el("span", { className: "badge", textContent: status }),
          ),
        );
      }),
    );
  };
  progress.subscribe(render);
  render();

  return {
    root: el(
      "div",
      { className: "page home" },
      el(
        "section",
        { className: "panel" },
        el("h2", { textContent: `Planning ${progress.area.short} Rune Drops` }),
        el("p", { className: "lead", textContent: "Confirmed working on PC and PS5, RotW. Others should work, vanilla D2R might be slightly differnet on chest drops, but overall should work the same." }),
        el("p", { className: "lead", textContent: "Before you start, make sure you have:" }),
        el("ul", { className: "checklist" }, ...prerequisites(progress).map((item) => el("li", { textContent: item }))),
      ),
      cards,
    ),
  };
}
