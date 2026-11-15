// The moves of a game in its own notation (a chess game's "1. e4 e5 2. Nf3…"), for a game whose
// view keeps a record. It can be stepped through, back to the start and forward again, while the
// game is on and after it ends: the board table draws the position looked at, and offers no move
// from it. The whole record can be copied as text (a PGN).
import type { BoardRecord } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { named } from "../kit/KitTable";

/** Put text on the clipboard, by the old way where the new one isn't allowed (a page inside a frame). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0";
    document.body.append(area);
    area.select();
    let done = false;
    try {
      done = document.execCommand("copy");
    } catch {}
    area.remove();
    return done;
  }
}

/** A PGN's date is the day it was played: the engine never knows the time of day, so it's filled in here. */
const dated = (text: string) => {
  const d = new Date();
  return text.replace('[Date "????.??.??"]', `[Date "${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}"]`);
};

/**
 * `shown` is how many of the moves have been made in the position on the board (all of them,
 * unless someone is looking back); `onShow` asks for another, and null means "the game as it stands".
 */
export function RecordStrip({ record, names, shown, onShow }: { record: BoardRecord; names: string[]; shown: number; onShow: (count: number | null) => void }) {
  const list = useRef<HTMLOListElement>(null);
  const total = record.moves.length;
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  // Keep the move being looked at in sight as the list grows or is stepped through.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="step"]') ?? list.current?.lastElementChild;
    if (el && list.current) list.current.scrollLeft = Math.max(0, (el as HTMLElement).offsetLeft - list.current.clientWidth / 2);
  }, [shown, total]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(""), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const go = (count: number) => onShow(count >= total ? null : Math.max(0, count));
  const onKey = (e: React.KeyboardEvent) => {
    const to = { ArrowLeft: shown - 1, ArrowRight: shown + 1, Home: 0, End: total }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  };
  const what = (count: number) => (count === 0 ? "the start" : `${record.moves[count - 1]!.turn}${record.moves[count - 1]!.by === record.moves[0]!.by ? "." : "…"} ${record.moves[count - 1]!.label}`);
  return (
    <div className="board-record" role="group" aria-label="The moves so far. Left and right arrows step through them." onKeyDown={onKey}>
      <div className="record-steps">
        <button type="button" onClick={() => go(0)} disabled={shown === 0} aria-label="Back to the start">
          ⏮
        </button>
        <button type="button" onClick={() => go(shown - 1)} disabled={shown === 0} aria-label="Back a move">
          ◀
        </button>
        <button type="button" onClick={() => go(shown + 1)} disabled={shown >= total} aria-label="Forward a move">
          ▶
        </button>
        <button type="button" onClick={() => go(total)} disabled={shown >= total} aria-label="Forward to where the game is now">
          ⏭
        </button>
      </div>
      <ol className="record-moves" ref={list}>
        {total === 0 && <li className="record-none">No moves yet</li>}
        {record.moves.map((m, i) => {
          // A number before each move of the side that began, and before the very first move whoever makes it.
          const numbered = i === 0 || m.turn !== record.moves[i - 1]!.turn;
          return (
            <li key={i}>
              {numbered && (
                <span className="record-turn" aria-hidden>
                  {m.turn}.{i === 0 && total > 1 && record.moves[1]!.turn !== m.turn ? ".." : ""}
                </span>
              )}
              <button type="button" className={i + 1 === shown ? "current" : ""} aria-current={i + 1 === shown ? "step" : undefined} aria-label={`Move ${m.turn}, ${named(`{${m.by}}`, names)}: ${m.label}`} onClick={() => go(i + 1)}>
                {m.label}
              </button>
            </li>
          );
        })}
      </ol>
      {record.export && (
        <button type="button" className="record-copy" onClick={() => void copyText(dated(named(record.export!.text, names))).then((ok) => setCopied(ok ? "yes" : "no"))}>
          {copied === "yes" ? "Copied" : copied === "no" ? "Couldn't copy" : `Copy ${record.export.label}`}
        </button>
      )}
      <span className="sr-only" role="status">
        {copied === "yes" ? `${record.export?.label} copied` : shown < total ? `Looking at the position after ${what(shown)}` : ""}
      </span>
    </div>
  );
}
