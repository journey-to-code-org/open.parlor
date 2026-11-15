// Yacht: five dice and a scorecard. On your turn you roll all five, keep back any you like, and roll
// the rest again, up to three rolls in all; then the dice have to go in one box of your sheet that
// is still empty, for whatever they score there (nothing, if they don't fit). Every box is filled
// once, and when every sheet is full the highest total wins. One player can play alone for a score.
//
// There are three sheets. Classic is the thirteen boxes most families know. Yatzy is the
// Scandinavian sheet, fifteen boxes with pairs in it, where a box scores the dice that make it
// rather than a set number. Quick is the bottom half of the classic sheet on its own: seven rolls
// and you're done.
//
// A table rolls in turn, or everyone at once: then each player has dice of their own that nobody
// else sees, works down their sheet at their own pace, and the table moves to the next round when
// everyone has scored (`turn` is null, as when both players place their ships in Combat).
//
// With drinking mode on the table is called Shotzee: roll five of a kind and everyone else takes a
// shot; put a zero on your sheet and you drink.
//
// There is no board. The view is the board kit's `dice` (thrown here from the game's seeded random
// source, like a deal) and its score `sheet`, whose cells are how you score.
import { mulberry32, type PlayStyle } from "@spades/rules";
import type { BoardDice, BoardGame, BoardView } from "./board.js";
import { drink, newTally, type Tally } from "./drinks.js";
import { drinkingField } from "./kit.js";
import { careless, clone, GameError, nextRandom, rankSeats, who, type BaseRules, type RoundResult, type ScoreSheet } from "./table.js";

export interface YachtRules extends BaseRules {
  /** Which scorecard. */
  sheet: "classic" | "yatzy" | "quick";
  /**
   * Extra Yachts (Classic and Quick): once the Yacht box is filled, another five of a kind is a
   * joker, and worth a bonus of 100 if the box was filled with 50.
   */
  bonus: boolean;
  /** Who rolls when: one player at a time, or everyone at once with dice of their own. */
  order: "turns" | "together";
  /** Drinking mode: the table is Shotzee. */
  drinking: boolean;
}

export const classicYacht: YachtRules = { id: "yacht-classic", name: "Classic", sheet: "classic", bonus: true, order: "turns", drinking: false };
export const yatzyYacht: YachtRules = { id: "yacht-yatzy", name: "Yatzy", sheet: "yatzy", bonus: false, order: "turns", drinking: false };
export const quickYacht: YachtRules = { id: "yacht-quick", name: "Quick (seven boxes)", sheet: "quick", bonus: true, order: "turns", drinking: false };
export const shotzee: YachtRules = { ...classicYacht, id: "yacht-drinking", name: "Shotzee 🍺", drinking: true };
const PRESETS = [classicYacht, yatzyYacht, quickYacht, shotzee];

export const YACHT_DICE = 5;
export const YACHT_ROLLS = 3;
/** What an extra Yacht is worth, when the Yacht box holds 50. */
export const YACHT_BONUS = 100;

// ---- The sheets ---------------------------------------------------------------------------------

/** How many dice show each face: `counts[3]` is the number of threes. (`counts[0]` is unused.) */
type Counts = readonly number[];

interface Box {
  id: string;
  label: string;
  /** What it scores, in a few words, under the label. */
  sub: string;
  /** A box of the top half: the face it counts. */
  face?: number;
  score(counts: Counts, sum: number): number;
  /** What a joker scores here, where that isn't what the dice add up to (a full house is 25 even though five sixes aren't one). */
  joker?: number;
  /** What a good player averages in this box over a game: what the computer player gives up by spending the box. */
  par: number;
}

interface Sheet {
  boxes: Box[];
  /** The top half's bonus, and the total that earns it. */
  bonus: number;
  bonusAt: number;
}

const FACE_NAMES = ["", "Ones", "Twos", "Threes", "Fours", "Fives", "Sixes"];
const FACE_WORDS = ["", "one", "two", "three", "four", "five", "six"];
const countsOf = (dice: readonly number[]): number[] => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]! += 1;
  return counts;
};
const sumOf = (counts: Counts) => counts.reduce((n, c, face) => n + c * face, 0);
/** The highest face that at least `n` dice show, or 0. */
const kind = (counts: Counts, n: number) => {
  for (let face = 6; face >= 1; face--) if (counts[face]! >= n) return face;
  return 0;
};
/** Whether the dice hold `length` faces in a row starting anywhere from `from` to `to`. */
const run = (counts: Counts, length: number, from = 1, to = 7 - length) => {
  for (let start = from; start <= to; start++) {
    let all = true;
    for (let face = start; face < start + length; face++) if (!counts[face]) all = false;
    if (all) return true;
  }
  return false;
};
/** Three of one face and two of another. */
const house = (counts: Counts) => counts.includes(3) && counts.includes(2);

const upper = (pars: number[]): Box[] =>
  [1, 2, 3, 4, 5, 6].map((face) => ({ id: FACE_NAMES[face]!.toLowerCase(), label: FACE_NAMES[face]!, sub: `Add the ${FACE_NAMES[face]!.toLowerCase()}`, face, score: (c) => c[face]! * face, par: pars[face - 1]! }));

