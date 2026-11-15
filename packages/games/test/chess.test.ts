// Chess: the move generator against the published perft counts, the rules that end a game, the
// notation (SAN, FEN, PGN), Chess960 castling, the clock, what a seat sees, and the computer player's
// discipline (its budget, its determinism, what each skill will and won't do).
import { mulberry32 } from "@spades/rules";
import { describe, expect, it } from "vitest";
import { GameError, blitzChess, bulletChess, cellsAfter, chess, chess960, chess960Row, chessFen, chessFromFen, chessMove, chessPerft, chessPgn, chessThink, classicChess, correspondenceChess, movesOffered, type BoardView, type ChessMove, type ChessState } from "../src/index.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const cell = (name: string) => (8 - Number(name[1])) * 8 + name.charCodeAt(0) - 97;
const apply = (s: ChessState, seat: number, move: unknown, time?: { elapsed: number }) => chess.apply(s, seat, move as ChessMove, time) as ChessState;
/** Play moves given in notation, each by whoever's turn it is. */
function play(s: ChessState, ...sans: string[]): ChessState {
  for (const san of sans) {
    const move = chessMove(s, san);
    expect(move, `${san} in ${chessFen(s)}`).not.toBeNull();
    s = apply(s, s.turn, move);
  }
  return s;
}
const fresh = (rules = classicChess) => chess.newGame({ ...rules, white: "seat1" }, 2, 1) as ChessState;
const sans = (s: ChessState) => s.record.map((p) => p.san);

