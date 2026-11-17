// The parts of the word table for the games whose moves can't be typed on a keyboard:
//
// - TraceGrid: a square of letters a word is traced on (Word Hunt). Drag across touching tiles, or
//   tap them one by one; a drag of two tiles or more sends the word when the finger lifts.
// - PlaceBoard: a board tiles are put on from your own hand (Criss-Crosswords). Tap a tile in your
//   hand, then a square; tap a tile you put down to take it back.
// - Canvas: a picture drawn a stroke at a time (Draw & Guess), with pens to draw it with.
import { CANVAS_COLORS, CANVAS_SIZES, STROKE_POINTS, type PlacedTile, type WordBoard, type WordCanvas, type WordStroke } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";

// ---- A square to trace words on ------------------------------------------------------------------

const touching = (n: number, a: number, b: number) => a !== b && Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;

export function TraceGrid({ board, path, onPath, onSend, disabled }: { board: WordBoard; path: number[]; onPath: (path: number[]) => void; onSend: (path: number[]) => void; disabled: boolean }) {
  const n = board.cols;
  const letters = board.rows.flat().map((t) => t.letter);
  const drag = useRef<{ start: number[]; moved: boolean } | null>(null);
  const now = useRef(path);
  now.current = path;

  /** The tile under a point, if it's one of this grid's. Touch keeps sending events to the first tile, so look it up. */
  const tileAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tile]");
    // Only the middle of a tile counts while dragging, so a diagonal doesn't catch a corner of the one beside it.
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const inset = box.width * 0.18;
    if (x < box.left + inset || x > box.right - inset || y < box.top + inset || y > box.bottom - inset) return null;
    return Number(el.dataset.tile);
  };
  const extend = (from: number[], tile: number): number[] | null => {
    if (!from.length) return [tile];
    const last = from[from.length - 1]!;
    // Back onto the tile before: take the last one off.
    if (from.length > 1 && tile === from[from.length - 2]) return from.slice(0, -1);
    if (from.includes(tile) || !touching(n, last, tile)) return null;
    return [...from, tile];
  };

  const down = (e: React.PointerEvent, tile: number) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const p = now.current;
    // A tap on the last tile takes it back; on another, the path grows if it touches, or starts again.
    if (p.length && p[p.length - 1] === tile) {
      onPath(p.slice(0, -1));
      drag.current = { start: p.slice(0, -1), moved: false };
      return;
    }
    const grown = extend(p, tile) ?? [tile];
    drag.current = { start: grown, moved: false };
    onPath(grown);
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const tile = tileAt(e.clientX, e.clientY);
      if (tile === null) return;
      const p = now.current;
      if (p[p.length - 1] === tile) return;
      const grown = extend(p, tile);
      if (!grown) return;
      drag.current.moved = true;
      onPath(grown);
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      // A drag across two tiles or more is a word, sent as the finger lifts.
      if (d?.moved && now.current.length >= 2) onSend(now.current);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
  }, [n, onPath, onSend]);

  return (
    <div className={`trace-grid cols-${n}`} style={{ "--cols": n } as React.CSSProperties} role="group" aria-label={`${board.label}: drag across touching letters, or tap them in turn`}>
      {letters.map((letter, i) => {
        const at = path.indexOf(i);
        const next = path.length ? !path.includes(i) && touching(n, path[path.length - 1]!, i) : true;
        return (
          <button
            key={i}
            type="button"
            data-tile={i}
            className={`word-tile trace-tile${at >= 0 ? " on" : ""}${at === path.length - 1 && at >= 0 ? " last" : ""}${path.length && next ? " next" : ""}`}
            disabled={disabled}
            aria-pressed={at >= 0}
            aria-label={`${letter.toUpperCase()}, row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${at >= 0 ? `, letter ${at + 1} of your word` : ""}`}
            onPointerDown={(e) => down(e, i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const p = now.current;
                onPath(p.length && p[p.length - 1] === i ? p.slice(0, -1) : (extend(p, i) ?? [i]));
              }
            }}
          >
            {letter}
            {at >= 0 && <small aria-hidden>{at + 1}</small>}
          </button>
        );
      })}
    </div>
  );
}

// ---- A board to put tiles on ----------------------------------------------------------------------

const BONUS_LABEL: Record<string, string> = { dl: "2L", tl: "3L", dw: "2W", tw: "3W", start: "★" };
const BONUS_WORDS: Record<string, string> = { dl: "double letter", tl: "triple letter", dw: "double word", tw: "triple word", start: "the middle: double word" };

