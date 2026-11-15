// Offers (resign, a draw by agreement, a move taken back), first on a tiny game made up for the
// purpose, where every rule of the mechanism can be seen on its own, and then on the real games.
import { describe, expect, it } from "vitest";
import {
  americanCheckers,
  BOARD_GAMES,
  checkers,
  classicDropFour,
  classicReversi,
  classicTicTacToe,
  clone,
  combat,
  drinkingDropFour,
  dropFour,
  friendlyCheckers,
  GameError,
  go,
  hearts,
  matchRules,
  movesOffered,
  newCheckers,
  nextRandom,
  offerMoves,
  offersOf,
  quickCombat,
  reversi,
  settleMatch,
  SHOT_CLOCK_MS,
  smallGo,
  ticTacToe,
  who,
  withOffers,
  type BaseRules,
  type BoardGame,
  type BoardView,
  type CheckersState,
  type OfferMove,
  type OffersAllowed,
} from "../src/index.js";

// ---- A tiny game ----------------------------------------------------------------------------------
// Two seats take turns adding to a total; whoever brings it to the target wins. "hop" adds one and
// keeps the turn (a move made in several taps, like a run of jumps), "roll" adds what a die says
// (a random draw), and each seat holds a secret number that only its own view shows.

interface CountRules extends BaseRules {
  target: number;
  games: number;
  clock: boolean;
}
interface CountState {
  game: "tictactoe";
  rules: CountRules;
  seats: number;
  rng: number;
  round: number;
  turn: number;
  total: number;
  secrets: number[];
  roundWinner: number | null;
  wins: number[];
  draws: number;
  phase: "playing" | "scored" | "finished";
  narration: string | null;
}
type CountMove = { type: "add"; n: number } | { type: "hop" } | { type: "roll" } | { type: "next" };

const RULES: CountRules = { id: "count", name: "Count", target: 100, games: 1, clock: false };

const count: BoardGame<CountRules, CountState, CountMove> = {
  id: "tictactoe",
  name: "Count",
  emoji: "🔢",
  blurb: "",
  tagline: "",
  seats: { min: 2, max: 2, default: 2 },
  teams: false,
  presets: [RULES],
  fields: [],
  normalize: (rules) => ({ ...RULES, ...(rules as Partial<CountRules>) }),
  validate: () => [],
  describe: () => ["Count up.", "First to the target wins."],
  newGame(rules, seats, seed) {
    const s: CountState = { game: "tictactoe", rules, seats: 2, rng: seed >>> 0, round: 1, turn: 0, total: 0, secrets: [0, 0], roundWinner: null, wins: [0, 0], draws: 0, phase: "playing", narration: null };
    const rand = nextRandom(s);
    s.secrets = [Math.floor(rand() * 1000), Math.floor(rand() * 1000)];
    return s;
  },
  apply(state, seat, move) {
    if (move?.type === "next") {
      if (state.phase !== "scored") throw new GameError("There's a game going on.");
      return { ...state, round: state.round + 1, total: 0, turn: 0, roundWinner: null, phase: "playing", narration: null };
    }
    if (move?.type !== "add" && move?.type !== "hop" && move?.type !== "roll") throw new GameError("That's not a move.");
    if (state.phase !== "playing") throw new GameError("This game is over.");
    if (state.turn !== seat) throw new GameError("It's not your turn.");
    const s = clone(state);
    const n = move.type === "add" ? Number(move.n) : move.type === "hop" ? 1 : 1 + Math.floor(nextRandom(s)() * 6);
    if (!Number.isInteger(n) || n < 1 || n > 9) throw new GameError("One to nine.");
    s.total += n;
    s.narration = `${who(seat)} adds ${n}`;
    if (move.type !== "hop") s.turn = 1 - seat;
    if (s.total >= s.rules.target) {
      s.wins[seat]! += 1;
      s.roundWinner = seat;
      s.phase = s.rules.games - s.round <= 0 ? "finished" : "scored";
    }
    return s;
  },
  view(s, seat): BoardView {
    const over = s.phase === "finished";
    const w = s.wins[0] === s.wins[1] ? [0, 1] : [s.wins[0]! > s.wins[1]! ? 0 : 1];
    return {
      game: "tictactoe",
      seats: 2,
      me: seat,
      teams: false,
      phase: s.phase,
      turn: s.phase === "playing" ? s.turn : null,
      grids: [{ id: "board", label: "Board", rows: 1, cols: 1, cells: [null] }],
      reserves: [],
      choices: s.phase === "playing" && s.turn === seat ? { prompt: "", options: [{ label: "+1", move: { type: "add", n: 1 } }, { label: "Hop", move: { type: "hop" } }] } : null,
      players: [{ line: "" }, { line: "" }],
      info: [`Your secret is ${s.secrets[seat]}`],
      narration: s.narration,
      scores: s.wins.map((value, i) => ({ seats: [i], value })),
      result: null,
      over: over ? { winners: w, title: w.length > 1 ? "It's a draw!" : `${who(w[0]!)} wins!` } : null,
    };
  },
  bot: (s, seat) => (s.phase === "playing" && s.turn === seat ? { type: "add", n: 1 } : null),
  thinkingTime: () => 1000,
  deadline: (s) => (s.rules.clock && s.phase === "playing" ? { after: 3000, seat: s.turn, move: { type: "add", n: 1 } } : null),
  summary(s) {
    const over = s.phase === "finished";
    const w = s.wins[0] === s.wins[1] ? [0, 1] : [s.wins[0]! > s.wins[1]! ? 0 : 1];
    return { game: "tictactoe", rules: s.rules.name, phase: s.phase, over, hand: s.round, scoreLine: `${s.wins[0]} to ${s.wins[1]}`, order: over ? (w.length > 1 ? [1, 0] : [w[0]!, 1 - w[0]!]) : null, winners: over ? w : null, teams: false, seats: 2 };
  },
};

/** How the game stands for a seat is whatever the test says. */
let standing: number | null = null;
const g = withOffers<CountRules, CountState, CountMove>(count, { takeBack: true, settle: settleMatch, standing: () => standing });
/** The same game, saying nothing about taking back: the safe default. */
const sealed = withOffers<CountRules, CountState, CountMove>(count, { settle: settleMatch });

