// Every board game on the kit, the way kit.test.ts checks every card game: computer players finish
// whole games at every table size with every preset, a game can be played from nothing but what
// its views offer, every view is consistent with itself, the same seed always starts the same
// game, and refused moves don't change anything.
import { mulberry32 } from "@spades/rules";
import { describe, expect, it } from "vitest";
import { BOARD_GAMES, GameError, KIT_GAMES, cellAt, cellName, chessCoords, colOf, isBoardGame, isCardGame, isKitGame, isSportGame, kitGame, lineThrough, movesOffered, rowOf, type BoardGame, type BoardView } from "../src/index.js";

const STYLES = [{}, { skill: 0.3, sloppy: 0.3 }, { skill: 1, sloppy: 0 }];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A view makes sense on its own: everything it points at is on its boards. */
export function checkBoardView(v: BoardView, seat: number) {
  expect(v.me).toBe(seat);
  expect(v.players).toHaveLength(v.seats);
  // Something is on the table: a board, or (for a game of dice and a scorecard) dice or a sheet.
  expect(v.grids.length + (v.dice ? 1 : 0) + (v.sheet ? 1 : 0)).toBeGreaterThan(0);
  expect(new Set(v.grids.map((g) => g.id)).size).toBe(v.grids.length);
  for (const g of v.grids) {
    const size = g.rows * g.cols;
    const on = (cell: number) => Number.isInteger(cell) && cell >= 0 && cell < size;
    expect(g.cells).toHaveLength(size);
    if (Array.isArray(g.shade)) expect(g.shade).toHaveLength(size);
    if (g.names) expect(g.names).toHaveLength(size);
    if (g.coords) expect([g.coords.rows.length, g.coords.cols.length]).toEqual([g.rows, g.cols]);
    if (g.blocks) {
      expect([g.rows % g.blocks.rows, g.cols % g.blocks.cols]).toEqual([0, 0]);
      expect(g.blocks.states).toHaveLength(g.blocks.rows * g.blocks.cols);
    }
    for (const m of g.marks ?? []) expect(on(m.cell)).toBe(true);
    for (const cell of g.tap?.cells ?? []) expect(on(cell)).toBe(true);
    expect(new Set(g.tap?.cells).size).toBe(g.tap?.cells.length ?? 0);
    const reserve = new Set(v.reserves.filter((r) => r.owner === seat).flatMap((r) => r.pieces.map((p) => p.piece.kind)));
    for (const s of g.select?.sources ?? []) {
      // You pick up a piece that's there, or one from your own reserve.
      if (typeof s.from === "number") expect(g.cells[s.from]).toBeTruthy();
      else expect(reserve.has(s.from)).toBe(true);
      expect(s.to.length).toBeGreaterThan(0);
      for (const to of s.to) expect(on(to)).toBe(true);
    }
    // What is already in hand is something that can be put down.
    if (g.select?.held !== undefined) expect(g.select.sources.some((s) => s.from === g.select!.held)).toBe(true);
    // What the table picks up for you is something you could have picked up yourself.
    if (g.select?.suggest !== undefined) expect(g.select.sources.some((s) => s.from === g.select!.suggest)).toBe(true);
    // A piece that covers several cells lies in one unbroken straight line of them.
    const spans = new Map<string, number[]>();
    g.cells.forEach((piece, cell) => piece?.span !== undefined && spans.set(piece.span, [...(spans.get(piece.span) ?? []), cell]));
    for (const cells of spans.values()) {
      const step = cells.length > 1 ? cells[1]! - cells[0]! : 1;
      expect([1, g.cols]).toContain(step);
      expect(cells.every((cell, i) => cell === cells[0]! + i * step)).toBe(true);
      if (step === 1) expect(rowOf(g.cols, cells.at(-1)!)).toBe(rowOf(g.cols, cells[0]!));
    }
    // A private grid is only ever sent to the seat it belongs to.
    if (g.owner !== undefined) expect(g.owner).toBe(seat);
    for (const piece of g.cells) if (piece) expect(piece.glyph && piece.label && piece.kind).toBeTruthy();
    // A stack is a whole number of pieces, and when it says which they are it names each of them, once on the whole board.
    const stacked = g.cells.flatMap((piece) => piece?.ids ?? []);
    expect(new Set(stacked).size).toBe(stacked.length);
    for (const piece of g.cells) {
      if (piece?.count !== undefined) expect(Number.isInteger(piece.count) && piece.count >= 1, `a stack of ${piece.count}`).toBe(true);
      if (piece?.ids) expect(piece.ids).toHaveLength(piece.count ?? 1);
    }
    // A track is made of cells of this grid, each once: the places along it, then a bar and a home for every seat.
    if (g.track) {
      const { path, bar = [], home = [] } = g.track;
      const places = [...path, ...bar, ...home];
      expect(path.length).toBeGreaterThan(0);
      for (const cell of places) expect(on(cell)).toBe(true);
      expect(new Set(places).size).toBe(places.length);
      for (const beside of [bar, home]) if (beside.length) expect(beside).toHaveLength(v.seats);
    }
  }
  if (v.cube) {
    // The cube shows a power of two, and is in the middle or on the side of someone at the table.
    const { value, owner, offered } = v.cube;
    expect(Number.isInteger(Math.log2(value)) && value >= 1, `a cube on ${value}`).toBe(true);
    for (const who of [owner, offered]) if (who !== null) expect(Number.isInteger(who) && who >= 0 && who < v.seats).toBe(true);
    // Only whoever could turn it can have offered it.
    if (offered !== null && owner !== null) expect(offered).toBe(owner);
  }
  for (const r of v.reserves) for (const p of r.pieces) expect(p.count).toBeGreaterThanOrEqual(0);
  if (v.dice) {
    const { dice, tap, roll, sides = 6, owner } = v.dice;
    // Each die is one thing with its own id, and shows a face it has (or nothing, before it's thrown).
    expect(new Set(dice.map((d) => d.id)).size).toBe(dice.length);
    for (const d of dice) {
      expect(Number.isInteger(d.id)).toBe(true);
      if (d.value !== null) expect(Number.isInteger(d.value) && d.value >= 1 && d.value <= sides, `a die showing ${d.value}`).toBe(true);
    }
    expect(Number.isInteger(roll) && roll >= 0).toBe(true);
    // A die you can tap is on the table, once.
    for (const id of tap?.dice ?? []) expect(dice.some((d) => d.id === id)).toBe(true);
    expect(new Set(tap?.dice).size).toBe(tap?.dice.length ?? 0);
    // Private dice are only ever sent to the seat they belong to.
    if (owner !== undefined) expect(owner).toBe(seat);
  }
  if (v.sheet) {
    const { columns, rows, pick, last, current } = v.sheet;
    expect(new Set(rows.map((r) => r.seat)).size).toBe(rows.length);
    for (const r of rows) expect(r.cells).toHaveLength(columns.length);
    if (current !== null) expect(columns[current]).toBeTruthy();
    if (last) expect([rows.some((r) => r.seat === last.seat), !!columns[last.column]]).toEqual([true, true]);
    // A cell you can choose is in your own row, in a column a move can name, still empty, once.
    const mine = rows.find((r) => r.seat === seat);
    for (const c of pick?.cells ?? []) {
      expect(columns[c.column]?.id, "a column that can be chosen has an id").toBeTruthy();
      expect(columns[c.column]!.kind).toBeUndefined();
      expect(mine?.cells[c.column]).toBe("");
      expect(typeof c.would).toBe("string");
    }
    expect(new Set(pick?.cells.map((c) => c.column)).size).toBe(pick?.cells.length ?? 0);
    expect(new Set(columns.flatMap((c) => (c.id === undefined ? [] : [c.id]))).size).toBe(columns.filter((c) => c.id !== undefined).length);
  }
  if (v.over) expect(v.over.winners.length).toBeGreaterThan(0);
}

