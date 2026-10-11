import { renderCalibrateNextList } from "../../app/calibrateNextMenu";
import { cleanRouteSamples, type PlayerProgress } from "../../app/progress";
import { ROUTE_IDS, WAYPOINTS, averageDraw, isRouteId, routeAdds, routeName, type RouteId, type RouteSample } from "../../chest/waypoints";
import { button, el, field } from "../../ui/dom";
import { plural } from "../../ui/format";
import presetCalibration from "../../data/lozzajpCalibration.json";

const ACTS = [1, 2, 3, 4, 5] as const;

export function renderRoutePicker(progress: PlayerProgress): HTMLElement {
  const select = el(
    "select",
    {},
    el("option", { value: "direct", textContent: "Direct (no waypoint)" }),
    ...ACTS.map((act) =>
      el(
        "optgroup",
        { label: `Act ${act}` },
        ...WAYPOINTS.filter((waypoint) => waypoint.act === act).map((waypoint) =>
          el("option", { value: waypoint.id, textContent: waypoint.name }),
        ),
      ),
    ),
  );
  select.addEventListener("change", () => {
    if (isRouteId(select.value)) progress.setCalibrationRoute(select.value);
  });
  const route = el("p", { className: "lead" });
  const options = select.querySelectorAll("option");
  const render = () => {
    const picked = progress.calibrationRoute;
    const samples = progress.routeSamples;
    for (const option of options) {
      if (!isRouteId(option.value)) continue;
      const id = option.value;
      const runs = samples.filter((sample) => sample.route === id && !sample.preset).length;
      const preset = samples.some((sample) => sample.route === id && sample.preset);
      const name = id === "direct" ? "Direct (no waypoint)" : routeName(id);
      const status = runs === 0 ? "not calibrated" : `calibrated, ${plural(runs, "run")}`;
      option.textContent = `${name} (${status}${preset ? ", using lozzajp's" : ""})`;
    }
    select.value = picked;
    route.replaceChildren(
      "Route: gamble window → ",
      ...(picked === "direct" ? [] : [el("strong", { textContent: routeName(picked) }), " → "]),
      "Lower Kurast → first super chest.",
    );
  };
  progress.subscribe(render);
  render();
  return el(
    "section",
    { className: "panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Route to measure" })),
    el("h3", { textContent: "Suggested next" }),
    renderCalibrateNextList(progress),
    field("Waypoint", select),
    route,
  );
}

export function renderRoutesPanel(progress: PlayerProgress): HTMLElement {
  const badge = el("span", { className: "badge" });
  const body = el("div", {});
  const render = () => {
    const samples = progress.routeSamples;
    const distance = progress.settings.distanceToFirstChest;
    const routes = ROUTE_IDS.filter((route) => samples.some((sample) => sample.route === route));
    const river = progress.riverStart;
    badge.textContent = river === null ? "Not ready to plan" : "Ready to plan";
    badge.classList.toggle("done", river !== null);
    body.replaceChildren(
      el("p", {
        className: "lead",
        textContent:
          river === null
            ? "Rune plans need your Direct route, plus River of Flame to wait there, or other waypoints to hop through."
            : `River of Flame plans start at draw ${river}: distance ${distance} plus ${progress.riverAdds} for River of Flame, then your wait there. Other measured waypoints add their own draws for waypoint routes.`,
      }),
      routes.length === 0
        ? el("p", { className: "muted", textContent: "Nothing measured yet." })
        : el("ol", { className: "draw-hits routes" }, ...routes.map((route) => routeRow(route))),
    );
  };

  function routeRow(route: RouteId): HTMLElement {
    const samples = progress.routeSamples.filter((sample) => sample.route === route);
    const average = averageDraw(samples, route)!;
    const adds = route === "direct" ? null : routeAdds(progress.routeSamples, route, progress.settings.distanceToFirstChest);
    const draws = samples.map((sample) => sample.draw);
    return el(
      "li",
      {},
      el("strong", { textContent: routeName(route) }),
      el("span", { textContent: `Average draw ${Math.round(average)}` }),
      route === "direct"
        ? el("span", { className: "muted", textContent: `Distance to first chest ${progress.settings.distanceToFirstChest ?? "—"}` })
        : el("span", { className: "muted", textContent: adds === null ? "Measure Direct to see what it adds" : `Adds ${adds >= 0 ? "+" : ""}${adds}` }),
      el(
        "span",
        { className: "muted" },
        `${plural(samples.length, "sample")}${samples.length > 1 ? ` (${Math.min(...draws)} - ${Math.max(...draws)})` : ""}: `,
        ...samples.map((sample) => {
          const owner = sample.preset ? "lozzajp's" : "the";
          const remove = button(
            `${sample.draw} ×`,
            () => {
              if (window.confirm(`Remove ${owner} draw ${sample.draw} sample from ${routeName(route)}?`)) progress.removeRouteSample(sample);
            },
            sample.preset ? "small preset" : "small",
          );
          remove.title = sample.preset ? `lozzajp's average for ${routeName(route)}: remove it once you have your own` : `Remove the draw ${sample.draw} sample`;
          return remove;
        }),
      ),
      button(
        "Clear",
        () => {
          if (window.confirm(`Clear all ${plural(samples.length, "sample")} for ${routeName(route)}?`)) progress.clearRoute(route);
        },
        "small",
      ),
    );
  }

  progress.subscribe(render);
  render();
  return el(
    "section",
    { className: "panel" },
    el("div", { className: "panel-head" }, el("h2", { textContent: "Your routes" }), badge),
    renderPresetToggle(progress),
    body,
    renderSampleTransfer(progress),
  );
}