type Game = typeof g;
type State = ReturnType<Game["newGame"]>;
type Move = CountMove | OfferMove;
const start = (rules: Partial<CountRules> & { offers?: OffersAllowed } = {}, game: Game = g) => game.newGame(game.normalize({ ...RULES, ...rules }), 2, 7);
/** Play moves in order, each as [seat, move]. */
const run = (s: State, moves: [number, Move][], game: Game = g) => moves.reduce((state, [seat, move]) => game.apply(state, seat, move), s);
const add = (n = 1): CountMove => ({ type: "add", n });
const RESIGN: OfferMove = { type: "resign" };
const DRAW: OfferMove = { type: "offer", offer: "draw" };
const BACK: OfferMove = { type: "offer", offer: "takeback" };
const YES: OfferMove = { type: "accept" };
const NO: OfferMove = { type: "decline" };
/** The game's own state, without the wrapper's part. */
const bare = (s: object) => {
  const { offers: _, ...rest } = s as { offers?: unknown };
  return rest;
};
const refuses = (s: State, seat: number, move: Move, why: RegExp | string, game: Game = g) => {
  const before = JSON.stringify(s);
  expect(() => game.apply(s, seat, move)).toThrow(GameError);
  expect(() => game.apply(s, seat, move)).toThrow(why);
  expect(JSON.stringify(s)).toBe(before);
};

describe("resigning", () => {
  it("ends the game for the other side, on your turn or not", () => {
    for (const seat of [0, 1]) {
      const s = run(start(), [[seat, RESIGN]]);
      expect(g.summary(s)).toMatchObject({ over: true, winners: [1 - seat], order: [1 - seat, seat] });
      expect(g.view(s, 0).over).toEqual({ winners: [1 - seat], title: `{${1 - seat}} wins!` });
      expect(g.view(s, 0).narration).toBe(`{${seat}} resigns: {${1 - seat}} wins!`);
      expect(g.view(s, 1).offers).toEqual({ can: [], open: null, answer: false, last: { kind: "resign", by: seat, outcome: "accepted" } });
    }
  });

  it("is refused once the game is over, and from anyone not at the table", () => {
    const over = run(start(), [[0, RESIGN]]);
    refuses(over, 1, RESIGN, "no game being played");
    refuses(over, 0, DRAW, "no game being played");
    refuses(start(), 2, RESIGN, "not playing");
    refuses(start(), -1, DRAW, "not playing");
  });

  it("gives up the game being played, not the match", () => {
    const s = run(start({ games: 3 }), [[0, add()], [1, RESIGN]]);
    expect(g.summary(s)).toMatchObject({ over: false, phase: "scored" });
    expect(s.wins).toEqual([1, 0]);
    // Between games there is nothing to resign.
    refuses(s, 0, RESIGN, "no game being played");
    expect(g.view(s, 0).offers!.can).toEqual([]);
    // The next game starts clean, and resigning that one too ends the match.
    const next = g.apply(s, 0, { type: "next" });
    expect(next.offers).toEqual(offersOf({} as State));
    expect(g.summary(g.apply(next, 1, RESIGN))).toMatchObject({ over: true, winners: [0] });
  });

  it("closes any offer that was open", () => {
    const s = run(start(), [[0, DRAW], [1, RESIGN]]);
    expect(s.offers!.open).toBeNull();
    expect(g.summary(s).winners).toEqual([0]);
  });
});

describe("offering a draw", () => {
  it("is open to the other side to accept, and comes out as a real draw", () => {
    const offered = run(start(), [[0, add()], [1, DRAW]]);
    expect(g.view(offered, 0).offers).toEqual({ can: ["resign"], open: { kind: "draw", by: 1 }, answer: true, last: { kind: "draw", by: 1, outcome: "offered" } });
    expect(g.view(offered, 1).offers).toMatchObject({ can: ["resign"], answer: false });
    expect(g.view(offered, 0).narration).toBe("{1} offers a draw");
    expect(offerMoves(g.view(offered, 0))).toEqual([RESIGN, YES, NO]);
    expect(offerMoves(g.view(offered, 1))).toEqual([RESIGN]);
    const drawn = g.apply(offered, 0, YES);
    // The same shape a drawn game on the board has: every seat a winner.
    expect(g.summary(drawn)).toMatchObject({ over: true, winners: [0, 1] });
    expect(g.view(drawn, 0).over).toEqual({ winners: [0, 1], title: "It's a draw!" });
    expect(drawn.draws).toBe(1);
    expect(g.view(drawn, 1).narration).toBe("A draw by agreement");
    expect(movesOffered(g.view(drawn, 0))).toEqual([]);
    expect(offerMoves(g.view(drawn, 0))).toEqual([]);
  });

  it("can be turned down, and only by the player it was made to", () => {
    const offered = run(start(), [[0, DRAW]]);
    refuses(offered, 0, YES, "for {1} to answer");
    refuses(offered, 0, NO, "for {1} to answer");
    refuses(offered, 2, YES, "not playing");
    const declined = g.apply(offered, 1, NO);
    expect(declined.offers).toMatchObject({ open: null, last: { kind: "draw", by: 0, outcome: "declined" } });
    expect(g.view(declined, 0).narration).toBe("{1} turns down the draw");
    expect(bare(declined)).toEqual(bare(offered));
    refuses(declined, 1, YES, "nothing to answer");
    refuses(declined, 1, NO, "nothing to answer");
  });

  it("allows one offer at a time", () => {
    const offered = run(start(), [[0, add()], [1, add()], [0, DRAW]]);
    refuses(offered, 0, DRAW, "waiting for an answer");
    refuses(offered, 1, DRAW, "Answer {0}'s offer first");
    refuses(offered, 1, BACK, "Answer {0}'s offer first");
    refuses(offered, 0, BACK, "waiting for an answer");
  });

  it("stands while the player who made it moves, and lapses when the other plays on", () => {
    // Seat 0 offers on its own turn and then moves: the offer is still there for seat 1.
    const stands = run(start(), [[0, DRAW], [0, add()]]);
    expect(stands.offers!.open).toEqual({ kind: "draw", by: 0 });
    expect(g.view(stands, 1).offers!.answer).toBe(true);
    // The board's own line is what is told once play has moved on.
    expect(g.view(stands, 1).narration).toBe("{0} adds 1");
    // Seat 1 playing on is a "no".
    const lapsed = g.apply(stands, 1, add());
    expect(lapsed.offers).toMatchObject({ open: null, last: { kind: "draw", by: 0, outcome: "lapsed" } });
    expect(g.view(lapsed, 0).narration).toBe("{1} adds 1");
    refuses(lapsed, 1, YES, "nothing to answer");
    // And the note that it lapsed is gone a move later.
    expect(g.apply(lapsed, 0, add()).offers!.last).toBeNull();
  });

  it("can't be offered again until six moves have been made, so it can't be used to nag", () => {
    let s = run(start(), [[0, DRAW], [1, NO]]);
    for (let i = 0; i < 5; i++) {
      refuses(s, 0, DRAW, `not again for ${6 - i} more move${6 - i === 1 ? "" : "s"}`);
      expect(g.view(s, 0).offers!.can).not.toContain("draw");
      // The other player hasn't offered, and may.
      expect(g.view(s, 1).offers!.can).toContain("draw");
      s = g.apply(s, s.turn, add());
    }
    refuses(s, 0, DRAW, "not again for 1 more move");
    s = g.apply(s, s.turn, add());
    expect(g.view(s, 0).offers!.can).toContain("draw");
    expect(g.apply(s, 0, DRAW).offers!.open).toEqual({ kind: "draw", by: 0 });
    // The gap is the game's to choose.
    const quick = withOffers<CountRules, CountState, CountMove>(count, { settle: settleMatch, drawGap: 1 });
    expect(run(start({}, quick), [[0, DRAW], [1, NO], [0, add()], [0, DRAW]], quick).offers!.open).toEqual({ kind: "draw", by: 0 });
  });

  it("can be switched off by the table's rules, and resigning can't", () => {
    const s = start({ offers: "none" });
    expect(g.view(s, 0).offers!.can).toEqual(["resign"]);
    refuses(s, 0, DRAW, "switched off");
    refuses(run(s, [[0, add()]]), 0, BACK, "switched off");
    expect(g.summary(g.apply(s, 0, RESIGN)).winners).toEqual([1]);
  });
});