describe("move generation (perft)", () => {
  // The counts are the published ones (the Chess Programming Wiki's "Perft Results", positions 1 to
  // 6): the start, "Kiwipete" (castling both ways, pins, en passant, promotions), an endgame full
  // of en passant and discovered checks, two built round promotions and castling rights, and a
  // quiet middlegame.
  const positions: [string, string, number[]][] = [
    ["the start", START, [20, 400, 8902, 197281, 4865609]],
    ["Kiwipete", KIWIPETE, [48, 2039, 97862, 4085603]],
    ["position 3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238, 674624]],
    ["position 4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467, 422333]],
    ["position 5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379, 2103487]],
    ["position 6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", [46, 2079, 89890, 3894594]],
  ];
  for (const [name, fen, counts] of positions) {
    it(`${name}, to depth ${counts.length}`, () => {
      counts.forEach((count, i) => expect(chessPerft(chessFromFen(fen), i + 1), `depth ${i + 1}`).toBe(count));
    }, 60_000);
  }

  it("Chess960 positions, with castling written by the rooks' files", () => {
    // From the Chess960 perft set that engines are checked against (its first two positions).
    expect([1, 2, 3, 4].map((d) => chessPerft(chessFromFen("bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9", chess960), d))).toEqual([21, 528, 12189, 326672]);
    expect([1, 2, 3, 4].map((d) => chessPerft(chessFromFen("2nnrbkr/p1qppppp/8/1ppb4/6PP/3PP3/PPP2P2/BQNNRBKR w HEhe - 1 9", chess960), d))).toEqual([21, 807, 18002, 667366]);
  }, 60_000);
});

describe("how a game ends", () => {
  it("checkmate wins, and is written with a #", () => {
    const s = play(fresh(), "f3", "e5", "g4", "Qh4");
    expect(sans(s)).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(chess.summary(s)).toMatchObject({ over: true, winners: [1], scoreLine: "0 to 1" });
    const v = chess.view(s, 0);
    expect(v.over!.title).toBe("{1} wins!");
    // The mated king stays marked.
    expect(v.grids[0]!.marks).toContainEqual({ cell: cell("e1"), mark: "threat" });
    expect(() => apply(s, 0, { type: "move", from: cell("e2"), to: cell("e4") })).toThrow("over");
  });

  it("stalemate is a draw", () => {
    const s = play(chessFromFen("7k/8/5Q2/8/8/8/8/K7 w - - 0 1"), "Qf7");
    expect(s.narration).toContain("Stalemate");
    expect(chess.summary(s)).toMatchObject({ over: true, winners: [0, 1], scoreLine: "0 to 0 · 1 drawn" });
  });

  it("is drawn when neither side could ever mate", () => {
    // King and bishop against a king, once the last pawn is taken.
    expect(play(chessFromFen("8/8/4k3/8/8/8/1p6/1K4B1 w - - 0 1"), "Kxb2").narration).toContain("enough left");
    // Bishops on the same colour of square, one each: still nothing to mate with.
    expect(play(chessFromFen("8/8/4k3/8/5b2/8/1p6/1K4B1 w - - 0 1"), "Kxb2").phase).toBe("finished");
    // A knight and a bishop can: the game goes on.
    expect(play(chessFromFen("8/8/4k3/8/8/8/1p6/1K3NB1 w - - 0 1"), "Kxb2").phase).toBe("playing");
    // So can bishops on both colours.
    expect(play(chessFromFen("8/8/4k3/8/4b3/8/1p6/1K4B1 w - - 0 1"), "Kxb2").phase).toBe("playing");
  });

  it("lets either player claim the same position three times, and draws it at five", () => {
    const round = ["Nf3", "Nf6", "Ng1", "Ng8"];
    let s = play(fresh(), ...round);
    expect(() => apply(s, 0, { type: "claim" })).toThrow(GameError);
    expect(chess.view(s, 0).choices).toBeNull();
    s = play(s, ...round);
    // The starting position, for the third time.
    for (const seat of [0, 1]) expect(chess.view(s, seat).choices!.options).toEqual([{ label: "Claim a draw", move: { type: "claim" }, hint: "The same position three times" }]);
    expect(chess.view(s, 0).info).toContain("The same position three times: either player can claim a draw");
    const claimed = apply(s, 1, { type: "claim" });
    expect(claimed.narration).toBe("{1} claims a draw. The same position three times: it's a draw");
    expect(chess.summary(claimed)).toMatchObject({ over: true, winners: [0, 1] });
    // Played on, it is nobody's choice the fifth time.
    s = play(s, ...round, ...round.slice(0, 3));
    expect(s.phase).toBe("playing");
    s = play(s, "Ng8");
    expect(s.narration).toBe("The same position five times: it's a draw");
  });

  it("doesn't count a position as the same when the castling rights or the en passant capture differ", () => {
    // The rook goes out and back: the pieces stand as before, but White can no longer castle king side.
    let s = play(chessFromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "Rg1", "Rg8", "Rh1", "Rh8");
    expect(chessFen(s)).toBe("r3k2r/8/8/8/8/8/8/R3K2R w Qq - 4 3");
    s = play(s, "Rg1", "Rg8", "Rh1", "Rh8");
    expect(chess.view(s, 0).choices).toBeNull();
    s = play(s, "Rg1", "Rg8", "Rh1", "Rh8");
    expect(chess.view(s, 0).choices!.options[0]!.label).toBe("Claim a draw");
    // After e4 with a black pawn on d4 the capture is there once only; the position without it is another.
    let e = play(chessFromFen("4k3/8/8/8/3p4/8/4P3/4K2N w - - 0 1"), "e4", "Kd8", "Ng3", "Ke8", "Nh1", "Kd8", "Ng3", "Ke8", "Nh1");
    expect(chess.view(e, 0).choices).toBeNull();
    e = play(e, "Kd8", "Ng3", "Ke8", "Nh1");
    expect(chess.view(e, 0).choices).not.toBeNull();
  });

  it("lets either player claim after fifty moves, and draws it at seventy-five", () => {
    let s = chessFromFen("8/8/8/4k3/8/8/4K3/R7 w - - 98 60");
    expect(chess.view(s, 0).info.join()).toContain("A draw can be claimed in 1 more move each");
    s = play(s, "Ra2");
    expect(() => apply(s, 0, { type: "claim" })).toThrow(GameError);
    s = play(s, "Kd5");
    expect(apply(s, 0, { type: "claim" }).narration).toBe("{0} claims a draw. Fifty moves with no capture and no pawn moved: it's a draw");
    const late = play(chessFromFen("8/8/8/4k3/8/8/4K3/R7 w - - 149 90"), "Ra2");
    expect(late.narration).toBe("Seventy-five moves with no capture and no pawn moved: it's a draw");
    // Mate on the move that would have been the seventy-fifth still wins.
    expect(play(chessFromFen("7k/8/6K1/8/8/8/8/R7 w - - 149 90"), "Ra8").narration).toContain("Checkmate");
  });

  it("plays a match with colours changing every game", () => {
    let s = chess.newGame({ ...classicChess, white: "seat2", games: 2 }, 2, 3) as ChessState;
    expect([s.white, s.turn]).toEqual([1, 1]);
    s = play(s, "f3", "e5", "g4", "Qh4");
    expect([s.phase, s.wins]).toEqual(["scored", [1, 0]]);
    expect(chess.view(s, 0).result!.title).toBe("{0} wins game 1");
    s = apply(apply(s, 0, { type: "next" }), 1, { type: "next" });
    expect([s.round, s.white, s.turn, s.record.length]).toEqual([2, 0, 0, 0]);
    s = play(s, "f3", "e5", "g4", "Qh4");
    expect(chess.summary(s)).toMatchObject({ over: true, winners: [0, 1], scoreLine: "1 to 1" });
    expect(chess.view(s, 0).over!.title).toBe("The match is drawn");
  });
});

describe("notation", () => {
  it("writes a whole game, and exports it as PGN", () => {
    // Morphy against the Duke of Brunswick and Count Isouard, Paris 1858.
    const moves = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
    const s = play(fresh(), ...moves);
    expect(sans(s)).toEqual(moves);
    expect(chess.summary(s)).toMatchObject({ over: true, winners: [0] });
    expect(chessFen(s)).toBe("1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17");
    expect(chessPgn(s, ["Morphy", "The Duke"])).toBe(
      [
        '[Event "Card Room"]',
        '[Site "?"]',
        '[Date "????.??.??"]',
        '[Round "1"]',
        '[White "Morphy"]',
        '[Black "The Duke"]',
        '[Result "1-0"]',
        '[TimeControl "-"]',
        "",
        "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8.",
        "Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14.",
        "Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0",
        "",
      ].join("\n"),
    );
    // The view carries the same record, and the PGN with the seats for the table to name.
    const v = chess.view(s, 1);
    expect(v.record!.moves.map((m) => m.label)).toEqual(moves);
    expect(v.record!.moves.slice(0, 3).map((m) => [m.turn, m.by])).toEqual([[1, 0], [1, 1], [2, 0]]);
    expect(v.record!.export).toMatchObject({ label: "PGN" });
    expect(v.record!.export!.text).toContain('[White "{0}"]');
  });

  it("says which piece when two could go there: by file, by rank, or both", () => {
    expect(sans(play(chessFromFen("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1"), "R1a3"))).toEqual(["R1a3"]);
    expect(sans(play(chessFromFen("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1"), "R5a3"))).toEqual(["R5a3"]);
    expect(sans(play(chessFromFen("4k3/8/8/8/8/8/4K3/R6R w - - 0 1"), "Rad1"))).toEqual(["Rad1"]);
    // The king is in the other rook's way: nothing to tell apart.
    expect(sans(play(chessFromFen("4k3/8/8/8/8/8/8/R3K2R w - - 0 1"), "Rd1"))).toEqual(["Rd1"]);
    expect(sans(play(chessFromFen("1k6/8/8/8/4Q2Q/8/K7/7Q w - - 0 1"), "Qh4e1"))).toEqual(["Qh4e1"]);
    // A pinned knight isn't a rival: it couldn't go there.
    expect(sans(play(chessFromFen("4k3/4r3/8/8/8/8/4N3/1N2K3 w - - 0 1"), "Nc3"))).toEqual(["Nc3"]);
    // Not a legal move, however it is written.
    expect(chessMove(chessFromFen("4k3/4r3/8/8/8/8/4N3/1N2K3 w - - 0 1"), "Nec3")).toBeNull();
  });

  it("writes castling, en passant, promotion and check", () => {
    let s = play(chessFromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "O-O", "O-O-O");
    expect(sans(s)).toEqual(["O-O", "O-O-O"]);
    expect(chessFen(s)).toBe("2kr3r/8/8/8/8/8/8/R4RK1 w - - 2 2");
    // Zeros are understood too, and so are plain squares.
    expect(chessMove(chessFromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "0-0-0")).toEqual({ type: "move", from: cell("e1"), to: cell("c1") });
    expect(chessMove(chessFromFen(START), "g1f3")).toEqual({ type: "move", from: cell("g1"), to: cell("f3") });
    // En passant: the pawn is taken from beside, not from where the capturer lands.
    s = play(chessFromFen("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1"), "e4");
    expect(chessFen(s)).toBe("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
    s = play(s, "dxe3");
    expect(chessFen(s)).toBe("4k3/8/8/8/8/4p3/8/4K3 w - - 0 2");
    expect(s.narration).toBe("{1} plays dxe3: pawn d4 takes the pawn on e3 in passing");
    expect(s.taken).toEqual(["", "p"]);
    // Only on the very next move.
    const waited = play(chessFromFen("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1"), "e4", "Kd7", "Kd1");
    expect(chessMove(waited, "dxe3")).toBeNull();
    // Promotion, with a capture and a check.
    s = play(chessFromFen("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1"), "axb8=R+");
    expect(sans(s)).toEqual(["axb8=R+"]);
    expect(s.cells[cell("b8")]).toMatchObject({ c: 0, k: "r" });
    expect(sans(play(chessFromFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"), "a8=N"))).toEqual(["a8=N"]);
  });

  it("reads and writes FEN", () => {
    const fens = [
      START,
      KIWIPETE,
      "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
      "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
      "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
      "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
      "8/8/8/4k3/8/8/4K3/R7 b - - 37 112",
      "bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9",
    ];
    for (const fen of fens) expect(chessFen(chessFromFen(fen))).toBe(fen);
    // Chess960 rights written the old way mean the outermost rook on that side.
    expect(chessFen(chessFromFen("bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w KQkq - 2 9"))).toContain(" HFhf ");
    for (const junk of ["", "hello", "8/8/8/8/8/8/8/8 w - - 0 1", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1", "rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", `${START.split(" ")[0]} x KQkq - 0 1`]) expect(() => chessFromFen(junk), junk).toThrow(GameError);
    // Black to move first, and the record numbers it so.
    const s = play(chessFromFen("4k3/8/8/8/8/8/8/4K2R b K - 0 30", classicChess, 1), "Kd7", "O-O");
    expect(s.white).toBe(1);
    expect(chessPgn(s)).toContain("30... Kd7 31. O-O *");
    expect(chessPgn(s)).toContain('[FEN "4k3/8/8/8/8/8/8/4K2R b K - 0 30"]');
  });
});

describe("the rules of moving", () => {
  it("refuses what isn't legal, and says why", () => {
    const s = fresh();
    const refuse = (state: ChessState, seat: number, move: unknown, why: string) => expect(() => apply(state, seat, move)).toThrow(why);
    refuse(s, 1, { type: "move", from: cell("e7"), to: cell("e5") }, "not your turn");
    refuse(s, 0, { type: "move", from: cell("e7"), to: cell("e5") }, "not your piece");
    refuse(s, 0, { type: "move", from: cell("e2"), to: cell("e5") }, "can't go there");
    refuse(s, 0, { type: "move", from: 64, to: 0 }, "not on the board");
    refuse(s, 0, { type: "timeout" }, "no clock");
    // In check, only a move that deals with it.
    const checked = play(fresh(), "e4", "e5", "Qh5", "Nc6", "Qxf7");
    refuse(checked, 1, { type: "move", from: cell("a7"), to: cell("a6") }, "in check");
    expect(chess.view(checked, 1).players[1]!.badge).toBe("Check");
    expect(movesOffered(chess.view(checked, 1))).toEqual([{ type: "move", from: cell("e8"), to: cell("f7") }]);
    // A pinned piece stays put.
    const pinned = chessFromFen("4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1");
    refuse(pinned, 0, { type: "move", from: cell("e2"), to: cell("c3") }, "can't go there");
  });

  it("castles only when it may", () => {
    const can = (fen: string, san: string) => chessMove(chessFromFen(fen), san) !== null;
    expect(can("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "O-O")).toBe(true);
    expect(can("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "O-O-O")).toBe(true);
    // Not without the right, out of check, through an attacked square, or onto one.
    expect(can("r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1", "O-O")).toBe(false);
    expect(can("r3k2r/8/8/8/8/8/4r3/R3K2R w KQ - 0 1", "O-O")).toBe(false);
    expect(can("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1", "O-O")).toBe(false);
    expect(can("4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1", "O-O")).toBe(false);
    // The rook may cross an attacked square (b1); the king may not (d1).
    expect(can("4k3/8/8/8/8/8/1r6/R3K2R w KQ - 0 1", "O-O-O")).toBe(true);
    expect(can("4k3/8/8/8/8/8/3r4/R3K2R w KQ - 0 1", "O-O-O")).toBe(false);
    // Not with anything in between.
    expect(can("4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1", "O-O-O")).toBe(false);
    // Moving the king or the rook gives the right up for good; a rook taken at home takes it away.
    const moved = play(chessFromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "Ke2", "Ra7", "Ke1", "Ra8");
    expect(chessFen(moved)).toBe("r3k2r/8/8/8/8/8/8/R3K2R w k - 4 3");
    expect(chessFen(play(chessFromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "Rxa8+"))).toBe("R3k2r/8/8/8/8/8/8/4K2R b Kk - 0 1");
  });

  it("asks what a pawn becomes, queen first, and takes any of the four", () => {
    const s = chessFromFen("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const grid = chess.view(s, 0).grids[0]!;
    expect(grid.select!.choose!.map((c) => [c.from, c.to, c.key, c.options.map((o) => o.kind)])).toEqual([
      [cell("a7"), cell("a8"), "as", ["queen", "rook", "bishop", "knight"]],
      [cell("a7"), cell("b8"), "as", ["queen", "rook", "bishop", "knight"]],
    ]);
    expect(movesOffered(chess.view(s, 0)).filter((m) => m.from === cell("a7"))).toHaveLength(8);
    expect(() => apply(s, 0, { type: "move", from: cell("a7"), to: cell("a8") })).toThrow("Choose what the pawn becomes");
    expect(() => apply(s, 0, { type: "move", from: cell("a7"), to: cell("a8"), as: "king" })).toThrow("Choose what the pawn becomes");
    const knight = apply(s, 0, { type: "move", from: cell("a7"), to: cell("a8"), as: "knight" });
    // The same piece, by its id: a pawn that became a knight.
    expect(knight.cells[cell("a8")]).toEqual({ ...s.cells[cell("a7")]!, k: "n" });
    expect(chess.view(knight, 0).grids[0]!.cells[cell("a8")]).toMatchObject({ kind: "knight", label: "white knight", tone: "light", owner: 0 });
  });
});

describe("Chess960", () => {
  it("has 960 different starting rows, each with bishops on opposite colours and the king between the rooks", () => {
    const rows = Array.from({ length: 960 }, (_, n) => chess960Row(n).join(""));
    expect(new Set(rows).size).toBe(960);
    expect(rows[518]).toBe("rnbqkbnr");
    for (const row of rows) {
      expect([...row].sort().join("")).toBe("bbknnqrr");
      const [b1, b2] = [row.indexOf("b"), row.lastIndexOf("b")];
      expect((b1 + b2) % 2).toBe(1);
      expect(row.indexOf("r") < row.indexOf("k") && row.indexOf("k") < row.lastIndexOf("r")).toBe(true);
    }
  });

  it("starts both sides from the same row, keeps it for a pair of games, and says so", () => {
    let s = chess.newGame({ ...chess960, games: 4 }, 2, 77) as ChessState;
    const row = chess960Row(s.setup).join("");
    expect(s.start).toBe(`${row}/pppppppp/8/8/8/8/PPPPPPPP/${row.toUpperCase()} w ${s.start.split(" ")[2]} - 0 1`);
    expect(chess.view(s, 0).info).toContain(`Chess960, starting row ${s.setup}`);
    expect(chessPgn(s)).toContain('[Variant "Chess960"]');
    expect(chessPgn(s)).toContain(`[FEN "${s.start}"]`);
    const first = s.setup;
    const rows = [first];
    for (let game = 2; game <= 4; game++) {
      s = apply(s, s.turn, { type: "resign" });
      s = apply(apply(s, 0, { type: "next" }), 1, { type: "next" });
      rows.push(s.setup);
    }
    expect(rows[1]).toBe(first);
    expect(rows[3]).toBe(rows[2]);
    expect(rows[2]).not.toBe(first);
  });

  it("castles to the usual squares from wherever the king and rook start", () => {
    const castle = (fen: string, from: string, onto: string) => apply(chessFromFen(fen, chess960), 0, { type: "move", from: cell(from), to: cell(onto) });
    // The king and rook swap: king f1 to g1, rook g1 to f1.
    let s = castle("4k3/8/8/8/8/8/8/5KR1 w G - 0 1", "f1", "g1");
    expect([chessFen(s), sans(s)]).toEqual(["4k3/8/8/8/8/8/8/5RK1 b - - 1 1", ["O-O"]]);
    // The king is already where it ends up: only the rook moves.
    s = castle("4k3/8/8/8/8/8/8/1RK5 w B - 0 1", "c1", "b1");
    expect([chessFen(s), sans(s)]).toEqual(["4k3/8/8/8/8/8/8/2KR4 b - - 1 1", ["O-O-O"]]);
    // A long way: king b1 to g1, rook h1 to f1.
    s = castle("4k3/8/8/8/8/8/8/1K5R w H - 0 1", "b1", "h1");
    expect(chessFen(s)).toBe("4k3/8/8/8/8/8/8/5RK1 b - - 1 1");
    // The rook lands where the king stood: king d1 to c1, rook a1 to d1.
    s = castle("4k3/8/8/8/8/8/8/R2K4 w A - 0 1", "d1", "a1");
    expect(chessFen(s)).toBe("4k3/8/8/8/8/8/8/2KR4 b - - 1 1");
    // Castling is offered as the king onto its rook, and never as the king's own square.
    const offered = movesOffered(chess.view(chessFromFen("4k3/8/8/8/8/8/8/1RK5 w B - 0 1", chess960), 0));
    expect(offered).toContainEqual({ type: "move", from: cell("c1"), to: cell("b1") });
    expect(offered).not.toContainEqual({ type: "move", from: cell("c1"), to: cell("c1") });
    // The record can be walked back through a castling where the two cross.
    const v = chess.view(s, 0);
    expect(cellsAfter(v.grids[0]!.cells, v.record!, 0).map((p) => p?.kind ?? "").join(",")).toBe(chess.view(chessFromFen("4k3/8/8/8/8/8/8/R2K4 w A - 0 1", chess960), 0).grids[0]!.cells.map((p) => p?.kind ?? "").join(","));
  });

  it("refuses to castle through an attack, past a piece, or out from behind a rook that was shielding the king", () => {
    const can = (fen: string, san: string) => chessMove(chessFromFen(fen, chess960), san) !== null;
    expect(can("4k3/8/8/8/8/8/8/1K5R w H - 0 1", "O-O")).toBe(true);
    // The king would cross f1, which a rook attacks.
    expect(can("4k3/8/8/8/8/8/5r2/1K5R w H - 0 1", "O-O")).toBe(false);
    // A knight stands on the king's way.
    expect(can("4k3/8/8/8/8/8/8/1K1N3R w H - 0 1", "O-O")).toBe(false);
    // With the rook gone from b1 the king on c1 would be in check from a1.
    expect(can("4k3/8/8/8/8/8/8/rRK5 w B - 0 1", "O-O-O")).toBe(false);
    // The other rook is in the way of the castling rook's square.
    expect(can("bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9", "O-O")).toBe(false);
  });
});

describe("the clock", () => {
  const blitz = () => fresh(blitzChess);
  const clocks = (s: ChessState) => chess.view(s, 0).players.map((p) => p.clock);

  it("starts when White has moved, runs down on your own turn, and adds the increment", () => {
    let s = blitz();
    expect(s.bank).toEqual([180_000, 180_000]);
    expect(chess.deadline!(s)).toBeNull();
    expect(clocks(s)).toEqual([{ ms: 180_000, running: false }, { ms: 180_000, running: false }]);
    expect(chess.view(s, 0).info).toContain("Clock: 3+2, from White's first move");
    // However long White takes over the first move, it costs nothing.
    s = apply(s, 0, chessMove(s, "e4"), { elapsed: 30_000 });
    expect(s.bank).toEqual([182_000, 180_000]);
    expect(chess.deadline!(s)).toEqual({ after: 180_000, seat: 1, move: { type: "timeout" }, strict: true });
    expect(clocks(s)).toEqual([{ ms: 182_000, running: false }, { ms: 180_000, running: true }]);
    s = apply(s, 1, chessMove(s, "e5"), { elapsed: 10_000 });
    expect(s.bank).toEqual([182_000, 172_000]);
    s = apply(s, 0, chessMove(s, "Nf3"), { elapsed: 1500 });
    expect(s.bank).toEqual([182_500, 172_000]);
    expect(chess.deadline!(s)).toMatchObject({ after: 172_000, seat: 1 });
  });

  it("isn't stretched by an offer: the time spent asking and answering is the mover's", () => {
    let s = play(blitz(), "e4", "e5");
    expect(s.bank).toEqual([182_000, 182_000]);
    // White, to move, offers a draw four seconds in; Black takes three to say no.
    s = apply(s, 0, { type: "offer", offer: "draw" }, { elapsed: 4000 });
    expect(chess.deadline!(s)).toMatchObject({ after: 178_000, seat: 0 });
    expect(clocks(s)).toEqual([{ ms: 178_000, running: true }, { ms: 182_000, running: false }]);
    expect(chess.spent!(s)).toBe(4000);
    s = apply(s, 1, { type: "decline" }, { elapsed: 3000 });
    expect(chess.deadline!(s)).toMatchObject({ after: 175_000, seat: 0 });
    // The move itself, a second later: eight seconds gone in all, and two back.
    s = apply(s, 0, chessMove(s, "Nf3"), { elapsed: 1000 });
    expect(s.bank).toEqual([176_000, 182_000]);
    expect(chess.spent!(s)).toBe(0);
    // No taking back against the clock.
    expect(chess.view(play(blitz(), "e4", "e5"), 0).offers!.can).toEqual(["resign", "draw"]);
    expect(() => apply(s, 0, { type: "offer", offer: "takeback" })).toThrow("switched off");
    expect(chess.view(play(fresh(), "e4"), 0).offers!.can).toEqual(["resign", "draw", "takeback"]);
  });

  it("loses on time, unless the other side has nothing to mate with", () => {
    let s = play(blitz(), "e4", "e5");
    expect(() => apply(s, 0, { type: "timeout" }, { elapsed: 5000 })).toThrow("still running");
    expect(() => apply(s, 1, { type: "timeout" }, { elapsed: 200_000 })).toThrow("not your turn");
    s = apply(s, 0, { type: "timeout" }, { elapsed: 182_000 });
    expect(s.narration).toBe("{0} ran out of time: {1} wins!");
    expect(s.bank).toEqual([0, 182_000]);
    expect(chess.summary(s)).toMatchObject({ over: true, winners: [1] });
    expect(chess.deadline!(s)).toBeNull();
    const flag = (fen: string) => {
      const state = { ...chessFromFen(fen, bulletChess), ticking: true };
      return apply(state, state.turn, { type: "timeout" }, { elapsed: 60_000 }).narration;
    };
    // A lone king can't win on time; nor a king and a knight against a king and queen.
    expect(flag("8/8/8/8/8/4k3/8/4K2Q w - - 0 1")).toBe("{0} ran out of time, but {1} has nothing to mate with: it's a draw");
    expect(flag("8/8/8/8/8/4kn2/8/4K2Q w - - 0 1")).toContain("it's a draw");
    // A knight could mate a king hemmed in by its own pawn; a pawn can always become something.
    expect(flag("8/8/8/8/8/4kn2/7P/4K3 w - - 0 1")).toBe("{0} ran out of time: {1} wins!");
    expect(flag("8/8/8/8/8/4k3/4p3/4K2Q w - - 0 1")).toBe("{0} ran out of time: {1} wins!");
    // A move that comes in as the flag falls stands, with nothing left but the increment.
    const late = apply(play(blitz(), "e4", "e5"), 0, { type: "move", from: cell("g1"), to: cell("f3") }, { elapsed: 182_300 });
    expect(late.bank).toEqual([2000, 182_000]);
  });

  it("gives a day a move in correspondence play", () => {
    let s = fresh(correspondenceChess);
    expect(chess.deadline!(s)).toBeNull();
    s = play(s, "e4");
    expect(chess.deadline!(s)).toEqual({ after: 86_400_000, seat: 1, move: { type: "timeout" }, strict: true });
    expect(clocks(s)).toEqual([undefined, { ms: 86_400_000, running: true }]);
    expect(apply(s, 1, { type: "timeout" }, { elapsed: 86_400_000 }).narration).toBe("{1} ran out of time: {0} wins!");
  });

  it("keeps a clock and a time for each move apart in the rules", () => {
    expect(chess.validate({ ...blitzChess, days: 1 })).toHaveLength(1);
    expect(chess.validate({ ...classicChess, increment: 5 })).toHaveLength(1);
    expect(chess.normalize({ ...blitzChess, days: 1 })).toMatchObject({ minutes: 3, increment: 2, days: 0 });
    expect(chess.normalize({ id: "chess-classic", increment: 5 })).toMatchObject({ minutes: 0, increment: 0 });
    expect(chess.normalize({ minutes: 1e9, increment: -4, games: 5, hints: false })).toMatchObject({ minutes: 180, increment: 0, games: 1, hints: false });
  });
});

describe("what a seat sees", () => {
  it("draws the board from your own side, with the pieces named by kind", () => {
    const s = fresh();
    const [white, black] = [chess.view(s, 0), chess.view(s, 1)];
    expect([white.grids[0]!.flip, black.grids[0]!.flip]).toEqual([false, true]);
    expect(white.grids[0]!.coords).toEqual({ cols: ["a", "b", "c", "d", "e", "f", "g", "h"], rows: ["8", "7", "6", "5", "4", "3", "2", "1"] });
    expect(white.grids[0]!.cells[cell("g1")]).toEqual({ owner: 0, kind: "knight", glyph: "♘", label: "white knight", tone: "light", id: "c30" });
    expect(white.grids[0]!.cells[cell("d8")]).toMatchObject({ owner: 1, kind: "queen", label: "black queen", tone: "dark" });
    expect(white.players.map((p) => [p.line, p.piece!.kind])).toEqual([["White", "king"], ["Black", "king"]]);
    // Twenty moves to start with, and none for the seat that isn't to move.
    expect(movesOffered(white)).toHaveLength(20);
    expect(black.grids[0]!.select).toBeNull();
    expect(white.narration).toBe("You're White: you move first");
    expect(black.narration).toBe("{0} is White, and moves first");
  });

  it("marks the last move and a king in check, and counts what has been taken", () => {
    const s = play(fresh(), "e4", "d5", "exd5", "Qxd5", "Nc3", "Qe5");
    const v = chess.view(s, 0);
    expect(v.grids[0]!.marks).toEqual([{ cell: cell("d5"), mark: "from" }, { cell: cell("e5"), mark: "last" }, { cell: cell("e1"), mark: "threat" }]);
    expect(v.narration).toBe("{1} plays Qe5+: queen d5 to e5, check");
    expect(v.reserves.map((r) => r.pieces.filter((p) => p.count).map((p) => [p.piece.label, p.count]))).toEqual([[["black pawn", 1]], [["white pawn", 1]]]);
    const up = chess.view(play(s, "Be2", "Qxe2", "Qxe2"), 0);
    expect(up.players.map((p) => p.line)).toEqual(["White · +6", "Black"]);
  });

  it("can hide where a piece may go, for a table that wants it", () => {
    expect(chess.view(fresh(), 0).grids[0]!.select!.quiet).toBeUndefined();
    expect(chess.view(fresh({ ...classicChess, hints: false }), 0).grids[0]!.select!.quiet).toBe(true);
  });

  it("keeps every piece's id for the whole game, and a record that walks back to the start", () => {
    // Castling both ways, a capture, an en passant capture and a promotion that takes.
    let s = play(fresh(), "e4", "Nf6", "e5", "d5", "exd6", "e6", "dxc7", "Bd6", "cxb8=Q", "O-O", "Nf3", "Rxb8", "Bc4", "b5", "O-O", "bxc4");
    const ids = (v: BoardView) => v.grids[0]!.cells.flatMap((p) => (p ? [p.id!] : []));
    const start = chess.view(fresh(), 0);
    const v = chess.view(s, 0);
    expect(new Set(ids(v)).size).toBe(ids(v).length);
    for (const id of ids(v)) expect(ids(start)).toContain(id);
    // The queen on b8 came and went: the e-pawn's id became a queen, and was taken.
    expect(v.record!.moves[8]!.changes).toEqual([
      { id: "c1", from: cell("b8"), to: null, was: expect.objectContaining({ kind: "knight", owner: 1 }) },
      { id: "c20", from: cell("c7"), to: cell("b8"), was: expect.objectContaining({ kind: "pawn", owner: 0, id: "c20" }) },
    ]);
    for (let count = s.record.length; count >= 0; count--) {
      const want = chess.view(play(fresh(), ...sans(s).slice(0, count)), 0).grids[0]!.cells;
      expect(cellsAfter(v.grids[0]!.cells, v.record!, count), `after ${count} moves`).toEqual(want);
    }
    // The seat playing Black is told the same record.
    expect(chess.view(s, 1).record).toEqual(v.record);
    s = play(s, "Re1");
    expect(chess.view(s, 0).record!.moves).toHaveLength(17);
  });
});

describe("the computer player", () => {
  const rand = (seed = 1) => mulberry32(seed);
  const top = { skill: 1, sloppy: 0 };
  const middle = { skill: 0.65, sloppy: 0 };
  const low = { skill: 0.25, sloppy: 0 };
  const moveOf = (s: ChessState, style: object, budget?: { ms: number }, seed = 1) => chess.bot(s, s.turn, style, rand(seed), budget) as ChessMove & { from: number; to: number };

  it("plays the same move from the same position, style and dice when no clock is running", () => {
    const s = chessFromFen(KIWIPETE);
    for (const style of [top, middle, low]) {
      for (const budget of [undefined, { ms: 400 }]) {
        const first = moveOf(s, style, budget, 9);
        for (let i = 0; i < 3; i++) expect(moveOf(s, style, budget, 9)).toEqual(first);
      }
    }
    // A bigger budget is a bigger ration of work, and a deeper look.
    const small = chessThink(s, top, rand(), { ms: 20 })!;
    const big = chessThink(s, top, rand(), { ms: 1500 })!;
    expect(small.nodes).toBeLessThanOrEqual(2001);
    expect(big.nodes).toBeGreaterThan(small.nodes);
    expect(big.depth).toBeGreaterThan(small.depth);
    expect(big.timedOut).toBe(false);
    // Lower skills look less far, whatever they are given.
    expect(chessThink(s, middle, rand(), { ms: 1500 })!.depth).toBeLessThanOrEqual(4);
    expect(chessThink(s, low, rand(), { ms: 1500 })!.depth).toBeLessThanOrEqual(2);
  });

  it("keeps to the time it is given on the clock, down to ten milliseconds", () => {
    const clocked = { ...chessFromFen(KIWIPETE, blitzChess), ticking: true };
    // Warm, as a table's worker is before its first think.
    for (let i = 0; i < 5; i++) chessThink(clocked, top, rand(), { ms: 50 });
    for (const ms of [10, 30, 100]) {
      const took: number[] = [];
      for (let i = 0; i < 7; i++) {
        const began = performance.now();
        const thought = chessThink(clocked, top, rand(i), { ms })!;
        took.push(performance.now() - began);
        expect(thought.timedOut).toBe(true);
        expect(thought.move).not.toBe(0);
      }
      took.sort((a, b) => a - b);
      // Inside the budget as a rule; one slow run (a pause in the machine, not in the search) is allowed for.
      expect(took[3]!, `${ms} ms: ${took.map((t) => t.toFixed(1)).join(", ")}`).toBeLessThanOrEqual(ms);
      expect(took[6]!).toBeLessThan(ms + 25);
    }
    // The quick move a table asks for when a think had to be given up on: no skill, no time.
    const began = performance.now();
    const quick = chess.bot(clocked, 0, { skill: 0, sloppy: 0 }, rand(), { ms: 10 });
    expect(performance.now() - began).toBeLessThan(35);
    expect(movesOffered(chess.view(clocked, 0))).toContainEqual(quick);
  });

  it("budgets its thinking from the time it has left", () => {
    const at = (bank: number, rules = blitzChess) => ({ ...chessFromFen(KIWIPETE, rules), ticking: true, bank: [bank, bank] });
    const spent = (s: ChessState, budget = { ms: 2000 }) => {
      const began = performance.now();
      chessThink(s, top, rand(), budget);
      return performance.now() - began;
    };
    // Six seconds left and none coming back: a thirtieth of the bank, less a moment to get the move in.
    const sudden = spent(at(6000, bulletChess));
    expect(sudden).toBeGreaterThan(150);
    expect(sudden).toBeLessThan(200);
    // With an increment it can spend most of that too, but never more than a quarter of what is left.
    const blitz = spent(at(1200));
    expect(blitz).toBeGreaterThan(240);
    expect(blitz).toBeLessThan(300);
    // Nearly out of time, it moves at once.
    expect(spent(at(200, bulletChess))).toBeLessThan(20);
    // And never longer than the table allows.
    expect(spent(at(600_000), { ms: 150 })).toBeLessThan(150);
    // A slower pause to match: it doesn't sit and look thoughtful with a second left.
    expect(chess.thinkingTime(at(1000, bulletChess), 0)).toBeLessThan(20);
    expect(chess.thinkingTime(at(180_000), 0)).toBeGreaterThan(500);
    expect(chess.thinkingTime(fresh(), 0)).toBeGreaterThan(500);
  }, 30_000);

  it("finds a mate in two at the top skill and a mate in one at any", () => {
    // Legall's mate: the knight checks, the pawn must take, and the bishop mates.
    const two = chessFromFen("r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1");
    expect(moveOf(two, top, { ms: 500 })).toMatchObject({ from: cell("d5"), to: cell("f6") });
    const one = chessFromFen("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
    for (const style of [top, middle, low]) expect(moveOf(one, style, { ms: 200 })).toMatchObject({ from: cell("a1"), to: cell("a8") });
    expect(moveOf(chessFromFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"), top, { ms: 200 })).toEqual({ type: "move", from: cell("a7"), to: cell("a8"), as: "queen" });
  });

  it("makes careless moves at low skill, but from the middle up never walks into mate on the move", () => {
    // Any rook move off the back row lets Black mate there.
    const s = chessFromFen("4r1k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
    const hangs = (style: object, seed: number) => {
      const after = apply(s, 0, chess.bot(s, 0, style, rand(seed), { ms: 50 }));
      return chessMove(after, "Re1") !== null && apply(after, 1, chessMove(after, "Re1")).phase !== "playing";
    };
    const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
    // Always careless, to see what a careless move is like at each level.
    expect(seeds.filter((seed) => hangs({ skill: 0.25, sloppy: 1 }, seed)).length).toBeGreaterThan(0);
    expect(seeds.filter((seed) => hangs({ skill: 0.65, sloppy: 1 }, seed))).toEqual([]);
    expect(seeds.filter((seed) => hangs({ skill: 1, sloppy: 1 }, seed))).toEqual([]);
    // A careless move is a move made without looking ahead, not a random one: it still takes a free queen.
    const free = chessFromFen("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1");
    expect(seeds.filter((seed) => (chess.bot(free, 0, { skill: 0.25, sloppy: 1 }, rand(seed)) as { to: number }).to !== cell("d5"))).toEqual([]);
  });

  it("claims a draw when it isn't winning, and plays on when it is", () => {
    const round = ["Nf3", "Nf6", "Ng1", "Ng8"];
    const level = play(fresh(), ...round, ...round);
    expect(chess.bot(level, 0, top, rand())).toEqual({ type: "claim" });
    // A queen up, with the same position for the third time.
    const ahead = play(chessFromFen("4k3/8/8/8/8/8/8/Q3K3 w - - 0 1"), "Qa2", "Kd8", "Qa1", "Ke8", "Qa2", "Kd8", "Qa1", "Ke8");
    expect(chess.view(ahead, 0).choices).not.toBeNull();
    expect(chess.bot(ahead, 0, top, rand())).toMatchObject({ type: "move" });
    expect(chess.bot(ahead, 1, top, rand())).toBeNull();
    // It turns a draw offer down when ahead and takes it when behind.
    const asked = (by: number) => chess.bot(apply(play(chessFromFen("4k3/8/8/8/8/8/8/Q3K3 w - - 0 1"), "Qa2", "Kd8"), by, { type: "offer", offer: "draw" }), 1 - by, top, rand());
    expect(asked(1)).toEqual({ type: "decline" });
    expect(asked(0)).toEqual({ type: "accept" });
  });

  it("doesn't open the same way every game, and says its think belongs off the main thread", () => {
    const s = fresh();
    const firsts = new Set(Array.from({ length: 24 }, (_, seed) => JSON.stringify(chess.bot(s, 0, top, rand(seed + 1), { ms: 100 }))));
    expect(firsts.size).toBeGreaterThan(1);
    expect([chess.heavy!(s, 0), chess.heavy!(s, 1)]).toEqual([true, false]);
    // Answering an offer is no think at all.
    expect(chess.heavy!(apply(s, 0, { type: "offer", offer: "draw" }), 1)).toBe(false);
  });
});
