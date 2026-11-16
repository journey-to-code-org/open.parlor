// Shitstorm at a table: one real game on the server, and pages that play the very same game from
// nothing but a first picture and every tick's controls.
import { memoryLog } from "@zubra/sync/server";
import { arcadeGame } from "@journey-to-code/games";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";
import { createFlights, flightRoom, FLIGHT_BEAT_MS, type FlightState } from "../src/flight.js";
import { tableRoom } from "../src/games.js";

const game = arcadeGame("skyfire")!;
const table = (seats = 2, seed = 9): FlightState => flightRoom.setup({ game: "skyfire", rules: game.presets[0] as never, seats }, seed);
const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, bot: false }));

/** A page: it keeps the game it was sent and plays every tick it is told of. */
function page() {
  let state: unknown = null;
  let inputs: unknown[] = [];
  let tick = 0;
  const heard = { over: false, messages: 0, seat: undefined as number | null | undefined };
  return {
    heard,
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    send(text: string) {
      const m = JSON.parse(text);
      heard.messages++;
      if (m.snap) {
        state = m.snap;
        inputs = m.inputs;
        tick = m.tick;
        heard.seat = m.seat;
        heard.over = m.over;
      } else if (m.f) {
        expect(m.t).toBe(tick);
        for (const frame of m.f as [number, unknown][][]) {
          for (const [seat, input] of frame) inputs[seat] = input;
          game.step(state as never, inputs as never);
          tick++;
        }
      } else if (m.over) heard.over = true;
    },
  };
}

describe("a game that is flown", () => {
  it("is a room with seats and an end, and no moves of anybody's", () => {
    const s = table();
    expect(flightRoom.view(s, 1)).toEqual({ live: true, stream: true, game: "skyfire", seats: 2, seat: 1, over: false, result: null });
    expect(JSON.stringify(flightRoom.view(s, 0))).not.toContain(s.key);
    expect(flightRoom.summary!(s)).toMatchObject({ over: false, stage: "In the air" });
    expect(() => flightRoom.act(s, 0, { type: "fire" } as never, { at: 1, elapsed: 1 })).toThrow();
    // Nobody at the table can end it: only whoever has the key.
    const result = { score: 1234, stage: "Wave 3", scores: [1000, 234], ticks: 600 };
    expect(() => flightRoom.act(s, 0, { type: "end", key: "guess", result }, { at: 1, elapsed: 1 })).toThrow();
    const beat = flightRoom.deadline!(s, { settings: null, seats: [] })!;
    expect(beat).toMatchObject({ after: FLIGHT_BEAT_MS });
    expect(beat.move()).toEqual({ type: "beat" });
    const waited = flightRoom.act(s, 0, { type: "beat" }, { at: 1, elapsed: 2000 });
    expect(waited).toMatchObject({ waited: 2000, result: null });
    const ended = flightRoom.act(waited, 0, { type: "end", key: s.key, result: { ...result, score: -5, scores: [1.5] } as never }, { at: 2, elapsed: 1 });
    expect(ended.result).toEqual({ score: 0, stage: "Wave 3", scores: [0, 0], ticks: 600 });
    expect(flightRoom.finished!(ended)).toBe(true);
    expect(flightRoom.deadline!(ended, { settings: null, seats: [] })).toBeNull();
    // A game the server lost is given up on in the end.
    expect(flightRoom.act(s, 0, { type: "beat" }, { at: 1, elapsed: 3 * 60 * 60 * 1000 }).result).toMatchObject({ score: 0 });
    // And it is one of the table's games.
    expect(tableRoom.info!({ game: "skyfire", rules: game.presets[0] as never, seats: 2 })).toEqual({ game: "skyfire", rules: game.presets[0]!.name });
    expect(tableRoom.summary!(tableRoom.setup({ game: "skyfire", rules: game.presets[0] as never, seats: 3 }, 1))).toMatchObject({ game: "skyfire", over: false });
  });

  it("plays the same game on every page, from the controls alone", () => {
    const flights = createFlights();
    const s = table(2);
    flights.start("t1", s, people(2));
    expect(flights.join("nowhere", 0, page())).toBeNull();
    const a = page();
    const b = page();
    const flyA = flights.join("t1", 0, a)!;
    const flyB = flights.join("t1", 1, b)!;
    expect(a.heard.seat).toBe(0);
    flights.advance("t1", 30);
    flyA.input({ dx: 40, dy: 0, fire: true, bomb: false });
    flights.advance("t1", 45);
    flyB.input({ dx: -40, dy: -20, fire: true });
    flyA.input({ dx: 0, dy: 30, fire: true });
    flights.advance("t1", 200);
    flyB.input("nonsense");
    flights.advance("t1", 100);
    expect(a.tick).toBe(375);
    expect(a.state).toEqual(b.state);
    // Someone who comes late, or only to watch, is on the same game from where it stands.
    const late = page();
    const watching = flights.join("t1", null, late)!;
    expect(late.tick).toBe(375);
    watching.input({ dx: 40, dy: 0, fire: true });
    flights.advance("t1", 120);
    expect(late.state).toEqual(a.state);
    expect(late.heard.seat).toBeNull();
    // A page that leaves lets go of its controls, and hears no more.
    const heard = b.heard.messages;
    flyB.leave();
    flights.advance("t1", 60);
    expect(b.heard.messages).toBe(heard);
    expect(a.state).toEqual(late.state);
    flights.close();
  });

  it("flies the computer players itself, to the end, and leaves the result for the room", () => {
    const flights = createFlights();
    const s = table(2, 4);
    flights.start("t2", s, [{ name: "P0", bot: false }, { name: "Hank", bot: true }]);
    const a = page();
    flights.join("t2", 0, a);
    for (let i = 0; i < 4000 && !a.heard.over; i++) flights.advance("t2", 60);
    expect(a.heard.over).toBe(true);
    expect(game.view(a.state as never).over).toBe(true);
    const sum = game.summary(a.state as never);
    // The computer player flew: it scored, with nobody at its controls.
    expect(sum.scores[1]).toBeGreaterThan(0);
    // The room's next beat carries the result, and only the room's.
    const move = flightRoom.deadline!(s, { settings: null, seats: [] })!.move()!;
    expect(move).toMatchObject({ type: "end", key: s.key, result: { score: sum.score, scores: sum.scores, ticks: sum.ticks } });
    expect(flightRoom.act(s, 0, move, { at: 5, elapsed: 2000 }).result).toMatchObject({ score: sum.score });
    // Nothing more is played once it is over.
    const tick = a.tick;
    flights.advance("t2", 60);
    expect(a.tick).toBe(tick);
    flights.close();
  }, 120_000);
});

