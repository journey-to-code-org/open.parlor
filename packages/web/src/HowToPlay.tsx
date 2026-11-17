// How to play, at the table. The first time someone sits down to a game on this device it opens by
// itself; after that the "?" in the table's top bar brings it back. It says how you play here (what
// to tap, drag or type, which depends on the kind of table) and then the rules in words, from the
// game's own `describe` of the rules this table is played by (or its usual rules, where the table
// doesn't know them, as when joining someone else's).
import { isBoardGame, isSportGame, isWordGame, kitGame, type KitGameId } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";

const SEEN = (game: string) => `parlor.howto.${game}`;

const seen = (game: string) => {
  try {
    return localStorage.getItem(SEEN(game)) === "1";
  } catch {
    return true;
  }
};

/** What you do with your hands at this game's table, in a line or three. */
export function controls(game: string): string[] {
  switch (game) {
    case "billiards":
      return ["Press anywhere on the table, pull back and let go: the cue ball goes the opposite way to your pull, harder the further you pull.", "Before a break or with ball in hand, slide the cue ball into place with the arrows first.", "The buttons under the table aim and set the power exactly, if you'd rather."];
    case "carrom":
      return ["Slide the striker along your line with the arrows, then pull back and let go to flick it.", "Pull back to where you started to call the flick off."];
    case "minigolf":
      return ["Press anywhere on the course, pull back and let go: the ball goes the opposite way, harder the further you pull.", "The buttons under the course aim and set the power exactly."];
    case "bowling":
      return ["Drag sideways on the lane to choose where you stand.", "Swipe up the lane to bowl: faster is harder, and a swipe that curls at the end puts spin on the ball."];
    case "wordhunt":
      return ["Drag across the grid from letter to touching letter to spell a word, and let go to send it. Or tap the letters one by one and press Enter.", "Words found by someone else as well score for nobody."];
    case "crisscross":
      return ["Tap a tile in your hand, then a square on the board. Lay a whole word in one line, then press Play.", "Take back lifts your tiles again; Shuffle mixes your hand."];
    case "pig":
      return ["Two buttons under the dice: roll again, or stop and bank what the turn has made.", "The gold button is the one most players would press."];
    case "shipcaptaincrew":
      return ["Press Roll: the six, the five and the four are set aside for you as they turn up.", "With all three aboard, keep your cargo or roll both of its dice again."];
    case "tenthousand":
      return ["After a roll, every die that scores is kept for you. Tap one to put it back and roll it again.", "Then bank the turn's points, or roll the dice that are left."];
    case "shutthebox":
      return ["Roll, then tap tiles that add up to the roll. Only tiles that can be part of it can be tapped.", "Tap a tile you have just shut to open it again. The roll is made when the tiles add up."];
    case "liarsdice":
      return ["Your dice are yours alone: nobody else sees them.", "Tap a bid to make it, or Liar! to call the last one.", "After a call everyone's dice are shown. Press Next round when you've looked."];
    case "drawguess":
      return ["When it's your turn to draw, pick one of three words and draw it with your finger. Pick a pen colour and size under the canvas.", "Otherwise, type what you think the drawing is. The sooner you get it, the more it scores."];
  }
  if (isSportGame(game as KitGameId)) return ["Press on the table, pull back and let go."];
  if (isWordGame(game as KitGameId)) return ["Type on the keyboard on the screen, or on your own keyboard, and press Enter to send.", "A word that isn't one comes back refused, and costs nothing."];
  if (isBoardGame(game as KitGameId)) return ["Tap a piece to pick it up, then tap where it goes (or drag it there). Tap it again to put it down.", "When there's a choice to make, such as rolling or passing, its button appears under the board."];
  return ["Tap a card in your hand to play it.", "When there's a choice to make, such as bidding, drawing or passing, its buttons appear under the table."];
}

/** The rules in words, for these rules if they're known. */
function ruleLines(game: KitGameId, rules: unknown): string[] {
  const kit = kitGame(game);
  if (!kit) return [];
  try {
    return kit.describe(kit.normalize(rules ?? kit.presets[0]));
  } catch {
    return kit.describe(kit.presets[0]);
  }
}

/** Open by itself the first time this game is played on this device. */
export function useHowToPlay(game: string, watching = false) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!watching && !seen(game)) setOpen(true);
  }, [game, watching]);
  const close = () => {
    try {
      localStorage.setItem(SEEN(game), "1");
    } catch {
      /* private mode: it will open again next time, which is harmless */
    }
    setOpen(false);
  };
  return { open, show: () => setOpen(true), close };
}

export function HowToPlay({ game, rules, onClose }: { game: KitGameId; rules?: unknown; onClose: () => void }) {
  const kit = kitGame(game);
  const ok = useRef<HTMLButtonElement>(null);
  // Focus on "Got it" without scrolling to it, so a long sheet opens at its title.
  useEffect(() => ok.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);
  if (!kit) return null;
  const lines = ruleLines(game, rules);
  return (
    <div className="howto-backdrop" onClick={onClose}>
      <section className="howto" role="dialog" aria-modal="true" aria-labelledby="howto-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="howto-title">
          <span aria-hidden>{kit.emoji}</span> How to play {kit.name}
        </h2>
        <p className="howto-tagline">{kit.tagline}</p>
        <h3>Playing here</h3>
        <ul>
          {controls(game).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {lines.length > 0 && (
          <>
            <h3>{rules === undefined ? "The usual rules" : "The rules at this table"}</h3>
            <ul>
              {lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </>
        )}
        <button type="button" className="primary" ref={ok} onClick={onClose}>
          Got it
        </button>
        <p className="fine">The ? at the top of the table brings this back.</p>
      </section>
    </div>
  );
}

/** The "?" in a table's top bar. */
export function HowToButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="sound-toggle inline howto-button" onClick={onClick} aria-label="How to play" aria-haspopup="dialog">
      ?
    </button>
  );
}
