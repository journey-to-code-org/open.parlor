// A hole as the table draws it, with a ball on the tee: the course editor's preview, and the
// picture of a course in Mini Golf's setup. The very same painting as at a table (sport/draw.ts),
// so what the maker sees is what the players get.
import { BALL_RADIUS, holeWorld, type GolfHole, type SportBody, type SportView } from "@journey-to-code/games";
import { useEffect, useRef } from "react";
import { drawScene, playFrame, type Disc } from "../sport/draw";
import { fitFrame, TILT } from "../sport/projection";

const BALL: SportBody = { id: "ball-0", owner: 0, kind: "ball", tone: "white", label: "a ball on the tee" };

export function HolePreview({ hole, label, flat = false }: { hole: GolfHole; label: string; flat?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const table: SportView["table"] = {
      key: hole.id,
      name: hole.name,
      world: holeWorld(hole, [{ id: BALL.id, x: hole.tee[0], y: hole.tee[1] }]),
      look: hole.look,
      bodies: [...hole.fixtures, BALL],
      ghosts: [],
    };
    const looks = new Map(table.bodies.map((b) => [b.id, b]));
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
      const discs: Disc[] = table.world.bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.id === BALL.id ? BALL_RADIUS : b.r, look: looks.get(b.id) }));
      drawScene(ctx, w, h, dpr, fit, { table, discs, aim: null, trace: null, trails: [], effects: [], time: 0, still: true, hurry: false });
    };
    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [hole, flat]);

  return <canvas ref={canvas} className="hole-preview" role="img" aria-label={label} />;
}
