// Go: captures, the rules about where a stone may not go, ko and superko, passing and the counting
// phase, both ways of counting on positions small enough to count by hand, and the computer
// player's manners (it keeps to its time, plays the same move from the same dice, and knows when a
// game is over). The shared board tests (board.test.ts) play whole games on every preset.
import { mulberry32 } from "@spades/rules";
import { describe, expect, it } from "vitest";
import { BLACK, GameError, QUICK_BUDGET, QUICK_STYLE, WHITE, boardFromCells, countGo, fullGo, go, goBotMove, goPoint, handicapCells, japaneseGo, komiOf, legalGoMoves, mediumGo, movesOffered, proposedDead, scoreGo, smallGo, starPoints, type GoMove, type GoRules, type GoState } from "../src/index.js";

type State = ReturnType<typeof go.newGame>;
const cellsOf = (board: string) => Uint8Array.from(board, (ch) => (ch === "X" ? BLACK : ch === "O" ? WHITE : 0));

/**
 * A position from a drawing: "X" black, "O" white, "." empty, a row a string (spaces are ignored).
 * Seat 0 plays Black. The board can be any size, so a position can be small enough to read.
 */
function position(rows: string[], o: { turn?: "black" | "white"; rules?: Partial<GoRules>; captured?: number[] } = {}): State {
  const drawn = rows.map((r) => r.replace(/ /g, ""));
  const n = drawn.length;
  for (const r of drawn) expect(r).toHaveLength(n);
  const rules = { ...smallGo, size: n, black: "seat1", ...o.rules } as GoRules;
  const board = drawn.join("");
  const start = go.newGame(rules as never, 2, 1);
  return { ...start, board, turn: o.turn === "white" ? 1 : 0, captured: o.captured ?? [0, 0], seen: rules.ko === "superko" ? [boardFromCells(n, cellsOf(board)).hash] : [] };
}
const rowsOf = (s: GoState) => Array.from({ length: s.rules.size }, (_, r) => s.board.slice(r * s.rules.size, (r + 1) * s.rules.size).split("").join(" "));
/** A cell from its row and column, counted from the top left. */
const at = (s: GoState, row: number, col: number) => row * s.rules.size + col;
const place = (s: State, seat: number, row: number, col: number) => go.apply(s, seat, { type: "place", cell: at(s, row, col) });
const refused = (s: State, seat: number, move: GoMove) => {
  try {
    go.apply(s, seat, move);
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    return (e as Error).message;
  }
  return null;
};

describe("capturing", () => {
  it("takes a stone whose last liberty is filled", () => {
    const s = position([". X . . .", "X O X . .", ". . . . .", ". . . . .", ". . . . ."]);
    const after = place(s, 0, 2, 1);
    expect(rowsOf(after).slice(0, 3)).toEqual([". X . . .", "X . X . .", ". X . . ."]);
    expect(after.captured).toEqual([1, 0]);
    expect(after.narration).toBe("{0} plays B3, capturing 1 stone");
    expect(go.view(after, 0).reserves[0]).toMatchObject({ owner: 0, label: "Captured", pieces: [{ piece: { label: "white stone" }, count: 1 }] });
    // The state it was given hasn't changed.
    expect(rowsOf(s)[1]).toBe("X O X . .");
  });

  it("takes a whole group at once, on the edge and in the corner", () => {
    const s = position(["O O . . .", "X X . . .", ". . . . .", ". . . O O", ". . . O X"], { turn: "black" });
    const after = place(s, 0, 0, 2);
    expect(rowsOf(after)[0]).toBe(". . X . .");
    expect(after.captured).toEqual([2, 0]);
    // And White takes the corner stone.
    const corner = position([". . . . .", ". . . . .", ". . . . .", ". . . . O", ". . . . X"], { turn: "white" });
    expect(rowsOf(place(corner, 1, 4, 3))[4]).toBe(". . . O .");
  });

  it("takes two groups with one stone", () => {
    const s = position([". O X . .", "O X . . .", "X . . . .", ". . . . .", ". . . . ."]);
    const after = place(s, 0, 0, 0);
    expect(rowsOf(after).slice(0, 2)).toEqual(["X . X . .", ". X . . ."]);
    expect(after.captured).toEqual([2, 0]);
  });

  it("a stone with no liberty of its own may be played when it captures", () => {
    // Every point beside B4 is White's, but the white stone at B3 has no other liberty.
    const s = position([". X O . .", "X O . O .", ". X O . .", ". . . . .", ". . . . ."]);
    expect(legalGoMoves(s, 0)).toContain(at(s, 1, 2));
    const after = place(s, 0, 1, 2);
    expect(rowsOf(after).slice(0, 3)).toEqual([". X O . .", "X . X O .", ". X O . ."]);
  });

  it("a snapback: the stone thrown in is taken, and taking it costs the whole group", () => {
    const s = position([". . O X .", "O O O X .", "X X X . .", ". . . . .", ". . . . ."]);
    const thrown = place(s, 0, 0, 1);
    const taken = place(thrown, 1, 0, 0);
    expect(rowsOf(taken)[0]).toBe("O . O X .");
    expect(taken.captured).toEqual([0, 1]);
    // It isn't a ko (the stone that captured joined a group), so Black may play straight back in.
    expect(taken.ko).toBeNull();
    const back = place(taken, 0, 0, 1);
    expect(rowsOf(back).slice(0, 2)).toEqual([". X . X .", ". . . X ."]);
    expect(back.captured).toEqual([5, 1]);
  });
});

