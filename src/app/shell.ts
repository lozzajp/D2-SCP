import { CHEST_AREAS } from "../chest/areas";
import { el } from "../ui/dom";
import type { Feature, Page } from "./feature";
import type { PlayerProgress } from "./progress";
import { renderSeedHistoryMenu } from "./seedHistoryMenu";
import { renderSettingsMenu } from "./settingsMenu";

export function mountShell(container: Element, features: readonly Feature[], progress: PlayerProgress): void {
  const home = features[0].id;
  const pages = new Map<string, Page>();
  const outlet = el("main", { className: "outlet" });
  const navLinks = new Map<string, HTMLAnchorElement>();
  let current = "";

  const nav = el("nav", { className: "main-nav" });
  for (const feature of features) {
    const link = el("a", { href: `#/${feature.id}`, textContent: feature.title });
    navLinks.set(feature.id, link);
    nav.append(link);
  }
  nav.append(renderSeedHistoryMenu(progress), renderSettingsMenu(progress));

  const calibrateLink = navLinks.get("calibrate");
  if (calibrateLink) {
    const markCalibrate = () => {
      const missing = progress.playerSettingsMissing;
      const attention = missing || !CHEST_AREAS.some(({ id }) => progress.isCalibrated(id));
      calibrateLink.classList.toggle("needs-attention", attention);
      calibrateLink.title = missing ? "Set your Player Settings" : attention ? "Calibrate an area" : "";
    };
    progress.subscribe(markCalibrate);
    markCalibrate();
  }

  const pageFor = (feature: Feature): Page => {
    let page = pages.get(feature.id);
    if (!page) {
      page = feature.tableScoped ? progress.tableScoped(() => feature.createPage(progress)) : feature.createPage(progress);
      pages.set(feature.id, page);
    }
    return page;
  };

  const showRoute = (scroll = true) => {
    const requested = location.hash.replace(/^#\/?/, "");
    const feature = features.find((f) => f.id === requested) ?? features.find((f) => f.id === home)!;
    current = feature.id;
    const page = pageFor(feature);
    outlet.replaceChildren(page.root);
    for (const [route, link] of navLinks) {
      if (route === feature.id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    page.onShow?.();
    if (scroll) window.scrollTo(0, 0);
  };

  progress.onTableChange(() => {
    for (const feature of features) if (feature.tableScoped) pages.delete(feature.id);
    if (features.find((f) => f.id === current)?.tableScoped) showRoute(false);
  });

  container.replaceChildren(
    el(
      "header",
      { className: "page-head" },
      el("h1", {}, el("a", { href: `#/${home}`, textContent: "D2 SCP" })),
      el("p", { className: "tagline", textContent: "Diablo 2 Super Chest Planner" }),
    ),
    nav,
    outlet,
    el("footer", { className: "page-foot" }),
  );
  window.addEventListener("hashchange", () => showRoute());
  showRoute();
}
