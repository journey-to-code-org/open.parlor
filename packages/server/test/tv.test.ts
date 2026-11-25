import { memoryLog } from "@zubra/sync/server";
import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { qrPng } from "../src/tv.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((a) => a.close());
  open = [];
});

function setup() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false, tv: { longPoll: 300 } });
  open.push(app);
  const device = () => {
    let cookie = "";
    return async (path: string, body?: unknown) => {
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      const type = r.headers.get("content-type") ?? "";
      return { status: r.status, headers: r.headers, body: type.includes("json") ? await r.json() : null };
    };
  };
  return { app, device };
}
const until = async (check: () => Promise<boolean>, ms = 4000) => {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("a television as the table", () => {
  it("lists the games it can show", async () => {
    const { device } = setup();
    const { body } = await device()("/tv/games");
    expect(body.games.map((g: { id: string }) => g.id)).toEqual(["readtheroom", "telephone"]);
    expect(body.games[0]).toMatchObject({ name: "Read the Room", seats: { min: 3, max: 8, default: 4 } });
    expect(body.games[0].rules.map((r: { id: string }) => r.id)).toEqual(["party", "quick", "taps"]);
    expect(body.games[1]).toMatchObject({ name: "Pass the Picture", seats: { min: 3, max: 12, default: 6 } });
  });

  it("opens a table, the phones join by its link or code, and it deals with computers in the empty seats", async () => {
    const { device } = setup();
    const tv = device();
    const made = await tv("/tv/tables", { game: "readtheroom", seats: 4, rules: "quick" });
    expect(made.status).toBe(201);
    const { id, token, code } = made.body;
    expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(made.body.join).toBe(`${BASE}/?table=${id}`);

    // The short code sends a phone to the table.
    const typed = await device()(`/tv/${code.toLowerCase()}`);
    expect(typed.status).toBe(302);
    expect(typed.headers.get("location")).toBe(`/?table=${id}`);
    expect((await device()("/tv/ZZZZ")).status).toBe(404);
    expect((await device()("/tv")).headers.get("location")).toBe("/");

    // Without the token, nothing.
    expect((await tv(`/tv/tables/${id}?token=nope`)).status).toBe(403);
    const lobby = await tv(`/tv/tables/${id}?token=${token}`);
    expect(lobby.body).toMatchObject({ started: false, free: 4, code, screen: { layout: "lobby", title: "Read the Room" } });

    // A phone sitting down wakes a television that is waiting for a change.
    const waiting = tv(`/tv/tables/${id}?token=${token}&after=${lobby.body.stamp}`);
    await (await device())(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    const changed = await waiting;
    expect(changed.body.stamp).not.toBe(lobby.body.stamp);
    expect(changed.body.free).toBe(3);
    expect(changed.body.screen.players[0]).toMatchObject({ name: "Grammi", done: true });

    // Not until asked to fill the seats.
    expect((await tv(`/tv/tables/${id}/start`, { token })).status).toBe(409);
    expect((await device()(`/tv/tables/${id}/start`, { token: "nope", fill: true })).status).toBe(403);
    expect((await tv(`/tv/tables/${id}/start`, { token, fill: true })).body).toEqual({ ok: true });

    const dealt = await tv(`/tv/tables/${id}?token=${token}`);
    expect(dealt.body.started).toBe(true);
    expect(dealt.body.screen.layout).toBe("question");
    expect(dealt.body.screen.question).not.toBe("");
    expect(dealt.body.screen.count).toMatch(/1 of 5/);
    expect(dealt.body.screen.players.map((p: { name: string; bot: boolean }) => p.bot)).toEqual([false, true, true, true]);
    expect(dealt.body.screen.players[0].name).toBe("Grammi");
  });

  it("shows what the room said once everyone has answered, with names for seats", async () => {
    const { app, device } = setup();
    const tv = device();
    const { id, token } = (await tv("/tv/tables", { game: "readtheroom", seats: 3, rules: "taps" })).body;
    for (const seat of [0, 1, 2]) await app.rooms.seatBot(id, seat, ["Ada", "Bea", "Cy"][seat]!);
    await app.rooms.start(id);
    let screen: Record<string, any> = {};
    await until(async () => {
      screen = (await tv(`/tv/tables/${id}?token=${token}`)).body.screen;
      return screen.layout === "room";
    });
    expect(screen.headline).not.toMatch(/\{\d+\}/);
    expect(screen.bars.length).toBeGreaterThan(0);
    for (const bar of screen.bars) expect(bar.label).not.toMatch(/\{\d+\}/);
    expect(screen.max).toBeGreaterThan(0);
    expect(screen.players.map((p: { name: string }) => p.name)).toEqual(["Ada", "Bea", "Cy"]);
  });

  it("shows Pass the Picture: who has passed theirs on, then each chain turned over, drawings painted", async () => {
    const { app, device } = setup();
    const tv = device();
    const { id, token } = (await tv("/tv/tables", { game: "telephone", seats: 3, rules: "quick" })).body;
    const phones = [device(), device(), device()];
    for (const [seat, p] of phones.entries()) await p(`/rooms/${id}/sit`, { seat, name: ["Ada", "Bea", "Cy"][seat] });
    expect((await tv(`/tv/tables/${id}/start`, { token })).body).toEqual({ ok: true });
    const act = (seat: number, move: unknown) => phones[seat]!(`/rooms/${id}/act`, { move });
    const screen = async () => (await tv(`/tv/tables/${id}?token=${token}`)).body.screen;

    await act(0, { type: "write", text: "the dog stole the pie" });
    let s = await screen();
    expect(s.layout).toBe("pass");
    expect(s.pass).toMatchObject({ phase: "play", step: 1, steps: 3, kinds: ["Write", "Draw", "Guess"], chain: null });
    expect(s.players.map((p: { done: boolean }) => p.done)).toEqual([true, false, false]);
    // Nothing anyone wrote is on the television while they play.
    expect(JSON.stringify(s)).not.toContain("pie");

    await act(1, { type: "write", text: "a cat" });
    await act(2, { type: "write", text: "a hat" });
    for (const seat of [0, 1, 2]) {
      await act(seat, { type: "stroke", stroke: { points: [100, 100, 900, 900], color: 1, size: 2 } });
      await act(seat, { type: "done" });
    }
    for (const seat of [0, 1, 2]) await act(seat, { type: "guess", text: "a horse" });
    s = await screen();
    expect(s.pass.phase).toBe("reveal");
    expect(s.pass.chain).toMatchObject({ owner: "Ada", index: 1, of: 3, length: 3, shown: 1, done: false, last: { who: "Ada", verb: "wrote", text: "the dog stole the pie" }, prev: null });
    await act(0, { type: "show", at: 1 });
    s = await screen();
    expect(s.pass.chain.prev).toMatchObject({ verb: "wrote", text: "the dog stole the pie" });
    expect(s.pass.chain.last).toMatchObject({ who: "Bea", verb: "drew", text: "" });
    const png = (await app.fetch(new Request(BASE + s.pass.chain.last.img)))!;
    expect(png.headers.get("content-type")).toBe("image/png");
    expect((await app.fetch(new Request(BASE + s.pass.chain.last.img.replace(`token=${token}`, "token=nope"))))!.status).toBe(403);
    await act(0, { type: "show", at: 2 });
    s = await screen();
    expect(s.pass.chain).toMatchObject({ done: true, first: "the dog stole the pie", end: "a horse", last: { who: "Cy", verb: "thought it was" } });
  });

  it("draws the join link as a PNG", () => {
    const png = qrPng("http://192.168.1.20:8787/?table=abc", 2, 4);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const side = png.readUInt32BE(16);
    const idat = png.indexOf("IDAT");
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    expect(raw.length).toBe((side + 1) * side);
    expect(raw.includes(0)).toBe(true);
  });

  it("takes a post's fields from its address when the body was lost on a redirect", async () => {
    const { app, device } = setup();
    const post = (path: string) => app.fetch(new Request(BASE + path, { method: "POST" })).then(async (r) => ({ status: r!.status, body: await r!.json() }));
    const made = await post("/tv/tables?game=readtheroom&seats=3&rules=quick");
    expect(made.status).toBe(201);
    const { id, token } = made.body;
    await device()(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    expect((await post(`/tv/tables/${id}/start?fill=1&token=${token}`)).body).toEqual({ ok: true });
  });

  it("refuses a game it can't show", async () => {
    const { device } = setup();
    expect((await device()("/tv/tables", { game: "hearts" })).status).toBe(400);
  });
});
