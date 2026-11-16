// The 3-D board, for the board table: fetches the scene when a board that has one is on screen,
// keeps it drawn as the game moves on, and says whether it is up (the grid of buttons is then made
// see-through and laid over it: see board3d.ts).
import { colOf, rowOf, type BoardGrid, type BoardPiece } from "@journey-to-code/games";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { reducedMotion } from "../motion";
import { useWants3d } from "../display";
import { boardTransform, CANVAS, hasBoard3d, loadBoard3d, type Board3d, type BoardFrame3d } from "./board3d";

interface Given {
  game: string;
  grid: BoardGrid;
  /** The cell drawn at a place on the screen (and the place a cell is drawn at: it is its own inverse). */
  shown: (cell: number) => number;
  picked: number | string | null;
  targets: Set<number>;
  /** A stone shown where it would go, and the piece it would be. */
  ghost: number | null;
  mine: BoardPiece | undefined;
  /** A piece's or a seat's colour by name. */
  toneOf: (piece: BoardPiece) => string;
  seatTone: (seat: number) => string;
}

/** A full-size Go board has its crossings too close together, once tipped back, for a finger: it stays flat. */
const MOST_CROSSINGS = 13;

export function useBoard3d(el: RefObject<HTMLDivElement | null>, given: Given) {
  const { game, grid } = given;
  // A plain board, one piece to a square: not boards within a board, and not the biggest boards of crossings.
  const wanted = useWants3d(game) && hasBoard3d(game) && !grid.blocks && !(grid.points && grid.cols > MOST_CROSSINGS);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Board3d | null>(null);
  const [up, setUp] = useState(false);
  const latest = useRef(given);
  latest.current = given;
  const raf = useRef(0);

  const paint = useCallback((time: number) => {
    raf.current = 0;
    const s = scene.current;
    const c = canvas.current;
    const board = el.current;
    if (!s || !c || !board) return;
    const { grid: g, shown, picked, targets, ghost, mine, toneOf, seatTone } = latest.current;
    const flipped = !!g.flip;
    const size = g.cols * g.rows;
    const shadeOf = (cell: number) => (g.shade === "checker" ? ((rowOf(g.cols, cell) + colOf(g.cols, cell)) % 2 === 0 ? "light" : "dark") : (g.shade?.[cell] ?? "plain"));
    const coordsOff = !!g.points && document.documentElement.dataset.coords === "off";
    const frame: BoardFrame3d = {
      game: latest.current.game,
      cols: g.cols,
      rows: g.rows,
      points: !!g.points,
      gravity: !!g.gravity,
      shades: g.shade ? Array.from({ length: size }, (_, at) => shadeOf(shown(at))) : null,
      pieces: g.cells.flatMap((p, cell) => {
        if (!p) return [];
        const tone = toneOf(p);
        const light = tone === "light";
        return [{ at: shown(cell), id: p.id ?? `at${cell}`, kind: p.kind, light, near: flipped ? !light : light, tone, ...(p.span ? { span: p.span } : {}), name: p.label }];
      }),
      marks: (g.marks ?? []).map((m) => ({ at: shown(m.cell), mark: m.mark, ...(m.owner !== undefined ? { tone: seatTone(m.owner) } : {}) })),
      ghost: ghost !== null && mine && !g.cells[ghost] ? { at: shown(ghost), kind: mine.kind, tone: toneOf(mine) } : null,
      targets: [...targets].map(shown),
      picked: typeof picked === "number" ? shown(picked) : null,
      coords: g.coords && !coordsOff ? { cols: flipped ? [...g.coords.cols].reverse() : g.coords.cols, rows: flipped ? [...g.coords.rows].reverse() : g.coords.rows } : null,
      width: c.clientWidth,
      height: c.clientHeight,
      board: board.clientWidth,
      dpr: Math.min(2, window.devicePixelRatio || 1),
      time,
      still: reducedMotion(),
    };
    const state = s.render(frame);
    setUp(state !== null);
    if (state === "busy") raf.current = requestAnimationFrame(paint);
  }, []);
  /** Draw now, and keep drawing while anything is moving. */
  const wake = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  }, [paint]);

  useEffect(() => {
    const c = canvas.current;
    if (!wanted || !c) return setUp(false);
    let alive = true;
    let made: Board3d | null = null;
    loadBoard3d(c, game).then((s) => {
      if (!alive || !s) return s?.dispose();
      made = s;
      scene.current = s;
      wake();
    });
    return () => {
      alive = false;
      scene.current = null;
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      made?.dispose();
      setUp(false);
    };
  }, [wanted, game]);

  // The board's width on the page is what the camera is set by, in the scene and in the CSS alike.
  useLayoutEffect(() => {
    const board = el.current;
    const wrap = board?.parentElement;
    if (!wanted || !board || !wrap) return;
    const measure = () => {
      wrap.style.setProperty("--board-s", `${board.clientWidth}px`);
      wake();
    };
    measure();
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    watcher?.observe(board);
    return () => {
      watcher?.disconnect();
      wrap.style.removeProperty("--board-s");
    };
  }, [wanted]);

  // Whenever the board, the marks or what is in hand change, it is drawn again.
  useEffect(() => {
    if (wanted) wake();
  });

  return {
    /** The scene is up and drawing: the grid of buttons is laid over it. */
    up: wanted && up,
    /** What tips the grid of buttons back to lie on the picture. */
    style: wanted && up ? ({ transform: boardTransform(!!grid.gravity) } as React.CSSProperties) : undefined,
    /** The canvas the scene draws on: it goes in the board's own place, under the buttons. */
    canvas: wanted ? <canvas ref={canvas} className={`board-gl${up ? " up" : ""}`} style={{ "--gl-wide": CANVAS.wide, "--gl-high": CANVAS.high } as React.CSSProperties} aria-hidden /> : null,
    /** A piece being dragged follows the pointer; `null` lets it go. */
    drag(place: number | null, x = 0, y = 0) {
      const c = canvas.current;
      if (!scene.current || !c) return;
      const box = c.getBoundingClientRect();
      scene.current.drag(place, (x - box.left) / Math.max(1, box.width), (y - box.top) / Math.max(1, box.height));
      wake();
    },
  };
}
