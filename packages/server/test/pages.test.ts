// The pages the server renders itself (src/pages.ts): what is in the HTML before any script runs.
import { describe, expect, it } from "vitest";
import { createPages } from "../src/pages.js";

const GAMES = [
  { id: "spades", name: "Spades", emoji: "♠️", seats: [4, 4] as [number, number], teams: true, on: true },
  { id: "palace", name: "Palace", emoji: "🏰", seats: [2, 6] as [number, number], teams: false, on: true },
  { id: "chess", name: "Chess", emoji: "♟️", seats: [2, 2] as [number, number], teams: false, on: false },
  { id: "chipstack", name: "Chip Stack", emoji: "🪙", seats: [1, 1] as [number, number], teams: false, on: true },
];
const pages = createPages({ state: async () => ({ games: GAMES as never, watching: true }) });
const get = async (path: string) => (await pages.fetch(new Request(`http://parlor.test${path}`)))!;
/** The games on the page, by the cards' headings, in order. */
const names = (html: string) => [...html.matchAll(/<h3[^>]*>\s*<a href="[^"]*"[^>]*>(?:<\?zb[^>]*\?>|<!--.*?-->|\s)*([^<]+)/g)].map((m) => m[1]!.trim());

describe("the games page", () => {
  it("is HTML with every game that is switched on, in the catalogue's order", async () => {
    const response = await get("/games");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(response.headers.get("x-parlor-page")).toBe("games");
    const html = await response.text();
    expect(names(html)).toEqual(["Spades", "Palace", "Chip Stack"]);
    expect(html).toContain("3 games");
    expect(html).toContain('href="/?game=palace"');
    expect(html).toContain("2 to 6 players");
    expect(html).toContain("1 player");
    expect(html).not.toContain("Chess");
  });

  it("has a form that asks the server again, for a browser without JavaScript", async () => {
    const html = await (await get("/games")).text();
    expect(html).toMatch(/<form[^>]*method="get"/);
    expect(html).toMatch(/<input[^>]*name="q"/);
    expect(html).toMatch(/<select[^>]*name="kind"/);
    expect(html).toMatch(/type="submit"/);
  });

  it("filters by name and by kind from the address", async () => {
    expect(names(await (await get("/games?q=pa")).text())).toEqual(["Spades", "Palace"]);
    expect(names(await (await get("/games?kind=arcade")).text())).toEqual(["Chip Stack"]);
    expect(names(await (await get("/games?q=PAL&kind=table")).text())).toEqual(["Palace"]);
    const none = await (await get("/games?q=zzz")).text();
    expect(names(none)).toEqual([]);
    expect(none).toContain("No game by that name");
    // What was asked for is still in the fields.
    expect(await (await get("/games?q=pa&kind=table")).text()).toMatch(/<input[^>]*value="pa"/);
  });

  it("writes what was typed as text, never as markup", async () => {
    const html = await (await get(`/games?q=${encodeURIComponent('"><script>alert(1)</script>')}`)).text();
    expect(html).not.toContain("<script>alert(1)");
  });

  it("is switched off, not broken, when its components can't be found", async () => {
    const errors: unknown[][] = [];
    const error = console.error;
    console.error = (...said: unknown[]) => void errors.push(said);
    try {
      const off = createPages({ state: async () => ({ games: GAMES as never, watching: true }) }, { components: "/nowhere/at/all" });
      // The address is left to the app, and the modules aren't there.
      expect(await off.fetch(new Request("http://parlor.test/games"))).toBeNull();
      expect((await off.fetch(new Request("http://parlor.test/_zubra/runtime/zubra.js")))!.status).toBe(404);
      expect(errors.length).toBe(1);
    } finally {
      console.error = error;
    }
  });

  it("serves the components' modules, and nothing else", async () => {
    const html = await (await get("/games")).text();
    const module = html.match(/\/_zubra\/[^"' )]+\.js/)?.[0];
    expect(module).toBeTruthy();
    const served = await get(module!);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toMatch(/javascript/);
    expect((await get("/_zubra/nothing-here.js")).status).toBe(404);
    expect(await pages.fetch(new Request("http://parlor.test/houses"))).toBeNull();
    expect((await pages.fetch(new Request("http://parlor.test/games", { method: "POST" })))!.status).toBe(404);
  });
});

describe("asking for a game", () => {
  /** A parlor that takes requests, with the relay's route faked: what it was sent, and what it says. */
  function asking(reply: () => Response = () => Response.json({ ok: true, number: 7, url: "https://github.com/o/r/issues/7", again: false }, { status: 201 })) {
    const sent: { url: string; cookie: string | null; body: { name: string; note: string } }[] = [];
    const pages = createPages(
      { state: async () => ({ games: GAMES as never, watching: true }) },
      {
        asking: () => true,
        ask: async (request) => {
          sent.push({ url: new URL(request.url).pathname, cookie: request.headers.get("cookie"), body: (await request.json()) as { name: string; note: string } });
          return reply();
        },
      },
    );
    const ACTION = "http://parlor.test/_zb/action/game-request/ask";
    /** A form's post: as the page's script sends it (`json`), or as a browser without JavaScript does. */
    const post = (fields: Record<string, string>, { json = true, headers = {} as Record<string, string> } = {}) =>
      pages.fetch(new Request(ACTION, { method: "POST", headers: { ...(json ? { accept: "application/json" } : { referer: "http://parlor.test/games?kind=table" }), cookie: "player=abc", ...headers }, body: new URLSearchParams(fields) }));
    return { pages, sent, post };
  }

  it("is a form that posts to a function on the server, only where the parlor takes requests", async () => {
    const html = await (await asking().pages.fetch(new Request("http://parlor.test/games")))!.text();
    expect(html).toMatch(/<form[^>]*action="\/_zb\/action\/game-request\/ask"[^>]*method="post"|<form[^>]*method="post"[^>]*action="\/_zb\/action\/game-request\/ask"/);
    expect(html).toMatch(/<input[^>]*name="name"/);
    expect(html).toMatch(/<textarea[^>]*name="note"/);
    expect(html).toContain("/_zb/actions.js");
    // The function itself never reaches the browser: neither the page nor the component's module has it.
    const module = await (await asking().pages.fetch(new Request("http://parlor.test/_zubra/components/game-request.js")))!.text();
    expect(module).toContain("/_zb/action/game-request/ask");
    expect(module).not.toContain("askFor");
    expect(module).not.toContain("use server");
    // The parlor at the top of this file takes no requests.
    const without = await (await get("/games")).text();
    expect(without).not.toContain("game-request");
    expect(without).not.toContain("/_zb/actions.js");
  });

  it("sends a request on to the relay with the visitor's own cookie, and answers the page's script", async () => {
    const { post, sent } = asking();
    const reply = (await post({ name: "Mah-Jongg", note: "The way Grammi plays it" }))!;
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({ ok: true, again: false, url: "https://github.com/o/r/issues/7" });
    expect(sent).toEqual([{ url: "/bugs/request", cookie: "player=abc", body: { name: "Mah-Jongg", note: "The way Grammi plays it" } }]);
  });

  it("says so, and files nothing, for a game the parlor already has", async () => {
    const { post, sent } = asking();
    expect(await (await post({ name: "  palace " }))!.json()).toEqual({ have: { name: "Palace", emoji: "🏰", href: "/?game=palace" } });
    expect(await (await post({ name: "x" }))!.json()).toEqual({ error: "Which game would you like?" });
    // Chess is switched off here, so it can be asked for.
    expect(await (await post({ name: "Chess" }))!.json()).toMatchObject({ ok: true });
    expect(sent.map((s) => s.body.name)).toEqual(["Chess"]);
  });

  it("passes on what the relay says when it won't take the request", async () => {
    const { post } = asking(() => Response.json({ error: "That's a lot of requests. Try again tomorrow." }, { status: 429 }));
    expect(await (await post({ name: "Skat" }))!.json()).toEqual({ error: "That's a lot of requests. Try again tomorrow." });
  });

  it("works without JavaScript: the post goes back to the page, which is drawn with the answer once", async () => {
    const { post, pages } = asking();
    const reply = (await post({ name: "Skat", note: "" }, { json: false }))!;
    expect(reply.status).toBe(303);
    expect(reply.headers.get("location")).toBe("/games?kind=table");
    const cookie = reply.headers.get("set-cookie")!.split(";")[0]!;
    const page = (await pages.fetch(new Request("http://parlor.test/games?kind=table", { headers: { cookie } })))!;
    const html = await page.text();
    expect(html).toContain("Your request is in.");
    expect(html).toContain('href="https://github.com/o/r/issues/7"');
    // The answer is shown once: the page clears it, and the next visit has none.
    expect(page.headers.get("set-cookie")).toMatch(/zb_result=;|Max-Age=0|Expires=/i);
    expect(await (await pages.fetch(new Request("http://parlor.test/games")))!.text()).not.toContain("Your request is in.");
  });

  it("refuses a post from another site", async () => {
    const { post, sent } = asking();
    const reply = (await post({ name: "Skat" }, { headers: { "sec-fetch-site": "cross-site" } }))!;
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect(sent).toEqual([]);
  });
});

describe("asking for a game, through the whole server", () => {
  it("files the request on GitHub the way the app's sheet does", async () => {
    const { createCardRoom } = await import("../src/app.js");
    const { memoryLog } = await import("@zubra/sync/server");
    const asked: { url: string; method: string; body: { title?: string; labels?: string[] } | null }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      asked.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null });
      if (init.method === "GET") return new Response("[]");
      return new Response(JSON.stringify({ number: 41, html_url: "https://github.com/o/r/issues/41" }), { status: 201 });
    }) as unknown as typeof globalThis.fetch;
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false, bugs: { token: "ghp_secret", repo: "o/r", fetch } });
    try {
      const page = await (await app.fetch(new Request("https://cards.test/games")))!.text();
      expect(page).toContain('action="/_zb/action/game-request/ask"');
      const reply = (await app.fetch(new Request("https://cards.test/_zb/action/game-request/ask", { method: "POST", headers: { accept: "application/json" }, body: new URLSearchParams({ name: "Skat", note: "Three players" }) })))!;
      expect(await reply.json()).toEqual({ ok: true, again: false, url: "https://github.com/o/r/issues/41" });
      const filed = asked.find((a) => a.method === "POST")!;
      expect(filed.body).toMatchObject({ title: "Game request: Skat", labels: ["enhancement", "game request"] });
      // Sync's own routes under /_zb are still the rooms kit's.
      expect((await app.fetch(new Request("https://cards.test/_zb/action/nothing/here", { method: "POST" })))!.status).toBe(404);
    } finally {
      app.close();
    }
  });
});
