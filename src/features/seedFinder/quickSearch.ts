import { el } from "../../ui/dom";

export const QUICK_ITEMS = 7;
export const AUTO_DELAY_MS = 400;

export interface QuickOptions {
  auto: HTMLInputElement;
  quick: HTMLInputElement;
  root: HTMLElement;
}

export function renderQuickOptions(keyPrefix: string, className = "repeat-options", defaultOn = false): QuickOptions {
  const auto = savedCheckbox(`${keyPrefix}-auto`, defaultOn);
  const quick = savedCheckbox(`${keyPrefix}-quick`, defaultOn);
  const root = el(
    "div",
    { className },
    el("label", { className: "check" }, auto, `Start searching on ${QUICK_ITEMS}th item input`),
    el("label", { className: "check" }, quick, `Use first seed found with ${QUICK_ITEMS}+ items`),
  );
  return { auto, quick, root };
}

function savedCheckbox(key: string, defaultOn: boolean): HTMLInputElement {
  const saved = localStorage.getItem(key);
  const box = el("input", { type: "checkbox", checked: saved === null ? defaultOn : saved === "1" });
  box.addEventListener("change", () => {
    try {
      localStorage.setItem(key, box.checked ? "1" : "0");
    } catch {
    }
  });
  return box;
}
