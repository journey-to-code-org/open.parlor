import { ARCADE_GAMES, IDLE_GAMES, KIT_GAMES, type ArcadeGameId, type IdleGameId } from "@journey-to-code/games";
import { arcadeBlurb } from "./arcade/flavour";
import { arranged } from "./catalogue";
import type { GameId } from "./storage";

export const GAME_LIST: { id: GameId; name: string; emoji: string; blurb: string }[] = [
  { id: "spades", name: "Spades", emoji: "♠\uFE0E", blurb: "Partners, bids and nils" },
  { id: "palace", name: "Palace", emoji: "🏰", blurb: "First to shed every card wins" },
  ...KIT_GAMES.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, blurb: g.blurb })),
];

/**
 * The arcade games: played in this browser against the game itself. They are on the front page with
 * the rest, but not in `GAME_LIST`, which is the games a table can be opened for (houses, the lobby,
 * challenges and tournaments go by it).
 */
export const ARCADE_LIST: { id: ArcadeGameId; name: string; emoji: string; blurb: string }[] = ARCADE_GAMES.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, blurb: arcadeBlurb(g.id, g.blurb) }));
/** The idle games: they carry on while nobody is looking, one player each, kept in this browser. */
export const IDLE_LIST: { id: IdleGameId; name: string; emoji: string; blurb: string }[] = IDLE_GAMES.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, blurb: g.blurb }));
/** A game that is played on its own screen, with no table opened for it. */
export type SoloGameId = ArcadeGameId | IdleGameId;
/** Everything the front page offers. */
export const EVERY_GAME: { id: GameId | SoloGameId; name: string; emoji: string; blurb: string }[] = [...GAME_LIST, ...ARCADE_LIST, ...IDLE_LIST];

/** Which game: a row of big, plain buttons. */
export function GamePicker({ game, onPick }: { game: GameId; onPick: (game: GameId) => void }) {
  return (
    <nav className="game-picker" aria-label="Game">
      {arranged(GAME_LIST).map((g) => (
        <button key={g.id} type="button" className={g.id === game ? "picked" : ""} aria-pressed={g.id === game} onClick={() => onPick(g.id)}>
          <span aria-hidden>{g.emoji}</span> {g.name}
          <small>{g.blurb}</small>
        </button>
      ))}
    </nav>
  );
}

/** On a game's setup screen: back to the front page with every game. */
export function AllGames({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="link all-games" onClick={onClick}>
      ← All games
    </button>
  );
}
