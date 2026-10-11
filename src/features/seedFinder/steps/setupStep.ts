import type { Setup } from "../state";
import type { PoolOrder } from "../../../data/poolOrders";
import {
  GAME_VERSIONS,
  PLATFORMS,
  platformPoolOrder,
  POOL_ORDERS,
} from "../../../gamble/settings";
import { button, choiceTabs, el, field } from "../../../ui/dom";
import type { StepView, Wizard } from "../wizard";

export function renderSetupStep(wizard: Wizard): StepView {
  const { setup } = wizard.state;

  function change(changes: Partial<Setup>): void {
    Object.assign(setup, changes);
    wizard.save();
    wizard.goTo("setup");
  }

  const levelInput = el("input", { type: "number", min: "1", max: "99", value: String(setup.charLevel), className: "level-input" });
  levelInput.addEventListener("change", () => {
    const level = Number(levelInput.value);
    if (Number.isFinite(level)) wizard.progress.setCharLevel(Math.min(99, Math.max(1, level)));
    levelInput.value = String(wizard.progress.charLevel);
  });

  const platformOrder = POOL_ORDERS.find((order) => order.id === platformPoolOrder(setup.platform))!;
  const poolOrderSelect = el(
    "select",
    {},
    el("option", { value: "", textContent: `Platform default: ${platformOrder.label}` }),
    ...POOL_ORDERS.map(({ id, label }) => el("option", { value: id, textContent: label })),
  );
  poolOrderSelect.value = setup.poolOrderOverride ?? "";
  poolOrderSelect.addEventListener("change", () => {
    change({ poolOrderOverride: (poolOrderSelect.value || null) as PoolOrder | null });
  });

  const next = () => {
    if (wizard.fresh) {
      wizard.state.board.length = 0;
      wizard.save();
    }
    wizard.goTo("items");
  };

  return {
    root: el(
      "div",
      { className: "step" },
      el("p", {
        className: "lead",
        textContent:
          "Recover your game's gamble store seed from the first gamble window you see, then the game seed it " +
          "came from. Works for offline / single-player games. Use the first window of a fresh game: don't refresh or buy first.",
      }),
      field("Game version", choiceTabs(GAME_VERSIONS, setup.version, (id) => change({ version: id }))),
      field("Platform", choiceTabs(PLATFORMS, setup.platform, (platform) => wizard.progress.setPlatform(platform))),
      field("Character level", levelInput, el("span", { className: "hint", textContent: "" })),
      el("div", { className: "step-footer" }, button("Next: enter your items →", next, "primary")),
    ),
  };
}
