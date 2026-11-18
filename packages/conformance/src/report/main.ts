// The page at the root of the build: what the checks are, how they went on the last run
// (results.json, written by tests/results-reporter.ts), the six pages to try by hand, and what the
// checks have found. It is built from the same Zubra components it reports on, as plain elements.
import "@open-parlor/ui/zubra-ui/alert-banner.zb";
import "@open-parlor/ui/zubra-ui/auto-grid.zb";
import "@open-parlor/ui/zubra-ui/cluster-layout.zb";
import "@open-parlor/ui/zubra-ui/content-card.zb";
import "@open-parlor/ui/zubra-ui/data-table.zb";
import "@open-parlor/ui/zubra-ui/empty-state.zb";
import "@open-parlor/ui/zubra-ui/stat-card.zb";
import "@open-parlor/ui/zubra-ui/status-badge.zb";
import "@open-parlor/ui/zubra-ui/tab-list.zb";
import "./report.css";

type Status = "passed" | "failed" | "known" | "skipped";
interface Cell {
  status: Status;
  engines?: Record<string, Status>;
  as?: string;
  note?: string;
}
interface Row {
  title: string;
  cells: Record<string, Cell>;
}
interface Results {
  ranAt: string;
  zubra: string;
  engines?: string[];
  commit: string | null;
  repository: string;
  totals: { checks: number; passed: number; failed: number; known: number };
  components: Row[];
  features: Row[];
}

type Props = Record<string, unknown>;
/** An element with attributes (strings), properties (anything else) and children. */
function el(tag: string, props: Props = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("data-") || key === "slot" || key === "class" || key === "href") node.setAttribute(key, String(value));
    else (node as unknown as Props)[key] = value;
  }
  node.append(...children);
  return node;
}
const p = (...children: (Node | string)[]) => el("p", {}, ...children);
const code = (text: string) => el("code", {}, text);
const link = (href: string, text: string) => el("a", { href }, text);

const REPO = "https://github.com/journey-to-code-org";
/** The six pages, and what each framework builds in the parlor itself. */
const PAGES = [
  { id: "element", name: "No framework", does: "The components as plain custom elements, driven by the DOM. The baseline the others are measured against." },
  { id: "react", name: "React", does: "In the parlor: every game table, the setup screens, houses and tournaments." },
  { id: "vue", name: "Vue", does: "In the parlor: the front page, where you choose a game." },
  { id: "svelte", name: "Svelte", does: "In the parlor: the card designer." },
  { id: "solid", name: "Solid", does: "In the parlor: the page for watching a game." },
  { id: "angular", name: "Angular", does: "In the parlor: the admin app." },
  { id: "preact", name: "Preact", does: "Not in the parlor. Here because Zubra supports it, and it is the one page that found something in its first run." },
  { id: "lit", name: "Lit", does: "Not in the parlor. Here for what the others don't do: the whole fixture sits inside a shadow root." },
];

/** What the checks have found so far, newest first. */
const FOUND = [
  { what: "Preact 11 couldn't reorder a keyed list inside a component", where: "Preact, in browsers that have moveBefore(). A Zubra host passed insertBefore on to its slots but not moveBefore. Fixed in Zubra, not released yet; a known difference here until the parlor has the fix.", links: [["zubra#370", `${REPO}/zubra/issues/370`], ["zubra#372", `${REPO}/zubra/pull/372`]] },
  { what: "A disabled Angular form left three controls usable", where: "The switch, the colour swatches and the segmented control had no disabled state. Fixed in the parlor's copies; upstream the switch has a fix waiting and the rest are open.", links: [["zubra-ui#20", `${REPO}/zubra-ui/issues/20`], ["zubra-ui#22", `${REPO}/zubra-ui/issues/22`]] },
  { what: "Named-slot elements stayed after the framework removed them", where: "Vue, Svelte and Solid. Fixed in Zubra 5.15.0.", links: [["zubra#269", `${REPO}/zubra/issues/269`]] },
  { what: "Signal text as a component's direct child never updated", where: "Solid. Fixed in Zubra 5.15.0.", links: [["zubra#268", `${REPO}/zubra/issues/268`]] },
  { what: "A child that looked like the component's own root was taken for its rendered markup", where: "Fixed in Zubra 5.15.0.", links: [["zubra#267", `${REPO}/zubra/issues/267`]] },
  { what: "An element with a slot name, added inside @if, could land in the default slot", where: "Angular. Fixed in Zubra 5.15.0.", links: [["zubra#262", `${REPO}/zubra/issues/262`]] },
  { what: "Text written with {{ }} as a component's direct child was never slotted", where: "Angular. Fixed in Zubra 5.15.0.", links: [["zubra#261", `${REPO}/zubra/issues/261`]] },
] as const;

