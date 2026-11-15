// Offers at a board in the card room (resign, a draw by agreement, a move taken back; see
// packages/games/src/offers.ts), through the room: the result reaches the leaderboard and a
// tournament bracket, a computer player answers, a watcher sees what happened and can't act, a
// tournament match has no taking back, and neither the turn timer nor a game's own clock is put
// off by an offer. On a fake clock.
import { SHOT_CLOCK_MS, type BoardView } from "@cardroom/games";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCardRoom } from "../src/app.js";
import { GAME_CLOCK_GRACE_MS } from "../src/kit.js";

const BASE = "http://test";
const T0 = Date.UTC(2026, 0, 1);
let open: ReturnType<typeof createCardRoom>[] = [];
beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
  vi.useRealTimers();
});
const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function setup(log = memoryLog({ keep: "latest" })) {
  const app = createCardRoom({ log, botDelay: 1, talk: false });
  open.push(app);
  const phone = (cookie = "") => {
    const send = async (path: string, body?: unknown) => {
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: r.status, body: await r.json() };
    };
    return Object.assign(send, { cookie: () => cookie });
  };
  return { app, phone, log };
}
type Phone = ReturnType<ReturnType<typeof setup>["phone"]>;
type App = ReturnType<typeof createCardRoom>;

const viewOf = async (app: App, id: string, seat: number | "watch") => (await app.rooms.sync.documents()).get("views", `${id}/${seat}`)?.view as BoardView;
const movesOf = async (app: App, id: string) => {
  const doc = (await app.rooms.sync.documents()).get("moves", id) ?? {};
  return Object.keys(doc)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => doc[k] as { seat: number; move: Record<string, unknown>; at: number });
};
const act = (send: Phone, id: string, move: unknown) => send(`/rooms/${id}/act`, { move });
const summaryOf = async (send: Phone, id: string) => (await send(`/rooms/${id}`)).body.summary;
const deadlineOf = async (send: Phone, id: string) => (await send(`/rooms/${id}`)).body.deadline ?? null;
const RESIGN = { type: "resign" };
const DRAW = { type: "offer", offer: "draw" };
const BACK = { type: "offer", offer: "takeback" };
const YES = { type: "accept" };
const NO = { type: "decline" };
/** The first move on the board a seat's view offers. */
function firstMove(v: BoardView): Record<string, unknown> {
  const g = v.grids[0]!;
  if (g.select?.sources.length) return { type: g.select.type, from: g.select.sources[0]!.from, to: g.select.sources[0]!.to[0] };
  if (g.tap?.by === "col") return { type: g.tap.type, col: g.tap.cells[0]! % g.cols };
  return { type: g.tap!.type, cell: g.tap!.cells[0] };
}

/** Grammi's House, with Rick in it. */
async function house(phone: ReturnType<typeof setup>["phone"]) {
  const grammi = phone();
  const rick = phone();
  const made = (await grammi("/houses", { name: "Grammi's House", you: "brokennil" })).body;
  await rick("/houses/grammis-house/join", { code: made.code, name: "Rick" });
  return { grammi, rick };
}
/** A house table for two people: Grammi in seat 0 (moving first), Rick in seat 1. */
async function houseTable(grammi: Phone, rick: Phone, game: string) {
  const preset = (await grammi("/houses/grammis-house")).body.kitRules[game].presets[0];
  await grammi("/houses/grammis-house/presets", { game, preset: { ...preset, id: "", name: "Grammi first", first: "seat1" }, makeDefault: true });
  const { id } = (await grammi("/houses/grammis-house/tables", { game })).body;
  await grammi(`/rooms/${id}/sit`, { seat: 0, name: "brokennil" });
  await rick(`/rooms/${id}/sit`, { seat: 1, name: "Rick" });
  expect((await grammi(`/rooms/${id}/start`, {})).status).toBe(200);
  return id as string;
}
const standings = async (send: Phone, game: string) => {
  const board = (await send(`/houses/grammis-house/leaderboard?game=${game}`)).body;
  return { games: board.games, ...Object.fromEntries(board.players.map((p: { name: string; played: number; won: number; last: number }) => [p.name, [p.played, p.won, p.last]])) };
};

