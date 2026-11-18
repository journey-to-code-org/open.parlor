// Pages the server renders itself: the HTML arrives with its Zubra components already in it, and
// their modules take over in the browser (@zubra/server). The app is a page that needs JavaScript
// to show anything; these are for what should be readable, linkable and usable without it.
//
//   /games      the games this parlor offers, with a form that filters them (pages/games-page.zb)
//   /_zubra/…   the components' browser modules and the runtime, served by @zubra/server
//
// The components are the app's own (@open-parlor/ui), so a page here looks like the rest.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ARCADE_GAMES, IDLE_GAMES } from "@journey-to-code/games";
import { createZubra, type ZubraOptions } from "@zubra/server";
import type { Catalogue } from "./catalogue.js";

const KINDS = [
  { value: "all", label: "Every kind" },
  { value: "table", label: "Cards and boards" },
  { value: "arcade", label: "Arcade" },
  { value: "idle", label: "Idle" },
];
const kindOf = (id: string) => (ARCADE_GAMES.some((g) => g.id === id) ? "arcade" : IDLE_GAMES.some((g) => g.id === id) ? "idle" : "table");
const players = ([least, most]: [number, number]) => (most === 1 ? "1 player" : least === most ? `${most} players` : `${least} to ${most} players`);

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const STYLE = `
  body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; background: var(--background); color: var(--foreground); }
  .page { max-width: 64rem; margin: 0 auto; padding: clamp(1rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem) 3rem; }
  .page > header { margin-bottom: 1.25rem; }
  .page h1 { margin: 0.25rem 0; font-size: clamp(1.6rem, 5vw, 2.25rem); line-height: 1.15; }
  .page p { margin: 0 0 0.5rem; }
  .page a { color: inherit; }
  .lede { color: var(--muted-foreground); max-width: 40rem; }
  .page > footer { margin-top: 2rem; color: var(--muted-foreground); font-size: 0.9rem; }
`;

export function createPages(catalogue: Pick<Catalogue, "state">, { mount = "/games", components = fileURLToPath(new URL("../pages", import.meta.url)) } = {}) {
  // `packages` is in @zubra/server and its guide, and not yet in its types.
  const options: ZubraOptions & { packages: string[] } = { components, packages: ["@open-parlor/ui/zubra-ui"] };
  // Made at the first request, not at start-up, and never allowed to take the tables down with it:
  // if the components can't be found or compiled, these pages are off and the parlor still plays.
  let made: { zubra: ReturnType<typeof createZubra>; theme: string } | null | undefined;
  const make = () => {
    if (made !== undefined) return made;
    try {
      made = { zubra: createZubra(options), theme: readFileSync(createRequire(import.meta.url).resolve("@open-parlor/ui/zubra-ui/themes/system.css"), "utf8") };
    } catch (error) {
      console.error("pages: off, the server can't draw its own pages:", error);
      made = null;
    }
    return made;
  };

  /** The games page: every game the host has switched on, in the host's order. */
  async function games(url: URL, { zubra, theme }: NonNullable<typeof made>): Promise<string> {
    const offered = (await catalogue.state()).games.filter((game) => game.on);
    const asked = url.searchParams.get("kind") ?? "all";
    const page = zubra.page();
    const list = page.render("games-page", {
      games: offered.map((game) => ({ id: game.id, name: game.name, emoji: game.emoji, teams: game.teams, kind: kindOf(game.id), players: players(game.seats), href: `/?game=${encodeURIComponent(game.id)}` })),
      kinds: KINDS,
      q: (url.searchParams.get("q") ?? "").slice(0, 60),
      kind: KINDS.some((kind) => kind.value === asked) ? asked : "all",
    });
    const about = `The ${offered.length} games in this parlor: cards, boards and arcade games to play with family, friends or the computer.`;
    return page.finish(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>The games · open.parlor</title>
    <meta name="description" content="${escape(about)}">
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
    <style>${theme}${STYLE}</style>
  </head>
  <body>
    <div class="page">
      <header>
        <a href="/">open.parlor</a>
        <h1>The games</h1>
        <p class="lede">${escape(about)} Pick one to set up a table.</p>
      </header>
      <main>${list}</main>
      <footer>This page is drawn on the server, so it reads and filters with JavaScript switched off.</footer>
    </div>
  </body>
</html>`);
  }

  return {
    /**
     * Answers GET /games and the components' modules under /_zubra; null for anything else. The
     * page says which it is in a header: the app asks before linking to it, and a parlor published
     * as plain files answers the same address with the app.
     */
    async fetch(request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      const modules = url.pathname.startsWith("/_zubra/");
      if (url.pathname !== mount && !modules) return null;
      const drawn = make();
      // Off: the address is the app's again, as it is for a parlor without this page.
      if (!drawn) return modules ? new Response("Not found", { status: 404 }) : null;
      if (modules) return (await drawn.zubra.fetch(request)) ?? new Response("Not found", { status: 404 });
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Not found", { status: 404 });
      try {
        return new Response(await games(url, drawn), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "x-parlor-page": "games" } });
      } catch (error) {
        console.error("pages: /games didn't render:", error);
        return new Response("This page isn't working just now.", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    },
  };
}

export type Pages = ReturnType<typeof createPages>;