// The pars began as what the computer player itself averaged in each box over a few thousand games
// alone, and were then nudged to whatever played best (Yatzy's are a little under its averages).
const CLASSIC_LOWER: Box[] = [
  { id: "threeKind", label: "Three of a kind", sub: "Add all the dice", score: (c, sum) => (kind(c, 3) ? sum : 0), par: 23 },
  { id: "fourKind", label: "Four of a kind", sub: "Add all the dice", score: (c, sum) => (kind(c, 4) ? sum : 0), par: 17 },
  { id: "fullHouse", label: "Full house", sub: "Three and two: 25", score: (c) => (house(c) ? 25 : 0), joker: 25, par: 20 },
  { id: "smallStraight", label: "Small straight", sub: "Four in a row: 30", score: (c) => (run(c, 4) ? 30 : 0), joker: 30, par: 29 },
  { id: "largeStraight", label: "Large straight", sub: "Five in a row: 40", score: (c) => (run(c, 5) ? 40 : 0), joker: 40, par: 31.5 },
  { id: "yacht", label: "Yacht", sub: "Five of a kind: 50", score: (c) => (kind(c, 5) ? 50 : 0), par: 17.5 },
  { id: "chance", label: "Chance", sub: "Add all the dice", score: (_, sum) => sum, par: 23 },
];

const YATZY_LOWER: Box[] = [
  { id: "pair", label: "One pair", sub: "Add the pair", score: (c) => kind(c, 2) * 2, par: 9 },
  {
    id: "twoPairs",
    label: "Two pairs",
    sub: "Add both pairs",
    score: (c) => {
      const high = kind(c, 2);
      // Two different pairs: four of a kind isn't two.
      for (let face = high - 1; face >= 1; face--) if (c[face]! >= 2) return (high + face) * 2;
      return 0;
    },
    par: 15.5,
  },
  { id: "threeKind", label: "Three of a kind", sub: "Add the three", score: (c) => kind(c, 3) * 3, par: 13 },
  { id: "fourKind", label: "Four of a kind", sub: "Add the four", score: (c) => kind(c, 4) * 4, par: 12.5 },
  { id: "smallStraight", label: "Small straight", sub: "1 to 5: 15", score: (c) => (run(c, 5, 1, 1) ? 15 : 0), par: 3.5 },
  { id: "largeStraight", label: "Large straight", sub: "2 to 6: 20", score: (c) => (run(c, 5, 2, 2) ? 20 : 0), par: 8.5 },
  { id: "fullHouse", label: "Full house", sub: "Add all the dice", score: (c, sum) => (house(c) ? sum : 0), par: 17.5 },
  { id: "chance", label: "Chance", sub: "Add all the dice", score: (_, sum) => sum, par: 18.5 },
  { id: "yacht", label: "Yatzy", sub: "Five of a kind: 50", score: (c) => (kind(c, 5) ? 50 : 0), par: 17.5 },
];

const SHEETS: Record<YachtRules["sheet"], Sheet> = {
  classic: { boxes: [...upper([2, 5.3, 8.4, 11.8, 14.5, 17]), ...CLASSIC_LOWER], bonus: 35, bonusAt: 63 },
  yatzy: { boxes: [...upper([1.6, 4.6, 7, 9.6, 12.2, 14.6]), ...YATZY_LOWER], bonus: 50, bonusAt: 63 },
  // Seven turns go less far than thirteen: the same boxes fetch less.
  quick: { boxes: CLASSIC_LOWER.map((b, i) => ({ ...b, par: [22, 12, 16, 28, 28, 8, 22][i]! })), bonus: 0, bonusAt: 0 },
};
/** The boxes of a sheet, in the order they are written down. */
export const yachtBoxes = (rules: Pick<YachtRules, "sheet">): readonly { id: string; label: string; face?: number }[] => SHEETS[rules.sheet].boxes;

/** What five dice score in a box, by the plain rules of the sheet (no joker). */
export function yachtScore(rules: Pick<YachtRules, "sheet">, box: string, dice: readonly number[]): number {
  const found = SHEETS[rules.sheet].boxes.find((b) => b.id === box);
  if (!found) throw new Error(`No such box: ${box}`);
  const counts = countsOf(dice);
  return found.score(counts, sumOf(counts));
}

// ---- The state ----------------------------------------------------------------------------------

/** Five dice in someone's hand: what they show (0 before the first roll), and which are kept back. */
export interface YachtHand {
  dice: number[];
  held: boolean[];
  /** Rolls made this turn: 0 to 3. At 0 the dice are whatever was scored last. */
  rolls: number;
  /** Every throw of these dice since the game began: what the table watches to know they were thrown. */
  throws: number;
  /** Everyone at once: this seat has scored this round and is waiting for the others. */
  done: boolean;
}

