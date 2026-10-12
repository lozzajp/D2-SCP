export function onUndoKey(root: HTMLElement, undo: () => boolean): void {
  const listener = (event: KeyboardEvent) => {
    if (!root.isConnected) return document.removeEventListener("keydown", listener);
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") return;
    if (root.getClientRects().length === 0) return;
    const target = event.target;
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.value !== "") return;
    if (target instanceof HTMLElement && target.isContentEditable) return;
    if (undo()) event.preventDefault();
  };
  document.addEventListener("keydown", listener);
}
