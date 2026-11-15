// Go in the parlor: a house table played to the end by a person against a computer player, the
// count agreed between them, a half-point result on the leaderboard, and what someone watching sees.
import { goPoint, movesOffered, type BoardView } from "@journey-to-code/games";
import { memoryLog } from "@zubra/sync/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCardRoom } from "../src/app.js";

const BASE = "http://test";
let open: ReturnType<typeof createCardRoom>[] = [];
afterEach(() => {
  open.forEach((c) => c.close());
  open = [];
});

function phone() {
  const app = createCardRoom({ log: memoryLog({ keep: "latest" }), botDelay: 1, talk: false });
  open.push(app);
  let cookie = "";
  const send = async (path: string, body?: unknown) => {
    const r = (await app.fetch(new Request(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined })))!;
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return { status: r.status, body: await r.json() };
  };
  const view = async (id: string, seat: number | "watch") => (await app.rooms.sync.documents()).get("views", `${id}/${seat}`)?.view as BoardView | undefined;
  return { send, view };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Go in the parlor", () => {
  it("a house table against a computer player: play, pass, agree the count, and the leaderboard", async () => {
    const { send: grammi, view } = phone();
    const made = (await grammi("/houses", { name: "Grammi's House", you: "brokennil" })).body;
    expect(made.kitRules.go.presets.map((p: { id: string }) => p.id)).toEqual(["go-small", "go-medium", "go-full", "go-japanese"]);
    // House rules: the small board, and Grammi takes Black.
    const saved = await grammi("/houses/grammis-house/presets", { game: "go", preset: { ...made.kitRules.go.presets[0], id: "", name: "Grammi takes Black", black: "seat1" }, makeDefault: true });
    expect(saved.status).toBe(200);

    const { id } = (await grammi("/houses/grammis-house/tables", { game: "go", seats: 4 })).body;
    const room = (await grammi(`/rooms/${id}`)).body;
    expect(room.info).toEqual({ game: "go", rules: "Grammi takes Black" });
    expect(room.seats).toHaveLength(2);
    await grammi(`/rooms/${id}/sit`, { seat: 0, name: "brokennil" });
    await grammi(`/rooms/${id}/bot`, { seat: 1, name: "Hank" });
    await grammi(`/rooms/${id}/start`, {});

    // An empty 9×9 board of crossings: she is Black, every crossing is hers to play, and there is a Pass button.
    const first = (await view(id, 0))!;
    expect(first.grids[0]).toMatchObject({ rows: 9, cols: 9, points: true, tap: { type: "place" } });
    expect(first.grids[0]!.tap!.cells).toHaveLength(81);
    expect(first.players[0]!.piece).toMatchObject({ kind: "stone", label: "black stone" });
    expect(first.choices!.options.map((o) => o.label)).toEqual(["Pass"]);
    // Someone watching sees the same board, and nothing to tap or press.
    const watching = (await view(id, "watch"))!;
    expect(watching.grids[0]).toMatchObject({ rows: 9, cols: 9, points: true, tap: null, select: null });
    expect(watching.grids[0]!.cells).toEqual(first.grids[0]!.cells);
    expect([watching.choices, watching.offers!.can]).toEqual([null, []]);

    // The server refuses a stone on a stone, and says why.
    expect((await grammi(`/rooms/${id}/act`, { move: { type: "place", cell: 40 } })).status).toBe(200);
    const refused = await grammi(`/rooms/${id}/act`, { move: { type: "place", cell: 40 } });
    expect(refused.status).not.toBe(200);

    // She plays a wall down the fifth column and then fills in behind it, column by column,
    // leaving herself two eyes in the corners (A9 and A1), wherever the computer lets her. With
    // nothing left on her list she passes, and goes on passing until the computer does too.
    const plan = [4, 13, 22, 31, 49, 58, 67, 76, ...[3, 2, 1, 0].flatMap((col) => Array.from({ length: 9 }, (_, row) => row * 9 + col))].filter((c) => c !== 0 && c !== 72);
    let counting: BoardView | undefined;
    for (let i = 0; i < 5000 && !counting; i++) {
      const v = (await view(id, 0))!;
      if (v.phase === "counting") counting = v;
      else if (v.turn === 0) {
        const cell = plan.find((c) => v.grids[0]!.tap!.cells.includes(c));
        expect((await grammi(`/rooms/${id}/act`, { move: cell === undefined ? { type: "pass" } : { type: "place", cell } })).status).toBe(200);
      }
      await sleep(2);
    }
    expect(counting, "the game never got to the count").toBeTruthy();

    // The count: both have the board to tap and the two buttons, the score is running, and a
    // watcher sees the dead stones and the territory with nothing to tap.
    expect(counting!.grids[0]!.tap).toMatchObject({ type: "toggle" });
    expect(counting!.grids[0]!.marks!.some((m) => m.mark === "claimed")).toBe(true);
    const seen = (await view(id, "watch"))!;
    expect(seen.phase).toBe("counting");
    expect(seen.grids[0]!.tap).toBeNull();
    expect(seen.grids[0]!.marks).toEqual(counting!.grids[0]!.marks);
    expect(seen.scores).toEqual(counting!.scores);
    // The computer agrees to the game's own marking at once; she agrees too, and that is the result.
    let end: BoardView | undefined;
    for (let i = 0; i < 500 && !end; i++) {
      const v = (await view(id, 0))!;
      if (v.over) end = v;
      else if (v.phase === "counting" && movesOffered(v).some((m) => m.type === "agree")) await grammi(`/rooms/${id}/act`, { move: { type: "agree" } });
      await sleep(2);
    }
    expect(end!.over!.winners).toHaveLength(1);
    // White's komi is seven and a half: one total is a whole number and the other isn't.
    const totals = end!.scores.map((s) => s.value);
    expect(totals.map((t) => t % 1).sort()).toEqual([0, 0.5]);
    expect(end!.result!.rows.at(-1)).toMatchObject({ label: "Total", values: totals.map((t) => (Number.isInteger(t) ? String(t) : t.toFixed(1))) });
    expect(end!.over!.title).toMatch(/wins by \d+(\.5)? points?!$/);
    expect(goPoint(9, 40)).toBe("E5");

    const summary = (await grammi(`/rooms/${id}`)).body.summary;
    expect(summary).toMatchObject({ game: "go", over: true, teams: false, seats: 2, winners: end!.over!.winners });
    expect(summary.scoreLine).toBe(`${end!.result!.rows.at(-1)!.values[0]} to ${end!.result!.rows.at(-1)!.values[1]}`);
    const board = (await grammi("/houses/grammis-house/leaderboard?game=go")).body;
    expect(board).toMatchObject({ game: "go", games: 1, teams: false });
    const her = board.players.find((p: { name: string }) => p.name === "brokennil");
    expect(her).toMatchObject({ played: 1, won: end!.over!.winners[0] === 0 ? 1 : 0 });
  }, 120_000);
});
