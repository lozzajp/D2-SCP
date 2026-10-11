import type { ChestSlot, PlayerProgress } from "../../app/progress";
import { findChestSeeds, type ChestMatch, type ChestSearch } from "../../chest/chestSeedMatcher";
import { loadChestPatterns } from "../../chest/loadPatterns";
import type { ChestPatterns } from "../../chest/patterns";
import { CHEST_DROPS } from "../../data/chestDrops";
import { button, el } from "../../ui/dom";
import { plural } from "../../ui/format";

const CATEGORY_OF = new Map(CHEST_DROPS.map((drop) => [drop.name, drop.category]));

export function renderChestSeedPanel(
  progress: PlayerProgress,
  slot: ChestSlot,
  onSearch: (search: ChestSearch | undefined) => void = () => {},
): HTMLElement {
  const saved = el("span", { className: "badge" });
  const status = el("p", { className: "lead" });
  const body = el("div", { className: "chest-result" });
  let patterns: ChestPatterns | undefined;
  let searchedDrops: readonly string[] | undefined;
  let searchedExact = false;
  let search: ChestSearch | undefined;
  let selected = 0;

  function update(): void {
    const { drops, exact, seed } = progress.chest(slot);
    saved.textContent = seed === null ? "Not saved" : `Saved: ${seed}`;
    saved.classList.toggle("done", seed !== null);
    if (!patterns) return;
    if (drops !== searchedDrops || exact !== searchedExact) {
      searchedDrops = drops;
      searchedExact = exact;
      search = drops.length > 0 ? findChestSeeds(patterns, drops, exact) : undefined;
      selected = 0;
      onSearch(search);
    }
    render();
  }

  function render(): void {
    if (!search) {
      status.className = "lead";
      status.textContent = "Add the drops above and the best matching chest seed will show here.";
      body.replaceChildren();
      return;
    }
    const best = search.matches[0];
    if (!best) {
      status.className = "lead error";
      status.textContent = searchedExact
        ? "No chest seed drops exactly these items. Double-check the list, or untick Exact match if you missed some."
        : "No chest seed drops any of these items. Double-check the list.";
      body.replaceChildren();
      return;
    }
    const all = best.matched === search.entered;
    const full = all ? search.candidates.length : 0;
    const exactOnes = all ? search.candidates.filter((score) => score.extra === 0).length : 0;
    status.className = full === 1 || exactOnes === 1 ? "lead success" : "lead";
    status.textContent =
      full === 1
        ? `Chest seed ${best.seed} is the only one that drops everything you entered.`
        : full > 1
          ? `${full.toLocaleString("en-US")} chest seeds drop everything you entered. ` +
            (exactOnes === 1
              ? `Only ${best.seed} drops nothing else (an exact match), so it's most likely yours. `
              : exactOnes > 1
                ? `${exactOnes} of them drop nothing else (exact matches). `
                : `${best.seed} has the fewest extras. `) +
            "The check below finds which of them is in your game."
          : search.tied > 1
            ? `${search.tied} chest seeds match equally well. Add more items to narrow it down.`
            : `Closest is chest seed ${best.seed}, but it doesn't drop everything you entered. Double-check the list.`;
    body.replaceChildren(candidateList(search), matchDetails(search.matches[selected], search.entered));
  }

  function candidateList(result: ChestSearch): HTMLElement {
    return el(
      "ol",
      { className: "chest-candidates" },
      ...result.matches.map((match, index) => {
        const pick = button("", () => {
          selected = index;
          render();
        }, index === selected ? "chest-candidate active" : "chest-candidate");
        pick.append(
          el("strong", { textContent: String(match.seed) }),
          el("span", { textContent: `${match.matched}/${result.entered} matched` }),
          el("span", { className: "muted", textContent: match.extra > 0 ? `${match.extra} not entered` : "Exact match" }),
        );
        pick.setAttribute("aria-pressed", String(index === selected));
        return el("li", {}, pick);
      }),
    );
  }

  function matchDetails(match: ChestMatch, entered: number): HTMLElement {
    const isSaved = progress.chest(slot).seed === match.seed;
    return el(
      "div",
      { className: "chest-match" },
      el(
        "div",
        { className: "chest-match-head" },
        el("h3", {}, "Chest seed ", el("code", { textContent: String(match.seed) })),
        el("span", { className: "muted", textContent: `${match.matched} of ${plural(entered, "item")} matched` }),
        button(isSaved ? "Saved" : "Use this chest seed", () => progress.updateChest(slot, { seed: match.seed }), isSaved ? "" : "primary"),
      ),
      nameList("Entered but this seed never drops", match.missing),
      nameList("This seed drops but you didn't enter", match.notSeen),
      cycleList(match),
    );
  }

  function cycleList(match: ChestMatch): HTMLElement {
    const { unlockedCycles, cycles } = patterns!.pattern(match.seed);
    const dropped = match.lock === "unlocked" ? cycles.slice(0, unlockedCycles) : cycles;
    return el(
      "div",
      {},
      el("h4", { textContent: "Full drop, cycle by cycle" }),
      el(
        "ol",
        { className: "chest-cycles" },
        ...dropped.map((cycle) =>
          el(
            "li",
            {},
            ...(cycle.length === 0 ? [el("span", { className: "muted", textContent: "nothing" })] : cycle.map(itemChip)),
          ),
        ),
      ),
    );
  }

  progress.subscribe(update);
  update();
  status.textContent = "Loading chest drop patterns…";
  loadChestPatterns().then(
    (loaded) => {
      patterns = loaded;
      update();
    },
    (error: unknown) => {
      status.className = "lead error";
      status.textContent = error instanceof Error ? error.message : "Couldn't load chest patterns.";
    },
  );

  return el(
    "section",
    { className: "panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Your chest seed" }), saved),
    status,
    body,
  );
}

function nameList(title: string, names: readonly string[]): HTMLElement | null {
  if (names.length === 0) return null;
  return el("div", {}, el("h4", { textContent: title }), el("div", { className: "chest-items" }, ...countNames(names).map(itemChip)));
}

function countNames(names: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
}

function itemChip(label: string): HTMLElement {
  const chip = el("span", { className: "chest-item", textContent: label });
  chip.dataset.category = CATEGORY_OF.get(label.replace(/ ×\d+$/, ""));
  return chip;
}
