// Chess in the card room, through the room: a house table played to mate and onto the leaderboard,
// what a watcher sees, a tournament match, and the chess clock kept by the server (the increment,
// an offer made while it runs, a restart in the middle of a game, a flag falling, and a computer
// player held to it like anyone). On a fake clock.
import { type BoardView } from "@journey-to-code/games";
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
const roomOf = async (send: Phone, id: string) => (await send(`/rooms/${id}`)).body;
const cell = (name: string) => (8 - Number(name[1])) * 8 + name.charCodeAt(0) - 97;
/** "e2e4" as the move the table sends. */
const mv = (squares: string) => ({ type: "move", from: cell(squares.slice(0, 2)), to: cell(squares.slice(2, 4)) });
const clocks = async (app: App, id: string) => (await viewOf(app, id, 0)).players.map((p) => p.clock);

/** Grammi's House, with Rick in it. */
async function house(phone: ReturnType<typeof setup>["phone"]) {
  const grammi = phone();
  const rick = phone();
  const made = (await grammi("/houses", { name: "Grammi's House", you: "brokennil" })).body;
  await rick("/houses/grammis-house/join", { code: made.code, name: "Rick" });
  return { grammi, rick, made };
}
/** A house table for two people, Grammi in seat 0 with White, from the preset with this id. */
async function houseTable(grammi: Phone, rick: Phone, presetId = "chess-classic") {
  const presets = (await grammi("/houses/grammis-house")).body.kitRules.chess.presets as { id: string }[];
  const saved = await grammi("/houses/grammis-house/presets", { game: "chess", preset: { ...presets.find((p) => p.id === presetId), id: "", name: "Grammi is White", white: "seat1" }, makeDefault: true });
  expect(saved.status).toBe(200);
  const { id } = (await grammi("/houses/grammis-house/tables", { game: "chess" })).body;
  await grammi(`/rooms/${id}/sit`, { seat: 0, name: "brokennil" });
  await rick(`/rooms/${id}/sit`, { seat: 1, name: "Rick" });
  expect((await grammi(`/rooms/${id}/start`, {})).status).toBe(200);
  return id as string;
}

describe("Chess at a family table", () => {
  it("a house table played to checkmate, onto the leaderboard, with a watcher looking on", async () => {
    const { app, phone } = setup();
    const { grammi, rick, made } = await house(phone);
    expect(made.kitRules.chess.presets.map((p: { id: string }) => p.id)).toEqual(["chess-classic", "chess-960", "chess-bullet", "chess-blitz", "chess-blitz5", "chess-rapid", "chess-rapid15", "chess-correspondence"]);
    const id = await houseTable(grammi, rick);
    expect((await roomOf(grammi, id)).info).toEqual({ game: "chess", rules: "Grammi is White" });
    expect((await viewOf(app, id, 0)).turn).toBe(0);
    // Rick can't move White's pieces, or out of turn.
    expect((await act(rick, id, mv("e7e5"))).body.error).toMatch(/not your turn/);
    expect((await act(grammi, id, mv("e7e5"))).body.error).toMatch(/not your piece/);
    for (const [who, move] of [[grammi, "f2f3"], [rick, "e7e5"], [grammi, "g2g4"]] as [Phone, string][]) expect((await act(who, id, mv(move))).status).toBe(200);

    // Someone watching sees the board, the moves so far and the last move, and nothing to play.
    const watching = await viewOf(app, id, "watch");
    expect(watching.record!.moves.map((m) => m.label)).toEqual(["f3", "e5", "g4"]);
    expect(watching.grids[0]!.cells[cell("g4")]).toMatchObject({ kind: "pawn", label: "white pawn" });
    expect(watching.grids[0]!.marks).toEqual([{ cell: cell("g2"), mark: "from" }, { cell: cell("g4"), mark: "last" }]);
    expect(watching.grids[0]!.select ?? null).toBeNull();
    expect(watching.offers).toMatchObject({ can: [], answer: false });
    // Each player is shown the board from their own side; only the one to move is offered moves.
    expect([(await viewOf(app, id, 0)).grids[0]!.flip, (await viewOf(app, id, 1)).grids[0]!.flip]).toEqual([false, true]);
    expect((await viewOf(app, id, 0)).grids[0]!.select).toBeNull();

    expect((await act(rick, id, mv("d8h4"))).status).toBe(200);
    expect((await roomOf(grammi, id)).summary).toMatchObject({ game: "chess", over: true, winners: [1], order: [1, 0], scoreLine: "0 to 1" });
    const over = await viewOf(app, id, 0);
    expect(over.narration).toBe("Checkmate (Qh4#): {1} wins!");
    expect(over.record!.export!.text).toContain("1. f3 e5 2. g4 Qh4# 0-1");
    expect((await viewOf(app, id, "watch")).over).toEqual({ winners: [1], title: "{1} wins!" });
    const board = (await grammi("/houses/grammis-house/leaderboard?game=chess")).body;
    expect(board).toMatchObject({ game: "chess", games: 1 });
    expect(Object.fromEntries(board.players.map((p: { name: string; played: number; won: number }) => [p.name, [p.played, p.won]]))).toEqual({ brokennil: [1, 0], Rick: [1, 1] });
  });

  it("a tournament match: no taking back, and mate sends the winner through", async () => {
    const { app, phone } = setup();
    const { grammi, rick } = await house(phone);
    const t = (await grammi("/houses/grammis-house/tournaments", { name: "The Cup", game: "chess" })).body;
    const at = `/houses/grammis-house/tournaments/${t.id}`;
    await grammi(`${at}/enter`, {});
    await rick(`${at}/enter`, {});
    const table = (await grammi(`${at}/start`, {})).body.rounds[0].matches[0].table as string;
    const room = await roomOf(grammi, table);
    const seats = room.seats.map((s: { name: string }) => (s.name === "Rick" ? rick : grammi)) as Phone[];
    await grammi(`/rooms/${table}/start`, {});
    // Whoever drew White opens; a move can't be had back in a match that counts.
    const white = (await viewOf(app, table, 0)).turn!;
    const sides = [seats[white]!, seats[1 - white]!];
    await act(sides[0]!, table, mv("f2f3"));
    expect((await viewOf(app, table, white)).offers!.can).toEqual(["resign", "draw"]);
    expect((await act(sides[0]!, table, { type: "offer", offer: "takeback" })).body.error).toMatch(/switched off at this table/);
    for (const [i, move] of ["e7e5", "g2g4", "d8h4"].entries()) expect((await act(sides[(i + 1) % 2]!, table, mv(move))).status).toBe(200);
    expect((await roomOf(grammi, table)).summary).toMatchObject({ over: true, winners: [1 - white] });
    await pass(50);
    const done = (await grammi(at)).body;
    expect(done.status).toBe("finished");
    expect(done.entrants[done.champion].name).toBe(room.seats[1 - white].name);
  });
});

