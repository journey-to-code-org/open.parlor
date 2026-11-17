// Several people at one screen: a game played by handing the device round, or with it lying on the
// table between you. No server and no connection: it is a practice table whose other seats are
// people instead of computer players.
//
// It only suits a game with nothing to hide. At a table of Hearts every seat's view holds a hand
// the others mustn't see, and one screen can't keep a secret from the person holding it. So the
// list below is the games where every seat sees the same table: the board games, the dice, the
// table sports, Memory and Hangman (Secret Word and Anagrams keep each player's words to themselves). Combat is a board game and still isn't here: the fleets are hidden.
import { QUICK_BUDGET, QUICK_STYLE, isKitGame, kitGame, type KitGameId, type TableGame } from "@journey-to-code/games";

const SHARED: ReadonlySet<KitGameId> = new Set<KitGameId>(["tictactoe", "dropfour", "reversi", "checkers", "go", "chess", "backgammon", "yacht", "memory", "minigolf", "bowling", "billiards", "carrom", "hangman"]);

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