describe("taking a move back", () => {
  it("undoes the asker's last move, exactly", () => {
    const before = run(start(), [[0, add(3)], [1, add(4)]]);
    const moved = g.apply(before, 0, add(9));
    expect(g.view(moved, 0).offers!.can).toEqual(["resign", "draw", "takeback"]);
    // Seat 1 moved the turn before, but seat 0 has answered it since: that one stands.
    const asked = g.apply(moved, 0, BACK);
    expect(g.view(asked, 1).offers).toMatchObject({ open: { kind: "takeback", by: 0 }, answer: true });
    expect(g.view(asked, 1).narration).toBe("{0} asks to take a move back");
    const back = g.apply(asked, 1, YES);
    expect(bare(back)).toEqual(bare(before));
    expect(g.view(back, 0).narration).toBe("{1} lets {0} take the move back");
    expect(back.offers).toMatchObject({ open: null, last: { kind: "takeback", by: 0, outcome: "accepted" } });
    // The game goes on from there as if the move had never been made.
    expect(bare(g.apply(back, 0, add(2)))).toEqual(bare(g.apply(before, 0, add(2))));
  });

  it("undoes the reply too, when the other player has already moved", () => {
    const before = run(start(), [[0, add(3)], [1, add(4)]]);
    const back = run(before, [[0, add(9)], [1, add(9)], [0, BACK], [1, YES]]);
    expect(bare(back)).toEqual(bare(before));
    expect(back.turn).toBe(0);
  });

  it("takes back a whole turn made in several taps, from the middle of it or after it", () => {
    const before = run(start(), [[0, add(3)], [1, add(4)]]);
    // In the middle: two hops in, still seat 0's turn.
    const middle = run(before, [[0, { type: "hop" }], [0, { type: "hop" }]]);
    expect(middle.turn).toBe(0);
    expect(bare(run(middle, [[0, BACK], [1, YES]]))).toEqual(bare(before));
    // After it: the hops and the move that ended the turn all go.
    const after = run(middle, [[0, add(5)]]);
    expect(bare(run(after, [[0, BACK], [1, YES]]))).toEqual(bare(before));
    // And the other player's turn before it is still its own entry.
    expect(after.offers!.past.map((p) => p.seat)).toEqual([0, 1, 0]);
  });

  it("can be taken back twice running, and no further than is kept", () => {
    let s = start();
    const stood: State[] = [];
    for (let i = 0; i < 8; i++) {
      stood.push(s);
      s = g.apply(s, s.turn, add());
    }
    // Four turns are kept, however long the game.
    expect(s.offers!.past).toHaveLength(4);
    const once = run(s, [[1, BACK], [0, YES]]);
    expect(bare(once)).toEqual(bare(stood[7]!));
    // Seat 1 again: its move before that, and seat 0's reply to it.
    const twice = run(once, [[1, BACK], [0, YES]]);
    expect(bare(twice)).toEqual(bare(stood[5]!));
    expect(twice.offers!.past).toHaveLength(1);
    refuses(twice, 1, BACK, "haven't made a move that can be taken back");
  });

  it("is refused when there is nothing to take back", () => {
    refuses(start(), 0, BACK, "haven't made a move");
    // Seat 1 hasn't moved yet.
    refuses(run(start(), [[0, add()]]), 1, BACK, "haven't made a move");
    expect(g.view(start(), 0).offers!.can).toEqual(["resign", "draw"]);
  });

  it("can be turned down, and then not asked again straight away", () => {
    const s = run(start(), [[0, add()], [0, BACK], [1, NO]]);
    expect(g.view(s, 0).narration).toBe("{1} says no to taking the move back");
    refuses(s, 0, BACK, "told no");
    refuses(run(s, [[1, add()]]), 0, BACK, "told no");
    const later = run(s, [[1, add()], [0, add()]]);
    expect(g.apply(later, 0, BACK).offers!.open).toEqual({ kind: "takeback", by: 0 });
  });

  it("lapses when anybody moves", () => {
    const asked = run(start(), [[0, add()], [0, BACK]]);
    const moved = g.apply(asked, 1, add());
    expect(moved.offers).toMatchObject({ open: null, last: { kind: "takeback", by: 0, outcome: "lapsed" } });
    refuses(moved, 1, YES, "nothing to answer");
    // The asker moving on lapses it as well: the position asked about is gone.
    const hopped = run(start(), [[0, { type: "hop" }], [0, BACK], [0, { type: "hop" }]]);
    expect(hopped.offers!.open).toBeNull();
  });

  it("never goes back across a random draw", () => {
    const rolled = run(start(), [[0, add()], [1, { type: "roll" }]]);
    expect(rolled.offers!.past).toEqual([]);
    refuses(rolled, 1, BACK, "haven't made a move");
    refuses(rolled, 0, BACK, "haven't made a move");
    // Moves after the roll can be taken back, down to the roll and no further.
    const on = run(rolled, [[0, add()], [1, add()]]);
    expect(on.offers!.past.map((p) => p.seat)).toEqual([0, 1]);
    expect(bare(run(on, [[0, BACK], [1, YES]]))).toEqual(bare(rolled));
  });

  it("isn't there once the game is over, or carried into the next game of a match", () => {
    const won = run(start({ target: 5 }), [[0, add(2)], [1, add(3)]]);
    expect(g.summary(won).over).toBe(true);
    expect(won.offers!.past).toEqual([]);
    refuses(won, 1, BACK, "no game being played");
    const next = run(start({ target: 5, games: 3 }), [[0, add(2)], [1, add(3)], [0, { type: "next" }]]);
    expect(next.offers!.past).toEqual([]);
    refuses(next, 1, BACK, "haven't made a move");
  });

  it("is off unless a game says it has it, and then nothing is ever kept", () => {
    let s = start({}, sealed);
    for (let i = 0; i < 6; i++) s = sealed.apply(s, s.turn, add());
    expect(s.offers!.past).toEqual([]);
    expect(sealed.view(s, 0).offers!.can).toEqual(["resign", "draw"]);
    refuses(s, 0, BACK, "can't be taken back in Count", sealed);
    // Its house rule has two settings, and the three-way one comes out as one of them.
    expect(sealed.fields.at(-1)).toMatchObject({ key: "offers", kind: "choice", options: [["all", "Draw offers"], ["none", "No draw offers"]] });
    expect(sealed.normalize({ offers: "notakeback" }).offers).toBe("all");
    // An answer can't conjure one up either.
    const forged = { ...s, offers: { ...s.offers!, open: { kind: "takeback" as const, by: 0 } } };
    refuses(forged, 1, YES, "can't be taken back any more", sealed);
  });

  it("is off, and nothing is kept, where the table's rules say so", () => {
    let s = start({ offers: "notakeback" });
    for (let i = 0; i < 4; i++) s = g.apply(s, s.turn, add());
    expect(s.offers!.past).toEqual([]);
    expect(g.view(s, 0).offers!.can).toEqual(["resign", "draw"]);
    refuses(s, 0, BACK, "switched off at this table");
  });

  it("is what a tournament match is opened without", () => {
    expect(matchRules(g, g.presets[0]!).offers).toBe("notakeback");
    expect(matchRules(g, { ...g.presets[0]!, offers: "none" as const }).offers).toBe("none");
    // A game without offers gets its rules back untouched.
    expect(matchRules(hearts, hearts.presets[0]!)).toBe(hearts.presets[0]);
    // Every board game, opened that way, keeps nothing and offers no take-back, however far it is played.
    for (const game of OFFER_GAMES) {
      const s = advance(game, game.newGame(game.normalize(matchRules(game, game.presets[0])), 2, 3), 8);
      expect(s.offers.past, game.id).toEqual([]);
      for (const seat of [0, 1]) expect(game.view(s, seat).offers!.can, game.id).toEqual(["resign", "draw"]);
      expect(() => game.apply(s, 0, BACK), game.id).toThrow(GameError);
    }
  });
});

