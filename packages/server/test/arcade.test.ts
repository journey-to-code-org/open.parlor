// An arcade game played live at a table: it moves by how long the table waited, carries out each
// seat's orders once, keeps moving when nobody asks for anything, and plays the same from its log.
import { memoryLog } from "@zubra/sync/server";
import { arcadeGame } from "@journey-to-code/games";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { arcadeRoom, BEAT_MS, MOST_ORDERS, type LiveState } from "../src/arcade.js";
import { tableRoom } from "../src/games.js";

const at = (elapsed: number, when = 1_000_000) => ({ at: when, elapsed });
const table = (game: "bulwark" | "chipstack", seats = 2) => arcadeRoom.setup({ game, rules: arcadeGame(game)!.presets[0] as never, seats }, 7);
const ticks = (s: LiveState) => arcadeGame(s.game)!.summary(s.arcade as never).ticks;

describe("an arcade game at a table", () => {
  it("plays forward by however long the table waited, to the tick", () => {
    let s = table("bulwark");
    expect(ticks(s)).toBe(0);
    s = arcadeRoom.act(s, 0, { type: "beat" }, at(1000));
    expect(ticks(s)).toBe(60);
    expect(s.at).toBe(1_000_000);
    // Waits that are not a whole tick add up.
    for (let i = 0; i < 6; i++) s = arcadeRoom.act(s, 0, { type: "beat" }, at(10));
    expect(ticks(s)).toBe(63);
    expect(s.owed).toBe(600);
    // A very long wait is not played all at once.
    s = arcadeRoom.act(s, 1, { type: "beat" }, at(3_600_000));
    expect(ticks(s)).toBe(63 + 300);
  });

  it("leaves the state it was given alone", () => {
    const s = table("chipstack");
    const before = JSON.stringify(s);
    arcadeRoom.act(s, 0, { type: "cmd", inputs: [{ cmd: "tap" }] }, at(500));
    expect(JSON.stringify(s)).toBe(before);
  });

  it("carries out each order once, as the seat's own, and counts them", () => {
    let s = table("chipstack");
    s = arcadeRoom.act(s, 0, { type: "cmd", inputs: [{ cmd: "tap", n: 999 }, { cmd: "tap", n: 999 }, { cmd: "none" }, "nonsense", { cmd: "tap" }] }, at(0));
    expect(s.done).toEqual([3, 0]);
    expect(arcadeGame("chipstack")!.summary(s.arcade as never).score).toBeGreaterThan(0);
    // Orders are carried out ahead of the clock, a tick each, and the clock catches up.
    expect(ticks(s)).toBe(3);
    expect(s.owed).toBe(-3000);
    s = arcadeRoom.act(s, 1, { type: "beat" }, at(50));
    expect(ticks(s)).toBe(3);
    s = arcadeRoom.act(s, 1, { type: "beat" }, at(1000));
    expect(ticks(s)).toBe(63);
    // No more than a handful in one move.
    s = arcadeRoom.act(s, 1, { type: "cmd", inputs: Array.from({ length: 100 }, () => ({ cmd: "tap" })) }, at(0));
    expect(s.done).toEqual([3, MOST_ORDERS]);
    // Holding still does not give the last order again.
    const score = arcadeGame("chipstack")!.view(s.arcade as never).pilots[0]!.score;
    s = arcadeRoom.act(s, 0, { type: "beat" }, at(17));
    expect(s.done).toEqual([3, MOST_ORDERS]);
    expect(arcadeGame("chipstack")!.view(s.arcade as never).pilots[0]!.score).toBeGreaterThanOrEqual(score);
  });

  it("gives every seat the whole game, and keeps moving until it is over", () => {
    let s = table("chipstack", 2);
    const view = arcadeRoom.view(s, 1);
    expect(view).toMatchObject({ live: true, game: "chipstack", seat: 1, rate: 60, over: false, done: [0, 0] });
    expect(view.arcade).toEqual(s.arcade);
    expect(arcadeRoom.watch!(s, [arcadeRoom.view(s, 0), view])).toMatchObject({ seat: 0 });
    const beat = arcadeRoom.deadline!(s, { settings: null, seats: [] })!;
    expect(beat).toMatchObject({ after: BEAT_MS, seat: 0 });
    expect(beat.move()).toEqual({ type: "beat" });
    // Chip Stack is timed: beats alone bring it to its end.
    for (let i = 0; i < 2000 && !arcadeRoom.finished!(s); i++) s = arcadeRoom.act(s, 0, beat.move()!, at(BEAT_MS));
    expect(arcadeRoom.finished!(s)).toBe(true);
    expect(arcadeRoom.summary!(s)).toMatchObject({ over: true, rules: arcadeGame("chipstack")!.presets[0]!.name });
    expect(arcadeRoom.deadline!(s, { settings: null, seats: [] })).toBeNull();
    expect(() => arcadeRoom.act(s, 0, { type: "beat" }, at(10))).toThrow("The game is over.");
  });

  it("has computer players that give orders like anyone else", () => {
    let s = table("bulwark", 2);
    let orders = 0;
    for (let i = 0; i < 400 && !arcadeRoom.finished!(s); i++) {
      const move = arcadeRoom.bot!(s, 1, "Hank");
      if (move) orders++;
      s = arcadeRoom.act(s, 1, move ?? { type: "beat" }, at(700));
    }
    expect(orders).toBeGreaterThan(3);
    expect(s.done[1]).toBe(orders);
    expect(s.done[0]).toBe(0);
  });

  it("is one of the table's games, but not one the lobby offers", () => {
    const options = { game: "bulwark" as const, rules: { id: "nonsense" } as never, seats: 99 };
    expect(tableRoom.seats).toBeTypeOf("function");
    expect((tableRoom.seats as (o: unknown) => number)(options)).toBe(arcadeGame("bulwark")!.seats.default);
    expect(tableRoom.info!(options)).toEqual({ game: "bulwark", rules: arcadeGame("bulwark")!.presets[0]!.name });
    const s = tableRoom.setup(options, 3);
    expect(tableRoom.summary!(s)).toMatchObject({ game: "bulwark", over: false });
    expect(tableRoom.deadline!(s, { settings: null, seats: [{ name: "A", bot: false }] })).toMatchObject({ after: BEAT_MS });
  });
});

