import { el } from "./dom";

export interface PickerEntry<T> {
  value: T;
  name: string;
  detail?: string;
  category?: string;
  demoted?: boolean;
}

export interface Picker {
  root: HTMLElement;
  focus(options?: FocusOptions): void;
  setDisabled(disabled: boolean, reason?: string): void;
}

export function matches(text: string, name: string, words: readonly string[] = name.split(/[\s-]+/)): boolean {
  if (name.includes(text)) return true;
  const terms = text.split(" ");
  if (terms.length < 2) return false;
  let next = 0;
  for (const term of terms) {
    while (next < words.length && !words[next].startsWith(term)) next++;
    if (next === words.length) return false;
    next++;
  }
  return true;
}

export function preferredIndex(
  text: string,
  candidates: readonly { name: string; words: readonly string[]; demoted?: boolean }[],
): number {
  const first = text.split(" ")[0];
  const score = ({ name, words, demoted }: (typeof candidates)[number]) =>
    (demoted ? 2000 : 0) + (words.some((word) => word.startsWith(first)) ? 0 : 1000) + name.length;
  let best = 0;
  candidates.forEach((candidate, index) => {
    if (score(candidate) < score(candidates[best])) best = index;
  });
  return best;
}

export function createPicker<T>(
  entries: readonly PickerEntry<T>[],
  onPick: (value: T) => boolean,
  placeholder = "Filter items… (↑ ↓ Enter)",
  onHighlight?: (value: T | null) => void,
): Picker {
  const filter = el("input", {
    type: "search",
    className: "picker-filter",
    placeholder,
    spellcheck: false,
    autocomplete: "off",
  });
  const list = el("div", { className: "picker-list" });

  const rows = entries.map((entry) => {
    const row = el(
      "button",
      { type: "button", className: "picker-row", onclick: () => pick(entry.value) },
      el("span", { className: "picker-swatch" }),
      el("span", { className: "picker-name", textContent: entry.name }),
      entry.detail ? el("span", { className: "picker-size", textContent: entry.detail }) : null,
    );
    if (entry.category) row.dataset.category = entry.category;
    row.addEventListener("pointerenter", () => onHighlight?.(entry.value));
    list.append(row);
    const name = entry.name.toLowerCase();
    return { value: entry.value, row, name, words: name.split(/[\s-]+/), demoted: entry.demoted ?? false };
  });

  let visible = rows;
  let selected = -1;
  list.addEventListener("pointerleave", () => onHighlight?.(visible[selected]?.value ?? null));

  function select(index: number): void {
    visible[selected]?.row.classList.remove("selected");
    selected = index;
    const row = visible[selected]?.row;
    row?.classList.add("selected");
    row?.scrollIntoView({ block: "nearest" });
    onHighlight?.(visible[selected]?.value ?? null);
  }

  function applyFilter(): void {
    const text = filter.value.trim().toLowerCase().replace(/\s+/g, " ");
    select(-1);
    for (const { row, name, words } of rows) row.hidden = !matches(text, name, words);
    visible = rows.filter(({ row }) => !row.hidden);
    list.scrollTop = 0;
    if (text && visible.length > 0) select(preferredIndex(text, visible));
  }

  function pick(value: T): void {
    if (onPick(value)) {
      filter.value = "";
      applyFilter();
    }
    filter.focus();
  }

  filter.addEventListener("input", applyFilter);
  filter.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      select(Math.min(selected + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      select(Math.max(selected - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = visible[selected];
      if (choice && !choice.row.disabled) pick(choice.value);
    } else if (event.key === "Escape") {
      filter.value = "";
      applyFilter();
    }
  });

  return {
    root: el("div", { className: "picker" }, filter, list),
    focus: (options) => filter.focus(options),
    setDisabled(disabled, reason = "") {
      for (const { row } of rows) {
        row.disabled = disabled;
        row.title = disabled ? reason : "";
      }
    },
  };
}