describe("a flown table on the server", () => {
  let open: ReturnType<typeof createCardRoom>[] = [];
  afterEach(() => {
    open.forEach((c) => c.close());
    open = [];
  });
  it("starts flying when its room starts, and seats whoever holds a seat", async () => {
    const flights = createFlights();
    const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 5, talk: false, flights });
    open.push(app);
    const phone = () => {
      let cookie = "";
      const call = async (path: string, body?: unknown) => {
        const response = (await app.fetch(new Request("http://test" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
        const set = response.headers.get("set-cookie");
        if (set) cookie = set.split(";")[0]!;
        return { status: response.status, body: await response.json() };
      };
      return Object.assign(call, { player: () => decodeURIComponent(cookie.split("=")[1] ?? "") });
    };
    const a = phone();
    const b = phone();
    const id = (await a("/rooms", { options: { game: "skyfire", rules: game.presets[0], seats: 2 } })).body.id as string;
    await a(`/rooms/${id}/sit`, { seat: 0, name: "McMikey" });
    expect(await app.fly(id, a.player(), page())).toBeNull();
    await b(`/rooms/${id}/sit`, { seat: 1, name: "Dubs" });
    expect((await a(`/rooms/${id}/start`, {})).status).toBe(200);
    const mine = page();
    const theirs = page();
    const stranger = page();
    expect(await app.fly(id, a.player(), mine)).not.toBeNull();
    const flying = (await app.fly(id, b.player(), theirs))!;
    await app.fly(id, "somebody-else", stranger);
    expect([mine.heard.seat, theirs.heard.seat, stranger.heard.seat]).toEqual([0, 1, null]);
    flying.input({ dx: 30, dy: 0, fire: true });
    flights.advance(id, 90);
    expect(mine.tick).toBe(90);
    expect(mine.state).toEqual(theirs.state);
    // Nobody can fly, or end the game, through the room.
    expect((await a(`/rooms/${id}/act`, { move: { type: "end", key: "x", result: { score: 9 } } })).status).not.toBe(200);
    expect((await a(`/rooms/${id}`)).body.summary).toMatchObject({ game: "skyfire", over: false });
  });
});
