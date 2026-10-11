import { GAME_TYPE_LABELS, type PlayerProgress } from "../../app/progress";
import type { GameType } from "../../rng/gameSeed";
import { button, choiceTabs, el, field } from "../../ui/dom";
import { formatSeed, parseSeed } from "../../ui/format";
import { seedValue } from "./gameSeeds";

const GAME_TYPE_CHOICES = (Object.keys(GAME_TYPE_LABELS) as GameType[]).map((id) => ({ id, label: GAME_TYPE_LABELS[id] }));

export function renderKnownSeedPanel(progress: PlayerProgress): HTMLElement {
  const panel = el("section", { className: "panel known-seed" });
  let draftType: GameType = "seedFlag";
  let draftText = "";

  const render = () => {
    const known = progress.knownSeed;
    panel.replaceChildren(el("div", { className: "panel-head" }, el("h2", { textContent: "Manual Seed (Advanced)" })));

    if (known) {
      panel.append(
        el(
          "div",
          { className: "known-seed-row" },
          seedValue(known.gameSeed),
          el("span", { className: "muted", textContent: GAME_TYPE_LABELS[known.gameType] }),
          button("Change", () => {
            draftType = known.gameType;
            draftText = formatSeed(known.gameSeed);
            progress.setKnownSeed(null);
          }, "small"),
        ),
        el(
          "div",
          { className: "step-footer" },
          el("a", { className: "button-link primary", href: "#/calibrate", textContent: "Next: calibrate your routes →" }),
        ),
      );
      return;
    }

    const input = el("input", {
      type: "text",
      inputMode: "numeric",
      placeholder: "e.g. 638589163",
      value: draftText,
      oninput: () => {
        draftText = input.value;
        error.textContent = "";
      },
    });
    const error = el("span", { className: "error" });
    const save = () => {
      const gameSeed = parseSeed(input.value);
      if (gameSeed === null) {
        error.textContent = "Enter a whole number from 0 to 4294967295.";
        return;
      }
      progress.setKnownSeed({ gameSeed, gameType: draftType });
    };
    input.addEventListener("keydown", (event) => event.key === "Enter" && save());

    panel.append(
      el("p", {
        className: "lead",
        textContent: "Already know it? Enter it here. Otherwise find it from your first gamble window below and press “Use this seed”.",
      }),
      field("Game type", choiceTabs(GAME_TYPE_CHOICES, draftType, (id) => {
        draftType = id;
        render();
      })),
      field("Game seed", input, button("Save", save, "primary"), error),
    );
  };

  progress.subscribe(render);
  render();
  return panel;
}