describe("the chess clock, kept by the server", () => {
  it("starts with White's first move, takes each move's time off the mover and adds the increment", async () => {
    const { app, phone } = setup();
    const { grammi, rick } = await house(phone);
    const id = await houseTable(grammi, rick, "chess-blitz");
    // Nothing runs before White has moved, however long that takes.
    expect((await roomOf(grammi, id)).deadline ?? null).toBeNull();
    expect(await clocks(app, id)).toEqual([{ ms: 180_000, running: false }, { ms: 180_000, running: false }]);
    await pass(45_000);
    expect(await movesOf(app, id)).toHaveLength(0);
    await act(grammi, id, mv("e2e4"));
    // Black's clock is running: three minutes from now, and the room says when the move was made.
    expect(await roomOf(grammi, id)).toMatchObject({ deadline: { at: Date.now() + 180_000, seat: 1 }, moved: Date.now() });
    expect(await clocks(app, id)).toEqual([{ ms: 182_000, running: false }, { ms: 180_000, running: true }]);
    await pass(10_000);
    await act(rick, id, mv("e7e5"));
    expect(await clocks(app, id)).toEqual([{ ms: 182_000, running: true }, { ms: 172_000, running: false }]);
    expect((await roomOf(grammi, id)).deadline).toEqual({ at: Date.now() + 182_000, seat: 0 });
    await pass(2_500);
    await act(grammi, id, mv("g1f3"));
    expect(await clocks(app, id)).toEqual([{ ms: 181_500, running: false }, { ms: 172_000, running: true }]);
  });

  it("isn't stretched by an offer made while it runs", async () => {
    const { app, phone } = setup();
    const { grammi, rick } = await house(phone);
    const id = await houseTable(grammi, rick, "chess-blitz");
    await act(grammi, id, mv("e2e4"));
    await act(rick, id, mv("e7e5"));
    const flag = Date.now() + 182_000;
    expect((await roomOf(grammi, id)).deadline).toEqual({ at: flag, seat: 0 });
    // Grammi, on the move, offers a draw after four seconds; Rick thinks about it for three.
    await pass(4000);
    expect((await act(grammi, id, { type: "offer", offer: "draw" })).status).toBe(200);
    expect((await roomOf(grammi, id)).deadline).toEqual({ at: flag, seat: 0 });
    // The clock at her seat counts from the offer (the room's last move), with what had gone already taken off.
    expect(await roomOf(grammi, id)).toMatchObject({ moved: Date.now() });
    expect((await clocks(app, id))[0]).toEqual({ ms: 178_000, running: true });
    await pass(3000);
    expect((await act(rick, id, { type: "decline" })).status).toBe(200);
    expect((await roomOf(grammi, id)).deadline).toEqual({ at: flag, seat: 0 });
    expect((await clocks(app, id))[0]).toEqual({ ms: 175_000, running: true });
    await pass(1000);
    await act(grammi, id, mv("g1f3"));
    // Eight seconds in all came off, and the two-second increment went on.
    expect(await clocks(app, id)).toEqual([{ ms: 176_000, running: false }, { ms: 182_000, running: true }]);
  });

  it("survives a restart mid-game exactly, and a flag that falls loses", async () => {
    const first = setup();
    const { grammi, rick } = await house(first.phone);
    const id = await houseTable(grammi, rick, "chess-blitz");
    await pass(5000);
    await act(grammi, id, mv("e2e4"));
    await pass(20_000);
    await act(rick, id, mv("e7e5"));
    await pass(30_000);
    await act(grammi, id, mv("g1f3"));
    const moved = Date.now();
    const before = { clocks: await clocks(first.app, id), room: await roomOf(grammi, id) };
    expect(before.clocks).toEqual([{ ms: 154_000, running: false }, { ms: 162_000, running: true }]);
    expect(before.room).toMatchObject({ deadline: { at: moved + 162_000, seat: 1 }, moved });
    // The server goes away for a minute of Rick's time.
    await pass(60_000);
    first.app.close();
    const second = setup(first.log);
    await second.app.rooms.restored;
    const again = second.phone(grammi.cookie());
    const rickAgain = second.phone(rick.cookie());
    // Replayed from the move log and its times: the same banks, the same flag time, counted from the same move.
    expect(await clocks(second.app, id)).toEqual(before.clocks);
    expect(await roomOf(again, id)).toMatchObject({ deadline: { at: moved + 162_000, seat: 1 }, moved });
    // Rick moves with 42 seconds on his clock left to show for it.
    await pass(60_000);
    expect((await act(rickAgain, id, mv("b8c6"))).status).toBe(200);
    expect(await clocks(second.app, id)).toEqual([{ ms: 154_000, running: true }, { ms: 44_000, running: false }]);
    // Grammi lets hers run out. The flag falls at the time, and the server makes the move a moment later.
    await pass(154_000 + GAME_CLOCK_GRACE_MS - 1);
    expect(await movesOf(second.app, id)).toHaveLength(4);
    await pass(1);
    expect((await movesOf(second.app, id)).at(-1)).toMatchObject({ seat: 0, move: { type: "timeout" } });
    expect((await roomOf(again, id)).summary).toMatchObject({ over: true, winners: [1] });
    expect((await viewOf(second.app, id, 0)).narration).toBe("{0} ran out of time: {1} wins!");
    expect(await clocks(second.app, id)).toEqual([{ ms: 0, running: false }, { ms: 44_000, running: false }]);
    expect((await roomOf(again, id)).deadline ?? null).toBeNull();
    const board = (await again("/houses/grammis-house/leaderboard?game=chess")).body;
    expect(Object.fromEntries(board.players.map((p: { name: string; played: number; won: number }) => [p.name, [p.played, p.won]]))).toEqual({ brokennil: [1, 0], Rick: [1, 1] });
  });

  it("a move that arrives in the moment after the flag is still a move; running out against a bare king is a draw", async () => {
    const { app, phone } = setup();
    const { grammi, rick } = await house(phone);
    const id = await houseTable(grammi, rick, "chess-bullet");
    await act(grammi, id, mv("e2e4"));
    await pass(60_000 + GAME_CLOCK_GRACE_MS - 50);
    expect((await act(rick, id, mv("e7e5"))).status).toBe(200);
    expect(await clocks(app, id)).toEqual([{ ms: 60_000, running: true }, { ms: 0, running: false }]);
    // With nothing left, his next move has to come at once: the flag falls as soon as it is his turn.
    await act(grammi, id, mv("g1f3"));
    await pass(GAME_CLOCK_GRACE_MS);
    expect((await viewOf(app, id, 0)).narration).toBe("{1} ran out of time: {0} wins!");
  });

  it("holds a computer player to the clock too, and it moves inside its time", async () => {
    const { app, phone } = setup();
    const grammi = phone();
    const { id } = (await grammi("/rooms", { options: { game: "chess", rules: { id: "chess-bullet", white: "seat1" }, seats: 2 }, settings: { skill: "hard", pace: "natural" } })).body;
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    await grammi(`/rooms/${id}/bot`, { seat: 1, name: "Dot" });
    await grammi(`/rooms/${id}/start`, {});
    await act(grammi, id, mv("e2e4"));
    // The bot's seat has the clock on it, where a shot clock would leave a bot alone.
    expect((await roomOf(grammi, id)).deadline).toEqual({ at: Date.now() + 60_000, seat: 1 });
    await pass(3000);
    const played = await movesOf(app, id);
    expect(played).toHaveLength(2);
    expect(played[1]).toMatchObject({ seat: 1, move: { type: "move" } });
    const [mine, its] = await clocks(app, id);
    expect(mine).toEqual({ ms: 60_000, running: true });
    // It took a moment, and not a long one: a sixtieth of a minute's bank is a second.
    expect(its!.ms).toBeLessThan(60_000);
    expect(its!.ms).toBeGreaterThan(58_000);
    expect((await roomOf(grammi, id)).deadline).toMatchObject({ seat: 0 });
  });
});
