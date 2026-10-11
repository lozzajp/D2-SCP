import { button, el } from "../ui/dom";
import { formatSeed } from "../ui/format";
import { GAME_TYPE_LABELS, type PlayerProgress } from "./progress";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

export function renderSeedHistoryMenu(progress: PlayerProgress): HTMLElement {
  const list = el("ol", { className: "seed-history" });
  const menu = el(
    "details",
    { className: "settings-menu history-menu" },
    el("summary", { title: "Previous game seeds" }, "Previous seeds"),
    el(
      "div",
      { className: "settings-body" },
      el("section", { className: "settings-section" }, el("h3", { textContent: "Previous seeds" }), list),
    ),
  );

  const render = () => {
    const known = progress.knownSeed;
    const history = progress.seedHistory;
    if (history.length === 0) {
      list.replaceChildren(el("li", { className: "muted", textContent: "None yet: seeds you use will show up here." }));
      return;
    }
    list.replaceChildren(
      ...history.map((seed) => {
        const current = known?.gameSeed === seed.gameSeed && known.gameType === seed.gameType;
        return el(
          "li",
          {},
          el("code", { textContent: formatSeed(seed.gameSeed) }),
          el("span", { className: "muted", textContent: TIME_FORMAT.format(seed.foundAt) }),
          seed.gameType !== "normal" && el("span", { className: "muted", textContent: GAME_TYPE_LABELS[seed.gameType] }),
          current
            ? el("span", { className: "current", textContent: "Current" })
            : button("Use", () => progress.setKnownSeed({ gameSeed: seed.gameSeed, gameType: seed.gameType }), "small"),
        );
      }),
    );
  };
  progress.subscribe(render);
  render();

  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") menu.open = false;
  });
  return menu;
}