describe("what is kept, and who sees it", () => {
  it("keeps earlier positions out of every view and the summary", () => {
    let s = start();
    for (let i = 0; i < 6; i++) s = g.apply(s, s.turn, add());
    expect(s.offers!.past.length).toBeGreaterThan(0);
    for (const seat of [0, 1]) {
      const text = JSON.stringify(g.view(s, seat));
      expect(text).not.toContain("past");
      expect(text).not.toContain("secrets");
      // A seat's own secret is its own business; the other's is nowhere in what it is sent.
      expect(text).toContain(`Your secret is ${s.secrets[seat]}`);
      expect(text).not.toContain(String(s.secrets[1 - seat]));
    }
    expect(JSON.stringify(g.summary(s))).not.toContain("past");
    // What a seat is told about offers is the same four things, whatever is kept.
    expect(Object.keys(g.view(s, 0).offers!)).toEqual(["can", "open", "answer", "last"]);
  });

  it("doesn't nest: a kept position carries no positions of its own", () => {
    let s = start();
    for (let i = 0; i < 20; i++) s = g.apply(s, s.turn, add());
    for (const p of s.offers!.past) expect("offers" in (p.state as object)).toBe(false);
    // So the state stops growing once the history is full.
    const size = JSON.stringify(s).length;
    for (let i = 0; i < 20; i++) s = g.apply(s, s.turn, add());
    expect(JSON.stringify(s).length).toBeLessThan(size + 40);
  });

  it("never changes the state it was given", () => {
    const s = run(start(), [[0, add()], [1, add()], [0, DRAW]]);
    const before = JSON.stringify(s);
    for (const [seat, move] of [[1, YES], [1, NO], [0, RESIGN], [1, RESIGN], [0, add()]] as [number, Move][]) g.apply(s, seat, move);
    const asked = run(start(), [[0, add()], [1, add()], [0, BACK]]);
    const asked0 = JSON.stringify(asked);
    g.apply(asked, 1, YES);
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(asked)).toBe(asked0);
  });

  it("replays from the log to the same state", () => {
    const log: [number, Move, number][] = [
      [0, add(2), 900],
      [1, DRAW, 400],
      [0, NO, 300],
      [1, { type: "hop" }, 200],
      [1, add(3), 500],
      [0, add(1), 700],
      [0, BACK, 100],
      [1, YES, 250],
      [0, add(4), 800],
      [1, BACK, 100],
      [0, NO, 100],
      [1, add(1), 600],
      [0, DRAW, 50],
      [1, YES, 900],
    ];
    const play = () => log.reduce((s, [seat, move, elapsed]) => g.apply(s, seat, move, { elapsed }), start());
    const a = play();
    expect(JSON.stringify(play())).toBe(JSON.stringify(a));
    expect(g.summary(a)).toMatchObject({ over: true, winners: [0, 1] });
    // Through storage and back, a state is the same state.
    const mid = log.slice(0, 5).reduce((s, [seat, move, elapsed]) => g.apply(s, seat, move, { elapsed }), start());
    const stored = JSON.parse(JSON.stringify(mid)) as State;
    expect(JSON.stringify(g.apply(stored, 0, BACK))).toBe(JSON.stringify(g.apply(mid, 0, BACK)));
  });

  it("plays on from a state written before there were offers", () => {
    const old = count.newGame(RULES, 2, 7);
    expect("offers" in old).toBe(false);
    expect(g.view(old, 0).offers).toEqual({ can: ["resign", "draw"], open: null, answer: false, last: null });
    expect(g.bot(old, 0, {})).toEqual(add());
    expect(g.deadline!(old)).toBeNull();
    const s = run(old as State, [[0, add()], [1, add()], [1, BACK], [0, YES]]);
    expect(s.total).toBe(1);
    expect(g.summary(run(old as State, [[0, DRAW], [1, YES]])).winners).toEqual([0, 1]);
    // Rules saved before there were offers allow them all.
    expect(g.normalize({ id: "count", name: "Count", target: 9 })).toMatchObject({ target: 9, offers: "all" });
    expect(g.normalize({ offers: "sometimes" }).offers).toBe("all");
    // And a state whose offers are junk is treated as having none.
    expect(g.view({ ...old, offers: null } as unknown as State, 0).offers!.can).toEqual(["resign", "draw"]);
  });

  it("describes itself: a rule field, a line in the rules, and the moves a view allows", () => {
    expect(g.fields.at(-1)).toMatchObject({ key: "offers", kind: "choice", options: [["all", expect.any(String)], ["notakeback", expect.any(String)], ["none", expect.any(String)]] });
    expect(g.presets[0]!.offers).toBe("all");
    expect(g.describe(g.normalize({})).at(-1)).toMatch(/resign.*offer a draw.*take your last move back/);
    expect(g.describe(g.normalize({ offers: "notakeback" })).at(-1)).not.toMatch(/take/);
    expect(g.describe(g.normalize({ offers: "none" })).at(-1)).toMatch(/resign.*switched off/);
    expect(sealed.describe(sealed.normalize({})).at(-1)).not.toMatch(/take/);
    // Every move a view's offers allow is one the engine takes, at every step of a game with all of them in it.
    let s = start();
    const steps: [number, Move][] = [[0, add()], [1, add()], [0, DRAW], [1, NO], [1, BACK], [0, YES], [1, { type: "hop" }], [1, DRAW], [1, add()], [0, add()], [0, BACK], [1, add()]];
    for (const [seat, move] of steps) {
      for (const me of [0, 1]) for (const m of offerMoves(g.view(s, me))) g.apply(s, me, m);
      s = g.apply(s, seat, move);
    }
    expect(offerMoves({})).toEqual([]);
  });

  it("is only for games with two sides", () => {
    expect(() => withOffers({ ...count, seats: { min: 2, max: 4, default: 2 } }, { settle: settleMatch })).toThrow("two sides");
  });
});

