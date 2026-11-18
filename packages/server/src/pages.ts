// Pages the server renders itself: the HTML arrives with its Zubra components already in it, and
// their modules take over in the browser (@zubra/server). The app is a page that needs JavaScript
// to show anything; these are for what should be readable, linkable and usable without it.
//
//   /games            the games this parlor offers, with a form that filters them (pages/games-page.zb)
//                     and, where the parlor takes requests, "Ask for a game" (pages/game-request.zb)
//   /daily            the daily sudoku (pages/daily-sudoku.zb): a form of real inputs that checks on the server
//   /_zubra/…         the components' browser modules and the runtime, served by @zubra/server
//   /_zb/action/…     the functions the components mark 'use server', served by @zubra/actions:
//                     a form posts to one, with or without JavaScript
//   /_zb/actions.js   the script that sends those forms with fetch when there is JavaScript
//
// The components are the app's own (@open-parlor/ui), so a page here looks like the rest.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ARCADE_GAMES, IDLE_GAMES } from "@journey-to-code/games";
import { createActions, type Actions } from "@zubra/actions";
import { createZubra, type ZubraOptions } from "@zubra/server";
import type { Catalogue } from "./catalogue.js";
import { FIRST_DAY, clampDate, entriesOf, grade, isDate, puzzleFor, shift, today, tunedClues, type Verdict } from "./sudoku.js";
import type { Tunables } from "./tunables.js";

const KINDS = [
  { value: "all", label: "Every kind" },
  { value: "table", label: "Cards and boards" },
  { value: "arcade", label: "Arcade" },
  { value: "idle", label: "Idle" },
];
const kindOf = (id: string) => (ARCADE_GAMES.some((g) => g.id === id) ? "arcade" : IDLE_GAMES.some((g) => g.id === id) ? "idle" : "table");
const players = ([least, most]: [number, number]) => (most === 1 ? "1 player" : least === most ? `${most} players` : `${least} to ${most} players`);

/** A game's name with only its letters and digits, so "Gin rummy" finds "Gin Rummy". */
const plainName = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** What "Ask for a game" answers: asked, already here, or why not. */
export interface Asked {
  ok?: true;
  /** Somebody had asked already, so this one was added to theirs. */
  again?: boolean;
  url?: string;
  have?: { name: string; emoji: string; href: string };
  error?: string;
}

/** What checking the sudoku answers: how it stands, and what was typed, to draw the page with. */
export interface Checked extends Verdict {
  date: string;
  entries: string;
  error?: undefined;
}

export interface PagesOptions {
  mount?: string;
  /** Where the daily sudoku is. */
  daily?: string;
  /** What the clock says. Only the tests set this. */
  now?: () => Date;
  components?: string;
  /** Whether this parlor takes requests for games (the relay has a token). The form is left out without it. */
  asking?: () => boolean;
  /** Sends a request on to the relay's own route, as the app's sheet does: POST /bugs/request. */
  ask?: (request: Request) => Promise<Response | null>;
  /** The numbers the host may change (the daily sudoku's clues). */
  tunables?: Pick<Tunables, "get">;
}

/** The address the browser used, behind a proxy too: a form's post is checked against it and sent back to it. */
export function publicOrigin(headers: Record<string, string | string[] | undefined>): string {
  const first = (h: string | string[] | undefined) => String(Array.isArray(h) ? h[0] : (h ?? "")).split(",")[0]!.trim();
  const host = first(headers["x-forwarded-host"]) || first(headers.host);
  const proto = first(headers["x-forwarded-proto"]) === "https" ? "https" : "http";
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `${proto}://${host}` : "";
}

/** The paths these pages answer, for the server's own router. */
export const PAGE_MOUNTS = ["/games", "/daily", "/_zubra", "/_zb/action", "/_zb/actions.js"];

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const STYLE = `
  body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; background: var(--background); color: var(--foreground); }
  .page { max-width: 64rem; margin: 0 auto; padding: clamp(1rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem) 3rem; }
  .page > header { margin-bottom: 1.25rem; }
  .page h1 { margin: 0.25rem 0; font-size: clamp(1.6rem, 5vw, 2.25rem); line-height: 1.15; }
  .page p { margin: 0 0 0.5rem; }
  .page a { color: inherit; }
  .lede { color: var(--muted-foreground); max-width: 40rem; }
  .page h2 { margin: 2.25rem 0 0.25rem; font-size: 1.25rem; }
  .page > footer { margin-top: 2rem; color: var(--muted-foreground); font-size: 0.9rem; }
`;

