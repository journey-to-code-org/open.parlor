// A board that is a track of points (the view's `track`): backgammon. Two rows of long triangles
// with the bar between the two halves and a tray at the end for checkers borne off; the checkers
// stand in stacks on their points, five high and then a number on the top one. The dice lie on the
// board, each player's on their own half, and the doubling cube sits beside the trays: in the
// middle while it is nobody's, on its owner's side after.
//
// Twenty-four points don't fit across a phone held upright at a size a thumb can hit, so on a
// narrow screen the board is laid on its side: the two rows become two columns, each point a wide
// strip, your home board still nearest you on the right. Nothing else changes: it is the same
// cells in the same order, placed by the stylesheet.
//
// Everything works as it does on a grid of squares. A checker that can move is tapped and then the
// point it goes to (or dragged there); with the table's "one tap moves" on, a checker with one
// place to go moves when it is tapped. Every point is a button with a spoken name ("point 6: five
// of your checkers, can move"), and the arrow keys walk from one to the next the way they lie on
// the screen.
import type { BoardCube, BoardDice, BoardGrid, BoardView } from "@journey-to-code/games";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dice } from "./Dice";

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
/** How many checkers of a stack are drawn before the rest become a number. */
const STACK_SHOWN = 5;
/** Narrower than this, and upright, the board is laid on its side. */
const TALL = "(max-width: 640px) and (orientation: portrait)";

/** A track this table knows how to draw: two rows of points. Anything else is drawn as a plain grid. */
export const isPointsTrack = (grid: BoardGrid) => grid.track?.kind === "points" && grid.rows === 2;

