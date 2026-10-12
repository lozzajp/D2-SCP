import { GAME_VERSIONS, PLATFORMS } from "../gamble/settings";
import { el, field } from "../ui/dom";
import type { PlayerProgress } from "./progress";

export interface PlayerSettingInputs {
  level: HTMLInputElement;
  platform: HTMLSelectElement;
  version: HTMLSelectElement;
  render: () => void;
}

export function playerSettingInputs(progress: PlayerProgress): PlayerSettingInputs {
  const choose = () => el("option", { value: "", textContent: "Choose…", disabled: true });
  const level = el("input", { type: "number", min: "1", max: "99", step: "1", placeholder: "1 - 99", className: "level-input" });
  const platform = el("select", {}, choose(), ...PLATFORMS.map(({ id, label }) => el("option", { value: id, textContent: label })));
  const version = el("select", {}, choose(), ...GAME_VERSIONS.map(({ id, label }) => el("option", { value: id, textContent: label })));
  level.addEventListener("change", () => {
    const value = Number(level.value);
    if (level.value.trim() !== "" && Number.isFinite(value)) progress.setCharLevel(Math.min(99, Math.max(1, value)));
    level.value = progress.charLevel?.toString() ?? "";
  });
  platform.addEventListener("change", () => {
    const picked = PLATFORMS.find(({ id }) => id === platform.value);
    if (picked) progress.setPlatform(picked.id);
  });
  version.addEventListener("change", () => {
    const picked = GAME_VERSIONS.find(({ id }) => id === version.value);
    if (picked) progress.setVersion(picked.id);
  });
  const render = () => {
    if (document.activeElement !== level) level.value = progress.charLevel?.toString() ?? "";
    platform.value = progress.platform ?? "";
    version.value = progress.version ?? "";
    level.classList.toggle("missing", progress.charLevel === null);
    platform.classList.toggle("missing", progress.platform === null);
    version.classList.toggle("missing", progress.version === null);
  };
  return { level, platform, version, render };
}

export function renderPlayerSettingsPanel(progress: PlayerProgress): HTMLElement {
  const inputs = playerSettingInputs(progress);
  const badge = el("span", { className: "badge" });
  const lead = el("p", { className: "lead" });
  const render = () => {
    inputs.render();
    const missing = progress.playerSettingsMissing;
    badge.textContent = missing ? "Required" : "Set";
    badge.className = missing ? "badge required" : "badge done";
    lead.textContent = missing
      ? "Set these before anything else: they decide which items Gheed can offer, so the seed finder needs them to match your game."
      : "These match your game. Change them here or in the settings menu if you switch character or platform.";
  };
  progress.subscribe(render);
  render();
  return el(
    "section",
    { className: "panel player-settings" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Player Settings" }), badge),
    lead,
    el(
      "div",
      { className: "player-settings-fields" },
      field("Character level", inputs.level),
      field("Platform", inputs.platform),
      field("Version", inputs.version),
    ),
  );
}