/** Bots play until it's over. Along the way every view is checked, and every move a view offers is one the engine takes. */
export function playOut(game: BoardGame<any, any, any>, rules: unknown, seats: number, seed: number, limit = 5000) {
  let s = game.newGame(game.normalize(rules), seats, seed);
  let moves = 0;
  while (!game.summary(s).over) {
    let moved = false;
    for (let seat = 0; seat < seats; seat++) {
      const move = game.bot(s, seat, STYLES[(seat + moves) % STYLES.length]!);
      if (!move) continue;
      const v = game.view(s, seat);
      checkBoardView(v, seat);
      const offered = movesOffered(v);
      expect(offered.some((m) => same(m, move)), `${game.id}: the bot's move ${JSON.stringify(move)} isn't one the view offers`).toBe(true);
      const before = JSON.stringify(s);
      for (const m of offered) game.apply(s, seat, m);
      const next = game.apply(s, seat, move);
      // Trying moves never changes the state it was given.
      expect(JSON.stringify(s)).toBe(before);
      s = next;
      moved = true;
      moves++;
      break;
    }
    if (!moved) throw new Error(`nobody can move in ${game.id} (phase ${game.summary(s).phase})`);
    if (moves > limit) throw new Error(`${game.id} went on too long`);
  }
  return { state: s, moves };
}

