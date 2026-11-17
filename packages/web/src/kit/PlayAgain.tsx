import { useContext } from "react";
import { RecordShown, recordLine, SKILL_NAME } from "../record";

// The buttons at the end of a game. At a practice table "Play again" deals the same game again at
// once, and a second button goes back to the game's page; elsewhere (a family table) there is only
// the way back, as before.
export function PlayAgain({ onAgain, onLeave }: { onAgain?: () => void; onLeave: () => void }) {
  const shown = useContext(RecordShown);
  const record = shown && (
    <>
      <p className="record-line">{recordLine(shown.record)}</p>
      {shown.harder && (
        <p className="record-nudge">
          Three wins in a row. Try the computer players on {SKILL_NAME[shown.harder]}?{" "}
          <button type="button" className="link" onClick={shown.raise}>
            Make them {SKILL_NAME[shown.harder]}
          </button>
        </p>
      )}
    </>
  );
  if (!onAgain)
    return (
      <>
        {record}
        <button type="button" className="primary" onClick={onLeave}>
          Play again
        </button>
      </>
    );
  return (
    <>
      {record}
      <button type="button" className="primary" onClick={onAgain}>
        Play again
      </button>
      <button type="button" className="secondary" onClick={onLeave}>
        Change the rules or the game
      </button>
    </>
  );
}
