// Promoting saved numbers into the code: a draft pull request from a new branch, with a fake GitHub that
// keeps branches, one file and the pull requests, so what was asked of it can be checked.
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { merge } from "../src/promote.js";
import { TUNABLE_GAMES } from "../src/tunables.js";

const BASE = "http://test";
const TOKEN = "let-grammi-in";
const REPO = "owner/parlor";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

interface Calls { method: string; path: string; body: any; auth: string | null }

/** A GitHub with one repository: a main branch, the promoted files (as they are on main) and nothing else. */
function github(files: Record<string, unknown> = {}, fail: Partial<Record<string, number>> = {}) {
  const calls: Calls[] = [];
  const branches = new Map<string, string>([["main", "sha-main"]]);
  const committed = new Map<string, string>();
  const prs: any[] = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(`/repos/${REPO}`, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body, auth: new Headers(init?.headers).get("authorization") });
    const out = (status: number, b: unknown = {}) => Response.json(b, { status });
    const key = `${method} ${path.replace(/\/(heads|contents)\/.*/, "/$1/*")}`;
    if (fail[key]) return out(fail[key]!, { message: "nope" });
    if (method === "GET" && path.startsWith("/git/ref/heads/")) {
      const sha = branches.get(decodeURIComponent(path.slice("/git/ref/heads/".length)));
      return sha ? out(200, { object: { sha } }) : out(404);
    }
    if (method === "GET" && path.startsWith("/contents/")) {
      const file = decodeURIComponent(path.slice("/contents/".length));
      return file in files ? out(200, { sha: "sha-file", content: Buffer.from(JSON.stringify(files[file])).toString("base64") }) : out(404);
    }
    if (method === "POST" && path === "/git/refs") {
      const name = String(body.ref).replace("refs/heads/", "");
      if (branches.has(name)) return out(422);
      branches.set(name, body.sha);
      return out(201, {});
    }
    if (method === "PUT" && path.startsWith("/contents/")) {
      committed.set(`${body.branch}:${path.slice("/contents/".length)}`, Buffer.from(body.content, "base64").toString("utf8"));
      return out(200, {});
    }
    if (method === "POST" && path === "/pulls") {
      prs.push(body);
      return out(201, { html_url: `https://github.com/${REPO}/pull/${40 + prs.length}`, number: 40 + prs.length });
    }
    if (method === "DELETE" && path.startsWith("/git/refs/heads/")) {
      branches.delete(path.slice("/git/refs/heads/".length));
      return out(204);
    }
    throw new Error(`unexpected ${method} ${path}`);
  }) as typeof fetch;
  return { fake, calls, branches, committed, prs };
}