/** The page round what a component draws: its head, the theme and the parlor's way back. */
function shell({ title, about, theme, body }: { title: string; about: string; theme: string; body: string }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)}</title>
    <meta name="description" content="${escape(about)}">
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
    <style>${theme}${STYLE}</style>
  </head>
  <body>
    <div class="page">
      ${body}
    </div>
  </body>
</html>`;
}

export function createPages(catalogue: Pick<Catalogue, "state">, { mount = "/games", daily: dailyMount = "/daily", now = () => new Date(), components = fileURLToPath(new URL("../pages", import.meta.url)), asking = () => false, ask, tunables }: PagesOptions = {}) {
  const options: ZubraOptions = { components, packages: ["@open-parlor/ui/zubra-ui"] };
  // Made at the first request, not at start-up, and never allowed to take the tables down with it:
  // if the components can't be found or compiled, these pages are off and the parlor still plays.
  type Made = { zubra: ReturnType<typeof createZubra>; actions: Actions; theme: string };
  let made: Promise<Made | null> | undefined;
  const make = () =>
    (made ??= (async () => {
      try {
        return {
          zubra: createZubra(options),
          // The functions marked 'use server' in the components. `askFor` is what game-request.zb's calls.
          actions: await createActions({ components, context: () => ({ askFor, grade: checkSudoku }), onError: (error) => console.error("pages: a form's function threw:", error) }),
          theme: readFileSync(createRequire(import.meta.url).resolve("@open-parlor/ui/zubra-ui/themes/system.css"), "utf8"),
        };
      } catch (error) {
        console.error("pages: off, the server can't draw its own pages:", error);
        return null;
      }
    })());

  /** "Ask for a game": a game the parlor has needs no request; anything else goes to the relay. */
  async function askFor(name: string, note: string, request: Request): Promise<Asked> {
    const wanted = plainName(name);
    if (wanted.length < 2) return { error: "Which game would you like?" };
    const have = (await catalogue.state()).games.find((game) => game.on && plainName(game.name) === wanted);
    if (have) return { have: { name: have.name, emoji: have.emoji, href: `/?game=${encodeURIComponent(have.id)}` } };
    if (!ask || !asking()) return { error: "This parlor isn't taking requests just now." };
    // The relay's own route, with this visitor's cookie and address: its limits count them as it would in the app.
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    const reply = await ask(new Request(new URL("/bugs/request", request.url), { method: "POST", headers, body: JSON.stringify({ name, note }) }));
    const said = ((await reply?.json().catch(() => null)) ?? {}) as { url?: unknown; again?: unknown; error?: unknown };
    if (reply?.status === 201) return { ok: true, again: said.again === true, url: typeof said.url === "string" && said.url.startsWith("https://") ? said.url : "" };
    return { error: typeof said.error === "string" ? said.error : "The request couldn't be sent just now. Try again in a minute." };
  }

  /** "Check", on the daily sudoku: what is typed, against the answer only this side has. */
  /** The day's puzzle, with the clues the host has set for it if they apply. */
  async function puzzleOf(date: string) {
    return puzzleFor(date, tunedClues(date, await tunables?.get("sudoku")));
  }

  async function checkSudoku(date: string, form: FormData): Promise<Checked | { error: string }> {
    if (!isDate(date) || date !== clampDate(date, now())) return { error: "There's no puzzle for that day." };
    const typed = Array.from({ length: 81 }, (_, i) => {
      const value = form.get(`c${i}`);
      return typeof value === "string" && /^[1-9]$/.test(value.trim()) ? value.trim() : "0";
    }).join("");
    const puzzle = await puzzleOf(date);
    return { date, entries: entriesOf(puzzle, typed), ...grade(puzzle, typed) };
  }

  /** The daily sudoku: the day's puzzle as a form of inputs, with the clues in it and not the answer. */
  async function daily(request: Request, { zubra, actions, theme }: Made, headers: Headers): Promise<string> {
    const url = new URL(request.url);
    const date = clampDate(url.searchParams.get("d"), now());
    const puzzle = await puzzleOf(date);
    const latest = today(now());
    const sent = actions.result<Checked | { error: string }>(request, (name, value) => headers.append(name, value));
    // A post made without JavaScript comes back once, with what was typed and how it stood.
    const answer = sent?.value && "entries" in sent.value && sent.value.date === date ? sent.value : null;
    const page = zubra.page();
    const board = page.render("daily-sudoku", { date, level: puzzle.level, givens: puzzle.givens, entries: entriesOf(puzzle, answer?.entries), result: answer ?? (sent?.value && "error" in sent.value ? sent.value : null) });
    const nice = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    const before = date > FIRST_DAY ? `<a href="${dailyMount}?d=${shift(date, -1)}" rel="prev">← The day before</a>` : "";
    const after = date < latest ? `<a href="${dailyMount}?d=${shift(date, 1)}" rel="next">The next day →</a>` : "";
    return page.finish(
      shell({
        title: `Daily sudoku, ${nice} · open.parlor`,
        about: `Today's sudoku, ${puzzle.level.toLowerCase()}. A new one every day.`,
        theme,
        body: `<header>
        <a href="/">open.parlor</a>
        <h1>Daily sudoku</h1>
        <p class="lede">${escape(nice)} · ${puzzle.level}. Fill every row, column and box with 1 to 9. Check as often as you like; the answer stays on the server.</p>
      </header>
      <main>${board}${actions.script()}<p class="days">${before} ${after}</p></main>
      <footer>This page is drawn on the server and its grid is a plain form, so it plays with JavaScript switched off.</footer>`,
      }),
    );
  }

  /** The games page: every game the host has switched on, in the host's order. */
  async function games(request: Request, { zubra, actions, theme }: Made, headers: Headers): Promise<string> {
    const url = new URL(request.url);
    const offered = (await catalogue.state()).games.filter((game) => game.on);
    const asked = url.searchParams.get("kind") ?? "all";
    const page = zubra.page();
    const list = page.render("games-page", {
      games: offered.map((game) => ({ id: game.id, name: game.name, emoji: game.emoji, teams: game.teams, kind: kindOf(game.id), players: players(game.seats), href: `/?game=${encodeURIComponent(game.id)}` })),
      kinds: KINDS,
      q: (url.searchParams.get("q") ?? "").slice(0, 60),
      kind: KINDS.some((kind) => kind.value === asked) ? asked : "all",
    });
    // After a post made without JavaScript, the function's answer comes back here once.
    const sent = actions.result<Asked>(request, (name, value) => headers.append(name, value));
    const asking_ = asking()
      ? `<section>
        <h2>Don't see your game?</h2>
        <p class="lede">Ask for it, and say how you play it.</p>
        ${page.render("game-request", { result: sent?.value ?? null })}
      </section>${actions.script()}`
      : "";
    const about = `The ${offered.length} games in this parlor: cards, boards and arcade games to play with family, friends or the computer.`;
    return page.finish(
      shell({
        title: "The games · open.parlor",
        about,
        theme,
        body: `<header>
        <a href="/">open.parlor</a>
        <h1>The games</h1>
        <p class="lede">${escape(about)} Pick one to set up a table.</p>
      </header>
      <main>${list}${asking_}</main>
      <footer>This page is drawn on the server, so it reads and filters with JavaScript switched off.</footer>`,
      }),
    );
  }

  return {
    /**
     * Answers GET /games and the components' modules under /_zubra; null for anything else. The
     * page says which it is in a header: the app asks before linking to it, and a parlor published
     * as plain files answers the same address with the app.
     */
    async fetch(request: Request): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      const gamesPage = pathname === mount;
      const dailyPage = pathname === dailyMount;
      const page = gamesPage || dailyPage;
      const posted = pathname === "/_zb/actions.js" || pathname.startsWith("/_zb/action/");
      const modules = pathname.startsWith("/_zubra/");
      if (!page && !posted && !modules) return null;
      const drawn = await make();
      // Off: the address is the app's again, as it is for a parlor without this page.
      if (!drawn) return page ? null : new Response("Not found", { status: 404 });
      if (posted) return (await drawn.actions.fetch(request)) ?? new Response("Not found", { status: 404 });
      if (modules) return (await drawn.zubra.fetch(request)) ?? new Response("Not found", { status: 404 });
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Not found", { status: 404 });
      try {
        const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "x-parlor-page": gamesPage ? "games" : "daily" });
        return new Response(await (gamesPage ? games : daily)(request, drawn, headers), { headers });
      } catch (error) {
        console.error(`pages: ${pathname} didn't render:`, error);
        return new Response("This page isn't working just now.", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    },
  };
}

export type Pages = ReturnType<typeof createPages>;