function renderPresetToggle(progress: PlayerProgress): HTMLElement {
  const box = el("input", { type: "checkbox" });
  box.addEventListener("change", () => {
    if (!box.checked && !window.confirm("Remove all of lozzajp's calibration samples?")) {
      box.checked = true;
      return;
    }
    progress.setPresetCalibration(box.checked);
  });
  const render = () => {
    box.checked = progress.usingPresetCalibration;
  };
  progress.subscribe(render);
  render();
  return el(
    "div",
    { className: "preset-toggle" },
    el("label", { className: "check" }, box, el("strong", { textContent: "Use lozzajp's calibration" })),
    el("p", {
      className: "hint",
      textContent:
        `Quick start with lozzajp's average draw for every route (from ${presetCalibration.samples} runs), shown in orange below. ` +
        "Maps are different every game and timing differs between players, so these may vary from yours. " +
        "As you calibrate your own runs, remove the orange samples for those routes.",
    }),
  );
}

const EXPORT_TYPE = "d2lkscp-route-samples";

function renderSampleTransfer(progress: PlayerProgress): HTMLElement {
  const status = el("p", { className: "hint" });
  const prompt = el("div", { className: "step-footer", hidden: true });
  const file = el("input", { type: "file", accept: ".json,application/json", hidden: true });

  const exportButton = button(
    "Export samples",
    () => {
      const json = JSON.stringify({ type: EXPORT_TYPE, version: 1, samples: progress.routeSamples }, null, 2);
      const link = el("a", {
        href: URL.createObjectURL(new Blob([json], { type: "application/json" })),
        download: `d2scp-route-samples-${new Date().toISOString().slice(0, 10)}.json`,
      });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status.textContent = `Exported ${plural(progress.routeSamples.length, "sample")}.`;
    },
    "small",
  );

  file.addEventListener("change", async () => {
    const picked = file.files?.[0];
    file.value = "";
    if (!picked) return;
    let samples: RouteSample[] = [];
    try {
      const data: unknown = JSON.parse(await picked.text());
      samples = cleanRouteSamples(Array.isArray(data) ? data : (data as { samples?: unknown } | null)?.samples);
    } catch {
    }
    if (samples.length === 0) {
      status.textContent = `No route samples found in ${picked.name}.`;
      prompt.hidden = true;
      return;
    }
    const finish = (replace: boolean | null) => {
      prompt.hidden = true;
      if (replace === null) {
        status.textContent = "Import cancelled.";
        return;
      }
      progress.importRouteSamples(samples, replace);
      status.textContent = `${replace ? "Replaced with" : "Merged in"} ${plural(samples.length, "sample")} from ${picked.name}.`;
    };
    const current = progress.routeSamples.length;
    status.textContent = `${picked.name} has ${plural(samples.length, "sample")}. You have ${current} now.`;
    prompt.replaceChildren(
      button("Merge", () => finish(false), "small primary"),
      button("Replace all", () => finish(true), "small"),
      button("Cancel", () => finish(null), "small"),
    );
    prompt.hidden = false;
  });

  return el(
    "div",
    {},
    el("div", { className: "step-footer" }, exportButton, button("Import samples", () => file.click(), "small"), file),
    status,
    prompt,
  );
}