function setup(gh = github(), { token = "fine-grained-token" as string | null, clock = () => 1_800_000_000_000 } = {}) {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, adminToken: TOKEN, promote: { token: token ?? undefined, repo: REPO, fetch: gh.fake, now: clock } });
  open.push(app);
  const call = async (path: string, body?: unknown, auth: string | null = TOKEN) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) headers.authorization = `Bearer ${auth}`;
    const r = (await app.fetch(new Request(`${BASE}/moderation${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) })))!;
    return { status: r.status, body: (await r.json()) as any };
  };
  return { app, call, gh };
}

const BACK_ROOM_FILE = TUNABLE_GAMES["back-room"]!.promoted;

describe("merging the saved numbers into the promoted file", () => {
  it("merges objects key by key and replaces numbers and lists", () => {
    expect(merge({ cards: { wrench: { damage: 8, cost: 1 } }, rest: 8 }, { cards: { wrench: { damage: 15 }, lamp: { cost: 2 } }, rest: 12 })).toEqual({ cards: { wrench: { damage: 15, cost: 1 }, lamp: { cost: 2 } }, rest: 12 });
    expect(merge({ clues: [40, 38] }, { clues: [30] })).toEqual({ clues: [30] });
    expect(merge({}, { rest: 1 })).toEqual({ rest: 1 });
  });
});

describe("opening a pull request", () => {
  it("branches off main, commits the merged file, opens a draft, and keeps where it went", async () => {
    const gh = github({ [BACK_ROOM_FILE]: { cards: { wrench: { cost: 2 } } } });
    const { call } = setup(gh);
    await call("/tunables/back-room", { values: { cards: { wrench: { damage: 15 } }, foes: { rat: { hp: 25 } } } });
    const made = await call("/tunables/back-room/promote", {});
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ version: 1, url: `https://github.com/${REPO}/pull/41`, number: 41 });
    expect(made.body.branch).toMatch(/^tuning\/back-room-v1-/);

    // Off main's own commit; the file merged over what main has; a draft; the token on every call and nowhere else.
    expect(gh.calls.find((c) => c.method === "POST" && c.path === "/git/refs")!.body).toMatchObject({ ref: `refs/heads/${made.body.branch}`, sha: "sha-main" });
    const file = JSON.parse(gh.committed.get(`${made.body.branch}:${BACK_ROOM_FILE}`)!);
    expect(file).toEqual({ cards: { wrench: { cost: 2, damage: 15 } }, foes: { rat: { hp: 25 } } });
    expect(gh.committed.get(`${made.body.branch}:${BACK_ROOM_FILE}`)!.endsWith("\n")).toBe(true);
    expect(gh.calls.find((c) => c.method === "PUT")!.body.sha).toBe("sha-file");
    expect(gh.prs[0]).toMatchObject({ head: made.body.branch, base: "main", draft: true });
    expect(gh.prs[0].title).toContain("version 1");
    expect(gh.calls.every((c) => c.auth === "Bearer fine-grained-token")).toBe(true);
    expect(JSON.stringify(made.body)).not.toContain("fine-grained-token");
    expect(JSON.stringify(gh.prs)).not.toContain("fine-grained-token");
    // Never touches main itself.
    expect(gh.calls.some((c) => c.method === "PUT" && c.body.branch === "main")).toBe(false);
    expect([...gh.branches.keys()].sort()).toEqual(["main", made.body.branch].sort());
  });

  it("adds the file when main doesn't have one yet, and writes no attribution into the commit or the pull request", async () => {
    const gh = github();
    const { call } = setup(gh);
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    const made = await call("/tunables/sudoku/promote", {});
    expect(made.status).toBe(200);
    expect(gh.calls.find((c) => c.method === "PUT")!.body).not.toHaveProperty("sha");
    expect(gh.calls.find((c) => c.method === "PUT")!.path).toBe(`/contents/${TUNABLE_GAMES.sudoku!.promoted}`);
    for (const text of [gh.calls.find((c) => c.method === "PUT")!.body.message, gh.prs[0].body]) expect(text).not.toMatch(/Co-Authored-By|Generated with|claude/i);
  });

  it("is offered in the list, with the last pull request for each game", async () => {
    const { call } = setup(github());
    expect((await call("/tunables")).body.canPromote).toBe(true);
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    await call("/tunables/sudoku/promote", {});
    const list = (await call("/tunables")).body;
    expect(list.games.find((g: any) => g.id === "sudoku").promoted).toMatchObject({ version: 1, number: 41 });
    expect(list.games.find((g: any) => g.id === "back-room").promoted).toBeNull();
  });

  it("is put in the moderation log", async () => {
    const { call } = setup(github());
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    await call("/tunables/sudoku/promote", {});
    const log = JSON.stringify((await call("/log")).body);
    expect(log).toContain("Opened a pull request for a game's numbers");
    expect(log).not.toContain("fine-grained-token");
  });

  it("won't open a second one for the same version, but will for the next", async () => {
    const gh = github();
    const { call } = setup(gh);
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    expect((await call("/tunables/sudoku/promote", {})).status).toBe(200);
    const again = await call("/tunables/sudoku/promote", {});
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("already has a pull request");
    expect(gh.prs).toHaveLength(1);
    await call("/tunables/sudoku", { values: { clues: [41, 38, 36, 33, 31, 29, 27] } });
    expect((await call("/tunables/sudoku/promote", {})).status).toBe(200);
    expect(gh.prs).toHaveLength(2);
  });
});

