import { el } from "../ui/dom";
import { renderCalibrateNextMenu } from "./calibrateNextMenu";
import type { Feature, Page } from "./feature";
import { createHomePage } from "./homePage";
import type { PlayerProgress } from "./progress";
import { renderSeedHistoryMenu } from "./seedHistoryMenu";
import { renderSettingsMenu } from "./settingsMenu";

const HOME = "";

export function mountShell(container: Element, features: readonly Feature[], progress: PlayerProgress): void {
  const pages = new Map<string, Page>();
  const outlet = el("main", { className: "outlet" });
  const navLinks = new Map<string, HTMLAnchorElement>();

  const nav = el("nav", { className: "main-nav" });
  const addLink = (route: string, ...label: (Node | string)[]) => {
    const link = el("a", { href: `#/${route}` }, ...label);
    navLinks.set(route, link);
    nav.append(link);
    return link;
  };
  addLink(HOME, "Home");
  features.forEach((feature, index) => {
    const link = addLink(feature.id, el("span", { className: "nav-step", textContent: String(index + 1) }), feature.title);
    if (!feature.ready) link.classList.add("not-ready");
  });

  nav.append(renderCalibrateNextMenu(progress), renderSeedHistoryMenu(progress), renderSettingsMenu(progress));

  const pageFor = (route: string): Page => {
    let page = pages.get(route);
    if (!page) {
      const feature = features.find((f) => f.id === route);
      page = feature ? feature.createPage(progress) : createHomePage(features, progress);
      pages.set(route, page);
    }
    return page;
  };

  const showRoute = () => {
    const requested = location.hash.replace(/^#\/?/, "");
    const route = features.some((f) => f.id === requested) ? requested : HOME;
    const page = pageFor(route);
    outlet.replaceChildren(page.root);
    for (const [linkRoute, link] of navLinks) {
      if (linkRoute === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    page.onShow?.();
    window.scrollTo(0, 0);
  };

  container.replaceChildren(
    el(
      "header",
      { className: "page-head" },
      el("h1", {}, el("a", { href: "#/", textContent: "D2 SCP" })),
      el("p", { className: "tagline", textContent: "Diablo 2 Super Chest Planner" }),
    ),
    nav,
    outlet,
    el("footer", { className: "page-foot" }),
  );
  window.addEventListener("hashchange", showRoute);
  const applyMode = () => document.body.classList.toggle("advanced-mode", progress.advanced);
  progress.subscribe(applyMode);
  applyMode();
  showRoute();
}
