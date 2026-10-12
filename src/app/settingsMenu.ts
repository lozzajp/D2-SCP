import { FIRE_RATE_NOTE } from "../chest/runePlan";
import { button, el } from "../ui/dom";
import { formatSeed } from "../ui/format";
import { playerSettingInputs } from "./playerSettings";
import { GAME_TYPE_LABELS, type GameSettings, type PlayerProgress } from "./progress";

const STORAGE_PREFIX = "d2lkscp-";

export function openSettingsMenu(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  const menu = document.querySelector<HTMLDetailsElement>("details.settings-menu");
  if (!menu) return;
  menu.open = true;
  menu.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function renderSettingsMenu(progress: PlayerProgress): HTMLElement {
  const summary = el("summary", { title: "Game settings" });
  const seedRow = el("div", { className: "settings-seed" });
  const fireRate = numberInput("fireRate", "0.1", "1.0 - 3.0");
  const player = playerSettingInputs(progress);

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
      ),
      el(
        "section",
        { className: "settings-section" },
        el("h3", { textContent: "Player Settings" }),
        el("label", {}, el("span", { textContent: "Character level" }), player.level),
        el("label", {}, el("span", { textContent: "Platform" }), player.platform),
        el("label", {}, el("span", { textContent: "Version" }), player.version),
      ),
      el(
        "section",
        { className: "settings-section" },
        el("h3", { textContent: "Planning" }),
        el("label", {}, el("span", { textContent: "Fire rate" }), el("span", { className: "with-unit" }, fireRate, "×/s")),
        el("p", { className: "hint", textContent: `(${FIRE_RATE_NOTE})` }),
        el("p", { className: "hint" }, "Runes and how long to wait for each are set on ", el("a", { href: "#/runes", textContent: "Rune Picks" }), "."),
        el("p", { className: "hint" }, "Route distances are set per area on the ", el("a", { href: "#/calibrate", textContent: "Calibrate page" }), "."),
      ),
      el(
        "section",
        { className: "settings-section" },
        el("h3", { textContent: "Data" }),
        button("Reset data", resetData, "danger"),
        el("p", { className: "hint", textContent: "Deletes everything this site saved in your browser: calibration, seeds, plans and settings." }),
      ),
    ),
  );

  const render = () => {
    const known = progress.knownSeed;
    const settings = progress.settings;
    summary.replaceChildren(
      item("Seed", known ? formatSeed(known.gameSeed) : null),
      item("Level", progress.charLevel === null ? null : String(progress.charLevel)),
      item("Fire", settings.fireRate === null ? null : `${settings.fireRate}×/s`),
      item("Runes", String(progress.pickedRunes.size)),
    );
    const closeMenu = () => setTimeout(() => (menu.open = false));
    seedRow.replaceChildren(
      ...(known
        ? [
            el("code", { textContent: formatSeed(known.gameSeed) }),
            el("span", { className: "muted", textContent: GAME_TYPE_LABELS[known.gameType] }),
            el("a", { href: "#/run", textContent: "Change", onclick: closeMenu }),
          ]
        : [
            el("span", { className: "muted", textContent: "Not known yet." }),
            el("a", { href: "#/run", textContent: "Find your seed →", onclick: closeMenu }),
          ]),
    );
    if (document.activeElement !== fireRate) fireRate.value = settings.fireRate?.toString() ?? "";
    player.render();
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

function resetData(): void {
  if (!confirm("Reset all data? This deletes your calibration, seeds, plans and settings from this browser. It can't be undone.")) return;
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
  } catch {
  }
  location.hash = "#/run";
  location.reload();
}

function item(label: string, value: string | null): HTMLElement {
  return el(
    "span",
    { className: value === null ? "settings-item unset" : "settings-item" },
    `${label} `,
    value === null ? "—" : el("code", { textContent: value }),
  );
}