export interface YachtState {
  game: "yacht";
  rules: YachtRules;
  seats: number;
  rng: number;
  /** Which round, from 1: there is one for every box on the sheet. */
  round: number;
  /** In turn: who rolls first each round, and whose turn it is. */
  first: number;
  turn: number;
  /** In turn, one set of dice that goes round the table; everyone at once, a set per seat. */
  hands: YachtHand[];
  /** Per seat, a score for each box of the sheet, or null while it is empty. */
  sheets: (number | null)[][];
  /** Extra Yachts that earned the bonus, per seat. */
  extra: number[];
  tally: Tally;
  /** The box filled in last. */
  last: { seat: number; box: number } | null;
  phase: "playing" | "finished";
  narration: string | null;
}

export type YachtMove = { type: "roll" } | { type: "hold"; die: number } | { type: "score"; cell: string };

const together = (s: YachtState) => s.rules.order === "together";
const handOf = (s: YachtState, seat: number) => s.hands[together(s) ? seat : 0]!;
const sheetOf = (s: YachtState) => SHEETS[s.rules.sheet];
const newHand = (): YachtHand => ({ dice: Array<number>(YACHT_DICE).fill(0), held: Array<boolean>(YACHT_DICE).fill(false), rolls: 0, throws: 0, done: false });
/** Whether it is this seat's go: its turn, or (everyone at once) it hasn't scored this round. */
const canPlay = (s: YachtState, seat: number) => s.phase === "playing" && (together(s) ? !handOf(s, seat).done : s.turn === seat);
/** What the five-of-a-kind box is called at this table. */
const yachtName = (rules: YachtRules) => (rules.drinking ? "Shotzee" : rules.sheet === "yatzy" ? "Yatzy" : "Yacht");
const boxLabel = (rules: YachtRules, box: Box) => (box.id === "yacht" && rules.drinking ? "Shotzee!" : box.label);

export function newYacht(rules: YachtRules, seats: number, seed: number): YachtState {
  const s = { game: "yacht", rules, seats, rng: seed >>> 0, round: 1, last: null, phase: "playing", narration: null } as unknown as YachtState;
  s.first = Math.floor(nextRandom(s)() * seats);
  s.turn = s.first;
  s.hands = Array.from({ length: rules.order === "together" ? seats : 1 }, newHand);
  s.sheets = Array.from({ length: seats }, () => Array<number | null>(SHEETS[rules.sheet].boxes.length).fill(null));
  s.extra = Array<number>(seats).fill(0);
  s.tally = newTally(seats);
  return s;
}

// ---- Scoring ------------------------------------------------------------------------------------

/** The top half of a seat's sheet added up, and the bonus it has earned (0 until it has). */
function upperOf(s: YachtState, seat: number): { sum: number; bonus: number; open: boolean } {
  const { boxes, bonus, bonusAt } = sheetOf(s);
  let sum = 0;
  let open = false;
  boxes.forEach((b, i) => {
    if (b.face === undefined) return;
    if (s.sheets[seat]![i] === null) open = true;
    else sum += s.sheets[seat]![i]!;
  });
  return { sum, bonus: bonus && sum >= bonusAt ? bonus : 0, open };
}

/** A seat's total: every box, the top half's bonus, and the extra Yachts. */
export function yachtTotal(s: YachtState, seat: number): number {
  return s.sheets[seat]!.reduce<number>((n, v) => n + (v ?? 0), 0) + upperOf(s, seat).bonus + s.extra[seat]! * YACHT_BONUS;
}

/**
 * The face of a joker: five of a kind thrown when the Yacht box is already filled (with 50 or
 * with nothing), in rules that play extra Yachts. 0 when the dice aren't one.
 */
function jokerOf(s: YachtState, seat: number, counts: Counts): number {
  if (!s.rules.bonus || s.rules.sheet === "yatzy") return 0;
  const face = kind(counts, 5);
  const yacht = sheetOf(s).boxes.findIndex((b) => b.id === "yacht");
  return face && s.sheets[seat]![yacht] !== null ? face : 0;
}

/**
 * The boxes a seat may put these dice in, and what each would score. Usually that is every empty
 * box. A joker is told where to go: its own number in the top half if that is empty; failing
 * that any empty box of the bottom half, where it counts as whatever the box wants (a full house,
 * either straight); failing that, any box that's left.
 */
function optionsFor(s: YachtState, seat: number, counts: Counts): { box: number; score: number }[] {
  const { boxes } = sheetOf(s);
  const sum = sumOf(counts);
  const open = boxes.map((_, i) => i).filter((i) => s.sheets[seat]![i] === null);
  const plain = (list: number[]) => list.map((box) => ({ box, score: boxes[box]!.score(counts, sum) }));
  const joker = jokerOf(s, seat, counts);
  if (!joker) return plain(open);
  const own = open.find((i) => boxes[i]!.face === joker);
  if (own !== undefined) return plain([own]);
  const lower = open.filter((i) => boxes[i]!.face === undefined);
  if (lower.length) return lower.map((box) => ({ box, score: boxes[box]!.joker ?? boxes[box]!.score(counts, sum) }));
  return plain(open);
}

/** The boxes a seat can score in now, by id, with what each would give. Empty until it has rolled. */
export function yachtOptions(s: YachtState, seat: number): { box: string; score: number }[] {
  const hand = handOf(s, seat);
  if (!canPlay(s, seat) || hand.rolls === 0) return [];
  return optionsFor(s, seat, countsOf(hand.dice)).map((o) => ({ box: sheetOf(s).boxes[o.box]!.id, score: o.score }));
}

