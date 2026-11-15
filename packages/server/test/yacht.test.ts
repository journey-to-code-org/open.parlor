// Yacht in the card room: dice thrown by the server, a table played to the end by a person against
// a computer player, what someone watching is shown (the dice and sheets that are public, never a
// seat's own dice when everyone rolls at once), and the turn timer playing for someone who has gone.
import { movesOffered, type BoardView } from "@cardroom/games";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCardRoom } from "../src/app.js";
import { watchView } from "../src/games.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
  vi.useRealTimers();
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Send = ReturnType<ReturnType<typeof setup>["phone"]>;

/** A table with people in the first `people` seats and computer players in the rest, started. */
async function table(sends: Send[], options: Record<string, unknown>, seats: number, settings?: unknown) {
  const { id } = (await sends[0]!("/rooms", { options: { game: "yacht", seats, ...options }, settings })).body;
  for (const [seat, send] of sends.entries()) await send(`/rooms/${id}/sit`, { seat, name: ["Grammi", "Pappy", "Jo"][seat] });
  for (let seat = sends.length; seat < seats; seat++) await sends[0]!(`/rooms/${id}/bot`, { seat, name: ["Hank", "Dot", "Vern", "Duke", "Lou"][seat - 1] });
  expect((await sends[0]!(`/rooms/${id}/start`, {})).status).toBe(200);
  return id as string;
}

describe("Yacht in the card room", () => {
  it("a table against a computer player, rolled, kept and scored to the end", async () => {
    const { phone, view } = setup();
    const grammi = phone();
    const id = await table([grammi], {}, 2);
    expect((await grammi(`/rooms/${id}`)).body.info).toEqual({ game: "yacht", rules: "Classic" });

    let rolled = 0;
    let kept = 0;
    let end: BoardView | undefined;
    for (let i = 0; i < 4000 && !end; i++) {
      const v = await view(id, 0);
      if (v?.over) end = v;
      const offered = v && !v.over ? movesOffered(v) : [];
      if (offered.length) {
        // Her dice are five dice with faces, thrown by the server; her sheet is hers to fill in.
        const values = v!.dice!.dice.map((d) => d.value);
        const roll = offered.find((m) => m.type === "roll");
        const pair = v!.dice!.dice.find((d, n) => !d.held && d.value !== null && values.indexOf(d.value) !== n && v!.dice!.tap?.dice.includes(d.id));
        // Keep a die that matches another, roll while she can, then take the best box on offer.
        const best = [...(v!.sheet!.pick?.cells ?? [])].sort((a, b) => Number(b.would) - Number(a.would))[0];
        const move = pair && kept < 40 ? { type: "hold", die: pair.id } : (roll ?? { type: "score", cell: v!.sheet!.columns[best!.column]!.id });
        if (move.type === "hold") kept++;
        if (move.type === "roll") rolled++;
        const r = await grammi(`/rooms/${id}/act`, { move });
        expect(r.status, JSON.stringify([move, r.body])).toBe(200);
        if (move.type === "roll") {
          const after = (await view(id, 0))!;
          expect(after.dice!.dice.every((d) => Number.isInteger(d.value) && d.value! >= 1 && d.value! <= 6)).toBe(true);
          // A fourth roll is refused by the server whatever the page sends.
          if (!movesOffered(after).some((m) => m.type === "roll") && after.turn === 0) expect((await grammi(`/rooms/${id}/act`, { move: { type: "roll" } })).status).not.toBe(200);
        }
      }
      await sleep(1);
    }
    expect(end, "the game didn't finish").toBeTruthy();
    expect(rolled).toBeGreaterThanOrEqual(13);
    expect(kept).toBeGreaterThan(0);
    // Every box on both sheets is filled in (the lines that are worked out can be empty: no extra Yachts, no bonus for them).
    expect(end!.sheet!.rows.every((r) => r.cells.every((c, i) => c !== "" || end!.sheet!.columns[i]!.kind === "sum"))).toBe(true);
    expect(end!.over!.winners.length).toBeGreaterThan(0);
    const summary = (await grammi(`/rooms/${id}`)).body.summary;
    expect(summary).toMatchObject({ game: "yacht", over: true, teams: false, seats: 2, hand: 13 });
    expect(summary.scoreLine).toBe(end!.sheet!.rows.map((r) => r.total).join(" · "));
  }, 60_000);

  it("one person alone at a table is a game", async () => {
    const { phone, view } = setup();
    const grammi = phone();
    const id = await table([grammi], { rules: { id: "yacht-quick" } }, 1);
    expect((await grammi(`/rooms/${id}`)).body.seats).toHaveLength(1);
    for (let i = 0; i < 100; i++) {
      const v = (await view(id, 0))!;
      if (v.over) break;
      // One roll and into the first box that's open.
      const moves = movesOffered(v);
      const move = moves.find((m) => m.type === "score") ?? moves[0]!;
      expect((await grammi(`/rooms/${id}/act`, { move })).status).toBe(200);
    }
    const end = (await view(id, 0))!;
    expect(end.over).toMatchObject({ winners: [0] });
    expect((await grammi(`/rooms/${id}`)).body.summary).toMatchObject({ over: true, hand: 7, scoreLine: `${end.sheet!.rows[0]!.total} points` });
  });
});

