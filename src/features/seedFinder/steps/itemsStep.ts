import { MIN_SEARCH_ITEMS } from "../board";
import { searchedItems } from "../boardItems";
import { renderBoardInput } from "../boardInput";
import { AUTO_DELAY_MS, QUICK_ITEMS, renderQuickOptions } from "../quickSearch";
import { STORE_SEED_COUNT } from "../../../search/seedSearch";
import { button, el } from "../../../ui/dom";
import type { StepView, Wizard } from "../wizard";

export function renderItemsStep(wizard: Wizard): StepView {
  const { board, setup } = wizard.state;
  const options = renderQuickOptions("d2lkscp-seed", "repeat-options advanced-only");
  const start = () => wizard.startSearch(wizard.progress.advanced && options.quick.checked);
  const search = button(`Search all ${STORE_SEED_COUNT.toLocaleString("en-US")} store seeds →`, start, "primary");
  let boardKey = JSON.stringify(board);
  let autoTimer = 0;
  const input = renderBoardInput(board, setup, (blocker) => {
    wizard.save();
    search.disabled = blocker !== null;
    const key = JSON.stringify(board);
    if (key === boardKey) return;
    boardKey = key;
    clearTimeout(autoTimer);
    if (!wizard.progress.advanced || !options.auto.checked || blocker !== null || searchedItems(board).length < QUICK_ITEMS) return;
    autoTimer = window.setTimeout(() => {
      if (input.root.isConnected) start();
    }, AUTO_DELAY_MS);
  });

  return {
    root: el(
      "div",
      { className: "step" },
      el("p", {
        className: "lead",
        textContent:
          "Rebuild your gamble window: pick items from the list (type to filter), then drag each one to exactly " +
          "where it sits in your window. Positions matter, so take care. You can leave out items you can't " +
          `identify. The search needs at least ${MIN_SEARCH_ITEMS} items, including the one in the top-left corner.`,
      }),
      input.root,
      options.root,
      el(
        "div",
        { className: "step-footer" },
        button("← Setup", () => wizard.goTo("setup")),
        search,
      ),
    ),
    onShow: () => input.focus(),
  };
}
