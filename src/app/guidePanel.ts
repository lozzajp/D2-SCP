import { el } from "../ui/dom";
import type { PlayerProgress } from "./progress";
import { seedStatusLine } from "./seedStatus";

export type GuideStep = string | readonly (string | Node)[];

export interface GuideOptions {
  title: string;
  steps: readonly GuideStep[];
  lead?: string;
  badge?: string;
  progress?: PlayerProgress;
  keepInAdvanced?: boolean;
}

export function guidePanel({ title, steps, lead, badge, progress, keepInAdvanced }: GuideOptions): HTMLElement {
  const className = ["panel guide", keepInAdvanced ? "keep" : "", progress ? "with-status" : ""].filter(Boolean).join(" ");
  return el(
    "section",
    { className },
    el(
      "div",
      { className: "panel-head" },
      el("h2", { textContent: title }),
      ...(badge ? [el("span", { className: "badge", textContent: badge })] : []),
    ),
    ...(progress ? [seedStatusLine(progress)] : []),
    ...(lead ? [el("p", { className: "lead", textContent: lead })] : []),
    el("ol", { className: "guide-steps" }, ...steps.map((step) => el("li", {}, ...(typeof step === "string" ? [step] : step)))),
  );
}