// ---- Moves --------------------------------------------------------------------------------------

/** After a seat has scored: the next player's turn, the next round, or the end. */
function moveOn(s: YachtState, seat: number) {
  const rounds = sheetOf(s).boxes.length;
  if (together(s)) {
    if (!s.hands.every((h) => h.done)) return;
    for (const h of s.hands) h.done = false;
  } else {
    s.turn = (seat + 1) % s.seats;
    if (s.turn !== s.first) return;
  }
  if (s.round >= rounds) s.phase = "finished";
  else s.round += 1;
}

function apply(state: YachtState, seat: number, move: YachtMove): YachtState {
  if (move?.type !== "roll" && move?.type !== "hold" && move?.type !== "score") throw new GameError("That's not a move in Yacht.");
  if (state.phase !== "playing") throw new GameError("The game is over.");
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.seats) throw new GameError("You're not at this table.");
  if (!canPlay(state, seat)) throw new GameError(together(state) ? "You've scored this round: waiting for the others." : "It's not your turn.");
  const { rules } = state;
  const before = handOf(state, seat);

  if (move.type === "roll") {
    if (before.rolls >= YACHT_ROLLS) throw new GameError("That was your last roll: pick a box to score.");
    if (before.rolls > 0 && before.held.every(Boolean)) throw new GameError("Let go of a die to roll again.");
    const s = clone(state);
    const hand = handOf(s, seat);
    const rand = nextRandom(s);
    // The first roll of a turn is all five: nothing is kept from the turn before.
    if (hand.rolls === 0) hand.held.fill(false);
    hand.dice = hand.dice.map((value, i) => (hand.held[i] ? value : 1 + Math.floor(rand() * 6)));
    hand.rolls += 1;
    hand.throws += 1;
    const five = kind(countsOf(hand.dice), 5) > 0;
    // Everyone at once, a roll is nobody else's business, unless it's five of a kind: that gets shouted.
    if (five) {
      const others = Array.from({ length: s.seats }, (_, i) => i).filter((i) => i !== seat);
      const shots = rules.drinking && others.length ? ` · ${drink(s.tally, others, 1)}` : "";
      s.narration = `${who(seat)} rolls a ${yachtName(rules)}!${shots}`;
    } else if (!together(s)) s.narration = `${who(seat)} ${hand.rolls === 1 ? "rolls" : hand.rolls === YACHT_ROLLS ? "rolls for the last time" : "rolls again"}`;
    return s;
  }

  if (move.type === "hold") {
    if (before.rolls === 0) throw new GameError("Roll the dice first.");
    if (before.rolls >= YACHT_ROLLS) throw new GameError("That was your last roll: pick a box to score.");
    const die = Number(move.die);
    if (!Number.isInteger(die) || die < 0 || die >= YACHT_DICE) throw new GameError("That's not one of the dice.");
    const s = clone(state);
    const hand = handOf(s, seat);
    hand.held[die] = !hand.held[die];
    return s;
  }

  const { boxes } = sheetOf(state);
  const box = boxes.findIndex((b) => b.id === move.cell);
  if (box < 0) throw new GameError("That's not a box on the sheet.");
  if (before.rolls === 0) throw new GameError("Roll the dice first.");
  if (state.sheets[seat]![box] !== null) throw new GameError("You've filled that box in already.");
  const counts = countsOf(before.dice);
  const option = optionsFor(state, seat, counts).find((o) => o.box === box);
  if (!option) {
    const face = jokerOf(state, seat, counts);
    const own = boxes.some((b, i) => b.face === face && state.sheets[seat]![i] === null);
    throw new GameError(own ? `An extra ${yachtName(rules)} has to go in your ${FACE_NAMES[face]}.` : `An extra ${yachtName(rules)} goes in the bottom half while there's room there.`);
  }
  const s = clone(state);
  const hand = handOf(s, seat);
  const label = boxLabel(rules, boxes[box]!);
  let line = option.score > 0 ? `${who(seat)} scores ${option.score} in ${label}` : `${who(seat)} scratches ${label}`;
  // An extra Yacht pays its bonus only if the first one was scored: a scratched box earns nothing.
  if (jokerOf(s, seat, counts) && s.sheets[seat]![boxes.findIndex((b) => b.id === "yacht")] === 50) {
    s.extra[seat]! += 1;
    line += `, and ${YACHT_BONUS} for another ${yachtName(rules)}`;
  }
  s.sheets[seat]![box] = option.score;
  if (rules.drinking && option.score === 0) line += ` · ${drink(s.tally, [seat], 1)}`;
  s.last = { seat, box };
  s.narration = line;
  // The dice stay as they were scored until the next roll picks them up.
  hand.rolls = 0;
  hand.held.fill(false);
  hand.done = together(s);
  moveOn(s, seat);
  return s;
}

const totals = (s: YachtState) => s.sheets.map((_, seat) => yachtTotal(s, seat));
const winnersOf = (s: YachtState) => {
  const all = totals(s);
  const best = Math.max(...all);
  return all.flatMap((t, seat) => (t === best ? [seat] : []));
};

