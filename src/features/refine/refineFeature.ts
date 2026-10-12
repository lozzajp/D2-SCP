import type { Feature } from "../../app/feature";
import { guidePanel, type GuideStep } from "../../app/guidePanel";
import type { PlayerProgress } from "../../app/progress";
import { el } from "../../ui/dom";
import { renderChestSeedPanel } from "../chestEntry/chestSeedPanel";
import { renderDropsPanel } from "../chestEntry/dropsPanel";
import { renderPlanSummary, renderRefinePanel } from "./refinePanel";

function steps(progress: PlayerProgress): readonly GuideStep[] {
  return [
    "Pick a plan in step 3 with \"Use this plan\" and run it.",
    "Open your first super chest and enter what it dropped below.",
    `See how many draws early or late your chest landed. Within 20 is normal, 21-50 means measure your ${progress.hasWaypointRoutes ? "Direct and River of Flame routes" : "Direct route"} again, 50+ means a route is well off, and 1,000+ or not found means your game seed was wrong.`,
    "You can also enter your other super chests contents here for curiosity, but shouldn't refine settings based on them.",
    "(Advanced tip) If you are still struggling with refining, enter all 3 superchests in your first hut area, and see if one of them loaded first, e.g. has a lower roll than the others. Calibrate your runs toward that one.",
    "Once you are refined to getting within 20 draws, trust the process and just keep running games!",
  ];
}

export const refine: Feature = {
  id: "refine",
  title: "Refine your timing",
  summary: "Open your planned chest, enter its drops, and see how close you landed to the plan.",
  ready: true,
  createPage(progress) {
    const refinePanel = renderRefinePanel(progress);
    return {
      root: el(
        "div",
        { className: "page" },
        guidePanel({ title: "Refine your timing", progress, lead: "", steps: steps(progress) }),
        renderPlanSummary(progress),
        renderDropsPanel(progress, "refine"),
        renderChestSeedPanel(progress, "refine", refinePanel.setSearch),
        refinePanel.root,
      ),
    };
  },
};
