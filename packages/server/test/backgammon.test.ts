// Backgammon in the card room: a house table with house rules (a match with the cube) played to
// the end by a person against a computer player, with dice thrown by the server; the leaderboard;
// a tournament match, where a win is a win whatever it was won for; and what someone watching is
// shown: the board, the dice and the cube, and nothing to press.
import { movesOffered, type BoardView } from "@journey-to-code/games";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

function setup() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false });
  open.push(app);
  const phone = () => {
    let cookie = "";
    return async (path: string, body?: unknown) => {
      const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return { status: r.status, body: await r.json() };
    };
  };
  const view = async (id: string, seat: number | "watch") => (await app.rooms.sync.documents()).get("views", `${id}/${seat}`)?.view as BoardView | undefined;
  return { app, phone, view };
}
type Kit = ReturnType<typeof setup>;
type Send = ReturnType<Kit["phone"]>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A person playing only from their view: roll, take any double, double once when they can, and
 * otherwise the first move the board offers. Says what kinds of move they made.
 */
async function playOut(send: Send, view: Kit["view"], id: string, seat: number, made = new Set<string>()) {
  let doubled = false;
  for (let i = 0; i < 20000; i++) {
    const v = await view(id, seat);
    if (v?.over) return { end: v, made };
    const offered = v ? movesOffered(v) : [];
    const pick = (type: string) => offered.find((m) => m.type === type);
    const move = pick("take") ?? (doubled ? undefined : pick("double")) ?? pick("roll") ?? pick("next") ?? pick("move") ?? offered[0];
    if (move) {
      if (move.type === "double") doubled = true;
      made.add(String(move.type));
      const r = await send(`/rooms/${id}/act`, { move });
      expect(r.status, JSON.stringify([move, r.body])).toBe(200);
    } else await sleep(1);
  }
  throw new Error("the game didn't finish");
}

describe("Backgammon in the card room", () => {
  it("a house table with house rules: a match with the cube against a computer player, to the end, on the leaderboard", async () => {
    const { phone, view } = setup();
    const grammi = phone();
    const made = (await grammi("/houses", { name: "Grammi's House", you: "brokennil" })).body;
    expect(made.kitRules.backgammon.presets.map((p: { id: string }) => p.id)).toEqual(["backgammon-friendly", "backgammon-money", "backgammon-match3", "backgammon-match5", "backgammon-match7", "backgammon-nack"]);
    // House rules: a match to 3. The Jacoby rule belongs to single games, so it doesn't stick to a match.
    const saved = await grammi("/houses/grammis-house/presets", { game: "backgammon", preset: { ...made.kitRules.backgammon.presets[2], id: "", name: "Grammi's match", jacoby: true }, makeDefault: true });
    expect(saved.status).toBe(200);
    expect(saved.body.kitRules.backgammon.presets.at(-1)).toMatchObject({ name: "Grammi's match", match: 3, cube: true, crawford: true, jacoby: false });

    const { id } = (await grammi("/houses/grammis-house/tables", { game: "backgammon" })).body;
    expect((await grammi(`/rooms/${id}`)).body.info).toEqual({ game: "backgammon", rules: "Grammi's match" });
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "brokennil" });
    await grammi(`/rooms/${id}/bot`, { seat: 1, name: "Hank" });
    await grammi(`/rooms/${id}/start`, {});

    // Her view: the board as a track of points, the cube in the middle, a die each to roll.
    const first = (await view(id, 0))!;
    expect(first.grids[0]).toMatchObject({ rows: 2, cols: 14, flip: false, track: { kind: "points" } });
    expect(first.cube).toEqual({ value: 1, owner: null, offered: null, dead: false });
    expect(first.phase).toBe("opening");
    // The server refuses what the rules refuse: no moving before the dice are thrown, no doubling out of turn.
    expect((await grammi(`/rooms/${id}/act`, { move: { type: "move", from: 0, to: 1 } })).status).not.toBe(200);
    expect((await grammi(`/rooms/${id}/act`, { move: { type: "double" } })).status).not.toBe(200);

    const { end, made: kinds } = await playOut(grammi, view, id, 0);
    expect([...kinds]).toEqual(expect.arrayContaining(["roll", "move"]));
    expect(end.over!.winners).toHaveLength(1);
    const scores = end.scores.map((s) => s.value);
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(3);
    expect(scores[end.over!.winners[0]!]).toBe(Math.max(...scores));
    // The dice were dice, thrown by the server.
    expect(end.dice!.dice.every((d) => Number.isInteger(d.value) && d.value! >= 1 && d.value! <= 6)).toBe(true);
    const summary = (await grammi(`/rooms/${id}`)).body.summary;
    expect(summary).toMatchObject({ game: "backgammon", over: true, teams: false, seats: 2, scoreLine: `${scores[0]} to ${scores[1]}` });
    const board = (await grammi("/houses/grammis-house/leaderboard?game=backgammon")).body;
    expect(board).toMatchObject({ game: "backgammon", games: 1 });
    expect(board.players[0]).toMatchObject({ name: "brokennil", played: 1, won: end.over!.winners[0] === 0 ? 1 : 0 });
  }, 120_000);

  it("a tournament match: the winner goes through, whatever the points", async () => {
    const { phone, view } = setup();
    const grammi = phone();
    const house = (await grammi("/houses", { name: "Grammi's House", you: "brokennil" })).body;
    const rick = phone();
    await rick("/houses/grammis-house/join", { code: house.code, name: "Rick" });
    // The house plays its tournaments for money: a win there can be 1 point or 4.
    await grammi("/houses/grammis-house/presets", { game: "backgammon", preset: { ...house.kitRules.backgammon.presets[1], id: "", name: "Cube on" }, makeDefault: true });
    const t = (await grammi("/houses/grammis-house/tournaments", { name: "Backgammon Cup", game: "backgammon" })).body;
    const at = `/houses/grammis-house/tournaments/${t.id}`;
    await grammi(`${at}/enter`, {});
    await rick(`${at}/enter`, {});
    const started = (await grammi(`${at}/start`, {})).body;
    const match = started.rounds[0].matches[0];
    const room = (await grammi(`/rooms/${match.table}`)).body;
    expect(room.seats.map((s: { name: string }) => s.name).sort()).toEqual(["Rick", "brokennil"]);
    await grammi(`/rooms/${match.table}/start`, {});
    const seatOf = (name: string) => room.seats.findIndex((s: { name: string }) => s.name === name);
    const [{ end }] = await Promise.all([playOut(grammi, view, match.table, seatOf("brokennil")), playOut(rick, view, match.table, seatOf("Rick"))]);
    expect(end.over!.winners).toHaveLength(1);
    let done: any;
    for (let i = 0; i < 200 && done?.status !== "finished"; i++) {
      await sleep(5);
      done = (await grammi(at)).body;
    }
    expect(done.status).toBe("finished");
    const summary = (await grammi(`/rooms/${match.table}`)).body.summary;
    // One winner, first in the order, however many points the game was worth.
    expect(summary.winners).toEqual([end.over!.winners[0]]);
    expect(summary.order[0]).toBe(end.over!.winners[0]);
    expect(done.entrants[done.champion].name).toBe(room.seats[end.over!.winners[0]!].name);
  }, 120_000);
});

