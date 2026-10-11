import { MAX_CHEST_DRAWS } from "../chest/chestStream";
import { CHEST_RUNES, FIRE_RATE_NOTE } from "../chest/runePlan";
import { PLATFORMS } from "../gamble/settings";
import { el } from "../ui/dom";
import { formatSeed } from "../ui/format";
import { GAME_TYPE_LABELS, type GameSettings, type PlayerProgress } from "./progress";

export function renderSettingsMenu(progress: PlayerProgress): HTMLElement {
  const summary = el("summary", { title: "Game settings" });
  const seedRow = el("div", { className: "settings-seed" });
  const distance = numberInput("distanceToFirstChest", "1", "e.g. 72");
  const riverAdds = el("code", {});
  const fireRate = numberInput("fireRate", "0.1", "1.0 - 3.0");
  Object.assign(distance, { min: "1", max: String(MAX_CHEST_DRAWS) });
  const platform = el("select", {}, ...PLATFORMS.map(({ id, label }) => el("option", { value: id, textContent: label })));
  platform.addEventListener("change", () => {
    const picked = PLATFORMS.find(({ id }) => id === platform.value);
    if (picked) progress.setPlatform(picked.id);
  });
  const minRune = el("select", {}, ...CHEST_RUNES.map((rune) => el("option", { value: rune, textContent: `${rune} or better` })));
  minRune.addEventListener("change", () => {
    const rune = CHEST_RUNES.find((chestRune) => chestRune === minRune.value);
    if (rune) progress.setMinRune(rune);
  });
  const charLevel = el("input", { type: "number", min: "1", max: "99", step: "1", className: "level-input" });
  const advanced = el("input", { type: "checkbox" });
  advanced.addEventListener("change", () => progress.setAdvanced(advanced.checked));
  charLevel.addEventListener("change", () => {
    const level = Number(charLevel.value);
    if (charLevel.value.trim() !== "" && Number.isFinite(level)) progress.setCharLevel(Math.min(99, Math.max(1, level)));
    charLevel.value = String(progress.charLevel);
  });

  function numberInput(key: keyof GameSettings, step: string, placeholder: string): HTMLInputElement {
    const input = el("input", { type: "number", min: "0", step, placeholder });
    input.addEventListener("change", () => {
      const value = input.value.trim() === "" ? null : Number(input.value);
      progress.updateSettings({ [key]: value !== null && Number.isFinite(value) && value >= 0 ? value : null });
    });
    return input;
  }

  const menu = el(
    "details",
    { className: "settings-menu" },
    summary,
    el(
      "div",
      { className: "settings-body" },
      el(
        "section",
        { className: "settings-section" },
        el("h3", { textContent: "Seed" }),
        seedRow,
        el("label", {}, el("span", { textContent: "Platform" }), platform),
        el("label", {}, el("span", { textContent: "Character level" }), charLevel),
      ),
      el(
        "section",
        { className: "settings-section" },
        el("h3", { textContent: "Calibration" }),
        el("label", {}, el("span", { textContent: "Distance to first chest (direct)" }), distance),
        el("div", { className: "settings-row" }, el("span", { textContent: "River of Flame adds" }), riverAdds),
        el("label", {}, el("span", { textContent: "Fire rate" }), el("span", { className: "with-unit" }, fireRate, "×/s")),
        el("p", { className: "hint", textContent: `(${FIRE_RATE_NOTE})` }),
      ),
      el(
        "section",
        { className: "settings-section" },
        el("h3", { textContent: "Planning" }),
        el("label", {}, el("span", { textContent: "Lowest rune wanted" }), minRune),
      ),
      el(
        "section",
        { className: "settings-section" },
        el("h3", { textContent: "Mode" }),
        el("label", { className: "check" }, el("span", { textContent: "Advanced mode" }), advanced),
        el("p", {
          className: "hint",
          textContent: `Hides the how-to notes at the top of pages, and adds the Repeat page's quick search options to Find your seed.`,
        }),
      ),
    ),
  );

  const render = () => {
    const known = progress.knownSeed;
    const settings = progress.settings;
    summary.replaceChildren(
      item("Seed", known ? formatSeed(known.gameSeed) : null),
      item("Level", String(progress.charLevel)),
      item("Distance", settings.distanceToFirstChest === null ? null : String(settings.distanceToFirstChest)),
      item("RoF", progress.riverAdds === null ? null : `+${progress.riverAdds}`),
      item("Fire", settings.fireRate === null ? null : `${settings.fireRate}×/s`),
      item("Rune", `${progress.minRune}+`),
    );
    const closeMenu = () => setTimeout(() => (menu.open = false));
    seedRow.replaceChildren(
      ...(known
        ? [
            el("code", { textContent: formatSeed(known.gameSeed) }),
            el("span", { className: "muted", textContent: GAME_TYPE_LABELS[known.gameType] }),
            el("a", { href: "#/seed", textContent: "Change", onclick: closeMenu }),
          ]
        : [
            el("span", { className: "muted", textContent: "Not known yet." }),
            el("a", { href: "#/seed", textContent: "Find your seed →", onclick: closeMenu }),
          ]),
    );
    if (document.activeElement !== distance) distance.value = settings.distanceToFirstChest?.toString() ?? "";
    riverAdds.textContent = progress.riverAdds === null ? "not measured" : `+${progress.riverAdds}`;
    if (document.activeElement !== fireRate) fireRate.value = settings.fireRate?.toString() ?? "";
    platform.value = progress.platform;
    if (document.activeElement !== charLevel) charLevel.value = String(progress.charLevel);
    minRune.value = progress.minRune;
    advanced.checked = progress.advanced;
  };
  progress.subscribe(render);
  render();

  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.open = false;
      summary.focus();
    }
  });
  return menu;
}

function item(label: string, value: string | null): HTMLElement {
  return el(
    "span",
    { className: value === null ? "settings-item unset" : "settings-item" },
    `${label} `,
    value === null ? "—" : el("code", { textContent: value }),
  );
}