// ---- What a seat sees ---------------------------------------------------------------------------

/** The sheet as a table of strings: a column per box, with the bonuses worked in where they belong. */
function sheetView(s: YachtState, seat: number): ScoreSheet {
  const { rules } = s;
  const { boxes, bonus, bonusAt } = sheetOf(s);
  const jokers = rules.bonus && rules.sheet !== "yatzy";
  // Where each box sits among the columns: the top half's bonus comes straight after it.
  const lastUpper = boxes.reduce((at, b, i) => (b.face !== undefined ? i : at), -1);
  const columnOf = (box: number) => (lastUpper >= 0 && box > lastUpper ? box + 1 : box);
  const columns: ScoreSheet["columns"] = [];
  boxes.forEach((b, i) => {
    columns.push({ id: b.id, label: boxLabel(rules, b), sub: b.sub });
    if (i === lastUpper) columns.push({ label: "Bonus", sub: `${bonus} for ${bonusAt} or more`, kind: "sum" });
  });
  if (jokers) columns.push({ label: `${yachtName(rules)} bonus`, sub: `${YACHT_BONUS} for each extra one`, kind: "sum" });
  const hand = handOf(s, seat);
  const options = canPlay(s, seat) && hand.rolls > 0 ? optionsFor(s, seat, countsOf(hand.dice)) : [];
  return {
    title: rules.drinking ? "Shotzee" : "Yacht",
    columns,
    current: null,
    rows: s.sheets.map((sheet, i) => {
      const top = upperOf(s, i);
      const cells: string[] = [];
      sheet.forEach((v, box) => {
        cells.push(v === null ? "" : String(v));
        // Until the bonus is won or lost it shows how far along the top half is.
        if (box === lastUpper) cells.push(top.bonus ? String(top.bonus) : top.open ? `${top.sum}/${bonusAt}` : "0");
      });
      if (jokers) cells.push(s.extra[i] ? String(s.extra[i]! * YACHT_BONUS) : "");
      return { seat: i, cells, total: String(yachtTotal(s, i)) };
    }),
    totalLabel: "Total",
    last: s.last ? { seat: s.last.seat, column: columnOf(s.last.box) } : null,
    pick: options.length ? { type: "score", cells: options.map((o) => ({ column: columnOf(o.box), would: String(o.score) })) } : null,
  };
}

function resultOf(s: YachtState): RoundResult {
  const { boxes, bonus } = sheetOf(s);
  const seats = s.sheets.map((_, i) => i);
  const half = (top: boolean) => seats.map((i) => String(boxes.reduce((n, b, box) => n + ((b.face !== undefined) === top ? (s.sheets[i]![box] ?? 0) : 0), 0)));
  const w = winnersOf(s);
  return {
    key: "final",
    title: overTitle(s, w),
    sides: seats.map((i) => [i]),
    rows: [
      ...(bonus ? [{ label: "Top half", values: half(true) }, { label: "Bonus", values: seats.map((i) => String(upperOf(s, i).bonus)) }, { label: "Bottom half", values: half(false) }] : []),
      ...(s.extra.some(Boolean) ? [{ label: `${yachtName(s.rules)} bonus`, values: s.extra.map((n) => String(n * YACHT_BONUS)) }] : []),
      { label: "Total", values: totals(s).map(String), tone: "total" as const },
      ...(s.rules.drinking ? [{ label: "Drinks 🍺", values: s.tally.drank.map(String) }] : []),
    ],
  };
}

function overTitle(s: YachtState, w: number[]): string {
  const best = yachtTotal(s, w[0]!);
  if (s.seats === 1) return `${who(0)} scores ${best}`;
  if (w.length === s.seats) return `Everyone ties on ${best}!`;
  return w.length > 1 ? `${w.map(who).join(" and ")} tie on ${best}!` : `${who(w[0]!)} wins with ${best}!`;
}

function view(s: YachtState, seat: number): BoardView {
  const { rules } = s;
  const over = s.phase === "finished";
  const all = together(s);
  const mine = canPlay(s, seat);
  const hand = handOf(s, seat);
  const rounds = sheetOf(s).boxes.length;
  // Dice that have been scored lie where they fell, dimmed, until the next roll picks them up.
  const spent = hand.rolls === 0;
  const dice: BoardDice = {
    dice: hand.dice.map((value, id) => ({ id, value: value || null, held: !spent && hand.held[id]!, used: spent && value > 0 })),
    roll: hand.throws,
    sides: 6,
    // Between the first roll and the last, your dice can be kept back or let go.
    tap: mine && hand.rolls > 0 && hand.rolls < YACHT_ROLLS ? { type: "hold", dice: hand.dice.map((_, id) => id) } : null,
    // Everyone at once: these are this seat's own dice, and nobody else's view has them.
    ...(all ? { owner: seat } : {}),
  };
  const left = YACHT_ROLLS - hand.rolls;
  const stuck = hand.rolls > 0 && hand.held.every(Boolean);
  const w = over ? winnersOf(s) : [];
  return {
    game: "yacht",
    seats: s.seats,
    me: seat,
    teams: false,
    phase: s.phase,
    turn: over || all ? null : s.turn,
    grids: [],
    reserves: [],
    dice,
    sheet: sheetView(s, seat),
    choices: mine
      ? {
          prompt: hand.rolls === 0 ? "" : left === 0 ? "Pick a box to score" : stuck ? "Pick a box to score, or let go of a die to roll again" : "Tap dice to keep them, or pick a box to score",
          options: left > 0 && !stuck ? [{ label: hand.rolls === 0 ? "Roll the dice" : `Roll again (${left} left)`, move: { type: "roll" }, primary: true }] : [],
        }
      : null,
    players: s.sheets.map((_, i) => ({
      line: [`${yachtTotal(s, i)} points`, ...(rules.drinking ? [`🍺 ${s.tally.drank[i]}`] : [])].join(" · "),
      badge: all && !over && handOf(s, i).done ? "Scored" : undefined,
    })),
    info: [
      over ? `${rounds} rounds played` : `Round ${s.round} of ${rounds}`,
      ...(all && !over ? ["Everyone rolls at once"] : []),
      ...(rules.drinking && !over ? ["🍺 Five of a kind: the others drink", "🍺 A zero: you drink"] : []),
    ],
    narration: s.narration,
    scores: totals(s).map((value, i) => ({ seats: [i], value })),
    result: over ? resultOf(s) : null,
    over: over ? { winners: w, title: overTitle(s, w) } : null,
  };
}

