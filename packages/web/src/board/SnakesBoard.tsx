// Snakes & Ladders gets a board of its own, drawn and not laid out as a grid of buttons: painted
// squares, wooden ladders, snakes with patterned bodies, flicking tongues and eyes, and counters
// shaped like pawns. Everything comes from the engine's view: the squares' numbers (`tags`), the
// ladders and snakes (`links`), where the counters are, the squares a count can go to (`select`)
// and the way the last move went (`trail`).
//
// A move is walked, not jumped: the counter hops square by square (bouncing back off 100 if it
// counted past it), then climbs the ladder or rides the snake down its body, and anyone it lands on
// is swapped back to where it came from. The hops and the climb are Zubra's `glide` (each one a
// change of square that it animates); the ride down a snake follows the snake's own curve. Each has
// its sound. With less motion asked for, or at the instant pace, the counters are simply put where
// they are.
//
// Where a counter can go is shown on the board itself: a ring on each square the dice can reach,
// with the count, and where a ladder or snake there would take it. Pointing at one (or focusing it)
// draws the way there. Tapping it moves; so do the buttons under the dice.
import { glide } from "@zubra/runtime/motion";
import type { BoardGrid, BoardView } from "@journey-to-code/games";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { play } from "../feedback/sounds";
import { named } from "../kit/named";
import { useWants3d } from "../display";

/** The board is ten squares by ten, with the start in an eleventh row below. */
const COLS = 10;
const ROWS = 11;
const END = 100;

interface Seat {
  body: string;
  light: string;
  dark: string;
  name: string;
}
const SEATS: Seat[] = [
  { name: "red", body: "#e2483d", light: "#ff9d8c", dark: "#8c1c15" },
  { name: "blue", body: "#2f78e4", light: "#9cc8ff", dark: "#153f86" },
  { name: "green", body: "#25a55c", light: "#93e6b2", dark: "#0f5a2e" },
  { name: "gold", body: "#f2b81f", light: "#ffe98f", dark: "#8d5f05" },
];

/** The skins the snakes take in turn. */
const SKINS = [
  { skin: "#3fae5a", dark: "#1b5a29", spot: "#f2d24b", belly: "#d4f5b0" },
  { skin: "#8b52cc", dark: "#3c1d69", spot: "#ffb3f5", belly: "#e7d2ff" },
  { skin: "#ef7f2e", dark: "#86370a", spot: "#3a1c06", belly: "#ffe1a8" },
  { skin: "#14a39c", dark: "#08504c", spot: "#ffd36b", belly: "#c4fff6" },
  { skin: "#d9443a", dark: "#6e140f", spot: "#1c1210", belly: "#ffc9b8" },
  { skin: "#3b6fd8", dark: "#142f6a", spot: "#ffe066", belly: "#cfe0ff" },
];

/** The squares' colours, a soft rainbow that turns a little every row. */
const TINTS = ["#ffe3b3", "#d3f0c9", "#c6e3f8", "#fbd0cc", "#e7d7f6", "#fff1a6"];

interface Pt {
  x: number;
  y: number;
}
/** The middle of a cell, in cells. */
const centre = (cell: number): Pt => ({ x: (cell % COLS) + 0.5, y: Math.floor(cell / COLS) + 0.5 });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The line down a snake's middle, from its head to its tail: a sway that is still at both ends. */
function spineOf(a: Pt, b: Pt, n: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const waves = Math.max(1, Math.round(len / 2.4));
  const amp = Math.min(0.62, 0.28 + len * 0.045) * (n % 2 ? 1 : -1);
  const steps = 72;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const sway = amp * Math.sin(t * waves * 2 * Math.PI + (n % 3) * 0.4) * Math.sin(t * Math.PI) ** 0.75;
    return { x: a.x + ux * len * t - uy * sway, y: a.y + uy * len * t + ux * sway };
  });
}
/** How wide a snake is a part of the way down it. */
const widthAt = (t: number) => 0.3 * (1 - t) ** 0.85 + 0.03;
/** Which way the spine runs at point k (a unit vector). */
function along(spine: Pt[], k: number): Pt {
  const a = spine[Math.max(0, k - 1)]!;
  const b = spine[Math.min(spine.length - 1, k + 1)]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}