describe("an arcade table on the server", () => {
  let open: ReturnType<typeof createCardRoom>[] = [];
  afterEach(() => {
    open.forEach((c) => c.close());
    open = [];
  });
  it("is opened, sat at by two people, and played by both", async () => {
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false });
    open.push(app);
    const phone = () => {
      let cookie = "";
      return async (path: string, body?: unknown) => {
        const response = (await app.fetch(new Request("http://test" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
        const set = response.headers.get("set-cookie");
        if (set) cookie = set.split(";")[0]!;
        return { status: response.status, body: await response.json() };
      };
    };
    const a = phone();
    const b = phone();
    const made = await a("/rooms", { options: { game: "chipstack", rules: arcadeGame("chipstack")!.presets[0], seats: 2 } });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    expect((await a(`/rooms/${id}`)).body.info).toEqual({ game: "chipstack", rules: arcadeGame("chipstack")!.presets[0]!.name });
    await a(`/rooms/${id}/sit`, { seat: 0, name: "McMikey" });
    await b(`/rooms/${id}/sit`, { seat: 1, name: "Dubs" });
    expect((await a(`/rooms/${id}/start`, {})).status).toBe(200);
    expect((await a(`/rooms/${id}/act`, { move: { type: "cmd", inputs: [{ cmd: "tap" }, { cmd: "tap" }] } })).status).toBe(200);
    expect((await b(`/rooms/${id}/act`, { move: { type: "cmd", inputs: [{ cmd: "tap" }] } })).status).toBe(200);
    const room = (await a(`/rooms/${id}`)).body;
    expect(room.summary).toMatchObject({ game: "chipstack", over: false });
    expect(room.summary.score).toBeGreaterThan(0);
    expect(room.deadline).toMatchObject({ seat: 0 });
    // Someone who is not at the table can't give orders.
    expect((await phone()(`/rooms/${id}/act`, { move: { type: "beat" } })).status).not.toBe(200);
  });
});