describe("where a stone may not go", () => {
  it("not on another stone, not off the board, not out of turn", () => {
    const s = position([". X . . .", ". . . . .", ". . . . .", ". . . . .", ". . . . ."]);
    expect(refused(s, 0, { type: "place", cell: 1 })).toMatch(/stone there already/);
    expect(refused(s, 0, { type: "place", cell: 25 })).toMatch(/not on the board/);
    expect(refused(s, 0, { type: "place", cell: 1.5 })).toMatch(/not on the board/);
    expect(refused(s, 1, { type: "place", cell: 0 })).toMatch(/not your turn/);
    expect(refused(s, 1, { type: "pass" })).toMatch(/not your turn/);
  });

  it("suicide is refused, for one stone or several", () => {
    const one = position([". O . . .", "O . . . .", ". . . . .", ". . . . .", ". . . . ."]);
    expect(refused(one, 0, { type: "place", cell: 0 })).toMatch(/no liberties/);
    expect(legalGoMoves(one, 0)).not.toContain(0);
    const two = position([". X O . .", "O O . . .", ". . . . .", ". . . . .", ". . . . ."]);
    expect(refused(two, 0, { type: "place", cell: 0 })).toMatch(/no liberties/);
    expect(go.view(two, 0).grids[0]!.tap!.cells).not.toContain(0);
    // White may play there: it has liberties through its own stones.
    expect(legalGoMoves(position([". X O . .", "O O . . .", ". . . . .", ". . . . .", ". . . . ."], { turn: "white" }), 1)).toContain(0);
  });

  it("a table that allows suicide takes the group off and gives it to the other side", () => {
    const rules = { suicide: true };
    const two = position([". X O . .", "O O . . .", ". . . . .", ". . . . .", ". . . . ."], { rules });
    const after = place(two, 0, 0, 0);
    expect(rowsOf(after)[0]).toBe(". . O . .");
    expect(after.captured).toEqual([0, 2]);
    expect(after.last).toBeNull();
    expect(after.narration).toMatch(/2 stones of their own come off/);
    // One stone that would only take itself off changes nothing, and that is never a move.
    const one = position([". O . . .", "O . . . .", ". . . . .", ". . . . .", ". . . . ."], { rules });
    expect(refused(one, 0, { type: "place", cell: 0 })).toMatch(/no liberties/);
    expect(refused(position([". O . . .", "O . . . .", ". . . . .", ". . . . .", ". . . . ."], { rules: { suicide: true, ko: "simple" } }), 0, { type: "place", cell: 0 })).toMatch(/no liberties/);
  });
});

describe("ko", () => {
  const KO = [". X O . .", "X O . O .", ". X O . .", ". . . . .", ". . . . ."];

  for (const ko of ["simple", "superko"] as const) {
    it(`a ko can't be taken straight back (${ko})`, () => {
      const s = position(KO, { rules: { ko } });
      const took = place(s, 0, 1, 2);
      expect(took.ko).toBe(at(s, 1, 1));
      expect(refused(took, 1, { type: "place", cell: at(s, 1, 1) })).toMatch(/take the ko straight back/);
      // The point is marked for both players, and isn't one White can tap.
      const v = go.view(took, 1);
      expect(v.grids[0]!.marks).toContainEqual({ cell: at(s, 1, 1), mark: "barred" });
      expect(v.grids[0]!.tap!.cells).not.toContain(at(s, 1, 1));
      expect(go.view(took, 0).grids[0]!.marks).toContainEqual({ cell: at(s, 1, 1), mark: "barred" });
      // After a move elsewhere and its answer, the ko can be retaken: the board is not the same as it was.
      const later = place(place(took, 1, 4, 4), 0, 4, 0);
      expect(later.ko).toBeNull();
      const retaken = place(later, 1, 1, 1);
      expect(rowsOf(retaken)[1]).toBe("X O . O .");
      expect(retaken.ko).toBe(at(s, 1, 2));
    });
  }

  // "Sending two, returning one": Black adds a stone, White takes the two, Black takes the one
  // that took them, and the board is exactly as it was three moves ago. No single stone was taken
  // back, so simple ko has nothing to say about it; superko does.
  const CYCLE = [". X . X .", "O O X . .", ". . . . .", ". . . . .", ". . . . ."];

  it("superko refuses a move that brings back an earlier position, round a longer cycle", () => {
    const s = position(CYCLE, { rules: { ko: "superko" } });
    const two = place(s, 0, 0, 0);
    const taken = place(two, 1, 0, 2);
    expect(rowsOf(taken)[0]).toBe(". . O X .");
    expect(taken.ko).toBeNull();
    expect(refused(taken, 0, { type: "place", cell: at(s, 0, 1) })).toMatch(/repeat a position/);
    expect(go.view(taken, 0).grids[0]!.tap!.cells).not.toContain(at(s, 0, 1));
    // Taking from the other side leaves a different board, and is fine.
    expect(rowsOf(place(taken, 0, 0, 0))[0]).toBe("X . O X .");
    // The list of positions is one number a move.
    expect(taken.seen).toHaveLength(3);
    expect(taken.seen.every((h) => Number.isSafeInteger(h))).toBe(true);
  });

  it("simple ko allows the same cycle", () => {
    const s = position(CYCLE, { rules: { ko: "simple" } });
    const round = place(place(place(s, 0, 0, 0), 1, 0, 2), 0, 0, 1);
    expect(round.board).toBe(s.board);
    expect(round.seen).toEqual([]);
  });

  it("passing doesn't count as a new position, and a pass lifts the ko", () => {
    const s = position(KO, { rules: { ko: "superko" } });
    const took = place(s, 0, 1, 2);
    const passed = go.apply(took, 1, { type: "pass" });
    expect(passed.seen).toEqual(took.seen);
    expect(passed.ko).toBeNull();
    // But the position before the capture is still one the board has been in: White can't go back to it.
    const again = go.apply(passed, 0, { type: "pass" });
    expect(again.phase).toBe("counting");
    const on = go.apply(again, 0, { type: "resume" });
    expect(on.turn).toBe(1);
    expect(refused(on, 1, { type: "place", cell: at(s, 1, 1) })).toMatch(/repeat a position/);
  });
});

