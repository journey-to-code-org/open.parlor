// Offers: what every serious two-player board game has besides its moves. Either player can resign,
// offer a draw, or ask to take a move back, and the other answers. It is built once, here, as a
// wrapper round a board game, so a game opts in with a line or two (`withOffers(game, options)`)
// and its own rules code never hears about any of it.
//
// The wrapper adds four moves ({ type: "resign" }, { type: "offer", offer }, { type: "accept" },
// { type: "decline" }), keeps what it needs in the game's own state under `offers` (so it goes into
// the move log and replays like everything else), and tells each seat what is open and what it may
// do in the view's `offers`. The board table draws that once for every game.
//
// The rules of offers themselves:
//
//   Resign       any time a game is on, your turn or not. The other side wins that game. In a match
//                of several games it gives up the game being played, not the match: a game is what
//                is on the board, and "one bad game" shouldn't cost three.
//   Draw         one offer open at a time. It stays open while the player who made it moves (that is
//                their risk), and lapses when the player it was made to plays on: a move is a "no".
//                A seat can't offer again until `drawGap` moves have been made on the board since
//                its last offer, so an offer can't be used to nag.
//   Take back    undoes the asker's last turn at the board, and the reply to it if there has been
//                one, putting the game back exactly as it stood. It lapses when anybody moves. Asked
//                and turned down, it can't be asked again for `backGap` moves.
//
// Taking a move back needs the game as it was, so the wrapper keeps the last few positions (the
// state before each turn at the board, `history` of them) inside `offers.past`. They never leave the
// engine: no view and no summary is ever made from them. And taking back is off by construction
// wherever it could cheat:
//
//   - a game has to say `takeBack: true` to have it at all. A game with anything hidden (Combat: a
//     shot tells you something that can't be un-known) leaves it out, and no position is ever kept;
//   - nothing is kept across a random draw: if a move changed the state's `rng`, the positions
//     before it are thrown away, so a roll can't be taken back and rolled again;
//   - nothing is kept once a game is over, or from one game of a match to the next;
//   - the house rule `offers` can switch it off for a table, and a tournament match is always
//     opened with it off (`matchRules`).
import type { PlayStyle } from "@spades/rules";
import type { BoardGame, BoardOffers, BoardView, OfferKind } from "./board.js";
import { clone, GameError, who, type BaseRules, type GameDeadline, type MoveTime, type RuleField, type TableGame } from "./table.js";

/** The house rule every game with offers shares: what a table allows besides resigning. */
export type OffersAllowed = "all" | "notakeback" | "none";

/** Added to the rules of a game with offers. Missing (rules saved before there were offers) is "all". */
export interface OfferRules {
  offers?: OffersAllowed;
}

export type OfferMove = { type: "resign" } | { type: "offer"; offer: "draw" | "takeback" } | { type: "accept" } | { type: "decline" };

/** What the wrapper keeps in a game's state. */
export interface OffersState<S = unknown> {
  /** Moves made on the board in this game. A take-back doesn't wind it back: it only ever counts up. */
  moves: number;
  /** The offer waiting for an answer, and who made it. */
  open: { kind: "draw" | "takeback"; by: number } | null;
  /** `moves` when each seat last offered a draw; null if it never has. */
  drawAt: (number | null)[];
  /** `moves` when each seat last had a take-back turned down. */
  backAt: (number | null)[];
  /** The last thing that happened with an offer, until the board moves on past it. */
  last: BoardOffers["last"];
  /** The last move made was about an offer, so that is what the table's narration says. */
  spoke: boolean;
  /**
   * The positions a take-back can return to, oldest first: the game as it stood before a seat's
   * turn at the board (one entry for a whole run of jumps). Never part of any view.
   */
  past: { seat: number; state: S }[];
  /**
   * Ms that have gone by on offers since the last move on the board. An offer or its answer is a
   * move as far as the room is concerned, and a room's clocks count from the last move; this is
   * taken off them, so asking and answering never buys anybody time.
   */
  idle: number;
}

export type WithOffers<S> = S & { offers?: OffersState<S> };