describe("computer players", () => {
  const SHARP = { skill: 1, sloppy: 0 };

  it("answer an offer before anything else, and never make one", () => {
    // It's the bot's own turn, and there is an offer: the answer comes first.
    const asked = run(start(), [[0, add()], [1, add()], [1, BACK]]);
    expect(g.bot(asked, 0, SHARP)).toEqual(YES);
    expect(g.thinkingTime(asked, 0)).toBe(500);
    expect(g.thinkingTime(asked, 1)).toBe(1000);
    // The seat that asked just waits, or plays if it's its move.
    expect(g.bot(asked, 1, SHARP)).toBeNull();
    // With nothing open a bot only ever makes the game's own moves.
    let s = start();
    for (let i = 0; i < 30; i++) {
      const move = g.bot(s, s.turn, SHARP)!;
      expect(move.type).toBe("add");
      s = g.apply(s, s.turn, move);
    }
  });

  it("take a draw when they are behind, or level with the game well along, and play on when ahead or unsure", () => {
    const offered = run(start(), [[0, add()], [1, add()], [0, DRAW]]);
    const answers = (worth: number | null, s = offered) => {
      standing = worth;
      return g.bot(s, 1, SHARP);
    };
    expect(answers(-3)).toEqual(YES);
    expect(answers(2)).toEqual(NO);
    expect(answers(null)).toEqual(NO);
    // Level two moves in is how every game starts: that isn't a draw yet. Twenty moves in, it is.
    expect(answers(0)).toEqual(NO);
    let late = start();
    for (let i = 0; i < 20; i++) late = g.apply(late, late.turn, add());
    late = g.apply(late, 0, DRAW);
    expect(answers(0, late)).toEqual(YES);
    expect(answers(1, late)).toEqual(NO);
    // A game that doesn't say how it stands is always played on.
    expect(sealed.bot(run(start({}, sealed), [[0, add()], [1, add()], [0, DRAW]], sealed), 1, SHARP)).toEqual(NO);
    // And a draw before both have moved is turned down however it stands.
    standing = -3;
    expect(g.bot(run(start(), [[0, DRAW]]), 1, SHARP)).toEqual(NO);
    standing = null;
  });

  it("have a move on the board for the turn timer that is never an answer", () => {
    const asked = run(start(), [[0, add()], [1, add()], [1, BACK]]);
    expect(g.bot(asked, 0, SHARP)).toEqual(YES);
    expect(g.play!(asked, 0, SHARP)).toEqual(add());
    expect(g.play!(asked, 1, SHARP)).toBeNull();
  });
});

describe("clocks", () => {
  it("a game's own clock keeps running through an offer and its answer", () => {
    const s = run(start({ clock: true }), [[0, add()]]);
    expect(g.deadline!(s)).toMatchObject({ after: 3000, seat: 1 });
    // Seat 1 offers a draw 1.2 seconds in; seat 0 says no 0.7 seconds later. 1.1 seconds are left.
    const offered = g.apply(s, 1, DRAW, { elapsed: 1200 });
    expect(g.deadline!(offered)).toMatchObject({ after: 1800, seat: 1, move: add() });
    expect(g.spent!(offered)).toBe(1200);
    const declined = g.apply(offered, 0, NO, { elapsed: 700 });
    expect(g.deadline!(declined)).toMatchObject({ after: 1100, seat: 1 });
    expect(g.spent!(declined)).toBe(1900);
    // It never goes below nothing.
    expect(g.deadline!(g.apply(declined, 1, RESIGN, { elapsed: 0 }))).toBeNull();
    expect(g.deadline!({ ...declined, offers: { ...declined.offers!, idle: 99_000 } })!.after).toBe(0);
    // A move on the board starts the next player's clock whole.
    const moved = g.apply(declined, 1, add(), { elapsed: 900 });
    expect(g.deadline!(moved)).toMatchObject({ after: 3000, seat: 0 });
    expect(g.spent!(moved)).toBe(0);
    // So does a move taken back: it is a new position for whoever is to move.
    expect(g.spent!(g.apply(g.apply(moved, 1, BACK, { elapsed: 400 }), 0, YES, { elapsed: 300 }))).toBe(0);
  });

  it("a table that keeps no time changes nothing", () => {
    const s = run(start({ clock: true }), [[0, add()], [1, DRAW], [0, NO]]);
    expect(g.deadline!(s)).toMatchObject({ after: 3000, seat: 1 });
    expect(g.spent!(s)).toBe(0);
  });
});