const MARK: Record<Status, string> = { passed: "✓", failed: "✗ failed", known: "⚠ known", skipped: "skipped" };
const ENGINE: Record<string, string> = { chrome: "Chrome", firefox: "Firefox", webkit: "WebKit" };
const engineName = (id: string) => ENGINE[id] ?? id;

/** A cell's mark, naming the browsers when they don't agree. */
function mark(cell: Cell): string {
  const engines = Object.entries(cell.engines ?? {});
  const odd = engines.filter(([, status]) => status === cell.status);
  const where = cell.status !== "passed" && odd.length < engines.length ? ` in ${odd.map(([id]) => engineName(id)).join(", ")}` : "";
  return [MARK[cell.status] + where, cell.as].filter(Boolean).join(" ");
}

/** A table of checks against frameworks. A feature's cell says what it is called there. */
function matrix(label: string, rows: Row[]): HTMLElement {
  const frameworks = PAGES.filter((page) => rows.some((row) => row.cells[page.id]));
  const columns = [{ key: "check", label: "Check" }, ...frameworks.map((page) => ({ key: page.id, label: page.name }))];
  const records = rows.map((row, id) => ({
    id,
    check: row.title.charAt(0).toUpperCase() + row.title.slice(1),
    ...Object.fromEntries(
      frameworks.map((page) => {
        const cell = row.cells[page.id];
        return [page.id, cell ? mark(cell) : "–"];
      }),
    ),
  }));
  return el("data-table", { label, columns, rows: records });
}

function results(data: Results): HTMLElement[] {
  const { totals } = data;
  const when = new Date(data.ranAt).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" });
  const run = data.commit ? link(`https://github.com/${data.repository}/commit/${data.commit}`, data.commit.slice(0, 7)) : "a local build";
  const known = [...data.components, ...data.features].flatMap((row) => Object.entries(row.cells).filter(([, cell]) => cell.status === "known").map(([framework, cell]) => `${row.title} (${framework}): ${cell.note ?? "reported upstream"}`));
  return [
    el(
      "auto-grid",
      { min: "9rem", gap: "0.75rem" },
      el("stat-card", { label: `Passing, of ${totals.checks}`, value: String(totals.passed) }),
      el("stat-card", { label: "Failing", value: String(totals.failed) }),
      el("stat-card", { label: "Known differences", value: String(totals.known) }),
      el("stat-card", { label: (data.engines ?? []).map(engineName).join(", ") || "Browsers", value: `${data.engines?.length ?? 1} ${data.engines?.length === 1 ? "browser" : "browsers"}` }),
      el("stat-card", { label: "Zubra", value: data.zubra }),
    ),
    el("p", { class: "fine" }, `Run on ${when}, from `, run, ". A known difference is one already reported upstream; its check is expected to fail until it is fixed."),
    ...(totals.failed ? [el("alert-banner", { variant: "danger", heading: `${totals.failed} failing` }, "Something behaves differently from the last time this ran. The failing cells are marked in the tables below.")] : []),
    ...(known.length ? [el("alert-banner", { variant: "warning", heading: "Known differences" }, el("ul", {}, ...known.map((line) => el("li", {}, line))))] : []),
    el("h2", {}, "The components behave the same everywhere"),
    p("The same fixture is written eight times, once in each framework and once with none, and the same checks run against every page. A check that passes in five and fails in one is a difference in how Zubra works there."),
    matrix("Component checks", data.components),
    el("h2", {}, "Each framework's own features still work"),
    p("What a framework adds on top of a component: forms, transitions, keyed lists, context, portals, lazy loading. A check runs where the framework has the feature, and the cell says what it is called there."),
    matrix("Framework feature checks", data.features),
  ];
}

const noResults = () =>
  el("empty-state", { heading: "The checks haven't run on this build" }, "Run ", code("npm run conformance -w @open-parlor/conformance"), " and reload: the run writes the results this page reads.");

