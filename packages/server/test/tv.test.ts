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
    expect(body.games).toEqual([expect.objectContaining({ id: "readtheroom", name: "Read the Room", seats: { min: 3, max: 8, default: 4 } })]);
    expect(body.games[0].rules.map((r: { id: string }) => r.id)).toEqual(["party", "quick", "taps"]);
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

  it("draws the join link as a PNG", () => {
    const png = qrPng("http://192.168.1.20:8787/?table=abc", 2, 4);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const side = png.readUInt32BE(16);
    const idat = png.indexOf("IDAT");
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    expect(raw.length).toBe((side + 1) * side);
    expect(raw.includes(0)).toBe(true);
  });

  it("refuses a game it can't show", async () => {
    const { device } = setup();
    expect((await device()("/tv/tables", { game: "hearts" })).status).toBe(400);
  });
});
