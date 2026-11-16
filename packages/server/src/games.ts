// The games the parlor plays, and one room definition that hands each table to its game.
//
// A room's options say which game it is. Spades rooms keep the options they always had (the house
// rules themselves), so tables and logs from before there were other games still work; any other
// game's options carry `game`.
import { KIT_GAMES, isBoardGame, isKitGame, isSportGame, kitGame, kitGreet, reactToKit, type KitGameId, type ThinkBudget } from "@journey-to-code/games";
import { palaceGreet, palaceReplyTo, reactToPalace, type PalaceState } from "@journey-to-code/palace";
import { sharedView, type RoomDefinition } from "@journey-to-code/rooms/server";
import { cleanSettings, greet, reactToMove, replyTo, type GameState, type RulePreset, type Seat } from "@journey-to-code/rules";
import { palaceOptions, palaceRoom, type PalaceOptions } from "./palace.js";
import { spadesRoom } from "./spades.js";
import { kitOptions, kitRoom, kitSpent, kitTimeoutMove, type KitOptions } from "./kit.js";
import { sooner, turnDeadline } from "./timer.js";
import { arcadeGame } from "@journey-to-code/games";
import { arcadeOptions, arcadeRoom, isLiveArcade, type ArcadeOptions, type LiveState } from "./arcade.js";
import { flightOptions, flightRoom, isFlight, type FlightOptions, type FlightState } from "./flight.js";

export type GameId = "spades" | "palace" | KitGameId;
export const GAMES: { id: GameId; name: string; emoji: string; seats: [number, number]; teams: boolean }[] = [
  { id: "spades", name: "Spades", emoji: "♠️", seats: [4, 4], teams: true },
  { id: "palace", name: "Palace", emoji: "🏰", seats: [2, 6], teams: false },
  ...KIT_GAMES.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, seats: [g.seats.min, g.seats.max] as [number, number], teams: g.teams })),
];
export const gameName = (id: GameId) => GAMES.find((g) => g.id === id)?.name ?? arcadeGame(id)?.name ?? "Spades";
export const gameEmoji = (id: GameId) => GAMES.find((g) => g.id === id)?.emoji ?? arcadeGame(id)?.emoji ?? "🃏";
export const isGameId = (id: unknown): id is GameId => GAMES.some((g) => g.id === id);

export type TableOptions = RulePreset | PalaceOptions | KitOptions | ArcadeOptions | FlightOptions;
type AnyState = GameState | PalaceState | ({ game: KitGameId } & Record<string, unknown>) | LiveState | FlightState;

/**
 * A room's game, from its options or its state. Spades rooms have no `game` (they predate the others).
 * An arcade game played live (arcade.ts) has a room too. It is not one of GAMES: no lobby, house
 * table, challenge or tournament offers it, and a table of one is opened from its own setup screen.
 */
const gameOf = (x: unknown): GameId => {
  const g = (x as { game?: string } | null)?.game;
  return g === "palace" || isKitGame(g) || isLiveArcade(g) || isFlight(g) ? (g as GameId) : "spades";
};
/** Whether a room's game is an arcade game played live. */
const live = (id: GameId): boolean => isLiveArcade(id) || isFlight(id);
/** The room for an arcade game played live: by orders through the room itself, or flown beside it (flight.ts). */
const liveRoom = (id: GameId): RoomDefinition<any, any, any, any, any> => (isFlight(id) ? flightRoom : arcadeRoom);
export const gameOfOptions = gameOf;
export const gameOfState = gameOf;

const rooms: Record<GameId, RoomDefinition<any, any, any, any, any>> = {
  spades: spadesRoom,
  palace: palaceRoom,
  ...(Object.fromEntries(KIT_GAMES.map((g) => [g.id, kitRoom])) as Record<KitGameId, typeof kitRoom>),
};
const roomFor = (id: GameId): RoomDefinition<any, any, any, any, any> => (live(id) ? liveRoom(id) : rooms[id]);
const byState = (s: AnyState) => roomFor(gameOfState(s));

/**
 * How long a game that thinks by the clock gets for the move the turn timer makes for someone who
 * ran out of time. That move is worked out on the main thread, the moment the time is up (it never
 * waits its turn behind other tables' thinks), so it has to be a short one. The games here don't
 * think by the clock, and play what they would have anyway.
 */
export const TIMEOUT_BUDGET: ThinkBudget = { ms: 150 };