const tryIt = () => [
  p("These are the pages the checks run against. Each is the same fixture, so you can press the same switch in React and in Angular and see for yourself."),
  el("auto-grid", { min: "15rem", gap: "0.75rem" }, ...PAGES.map((page) => el("content-card", { heading: page.name, href: `./${page.id}/` }, page.does))),
];

const how = () => [
  el("h2", {}, "Why so many frameworks"),
  p("open.parlor is a place to play card, board and arcade games. It is also the proving ground for ", link(`${REPO}/zubra`, "Zubra"), ", a way of writing a component once and using it from any framework. The claim only means something if one real app uses the same components from all of them, so the parlor does: its buttons, fields, tables, dialogs and playing cards are one set of Zubra components, and each part of the parlor is written in a different framework on top of them."),
  el("h2", {}, "What a check is"),
  p("A fixture page puts the components through the things a page does with them: set a prop, hear an event, bind a value both ways, fill a slot, take a component away and bring it back. The page is written eight times, as each framework's own documentation would have you write it: the five frameworks the parlor uses, Preact and Lit, and once with no framework. Then one set of browser tests runs against all eight, in Chrome, Firefox and WebKit, using the same names on every page."),
  p("Nothing in a framework's page works around a difference. If Vue needs something React doesn't, that is a finding, and it goes to Zubra as an issue instead of into the page as a patch."),
  el("h2", {}, "When something differs"),
  p("The check is listed as a known difference with the issue it was reported in, so the run stays green and the gap stays visible. When Zubra fixes it, the check passes, the run says it expected a failure, and the entry and any workaround in the parlor come out."),
  el("h2", {}, "Where it lives"),
  p("The suite is ", link(`${REPO}/open.parlor/tree/main/packages/conformance`, "packages/conformance"), " in the parlor's repository. It runs on every pull request, and this page is rebuilt from the run each time the parlor is published. This page is itself made of the components it reports on."),
];

const found = () => [
  p("The suite earns its place by what it catches. Each of these was found by a check, reported, and fixed or tracked."),
  el(
    "ul",
    { class: "found" },
    ...FOUND.map((item) =>
      el("li", {}, el("span", { class: "what" }, item.what), el("span", {}, item.where), el("cluster-layout", { gap: "0.5rem" }, ...item.links.map(([text, href]) => link(href, text)))),
    ),
  ),
  el("p", { class: "fine" }, "The first run, on Zubra 5.9, found the five fixed Zubra differences and a gap in its typings. The disabled-state gap came from the framework feature checks, and the Preact one from adding a Preact page."),
];

async function start(): Promise<void> {
  const data: Results | null = await fetch("./results.json")
    .then((response) => (response.ok ? (response.json() as Promise<Results>) : null))
    .catch(() => null);
  const tabs = [
    { value: "results", label: "Results" },
    { value: "try", label: "Try it" },
    { value: "how", label: "How" },
    { value: "found", label: "Findings" },
  ];
  document.getElementById("app")!.append(
    el(
      "header",
      {},
      el("h1", {}, "One set of components, checked in seven frameworks"),
      el("p", { class: "lede" }, "open.parlor's games are made of Zubra components, used from React, Vue, Svelte, Solid and Angular. These are the checks that they behave the same in each, and in Preact and Lit besides."),
      el(
        "cluster-layout",
        { gap: "0.5rem" },
        data ? el("status-badge", { variant: data.totals.failed ? "danger" : "success", dot: true, "data-t": "summary" }, data.totals.failed ? `${data.totals.failed} of ${data.totals.checks} checks failing` : `${data.totals.passed} of ${data.totals.checks} checks pass`) : el("status-badge", { "data-t": "summary" }, "Not run yet"),
        link("../", "Play in the parlor"),
        link(`${REPO}/open.parlor`, "Source"),
      ),
    ),
    el(
      "tab-list",
      { tabs, label: "About the checks" },
      el("div", { "data-tab": "results" }, ...(data ? results(data) : [noResults()])),
      el("div", { "data-tab": "try" }, ...tryIt()),
      el("div", { "data-tab": "how" }, ...how()),
      el("div", { "data-tab": "found" }, ...found()),
    ),
  );
}

void start();
