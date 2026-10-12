import { el } from "../ui/dom";
import { formatSeed } from "../ui/format";
import { GAME_TYPE_LABELS, type PlayerProgress } from "./progress";

export function seedStatusLine(progress: PlayerProgress): HTMLElement {
  const line = el("p", { className: "hint" });
  const render = () => {
    const known = progress.knownSeed;
    line.replaceChildren(
      ...(known
        ? ["Using game seed ", el("code", { textContent: formatSeed(known.gameSeed) }), ` (${GAME_TYPE_LABELS[known.gameType]}).`]
        : ["You'll need your game seed first: ", el("a", { href: "#/run", textContent: "find it from the gamble window" }), "."]),
    );
  };
  progress.subscribe(render);
  render();
  return line;
}