describe("passing and the end of play", () => {
  it("asks before the first pass of a game, and two passes in a row stop play", () => {
    const s = go.newGame({ ...smallGo, black: "seat1" } as never, 2, 4);
    const pass = () => go.view(s, 0).choices!.options[0]!;
    expect(pass()).toMatchObject({ label: "Pass", move: { type: "pass" } });
    expect(pass().confirm).toMatch(/Pass your turn/);
    // Only the player to move has the button.
    expect(go.view(s, 1).choices).toBeNull();
    const one = go.apply(s, 0, { type: "pass" });
    expect(one).toMatchObject({ phase: "playing", turn: 1, passes: 1, narration: "{0} passes" });
    expect(go.view(one, 1).players[0]!.badge).toBe("Passed");
    expect(go.view(one, 1).choices!.options[0]!.confirm).toBeUndefined();
    // A stone in between, and the passes start again.
    const stone = go.apply(one, 1, { type: "place", cell: 40 });
    expect(stone.passes).toBe(0);
    const two = go.apply(go.apply(stone, 0, { type: "pass" }), 1, { type: "pass" });
    expect(two.phase).toBe("counting");
    expect(go.view(two, 0).turn).toBeNull();
    expect(go.summary(two)).toMatchObject({ over: false, phase: "counting" });
  });

  it("an empty board passed out is White's by the komi", () => {
    const s = go.newGame({ ...smallGo, black: "seat1" } as never, 2, 4);
    const counting = go.apply(go.apply(s, 0, { type: "pass" }), 1, { type: "pass" });
    const over = go.apply(go.apply(counting, 0, { type: "agree" }), 1, { type: "agree" });
    expect(go.summary(over)).toMatchObject({ over: true, winners: [1], order: [1, 0], scoreLine: "0 to 7.5" });
    expect(go.view(over, 0).over).toEqual({ winners: [1], title: "{1} wins by 7.5 points!" });
    expect(over.narration).toBe("{1} wins by 7.5 points: 7.5 to 0");
    expect(movesOffered(go.view(over, 0))).toEqual([]);
  });
});