/** What a game says about itself to have offers. */
export interface OfferOptions<S> {
  /**
   * End the game being played: `winner` takes it, or nobody does (null: a draw by agreement). `s`
   * is a copy to change, the way an engine's own move would end a game: score it, narrate it, go to
   * the next phase. `by` is who resigned, or who offered the draw.
   */
  settle(s: S, result: { winner: number | null; by: number; reason: "resigned" | "agreed" }): void;
  /** Is a game being played (not between games, not over)? Without it: `state.phase === "playing"`. */
  live?(state: S): boolean;
  /**
   * Whether moves can be taken back in this game. Left out, they can't, and no earlier position is
   * ever kept: say `true` only for a game where every seat sees everything and a move decides
   * nothing by chance. A function can rule it out for some tables (a game against a shot clock).
   */
  takeBack?: boolean | ((state: S) => boolean);
  /**
   * How the game stands for a seat, for a computer player answering a draw offer: above zero is
   * better than level, below is worse, null is "can't say". It must use only what that seat knows.
   * A computer player takes a draw when it is worse, or level with the game well along (`levelAfter`),
   * and plays on if it can't say.
   */
  standing?(state: S, seat: number): number | null;
  /**
   * Moves on the board before a computer player takes a draw in a level position. 20 unless given:
   * every game is level at the start, and a draw two moves in is nobody's idea of a game (it would
   * be a way to collect draws from the computer, too). A game short enough to be known says less.
   */
  levelAfter?: number;
  /** Moves on the board before a seat may offer a draw again. 6 unless given. */
  drawGap?: number;
  /** Moves on the board before a seat that was refused may ask to take back again. 2 unless given. */
  backGap?: number;
  /** How many turns back a position is kept. 4 unless given: enough to take back twice running. */
  history?: number;
}

const other = (seat: number) => 1 - seat;
const OFFER_TYPES = new Set(["resign", "offer", "accept", "decline"]);
const ALLOWED: OffersAllowed[] = ["all", "notakeback", "none"];

export const noOffers = <S>(): OffersState<S> => ({ moves: 0, open: null, drawAt: [null, null], backAt: [null, null], last: null, spoke: false, past: [], idle: 0 });

/** A state's offers. A game saved before there were any has none open and nothing to take back. */
export function offersOf<S>(state: WithOffers<S>): OffersState<S> {
  const o = state?.offers;
  return o && typeof o === "object" ? { ...noOffers<S>(), ...o } : noOffers<S>();
}

/** The game's own state, without the wrapper's part: what the game's own engine is given. */
function inner<S>(state: WithOffers<S>): S {
  if (!state || typeof state !== "object" || !("offers" in state)) return state;
  const { offers: _, ...rest } = state;
  return rest as S;
}

const allowedBy = (rules: OfferRules | undefined): OffersAllowed => (ALLOWED.includes(rules?.offers as OffersAllowed) ? rules!.offers! : "all");

/** The moves a view's offers let this seat send: what the table's menu and banner are made of. */
export function offerMoves(view: Pick<BoardView, "offers">): OfferMove[] {
  const o = view.offers;
  if (!o) return [];
  const out: OfferMove[] = [];
  for (const kind of o.can) out.push(kind === "resign" ? { type: "resign" } : { type: "offer", offer: kind });
  if (o.answer) out.push({ type: "accept" }, { type: "decline" });
  return out;
}

/**
 * A table's rules for a match that counts (a tournament): moves can't be taken back there. A game
 * without offers gets its rules back as they were.
 */
export function matchRules<R extends object>(game: Pick<TableGame<any, any, any, any>, "fields">, rules: R): R {
  if (!game.fields.some((f) => f.key === "offers")) return rules;
  return { ...rules, offers: (rules as OfferRules).offers === "none" ? "none" : "notakeback" };
}

/** The shape the board games' matches share: games won and drawn, and the game being played. */
interface MatchState {
  rules: { games: number };
  round: number;
  wins: number[];
  draws?: number;
  roundWinner: number | null;
  phase: string;
  narration: string | null;
}

/**
 * `settle` for a game whose state keeps a match the way the board games here do (`wins`, `draws`,
 * `round`, `roundWinner`, and a phase that goes to "scored" between games and "finished" at the
 * end): the game being played goes to `winner`, or is drawn, and the match carries on or ends.
 */