// ---- The computer player ------------------------------------------------------------------------
// It plays the turn by expected value, worked out exactly. Five dice fall 252 ways once their order
// is forgotten, and there are 462 ways to keep some of them back, so the whole turn fits in a few
// small tables: what every final roll is worth, then what every keep is worth on average with one
// roll to come, then with two. What a final roll is worth is its best box, where a box is worth
// what it scores less what the box usually fetches (its par: spending Chance on 11 costs more than
// spending Ones on 1), with a little added for staying on course for the top half's bonus.

/** A way five dice can fall, or some of them be kept: how many of each face. */
interface Dice {
  counts: number[];
  size: number;
}
interface Tables {
  /** Every roll of five dice. */
  rolls: Dice[];
  /** For each keep (0 to 5 dice), the rolls it can become and how likely each is. */
  to: Int16Array[];
  chance: Float64Array[];
  /** For each roll, the keeps that can be made from it. */
  keeps: Int16Array[];
  keepList: Dice[];
  rollIndex: Map<number, number>;
}
const keyOf = (counts: Counts) => counts.reduce((key, c, face) => (face ? key * 6 + c : 0), 0);
let TABLES: Tables | null = null;
function tables(): Tables {
  if (TABLES) return TABLES;
  const keepList: Dice[] = [];
  const fill = (face: number, counts: number[], size: number) => {
    if (face > 6) return void keepList.push({ counts: [...counts], size });
    for (let n = 0; size + n <= YACHT_DICE; n++) {
      counts[face] = n;
      fill(face + 1, counts, size + n);
    }
    counts[face] = 0;
  };
  fill(1, [0, 0, 0, 0, 0, 0, 0], 0);
  const rolls = keepList.filter((k) => k.size === YACHT_DICE);
  const rollIndex = new Map(rolls.map((r, i) => [keyOf(r.counts), i]));
  const keepIndex = new Map(keepList.map((k, i) => [keyOf(k.counts), i]));
  const factorial = [1, 1, 2, 6, 24, 120];
  const to: Int16Array[] = [];
  const chance: Float64Array[] = [];
  for (const keep of keepList) {
    const thrown = YACHT_DICE - keep.size;
    const targets: number[] = [];
    const odds: number[] = [];
    // Every way the dice that are thrown can fall, with how many orders of throwing give it.
    for (const fall of keepList) {
      if (fall.size !== thrown) continue;
      const ways = fall.counts.reduce((n, c) => n / factorial[c]!, factorial[thrown]!);
      targets.push(rollIndex.get(keyOf(keep.counts.map((c, face) => c + fall.counts[face]!)))!);
      odds.push(ways / 6 ** thrown);
    }
    to.push(Int16Array.from(targets));
    chance.push(Float64Array.from(odds));
  }
  const keeps = rolls.map((roll) => Int16Array.from(keepList.flatMap((k) => (k.counts.every((c, face) => c <= roll.counts[face]!) ? [keepIndex.get(keyOf(k.counts))!] : []))));
  return (TABLES = { rolls, to, chance, keeps, keepList, rollIndex });
}

/** How much a point towards the top half's bonus is worth, above or below three of each face. */
const BONUS_WEIGHT = 1;

/** What a score in a box is worth to the computer player: the points, less what the box usually fetches. */
function worth(box: Box, score: number, chasing: boolean): number {
  const course = chasing && box.face !== undefined ? (score - 3 * box.face) * BONUS_WEIGHT : 0;
  return score - box.par + course;
}

/** Whether the top half's bonus is still to play for: not won, and not out of reach. */
function chasingBonus(s: YachtState, seat: number): boolean {
  const { boxes, bonus, bonusAt } = sheetOf(s);
  if (!bonus) return false;
  const { sum } = upperOf(s, seat);
  const reach = boxes.reduce((n, b, i) => n + (b.face !== undefined && s.sheets[seat]![i] === null ? b.face * YACHT_DICE : 0), 0);
  return sum < bonusAt && sum + reach >= bonusAt;
}

