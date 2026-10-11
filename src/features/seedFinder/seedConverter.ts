import { storeSeedFromGameSeed } from "../../rng/gameSeed";
import { el } from "../../ui/dom";
import { parseSeed } from "../../ui/format";
import { renderGameSeeds, SEEDINGS, seedValue } from "./gameSeeds";

export function renderSeedConverter(): HTMLElement {
  return el(
    "section",
    { className: "panel converter" },
    el("header", { className: "panel-head" }, el("h2", { textContent: "Seed converter (Advanced)" })),
    el(
      "div",
      { className: "converter-body" },
      converterRow("Store seed → game seed", "e.g. 1161875147", (seed) => renderGameSeeds(seed, SEEDINGS)),
      converterRow("Game seed → store seed", "e.g. 638589163", renderStoreSeeds),
    ),
  );
}

function converterRow(label: string, placeholder: string, convert: (seed: number) => HTMLElement): HTMLElement {
  const input = el("input", { type: "text", inputMode: "numeric", placeholder, spellcheck: false, autocomplete: "off" });
  const output = el("div", { className: "converter-output" });
  input.addEventListener("input", () => {
    const seed = parseSeed(input.value);
    if (input.value.trim() === "") output.replaceChildren();
    else if (seed === null) output.replaceChildren(el("span", { className: "muted", textContent: "Enter a whole number from 0 to 4294967295." }));
    else output.replaceChildren(convert(seed));
  });
  return el(
    "div",
    { className: "converter-row" },
    el("label", {}, el("span", { className: "field-label", textContent: label }), input),
    output,
  );
}

function renderStoreSeeds(gameSeed: number): HTMLElement {
  const list = el("dl", { className: "seed-list" });
  for (const { draws, label } of SEEDINGS) {
    list.append(el("dt", { textContent: label }), el("dd", {}, seedValue(storeSeedFromGameSeed(gameSeed, draws))));
  }
  return list;
}