export function settleMatch(s: MatchState, { winner, by, reason }: { winner: number | null; by: number; reason: "resigned" | "agreed" }) {
  const many = s.rules.games > 1;
  s.roundWinner = winner;
  if (winner === null) {
    s.draws = (s.draws ?? 0) + 1;
    s.narration = many ? `Game ${s.round} is a draw by agreement` : "A draw by agreement";
  } else {
    s.wins[winner]! += 1;
    s.narration = reason === "resigned" ? `${who(by)} resigns: ${who(winner)} wins${many ? ` game ${s.round}` : ""}!` : `${who(winner)} wins${many ? ` game ${s.round}` : ""}!`;
  }
  // Finished when the games run out or one side can't be caught, as on the board.
  const left = s.rules.games - s.round;
  s.phase = left <= 0 || Math.abs(s.wins[0]! - s.wins[1]!) > left ? "finished" : "scored";
}

/** What just happened with an offer, as a line for the table; null when the game's own line says it. */
function noteOf(last: BoardOffers["last"]): string | null {
  if (!last) return null;
  const { kind, by, outcome } = last;
  if (kind === "draw") return outcome === "offered" ? `${who(by)} offers a draw` : outcome === "declined" ? `${who(other(by))} turns down the draw` : null;
  if (kind === "takeback") {
    if (outcome === "offered") return `${who(by)} asks to take a move back`;
    if (outcome === "declined") return `${who(other(by))} says no to taking the move back`;
    if (outcome === "accepted") return `${who(other(by))} lets ${who(by)} take the move back`;
  }
  return null;
}

/**
 * A board game with resigning, draw offers and (if it says so) taking moves back. The game's own
 * `apply`, `view` and computer player are used as they are; see the top of this file for the rules.
 */