describe("watching Backgammon", () => {
  it("a watcher sees the board, the dice and the cube, and nothing to press", async () => {
    const { phone, view } = setup();
    const [grammi, pappy] = [phone(), phone()];
    const { id } = (await grammi("/rooms", { options: { game: "backgammon", rules: { id: "backgammon-money" }, seats: 2 } })).body;
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "Grammi" });
    await pappy(`/rooms/${id}/sit`, { seat: 1, name: "Pappy" });
    expect((await grammi(`/rooms/${id}/start`, {})).status).toBe(200);
    const sends = [grammi, pappy];
    // The opening roll, until it isn't a tie.
    for (let i = 0; i < 40 && (await view(id, 0))!.phase === "opening"; i++) for (const send of sends) await send(`/rooms/${id}/act`, { move: { type: "roll" } });
    const moving = (await view(id, 0))!;
    expect(moving.phase).toBe("move");
    const mover = moving.turn!;
    const watch = (await view(id, "watch"))!;
    // The same board, checker for checker, from the first seat's side; the dice that were thrown, one each.
    expect(watch.grids[0]!.cells).toEqual(moving.grids[0]!.cells);
    expect(watch.grids[0]!.track).toEqual(moving.grids[0]!.track);
    expect(watch.grids[0]!.select).toBeNull();
    expect(watch.dice).toMatchObject(moving.dice!);
    expect(watch.dice!.dice.map((d) => d.owner)).toEqual([0, 1]);
    expect(watch.cube).toEqual({ value: 1, owner: null, offered: null, dead: false });
    expect(watch.choices).toBeNull();
    expect(movesOffered(watch)).toEqual([]);
    expect([watch.turn, watch.narration, watch.players]).toEqual([moving.turn, moving.narration, moving.players]);

    // Only the mover's own view has anything to pick up. They play their dice; then the other doubles.
    expect(movesOffered((await view(id, 1 - mover))!)).toEqual([]);
    for (let i = 0; i < 4 && (await view(id, mover))!.phase === "move"; i++) {
      const step = movesOffered((await view(id, mover))!).find((m) => m.type === "move")!;
      expect((await sends[mover]!(`/rooms/${id}/act`, { move: step })).status).toBe(200);
    }
    expect((await view(id, "watch"))!.dice!.dice.every((d) => d.used)).toBe(true);
    expect((await sends[1 - mover]!(`/rooms/${id}/act`, { move: { type: "double" } })).status).toBe(200);
    const offered = (await view(id, "watch"))!;
    expect(offered.cube).toEqual({ value: 1, owner: null, offered: 1 - mover, dead: false });
    expect(offered.turn).toBe(mover);
    expect(movesOffered(offered)).toEqual([]);
    expect((await sends[mover]!(`/rooms/${id}/act`, { move: { type: "take" } })).status).toBe(200);
    expect((await view(id, "watch"))!.cube).toEqual({ value: 2, owner: mover, offered: null, dead: false });
    // Each seat is sent its own view: the second seat's board is turned over, the watcher's isn't.
    expect([(await view(id, 0))!.grids[0]!.flip, (await view(id, 1))!.grids[0]!.flip, !!(await view(id, "watch"))!.grids[0]!.flip]).toEqual([false, "rows", false]);
  });
});