// ---- The real games -------------------------------------------------------------------------------

const SHARP = { skill: 1, sloppy: 0 };
type Any = BoardGame<any, any, any>;
/** Bots play `n` moves on the board. */
function advance(game: Any, s: any, n: number) {
  for (let i = 0; i < n; i++) {
    const seat = [0, 1].find((x) => game.bot(s, x, SHARP) !== null);
    if (seat === undefined || game.summary(s).over) break;
    s = game.apply(s, seat, game.bot(s, seat, SHARP));
  }
  return s;
}

// The board games with offers. Yacht has no one to play against, and Backgammon waits for offers of its own:
// its dice make a take-back impossible, and its match is scored its own way. Both are checked to be the only ones left out.
const OFFER_GAMES = BOARD_GAMES.filter((g) => g.fields.some((f) => f.key === "offers"));

describe("every board game", () => {
  it("has offers switched on, with a house rule for them", () => {
    expect(BOARD_GAMES.filter((g) => !OFFER_GAMES.includes(g)).map((g) => g.id)).toEqual(["yacht", "backgammon"]);
    for (const game of OFFER_GAMES) {
      expect(game.fields.at(-1)?.key, game.id).toBe("offers");
      for (const p of game.presets) expect(p.offers, p.id).toBe("all");
      const s = game.newGame(game.presets[0], 2, 3);
      for (const seat of [0, 1]) expect(game.view(s, seat).offers, game.id).toEqual({ can: ["resign", "draw"], open: null, answer: false, last: null });
    }
  });

  it("can be resigned and drawn by agreement, in a single game and in a match", () => {
    for (const game of OFFER_GAMES) {
      for (const preset of game.presets) {
        const s = advance(game, game.newGame(preset, 2, 5), 6);
        for (const seat of [0, 1]) {
          const resigned = game.apply(s, seat, RESIGN);
          expect(game.summary(resigned), `${preset.id}: seat ${seat} resigns`).toMatchObject({ over: true, winners: [1 - seat], order: [1 - seat, seat] });
          for (const me of [0, 1]) {
            const v = game.view(resigned, me);
            expect(v.over!.winners).toEqual([1 - seat]);
            expect(v.narration).toContain(`{${seat}} resigns`);
            expect([movesOffered(v), offerMoves(v)]).toEqual([[], []]);
          }
        }
        const drawn = game.apply(game.apply(s, 0, DRAW), 1, YES);
        expect(game.summary(drawn), `${preset.id}: a draw`).toMatchObject({ over: true, winners: [0, 1] });
        expect([...game.summary(drawn).order!].sort()).toEqual([0, 1]);
        expect(game.view(drawn, 0).over).toMatchObject({ winners: [0, 1], title: expect.stringMatching(/^It's a draw/) });
        expect(game.summary(drawn).scoreLine).toMatch(game.id === "reversi" ? / to / : /1 drawn/);

        // A match of three: resigning gives up one game, and the match goes on to the next.
        const match = advance(game, game.newGame(game.normalize({ ...preset, games: 3 }), 2, 5), 6);
        const one = game.apply(match, 0, RESIGN);
        expect(game.summary(one), `${preset.id}: a match`).toMatchObject({ over: false, phase: "scored", scoreLine: expect.stringMatching(/^0 to 1/) });
        expect(game.view(one, 0).result).toMatchObject({ title: "{1} wins game 1" });
        let two = game.apply(game.apply(one, 0, { type: "next" }), 1, { type: "next" });
        expect(game.summary(two)).toMatchObject({ hand: 2, over: false });
        expect(two.offers).toEqual(offersOf({}));
        // A drawn second game, and the match is still on; a third resigned by the same seat ends it 0 to 2.
        two = game.apply(game.apply(two, 1, DRAW), 0, YES);
        expect(game.view(two, 0).result).toMatchObject({ title: "Game 2 is a draw" });
        const three = game.apply(game.apply(game.apply(two, 0, { type: "next" }), 1, { type: "next" }), 0, RESIGN);
        expect(game.summary(three)).toMatchObject({ over: true, winners: [1], order: [1, 0] });
      }
    }
  });
});

describe("taking back in the real games", () => {
  const cases: [Any, unknown][] = [
    [ticTacToe, classicTicTacToe],
    [ticTacToe, ticTacToe.presets[1]],
    [ticTacToe, ticTacToe.presets[3]],
    [dropFour, classicDropFour],
    [dropFour, dropFour.presets[2]],
    [reversi, classicReversi],
    [checkers, americanCheckers],
    [checkers, checkers.presets[1]],
    [go, smallGo],
  ];

  it("puts the game back exactly as it stood, after one move or after the reply", () => {
    for (const [game, preset] of cases) {
      const before = advance(game, game.newGame(game.normalize(preset), 2, 9), 5);
      const mover = game.view(before, 0).turn as number;
      const moved = game.apply(before, mover, game.bot(before, mover, SHARP));
      expect(game.view(moved, mover).offers!.can, game.id).toContain("takeback");
      const back = game.apply(game.apply(moved, mover, BACK), 1 - mover, YES);
      expect(bare(back), `${game.id}: one move`).toEqual(bare(before));
      for (const seat of [0, 1]) expect({ ...game.view(back, seat), offers: 0, narration: 0 }).toEqual({ ...game.view(before, seat), offers: 0, narration: 0 });
      // With the reply played as well, both moves go. (In Reversi the reply can be the mover's own: a pass.)
      const replied = advance(game, moved, 1);
      const both = game.apply(game.apply(replied, mover, BACK), 1 - mover, YES);
      expect(bare(both), `${game.id}: with the reply`).toEqual(bare(before));
      // A computer player lets a move be taken back.
      expect(game.bot(game.apply(replied, mover, BACK), 1 - mover, SHARP)).toEqual(YES);
    }
  });

  it("Checkers: in the middle of a run of jumps, the whole run so far comes back", () => {
    const pieces = (rules: unknown): CheckersState => {
      const s = newCheckers(checkers.normalize({ ...(rules as object), first: "seat1" }), 2, 1);
      const sq = (name: string) => (8 - Number(name.slice(1))) * 8 + (name.charCodeAt(0) - 97);
      s.cells = s.cells.map(() => null);
      let id = 0;
      for (const [o, list] of [[0, "a1 g1"], [1, "b2 d4 d6 h8"]] as [number, string][]) for (const name of list.split(" ")) s.cells[sq(name)] = { o, k: false, id: id++ };
      s.turn = 0;
      s.seen = {};
      return s;
    };
    const sq = (name: string) => (8 - Number(name.slice(1))) * 8 + (name.charCodeAt(0) - 97);
    const hop = (from: string, to: string) => ({ type: "move" as const, from: sq(from), to: sq(to) });
    for (const rules of [americanCheckers, friendlyCheckers]) {
      // (Where a capture has to be taken there is no quiet move to make first.)
      const before = rules.forced ? pieces(rules) : checkers.apply(checkers.apply(pieces(rules), 0, hop("g1", "h2")), 1, hop("h8", "g7"));
      // Two hops into a run of three: the pieces jumped are still on the board, faded.
      const middle = checkers.apply(checkers.apply(before, 0, hop("a1", "c3")), 0, hop("c3", "e5"));
      expect(middle.jump).toMatchObject({ from: sq("a1"), at: sq("e5"), over: [sq("b2"), sq("d4")] });
      expect(middle.turn).toBe(0);
      expect(checkers.view(middle, 0).offers!.can).toContain("takeback");
      const asked = checkers.apply(middle, 0, BACK);
      // The piece is still in hand while the answer is waited for, and the board is as it was.
      expect(checkers.view(asked, 0).grids[0]!.select).toMatchObject({ held: sq("e5") });
      const back = checkers.apply(asked, 1, YES);
      expect(bare(back)).toEqual(bare(before));
      expect(back.jump).toBeNull();
      expect(back.cells[sq("b2")]).toMatchObject({ o: 1 });
      expect(checkers.view(back, 0).grids[0]!.select!.held).toBeUndefined();
      // And the capture can be played again, or a different move made.
      expect(checkers.apply(back, 0, hop("a1", "c3")).jump).toMatchObject({ at: sq("c3") });

      if (rules.forced) continue;
      // Friendly: "Stop here" ends the turn part-way. Taken back, the whole turn is undone, not just the stop.
      const stopped = checkers.apply(middle, 0, { type: "stop" });
      expect(stopped.turn).toBe(1);
      expect(stopped.cells[sq("b2")]).toBeNull();
      expect(bare(checkers.apply(checkers.apply(stopped, 0, BACK), 1, YES))).toEqual(bare(before));
      // And after the other player's reply to it as well.
      const replied = checkers.apply(stopped, 1, hop("g7", "f6"));
      expect(bare(checkers.apply(checkers.apply(replied, 0, BACK), 1, YES))).toEqual(bare(before));
      // The other player asking in the middle of the run takes back their own move before it, and the run with it.
      const theirs = checkers.apply(checkers.apply(middle, 1, BACK), 0, YES);
      expect(theirs.turn).toBe(1);
      expect(theirs.cells[sq("h8")]).toMatchObject({ o: 1 });
      expect(theirs.jump).toBeNull();
    }
  });

  it("Checkers: resigning in the middle of a capture ends the game cleanly", () => {
    let s = advance(checkers, checkers.newGame(checkers.normalize(americanCheckers), 2, 4), 200) as CheckersState;
    // Find a position with a capture in progress in a played game, or settle for any.
    for (let seed = 1; seed < 40 && !s.jump; seed++) {
      s = checkers.newGame(checkers.normalize(americanCheckers), 2, seed) as CheckersState;
      for (let i = 0; i < 120 && !s.jump && !checkers.summary(s).over; i++) s = checkers.apply(s, s.turn, checkers.bot(s, s.turn, { skill: 0.3, sloppy: 0.3 })!) as CheckersState;
    }
    expect(s.jump).not.toBeNull();
    const done = checkers.apply(s, s.turn, RESIGN);
    expect(done.jump).toBeNull();
    expect(checkers.summary(done)).toMatchObject({ over: true, winners: [1 - s.turn] });
    expect(checkers.view(done, 0).grids[0]!.select).toBeNull();
  });

  it("Drop Four against the shot clock has no taking back, and an offer doesn't stop the clock", () => {
    let s = dropFour.newGame(dropFour.normalize(drinkingDropFour), 2, 2);
    s = dropFour.apply(s, s.turn, { type: "drop", col: 3 });
    s = dropFour.apply(s, s.turn, { type: "drop", col: 3 });
    expect(s.offers!.past).toEqual([]);
    expect(dropFour.view(s, 0).offers!.can).toEqual(["resign", "draw"]);
    expect(() => dropFour.apply(s, 1 - s.turn, BACK)).toThrow("switched off at this table");
    // The clock is on whoever is to move. They offer a draw two seconds in: one second is left, not three.
    const due = dropFour.deadline!(s)!;
    expect(due).toMatchObject({ after: SHOT_CLOCK_MS, seat: s.turn, move: { type: "timeout" } });
    const offered = dropFour.apply(s, s.turn, DRAW, { elapsed: 2000 });
    expect(dropFour.deadline!(offered)).toMatchObject({ after: 1000, seat: s.turn, move: { type: "timeout" } });
    const declined = dropFour.apply(offered, 1 - s.turn, NO, { elapsed: 600 });
    expect(dropFour.deadline!(declined)).toMatchObject({ after: 400, seat: s.turn });
    // Nor can it be offered again to do it twice.
    expect(() => dropFour.apply(declined, s.turn, DRAW)).toThrow("not again");
    // Out of time, the timeout is the game's own move, and it turns the other player's open offer down.
    const theirs = dropFour.apply(declined, 1 - s.turn, DRAW, { elapsed: 100 });
    expect(dropFour.deadline!(theirs)).toMatchObject({ after: 300 });
    const late = dropFour.apply(theirs, s.turn, { type: "timeout" }, { elapsed: 300 });
    expect(late.turn).toBe(1 - s.turn);
    expect(late.offers).toMatchObject({ open: null, idle: 0, last: { outcome: "lapsed" } });
    expect(late.tally.drank[s.turn]).toBe(1);
    // Without the clock, the same game takes moves back.
    const plain = advance(dropFour, dropFour.newGame(dropFour.normalize(classicDropFour), 2, 2), 2);
    expect(plain.offers!.past).toHaveLength(2);
  });

  it("Combat never takes a shot back, and keeps nothing to take it back with", () => {
    for (const preset of combat.presets) {
      let s = combat.newGame(preset, 2, 6);
      for (let i = 0; i < 400 && !combat.summary(s).over; i++) {
        const seat = [0, 1].find((x) => combat.bot(s, x, SHARP) !== null)!;
        s = combat.apply(s, seat, combat.bot(s, seat, SHARP)!);
        expect(s.offers!.past).toEqual([]);
        if (combat.summary(s).over) break;
        for (const me of [0, 1]) {
          expect(combat.view(s, me).offers!.can).not.toContain("takeback");
          expect(() => combat.apply(s, me, BACK)).toThrow("can't be taken back in Combat");
        }
      }
      expect(combat.summary(s).over).toBe(true);
    }
    // Whatever its rules are set to: the house rule has no setting that allows it.
    expect(combat.fields.at(-1)!).toMatchObject({ key: "offers", options: [["all", "Draw offers"], ["none", "No draw offers"]] });
    expect(combat.normalize({ ...quickCombat, offers: "notakeback" }).offers).toBe("all");
    // An answer to a take-back that was never asked (a forged state) is refused too.
    const s = advance(combat, combat.newGame(combat.presets[0]!, 2, 6), 30);
    expect(() => combat.apply({ ...s, offers: { ...s.offers!, open: { kind: "takeback", by: 0 } } }, 1, YES)).toThrow("can't be taken back any more");
  });

  it("Combat: an offer tells a seat nothing about the other fleet", () => {
    let s = advance(combat, combat.newGame(combat.presets[0]!, 2, 8), 40);
    expect(s.phase).toBe("shooting");
    const offered = combat.apply(s, 0, DRAW);
    for (const seat of [0, 1]) {
      // The view with an offer open is the view without, but for the offer and the line about it.
      const [a, b] = [combat.view(offered, seat), combat.view(s, seat)];
      expect({ ...a, offers: 0, narration: 0 }).toEqual({ ...b, offers: 0, narration: 0 });
    }
    // A computer player's answer comes from what it knows: hits scored against hits taken.
    expect([YES, NO]).toContainEqual(combat.bot(offered, 1, SHARP));
    // While placing, with nothing fired, it plays on.
    const placing = combat.newGame(combat.presets[0]!, 2, 8);
    s = advance(combat, placing, 2);
    expect(s.phase).toBe("placing");
    expect(combat.bot(combat.apply(s, 0, DRAW), 1, SHARP)).toEqual(NO);
    // A drawn game comes out level, with both fleets shown.
    const drawn = combat.apply(offered, 1, YES);
    expect(combat.summary(drawn)).toMatchObject({ over: true, winners: [0, 1], scoreLine: "0 to 0 · 1 drawn" });
    expect(combat.view(drawn, 0).over!.title).toBe("It's a draw!");
  });

  it("a computer player takes a draw when it is behind and not when it is ahead", () => {
    // Checkers: one man against three.
    const s = newCheckers(checkers.normalize({ ...americanCheckers, first: "seat1" }), 2, 1);
    const sq = (name: string) => (8 - Number(name.slice(1))) * 8 + (name.charCodeAt(0) - 97);
    s.cells = s.cells.map(() => null);
    s.cells[sq("a1")] = { o: 0, k: false, id: 0 };
    for (const [i, name] of ["h8", "f8", "d8"].entries()) s.cells[sq(name)] = { o: 1, k: false, id: i + 1 };
    s.seen = {};
    const on = checkers.apply(checkers.apply(s, 0, { type: "move", from: sq("a1"), to: sq("b2") }), 1, { type: "move", from: sq("h8"), to: sq("g7") });
    expect(checkers.bot(checkers.apply(on, 1, DRAW), 0, SHARP)).toEqual(YES);
    expect(checkers.bot(checkers.apply(on, 0, DRAW), 1, SHARP)).toEqual(NO);
    // Tic-Tac-Toe on 3×3 is a draw with best play from the start: the offer is taken once both have moved.
    const t = ticTacToe.newGame(ticTacToe.normalize({ ...classicTicTacToe, first: "seat1" }), 2, 1);
    const two = ticTacToe.apply(ticTacToe.apply(t, 0, { type: "mark", cell: 4 }), 1, { type: "mark", cell: 0 });
    expect(ticTacToe.bot(ticTacToe.apply(two, 0, DRAW), 1, SHARP)).toEqual(YES);
    // But not by the side that is winning: O took an edge against the centre, and X has a forced win.
    const lost = ticTacToe.apply(ticTacToe.apply(t, 0, { type: "mark", cell: 4 }), 1, { type: "mark", cell: 1 });
    expect(ticTacToe.bot(ticTacToe.apply(lost, 1, DRAW), 0, SHARP)).toEqual(NO);
    expect(ticTacToe.bot(ticTacToe.apply(lost, 0, DRAW), 1, SHARP)).toEqual(YES);
    // On a board too big to know, it plays on.
    const big = advance(ticTacToe, ticTacToe.newGame(ticTacToe.presets[3]!, 2, 1), 4);
    expect(ticTacToe.bot(ticTacToe.apply(big, 0, DRAW), 1, SHARP)).toEqual(NO);
  });
});

describe("what a long game costs", () => {
  it("Checkers: four positions kept, and nothing of them in a view", () => {
    let s = checkers.newGame(checkers.normalize({ ...americanCheckers, quiet: 100 }), 2, 3);
    let most = { state: 0, bare: 0, view: 0, plain: 0, past: 0 };
    for (let i = 0; i < 400 && !checkers.summary(s).over; i++) {
      s = checkers.apply(s, s.turn, checkers.bot(s, s.turn, { skill: 0.3, sloppy: 0.2 })!);
      const size = { state: JSON.stringify(s).length, bare: JSON.stringify(bare(s)).length, view: JSON.stringify(checkers.view(s, 0)).length, plain: JSON.stringify({ ...checkers.view(s, 0), offers: undefined }).length, past: s.offers!.past.length };
      if (size.state > most.state) most = size;
      expect(size.past).toBeLessThanOrEqual(4);
      // A view grows by its `offers` and nothing else: a hundred-odd characters.
      expect(size.view - size.plain).toBeLessThan(160);
    }
    // The state is at most the game's own five times over (itself and four earlier ones).
    expect(most.state).toBeLessThan(most.bare * 5 + 400);
    // (Measured: a long game's state goes from about 1.4–2.3 KB of JSON to 7–11 KB, in the server's
    // memory only. A room stores its move log, never its state, and a view grows by 85 characters.)
  });
});
