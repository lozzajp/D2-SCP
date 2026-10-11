type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child) element.append(child);
  return element;
}

export function button(label: string, onClick: () => void, className = ""): HTMLButtonElement {
  return el("button", { type: "button", className, textContent: label, onclick: onClick });
}

export function field(label: string, ...controls: Child[]): HTMLElement {
  return el("div", { className: "field" }, el("span", { className: "field-label", textContent: label }), ...controls);
}

export function choiceTabs<T>(
  options: readonly { id: T; label: string }[],
  selected: T,
  onSelect: (id: T) => void,
): HTMLElement {
  const tabs = el("div", { className: "tabs" });
  for (const option of options) {
    const tab = button(option.label, () => onSelect(option.id), option.id === selected ? "tab active" : "tab");
    tab.setAttribute("aria-pressed", String(option.id === selected));
    tabs.append(tab);
  }
  return tabs;
}

export function copyButton(text: string): HTMLButtonElement {
  const copy = button("Copy", () => {
    navigator.clipboard?.writeText(text).then(
      () => flash(copy, "Copied"),
      () => flash(copy, "Copy failed"),
    );
  }, "small copy");
  copy.title = `Copy ${text}`;
  return copy;
}

function flash(target: HTMLButtonElement, message: string): void {
  target.textContent = message;
  setTimeout(() => (target.textContent = "Copy"), 1200);
}