export const tableRoom: RoomDefinition<AnyState, unknown, unknown, TableOptions, unknown> = {
  seats: (o) => {
    const room = roomFor(gameOfOptions(o));
    return typeof room.seats === "function" ? room.seats(o) : room.seats;
  },
  setup: (o, seed) => roomFor(gameOfOptions(o)).setup(o, seed),
  info: (o) => {
    const game = gameOfOptions(o);
    if (live(game)) return { game, rules: (isFlight(game) ? flightOptions : arcadeOptions)(game, (o as ArcadeOptions).rules, (o as ArcadeOptions).seats).rules.name };
    if (game === "palace") return { game, rules: palaceOptions((o as PalaceOptions).rules, (o as PalaceOptions).seats).rules.name };
    if (game === "spades") return { game, rules: (o as RulePreset).name };
    return { game, rules: kitOptions(kitGame(game)!, (o as KitOptions).rules, (o as KitOptions).seats).rules.name };
  },
  act: (s, seat, move, time) => byState(s).act(s, seat, move, time),
  view: (s, seat) => byState(s).view(s, seat),
  watch: (s, views) => watchView(gameOfState(s), views),
  // Every summary says its game, so a lobby or a blog embed can tell tables apart.
  summary: (s) => ({ game: gameOfState(s), ...(byState(s).summary?.(s) as object) }),
  finished: (s) => byState(s).finished?.(s) ?? false,
  // How well and how fast the computer players play, for every game.
  settings: cleanSettings,
  botDelay: (s, seat, name, settings) => byState(s).botDelay?.(s, seat, name, settings) ?? 700,
  bot: (s, seat, name, settings) => byState(s).bot?.(s, seat, name, settings) ?? null,
  // Two clocks can be running: the game's own (a shot clock, which makes the game's timeout move) and
  // the turn timer (a table setting: the game's computer player moves for a person who runs out of
  // time). Whichever runs out first is the room's deadline.
  // An arcade game played live has neither: its deadline is the beat that keeps it moving.
  deadline: (s, table) => (live(gameOfState(s)) ? (liveRoom(gameOfState(s)).deadline!(s, table) as ReturnType<NonNullable<typeof kitRoom.deadline>>) : sooner(byState(s).deadline?.(s, table) ?? null, turnTimer(s, table))),
};

/**
 * The turn timer for a table. At a kit game it plays the computer player's move on the board, never
 * its answer to an offer, and it isn't put off by one: the room counts a deadline from the last move
 * of any kind, so the time an offer and its answer took is taken off what is left.
 */
function turnTimer(s: AnyState, table: Parameters<NonNullable<typeof tableRoom.deadline>>[1]) {
  const kit = isKitGame(gameOfState(s)) ? (s as { game: KitGameId } & Record<string, unknown>) : null;
  const due = turnDeadline(s as Exclude<AnyState, LiveState | FlightState>, table, (seat, name) => (kit ? kitTimeoutMove(kit, seat, name, table.settings, TIMEOUT_BUDGET) : (byState(s).bot?.(s, seat, name, table.settings) ?? null)));
  const spent = kit ? kitSpent(kit) : 0;
  return due && spent > 0 && due.after !== undefined ? { ...due, after: Math.max(0, due.after - spent) } : due;
}

/**
 * What someone watching a table sees: the table as every seat sees it, with nobody's hand and
 * nobody's moves, looking on from the first seat's side (a page can turn it to any side).
 * Each kind of game names its private parts; `sharedView` then drops anything else the seats
 * don't all see alike.
 */