/** The best box for these dice and what it is worth. */
function bestBox(s: YachtState, seat: number, counts: Counts, chasing: boolean): { box: number; value: number } {
  const { boxes } = sheetOf(s);
  let best = { box: -1, value: -Infinity };
  for (const o of optionsFor(s, seat, counts)) {
    const value = worth(boxes[o.box]!, o.score, chasing);
    if (value > best.value) best = { box: o.box, value };
  }
  // An extra Yacht's bonus comes whichever box it goes in.
  if (jokerOf(s, seat, counts) && s.sheets[seat]![boxes.findIndex((b) => b.id === "yacht")] === 50) best.value += YACHT_BONUS;
  return best;
}

export interface YachtPlan {
  /** Score now, in this box… */
  box: string | null;
  /** …or roll again, keeping this many of each face (`keep[3]` threes). */
  keep: number[] | null;
  /** What the turn is expected to be worth from here, in the computer player's own terms. */
  value: number;
}

/** What the sharpest player would do with a seat's dice now: the box to score, or the dice to keep and roll again. */
export function yachtPlan(s: YachtState, seat: number): YachtPlan | null {
  const hand = handOf(s, seat);
  if (!canPlay(s, seat) || hand.rolls === 0) return null;
  const t = tables();
  const { boxes } = sheetOf(s);
  const chasing = chasingBonus(s, seat);
  const counts = countsOf(hand.dice);
  const now = bestBox(s, seat, counts, chasing);
  const stop: YachtPlan = { box: boxes[now.box]!.id, keep: null, value: now.value };
  const left = YACHT_ROLLS - hand.rolls;
  if (left <= 0) return stop;
  // What every final roll is worth, then what every keep is worth with a roll to come.
  let final = Float64Array.from(t.rolls, (r) => bestBox(s, seat, r.counts, chasing).value);
  const average = (values: Float64Array) =>
    Float64Array.from(t.to, (targets, keep) => {
      let sum = 0;
      for (let i = 0; i < targets.length; i++) sum += t.chance[keep]![i]! * values[targets[i]!]!;
      return sum;
    });
  let keeping = average(final);
  if (left > 1) {
    // With two rolls to come, a roll is worth the better of stopping there and its best keep.
    final = final.map((value, roll) => t.keeps[roll]!.reduce((best, keep) => Math.max(best, keeping[keep]!), value));
    keeping = average(final);
  }
  const here = t.rollIndex.get(keyOf(counts))!;
  let best = -1;
  for (const keep of t.keeps[here]!) if (t.keepList[keep]!.size < YACHT_DICE && (best < 0 || keeping[keep]! > keeping[best]!)) best = keep;
  // Rolling has to beat stopping by a whisker: with nothing in it, take the points.
  return keeping[best]! > now.value + 1e-9 ? { box: null, keep: t.keepList[best]!.counts, value: keeping[best]! } : stop;
}

/**
 * What someone not really thinking does: keeps whatever they have most of and rolls the rest, takes
 * anything worth 25 as soon as it turns up, and at the end puts the dice wherever they score most
 * today, with no thought for what the box might have been worth later.
 */
function casualPlan(s: YachtState, seat: number): YachtPlan {
  const hand = handOf(s, seat);
  const { boxes } = sheetOf(s);
  const counts = countsOf(hand.dice);
  const top = optionsFor(s, seat, counts).reduce((a, b) => (b.score > a.score ? b : a));
  const most = Math.max(...counts);
  if (hand.rolls >= YACHT_ROLLS || top.score >= 25 || most === YACHT_DICE) return { box: boxes[top.box]!.id, keep: null, value: top.score };
  const keep = counts.map((c, face) => (most > 1 && face === counts.lastIndexOf(most) ? c : 0));
  return { box: null, keep, value: 0 };
}

function bot(s: YachtState, seat: number, style: PlayStyle): YachtMove | null {
  if (!canPlay(s, seat)) return null;
  const hand = handOf(s, seat);
  if (hand.rolls === 0) return { type: "roll" };
  // Keeping dice takes a move a die, so the plan has to be the same one each time it's asked for
  // between two rolls: whether this is a careless moment is decided by the dice, not by the clock.
  const rand = mulberry32((s.rng ^ Math.imul(hand.throws + 1, 0x9e3779b1) ^ Math.imul(seat + 1, 0x85ebca6b)) >>> 0);
  const plan = careless(style, rand) ? casualPlan(s, seat) : yachtPlan(s, seat)!;
  if (plan.box !== null) return { type: "score", cell: plan.box };
  // Which dice to keep: the ones already kept first, so as few as possible change hands.
  const want = [...plan.keep!];
  const keep = Array<boolean>(YACHT_DICE).fill(false);
  for (const held of [true, false]) {
    hand.dice.forEach((value, die) => {
      if (hand.held[die] === held && want[value]! > 0) {
        keep[die] = true;
        want[value]! -= 1;
      }
    });
  }
  const die = keep.findIndex((k, i) => k !== hand.held[i]);
  return die >= 0 ? { type: "hold", die } : { type: "roll" };
}