export function PlaceBoard({
  board,
  pending,
  values,
  canPlace,
  onSquare,
}: {
  board: WordBoard;
  pending: PlacedTile[];
  values: Record<string, number>;
  /** A hand tile is chosen and it is your turn: empty squares take it. */
  canPlace: boolean;
  onSquare: (row: number, col: number) => void;
}) {
  const at = new Map(pending.map((t) => [`${t.row},${t.col}`, t.letter]));
  return (
    <div className="place-board" style={{ "--cols": board.cols } as React.CSSProperties} role="grid" aria-label={board.label}>
      {board.rows.map((row, r) => (
        <div key={r} className="place-row" role="row">
          {row.map((tile, c) => {
            const mine = at.get(`${r},${c}`);
            const letter = tile.letter || mine || "";
            const label = letter ? `${letter.toUpperCase()}${mine ? ", yours to play (tap to take back)" : ""}` : tile.bonus ? BONUS_WORDS[tile.bonus]! : "empty";
            return (
              <button
                key={c}
                type="button"
                role="gridcell"
                className={`place-square${tile.bonus ? ` bonus-${tile.bonus}` : ""}${tile.letter ? " filled" : ""}${mine ? " pending" : ""}${tile.fresh ? " fresh" : ""}`}
                disabled={!!tile.letter || (!mine && !canPlace)}
                aria-label={`Row ${r + 1}, column ${c + 1}: ${label}`}
                onClick={() => onSquare(r, c)}
              >
                {letter ? (
                  <>
                    <span className="place-letter">{letter}</span>
                    <span className="place-value" aria-hidden>
                      {values[letter] ?? ""}
                    </span>
                  </>
                ) : tile.bonus ? (
                  <span className="place-bonus" aria-hidden>
                    {BONUS_LABEL[tile.bonus]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---- A picture ------------------------------------------------------------------------------------

/** Draws a stroke on a 2D context whose canvas is `w` pixels wide; points run 0 to 1000. */
function paint(pen: CanvasRenderingContext2D, stroke: WordStroke, w: number) {
  const k = w / 1000;
  pen.strokeStyle = CANVAS_COLORS[stroke.color] ?? "#000";
  pen.fillStyle = pen.strokeStyle;
  pen.lineWidth = (CANVAS_SIZES[stroke.size] ?? 10) * k;
  pen.lineCap = "round";
  pen.lineJoin = "round";
  const p = stroke.points;
  if (p.length === 2) {
    // A dot.
    pen.beginPath();
    pen.arc(p[0]! * k, p[1]! * k, pen.lineWidth / 2, 0, Math.PI * 2);
    pen.fill();
    return;
  }
  pen.beginPath();
  pen.moveTo(p[0]! * k, p[1]! * k);
  for (let i = 2; i < p.length; i += 2) pen.lineTo(p[i]! * k, p[i + 1]! * k);
  pen.stroke();
}

/** Fewer points for the same line: drop any closer than this to the one kept before it. */
const STEP = 6;

export function Canvas({ canvas, onStroke }: { canvas: WordCanvas; onStroke: (stroke: WordStroke) => Promise<boolean> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  /** Strokes drawn here that the table hasn't sent back yet: shown meanwhile, so the line doesn't vanish as the finger lifts. */
  const [waiting, setWaiting] = useState<WordStroke[]>([]);
  const live = useRef<number[] | null>(null);
  const draw = canvas.draw;

  const redraw = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.width;
    const pen = el.getContext("2d")!;
    pen.fillStyle = "#ffffff";
    pen.fillRect(0, 0, w, el.height);
    for (const s of [...canvas.strokes, ...waiting]) paint(pen, s, w);
    if (live.current) paint(pen, { points: live.current, color, size }, w);
  };

  // Sharp on every screen: as many pixels as the box has, times the screen's density.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const px = Math.round(el.getBoundingClientRect().width * Math.min(2, devicePixelRatio || 1));
      if (px && el.width !== px) {
        el.width = px;
        el.height = px;
      }
      redraw();
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  });
  // A stroke the table has taken back drops off the waiting list.
  useEffect(() => {
    if (!waiting.length) return;
    const sent = new Set(canvas.strokes.map((s) => s.points.join(",")));
    setWaiting((w) => w.filter((s) => !sent.has(s.points.join(","))));
  }, [canvas.strokes]);
  useEffect(() => {
    if (!canvas.strokes.length) setWaiting([]);
  }, [canvas.strokes.length]);

  const point = (e: React.PointerEvent): [number, number] => {
    const box = ref.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
    return [clamp(((e.clientX - box.left) / box.width) * 1000), clamp(((e.clientY - box.top) / box.height) * 1000)];
  };
  const start = (e: React.PointerEvent) => {
    if (!draw) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    live.current = point(e);
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    const line = live.current;
    if (!line) return;
    const [x, y] = point(e);
    const lx = line[line.length - 2]!;
    const ly = line[line.length - 1]!;
    if (Math.hypot(x - lx, y - ly) < STEP || line.length >= STROKE_POINTS * 2) return;
    line.push(x, y);
    redraw();
  };
  const end = () => {
    const line = live.current;
    live.current = null;
    if (!line) return;
    const stroke = { points: line, color, size };
    setWaiting((w) => [...w, stroke]);
    void onStroke(stroke).then((ok) => !ok && setWaiting((w) => w.filter((s) => s !== stroke)));
  };

  return (
    <div className="draw-area">
      <canvas
        ref={ref}
        className={`draw-canvas${draw ? " drawing" : ""}`}
        role="img"
        aria-label={draw ? "Your drawing: draw with your finger or the mouse" : `The drawing, ${canvas.strokes.length} ${canvas.strokes.length === 1 ? "stroke" : "strokes"} so far`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {draw && (
        <div className="draw-pens" role="group" aria-label="Pens">
          {CANVAS_COLORS.map((hex, i) => (
            <button key={hex} type="button" className={`draw-pen${color === i ? " on" : ""}`} style={{ background: hex }} aria-label={i === CANVAS_COLORS.length - 1 ? "White, to rub out" : `Pen ${i + 1}`} aria-pressed={color === i} onClick={() => setColor(i)} />
          ))}
          <span className="draw-sizes">
            {CANVAS_SIZES.map((w, i) => (
              <button key={w} type="button" className={`draw-size${size === i ? " on" : ""}`} aria-label={["Thin", "Medium", "Thick"][i] ?? `Size ${i + 1}`} aria-pressed={size === i} onClick={() => setSize(i)}>
                <span style={{ width: 4 + i * 6, height: 4 + i * 6 }} />
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
