import type { PickedPlan, PlayerProgress } from "../../app/progress";
import { hasRepeats, RIVER_OF_FLAME, routeText, type WaypointId } from "../../chest/waypoints";
import { button, el } from "../../ui/dom";
import { waitTenths } from "../../ui/format";

const COUNTDOWN_BEEPS = 5;
const WARNING_SECONDS = 10;
const LEAD_IN_SECONDS = 3;
const START_SHOWN_SECONDS = 1;
const TICK_MS = 100;

interface Running {
  plan: PickedPlan;
  startedAt: number;
  tick: number;
  audio: AudioContext | null;
  wakeLock: WakeLockSentinel | null;
}

export function renderWaitTimer(progress: PlayerProgress): HTMLElement {
  const clock = el("div", { className: "timer-clock" });
  const flash = el("div", { className: "timer-flash" });
  const note = el("p", { className: "hint" });
  const playersNote = el("p", { className: "lead" });
  const startButton = button("Start timer", () => start(), "primary");
  const stopButton = button("Reset", () => reset());
  const root = el(
    "div",
    { className: "wait-timer", hidden: true },
    el("h3", { textContent: "Wait timer" }),
    playersNote,
    note,
    flash,
    clock,
    el("div", { className: "timer-buttons" }, startButton, stopButton),
  );
  let running: Running | null = null;
  let shown: PickedPlan | null = null;
  const lk = progress.hasWaypointRoutes;
  const leave = lk ? "take the waypoint to Lower Kurast" : "walk to the chest";

  function render(): void {
    const plan = progress.plan;
    if (running && !samePlan(running.plan, plan)) reset();
    shown = plan;
    root.hidden = !plan;
    if (!plan || running) return;
    const seconds = waitTenths(plan.wait);
    startButton.hidden = seconds === 0;
    stopButton.hidden = true;
    clock.className = "timer-clock";
    clock.textContent = clockText(plan.wait);
    flash.textContent = "";
    playersNote.replaceChildren(
      "Make sure your game is on ",
      el("strong", { textContent: `/players ${progress.players}` }),
      ` before you start: this plan's chest drops are for ${progress.players} players. Type it in game chat if you're not sure.`,
    );
    const before = hopsBefore(plan);
    if (seconds === 0 || plan.stops.at(-1) !== RIVER_OF_FLAME) {
      startButton.hidden = true;
      clock.textContent = "No wait";
      note.replaceChildren(
        routeLine(plan.stops, "Route: ", ".", "Lower Kurast"),
        hasRepeats(plan.stops)
          ? "Take each waypoint straight away and keep count of your laps. If your laps are very short, make sure 5 seconds pass before you're back in an area."
          : "Take each waypoint straight away, no waiting.",
      );
      return;
    }
    note.replaceChildren(
      ...before,
      seconds === 0
        ? `No wait: ${leave} as soon as you reach River of Flame.`
        : `Press Start, and on 3, 2, 1, START take the waypoint to River of Flame. It beeps at ${WARNING_SECONDS} seconds left and the last ${COUNTDOWN_BEEPS} seconds, ` +
            `then a long beep means ${leave}. Keep this tab's sound on.`,
    );
  }

  function start(): void {
    const plan = shown;
    if (!plan) return;
    const audio = createAudio();
    if (audio) scheduleBeeps(audio, plan.wait);
    const startedAt = performance.now() + LEAD_IN_SECONDS * 1000;
    running = { plan, startedAt, tick: window.setInterval(tick, TICK_MS), audio, wakeLock: null };
    const run = running;
    navigator.wakeLock?.request("screen").then(
      (lock) => (running === run ? (run.wakeLock = lock) : void lock.release()),
      () => {},
    );
    startButton.hidden = true;
    stopButton.hidden = false;
    stopButton.textContent = "Stop";
    tick();
  }

  function tick(): void {
    if (!running) return;
    const elapsed = (performance.now() - running.startedAt) / 1000;
    const left = running.plan.wait - Math.max(0, elapsed);
    flash.textContent = elapsed < 0 ? String(Math.ceil(-elapsed)) : elapsed < START_SHOWN_SECONDS && left > 0 ? "START" : "";
    if (elapsed < 0) {
      clock.className = "timer-clock";
      clock.textContent = clockText(left);
      note.textContent = "Get ready to take the waypoint to River of Flame…";
      return;
    }
    if (left > 0) {
      clock.className = left <= COUNTDOWN_BEEPS ? "timer-clock urgent" : "timer-clock";
      clock.textContent = clockText(left);
      note.textContent =
        elapsed < START_SHOWN_SECONDS
          ? "Take the waypoint to River of Flame now, then wait there."
          : "Waiting at River of Flame: don't move or pause the game.";
      return;
    }
    clock.className = "timer-clock go";
    clock.textContent = `${progress.area.name} Super Chest Time`;
    note.textContent = lk ? "Take the waypoint to Lower Kurast now." : "Walk to the chest now.";
    stopButton.textContent = "Reset";
  }

  function reset(): void {
    if (running) {
      window.clearInterval(running.tick);
      void running.audio?.close();
      void running.wakeLock?.release();
    }
    running = null;
    render();
  }

  progress.subscribe(render);
  render();
  return root;
}

function samePlan(a: PickedPlan | null, b: PickedPlan | null): boolean {
  return !!a && !!b && a.draw === b.draw && a.seed === b.seed && a.wait === b.wait && routeText(a.stops) === routeText(b.stops);
}

function hopsBefore(plan: PickedPlan): (string | Node)[] {
  const hops = plan.stops.filter((stop) => stop !== RIVER_OF_FLAME);
  return hops.length === 0 ? [] : [routeLine(hops, "Visit ", " first (no waiting), then:")];
}

function routeLine(stops: readonly WaypointId[], before: string, after: string, finish?: string): HTMLElement {
  return el(
    "span",
    { className: "route-line" },
    before,
    routeText(stops),
    ...(finish ? [" → ", el("strong", { textContent: finish })] : []),
    after,
  );
}

function clockText(seconds: number): string {
  const tenths = waitTenths(seconds);
  const whole = Math.floor(tenths / 10);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${tenths % 10}`;
}

function createAudio(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function scheduleBeeps(audio: AudioContext, wait: number): void {
  const now = audio.currentTime;
  for (let count = 0; count < LEAD_IN_SECONDS; count++) beep(audio, now + count, 660, 0.15);
  const start = now + LEAD_IN_SECONDS;
  beep(audio, start, 990, 0.4);
  if (wait - WARNING_SECONDS > 0) beep(audio, start + wait - WARNING_SECONDS, 880, 0.3);
  for (let left = COUNTDOWN_BEEPS; left >= 1; left--) {
    if (wait - left > 0) beep(audio, start + wait - left, 880, 0.12);
  }
  beep(audio, start + Math.max(0, wait), 1320, 0.7);
}

function beep(audio: AudioContext, at: number, frequency: number, length: number): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.4, at + 0.01);
  gain.gain.setValueAtTime(0.4, at + length - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + length);
}
