import { button, el } from "../../../ui/dom";
import { formatCount, formatDuration, plural } from "../../../ui/format";
import { searchedItems } from "../boardItems";
import type { StepView, Wizard } from "../wizard";

const RATE_WINDOW_MS = 4000;

export function renderSearchStep(wizard: Wizard): StepView {
  const run = wizard.run;
  if (!run) return { root: el("p", { textContent: "No search is running." }) };
  const { search, board } = run;

  const fill = el("div", { className: "progress-fill" });
  const stats = el("p", { className: "stats", textContent: "Starting workers…" });
  const found = el("p", { className: "found" });
  const review = button("Stop and review matches", () => wizard.stopAndReview());
  const rate = new RateMeter();

  function refresh(): void {
    const fraction = search.seedsTested / search.seedCount;
    const perSecond = rate.update(search.seedsTested);
    fill.style.width = `${(fraction * 100).toFixed(2)}%`;
    if (search.seedsTested > 0) {
      const secondsLeft = (search.seedCount - search.seedsTested) / perSecond;
      stats.textContent = `${(fraction * 100).toFixed(1)}% · ${formatCount(perSecond)} seeds/s · ${formatDuration(secondsLeft)} left`;
    }
    const matches = search.matches.length;
    found.textContent = matches === 0 ? "No matches yet" : `${plural(matches, "candidate")} found so far`;
    found.classList.toggle("hit", matches > 0);
    review.hidden = matches === 0;
  }
  refresh();

  return {
    root: el(
      "div",
      { className: "step" },
      el("p", {
        className: "lead",
        textContent: `Testing all ${search.seedCount.toLocaleString("en-US")} store seeds against your ${plural(searchedItems(board).length, "item")} on ${plural(search.threads, "thread")}.`,
      }),
      el("div", { className: "progress" }, fill),
      stats,
      found,
      el("div", { className: "step-footer" }, button("Cancel", () => wizard.cancelSearch()), review),
    ),
    refresh,
  };
}

export class RateMeter {
  private readonly samples: { time: number; count: number }[] = [];

  update(count: number): number {
    const now = performance.now();
    this.samples.push({ time: now, count });
    while (this.samples.length > 2 && now - this.samples[0].time > RATE_WINDOW_MS) this.samples.shift();
    const oldest = this.samples[0];
    return now > oldest.time ? ((count - oldest.count) / (now - oldest.time)) * 1000 : 0;
  }
}