describe("the board kit's helpers", () => {
  const piece = { owner: 0, kind: "man", glyph: "●", label: "red man" };
  const base = { game: "tictactoe" as const, seats: 2, me: 0, teams: false, phase: "playing", turn: 0, reserves: [], choices: null, players: [{ line: "" }, { line: "" }], info: [], narration: null, scores: [], result: null, over: null };

  it("lists the moves a view offers: taps, whole columns, pieces to pick up, reserve pieces, buttons", () => {
    const grid = { id: "board", label: "Board", rows: 2, cols: 3, cells: [piece, null, null, null, null, null] };
    expect(movesOffered({ ...base, grids: [{ ...grid, tap: { type: "mark", cells: [1, 2] } }] })).toEqual([{ type: "mark", cell: 1 }, { type: "mark", cell: 2 }]);
    // A drop game: any cell of a column means the column, once.
    expect(movesOffered({ ...base, grids: [{ ...grid, tap: { type: "drop", cells: [1, 4, 5], by: "col" } }] })).toEqual([{ type: "drop", col: 1 }, { type: "drop", col: 2 }]);
    const view: BoardView = {
      ...base,
      grids: [{ ...grid, select: { type: "move", sources: [{ from: 0, to: [1, 4] }, { from: "ship", to: [5] }] } }],
      reserves: [{ owner: 0, label: "To place", pieces: [{ piece: { ...piece, kind: "ship" }, count: 2 }] }],
      choices: { prompt: "", options: [{ label: "Pass", move: { type: "pass" } }] },
    };
    checkBoardView(view, 0);
    expect(movesOffered(view)).toEqual([{ type: "move", from: 0, to: 1 }, { type: "move", from: 0, to: 4 }, { type: "move", from: "ship", to: 5 }, { type: "pass" }]);
    // Dice that can be tapped and a sheet with cells to choose: a move per die, and one per cell by its column's id.
    const rolled: BoardView = {
      ...base,
      grids: [],
      dice: { dice: [{ id: 0, value: 3, held: true }, { id: 1, value: 6 }, { id: 2, value: null }], roll: 2, tap: { type: "hold", dice: [0, 1] } },
      sheet: { title: "Sheet", columns: [{ id: "ones", label: "Ones" }, { label: "Bonus", kind: "sum" }, { id: "chance", label: "Chance" }], current: null, rows: [{ seat: 0, cells: ["3", "3/63", ""], total: "3" }, { seat: 1, cells: ["", "0/63", ""], total: "0" }], totalLabel: "Total", last: { seat: 0, column: 0 }, pick: { type: "score", cells: [{ column: 2, would: "9" }] } },
      choices: { prompt: "", options: [{ label: "Roll", move: { type: "roll" } }] },
    };
    checkBoardView(rolled, 0);
    expect(movesOffered(rolled)).toEqual([{ type: "score", cell: "chance" }, { type: "hold", die: 0 }, { type: "hold", die: 1 }, { type: "roll" }]);
    // A view with nothing on the table at all, a die showing a face it hasn't got, two dice with one id,
    // a tap on a die that isn't there, someone else's private dice, a cell to choose that's filled in: none add up.
    expect(() => checkBoardView({ ...base, grids: [] }, 0)).toThrow();
    expect(() => checkBoardView({ ...rolled, dice: { ...rolled.dice!, dice: [{ id: 0, value: 7 }] } }, 0)).toThrow();
    expect(() => checkBoardView({ ...rolled, dice: { ...rolled.dice!, sides: 8, dice: [{ id: 0, value: 7 }], tap: null } }, 0)).not.toThrow();
    expect(() => checkBoardView({ ...rolled, dice: { ...rolled.dice!, dice: [{ id: 0, value: 1 }, { id: 0, value: 2 }] } }, 0)).toThrow();
    expect(() => checkBoardView({ ...rolled, dice: { ...rolled.dice!, tap: { type: "hold", dice: [9] } } }, 0)).toThrow();
    expect(() => checkBoardView({ ...rolled, dice: { ...rolled.dice!, owner: 1 } }, 0)).toThrow();
    expect(() => checkBoardView({ ...rolled, sheet: { ...rolled.sheet!, pick: { type: "score", cells: [{ column: 0, would: "1" }] } } }, 0)).toThrow();
    expect(() => checkBoardView({ ...rolled, sheet: { ...rolled.sheet!, pick: { type: "score", cells: [{ column: 1, would: "1" }] } } }, 0)).toThrow();
    // A track of points with stacks on them, and a cube: the stacks, the track and the cube all have to add up.
    const stack = { ...piece, kind: "checker", count: 3, ids: ["c0", "c1", "c2"] };
    const points: BoardView = { ...base, cube: { value: 2, owner: 1, offered: null, dead: false }, grids: [{ ...grid, cells: [stack, null, null, { ...stack, owner: 1, count: 1, ids: ["c3"] }, null, null], track: { kind: "points", path: [0, 1, 3, 4], bar: [2, 5], home: [] }, flip: "rows", select: { type: "move", sources: [{ from: 0, to: [1] }], quick: true } }] };
    checkBoardView(points, 0);
    expect(movesOffered(points)).toEqual([{ type: "move", from: 0, to: 1 }]);
    const pointsGrid = points.grids[0]!;
    expect(() => checkBoardView({ ...points, grids: [{ ...pointsGrid, cells: [{ ...stack, count: 2 }, null, null, null, null, null] }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, grids: [{ ...pointsGrid, cells: [stack, stack, null, null, null, null] }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, grids: [{ ...pointsGrid, cells: [{ ...stack, count: 0, ids: [] }, null, null, null, null, null] }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, grids: [{ ...pointsGrid, track: { kind: "points", path: [0, 1, 1] } }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, grids: [{ ...pointsGrid, track: { kind: "points", path: [0, 9] } }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, grids: [{ ...pointsGrid, track: { kind: "points", path: [0, 1], bar: [2] } }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, cube: { value: 3, owner: null, offered: null, dead: false } }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, cube: { value: 2, owner: 5, offered: null, dead: false } }, 0)).toThrow();
    expect(() => checkBoardView({ ...points, cube: { value: 2, owner: 1, offered: 0, dead: false } }, 0)).toThrow();
    // With two boards, a move says which one it's on.
    const two = { ...base, grids: [{ ...grid, id: "theirs", tap: { type: "shoot", cells: [3] } }, { ...grid, id: "mine", owner: 0 }] };
    checkBoardView(two, 0);
    expect(movesOffered(two)).toEqual([{ type: "shoot", cell: 3, grid: "theirs" }]);
    // A piece over several cells, and one the table picks up for you: both have to add up.
    const long = { ...piece, span: "a" };
    const fleet = { ...base, reserves: view.reserves, grids: [{ ...grid, cells: [long, long, null, null, null, null], select: { type: "place", sources: [{ from: "ship", to: [3] }], suggest: "ship" } }] };
    checkBoardView(fleet, 0);
    expect(() => checkBoardView({ ...fleet, grids: [{ ...fleet.grids[0]!, select: { ...fleet.grids[0]!.select, suggest: "boat" } }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...fleet, grids: [{ ...fleet.grids[0]!, cells: [long, null, long, null, null, null] }] }, 0)).toThrow();
    expect(() => checkBoardView({ ...fleet, grids: [{ ...fleet.grids[0]!, cells: [null, null, long, long, null, null] }] }, 0)).toThrow();
  });

  it("names cells and finds lines", () => {
    expect(cellName({ cols: 3 }, 5)).toBe("row 2, column 3");
    expect(cellName({ cols: 8, coords: chessCoords(8, 8) }, 0)).toBe("a8");
    expect(cellName({ cols: 8, coords: chessCoords(8, 8) }, 63)).toBe("h1");
    expect(cellName({ cols: 3, names: ["a", "b", "c", "d", "the middle"] }, 4)).toBe("the middle");
    expect([cellAt(5, 2, 3), rowOf(5, 13), colOf(5, 13)]).toEqual([13, 2, 3]);
    // A 4×5 board with a slanting line of three and a row of two.
    const marked = new Set([cellAt(5, 0, 0), cellAt(5, 1, 1), cellAt(5, 2, 2), cellAt(5, 3, 0), cellAt(5, 3, 1)]);
    const has = (c: number) => marked.has(c);
    expect(lineThrough(4, 5, cellAt(5, 1, 1), 3, has)).toEqual([0, 6, 12]);
    expect(lineThrough(4, 5, cellAt(5, 1, 1), 4, has)).toBeNull();
    expect(lineThrough(4, 5, cellAt(5, 3, 1), 2, has)).toEqual([15, 16]);
    // Lines stop at the edge: they never wrap onto the next row.
    const edge = new Set([3, 4, 5, 6]);
    expect(lineThrough(4, 5, 4, 3, (c) => edge.has(c))).toBeNull();
  });
});

describe("the registry", () => {
  it("lists every game once, as a card game, a board game or a table sport", () => {
    const ids = KIT_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(isKitGame(id)).toBe(true);
      expect([isCardGame(id), isBoardGame(id), isSportGame(id)].filter(Boolean)).toHaveLength(1);
      expect(kitGame(id)!.id).toBe(id);
    }
    expect(isKitGame("spades")).toBe(false);
    expect(BOARD_GAMES.length).toBeGreaterThan(0);
  });
});

for (const game of BOARD_GAMES) {
  describe(game.id, () => {
    it("has valid presets that describe themselves", () => {
      expect(new Set(game.presets.map((p) => p.id)).size).toBe(game.presets.length);
      for (const p of game.presets) {
        expect(game.validate(game.normalize(p))).toEqual([]);
        expect(game.normalize(p)).toEqual(p);
        expect(game.describe(p).length).toBeGreaterThan(1);
        // A table's rules name is cut at 30 characters on the server: say it in fewer.
        expect(p.name.length).toBeLessThanOrEqual(30);
      }
      // Rules from anywhere come out as rules.
      for (const junk of [null, 7, "x", {}, { id: "nope", size: "big" }]) expect(game.validate(game.normalize(junk))).toEqual([]);
    });

    const sizes = [...new Set([game.seats.min, game.seats.default, game.seats.max])];
    for (const seats of sizes) {
      it(`bots play whole games with ${seats} players`, () => {
        for (const seed of [1, 7, 42]) {
          for (const preset of game.presets) {
            const { state } = playOut(game, preset, seats, seed);
            const summary = game.summary(state);
            expect(summary.over).toBe(true);
            expect(summary.winners!.length).toBeGreaterThan(0);
            expect([...summary.order!].sort()).toEqual(Array.from({ length: seats }, (_, i) => i));
            for (let seat = 0; seat < seats; seat++) {
              const v = game.view(state, seat);
              checkBoardView(v, seat);
              expect(v.over!.winners).toEqual(summary.winners);
              // Nothing left to do on a finished board.
              expect(movesOffered(v)).toEqual([]);
            }
          }
        }
      }, 60_000);

      it(`plays from nothing but the views with ${seats} players`, () => {
        for (const preset of game.presets) {
          const rand = mulberry32(seats * 1000 + 3);
          let s = game.newGame(game.normalize(preset), seats, 11);
          for (let moves = 0; !game.summary(s).over; moves++) {
            if (moves > 5000) throw new Error(`${game.id} went on too long`);
            const options = Array.from({ length: seats }, (_, seat) => movesOffered(game.view(s, seat)).map((move) => ({ seat, move }))).flat();
            expect(options.length, `${game.id}: nobody is offered a move`).toBeGreaterThan(0);
            const { seat, move } = options[Math.floor(rand() * options.length)]!;
            s = game.apply(s, seat, move);
          }
        }
      });
    }

    it("starts the same game from the same seed", () => {
      for (const preset of game.presets) {
        const a = game.newGame(preset, game.seats.default, 99);
        const b = game.newGame(preset, game.seats.default, 99);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        for (let seat = 0; seat < game.seats.default; seat++) expect(game.view(a, seat)).toEqual(game.view(b, seat));
        // And the same moves from there give the same game.
        const move = movesOffered(game.view(a, game.view(a, 0).turn ?? 0))[0]!;
        const seat = game.view(a, 0).turn ?? 0;
        expect(JSON.stringify(game.apply(a, seat, move))).toBe(JSON.stringify(game.apply(b, seat, move)));
      }
    });

    it("says the same things to every seat", () => {
      const s = game.newGame(game.presets[0], game.seats.default, 5);
      const views = Array.from({ length: game.seats.default }, (_, seat) => game.view(s, seat));
      for (const v of views) {
        expect(v.game).toBe(game.id);
        expect(v.seats).toBe(game.seats.default);
        expect([v.turn, v.phase, v.scores, v.over]).toEqual([views[0]!.turn, views[0]!.phase, views[0]!.scores, views[0]!.over]);
      }
      // When it's one seat's turn, nobody else is offered a move on the board.
      const turn = views[0]!.turn;
      if (turn !== null) for (const v of views) if (v.me !== turn) expect(v.grids.every((g) => !g.tap?.cells.length && !g.select?.sources.length) && !v.dice?.tap?.dice.length && !v.sheet?.pick?.cells.length).toBe(true);
      // When everyone moves at once (placing ships), one seat's move never changes what another may do.
      if (turn === null && !views[0]!.over) {
        for (const v of views) {
          for (const move of movesOffered(v).slice(0, 5)) {
            const next = game.apply(s, v.me, move);
            if (game.view(next, 0).turn !== null || game.summary(next).phase !== game.summary(s).phase) continue;
            for (const w of views) if (w.me !== v.me) expect(movesOffered(game.view(next, w.me))).toEqual(movesOffered(w));
          }
        }
      }
    });

    it("refuses moves out of turn and leaves the state alone", () => {
      const s = game.newGame(game.presets[0], game.seats.default, 5);
      const before = JSON.stringify(s);
      const turn = game.view(s, 0).turn;
      const mover = turn ?? 0;
      const move = movesOffered(game.view(s, mover))[0]!;
      const idle = Array.from({ length: game.seats.default }, (_, i) => i).find((seat) => !game.bot(s, seat, {}));
      if (idle !== undefined) expect(() => game.apply(s, idle, move)).toThrow(GameError);
      // A move that says where (a cell, a column, a die) is refused with the where missing or wrong.
      // A button has no where to get wrong: a game that opens with one (roll the dice) is spared those.
      const placed = Object.keys(move).length > 1;
      const misplaced = placed ? [{ type: move.type }, { ...move, cell: -1, from: -1, to: 1e9, col: 99, die: -1 }, { ...move, cell: "x", from: "x", to: "x", col: "x", die: "x" }] : [];
      for (const junk of [{ type: "nonsense" }, {}, null, ...misplaced]) {
        expect(() => game.apply(s, mover, junk), JSON.stringify(junk)).toThrow(GameError);
      }
      expect(JSON.stringify(s)).toBe(before);
      game.apply(s, mover, move);
      expect(JSON.stringify(s)).toBe(before);
    });
  });
}