export function withOffers<R extends BaseRules, S extends { rules: R; seats: number }, M extends { type: string }>(game: BoardGame<R, S, M>, options: OfferOptions<S>): BoardGame<R & OfferRules, WithOffers<S>, M | OfferMove> {
  if (game.seats.min !== 2 || game.seats.max !== 2 || game.teams) throw new Error(`${game.id}: offers are for games with two sides.`);
  type State = WithOffers<S>;
  const live = (s: S) => (options.live ? options.live(s) : (s as { phase?: unknown }).phase === "playing");
  const drawGap = options.drawGap ?? 6;
  const backGap = options.backGap ?? 2;
  const levelAfter = options.levelAfter ?? 20;
  const keep = Math.max(2, options.history ?? 4);
  /** Whether this table keeps positions to go back to: the game allows it, and so do the house rules. */
  const keeps = (s: S) => allowedBy(s.rules as OfferRules) === "all" && (typeof options.takeBack === "function" ? options.takeBack(s) : options.takeBack === true);
  const everAllowed = options.takeBack !== undefined && options.takeBack !== false;
  const rngOf = (s: S) => (s as { rng?: unknown }).rng;

  /** Which kept position a take-back by `seat` returns to: their last turn, if it or the reply to it was the last thing played. */
  function backTo(o: OffersState<S>, seat: number): number {
    for (let i = o.past.length - 1; i >= Math.max(0, o.past.length - 2); i--) if (o.past[i]!.seat === seat) return i;
    return -1;
  }

  /** Why a seat can't do this now, in words for the player; null when it can. */
  function refusal(s: S, o: OffersState<S>, seat: number, kind: OfferKind): string | null {
    if (seat !== 0 && seat !== 1) return "You're not playing at this table.";
    if (!live(s)) return "There's no game being played.";
    if (kind === "resign") return null;
    const allowed = allowedBy(s.rules as OfferRules);
    if (kind === "draw" && allowed === "none") return "Draw offers are switched off at this table.";
    if (kind === "takeback" && !keeps(s)) return !everAllowed ? `Moves can't be taken back in ${game.name}.` : "Taking moves back is switched off at this table.";
    if (o.open) return o.open.by === seat ? "You're waiting for an answer already." : `Answer ${who(o.open.by)}'s offer first.`;
    if (kind === "draw") {
      const at = o.drawAt[seat] ?? null;
      const wait = at === null ? 0 : drawGap - (o.moves - at);
      return wait > 0 ? `You've offered a draw: not again for ${wait} more move${wait === 1 ? "" : "s"}.` : null;
    }
    if (backTo(o, seat) < 0) return "You haven't made a move that can be taken back.";
    const at = o.backAt[seat] ?? null;
    return at !== null && o.moves - at < backGap ? "You've just been told no: play on." : null;
  }

  function settled(s: S, winner: number | null, by: number, reason: "resigned" | "agreed"): S {
    const next = clone(s);
    options.settle(next, { winner, by, reason });
    if (live(next)) throw new Error(`${game.id}: settle left the game going.`);
    return next;
  }

  function offerMove(state: State, seat: number, move: OfferMove, time?: MoveTime): State {
    const s = inner(state);
    const o = offersOf(state);
    // Time spent on offers is time off the clock that was running (see `idle`).
    const idle = o.idle + Math.max(0, Number(time?.elapsed) || 0);
    if (move.type === "resign") {
      const no = refusal(s, o, seat, "resign");
      if (no) throw new GameError(no);
      return { ...settled(s, other(seat), seat, "resigned"), offers: { ...noOffers<S>(), last: { kind: "resign", by: seat, outcome: "accepted" } } };
    }
    if (move.type === "offer") {
      const kind = move.offer;
      if (kind !== "draw" && kind !== "takeback") throw new GameError("That's not something you can offer.");
      const no = refusal(s, o, seat, kind);
      if (no) throw new GameError(no);
      const drawAt = kind === "draw" ? o.drawAt.map((at, i) => (i === seat ? o.moves : at)) : o.drawAt;
      return { ...s, offers: { ...o, idle, spoke: true, open: { kind, by: seat }, drawAt, last: { kind, by: seat, outcome: "offered" } } };
    }
    // An answer.
    if (seat !== 0 && seat !== 1) throw new GameError("You're not playing at this table.");
    if (!o.open) throw new GameError("There's nothing to answer.");
    if (o.open.by === seat) throw new GameError(`That's for ${who(other(seat))} to answer.`);
    const { kind, by } = o.open;
    if (move.type === "decline") {
      const backAt = kind === "takeback" ? o.backAt.map((at, i) => (i === by ? o.moves : at)) : o.backAt;
      return { ...s, offers: { ...o, idle, spoke: true, open: null, backAt, last: { kind, by, outcome: "declined" } } };
    }
    if (kind === "draw") return { ...settled(s, null, by, "agreed"), offers: { ...noOffers<S>(), last: { kind, by, outcome: "accepted" } } };
    // Take the move back: the game is exactly as it stood before the asker's turn, and that turn
    // and everything after it is forgotten. The clock starts again, as it does for any new position.
    const i = backTo(o, by);
    if (i < 0 || !keeps(s)) throw new GameError("That move can't be taken back any more.");
    return { ...o.past[i]!.state, offers: { ...o, idle: 0, spoke: true, open: null, past: o.past.slice(0, i), last: { kind, by, outcome: "accepted" } } };
  }

  /** The wrapper's part of the state after a move on the board (or a button between games). */
  function afterBoardMove(o: OffersState<S>, before: S, after: S, seat: number): OffersState<S> {
    if (!live(before)) return live(after) ? noOffers<S>() : o;
    // The game ended on the board: nothing is open, and nothing can be taken back.
    if (!live(after)) return noOffers<S>();
    // Playing on turns down a draw offered to you, and any move makes a take-back out of date.
    const lapsed = o.open && (o.open.kind === "takeback" || o.open.by !== seat);
    let past = o.past;
    if (!keeps(after)) past = [];
    else if (rngOf(before) !== rngOf(after)) past = [];
    // One entry a turn: a second hop of the same run of jumps is part of the turn already kept.
    else if (past.at(-1)?.seat !== seat) past = [...past, { seat, state: before }].slice(-keep);
    return { ...o, moves: o.moves + 1, idle: 0, spoke: false, past, open: lapsed ? null : o.open, last: lapsed ? { ...o.open!, outcome: "lapsed" } : o.open ? o.last : null };
  }

  const describeOffers = (r: R & OfferRules): string => {
    const allowed = allowedBy(r);
    const back = everAllowed && allowed === "all";
    if (allowed === "none") return "You can resign at any time. Draw offers are switched off at this table.";
    return `You can resign at any time, or offer a draw${back ? ", or ask to take your last move back" : ""}: the other player says yes or no.`;
  };

  const field: RuleField<R & OfferRules> = {
    key: "offers" as keyof (R & OfferRules) & string,
    label: "Offers",
    hint: "What the players may ask of each other. Resigning is always allowed.",
    kind: "choice",
    options: everAllowed ? [["all", "Draws and taking a move back"], ["notakeback", "Draws only"], ["none", "Neither"]] : [["all", "Draw offers"], ["none", "No draw offers"]],
  };
  const cleanOffers = (rules: unknown): OffersAllowed => {
    const allowed = allowedBy(rules && typeof rules === "object" ? (rules as OfferRules) : undefined);
    // A game that never takes moves back has two settings, not three.
    return !everAllowed && allowed === "notakeback" ? "all" : allowed;
  };

  const inherited = game.deadline?.bind(game);
  const own = game.bot.bind(game) as (state: State, seat: number, style: PlayStyle, ...rest: unknown[]) => M | null;
  return {
    ...game,
    presets: game.presets.map((p) => ({ ...p, offers: cleanOffers(p) })),
    fields: [...(game.fields as RuleField<R & OfferRules>[]), field],
    normalize: (rules) => ({ ...game.normalize(rules), offers: cleanOffers(rules) }),
    validate: (r) => game.validate(r),
    describe: (r) => [...game.describe(r), describeOffers(r)],
    newGame: (rules, seats, seed) => ({ ...game.newGame(rules, seats, seed), offers: noOffers<S>() }),
    apply(state, seat, move, time) {
      if (move && OFFER_TYPES.has((move as { type?: string }).type as string)) return offerMove(state, seat, move as OfferMove, time);
      const before = inner(state);
      const after = game.apply(before, seat, move as M, time);
      return { ...after, offers: afterBoardMove(offersOf(state), before, after, seat) };
    },
    view(state, seat) {
      const v = game.view(state, seat);
      const s = inner(state);
      const o = offersOf(state);
      const can = (["resign", "draw", "takeback"] as OfferKind[]).filter((kind) => refusal(s, o, seat, kind) === null);
      const note = o.spoke ? noteOf(o.last) : null;
      return { ...v, narration: note ?? v.narration, offers: { can, open: o.open, answer: !!o.open && o.open.by !== seat && (seat === 0 || seat === 1), last: o.last } };
    },
    // A computer player answers an offer before anything else, and at once. It never makes one.
    // (Anything more a caller hands a computer player, a test's own dice say, is passed along.)
    bot(state, seat, style: PlayStyle, ...rest: unknown[]) {
      const o = offersOf(state);
      if (o.open && o.open.by !== seat && (seat === 0 || seat === 1)) {
        // Among friends a move can always be had back (and where it can't, it can't be asked).
        if (o.open.kind === "takeback") return { type: "accept" };
        // Behind, a draw is a gift. Level, it is fair once there has been a game; before both have moved it is neither.
        const standing = options.standing?.(inner(state), seat) ?? null;
        const take = standing !== null && o.moves >= 2 && (standing < 0 || (standing === 0 && o.moves >= levelAfter));
        return take ? { type: "accept" } : { type: "decline" };
      }
      return own(state, seat, style, ...rest);
    },
    // What the turn timer plays for a person who has run out of time: a move on the board. It never
    // answers an offer for them (playing on turns a draw down, which is the answer silence gives).
    play: (state, seat, style: PlayStyle, ...rest: unknown[]) => (game.play ? game.play(state, seat, style) : own(state, seat, style, ...rest)),
    thinkingTime(state, seat) {
      const open = offersOf(state).open;
      return open && open.by !== seat ? 500 : game.thinkingTime(state, seat);
    },
    // A clock of the game's own has been running all the while an offer was being talked over.
    deadline(state): GameDeadline<M | OfferMove> | null {
      const due = inherited?.(state) ?? null;
      const idle = offersOf(state).idle;
      return due && idle > 0 ? { ...due, after: Math.max(0, due.after - idle) } : due;
    },
    spent: (state) => offersOf(state).idle + (game.spent?.(state) ?? 0),
    summary: (state) => game.summary(state),
  };
}