describe("offers at a family table", () => {
  it("Checkers: a game resigned, a game drawn by agreement and a move taken back, each on the leaderboard as it should be", async () => {
    const { app, phone } = setup();
    const { grammi, rick } = await house(phone);

    // Resigned: Rick moves, then gives the game up on Grammi's turn. It's hers.
    const one = await houseTable(grammi, rick, "checkers");
    expect((await viewOf(app, one, 0)).offers).toEqual({ can: ["resign", "draw"], open: null, answer: false, last: null });
    expect((await act(grammi, one, firstMove(await viewOf(app, one, 0)))).status).toBe(200);
    expect((await act(rick, one, firstMove(await viewOf(app, one, 1)))).status).toBe(200);
    expect((await act(rick, one, RESIGN)).status).toBe(200);
    expect(await summaryOf(grammi, one)).toMatchObject({ game: "checkers", over: true, winners: [0], order: [0, 1] });
    expect((await viewOf(app, one, 1)).over).toEqual({ winners: [0], title: "{0} wins!" });
    expect((await viewOf(app, one, 1)).narration).toBe("{1} resigns: {0} wins!");
    // Nothing more can be done at a finished table.
    expect((await act(grammi, one, RESIGN)).status).not.toBe(200);
    expect(await standings(grammi, "checkers")).toEqual({ games: 1, brokennil: [1, 1, 0], Rick: [1, 0, 1] });

    // Drawn by agreement: both come out as winners, the way a drawn game on the board does.
    const two = await houseTable(grammi, rick, "checkers");
    await act(grammi, two, firstMove(await viewOf(app, two, 0)));
    expect((await act(grammi, two, DRAW)).status).toBe(200);
    expect((await viewOf(app, two, 1)).offers).toMatchObject({ open: { kind: "draw", by: 0 }, answer: true });
    expect((await viewOf(app, two, 0)).offers).toMatchObject({ open: { kind: "draw", by: 0 }, answer: false });
    // Only the player it was made to can answer it.
    expect((await act(grammi, two, YES)).body.error).toMatch(/to answer/);
    expect((await act(rick, two, YES)).status).toBe(200);
    expect(await summaryOf(grammi, two)).toMatchObject({ over: true, winners: [0, 1], scoreLine: "0 to 0 · 1 drawn" });
    expect((await viewOf(app, two, 0)).over).toEqual({ winners: [0, 1], title: "It's a draw!" });
    expect(await standings(grammi, "checkers")).toEqual({ games: 2, brokennil: [2, 2, 0], Rick: [2, 1, 1] });

    // A move taken back: the board is as it was, the game goes on, and nothing has reached the leaderboard.
    const three = await houseTable(grammi, rick, "checkers");
    const before = await viewOf(app, three, 0);
    await act(grammi, three, firstMove(before));
    expect((await viewOf(app, three, 0)).offers!.can).toEqual(["resign", "draw", "takeback"]);
    expect((await act(rick, three, BACK)).body.error).toMatch(/haven't made a move/);
    expect((await act(grammi, three, BACK)).status).toBe(200);
    expect((await viewOf(app, three, 1)).narration).toBe("{0} asks to take a move back");
    expect((await act(rick, three, YES)).status).toBe(200);
    const after = await viewOf(app, three, 0);
    expect(after.grids).toEqual(before.grids);
    expect(after.turn).toBe(0);
    expect(after.narration).toBe("{1} lets {0} take the move back");
    expect(await summaryOf(grammi, three)).toMatchObject({ over: false, winners: null });
    expect((await standings(grammi, "checkers")).games).toBe(2);
    expect((await movesOf(app, three)).map((m) => m.move.type)).toEqual(["move", "offer", "accept"]);
  });

  it("a computer player answers at once: yes to a move taken back, and to a draw only when it isn't ahead", async () => {
    const { app, phone } = setup();
    const grammi = phone();
    const { id } = (await grammi("/rooms", { options: { game: "tictactoe", rules: { id: "tictactoe-classic", first: "seat1" }, seats: 2 }, settings: { skill: "sharp", pace: "instant" } })).body;
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    await grammi(`/rooms/${id}/bot`, { seat: 1, name: "Dot" });
    await grammi(`/rooms/${id}/start`, {});
    const before = await viewOf(app, id, 0);
    // She takes a corner, and the computer answers it.
    await act(grammi, id, { type: "mark", cell: 0 });
    await pass(2000);
    expect((await viewOf(app, id, 0)).grids[0]!.cells.filter(Boolean)).toHaveLength(2);
    // She asks for her move back: the computer lets her, and its reply goes with it.
    expect((await act(grammi, id, BACK)).status).toBe(200);
    await pass(2000);
    const back = await viewOf(app, id, 0);
    expect(back.grids).toEqual(before.grids);
    expect(back.offers).toMatchObject({ open: null, last: { kind: "takeback", by: 0, outcome: "accepted" } });
    expect((await movesOf(app, id)).map((m) => [m.seat, m.move.type])).toEqual([[0, "mark"], [1, "mark"], [0, "offer"], [1, "accept"]]);
    // Played on to a level position, a draw is taken: the 3×3 game is known to the end.
    await act(grammi, id, { type: "mark", cell: 4 });
    await pass(2000);
    expect((await act(grammi, id, DRAW)).status).toBe(200);
    await pass(2000);
    expect(await summaryOf(grammi, id)).toMatchObject({ over: true, winners: [0, 1] });
    expect((await movesOf(app, id)).at(-1)).toMatchObject({ seat: 1, move: YES });
  });

  it("replays from the move log after a restart", async () => {
    const { app, phone, log } = setup();
    const grammi = phone();
    const rick = phone();
    const { id } = (await grammi("/rooms", { options: { game: "reversi", rules: { id: "reversi-classic", first: "seat1" }, seats: 2 } })).body;
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    await rick(`/rooms/${id}/sit`, { seat: 1, name: "Rick" });
    await grammi(`/rooms/${id}/start`, {});
    await act(grammi, id, firstMove(await viewOf(app, id, 0)));
    await pass(700);
    await act(rick, id, firstMove(await viewOf(app, id, 1)));
    await act(grammi, id, DRAW);
    await pass(300);
    await act(rick, id, NO);
    await act(rick, id, BACK);
    await pass(200);
    await act(grammi, id, YES);
    await act(rick, id, firstMove(await viewOf(app, id, 1)));
    await act(rick, id, BACK);
    const views = [await viewOf(app, id, 0), await viewOf(app, id, 1)];
    expect(views[0]!.offers).toMatchObject({ open: { kind: "takeback", by: 1 }, answer: true });
    app.close();

    const second = setup(log);
    const again = second.app;
    await again.rooms.restored;
    const back = second.phone(grammi.cookie());
    // The same table, offer and all: she can still answer it.
    expect((await act(back, id, NO)).status).toBe(200);
    await pass(50);
    const now = await viewOf(again, id, 0);
    expect(now.grids).toEqual(views[0]!.grids);
    expect(now.offers).toMatchObject({ open: null, last: { kind: "takeback", by: 1, outcome: "declined" } });
  });
});

describe("watching", () => {
  it("a watcher sees that an offer was made and how it came out, and has nothing to press", async () => {
    const { app, phone } = setup();
    const grammi = phone();
    const rick = phone();
    const jimmy = phone();
    const { id } = (await grammi("/rooms", { options: { game: "checkers", rules: { id: "checkers-american", first: "seat1" }, seats: 2 } })).body;
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    await rick(`/rooms/${id}/sit`, { seat: 1, name: "Rick" });
    await grammi(`/rooms/${id}/start`, {});
    await act(grammi, id, firstMove(await viewOf(app, id, 0)));
    expect((await viewOf(app, id, "watch")).offers).toEqual({ can: [], open: null, answer: false, last: null });

    await act(grammi, id, DRAW);
    const offered = await viewOf(app, id, "watch");
    expect(offered.offers).toEqual({ can: [], open: { kind: "draw", by: 0 }, answer: false, last: { kind: "draw", by: 0, outcome: "offered" } });
    expect(offered.narration).toBe("{0} offers a draw");
    // Someone without a seat can't answer it, or resign anybody's game.
    for (const move of [YES, NO, RESIGN, DRAW]) expect((await act(jimmy, id, move)).status).not.toBe(200);
    expect((await movesOf(app, id)).map((m) => m.move.type)).toEqual(["move", "offer"]);

    await act(rick, id, NO);
    const declined = await viewOf(app, id, "watch");
    expect(declined.offers).toEqual({ can: [], open: null, answer: false, last: { kind: "draw", by: 0, outcome: "declined" } });
    expect(declined.narration).toBe("{1} turns down the draw");

    await act(rick, id, RESIGN);
    const over = await viewOf(app, id, "watch");
    expect(over.offers).toEqual({ can: [], open: null, answer: false, last: { kind: "resign", by: 1, outcome: "accepted" } });
    expect(over.over).toEqual({ winners: [0], title: "{0} wins!" });
  });

  it("Combat: nothing of either fleet reaches a watcher or the other seat with an offer", async () => {
    const { app, phone } = setup();
    const grammi = phone();
    const rick = phone();
    const { id } = (await grammi("/rooms", { options: { game: "combat", rules: { id: "combat-quick", first: "seat1" }, seats: 2 } })).body;
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    await rick(`/rooms/${id}/sit`, { seat: 1, name: "Rick" });
    await grammi(`/rooms/${id}/start`, {});
    for (const send of [grammi, rick]) {
      await act(send, id, { type: "auto" });
      await act(send, id, { type: "ready" });
    }
    await act(grammi, id, { type: "shoot", cell: 0, grid: "theirs" });
    const before = [await viewOf(app, id, 0), await viewOf(app, id, 1), await viewOf(app, id, "watch")];
    // No taking back, whoever asks.
    for (const send of [grammi, rick]) expect((await act(send, id, BACK)).body.error).toMatch(/can't be taken back in Combat/);
    expect(before[0]!.offers!.can).toEqual(["resign", "draw"]);
    await act(rick, id, DRAW);
    const after = [await viewOf(app, id, 0), await viewOf(app, id, 1), await viewOf(app, id, "watch")];
    // All that changed for anyone is the offer and the line that says so.
    for (const [i, v] of after.entries()) expect({ ...v, offers: 0, narration: 0 }).toEqual({ ...before[i]!, offers: 0, narration: 0 });
    expect(JSON.stringify(after)).not.toContain("past");
  });
});

describe("a tournament match", () => {
  /** A two-entrant tournament, started: its one match's table, and who sits where. */
  async function cup(grammi: Phone, rick: Phone, game: string) {
    const t = (await grammi("/houses/grammis-house/tournaments", { name: "The Cup", game })).body;
    const at = `/houses/grammis-house/tournaments/${t.id}`;
    await grammi(`${at}/enter`, {});
    await rick(`${at}/enter`, {});
    const table = (await grammi(`${at}/start`, {})).body.rounds[0].matches[0].table as string;
    const room = (await grammi(`/rooms/${table}`)).body;
    const seats = room.seats.map((s: { name: string }) => (s.name === "Rick" ? rick : grammi)) as Phone[];
    await grammi(`/rooms/${table}/start`, {});
    return { at, table, seats, names: room.seats.map((s: { name: string }) => s.name) as string[] };
  }
  const champion = async (grammi: Phone, at: string) => {
    await pass(50);
    const t = (await grammi(at)).body;
    return t.status === "finished" ? (t.entrants[t.champion].name as string) : null;
  };

  it("has no taking back, and a resignation sends the other player through", async () => {
    const { app, phone } = setup();
    const { grammi, rick } = await house(phone);
    const { at, table, seats, names } = await cup(grammi, rick, "checkers");
    expect((await grammi(`/rooms/${table}`)).body.locked).toBe(true);
    // Whoever moves first moves; a move can't be taken back here, asked nicely or not.
    const mover = (await viewOf(app, table, 0)).turn!;
    await act(seats[mover]!, table, firstMove(await viewOf(app, table, mover)));
    expect((await viewOf(app, table, mover)).offers!.can).toEqual(["resign", "draw"]);
    expect((await act(seats[mover]!, table, BACK)).body.error).toMatch(/switched off at this table/);
    expect(await champion(grammi, at)).toBeNull();
    // The other player resigns: the mover is the champion.
    expect((await act(seats[1 - mover]!, table, RESIGN)).status).toBe(200);
    expect(await summaryOf(grammi, table)).toMatchObject({ over: true, winners: [mover], order: [mover, 1 - mover] });
    expect(await champion(grammi, at)).toBe(names[mover]);
  });

  it("a draw by agreement still sends someone through, as a drawn game on the board does", async () => {
    const { app, phone } = setup();
    const { grammi, rick } = await house(phone);
    const { at, table, seats, names } = await cup(grammi, rick, "tictactoe");
    const mover = (await viewOf(app, table, 0)).turn!;
    await act(seats[mover]!, table, firstMove(await viewOf(app, table, mover)));
    await act(seats[mover]!, table, DRAW);
    expect((await act(seats[1 - mover]!, table, YES)).status).toBe(200);
    const summary = await summaryOf(grammi, table);
    expect(summary).toMatchObject({ over: true, winners: [0, 1] });
    // The player who went second held the first player to a draw: that is who a drawn board sends on.
    expect(summary.order).toEqual([1 - mover, mover]);
    expect(await champion(grammi, at)).toBe(names[1 - mover]);
  });
});

describe("clocks", () => {
  const TIMED = { skill: "mixed", pace: "natural", timer: "15s" };
  async function table(grammi: Phone, rick: Phone, options: unknown, settings?: unknown) {
    const { id } = (await grammi("/rooms", { options, settings })).body;
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    await rick(`/rooms/${id}/sit`, { seat: 1, name: "Rick" });
    await grammi(`/rooms/${id}/start`, {});
    return id as string;
  }

  it("the turn timer isn't put off by an offer, and never answers one for you", async () => {
    const { app, phone } = setup();
    const grammi = phone();
    const rick = phone();
    const id = await table(grammi, rick, { game: "checkers", rules: { id: "checkers-american", first: "seat1" }, seats: 2 }, TIMED);
    const began = Date.now();
    expect(await deadlineOf(grammi, id)).toEqual({ at: began + 15_000, seat: 0 });
    // Four seconds in she offers a draw; five seconds after that Rick says no. Her clock hasn't moved.
    await pass(4000);
    await act(grammi, id, DRAW);
    expect(await deadlineOf(grammi, id)).toEqual({ at: began + 15_000, seat: 0 });
    await pass(5000);
    await act(rick, id, NO);
    expect(await deadlineOf(grammi, id)).toEqual({ at: began + 15_000, seat: 0 });
    // Rick offers one back and she walks away. When her time is up the computer plays a move on the
    // board for her, which is all it does: the offer is turned down by being played through.
    await pass(1000);
    await act(rick, id, DRAW);
    expect(await deadlineOf(grammi, id)).toEqual({ at: began + 15_000, seat: 0 });
    await pass(4999);
    expect(await movesOf(app, id)).toHaveLength(3);
    await pass(1);
    const moves = await movesOf(app, id);
    expect(moves.map((m) => [m.seat, m.move.type])).toEqual([[0, "offer"], [1, "decline"], [1, "offer"], [0, "move"]]);
    expect(moves.at(-1)!.at).toBe(began + 15_000);
    const view = await viewOf(app, id, 1);
    expect(view.offers).toMatchObject({ open: null, last: { kind: "draw", by: 1, outcome: "lapsed" } });
    expect(await summaryOf(grammi, id)).toMatchObject({ over: false });
    // Rick's own fifteen seconds start whole from her move.
    expect(await deadlineOf(grammi, id)).toEqual({ at: began + 30_000, seat: 1 });
  });

  it("Drop Four's shot clock can't be dodged with an offer", async () => {
    const { app, phone } = setup();
    const grammi = phone();
    const rick = phone();
    const id = await table(grammi, rick, { game: "dropfour", rules: { id: "dropfour-drinking", first: "seat1" }, seats: 2 });
    await act(grammi, id, { type: "drop", col: 3 });
    const dropped = Date.now();
    expect(await deadlineOf(rick, id)).toEqual({ at: dropped + SHOT_CLOCK_MS, seat: 1 });
    // No taking back against the clock.
    expect((await act(grammi, id, BACK)).body.error).toMatch(/switched off at this table/);
    // Two seconds in Rick offers a draw, and Grammi takes her time saying no. The three seconds are the same three.
    await pass(2000);
    expect((await act(rick, id, DRAW)).status).toBe(200);
    expect(await deadlineOf(rick, id)).toEqual({ at: dropped + SHOT_CLOCK_MS, seat: 1 });
    await pass(500);
    expect((await act(grammi, id, NO)).status).toBe(200);
    expect(await deadlineOf(rick, id)).toEqual({ at: dropped + SHOT_CLOCK_MS, seat: 1 });
    // He can't offer again to try it twice.
    expect((await act(rick, id, DRAW)).body.error).toMatch(/not again/);
    await pass(500 + GAME_CLOCK_GRACE_MS - 1);
    expect((await movesOf(app, id)).map((m) => m.move.type)).toEqual(["drop", "offer", "decline"]);
    await pass(1);
    expect((await movesOf(app, id)).at(-1)).toEqual({ seat: 1, move: { type: "timeout" }, at: dropped + SHOT_CLOCK_MS + GAME_CLOCK_GRACE_MS });
    expect((await viewOf(app, id, 0)).players.map((p) => p.line)).toEqual(["🍺 0", "🍺 1"]);
  });
});