describe("what stops it", () => {
  it("needs the admin, and a game it knows", async () => {
    const { call, gh } = setup();
    expect((await call("/tunables/sudoku/promote", {}, null)).status).toBe(401);
    expect((await call("/tunables/sudoku/promote", {}, "wrong")).status).toBe(401);
    expect((await call("/tunables/chess/promote", {})).status).toBe(404);
    expect(gh.calls).toEqual([]);
  });

  it("says so when there's no token set up, and touches nothing", async () => {
    const { call, gh } = setup(github(), { token: null });
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    expect((await call("/tunables")).body.canPromote).toBe(false);
    const r = await call("/tunables/sudoku/promote", {});
    expect(r.status).toBe(503);
    expect(r.body.error).toContain("isn't set up");
    expect(gh.calls).toEqual([]);
  });

  it("has nothing to promote when the game is on its own numbers", async () => {
    const { call, gh } = setup();
    expect((await call("/tunables/sudoku/promote", {})).status).toBe(409);
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    await call("/tunables/sudoku/reset", {});
    expect((await call("/tunables/sudoku/promote", {})).body.error).toBe("There's nothing saved to promote.");
    expect(gh.calls).toEqual([]);
  });

  it("takes the file's name from the server, not from the request", async () => {
    const gh = github();
    const { call } = setup(gh);
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    await call("/tunables/sudoku/promote", { path: "../../.github/workflows/ci.yml", file: "x", branch: "main", base: "evil" });
    expect(gh.calls.filter((c) => c.method === "PUT").map((c) => c.path)).toEqual([`/contents/${TUNABLE_GAMES.sudoku!.promoted}`]);
    expect(gh.prs[0].base).toBe("main");
  });

  it("explains what GitHub refused, takes its branch back, and can be tried again", async () => {
    const gh = github({}, { "PUT /contents/*": 403 });
    const { call } = setup(gh);
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    const refused = await call("/tunables/sudoku/promote", {});
    expect(refused.status).toBe(502);
    expect(refused.body.error).toMatch(/wouldn't let the parlor commit the numbers/);
    expect([...gh.branches.keys()]).toEqual(["main"]);
    expect(gh.prs).toEqual([]);
    expect((await call("/tunables")).body.games.find((g: any) => g.id === "sudoku").promoted).toBeNull();
  });

  it("explains an expired token, a missing branch and an unreachable GitHub", async () => {
    const expired = setup(github({}, { "GET /git/ref/heads/*": 401 }));
    await expired.call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    expect((await expired.call("/tunables/sudoku/promote", {})).body.error).toContain("may have expired");
    const gone = setup(github({}, { "GET /git/ref/heads/*": 404 }));
    await gone.call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    expect((await gone.call("/tunables/sudoku/promote", {})).body.error).toMatch(/read the main branch/);
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false, adminToken: TOKEN, promote: { token: "t", repo: REPO, fetch: (async () => { throw new Error("offline"); }) as typeof fetch } });
    open.push(app);
    const send = async (path: string, body: unknown) => (await (await app.fetch(new Request(`${BASE}/moderation${path}`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body) })))!.json()) as any;
    await send("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    expect((await send("/tunables/sudoku/promote", {})).error).toBe("Couldn't reach GitHub. Try again.");
  });

  it("won't add to a promoted file on main that isn't JSON", async () => {
    const gh = github();
    const bad = (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).includes("/contents/") && (init?.method ?? "GET") === "GET" ? Response.json({ sha: "x", content: Buffer.from("not json").toString("base64") }) : gh.fake(input, init))) as typeof fetch;
    const { call } = setup({ ...gh, fake: bad });
    await call("/tunables/sudoku", { values: { clues: [40, 38, 36, 33, 31, 29, 27] } });
    const r = await call("/tunables/sudoku/promote", {});
    expect(r.status).toBe(409);
    expect(gh.prs).toEqual([]);
  });
});
