// Several people at one screen: a game played by handing the device round, or with it lying on the
// table between you. No server and no connection: it is a practice table whose other seats are
// people instead of computer players.
//
// It only suits a game with nothing to hide. At a table of Hearts every seat's view holds a hand
// the others mustn't see, and one screen can't keep a secret from the person holding it. So the
// list below is the games where every seat sees the same table: the board games, the dice, the
// table sports, Memory and Hangman (Secret Word and Anagrams keep each player's words to themselves). Combat is a board game and still isn't here: the fleets are hidden. Nor is Liar's Dice (everyone's dice are): those two are passed round instead.
import { QUICK_BUDGET, QUICK_STYLE, isKitGame, kitGame, type KitGameId, type TableGame } from "@journey-to-code/games";
import { categoryOf } from "../categories";

const SHARED: ReadonlySet<KitGameId> = new Set<KitGameId>(["tictactoe", "dropfour", "reversi", "checkers", "go", "chess", "backgammon", "mancala", "ludo", "chinesecheckers", "yacht", "pig", "tenthousand", "shipcaptaincrew", "shutthebox", "memory", "minigolf", "bowling", "billiards", "carrom", "shuffleboard", "crokinole", "flickfootball", "hangman", "overthehill"]);

/**
 * Games played at once, or against each other's speed: a phone can't be passed round for these.
 * (Word Hunt races the clock; Speed and Slapjack race each other; Mahjong's calls come from anyone.)
 */
const RACES: ReadonlySet<string> = new Set(["speed", "slapjack", "war", "mahjongshanghai", "mahjongriichi", "wordhunt", "drawguess"]);

/**
 * Whether a game with something hidden (a hand of cards or dominoes, a fleet, a rack of tiles, dice under a cup) can still be
 * played round one device by passing it: the screen covers the table between people (a curtain:
 * "Pass to Ann"), so nobody sees anyone else's hand.
 */
export const passesDevice = (id: unknown): id is KitGameId => {
  if (!isKitGame(id) || SHARED.has(id) || RACES.has(id)) return false;
  const game = kitGame(id)!;
  const kind = categoryOf(id);
  return game.seats.max > 1 && game.practice !== false && (kind === "cards" || kind === "words" || id === "combat" || id === "liarsdice" || id === "dominoes");
};

/** Whether a game can be shared on one device: nothing hidden, and more than one seat. */
export const sharesDevice = (id: unknown): id is KitGameId => isKitGame(id) && SHARED.has(id) && kitGame(id)!.seats.max > 1;

/** "Player 2" for the second person, unless they gave a name. */
export const personName = (given: string | undefined, seat: number) => given?.trim().slice(0, 20) || `Player ${seat + 1}`;

/** Whether a seat has a move to make now. `heavy` first: it answers at once, where asking for the move itself may be a search. */
const hasMove = (game: TableGame<any, any, any, any>, state: unknown, seat: number) =>
  !!game.heavy?.(state, seat) || game.bot(state, seat, QUICK_STYLE, undefined, QUICK_BUDGET) !== null;

/**
 * Whose table the screen shows: the people are seats 0 to `people - 1`, and it is the one whose
 * move it is. `now` is the seat it shows already, which it keeps while a computer player moves, when
 * the game is over, and when everyone may move and that seat still has something to do (in Yacht
 * with everyone rolling at once, each person finishes their turn before the next takes the device).
 */
export function seatAtScreen(game: TableGame<any, any, any, any>, state: unknown, people: number, now: number): number {
  if (people <= 1) return 0;
  const view = game.view(state, now) as { turn: number | null; over: unknown };
  if (view.over) return now;
  if (view.turn !== null) return view.turn < people ? view.turn : now;
  for (let i = 0; i < people; i++) {
    const seat = (now + i) % people;
    if (hasMove(game, state, seat)) return seat;
  }
  return now;
}

/** What a seat's view says about whose move it is, in any kit game: all a table on the server has to go by. */
export interface SeatSight {
  me: number;
  turn?: number | null;
  over?: unknown;
  result?: unknown;
  shoot?: unknown;
  choices?: unknown;
}

/**
 * Whether a seat has something to do, going by its own view: it is its turn, or everyone may move
 * and it still has a shot to make or a choice it is being asked for. A seat that has already
 * agreed and is waiting for the others keeps a way back ("Play on" in Go), which is not being
 * asked: what a seat is asked for is marked as the main choice, or is a prompt with nothing to
 * press (Yacht's "Pick a box to score").
 */
function busy(view: SeatSight | undefined): boolean {
  if (!view || view.over) return false;
  if (typeof view.turn === "number") return view.turn === view.me;
  if (view.shoot != null) return true;
  const options = (view.choices as { options?: { primary?: boolean }[] } | null | undefined)?.options;
  return !!view.choices && (!options?.length || options.some((option) => option.primary));
}

/**
 * Whose table the screen shows at a table on the server, where this device has more than one seat
 * (`seats`, the device's own first) and the rest of the table is elsewhere. It is `seatAtScreen`
 * without the game's state, which only the server has: each seat's own view says whose turn it is.
 * The screen goes to whichever of this device's seats has the move, and stays where it is (`now`)
 * while someone on another device moves, when the game is over, and until a view has arrived.
 */
export function seatAtTable(views: Record<number, SeatSight | undefined>, seats: number[], now: number): number {
  const here = seats.includes(now) ? now : (seats[0] ?? now);
  if (seats.length <= 1) return here;
  const view = views[here] ?? seats.map((seat) => views[seat]).find(Boolean);
  if (!view || view.over) return here;
  if (typeof view.turn === "number") return seats.includes(view.turn) ? view.turn : here;
  if (busy(views[here])) return here;
  const at = seats.indexOf(here);
  for (let i = 1; i < seats.length; i++) {
    const seat = seats[(at + i) % seats.length]!;
    if (busy(views[seat])) return seat;
  }
  return here;
}