describe("watching Yacht", () => {
  it("in turn: a watcher sees the dice and every sheet, and nothing to press", async () => {
    const { phone, view } = setup();
    const [grammi, pappy] = [phone(), phone()];
    const id = await table([grammi, pappy], {}, 2);
    const turn = (await view(id, 0))!.turn!;
    const mover = [grammi, pappy][turn]!;
    await mover(`/rooms/${id}/act`, { move: { type: "roll" } });
    await mover(`/rooms/${id}/act`, { move: { type: "hold", die: 3 } });
    const seat = (await view(id, turn))!;
    const other = (await view(id, 1 - turn))!;
    const watch = (await view(id, "watch"))!;
    // The roller can keep dice and pick a box; the other player and the watcher see the same dice.
    expect(seat.dice!.tap).toEqual({ type: "hold", dice: [0, 1, 2, 3, 4] });
    expect(seat.sheet!.pick!.cells.length).toBe(13);
    expect(watch.dice!.dice).toEqual(seat.dice!.dice);
    expect(watch.dice!.dice[3]!.held).toBe(true);
    expect(watch.dice).toEqual(other.dice);
    expect(watch.dice!.tap).toBeNull();
    expect(watch.sheet!.pick).toBeNull();
    expect(watch.choices).toBeNull();
    expect(movesOffered(watch)).toEqual([]);
    expect(watch.sheet!.rows).toEqual(seat.sheet!.rows);
    expect(watch.sheet!.columns).toEqual(seat.sheet!.columns);
    expect([watch.turn, watch.narration, watch.players]).toEqual([seat.turn, seat.narration, seat.players]);

    // Scored: the watcher's sheet has it too.
    const cell = seat.sheet!.columns[seat.sheet!.pick!.cells[0]!.column]!.id;
    await mover(`/rooms/${id}/act`, { move: { type: "score", cell } });
    const after = (await view(id, "watch"))!;
    expect(after.sheet!.rows).toEqual((await view(id, 0))!.sheet!.rows);
    expect(after.sheet!.last).toMatchObject({ seat: turn });
  });

  it("everyone at once: a watcher sees what has been scored and nobody's dice", async () => {
    const { phone, view } = setup();
    const [grammi, pappy, jo] = [phone(), phone(), phone()];
    const id = await table([grammi, pappy, jo], { rules: { id: "yacht-classic", order: "together" } }, 3);
    for (const send of [grammi, pappy, jo]) expect((await send(`/rooms/${id}/act`, { move: { type: "roll" } })).status).toBe(200);
    const seats = [(await view(id, 0))!, (await view(id, 1))!, (await view(id, 2))!];
    // Each seat has its own dice…
    seats.forEach((v, seat) => {
      expect(v.dice).toMatchObject({ owner: seat, roll: 1 });
      expect(v.dice!.dice.every((d) => d.value !== null)).toBe(true);
      expect(v.turn).toBeNull();
    });
    // …and the watcher none at all: no values, no holds, not even how many times anyone has rolled.
    const watch = (await view(id, "watch"))!;
    expect(watch.dice).toBeNull();
    expect(JSON.stringify(watch)).not.toContain('"roll"');
    expect(watch.sheet!.pick).toBeNull();
    expect(movesOffered(watch)).toEqual([]);

    // One of them scores: that is public straight away, to the other seats and to the watcher.
    const cell = seats[1]!.sheet!.columns[seats[1]!.sheet!.pick!.cells[0]!.column]!.id;
    expect((await pappy(`/rooms/${id}/act`, { move: { type: "score", cell } })).status).toBe(200);
    const [mine, theirs, watching] = [(await view(id, 1))!, (await view(id, 0))!, (await view(id, "watch"))!];
    expect(watching.sheet!.rows).toEqual(mine.sheet!.rows);
    expect(theirs.sheet!.rows).toEqual(mine.sheet!.rows);
    expect(watching.sheet!.rows[1]!.cells.filter(Boolean).length).toBeGreaterThan(0);
    expect(watching.dice).toBeNull();
    expect(watching.players[1]!.badge).toBe("Scored");
    // A seat is never sent another seat's dice either.
    expect(theirs.dice!.dice.map((d) => d.value)).toEqual(seats[0]!.dice!.dice.map((d) => d.value));
  });

  it("never matches two seats' private dice up, even when they show the same faces", async () => {
    const { kitGame } = await import("@cardroom/games");
    const yacht = kitGame("yacht")! as unknown as { normalize(r: unknown): unknown; newGame(rules: unknown, seats: number, seed: number): { hands: { dice: number[]; rolls: number; throws: number }[] }; view(s: unknown, seat: number): BoardView };
    const s = yacht.newGame(yacht.normalize({ order: "together" }), 2, 3);
    // Both seats have rolled the very same dice: compared part by part, the two views would agree.
    for (const hand of s.hands) Object.assign(hand, { dice: [6, 6, 2, 3, 4], rolls: 1, throws: 1 });
    const views = [0, 1].map((seat) => yacht.view(s, seat));
    expect(views[0]!.dice!.dice).toEqual(views[1]!.dice!.dice);
    const watch = watchView("yacht", views) as BoardView;
    expect(watch.dice).toBeNull();
    expect(watch.sheet!.rows).toEqual(views[0]!.sheet!.rows);
  });
});

describe("the turn timer in Yacht", () => {
  it("plays the game's computer player for someone who has walked away, in turn and all at once", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
    for (const order of ["turns", "together"]) {
      const { app, phone } = setup();
      const grammi = phone();
      const id = await table([grammi], { rules: { id: "yacht-quick", order } }, 2, { timer: "15s" });
      for (let i = 0; i < 400 && !(await grammi(`/rooms/${id}`)).body.summary.over; i++) await vi.advanceTimersByTimeAsync(15_100);
      const done = (await grammi(`/rooms/${id}`)).body;
      expect(done.summary, order).toMatchObject({ over: true, hand: 7 });
      expect(done.deadline).toBeNull();
      // Every move in her seat was the timer's: rolls, dice kept, and a box each round.
      const doc = (await app.rooms.sync.documents()).get("moves", id) ?? {};
      const hers = Object.keys(doc).filter((k) => /^\d+$/.test(k)).map((k) => doc[k] as { seat: number; move: { type: string } }).filter((m) => m.seat === 0).map((m) => m.move.type);
      expect(hers.filter((t) => t === "score"), order).toHaveLength(7);
      expect(hers.filter((t) => t === "roll").length, order).toBeGreaterThanOrEqual(7);
    }
  }, 60_000);
});
