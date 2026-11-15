// The parlor's side of "Report a problem" and "Ask for a game". How an issue is built, the limits and
// the screenshots are @journey-to-code/relay's, and tested there; this is what the parlor adds: its
// names, a table described without saying who is at it, players told apart by their cookie, and
// everything kept in the sync log where the pull route can't reach it.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { DEFAULT_REPO, type BugOptions } from "../src/bugs.js";
import { playerRef } from "../src/moderation.js";

const BASE = "https://cards.test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((a) => a.close());
  open = [];
});

/** A tiny real JPEG header and some bytes: enough to be taken for a picture. */
const jpeg = (size = 64) => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size, 7)]).toString("base64")}`;

function setup(bugs: BugOptions = {}) {
  /** What GitHub was asked, newest last. */
  const asked: { url: string; method: string; headers: Record<string, string>; body: { title: string; body: string; labels: string[] } }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    asked.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
    if (init.method === "GET") return new Response("[]");
    return new Response(JSON.stringify({ number: 40 + asked.length, html_url: `https://github.com/o/r/issues/${40 + asked.length}` }), { status: 201 });
  }) as unknown as typeof globalThis.fetch;
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false, adminToken: "a-long-admin-token", bugs: { token: "ghp_secret", repo: "o/r", version: "abc1234", fetch, ...bugs } });
  open.push(app);
  const phone = () => {
    const cookies = new Map<string, string>();
    return async (path: string, body?: unknown) => {
      const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie")?.split(";")[0];
      if (set) cookies.set(set.split("=")[0]!, set.split("=")[1]!);
      return { status: r.status, type: r.headers.get("content-type"), body: r.headers.get("content-type") === "application/json" ? await r.json() : Buffer.from(await r.arrayBuffer()) };
    };
  };
  return { app, phone, asked };
}

describe("reporting a problem", () => {
  it("is off, and says so, until the server has a token", async () => {
    const { phone, asked } = setup({ token: "" });
    const me = phone();
    expect((await me("/bugs/config")).body).toEqual({ enabled: false, tidy: false });
    expect((await me("/bugs", { description: "Hello" })).status).toBe(503);
    expect(asked).toEqual([]);
  });

  it("files an issue in the parlor's own words", async () => {
    const { phone, asked } = setup();
    const sent = await phone()("/bugs", { description: "The cards overlap on my phone.", screen: "table", scope: "spades", built: "2026-11-14T09:00Z" });
    expect(sent).toMatchObject({ status: 201, body: { ok: true, number: 41, url: "https://github.com/o/r/issues/41" } });
    const issue = asked[0]!.body;
    expect(issue.labels).toEqual(["bug", "player report"]);
    expect(issue.body).toContain("| Where | table (spades) |");
    expect(issue.body).toContain("Sent from inside open.parlor with “Report a problem”.");
    expect(issue.body).toContain("The player chose not to share browser details.");
  });

  it("files into this repository unless told otherwise", async () => {
    expect(DEFAULT_REPO).toBe("journey-to-code-org/open.parlor");
    const { phone, asked } = setup({ repo: "not a repo" });
    await phone()("/bugs", { description: "Hello" });
    expect(asked[0]!.url).toBe(`https://api.github.com/repos/${DEFAULT_REPO}/issues`);
  });

  it("describes the table without saying who is at it, or how to get in", async () => {
    const { app, phone, asked } = setup();
    const me = phone();
    const { id } = (await me("/rooms", { options: { game: "gin" } })).body;
    await me("/rooms/" + id + "/sit", { seat: 0, name: "Grammi" });
    await phone()("/rooms/" + id + "/sit", { seat: 1, name: "Pappy" });
    await me("/rooms/" + id + "/start", {});
    const sent = await me("/bugs", { description: "Stuck", screen: "table", ref: id });
    const { body } = asked[0]!.body;
    expect(body).toContain("<summary>The table</summary>");
    expect(body).toContain("Game: Gin Rummy");
    expect(body).toContain("Seats: 2 (2 people, 0 computer, 0 empty)");
    expect(body).toMatch(/Dealt: yes, \d+ moves? in/);
    expect(body).toContain("Kind of table: family table");
    expect(body).not.toMatch(/Grammi|Pappy/);
    expect(body).not.toContain(id);
    // Whoever runs the server can still find the table.
    const kept = (await app.rooms.sync.documents()).get("bugs", "reports");
    expect(kept).toMatchObject({ [`n${sent.body.number}`]: { ref: id } });
  });

  it("says nothing about a table that isn't there", async () => {
    const { phone, asked } = setup();
    await phone()("/bugs", { description: "Stuck", ref: "no-such-table" });
    expect(asked[0]!.body.body).not.toContain("<summary>The table</summary>");
  });

  it("keeps an agreed screenshot in the sync log, where nobody can pull it", async () => {
    const { phone, asked } = setup();
    const me = phone();
    const picture = jpeg();
    expect((await me("/bugs", { description: "Look", screenshot: picture })).status).toBe(201);
    const link = asked[0]!.body.body.match(/!\[What the player saw\]\((https:\/\/cards\.test\/bugs\/shots\/[a-z0-9]{20}\.jpg)\)/)?.[1];
    expect(link).toBeTruthy();
    const shown = await me(link!.replace(BASE, ""));
    expect(shown).toMatchObject({ status: 200, type: "image/jpeg" });
    expect((shown.body as Buffer).toString("base64")).toBe(picture.split(",")[1]);
    const pulled = (await me("/_zb/sync/pull?since=0")).body.changes.map((c: { collection: string }) => c.collection);
    expect(pulled).not.toContain("bugs");
  });

  it("takes only a few from one player, told apart by their cookie", async () => {
    const { phone, asked } = setup({ each: 2 });
    const me = phone();
    expect((await me("/lobby/join", { game: "gin", name: "Anna" })).status).toBe(201); // gives this phone its player cookie
    expect((await me("/bugs", { description: "one" })).status).toBe(201);
    expect((await me("/bugs", { description: "two" })).status).toBe(201);
    expect(await me("/bugs", { description: "three" })).toMatchObject({ status: 429, body: { error: expect.stringContaining("ten minutes") } });
    // Another phone, at the same address, has its own few.
    const other = phone();
    expect((await other("/lobby/join", { game: "gin", name: "Ben" })).status).toBeLessThan(300);
    expect((await other("/bugs", { description: "three" })).status).toBe(201);
    expect(asked).toHaveLength(3);
  });

  it("isn't for a blocked player", async () => {
    const { app, asked } = setup();
    let cookie = "";
    const pest = async (path: string, body: unknown) => {
      const r = (await app.fetch(new Request(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) })))!;
      cookie = r.headers.get("set-cookie")?.split(";")[0] ?? cookie;
      return { status: r.status };
    };
    expect((await pest("/lobby/join", { game: "gin", name: "Pest" })).status).toBe(201);
    // The parlor's host blocks them in the admin app.
    const blocked = await app.fetch(
      new Request(`${BASE}/moderation/players/${playerRef(cookie.split("=")[1]!)}/block`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer a-long-admin-token" }, body: JSON.stringify({ reason: "spam" }) }),
    );
    expect(blocked!.status).toBe(200);
    expect((await pest("/bugs", { description: "spam" })).status).toBe(403);
    expect((await pest("/bugs/request", { name: "Spam" })).status).toBe(403);
    expect(asked).toEqual([]);
  });
});