export function watchView(game: GameId, views: unknown[]): unknown {
  type Any = Record<string, unknown>;
  const seats = views as Any[];
  // An arcade game played live: everyone is on the same side, and nothing is hidden.
  if (live(game)) return seats[0];
  if (game === "spades") return sharedView(seats, { blank: { hand: [], legal: [], myPass: null }, from: { seat: 0, keys: ["seat", "team", "partner", "teamSeats"] } });
  if (game === "palace") return sharedView(seats, { blank: { hand: [], can: null }, from: { seat: 0, keys: ["you"] } });
  // A table sport has nothing hidden: every ball is in plain sight of everyone. What can differ
  // between seats is which table they are shown (played all at once, mini golf gives each seat
  // the hole with its own ball on it and the others as ghosts, and the last shot it took itself).
  // Compared part by part those would come out as a ball with no place, so a watcher is given the
  // first seat's table and the shot that goes with it, whole, and nobody's aim or buttons.
  if (isSportGame(game)) {
    const view = sharedView(seats, { blank: { shoot: null, choices: null }, from: { seat: 0, keys: ["me", "table", "last"] } });
    if (Array.isArray(view.info)) view.info = view.info.filter((line) => typeof line === "string");
    return view;
  }
  // A board that belongs to one seat (a fleet in Combat) is nobody else's, and neither is what that
  // seat holds off the board. Left in, two fleets that happened to overlap would show where: the
  // seats' views are compared part by part, and a watcher can be someone sitting at the table.
  // Only on a board: a card game's grids (Golf's cards in front of each player) have an owner too,
  // and those are for everyone to see.
  const owned = isBoardGame(game) && seats.some((v) => Array.isArray(v.grids) && v.grids.some((g) => (g as Any).owner !== undefined));
  let open = !owned ? seats : seats.map((v) => (Array.isArray(v.grids) ? { ...v, grids: v.grids.filter((g) => (g as Any).owner === undefined), reserves: [] } : v));
  // What's left then is each seat's picture of someone else's board (in Combat, the other player's
  // waters): not one board that every seat sees, so its squares can't be compared place by place.
  // Two sunk ships that happened to lie in the same spot would come out as a hull on a board that
  // is neither player's. Unless every seat sees such a board exactly alike, a watcher sees it empty.
  if (owned) {
    const cells = (v: Any, i: number) => JSON.stringify(((v.grids as Any[] | undefined)?.[i] ?? null)?.cells ?? null);
    const alike = (i: number) => open.every((v) => cells(v, i) === cells(open[0]!, i));
    open = open.map((v) => (Array.isArray(v.grids) ? { ...v, grids: (v.grids as Any[]).map((g, i) => (alike(i) || !Array.isArray(g.cells) ? g : { ...g, cells: g.cells.map(() => null), marks: [] })) } : v));
  }
  // Dice and a score sheet (Yacht): the dice are the table's unless they are one seat's own (everyone
  // rolling at once), and those go the way of a private grid. What a seat could do with them, keep a
  // die or fill in a box, is that seat's alone.
  const plain = !isBoardGame(game)
    ? open
    : open.map((v) => {
        const dice = v.dice as Any | null | undefined;
        const sheet = v.sheet as Any | null | undefined;
        if (!dice && !sheet) return v;
        return { ...v, ...(dice ? { dice: dice.owner !== undefined ? null : { ...dice, tap: null } } : {}), ...(sheet ? { sheet: { ...sheet, pick: null } } : {}) };
      });
  const view = sharedView(plain, { blank: { hand: [], tap: null, pick: null, choices: null, gridTap: null }, from: { seat: 0, keys: ["me"] } });
  // A line of table talk only one seat was shown ("You were passed…") is nobody else's.
  if (Array.isArray(view.info)) view.info = view.info.filter((line) => typeof line === "string");
  // An offer at a board (a draw, a move taken back) is the table's to see and the players' to act
  // on: a watcher is shown what is open and how it came out, and nothing to press.
  if (view.offers && typeof view.offers === "object") view.offers = { ...(view.offers as Any), can: [], answer: false };
  // What may be tapped or picked up on a board is the players' and never a watcher's, even where
  // every seat is offered the same (either player marking dead stones when a game of Go is counted).
  if (isBoardGame(game) && Array.isArray(view.grids)) view.grids = (view.grids as Any[]).map((g) => (g && typeof g === "object" ? { ...g, tap: null, select: null } : g));
  return view;
}

export interface Remark {
  seat: number;
  text: string;
  delay: number;
}
type Cast = { bots: { seat: number; name: string }[] };

/** Table talk, in each game's own words. */
export const talk = {
  greet: (s: AnyState, cast: Cast): Remark[] => {
    const game = gameOfState(s);
    // Nobody talks over an arcade game.
    if (live(game)) return [];
    if (game === "palace") return palaceGreet(cast);
    if (game === "spades") return greet(cast as { bots: { seat: Seat; name: string }[] });
    return kitGreet(cast, undefined, game);
  },
  react: (before: AnyState, after: AnyState, cast: Cast): Remark[] => {
    const game = gameOfState(after);
    if (live(game)) return [];
    if (game === "palace") return reactToPalace(before as PalaceState, after as PalaceState, cast);
    if (game === "spades") return reactToMove(before as GameState, after as GameState, cast as { bots: { seat: Seat; name: string }[] });
    const kit = kitGame(game)!;
    return reactToKit(kit.summary(before), kit.summary(after), cast);
  },
  // Anything but spades answers in the shared reply lines (they're the same cast).
  reply: (game: GameId, text: string, seat: number, cast: Cast): Remark[] =>
    live(game) ? [] : game === "spades" ? replyTo(text, seat as Seat, cast as { bots: { seat: Seat; name: string }[] }) : palaceReplyTo(text, cast),
  finished: (s: AnyState) => {
    const game = gameOfState(s);
    if (live(game)) return liveRoom(game).finished!(s);
    return isKitGame(game) ? kitGame(game)!.summary(s).over : (s as { phase?: string }).phase === "finished";
  },
};
