// The buttons at the end of a game. At a practice table "Play again" deals the same game again at
// once, and a second button goes back to the game's page; elsewhere (a family table) there is only
// the way back, as before.
export function PlayAgain({ onAgain, onLeave }: { onAgain?: () => void; onLeave: () => void }) {
  if (!onAgain)
    return (
      <button type="button" className="primary" onClick={onLeave}>
        Play again
      </button>
    );
  return (
    <>
      <button type="button" className="primary" onClick={onAgain}>
        Play again
      </button>
      <button type="button" className="secondary" onClick={onLeave}>
        Change the rules or the game
      </button>
    </>
  );
}