function useTall(): boolean {
  const [tall, setTall] = useState(() => typeof matchMedia === "function" && matchMedia(TALL).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(TALL);
    const on = () => setTall(query.matches);
    on();
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return tall;
}

export interface TrackProps {
  grid: BoardGrid;
  view: BoardView;
  names: string[];
  picked: number | string | null;
  /** A tap (or Enter) on a place. */
  onCell: (cell: number) => void;
  /** A checker pressed: pick it up, so the places it can go show. */
  onPick: (cell: number) => void;
  /** A checker dragged (or, with one tap moves, tapped) to a place it can go. */
  onMove: (from: number, to: number) => void;
  dice: BoardDice | null;
  cube: BoardCube | null;
  /** No tumbling or sliding: the table is set to move at once. */
  still: boolean;
  onTumble: (tumbling: boolean) => void;
}

/** A checker being dragged: where the press began, and whether it has moved far enough to be a drag and not a tap. */
interface Drag {
  cell: number;
  x: number;
  y: number;
  piece: HTMLElement | null;
  moved: boolean;
  pickedUp: boolean;
}

export function Track({ grid, view, names, picked, onCell, onPick, onMove, dice, cube, still, onTumble }: TrackProps) {
  const me = view.me;
  const track = grid.track!;
  const tall = useTall();
  const el = useRef<HTMLDivElement>(null);
  // The second seat sees the board turned over: the far row is the one its cells call the last.
  const over = grid.flip === "rows";
  const sideOf = (cell: number) => ((Math.floor(cell / grid.cols) === 0) !== over ? "far" : "near");
  // The places in the order they lie on the screen: the far row, then the near one.
  const order = useMemo(() => {
    const rows = [0, 1].map((r) => Array.from({ length: grid.cols }, (_, c) => r * grid.cols + c));
    return over ? [...rows[1]!, ...rows[0]!] : [...rows[0]!, ...rows[1]!];
  }, [grid.cols, over]);
  const [focus, setFocus] = useState(order[0]!);
  const marks = useMemo(() => {
    const at = new Map<number, string[]>();
    for (const m of grid.marks ?? []) at.set(m.cell, [...(at.get(m.cell) ?? []), m.mark]);
    return at;
  }, [grid.marks]);
  const sources = grid.select?.sources ?? [];
  const targets = new Set(picked === null ? [] : (sources.find((s) => s.from === picked)?.to ?? []));
  const sourceAt = (cell: number) => sources.find((s) => s.from === cell);

  /** A point's number, counted from the home of whoever is looking. */
  const numberOf = (cell: number) => {
    const at = track.path.indexOf(cell);
    return at < 0 ? null : over ? at + 1 : track.path.length - at;
  };
  const whoseBar = (cell: number) => track.bar?.indexOf(cell) ?? -1;
  const whoseHome = (cell: number) => track.home?.indexOf(cell) ?? -1;
  const nameOf = (seat: number) => names[seat] ?? `Seat ${seat + 1}`;

  function label(cell: number): string {
    const piece = grid.cells[cell];
    const n = piece?.count ?? (piece ? 1 : 0);
    const many = COUNT_WORDS[n] ?? String(n);
    const point = numberOf(cell);
    const bar = whoseBar(cell);
    const home = whoseHome(cell);
    const mine = piece?.owner === me;
    const marked = marks.get(cell) ?? [];
    let what: string;
    if (point !== null) what = `point ${point}: ${piece ? `${many} of ${mine ? "your" : `${nameOf(piece.owner ?? 0)}'s`} checkers` : "empty"}`;
    else if (bar >= 0) what = `${bar === me ? "the bar" : `the bar, ${nameOf(bar)}'s side`}: ${piece ? `${many} of ${mine ? "yours" : `${nameOf(bar)}'s`}` : "empty"}`;
    else if (home >= 0) what = `${home === me ? "your tray" : `${nameOf(home)}'s tray`}: ${n ? `${many} borne off` : "empty"}`;
    else return "";
    const notes = [
      ...(marked.includes("must") ? ["must enter first"] : []),
      ...(marked.includes("last") ? ["last move"] : []),
      ...(marked.includes("from") ? ["moved from here"] : []),
      ...(picked === cell ? ["picked up"] : sourceAt(cell) ? ["can move"] : []),
      ...(targets.has(cell) ? [home >= 0 ? "can bear off here" : "can go here"] : []),
    ];
    return notes.length ? `${what}, ${notes.join(", ")}` : what;
  }

  // The arrow keys go to the nearest place in that direction, wherever the stylesheet has put it.
  function onKey(e: React.KeyboardEvent) {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    const spots = [...(el.current?.querySelectorAll<HTMLElement>("[data-cell]") ?? [])];
    const from = spots.find((s) => Number(s.dataset.cell) === focus)?.getBoundingClientRect();
    if (!from) return;
    e.preventDefault();
    const [fx, fy] = [from.left + from.width / 2, from.top + from.height / 2];
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const spot of spots) {
      const r = spot.getBoundingClientRect();
      const dx = r.left + r.width / 2 - fx;
      const dy = r.top + r.height / 2 - fy;
      const along = dx * step[0]! + dy * step[1]!;
      const across = Math.abs(dx * step[1]!) + Math.abs(dy * step[0]!);
      if (along < 4) continue;
      // Straight ahead first: a step to the side costs more than the same step forwards.
      const score = along + across * 3;
      if (score < bestScore) [best, bestScore] = [spot, score];
    }
    if (!best) return;
    setFocus(Number(best.dataset.cell));
    best.focus();
  }

  // Dragging, as on a grid of squares: a press on a checker that can move picks it up and it follows
  // the pointer; let go over a place it can go and it is played, anywhere else and it stays picked up.
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef<{ cell: number; until: number } | null>(null);
  const dropped = useRef<{ piece: HTMLElement; id: string | undefined; timer: ReturnType<typeof setTimeout> } | null>(null);
  function settle() {
    const d = dropped.current;
    if (!d) return;
    clearTimeout(d.timer);
    dropped.current = null;
    d.piece.style.translate = "";
    d.piece.style.transition = "";
    if (d.id !== undefined) d.piece.dataset.flip = d.id;
    d.piece.closest(".spot")?.classList.remove("dragging");
  }
  useLayoutEffect(() => () => settle(), []);
  function onDown(e: React.PointerEvent<HTMLButtonElement>, cell: number) {
    // A place the checker in hand can go is a place to put it down, even with a checker of your own
    // there that could be picked up instead: the tap that follows plays the move.
    if (e.button !== 0 || !sourceAt(cell) || targets.has(cell)) return;
    settle();
    const pickedUp = picked !== cell;
    drag.current = { cell, x: e.clientX, y: e.clientY, piece: e.currentTarget.querySelector<HTMLElement>(".checker.top"), moved: false, pickedUp };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pickedUp) onPick(cell);
  }
  function onDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d?.piece) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    e.currentTarget.classList.add("dragging");
    d.piece.style.translate = `${dx}px ${dy}px`;
  }
  function onUp(e: React.PointerEvent<HTMLButtonElement>, cancelled = false) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const spot = e.currentTarget;
    const back = () => {
      if (d.piece) d.piece.style.translate = "";
      spot.classList.remove("dragging");
    };
    if (cancelled) return back();
    if (d.moved || d.pickedUp) skipClick.current = { cell: d.cell, until: performance.now() + 120 };
    const to = sourceAt(d.cell)?.to ?? [];
    if (!d.moved) {
      // One tap moves: a checker with one place to go is played by the press that picked it up.
      if (d.pickedUp && grid.select?.quick && to.length === 1) onMove(d.cell, to[0]!);
      return;
    }
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell]");
    const target = under && el.current?.contains(under) ? Number(under.dataset.cell) : null;
    if (target === null || !d.piece || !to.includes(target)) return back();
    // Left where it was dropped until the board answers: the checker that arrives is a new element.
    const id = d.piece.dataset.flip;
    delete d.piece.dataset.flip;
    dropped.current = { piece: d.piece, id, timer: setTimeout(settle, 1500) };
    onMove(d.cell, target);
  }

  const offered = cube?.offered ?? null;
  // The cube lies on its owner's side; a double on offer is pushed across to whoever has to answer.
  const cubeSide = !cube ? "" : offered !== null ? (offered === me ? "far" : "near") : cube.owner === null ? "middle" : cube.owner === me ? "near" : "far";
  const cubeShows = cube ? (offered !== null ? cube.value * 2 : cube.value) : 0;
  const cubeLabel = !cube
    ? ""
    : `Doubling cube: ${cubeShows}${offered !== null ? `, offered by ${offered === me ? "you" : nameOf(offered)}` : cube.owner === null ? ", in the middle" : cube.owner === me ? ", yours" : `, ${nameOf(cube.owner)}'s`}${cube.dead ? ", out of play this game" : ""}`;

  return (
    <div className={`board-wrap track-wrap${tall ? " tall" : ""}`}>
      <div ref={el} className={`track kind-${track.kind}${tall ? " tall" : ""}`} role="group" aria-label={`${grid.label}: ${track.path.length} points, the bar and the trays. Arrow keys move around it.`} onKeyDown={onKey}>
        {order.map((cell) => {
          const piece = grid.cells[cell];
          const point = numberOf(cell);
          const bar = whoseBar(cell) >= 0;
          const home = whoseHome(cell) >= 0;
          const count = piece?.count ?? (piece ? 1 : 0);
          const ids = piece?.ids ?? (piece?.id ? [piece.id] : []);
          // The top of the stack is what moves, so those are the checkers drawn.
          const shown = home ? count : Math.min(count, STACK_SHOWN);
          const tappable = targets.has(cell) || !!sourceAt(cell);
          const cls = [
            "spot",
            point !== null ? `point shade-${point % 2 ? "a" : "b"}` : bar ? "bar" : "home",
            sideOf(cell),
            ...(marks.get(cell) ?? []).map((m) => `mark-${m}`),
            tappable ? "can" : "",
            sourceAt(cell) ? "source" : "",
            picked === cell ? "picked" : "",
            targets.has(cell) ? "target" : "",
          ];
          return (
            <button
              key={cell}
              type="button"
              className={cls.filter(Boolean).join(" ")}
              style={{ "--along": cell % grid.cols, "--n": shown } as React.CSSProperties}
              data-cell={cell}
              tabIndex={cell === focus ? 0 : -1}
              aria-disabled={!tappable}
              aria-pressed={picked === cell ? true : undefined}
              aria-label={label(cell)}
              onFocus={() => setFocus(cell)}
              onPointerDown={(e) => onDown(e, cell)}
              onPointerMove={onDrag}
              onPointerUp={(e) => onUp(e)}
              onPointerCancel={(e) => onUp(e, true)}
              onClick={() => {
                const skip = skipClick.current;
                skipClick.current = null;
                if (skip?.cell === cell && performance.now() < skip.until) return;
                onCell(cell);
              }}
            >
              {point !== null && (
                <span className="point-no" aria-hidden>
                  {point}
                </span>
              )}
              {piece &&
                Array.from({ length: shown }, (_, k) => {
                  const id = ids[count - shown + k];
                  const top = k === shown - 1;
                  return (
                    <span key={id ?? k} className={`checker tone-${piece.tone ?? (piece.owner === 1 ? "dark" : "light")}${top ? " top" : ""}`} style={{ "--k": k } as React.CSSProperties} data-flip={id} aria-hidden>
                      {top && !home && count > STACK_SHOWN ? count : ""}
                    </span>
                  );
                })}
              {home && count > 0 && (
                <span className="home-count" aria-hidden>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <div className="track-mid">{dice && <Dice dice={dice} split={me} still={still} onTumble={onTumble} onTap={() => {}} />}</div>
        {cube && (
          <div className={`cube side-${cubeSide}${offered !== null ? " offered" : ""}${cube.dead ? " dead" : ""}`} role="img" aria-label={cubeLabel}>
            {cubeShows}
          </div>
        )}
      </div>
    </div>
  );
}
