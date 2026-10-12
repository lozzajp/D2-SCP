import { el } from "../ui/dom";
import type { Feature } from "./feature";

const PREREQUISITES = [
  "Always start game in Act 1",
  "Hell unlocked with the Act 4 River of Flame waypoint, plus the Lower Kurast waypoint for Lower Kurast chests",
  "A decent map with at least one of the super chest huts next to waypoint",
  "Player count set to match the /players on the plan you pick",
  "Terror Zones Off",
  "Mercenary dead",
  "Auto Gold Pickup Off (whilst calibrating/refining)",
  "Loot Filter Off (whilst calibrating/refining)",
  "Follow routes outlined here, or if you're own, make sure you run it the same every time",
  "Run or teleport and telekinesis is fine, just keep it the same every time",
];

const FLOW = [
  {
    route: "calibrate",
    title: "Calibrate once",
    text: "Time your route from the waypoint to the chest over a few games, for each area you want to farm. You only do this again if you change how you run.",
  },
  {
    route: "run",
    title: "Run, every game",
    text: "Fill in Gheed's first gamble window, get your seed, and pick a rune plan from every area and player count you've set up. Follow the route and wait timer, then open the chest.",
  },
  {
    route: "refine",
    title: "Refine when you miss",
    text: "If your chest keeps landing a few draws away from the plan, tell it what dropped and it'll nudge your timing.",
  },
];

export const guide: Feature = {
  id: "guide",
  title: "Guide",
  summary: "How it works and what you need before you start.",
  ready: true,
  createPage() {
    return {
      root: el(
        "div",
        { className: "page home" },
        el(
          "section",
          { className: "panel" },
          el("h2", { textContent: "How it works" }),
          el("p", {
            className: "lead",
            textContent:
              "Super chest drops follow the game's RNG. Once the planner knows your game seed and how long your route takes, it can tell you exactly when to open a chest for a high rune.",
          }),
          el(
            "ol",
            { className: "step-cards" },
            ...FLOW.map(({ route, title, text }, index) =>
              el(
                "li",
                {},
                el(
                  "a",
                  { className: "step-card", href: `#/${route}` },
                  el("span", { className: "step-number", textContent: String(index + 1) }),
                  el("h3", { textContent: title }),
                  el("p", { textContent: text }),
                ),
              ),
            ),
          ),
        ),
        el(
          "section",
          { className: "panel" },
          el("h2", { textContent: "Before you start" }),
          el("p", {
            className: "lead",
            textContent:
              "Confirmed working on PC and PS5, RotW. Others should work, vanilla D2R might be slightly differnet on chest drops, but overall should work the same.",
          }),
          el("p", { className: "lead", textContent: "Make sure you have:" }),
          el("ul", { className: "checklist" }, ...PREREQUISITES.map((item) => el("li", { textContent: item }))),
        ),
      ),
    };
  },
};