// ---- The game -----------------------------------------------------------------------------------

function normalize(rules: unknown): YachtRules {
  const given = (rules && typeof rules === "object" ? rules : {}) as Partial<YachtRules>;
  const base = PRESETS.find((p) => p.id === given.id) ?? classicYacht;
  const r = { ...base, ...given };
  const sheet = r.sheet === "yatzy" || r.sheet === "quick" ? r.sheet : "classic";
  return {
    id: String(r.id),
    name: String(r.name),
    sheet,
    // Yatzy has no jokers: five of a kind is one box and that's that.
    bonus: sheet !== "yatzy" && !!r.bonus,
    order: r.order === "together" ? "together" : "turns",
    drinking: !!r.drinking,
  };
}

const SHOTZEE_HINT = "Adults only. The table is Shotzee: roll five of a kind and everyone else takes a shot; a zero on your sheet costs you a drink (water counts).";

export const yacht: BoardGame<YachtRules, YachtState, YachtMove> = {
  id: "yacht",
  name: "Yacht",
  emoji: "🎲",
  blurb: "Five dice, three rolls, one scorecard",
  tagline: "Roll five dice up to three times, then pick the box they score best in. Fill your sheet with the highest total.",
  seats: { min: 1, max: 6, default: 2 },
  teams: false,
  presets: PRESETS,
  fields: [
    { key: "sheet", label: "Scorecard", kind: "choice", options: [["classic", "Classic: thirteen boxes"], ["yatzy", "Yatzy: fifteen boxes, with pairs"], ["quick", "Quick: the bottom seven"]] },
    { key: "bonus", label: "Extra Yachts", hint: "Classic and Quick. Once your Yacht box is filled, another five of a kind is a joker (a full house or a straight if you need one), and worth 100 more if the box holds 50.", kind: "toggle" },
    { key: "order", label: "Who rolls when", hint: "Everyone at once: each player has their own dice and nobody waits for a turn.", kind: "choice", options: [["turns", "In turn"], ["together", "Everyone at once"]] },
    drinkingField<YachtRules>(SHOTZEE_HINT),
  ],
  normalize,
  validate: () => [],
  describe(r) {
    const { boxes, bonus, bonusAt } = SHEETS[r.sheet];
    const five = yachtName(r);
    return [
      `On your turn, roll five dice. Keep any you like and roll the rest again, up to ${YACHT_ROLLS} rolls in all. Then the dice go in one empty box of your sheet, for what they score there, or for nothing if they don't fit.`,
      `There are ${boxes.length} boxes, and so ${boxes.length} rounds. When every sheet is full, the highest total wins.`,
      ...(bonus ? [`The top half: add up the dice of one number. ${bonusAt} or more over the six boxes (three of each) earns a bonus of ${bonus}.`] : []),
      r.sheet === "yatzy"
        ? `The bottom half: one pair and two pairs (add the pairs), three and four of a kind (add those dice), a small straight (1 to 5) for 15, a large straight (2 to 6) for 20, a full house (add all five), Chance (add all five), and ${five}, five of a kind, for 50.`
        : `${bonus ? "The bottom half" : "The sheet"}: three and four of a kind (add all five dice), a full house for 25, a small straight (four in a row) for 30, a large straight (five in a row) for 40, ${five}, five of a kind, for 50, and Chance (add all five).`,
      ...(r.sheet !== "yatzy"
        ? [
            r.bonus
              ? `Extra ${five}s: once your ${five} box is filled, another five of a kind is a joker. It has to go in its own number${bonus ? " in the top half if that's empty; otherwise" : ", or"} anywhere in the bottom half, where it counts as a full house or either straight. If your ${five} box holds 50, it's worth ${YACHT_BONUS} more.`
              : `A second ${five} is nothing special: it scores what the box it goes in says.`,
          ]
        : []),
      r.order === "together" ? "Everyone rolls at once, each with dice of their own that nobody else sees. When everyone has scored, the next round starts." : "Players take turns, and everyone watches the dice.",
      ...(r.drinking ? [`🍺 Drinking mode: this is Shotzee. Roll five of a kind and everyone else at the table takes a shot. Put a zero in any box and you take a drink.`] : []),
    ];
  },
  newGame: newYacht,
  apply,
  view,
  bot,
  thinkingTime(s, seat) {
    // Rolling is quick, setting a die aside quicker; choosing a box is the part people think about.
    const next = bot(s, seat, {});
    return next?.type === "score" ? 1300 : next?.type === "hold" ? 420 : 800;
  },
  summary(s) {
    const over = s.phase === "finished";
    const all = totals(s);
    return {
      game: "yacht",
      rules: s.rules.name,
      phase: s.phase,
      over,
      hand: s.round,
      scoreLine: all.join(" · ") + (s.seats === 1 ? " points" : "") + (s.rules.drinking ? ` · 🍺 ${s.tally.drank.join(" · ")}` : ""),
      order: over ? rankSeats(all.map((score, seat) => ({ seats: [seat], score }))) : null,
      winners: over ? winnersOf(s) : null,
      teams: false,
      seats: s.seats,
    };
  },
};
