// A hole as the table draws it, with a ball on the tee: the course editor's preview, and the
// picture of a course in Mini Golf's setup; and a bowling lane, for the lane editor. The very same
// painting as at a table (sport/draw.ts), so what the maker sees is what the players get.
import { BALL_RADIUS, holeWorld, type GolfHole, type SportBody, type SportShot, type SportView } from "@journey-to-code/games";
import { frames, type Frame, type SimResult } from "@journey-to-code/physics";
import { useEffect, useMemo, useRef } from "react";
import { drawScene, playFrame, type Disc } from "../sport/draw";
import { fitFrame, TILT } from "../sport/projection";

const BALL: SportBody = { id: "ball-0", owner: 0, kind: "ball", tone: "white", label: "a ball on the tee" };

export function HolePreview({ hole, label, flat = false, replay = null, onReplayEnd }: { hole: GolfHole; label: string; flat?: boolean; replay?: SportShot[] | null; onReplayEnd?: () => void }) {
  const table = useMemo<SportView["table"]>(
    () => ({
      key: hole.id,
      name: hole.name,
      world: holeWorld(hole, [{ id: BALL.id, x: hole.tee[0], y: hole.tee[1] }]),
      look: hole.look,
      bodies: [...hole.fixtures, BALL],
      ghosts: [],
    }),
    [hole],
  );
  return <TablePreview table={table} label={label} flat={flat} replay={replay} onReplayEnd={onReplayEnd} />;
}

/** A ball the table's own looks don't name (the game's ball on a playtest): a white one. */
const looseBall = (id: string): SportBody => ({ id, owner: 0, kind: "ball", tone: "white", label: "the ball" });

/**
 * Any table of a table sport, as a table draws it: still, or playing `replay` (shots as a table
 * records them) one after another, each from the bodies as they stood when it was struck.
 */
export function TablePreview({
  table,
  label,
  flat = false,
  className = "hole-preview",
  replay = null,
  onReplayEnd,
}: {
  table: SportView["table"];
  label: string;
  flat?: boolean;
  className?: string;
  replay?: SportShot[] | null;
  onReplayEnd?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const looks = new Map(table.bodies.map((b) => [b.id, b]));
    const draw = (discs: Disc[]) => {
      const box = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, box.width);
      const h = Math.max(1, box.height);
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const fit = fitFrame(playFrame(table), w, h, { tilt: flat ? 0 : TILT });
      drawScene(ctx, w, h, dpr, fit, { table, discs, aim: null, trace: null, trails: [], effects: [], time: performance.now(), still: false, hurry: false });
    };
    if (replay?.length) {
      // Each shot from where everything stood, stepped as a table steps it: two steps a screen frame.
      let shot = 0;
      let run: Generator<Frame, SimResult, void> | null = null;
      let sizes = new Map<string, number>();
      let last: Disc[] = [];
      let pause = 0;
      let raf = 0;
      const tick = () => {
        if (pause > 0) {
          pause -= 1;
          raf = requestAnimationFrame(tick);
          return;
        }
        if (!run) {
          if (shot >= replay.length) {
            onReplayEnd?.();
            return;
          }
          const s = replay[shot++]!;
          sizes = new Map(s.from.map((b) => [b.id, b.r]));
          run = frames({ ...table.world, bodies: s.from }, s.shot);
        }
        let frame: IteratorResult<Frame, SimResult> | null = null;
        for (let i = 0; i < 2; i++) {
          frame = run.next();
          if (frame.done) break;
        }
        const step = frame && !frame.done ? frame.value : null;
        if (step) {
          last = step.bodies.map((b) => {
            const r = sizes.get(b.id) ?? BALL_RADIUS;
            return { id: b.id, x: b.x, y: b.y, r, look: looks.get(b.id) ?? looseBall(b.id), ...(b.in ? { gone: 1, tunnel: b.in } : !b.live ? { sunk: 1 } : {}) };
          });
          draw(last);
        } else {
          run = null;
          pause = 40;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const paint = () => {
      const box = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, box.width);
      const h = Math.max(1, box.height);
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const fit = fitFrame(playFrame(table), w, h, { tilt: flat ? 0 : TILT });
      const discs: Disc[] = table.world.bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.id === BALL.id && !b.r ? BALL_RADIUS : b.r, look: looks.get(b.id) }));
      drawScene(ctx, w, h, dpr, fit, { table, discs, aim: null, trace: null, trails: [], effects: [], time: 0, still: true, hurry: false });
    };
    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [table, flat, replay]);

  return <canvas ref={canvas} className={className} role="img" aria-label={label} />;
}
