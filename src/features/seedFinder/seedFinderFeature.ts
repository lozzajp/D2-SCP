import type { Feature } from "../../app/feature";
import { guidePanel, type GuideStep } from "../../app/guidePanel";
import { el } from "../../ui/dom";
import { renderKnownSeedPanel } from "./knownSeedPanel";
import { renderSeedConverter } from "./seedConverter";
import { loadState } from "./state";
import { Wizard } from "./wizard";

const SEED_STEPS: readonly GuideStep[] = [
  "Start in Act 1 (if you started in another act, go to Act 1 and restart game)",
  "Run straight to Gheed",
  "Set your platform and level, then match items to figure out your game seed",
  ["Head back to ", el("a", { href: "#/run", textContent: "Run" }), " for your rune plans"],
];

export const seedFinder: Feature = {
  id: "seed",
  title: "Seed finder",
  summary:
    "Rebuild your first gamble window step by step, search every store seed, and work back to your game seed. Or type in a seed you already know.",
  ready: true,
  hidden: true,
  isDone: (progress) => progress.knownSeed !== null,
  createPage(progress) {
    const wizard = new Wizard(loadState(), progress);
    wizard.goTo("setup");
    return {
      root: el(
        "div",
        { className: "page" },
        guidePanel({
          title: "Step-by-step Seed Finder",
          lead: "The Run page does this in one go. Use this page to change your platform or level, take it slower, or enter a seed by hand.",
          steps: SEED_STEPS,
        }),
        wizard.root,
        renderKnownSeedPanel(progress),
        renderSeedConverter(),
      ),
    };
  },
};
