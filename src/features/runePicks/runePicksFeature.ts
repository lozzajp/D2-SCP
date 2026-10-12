import type { Feature } from "../../app/feature";
import type { PlayerProgress } from "../../app/progress";
import { CHEST_RUNES, MAX_PICK_WAIT_SECONDS } from "../../chest/runePlan";
import { button, el } from "../../ui/dom";
import { plural } from "../../ui/format";

const MAX_MINUTES = MAX_PICK_WAIT_SECONDS / 60;

function minutesInput(): HTMLInputElement {
  return el("input", { type: "number", min: "0", max: String(MAX_MINUTES), step: "0.5", inputMode: "decimal" });
}

function readSeconds(input: HTMLInputElement): number | null {
  const minutes = Number(input.value);
  if (input.value.trim() === "" || !Number.isFinite(minutes) || minutes < 0 || minutes > MAX_MINUTES) return null;
  return Math.round(minutes * 60);
}

function showMinutes(seconds: number): string {
  return String(Number((seconds / 60).toFixed(2)));
}

function renderRunePicksPanel(progress: PlayerProgress): HTMLElement {
  const count = el("span", { className: "badge" });
  const allWait = minutesInput();
  allWait.placeholder = "10";
  const allError = el("span", { className: "error" });
  const applyAll = () => {
    const seconds = readSeconds(allWait);
    if (seconds === null) {
      allError.textContent = `Enter 0 to ${MAX_MINUTES} minutes.`;
      return;
    }
    allError.textContent = "";
    progress.setAllRunePicks({ wait: seconds });
  };
  allWait.addEventListener("keydown", (event) => event.key === "Enter" && applyAll());
  allWait.addEventListener("input", () => (allError.textContent = ""));

  const rows = [...CHEST_RUNES].reverse().map((rune) => {
    const check = el("input", { type: "checkbox" });
    check.addEventListener("change", () => progress.setRunePick(rune, { on: check.checked }));
    const wait = minutesInput();
    wait.setAttribute("aria-label", `Max wait for ${rune}, minutes`);
    wait.addEventListener("change", () => {
      const seconds = readSeconds(wait);
      if (seconds === null) return render();
      progress.setRunePick(rune, { wait: seconds });
    });
    const name = el("span", { className: "chest-item", textContent: `${rune} Rune` });
    name.dataset.category = "rune";
    const row = el("li", {}, el("label", { className: "check" }, check, name), el("span", { className: "with-unit" }, wait, "min"));
    return { rune, row, check, wait };
  });

  function render(): void {
    const picks = progress.runePicks;
    for (const { rune, row, check, wait } of rows) {
      const pick = picks[rune];
      check.checked = pick.on;
      if (document.activeElement !== wait) wait.value = showMinutes(pick.wait);
      row.classList.toggle("off", !pick.on);
    }
    const picked = progress.pickedRunes.size;
    count.textContent = `${plural(picked, "rune")} picked`;
    count.classList.toggle("done", picked > 0);
  }
  progress.subscribe(render);
  render();

  return el(
    "section",
    { className: "panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Rune picks" }), count),
    el("p", {
      className: "lead",
      textContent:
        "Tick the runes you want your plans to look for, and the longest you'll wait at River of Flame for each. " +
        "Waypoint-only plans have no wait, so for those only the tick matters.",
    }),
    el("p", { className: "hint", textContent: "Zod never drops from these super chests, so the list starts at Cham." }),
    el(
      "div",
      { className: "rune-picks-tools" },
      el("label", {}, "Max wait for every rune ", el("span", { className: "with-unit" }, allWait, "min")),
      button("Apply to all", applyAll, "primary"),
      button("Pick all", () => progress.setAllRunePicks({ on: true }), "small"),
      button("Pick none", () => progress.setAllRunePicks({ on: false }), "small"),
      allError,
    ),
    el("ul", { className: "rune-pick-list" }, ...rows.map(({ row }) => row)),
  );
}

export const runePicks: Feature = {
  id: "runes",
  title: "Rune Picks",
  summary: "Choose which runes your plans look for, and how long you'll wait for each.",
  ready: true,
  createPage(progress) {
    return { root: el("div", { className: "page" }, renderRunePicksPanel(progress)) };
  },
};