describe("counting", () => {
  // Black holds the two columns on the left and White the three on the right.
  const SPLIT = [". X O . .", ". X O . .", ". X O . .", ". X O . .", ". X O . ."];

  it("Chinese counting: stones and the points only you surround, and White's komi", () => {
    const s = position(SPLIT, { captured: [3, 1] });
    const score = scoreGo(s, []);
    expect(score.totals).toEqual([10, 22.5]);
    expect(score.rows).toEqual([
      { label: "Stones", values: ["5", "5"] },
      { label: "Territory", values: ["5", "10"] },
      { label: "Komi", values: ["", "7.5"] },
      { label: "Total", values: ["10", "22.5"], tone: "score" },
    ]);
  });

  it("Japanese counting: the points only you surround and the stones you took", () => {
    const s = position(SPLIT, { captured: [3, 1], rules: { scoring: "territory", komi: 6.5 } });
    const score = scoreGo(s, []);
    expect(score.totals).toEqual([8, 17.5]);
    expect(score.rows.map((r) => [r.label, ...r.values])).toEqual([["Territory", "5", "10"], ["Prisoners", "3", "1"], ["Komi", "", "6.5"], ["Total", "8", "17.5"]]);
  });

  it("the totals follow the colours, whichever seat has Black", () => {
    const s = { ...position(SPLIT), black: 1 };
    expect(scoreGo(s, []).totals).toEqual([22.5, 10]);
  });

  it("a point both colours touch is nobody's, and a whole-number komi can draw the game", () => {
    const s = position([". X . O .", ". X . O .", ". X . O .", ". X . O .", ". X . O ."], { rules: { komi: 0 } });
    const score = scoreGo(s, []);
    expect(score.totals).toEqual([10, 10]);
    expect([...score.count.owner.slice(0, 5)]).toEqual([BLACK, BLACK, 0, WHITE, WHITE]);
    expect(score.rows.map((r) => r.label)).toEqual(["Stones", "Territory", "Total"]);
    // Played to the end, it is a draw for both.
    const counting = go.apply(go.apply(s, 0, { type: "pass" }), 1, { type: "pass" });
    const over = go.apply(go.apply({ ...counting, dead: [] }, 1, { type: "agree" }), 0, { type: "agree" });
    expect(go.summary(over)).toMatchObject({ over: true, winners: [0, 1], scoreLine: "10 to 10" });
    expect(go.view(over, 0).over!.title).toBe("It's a draw!");
    expect(over).toMatchObject({ draws: 1, wins: [0, 0], roundWinner: null, narration: "It's a draw, 10 all" });
  });

  it("stones in a seki are left standing: they count, and the liberties they share don't", () => {
    // Top left: four black stones, and six white ones wrapped round them, neither with an eye,
    // sharing two liberties (C7 and C6) that neither can fill without being taken. The black wall
    // round the white stones owns the rest of the board.
    const s = position([
      "X X . O X . .",
      "X X . O X . .",
      "O O O O X . .",
      "X X X X X . .",
      ". . . . . . .",
      ". . . . . . .",
      ". . . . . . .",
    ]);
    const { count, totals } = scoreGo(s, []);
    expect([count.owner[2], count.owner[9]]).toEqual([0, 0]);
    expect(count.stones).toEqual([0, 12, 6]);
    expect(count.territory).toEqual([0, 29, 0]);
    expect(totals).toEqual([41, 13.5]);
    // The game's own estimate leaves all of it alive, whoever is to move.
    expect([proposedDead(s, BLACK), proposedDead(s, WHITE)]).toEqual([[], []]);
  });

  it("dead stones come off before the count, and count twice under Japanese rules", () => {
    // A white stone inside Black's corner, and a black one inside White's side.
    const rows = [". O X O . .", ". . X O . X", ". . X O . .", ". . X O . .", ". . X O . .", ". . X O . ."];
    const area = position(rows);
    const dead = [1, 11];
    // Left as they are, each spoils the other's territory: nothing but stones is counted.
    expect(scoreGo(area, []).totals).toEqual([7, 14.5]);
    expect(scoreGo(area, dead).totals).toEqual([18, 25.5]);
    const territory = position(rows, { rules: { scoring: "territory", komi: 6.5 }, captured: [0, 2] });
    // Black: 12 points and one dead stone. White: 12 points, the dead stone and the two taken earlier.
    expect(scoreGo(territory, dead).totals).toEqual([13, 21.5]);
    expect(countGo(6, cellsOf(area.board), dead).dead).toEqual([0, 1, 1]);
  });

  it("a handicap gives Black stones on the star points, White the first move and half a point", () => {
    expect(handicapCells(9, 0)).toEqual([]);
    expect(handicapCells(9, 1)).toEqual([]);
    expect(handicapCells(19, 2).map((c) => goPoint(19, c))).toEqual(["Q16", "D4"]);
    expect(handicapCells(19, 4).map((c) => goPoint(19, c)).sort()).toEqual(["D16", "D4", "Q16", "Q4"]);
    expect(handicapCells(19, 5).map((c) => goPoint(19, c))).toContain("K10");
    expect(handicapCells(19, 6).map((c) => goPoint(19, c))).not.toContain("K10");
    expect(handicapCells(19, 9).map((c) => goPoint(19, c)).sort()).toEqual(["D10", "D16", "D4", "K10", "K16", "K4", "Q10", "Q16", "Q4"]);
    expect(handicapCells(13, 9).map((c) => goPoint(13, c)).sort()).toEqual(["D10", "D4", "D7", "G10", "G4", "G7", "K10", "K4", "K7"]);
    expect(handicapCells(9, 9).map((c) => goPoint(9, c)).sort()).toEqual(["C3", "C5", "C7", "E3", "E5", "E7", "G3", "G5", "G7"]);
    for (const [size, stones] of [[9, 2], [13, 5], [19, 9]] as const) {
      const rules = go.normalize({ id: "go-small", size, handicap: stones, black: "seat2" });
      const s = go.newGame(rules, 2, 3);
      expect([...s.board].filter((ch) => ch === "X")).toHaveLength(stones);
      expect([...s.board].filter((ch) => ch === "O")).toHaveLength(0);
      expect([s.black, s.turn]).toEqual([1, 0]);
      expect(komiOf(rules)).toBe(0.5);
      expect(go.view(s, 0).narration).toMatch(/you're White, and you go first/);
      expect(go.view(s, 0).info).toContain(`Black starts with ${stones} stones`);
      expect(go.describe(rules).join(" ")).toContain("White moves first");
    }
    // "Just no komi": no stones, Black first, half a point.
    const even = go.newGame(go.normalize({ id: "go-small", handicap: 1, black: "seat1" }), 2, 3);
    expect([even.board.includes("X"), even.turn, komiOf(even.rules)]).toEqual([false, 0, 0.5]);
    // In a match the players take turns with Black, but not when Black is being given stones.
    const next = (s: State) => go.apply(go.apply(go.apply(s, 0, { type: "resign" }), 0, { type: "next" }), 1, { type: "next" });
    expect(next(go.newGame(go.normalize({ id: "go-small", games: 3, black: "seat1" }), 2, 3)).black).toBe(1);
    expect(next(go.newGame(go.normalize({ id: "go-small", games: 3, black: "seat1", handicap: 3 }), 2, 3)).black).toBe(0);
  });

  it("the star points drawn are the corners and the middle, and all nine on the full board", () => {
    expect(starPoints(9).map((c) => goPoint(9, c)).sort()).toEqual(["C3", "C7", "E5", "G3", "G7"]);
    expect(starPoints(13).map((c) => goPoint(13, c)).sort()).toEqual(["D10", "D4", "G7", "K10", "K4"]);
    expect(starPoints(19)).toHaveLength(9);
    const v = go.view(go.newGame(fullGo as never, 2, 1), 0);
    expect(v.grids[0]!.shade).toHaveLength(361);
    expect((v.grids[0]!.shade as string[]).filter((x) => x === "spot")).toHaveLength(9);
  });
});

describe("the counting phase", () => {
  // Black's wall and White's, with a white stone left behind in Black's two columns.
  const ROWS = [". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", "O . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . ."];
  const counting = (o: Parameters<typeof position>[1] = {}) => go.apply(go.apply(position(ROWS, o), 0, { type: "pass" }), 1, { type: "pass" });
  const LONE = 36;

  it("proposes which stones are dead, shows them faded with the territory and the running score", () => {
    const s = counting();
    expect(s.phase).toBe("counting");
    expect(s.dead).toEqual([LONE]);
    expect(s.narration).toBe("{1} passes too: time to count");
    for (const seat of [0, 1]) {
      const v = go.view(s, seat);
      expect(v.phase).toBe("counting");
      expect(v.turn).toBeNull();
      expect(v.grids[0]!.cells[LONE]).toMatchObject({ faded: true, label: "white stone, dead" });
      expect(v.grids[0]!.cells[2]!.faded).toBeUndefined();
      // The dead stone's point is Black's, and so is the rest of the two columns; White has the right.
      expect(v.grids[0]!.marks).toContainEqual({ cell: LONE, mark: "claimed", owner: 0 });
      expect(v.grids[0]!.marks!.filter((m) => m.mark === "claimed" && m.owner === 0)).toHaveLength(18);
      expect(v.grids[0]!.marks!.filter((m) => m.mark === "claimed" && m.owner === 1)).toHaveLength(45);
      expect(v.scores).toEqual([{ seats: [0], value: 27 }, { seats: [1], value: 61.5 }]);
      // Either player may tap any stone, and both have the two buttons.
      expect(v.grids[0]!.tap).toMatchObject({ type: "toggle" });
      expect(v.grids[0]!.tap!.cells).toHaveLength(19);
      expect(v.choices!.options.map((o) => o.label)).toEqual(["Agree", "Play on"]);
      expect(v.choices!.options[0]!.primary).toBe(true);
    }
  });

  it("either player can mark a group dead or alive, which starts the agreeing again", () => {
    const s = counting();
    const one = go.apply(s, 0, { type: "agree" });
    expect(one.agreed).toEqual([true, false]);
    expect(go.view(one, 0).players[0]!.badge).toBe("Agreed");
    expect(go.view(one, 0).choices).toMatchObject({ prompt: "Waiting for {1} to agree", options: [{ label: "Play on" }] });
    expect(refused(one, 0, { type: "agree" })).toMatch(/agreed already/);
    // White says its stone is alive: nobody has agreed to that.
    const alive = go.apply(one, 1, { type: "toggle", cell: LONE });
    expect(alive).toMatchObject({ dead: [], agreed: [false, false], narration: "{1} says the 1 stone at A5 is alive" });
    expect(go.view(alive, 0).scores).toEqual([{ seats: [0], value: 9 }, { seats: [1], value: 62.5 }]);
    // A tap on any stone of a group marks the whole group.
    const wall = go.apply(alive, 0, { type: "toggle", cell: 2 });
    expect(wall.dead).toEqual([2, 11, 20, 29, 38, 47, 56, 65, 74]);
    expect(wall.narration).toBe("{0} says the 9 stones at C9 are dead");
    expect(go.apply(wall, 1, { type: "toggle", cell: 74 }).dead).toEqual([]);
    expect(refused(s, 0, { type: "toggle", cell: 0 })).toMatch(/no stone there/);
    expect(refused(s, 0, { type: "toggle", cell: 99 })).toMatch(/not on the board/);
    // Stones can't be played while the count is being agreed.
    expect(refused(s, 0, { type: "place", cell: 0 })).toMatch(/Play has stopped/);
    expect(refused(s, 0, { type: "pass" })).toMatch(/Play has stopped/);
  });

  it("the count stands when both agree, in either order", () => {
    for (const order of [[0, 1], [1, 0]]) {
      let s = counting();
      for (const seat of order) s = go.apply(s, seat, { type: "agree" });
      expect(go.summary(s)).toMatchObject({ over: true, winners: [1], scoreLine: "27 to 61.5" });
      const v = go.view(s, 0);
      expect(v.over).toEqual({ winners: [1], title: "{1} wins by 34.5 points!" });
      expect(v.result!.rows.map((r) => [r.label, ...r.values])).toEqual([["Stones", "9", "9"], ["Territory", "18", "45"], ["Komi", "", "7.5"], ["Total", "27", "61.5"]]);
      // The board stays as it was counted.
      expect(v.grids[0]!.cells[LONE]!.faded).toBe(true);
      expect(v.grids[0]!.marks!.some((m) => m.mark === "claimed")).toBe(true);
      expect([v.grids[0]!.tap, v.choices]).toEqual([null, null]);
    }
  });

  it("\"Play on\" goes back to the board with the other player to move, and forgets the marking", () => {
    for (const seat of [0, 1]) {
      const agreed = go.apply(counting(), 1 - seat, { type: "agree" });
      const on = go.apply(agreed, seat, { type: "resume" });
      expect(on).toMatchObject({ phase: "playing", turn: 1 - seat, passes: 0, dead: [], agreed: [false, false], resumes: 1, narration: `{${seat}} plays on: {${1 - seat}} to move` });
      const v = go.view(on, 1 - seat);
      expect(v.grids[0]!.tap!.type).toBe("place");
      expect(v.grids[0]!.cells[LONE]!.faded).toBeUndefined();
      expect(v.grids[0]!.marks!.some((m) => m.mark === "claimed")).toBe(false);
      // Passing again takes two passes, and brings the same proposal back.
      const again = go.apply(go.apply(on, 1 - seat, { type: "pass" }), seat, { type: "pass" });
      expect(again).toMatchObject({ phase: "counting", dead: [LONE] });
    }
    expect(refused(position(ROWS), 0, { type: "resume" })).toMatch(/isn't being counted/);
    expect(refused(position(ROWS), 0, { type: "agree" })).toMatch(/isn't being counted/);
  });

  it("the proposal depends on the position alone", () => {
    const s = position(ROWS);
    expect(proposedDead(s, WHITE)).toEqual(proposedDead({ ...s }, WHITE));
    expect(counting().dead).toEqual(counting().dead);
  });

  it("a match goes on to the next game, with the colours swapped", () => {
    let s = counting({ rules: { games: 3 } });
    s = go.apply(go.apply(s, 0, { type: "agree" }), 1, { type: "agree" });
    expect(go.summary(s)).toMatchObject({ over: false, phase: "scored", scoreLine: "0 to 1" });
    expect(go.view(s, 0).result).toMatchObject({ title: "{1} wins game 1" });
    expect(go.view(s, 0).result!.rows.map((r) => r.label)).toEqual(["Stones", "Territory", "Komi", "Total", "Wins"]);
    s = go.apply(go.apply(s, 0, { type: "next" }), 1, { type: "next" });
    expect(s).toMatchObject({ round: 2, black: 1, turn: 1, phase: "playing", moves: 0, dead: [], score: null });
    expect(s.board).toBe(".".repeat(81));
  });
});

describe("what a seat sees", () => {
  it("stones on the crossings, named the way Go names them", () => {
    const s = go.apply(go.newGame({ ...smallGo, black: "seat1" } as never, 2, 2), 0, { type: "place", cell: 6 * 9 + 3 });
    const v = go.view(s, 1);
    const g = v.grids[0]!;
    expect(g).toMatchObject({ points: true, rows: 9, cols: 9 });
    expect(g.coords).toEqual({ cols: ["A", "B", "C", "D", "E", "F", "G", "H", "J"], rows: ["9", "8", "7", "6", "5", "4", "3", "2", "1"] });
    expect(g.cells[57]).toEqual({ owner: 0, kind: "stone", glyph: "●", label: "black stone", tone: "dark" });
    expect(g.marks).toEqual([{ cell: 57, mark: "last" }]);
    expect(s.narration).toBe("{0} plays D3");
    expect([goPoint(19, 0), goPoint(19, 360), goPoint(19, 3 * 19 + 15)]).toEqual(["A19", "T1", "Q16"]);
    expect(v.players.map((p) => p.piece!.label)).toEqual(["black stone", "white stone"]);
    expect(v.info[0]).toBe("Chinese counting · White gets 7.5");
    expect(go.view(go.newGame(japaneseGo as never, 2, 2), 0).info[0]).toBe("Japanese counting · White gets 6.5");
    // The first move belongs to Black, and is said so.
    const fresh = go.newGame({ ...smallGo, black: "seat2" } as never, 2, 2);
    expect(go.view(fresh, 1).narration).toBe("You're Black: you go first");
    expect(go.view(fresh, 1).players[1]!.badge).toBe("Goes first");
    expect(go.view(fresh, 0).grids[0]!.tap).toBeNull();
  });

  it("the game is called Go, and found as Weiqi and Baduk", () => {
    expect(go.name).toBe("Go");
    for (const other of ["Weiqi", "Baduk"]) {
      expect(go.blurb).toContain(other);
      expect(go.tagline).toContain(other);
    }
    expect(go.presets.map((p) => [p.id, p.size, p.scoring, p.komi])).toEqual([["go-small", 9, "area", 7.5], ["go-medium", 13, "area", 7.5], ["go-full", 19, "area", 7.5], ["go-japanese", 9, "territory", 6.5]]);
    // The description says plainly how strong the computer is on each board.
    expect(go.describe(smallGo as never).join(" ")).toMatch(/sensible game on this board/);
    expect(go.describe(fullGo as never).join(" ")).toMatch(/computer is weak on a board this size/);
  });
});

describe("the computer player", () => {
  const SHARP = { skill: 1, sloppy: 0 };
  /** A game some way in, played by the computer against itself from fixed dice. */
  function midgame(rules: unknown, moves: number, seed = 5): State {
    const rand = mulberry32(seed);
    let s = go.newGame(go.normalize(rules), 2, seed);
    for (let i = 0; i < moves && s.phase === "playing"; i++) s = go.apply(s, s.turn, goBotMove(s, s.turn, { playouts: 20 }, rand));
    return s;
  }
  const offered = (s: State, seat: number, move: unknown) => movesOffered(go.view(s, seat)).some((m) => JSON.stringify(m) === JSON.stringify(move));

  it("plays the same move from the same dice when its work is rationed and nobody keeps time", () => {
    for (const preset of [smallGo, mediumGo]) {
      const s = midgame(preset, 12);
      const moves = [1, 2, 3].map(() => go.bot(s, s.turn, SHARP, mulberry32(42)));
      expect(moves[1]).toEqual(moves[0]);
      expect(moves[2]).toEqual(moves[0]);
      expect(offered(s, s.turn, moves[0])).toBe(true);
    }
  });

  it("keeps to the time it is given, and still plays a legal move with almost none", () => {
    const s = midgame(fullGo, 30);
    const seat = s.turn;
    // (Once before the clock is looked at: the first call of anything is slow.)
    go.bot(s, seat, SHARP, undefined, { ms: 40 });
    for (const ms of [10, 60, 250]) {
      const began = performance.now();
      const move = go.bot(s, seat, SHARP, undefined, { ms });
      const took = performance.now() - began;
      expect(offered(s, seat, move), `${ms} ms: ${JSON.stringify(move)}`).toBe(true);
      // Inside the budget, with room for a slow machine having a bad moment.
      expect(took, `a ${ms} ms budget took ${Math.round(took)} ms`).toBeLessThan(ms + 60);
    }
    // The clock stops a search that has any amount of work left to do.
    const began = performance.now();
    const move = goBotMove(s, seat, { playouts: 1e9, deadline: began + 80 });
    expect(performance.now() - began).toBeLessThan(160);
    expect(offered(s, seat, move)).toBe(true);
    // What the table asks for when it has given up on a think: an answer at once, in any position.
    for (const at of [midgame(smallGo, 0), midgame(smallGo, 40), midgame(japaneseGo, 25), s]) {
      const quick = go.bot(at, at.turn, QUICK_STYLE, undefined, QUICK_BUDGET);
      expect(offered(at, at.turn, quick)).toBe(true);
    }
  });

  it("says its think is a heavy one only when it has a move to find", () => {
    const s = midgame(smallGo, 6);
    expect([go.heavy!(s, s.turn), go.heavy!(s, 1 - s.turn)]).toEqual([true, false]);
    const counting = go.apply(go.apply(s, s.turn, { type: "pass" }), 1 - s.turn, { type: "pass" });
    expect([go.heavy!(counting, 0), go.heavy!(counting, 1)]).toEqual([false, false]);
    expect(go.bot(s, 1 - s.turn, SHARP)).toBeNull();
  });

  it("takes stones it can take, saves its own, and doesn't fill its own eyes", () => {
    // With no time to read at all, it plays what any player knows. White's stone at B4 has one
    // liberty, at B3: Black takes it there, and White, to move, runs out there.
    const atari = position([". . . . . . .", ". . . . . . .", ". X . . . . .", "X O X . . . .", ". . . . . . .", ". . . . . . .", ". . . . . . ."]);
    for (const seed of [1, 2, 3]) {
      expect(goBotMove(atari, 0, { playouts: 0 }, mulberry32(seed))).toEqual({ type: "place", cell: at(atari, 4, 1) });
      expect(goBotMove({ ...atari, turn: 1 }, 1, { playouts: 0 }, mulberry32(seed))).toEqual({ type: "place", cell: at(atari, 4, 1) });
    }
    // Running is no use when it only makes a bigger group with one liberty: it looks elsewhere.
    const caught = position([". . . . . . .", ". . . . . . .", "X X . . . . .", "O O X . . . .", "O X . . . . .", ". X . . . . .", ". . . . . . ."], { turn: "white" });
    expect(goBotMove(caught, 1, { playouts: 0 }, mulberry32(1))).not.toEqual({ type: "place", cell: at(caught, 5, 0) });
    expect(goBotMove({ ...caught, turn: 0 }, 0, { playouts: 0 }, mulberry32(1))).toEqual({ type: "place", cell: at(caught, 5, 0) });
    // A board that is all walls and eyes: there is nothing to do but pass.
    const done = position(["X . X X O . O", ". X X X O O .", "X X X X O O O", "X X X X O O O", "X X X X O O O", ". X X X O O .", "X . X X O . O"]);
    expect(goBotMove(done, 0, { playouts: 50 }, mulberry32(1))).toEqual({ type: "pass" });
    expect(goBotMove({ ...done, turn: 1 }, 1, { playouts: 50 }, mulberry32(1))).toEqual({ type: "pass" });
    expect(go.bot(done, 0, QUICK_STYLE, undefined, QUICK_BUDGET)).toEqual({ type: "pass" });
  });

  it("passes when the other player has and it is ahead, and plays on when it is behind with something to gain", () => {
    const rows = [". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . ."];
    // White is far ahead: Black passes, and White passes too.
    const s = go.apply(position(rows), 0, { type: "pass" });
    expect(goBotMove(s, 1, { playouts: 200 }, mulberry32(3))).toEqual({ type: "pass" });
  });

  it("agrees to the game's own marking, plays on once against one that costs it, and then lets it stand", () => {
    const rows = [". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", "O . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . .", ". . X O . . . . ."];
    const s = go.apply(go.apply(position(rows), 0, { type: "pass" }), 1, { type: "pass" });
    expect(s.dead).toEqual([36]);
    for (const seat of [0, 1]) expect(go.bot(s, seat, SHARP)).toEqual({ type: "agree" });
    // White says its dead stone is alive. That costs Black, who plays on; White is glad of it.
    const cheeky = go.apply(s, 1, { type: "toggle", cell: 36 });
    expect(go.bot(cheeky, 0, SHARP)).toEqual({ type: "resume" });
    expect(go.bot(cheeky, 1, SHARP)).toEqual({ type: "agree" });
    // Whether to argue doesn't depend on how well it plays.
    expect(go.bot(cheeky, 0, QUICK_STYLE, undefined, QUICK_BUDGET)).toEqual({ type: "resume" });
    // Having agreed, it has nothing more to do.
    expect(go.bot(go.apply(s, 0, { type: "agree" }), 0, SHARP)).toBeNull();
    // After the game has been played on once, it lets the same marking stand.
    const on = go.apply(cheeky, 0, { type: "resume" });
    const back = go.apply(go.apply(go.apply(on, 1, { type: "pass" }), 0, { type: "pass" }), 1, { type: "toggle", cell: 36 });
    expect(back).toMatchObject({ phase: "counting", dead: [], resumes: 1 });
    expect(go.bot(back, 0, SHARP)).toEqual({ type: "agree" });
  });

  it("two of them finish a game on the full board, in a state that stays small", () => {
    const rand = mulberry32(11);
    let s = go.newGame(fullGo as never, 2, 8);
    let moves = 0;
    let biggest = 0;
    while (!go.summary(s).over) {
      const seat = [0, 1].find((x) => go.bot(s, x, QUICK_STYLE, () => 0.999) !== null)!;
      s = go.apply(s, seat, go.bot(s, seat, { skill: 0.6, sloppy: 0 }, rand)!);
      biggest = Math.max(biggest, JSON.stringify(s).length);
      if (++moves > 1200) throw new Error("the game went on too long");
    }
    expect(moves).toBeGreaterThan(150);
    expect(go.summary(s).scoreLine).toMatch(/^\d+(\.5)? to \d+(\.5)?$/);
    // The board, a number for each position it has been in, and the last two turns for taking back.
    expect(biggest).toBeLessThan(40_000);
  }, 60_000);
});