describe("asking for a game", () => {
  it("files a game request, labelled the way the parlor's issues already are", async () => {
    const { phone, asked } = setup();
    const sent = await phone()("/bugs/request", { name: "Mah-Jongg", note: "The way Grammi plays it" });
    expect(sent).toMatchObject({ status: 201, body: { ok: true, again: false } });
    const [look, file] = asked;
    expect(look!.url).toContain("labels=game%20request");
    expect(file!.body).toMatchObject({ title: "Game request: Mah-Jongg", labels: ["enhancement", "game request"] });
    expect(file!.body.body).toContain("A player asked for **Mah-Jongg**.");
    expect(file!.body.body).toContain("with “Ask for a game”");
  });
});

describe("tidying before sending", () => {
  const tidy = async (input: { kind: string }) => (input.kind === "bug" ? { kind: "bug" as const, title: "Palace: draws early", report: "- One." } : { kind: "request" as const, name: "Mahjong", note: "Hong Kong style." });

  it("is on when the parlor has a way to tidy, and answers in the relay's shapes", async () => {
    const { phone, asked } = setup({ tidy });
    const me = phone();
    expect((await me("/bugs/config")).body).toEqual({ enabled: true, tidy: true });
    expect((await me("/bugs/tidy", { kind: "bug", description: "in palace you can draw after a 10", screen: "table", scope: "palace" })).body).toEqual({ kind: "bug", title: "Palace: draws early", report: "- One." });
    expect((await me("/bugs/tidy", { kind: "request", name: "mah jong" })).body).toMatchObject({ kind: "request", name: "Mahjong" });
    expect(asked).toEqual([]);
  });

  it("is off without one", async () => {
    expect((await setup().phone()("/bugs/tidy", { kind: "bug", description: "The cards overlap on my phone." })).status).toBe(503);
  });
});
