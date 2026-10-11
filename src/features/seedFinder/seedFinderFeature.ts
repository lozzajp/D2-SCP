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
  "Follow steps below to match items to figure out your game seed",
  "Move on to calibration or rune plan",
];

export const seedFinder: Feature = {
  id: "seed",
  title: "Find your game seed",
  summary:
    "Rebuild your first gamble window, search every store seed, and work back to your game seed. Skip ahead if you already know it.",
  ready: true,
  isDone: (progress) => progress.knownSeed !== null,
  createPage(progress) {
    const wizard = new Wizard(loadState(), progress);
    wizard.goTo("setup");
    return {
      root: el(
        "div",
        { className: "page" },
        guidePanel({ title: "Find Your Seed - Needed Every New Run", steps: SEED_STEPS }),
        wizard.root,
        renderKnownSeedPanel(progress),
        renderSeedConverter(),
      ),
    };
  },
};
