import { CHEST_DROPS, chestDropsFor } from "../../data/chestDrops";
import type { ChestSlot, PlayerProgress } from "../../app/progress";
import { button, el } from "../../ui/dom";
import { plural } from "../../ui/format";
import { createPicker } from "../../ui/picker";
import { onUndoKey } from "../../ui/undo";

const CATEGORY_OF = new Map(CHEST_DROPS.map((drop) => [drop.name, drop.category]));

export function renderDropsPanel(progress: PlayerProgress, slot: ChestSlot): HTMLElement {
  let saved = progress.chest(slot).drops;
  const drops = [...saved];
  const list = el("ul", { className: "drop-list" });
  const caption = el("p", { className: "caption" });
  const clear = button("Clear list", () => update([]), "small");
  const exact = el("input", { type: "checkbox", checked: progress.chest(slot).exact });
  exact.addEventListener("change", () => progress.updateChest(slot, { exact: exact.checked }));
  progress.subscribe(() => {
    const chest = progress.chest(slot);
    exact.checked = chest.exact;
    if (chest.drops !== saved) {
      saved = chest.drops;
      drops.splice(0, drops.length, ...saved);
      render();
    }
  });

  const picker = createPicker(
    chestDropsFor(progress.area.id).map((drop) => ({ value: drop.name, name: drop.name, category: drop.category })),
    (name) => {
      update([...drops, name]);
      return true;
    },
    "Find an item… (↑ ↓ Enter)",
  );

  function update(next: string[]): void {
    drops.splice(0, drops.length, ...next);
    progress.updateChest(slot, { drops });
    saved = progress.chest(slot).drops;
    render();
  }

  function render(): void {
    list.replaceChildren(
      ...drops.map((name, index) => {
        const row = el(
          "li",
          {},
          el("span", { className: "picker-swatch" }),
          el("span", { className: "drop-name", textContent: name }),
          button("×", () => update(drops.filter((_, i) => i !== index)), "small drop-remove"),
        );
        row.dataset.category = CATEGORY_OF.get(name);
        row.lastElementChild!.setAttribute("aria-label", `Remove ${name}`);
        return row;
      }),
    );
    caption.textContent = drops.length > 0 ? `${plural(drops.length, "item")} entered` : "Nothing entered yet.";
    clear.disabled = drops.length === 0;
  }
  render();

  const panel = el(
    "section",
    { className: "panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "What did it drop?" })),
    el("p", {
      className: "lead",
      textContent:
        "Add the items that dropped from that chest, in any order. The more you add, the surer the match, but missing a few is fine. Add Gold once per pile (the amount isn't needed).",
    }),
    el(
      "div",
      { className: "items-layout" },
      picker.root,
      el(
        "div",
        { className: "drops-column" },
        caption,
        list,
        el(
          "label",
          { className: "check", title: "Only match chest seeds that drop exactly these items, nothing more." },
          exact,
          "Exact match: this is everything the chest dropped",
        ),
        clear,
      ),
    ),
  );
  panel.addEventListener("focusin", (event) => {
    const from = event.relatedTarget;
    if (!(event.target instanceof HTMLInputElement) || !picker.root.contains(event.target)) return;
    if (from instanceof Node && panel.contains(from)) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  onUndoKey(panel, () => {
    if (drops.length === 0) return false;
    update(drops.slice(0, -1));
    return true;
  });
  return panel;
}