/** Squares to drawing units: a hundred to a square. */
const U = 100;
/** A length in squares, written in drawing units. */
const f = (v: number) => (v * U).toFixed(1);

/** The squares a count passes over from `from`, bouncing back off 100. */
function stepsOf(from: number, by: number): number[] {
  const out: number[] = [];
  let at = from;
  let dir = 1;
  for (let k = 0; k < by; k++) {
    if (at === END) dir = -1;
    at += dir;
    out.push(at);
  }
  return out;
}

interface Token {
  id: string;
  seat: number;
  cell: number;
  /** Its place in a stack on its cell, and how many are in it. */
  k: number;
  n: number;
}

export interface SnakesBoardProps {
  grid: BoardGrid;
  view: BoardView;
  names: string[];
  /** How much pieces travel (motionScale): 0 puts them down without moving them. */
  scale: number;
  watching?: boolean;
  /** Move the counter from one cell to the square a count reaches. */
  onMove: (from: number, to: number) => void;
}

export function SnakesBoard({ grid, view, names, scale, watching, onMove }: SnakesBoardProps) {
  // In 3-D (the table's "drawn in 3D" setting) the board leans back and the pawns stand up on it.
  const tilted = useWants3d("snakes");
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const squareOf = (cell: number) => Number(grid.tags?.[cell] ?? 0);
  const cellOfSquare = useMemo(() => {
    const out = new Map<number, number>();
    grid.tags?.forEach((tag, cell) => tag && out.set(Number(tag), cell));
    return out;
  }, [grid.tags]);

  // The ladders and snakes, drawn once for the board.
  const links = useMemo(
    () =>
      (grid.links ?? []).map((link, i) => {
        const a = centre(link.from);
        const b = centre(link.to);
        return { ...link, i, a, b, spine: link.kind === "snake" ? spineOf(a, b, i) : null };
      }),
    [grid.links],
  );
  const linkFrom = useMemo(() => new Map(links.map((l) => [l.from, l] as const)), [links]);

  // The counters, from the cells: a stack is everyone's ids on one cell.
  const tokens = useMemo(() => {
    const out: Token[] = [];
    grid.cells.forEach((piece, cell) => {
      if (!piece || piece.owner === null) return;
      const ids = piece.ids?.length ? piece.ids : piece.id ? [piece.id] : [];
      ids.forEach((id, k) => out.push({ id, seat: Number(id.split("-").pop()), cell, k, n: ids.length }));
    });
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }, [grid.cells]);
  const where = tokens.map((t) => `${t.id}@${t.cell}/${t.k}/${t.n}`).join(" ");
  const els = useRef(new Map<string, HTMLDivElement>());

  // Where a counter can go now: the squares the counts reach, each with its button below the dice.
  const source = watching ? undefined : grid.select?.sources[0];
  const swaps = view.info.some((line) => /swap/i.test(line));
  const from = typeof source?.from === "number" ? source.from : null;
  const targets = (source?.to ?? []).map((cell, i) => {
    const option = view.choices?.options[i];
    const by = Number((option?.move as { by?: number } | undefined)?.by ?? 0);
    const link = linkFrom.get(cell) ?? null;
    const lands = link ? link.to : cell;
    // Someone else standing where it would end: at a table that swaps, they'd be sent back.
    const swap = swaps && tokens.some((t) => t.cell === lands && t.seat !== view.me);
    return { cell, by, hint: option?.hint ?? `Square ${squareOf(cell)}`, link, swap };
  });
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => setPreview(null), [source?.to.join()]);

  // ---- Walking the last move ----------------------------------------------------------------
  const animated = useRef<number | null | undefined>(undefined);
  const run = useRef(0);
  const rolled = useRef(view.dice?.roll ?? 0);
  const [moving, setMoving] = useState(false);
  const [flash, setFlash] = useState<{ cell: number; kind: string; key: number } | null>(null);

  /** Put a counter's element on a cell, as one of a stack of `n`. */
  function put(el: HTMLElement, cell: number, k = 0, n = 1) {
    const at = centre(cell);
    el.style.left = `${((at.x - 0.5) / COLS) * 100}%`;
    el.style.top = `${((at.y - 0.5) / ROWS) * 100}%`;
    el.style.setProperty("--k", String(k));
    el.style.setProperty("--n", String(n));
  }
  function settle() {
    for (const t of tokens) {
      const el = els.current.get(t.id);
      if (el) put(el, t.cell, t.k, t.n);
    }
  }

  useLayoutEffect(() => {
    const trail = grid.trail ?? null;
    const diceMoved = (view.dice?.roll ?? 0) !== rolled.current;
    rolled.current = view.dice?.roll ?? 0;
    const first = animated.current === undefined;
    const fresh = !!trail && trail.key !== animated.current;
    animated.current = trail?.key ?? null;
    const me = ++run.current;
    if (first || !fresh || scale === 0) {
      setMoving(false);
      return settle();
    }
    // Every counter the trail moves starts where it was; the rest are where they are.
    settle();
    for (const path of trail.paths) {
      const el = els.current.get(path.id);
      if (el) {
        el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        put(el, path.cells[0]!);
      }
    }
    setMoving(true);
    const live = () => run.current === me;
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const unit = () => (frame.current?.clientWidth ?? 300) / COLS;
    const ms = (base: number) => Math.round(base * Math.max(0.5, scale));
    /**
     * Move a counter to a cell and animate it there. Flat, that is Zubra's `glide`. On the leaning
     * board the screen's distances aren't the board's, so the same slide is worked out in squares.
     */
    const slide = (el: HTMLElement, to: number, d: number, k?: number, n?: number, easing = "cubic-bezier(.3,.7,.4,1)") => {
      if (!tilted) {
        el.style.setProperty("--zb-move-duration", `${d}ms`);
        el.style.setProperty("--zb-move-easing", easing);
        return glide([el], () => put(el, to, k, n));
      }
      const was = { x: parseFloat(el.style.left) / 10, y: (parseFloat(el.style.top) / 100) * ROWS };
      put(el, to, k, n);
      const now = centre(to);
      const u = unit();
      el.animate([{ transform: `translate(${(was.x + 0.5 - now.x) * u}px, ${(was.y + 0.5 - now.y) * u}px)` }, { transform: "none" }], { duration: d, easing, composite: "add" });
    };
    const final = new Map(tokens.map((t) => [t.id, t] as const));

    async function walk() {
      // A counter that moves on the throw waits for the dice to land.
      if (diceMoved) await wait(ms(680));
      const [mover, ...swapped] = trail!.paths;
      const el = mover && els.current.get(mover.id);
      if (!mover || !el) return;
      for (let i = 0; i < mover.by.length && live(); i++) {
        const to = mover.cells[i + 1]!;
        const kind = mover.by[i]!;
        const last = i === mover.by.length - 1;
        const end = last ? final.get(mover.id) : undefined;
        const hop = el.querySelector<HTMLElement>(".snl-hop");
        const ground = el.querySelector<HTMLElement>(".snl-ground");
        if (kind === "step") {
          const d = ms(170);
          slide(el, to, d, end?.k, end?.n);
          hop?.animate([{ translate: "0 0", scale: "1 1" }, { translate: "0 -42%", scale: "0.96 1.06", offset: 0.45 }, { translate: "0 0", scale: "1.08 0.9", offset: 0.85 }, { translate: "0 0", scale: "1 1" }], { duration: d, easing: "ease-out" });
          ground?.animate([{ scale: "1" }, { scale: "0.6", opacity: 0.5, offset: 0.45 }, { scale: "1" }], { duration: d, easing: "ease-out" });
          play("hop");
          await wait(d + 25);
        } else if (kind === "ladder") {
          const d = ms(780);
          await wait(ms(120));
          play("climb");
          slide(el, to, d, end?.k, end?.n, "cubic-bezier(.45,.05,.4,1)");
          hop?.animate([{ rotate: "0deg" }, { rotate: "-9deg" }, { rotate: "9deg" }, { rotate: "-9deg" }, { rotate: "9deg" }, { rotate: "0deg" }], { duration: d, easing: "linear" });
          await wait(d);
          if (live()) setFlash({ cell: to, kind: "ladder", key: me });
        } else if (kind === "snake") {
          const link = links.find((l) => l.kind === "snake" && l.from === mover.cells[i] && l.to === to);
          const d = ms(1150);
          await wait(ms(160));
          play("slither");
          root.current?.querySelector(`[data-snake="${mover.cells[i]}"]`)?.classList.add("biting");
          root.current?.animate([{ translate: "0 0" }, { translate: "-3px 0" }, { translate: "3px 0" }, { translate: "-2px 0" }, { translate: "0 0" }], { duration: 260 });
          put(el, to, end?.k, end?.n);
          const b = centre(to);
          const u = unit();
          const spine = link?.spine ?? [centre(mover.cells[i]!), b];
          // Down the snake's own body, faster as it goes.
          el.animate(
            spine.map((p, k) => ({ translate: `${(p.x - b.x) * u}px ${(p.y - b.y) * u}px`, offset: Math.sqrt(k / (spine.length - 1)) })),
            { duration: d, easing: "ease-in" },
          );
          hop?.animate([{ rotate: "y 0deg" }, { rotate: "y 540deg" }, { rotate: "y 720deg" }], { duration: d, easing: "ease-in-out" });
          await wait(d);
          root.current?.querySelector(`[data-snake="${mover.cells[i]}"]`)?.classList.remove("biting");
          if (live()) setFlash({ cell: to, kind: "snake", key: me });
        }
      }
      // Anyone landed on goes back to where the mover came from, the two passing each other.
      for (const path of swapped) {
        const other = els.current.get(path.id);
        const end = final.get(path.id);
        if (!other || !live()) continue;
        const d = ms(560);
        play("swap");
        slide(other, path.cells[path.cells.length - 1]!, d, end?.k, end?.n, "ease-in-out");
        other.querySelector<HTMLElement>(".snl-hop")?.animate([{ translate: "0 0" }, { translate: "0 -70%", offset: 0.5 }, { translate: "0 0" }], { duration: d, easing: "ease-in-out" });
      }
      if (swapped.length) await wait(ms(560));
    }
    void walk().finally(() => {
      if (!live()) return;
      settle();
      setMoving(false);
    });
  }, [where, grid.trail?.key, scale, tilted]);
  useEffect(() => () => void run.current++, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  // ---- Drawing --------------------------------------------------------------------------------
  const squares = useMemo(
    () =>
      Array.from({ length: COLS * COLS }, (_, cell) => {
        const square = squareOf(cell);
        const r = Math.floor(cell / COLS);
        const c = cell % COLS;
        return { cell, square, r, c, tint: TINTS[(c + r * 2) % TINTS.length]!, dark: (r + c) % 2 === 1 };
      }),
    [grid.tags],
  );
  const turn = view.turn;
  const over = !!view.over;
  const winner = view.over?.winners[0];
  const fromSquare = from === null ? 0 : squareOf(from);
  const previewTarget = targets.find((t) => t.cell === preview);
  const previewPath = previewTarget ? [from!, ...stepsOf(fromSquare, previewTarget.by).map((sq) => cellOfSquare.get(sq)!), ...(previewTarget.link ? [previewTarget.link.to] : [])].map(centre) : null;
  const mySeat = SEATS[view.me % SEATS.length]!;

  return (
    <div className={`snl${moving ? " moving" : ""}${over ? " over" : ""}${tilted ? " tilted" : ""}`} ref={root} role="group" aria-label={`Snakes and Ladders board, ${view.seats} players`} style={{ "--seat-body": mySeat.body, "--seat-light": mySeat.light } as React.CSSProperties}>
      <div className="snl-frame" ref={frame}>
        <svg className="snl-art" viewBox={`0 0 ${COLS * 100} ${COLS * 100}`} aria-hidden>
          <defs>
            <linearGradient id="snl-wood" x1="0" x2="1">
              <stop offset="0" stopColor="#d8a066" />
              <stop offset="0.5" stopColor="#b9773b" />
              <stop offset="1" stopColor="#8a5226" />
            </linearGradient>
            <linearGradient id="snl-shine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="snl-gold" cx="0.35" cy="0.3" r="0.9">
              <stop offset="0" stopColor="#fff6c2" />
              <stop offset="0.5" stopColor="#f6c945" />
              <stop offset="1" stopColor="#c58a0c" />
            </radialGradient>
            <filter id="snl-blur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="4.5" />
            </filter>
          </defs>
          {/* Everything is drawn at a hundred units to a square: with units much smaller, Chrome loses the
              text, thin lines and blurs when the board leans in 3-D. */}
          {squares.map((s) => (
            <g key={s.cell} className={`snl-square${s.square === END ? " finish" : ""}`}>
              <rect x={s.c * U + 3} y={s.r * U + 8} width={94} height={94} rx={12} className="snl-tile-side" />
              <rect x={s.c * U + 3} y={s.r * U + 3} width={94} height={94} rx={12} fill={s.square === END ? "url(#snl-gold)" : s.tint} />
              {s.dark && s.square !== END && <rect x={s.c * U + 3} y={s.r * U + 3} width={94} height={94} rx={12} fill="#000" opacity={0.045} />}
              <rect x={s.c * U + 3} y={s.r * U + 3} width={94} height={50} rx={12} fill="url(#snl-shine)" />
              {s.square === END && <path className="snl-crown" d={`M${s.c * U + 28} ${s.r * U + 74} l6 -30 l10 14 l6 -20 l6 20 l10 -14 l6 30 z`} />}
              {s.square === 1 && (
                <text x={s.c * U + 50} y={s.r * U + 78} className="snl-label">
                  START
                </text>
              )}
            </g>
          ))}

          {links
            .filter((l) => l.kind === "ladder")
            .map((l) => (
              <Ladder key={l.i} a={l.a} b={l.b} />
            ))}
          {links
            .filter((l) => l.kind === "snake")
            .map((l, n) => (
              <Snake key={l.i} spine={l.spine!} skin={SKINS[n % SKINS.length]!} from={l.from} />
            ))}

          {/* The numbers go over the ladders and snakes, so every square can be read. */}
          <g className="snl-nums">
            {squares.map((s) => (
              <text key={s.cell} x={s.c * U + 10} y={s.r * U + 29} style={{ stroke: s.square === END ? "#f6c945" : s.tint }}>
                {s.square}
              </text>
            ))}
          </g>

          {previewPath && (
            <g className="snl-preview">
              <polyline points={previewPath.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")} />
              {previewPath.slice(1).map((p, i) => (
                <circle key={i} cx={p.x * U} cy={p.y * U} r={7} />
              ))}
            </g>
          )}
        </svg>

        <span className="snl-light" aria-hidden />
        {/* Where the counters wait: a pad for each seat under square 1. */}
        <div className="snl-start" aria-hidden>
          {Array.from({ length: view.seats }, (_, seat) => (
            <span key={seat} className="snl-pad" style={{ "--c": SEATS[seat]!.body } as React.CSSProperties} />
          ))}
          <span className="snl-start-word">← Start</span>
        </div>

        {flash && <span key={flash.key} className={`snl-flash ${flash.kind}`} style={{ left: `${(centre(flash.cell).x / COLS) * 100}%`, top: `${(centre(flash.cell).y / ROWS) * 100}%` }} aria-hidden />}

        {/* The squares a count reaches: tap one to go there. */}
        {!moving &&
          targets.map((t, i) => {
            const at = centre(t.cell);
            // Two rings side by side would hide each other's chips: every other one has it below.
            const below = i % 2 === 1 && targets.some((o) => o !== t && Math.abs(o.cell - t.cell) === 1 && Math.floor(o.cell / COLS) === Math.floor(t.cell / COLS));
            return (
              <button
                key={t.cell}
                type="button"
                className={`snl-target${t.link ? ` via-${t.link.kind}` : ""}${below ? " chip-below" : ""}`}
                style={{ left: `${((at.x - 0.5) / COLS) * 100}%`, top: `${((at.y - 0.5) / ROWS) * 100}%` }}
                aria-label={t.hint}
                onPointerEnter={() => setPreview(t.cell)}
                onPointerLeave={() => setPreview((p) => (p === t.cell ? null : p))}
                onFocus={() => setPreview(t.cell)}
                onBlur={() => setPreview((p) => (p === t.cell ? null : p))}
                onClick={() => from !== null && onMove(from, t.cell)}
              >
                <span className="snl-ring" />
                <span className="snl-stand chip-stand">
                <span className="snl-chip">
                  +{t.by}
                  {t.link && <b>{t.link.kind === "ladder" ? `↑${squareOf(t.link.to)}` : `↓${squareOf(t.link.to)}`}</b>}
                  {t.swap && <b title="Swap places">⇄</b>}
                </span>
                </span>
              </button>
            );
          })}

        {tokens.map((t) => {
          const seat = SEATS[t.seat % SEATS.length]!;
          return (
            <div
              key={t.id}
              ref={(el) => {
                if (el) els.current.set(t.id, el);
                else els.current.delete(t.id);
              }}
              className={`snl-token${t.seat === turn && !over ? " turn" : ""}${t.seat === winner ? " winner" : ""}${from === t.cell && t.seat === view.me ? " mine" : ""}`}
              data-piece={t.id}
              aria-hidden
            >
              <span className="snl-ground" style={{ "--c": seat.body } as React.CSSProperties} />
              <span className="snl-fan">
                <span className="snl-stand">
                  <span className="snl-hop">
                    <Pawn seat={seat} id={t.id} />
                  </span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {view.players.map((p, i) => `${names[i] ?? `Seat ${i + 1}`} ${named(p.line, names)}`).join(". ")}
      </p>
    </div>
  );
}

/** A counter: a glossy pawn in its seat's colour. */
function Pawn({ seat, id }: { seat: Seat; id: string }) {
  const g = `snl-pawn-${id}`;
  return (
    <svg className="snl-pawn" viewBox="0 0 40 52">
      <defs>
        <radialGradient id={g} cx="0.35" cy="0.25" r="0.85">
          <stop offset="0" stopColor={seat.light} />
          <stop offset="0.45" stopColor={seat.body} />
          <stop offset="1" stopColor={seat.dark} />
        </radialGradient>
      </defs>
      <path d="M8 46 C8 40 13 37 15 33 C12 31 11 28 13 25 L27 25 C29 28 28 31 25 33 C27 37 32 40 32 46 Z" fill={`url(#${g})`} stroke={seat.dark} strokeWidth="1.2" />
      <ellipse cx="20" cy="46.5" rx="14" ry="4" fill={`url(#${g})`} stroke={seat.dark} strokeWidth="1.2" />
      <rect x="11" y="23" width="18" height="4" rx="2" fill={seat.body} stroke={seat.dark} strokeWidth="1.2" />
      <circle cx="20" cy="14" r="10" fill={`url(#${g})`} stroke={seat.dark} strokeWidth="1.2" />
      <ellipse cx="16.5" cy="10" rx="3.6" ry="2.4" fill="#fff" opacity="0.7" />
    </svg>
  );
}

/** Two wooden rails from foot to top, rungs between, and a shadow on the board under it. */
function Ladder({ a, b }: { a: Pt; b: Pt }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const px = -uy * 0.17;
  const py = ux * 0.17;
  // The rails run a little past the squares' middles.
  const a2 = { x: a.x - ux * 0.18, y: a.y - uy * 0.18 };
  const b2 = { x: b.x + ux * 0.18, y: b.y + uy * 0.18 };
  const rungs = Math.max(3, Math.round(len / 0.36));
  const line = (className: string, p: Pt, q: Pt, key?: number) => <line key={key} className={className} x1={f(p.x)} y1={f(p.y)} x2={f(q.x)} y2={f(q.y)} />;
  const side = (k: number) => (p: Pt) => ({ x: p.x + px * k, y: p.y + py * k });
  const body = (
    <>
      {Array.from({ length: rungs }, (_, k) => {
        const p = lerp(a, b, (k + 0.5) / rungs);
        return line("rung", side(1)(p), side(-1)(p), k);
      })}
      {line("rail", side(1)(a2), side(1)(b2))}
      {line("rail", side(-1)(a2), side(-1)(b2))}
      {line("rail-shine", side(1.15)(a2), side(1.15)(b2))}
      {line("rail-shine", side(-0.85)(a2), side(-0.85)(b2))}
    </>
  );
  return (
    <g className="snl-ladder">
      <g className="shadow" transform="translate(10 17)" filter="url(#snl-blur)">
        {body}
      </g>
      <g className="wood">{body}</g>
    </g>
  );
}

/** A snake: a tapering body with diamonds down its back, a head with eyes, and a tongue that flicks. */
function Snake({ spine, skin, from }: { spine: Pt[]; skin: (typeof SKINS)[number]; from: number }) {
  const n = spine.length - 1;
  const left: string[] = [];
  const right: string[] = [];
  spine.forEach((p, k) => {
    const d = along(spine, k);
    const w = widthAt(k / n) / 2;
    left.push(`${f(p.x - d.y * w)},${f(p.y + d.x * w)}`);
    right.push(`${f(p.x + d.y * w)},${f(p.y - d.x * w)}`);
  });
  const outline = `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
  const belly = spine
    .slice(3)
    .map((p, k) => {
      const d = along(spine, k + 3);
      const w = widthAt((k + 3) / n) * 0.22;
      return `${f(p.x + d.y * w)},${f(p.y - d.x * w)}`;
    })
    .join(" ");
  // A shine along the side the light comes from.
  const gloss = spine
    .slice(2, -6)
    .map((p, k) => {
      const d = along(spine, k + 2);
      const w = widthAt((k + 2) / n) * 0.26;
      return `${f(p.x - d.y * w)},${f(p.y + d.x * w)}`;
    })
    .join(" ");
  const diamonds = [];
  for (let k = 7; k < n - 4; k += 5) {
    const p = spine[k]!;
    const d = along(spine, k);
    const w = widthAt(k / n);
    const l = w * 0.42;
    const c = w * 0.26;
    diamonds.push(`M${f(p.x + d.x * l)},${f(p.y + d.y * l)} L${f(p.x - d.y * c)},${f(p.y + d.x * c)} L${f(p.x - d.x * l)},${f(p.y - d.y * l)} L${f(p.x + d.y * c)},${f(p.y - d.x * c)} Z`);
  }
  // The head looks away from the body.
  const head = spine[0]!;
  const back = along(spine, 2);
  const angle = (Math.atan2(-back.y, -back.x) * 180) / Math.PI;
  return (
    <g className="snl-snake" data-snake={from} style={{ "--skin": skin.skin, "--dark": skin.dark, "--spot": skin.spot, "--belly": skin.belly } as React.CSSProperties}>
      <path className="shadow" d={outline} transform="translate(10 16)" filter="url(#snl-blur)" />
      <path className="body" d={outline} />
      <path className="shade" d={outline} />
      <polyline className="belly" points={belly} />
      <polyline className="gloss" points={gloss} />
      <path className="spots" d={diamonds.join(" ")} />
      <g transform={`translate(${f(head.x)} ${f(head.y)}) rotate(${angle.toFixed(1)})`}>
        <g className="tongue">
          <path d="M20 0 L36 0 M36 0 L43 -5 M36 0 L43 5" />
        </g>
        <g className="head">
          <ellipse cx={6} cy={10} rx={25} ry={20} className="head-shadow" filter="url(#snl-blur)" />
          <ellipse cx={2} cy={0} rx={25} ry={20} className="skull" />
          <ellipse cx={-4} cy={-8} rx={12} ry={5} className="head-shine" />
          <ellipse cx={11} cy={-10} rx={7} ry={6.5} className="eye" />
          <ellipse cx={11} cy={10} rx={7} ry={6.5} className="eye" />
          <ellipse cx={12.5} cy={-10} rx={2.2} ry={5} className="pupil" />
          <ellipse cx={12.5} cy={10} rx={2.2} ry={5} className="pupil" />
          <circle cx={22} cy={-4.5} r={1.2} className="nostril" />
          <circle cx={22} cy={4.5} r={1.2} className="nostril" />
        </g>
      </g>
    </g>
  );
}
