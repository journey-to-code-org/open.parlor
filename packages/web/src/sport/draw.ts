// Drawing a table sport on a canvas. Everything here is told what to draw (a view's table, where
// each ball is this instant, the aim) and draws it; it knows nothing about turns, rules or time.
//
// `drawScene` is the one way in, and the only thing the table screen knows about drawing. A view
// says what is on the table in the world's own units and by kind (a timber rail so high, a rock,
// a gnome); everything about how that looks is decided behind this function, in `paint/`. A
// different renderer, one in three dimensions say, would take the same `Scene` and replace this
// file: nothing above it would change.
//
// The table is drawn as a model looked down on from the south at an angle (projection.ts says
// exactly how), lit from the upper left. The part that never moves (the ground, the rails, the
// scenery) is painted once for a hole and a screen size and kept; each frame copies it and adds
// only what moves. Because the view is at an angle, what is nearer the camera hides what is
// behind it: every ball is drawn in its turn from the back of the table to the front, and
// whatever stands in front of it is drawn again over it. A ball that ends up hidden is shown
// through as a ring, so it is never lost.
import type { SportBody, SportView } from "@journey-to-code/games";
import type { Point } from "@journey-to-code/physics";
import { paintCourse, stageOf, type Painted } from "./paint/course";
import { inFront } from "./paint/order";
import type { Brush, Ctx } from "./paint/geometry";
import { ball as sphere, SHADOW, type Stage } from "./paint/solids";
import { inPolygon } from "./paint/terrain";
import { CUP_DEPTH, drawToadstool, TONES, type Prop } from "./paint/things";
import { depthOf, toCamera, type Projection } from "./projection";

/** One disc to draw: a body of the world or a ghost, wherever it is this frame. */
export interface Disc {
  id: string;
  x: number;
  y: number;
  r: number;
  look: SportBody | undefined;
  ghost?: boolean;
  /** 0 to 1: how far it has sunk into a pocket. */
  sunk?: number;
  /** 0 to 1: how far it has gone into the tunnel called `tunnel`. */
  gone?: number;
  tunnel?: string;
  /** The one you may strike now. */
  mine?: boolean;
  /** 0 to 1, fading: a bumper that has just been hit. */
  struck?: number;
}

export interface Aim {
  /** The ball being aimed. */
  x: number;
  y: number;
  r: number;
  /** Radians, in the world, for drawing only; what is sent is the whole-number angle. */
  angle: number;
  /** 0 to 1 of full power. */
  power: number;
  /** A finger is down and pulling: the putter is drawn back, and the line is bold. */
  pulling: boolean;
  /** The pull is inside the cancel zone: letting go does nothing. */
  cancel: boolean;
}

/** Something brief that happened at a place: `t` runs from 0 to 1 over its life. */
export interface Effect {
  kind: "splash" | "sand" | "pop" | "drop";
  x: number;
  y: number;
  t: number;
}

export interface Scene {
  table: SportView["table"];
  discs: Disc[];
  aim: Aim | null;
  /** A path just travelled, for when the roll itself isn't shown (reduced motion). */
  trace: Point[] | null;
  /** Where fast balls have just been, oldest first: a streak behind each. */
  trails: Point[][];
  effects: Effect[];
  /** A clock for whatever moves by itself (water, the marker on the ball to play), in ms. */
  time: number;
  /** Nothing moves by itself: the person has asked for less motion. */
  still: boolean;
  /**
   * Something is in motion (a ball rolling, a thumb pulling) and a frame must not be kept waiting.
   * If the screen has changed size a little since the still part of the table was painted, the
   * old painting is stretched to fit for now, and painted afresh on the first frame that isn't
   * in a hurry.
   */
  hurry: boolean;
}

export const toneColour = (tone: SportBody["tone"] | undefined) => TONES[tone ?? "white"][0];

/** Green to amber to red as the power climbs. */
export function powerColour(power: number): string {
  const hue = 130 - 130 * Math.min(1, Math.max(0, power));
  return `hsl(${hue} 85% 55%)`;
}

/**
 * The part of a table that has to be on the screen: everything a ball can touch, and a border of
 * garden round it. A view's own frame is roomier (it has the scenery in it); on a small screen
 * the hole is worth more than the gnomes, so the picture is fitted to this and the scenery runs
 * off the edges.
 */
export function playFrame(table: SportView["table"]): { x: number; y: number; w: number; h: number } {
  const { frame } = table.look;
  // Walls, and the regions a ball can roll into (a pond has no wall round it).
  const corners = [...table.world.walls.flatMap((w) => w.points), ...table.world.regions.flatMap((r): Point[] => ("points" in r.shape ? r.shape.points : [[r.shape.x - r.shape.r, r.shape.y - r.shape.r], [r.shape.x + r.shape.r, r.shape.y + r.shape.r]]))];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  if (!xs.length) return frame;
  const border = 750;
  const x0 = Math.max(frame.x, Math.min(...xs) - border);
  const y0 = Math.max(frame.y, Math.min(...ys) - border);
  return { x: x0, y: y0, w: Math.min(frame.x + frame.w, Math.max(...xs) + border) - x0, h: Math.min(frame.y + frame.h, Math.max(...ys) + border) - y0 };
}

// The aim and the brief effects lie on the ground, so they are drawn through a transform that
// lays the canvas on it: lengths are in world units, and a circle comes out as the ellipse a
// circle on the turf is seen as.

function drawAim(b: Brush, a: Aim) {
  const { ctx, px } = b;
  const ux = Math.cos(a.angle);
  const uy = Math.sin(a.angle);
  const r = Math.max(a.r, 4.5 * px);
  const reach = (30 + 125 * a.power) * px;
  const colour = a.cancel ? "rgba(255, 255, 255, 0.6)" : powerColour(a.power);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Where it will go: chalk dots that grow with the power and end in an arrowhead. Each is white
  // on a dark shadow, so the line reads on turf, sand, water and timber alike.
  const gap = 9 * px;
  const first = r + 7 * px;
  for (let at = first; at < r + reach - 6 * px; at += gap) {
    const x = a.x + ux * at;
    const y = a.y + uy * at;
    const size = (a.pulling ? 2.4 : 2) * px;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.arc(x + 0.8 * px * b.light[0], y + 0.8 * px * b.light[1], size + 0.9 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a.pulling ? "#ffffff" : "rgba(255, 255, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  const x1 = a.x + ux * (r + reach);
  const y1 = a.y + uy * (r + reach);
  const head = (a.pulling ? 10 : 8.5) * px;
  ctx.beginPath();
  ctx.moveTo(x1 + ux * head, y1 + uy * head);
  ctx.lineTo(x1 - ux * head * 0.5 - uy * head * 0.8, y1 - uy * head * 0.5 + ux * head * 0.8);
  ctx.lineTo(x1 - ux * head * 0.15, y1 - uy * head * 0.15);
  ctx.lineTo(x1 - ux * head * 0.5 + uy * head * 0.8, y1 - uy * head * 0.5 - ux * head * 0.8);
  ctx.closePath();
  ctx.lineWidth = 3 * px;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.stroke();
  ctx.fillStyle = a.pulling && !a.cancel ? colour : "#ffffff";
  ctx.fill();

  if (a.pulling) {
    // The pull itself: a putter drawn back from the ball, further and redder the harder the putt.
    const back = r + (8 + 62 * a.power) * px;
    const hx = a.x - ux * back;
    const hy = a.y - uy * back;
    // The band of power between the ball and the putter's face.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 8 * px;
    ctx.beginPath();
    ctx.moveTo(a.x - ux * (r + 2 * px), a.y - uy * (r + 2 * px));
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 5 * px;
    ctx.stroke();
    // The shaft, running on back from the head, and the head across it.
    for (const [width, style] of [[5 * px, "rgba(0, 0, 0, 0.5)"], [2.6 * px, "#e9e6dc"]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(hx - ux * 4 * px, hy - uy * 4 * px);
      ctx.lineTo(hx - ux * 34 * px, hy - uy * 34 * px);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(hx - ux * 3.5 * px, hy - uy * 3.5 * px);
    ctx.rotate(a.angle);
    ctx.beginPath();
    ctx.roundRect(-3.5 * px, -11 * px, 7 * px, 22 * px, 2 * px);
    ctx.fillStyle = "#cfd3d6";
    ctx.fill();
    ctx.lineWidth = 1.4 * px;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillRect(-2.2 * px, -9 * px, 1.6 * px, 18 * px);
    ctx.restore();
  }
  ctx.restore();
}

function drawEffect(b: Brush, e: Effect) {
  const { ctx, px } = b;
  ctx.save();
  if (e.kind === "splash") {
    // Rings spreading where the ball went in, and a few drops thrown up.
    for (const [k, delay] of [[1, 0], [0.62, 0.12], [0.3, 0.26]] as const) {
      const t = Math.min(1, Math.max(0, (e.t - delay) / (1 - delay)));
      if (t <= 0) continue;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = (2.4 - 1.4 * t) * px;
      ctx.beginPath();
      ctx.arc(e.x, e.y, (5 + 30 * t) * px * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const far = (6 + 22 * e.t) * px;
      ctx.globalAlpha = Math.max(0, 1 - e.t * 1.5);
      ctx.fillStyle = "#e8fbff";
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * far, e.y + Math.sin(a) * far, (2.2 - 1.2 * e.t) * px, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (e.kind === "sand") {
    // A puff of grains, drifting out and settling.
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4 + e.x * 0.01;
      const far = (3 + 11 * e.t) * px;
      ctx.globalAlpha = (1 - e.t) * 0.75;
      ctx.fillStyle = i % 2 ? "#f6e3b0" : "#c9a15c";
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * far, e.y + Math.sin(a) * far, (1.8 - 0.8 * e.t) * px, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (e.kind === "pop") {
    // Out of a tunnel: one quick ring and a scatter of crumbs.
    ctx.globalAlpha = (1 - e.t) * 0.85;
    ctx.strokeStyle = "#fff6d8";
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (6 + 16 * e.t) * px, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Into the cup: the rim flashes.
    ctx.globalAlpha = (1 - e.t) * 0.9;
    ctx.strokeStyle = "#fff3b0";
    ctx.lineWidth = (3 - 2 * e.t) * px;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (13 + 14 * e.t) * px, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** A hole a ball can go down, where the camera sees it: the rim's ellipse, in CSS pixels. */
interface Mouth {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A ball: a sphere sitting on the ground at `(x, y)`, the ground being `z` high there. */
function drawBall(st: Stage, d: Disc, x: number, y: number, z: number, time: number, down: { mouth: Mouth; by: number } | null, slide: { dx: number; dy: number; by: number } | null) {
  const { ctx } = st;
  const [fill, , ink] = TONES[d.look?.tone ?? "white"];
  // Never smaller than a few pixels, however far out the screen is zoomed.
  const R = Math.max(d.r * st.s, 4.5);
  const r = R / st.s;
  ctx.save();
  if (d.ghost) ctx.globalAlpha = 0.5;
  let [gx, gy] = [x, y];
  let depth = 0;
  if (slide) {
    // Into a pipe: it rolls on into the dark.
    gx += slide.dx * r * 1.6 * slide.by;
    gy += slide.dy * r * 1.6 * slide.by;
    ctx.globalAlpha *= Math.max(0, 1 - slide.by * 1.15);
  }
  if (down) {
    // Down a hole: it drops, and all that shows of it is what is still above the rim or can be
    // seen through the mouth.
    depth = down.by * (CUP_DEPTH + r);
    const m = down.mouth;
    ctx.beginPath();
    ctx.rect(m.cx - m.rx - 4 * R, m.cy - 6 * R, 2 * m.rx + 8 * R, 6 * R);
    ctx.ellipse(m.cx, m.cy, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.clip();
  }
  const [px, py] = st.at(gx, gy, z);
  if (!down && !slide && !d.ghost) {
    // The shadow touches the ball on the side away from the light: it is sitting on the ground.
    ctx.fillStyle = "rgba(4, 22, 8, 0.4)";
    ctx.beginPath();
    ctx.ellipse(px + SHADOW[0] * R * 0.75, py + SHADOW[1] * R * 0.75 * st.k, R * 1.02, Math.max(0.01, R * (0.35 + 0.65 * st.k) * 0.95), 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.mine) {
    // The ball to play: a gold ring on the turf round it that breathes, with a dark one under it so it shows on sand too.
    const beat = 0.5 + 0.5 * Math.sin(time / 320);
    const ring = R + 3.5 + 1.8 * beat;
    for (const [width, colour] of [[4, "rgba(0, 0, 0, 0.45)"], [2.2, "#ffe27a"]] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -time / 90;
      ctx.beginPath();
      ctx.ellipse(px, py, ring, ring * (0.35 + 0.65 * st.k), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Its middle is a ball's radius above where it touches the ground.
  const cx = px;
  const cy = py - R * st.r + depth * st.r * st.s;
  sphere({ ...st, at: () => [cx, cy] }, 0, 0, 0, r, fill, d.ghost ? 0.3 : 0.9, 0.45);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  if (d.ghost) ctx.setLineDash([2.5, 2.5]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (d.look?.striped) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#fdfdf8";
    ctx.fillRect(cx - R, cy - R, 2 * R, R * 0.55);
    ctx.fillRect(cx - R, cy + R * 0.45, 2 * R, R * 0.55);
    ctx.restore();
  }
  if (d.look?.mark && R > 7) {
    ctx.fillStyle = ink;
    ctx.font = `700 ${R * 1.05}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(d.look.mark, cx, cy + R * 0.06);
  }
  if (down) {
    // The hole's own darkness closes over it.
    ctx.fillStyle = `rgba(6, 5, 4, ${0.7 * down.by})`;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return { cx, cy, R };
}

/** The flag in the cup: a pole standing straight up, its pennant, and its shadow along the green. */
function drawFlag(st: Stage, x: number, y: number, z: number, tall: number, alpha: number, time: number, still: boolean) {
  const { ctx } = st;
  const [bx, by] = st.at(x, y, z - CUP_DEPTH * 0.6);
  const [gx, gy] = st.at(x, y, z);
  const [tx, ty] = st.at(x, y, z + tall);
  const wave = still ? 0 : Math.sin(time / 380) * 0.12;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  // The shadow lies on the ground the way all shadows do.
  const [sx, sy] = st.at(x + SHADOW[0] * tall, y + SHADOW[1] * tall, z);
  ctx.strokeStyle = "rgba(4, 22, 8, 0.3)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.strokeStyle = "#fbf6ec";
  ctx.lineWidth = 2;
  ctx.stroke();
  const long = Math.max(20, gy - ty);
  const w = long * 0.5;
  const h = long * 0.3;
  ctx.fillStyle = "#e5382c";
  ctx.strokeStyle = "rgba(60, 0, 0, 0.6)";
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(tx + w * 0.5, ty + h * (0.5 + wave), tx + w, ty + h * (0.5 - wave));
  ctx.lineTo(tx, ty + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** The still part of a table, as last painted: for which table, on what size of screen, seen how. */
let kept: (Painted & { key: string; table: string; proj: Projection; width: number; height: number }) | null = null;
/** How high each ball is being drawn, so that one rolling off a step drops and doesn't jump. */
const heights = new Map<string, number>();
let heightsFor = "";
let lastTime = 0;

/**
 * Draws the whole scene. `width` and `height` are the canvas's size in CSS pixels and `dpr` how
 * many device pixels each is, so lines stay crisp on a dense screen.
 */
export function drawScene(ctx: Ctx, width: number, height: number, dpr: number, proj: Projection, scene: Scene) {
  // What never moves: painted the first time this hole is seen at this size, then kept. Painting
  // takes a moment, so while something is moving a painting made for a slightly different size
  // of screen is made to do.
  const key = `${scene.table.key}|${width}|${height}|${dpr}|${proj.scale}|${proj.ox}|${proj.oy}|${proj.turn}|${proj.tilt}`;
  const near = kept !== null && kept.table === scene.table.key && kept.proj.turn === proj.turn && kept.proj.tilt === proj.tilt && Math.abs(kept.proj.scale / proj.scale - 1) < 0.25;
  if (kept?.key !== key && !(scene.hurry && near)) kept = { key, table: scene.table.key, proj, width, height, ...paintCourse(scene.table, width, height, dpr, proj) };
  const painted = kept!;
  // Everything this frame is drawn as the painting was: if that was for another size of screen,
  // the whole frame is stretched to this one, the painting and what moves alike.
  const view = painted.proj;
  const stretch = proj.scale / view.scale;
  const base = new DOMMatrix([stretch * dpr, 0, 0, stretch * dpr, (proj.ox - view.ox * stretch) * dpr, (proj.oy - view.oy * stretch) * dpr]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (painted.key === key) ctx.drawImage(painted.canvas, 0, 0);
  else {
    ctx.fillStyle = "#2f6a2f";
    ctx.fillRect(0, 0, width * dpr, height * dpr);
    ctx.setTransform(stretch, 0, 0, stretch, base.e, base.f);
    ctx.drawImage(painted.canvas, 0, 0);
  }
  ctx.setTransform(base);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const { land } = painted;
  const { world, look } = land;
  const st = stageOf(ctx, view, land);
  const k = depthOf(view);
  const cam = (x: number, y: number) => toCamera(view.turn, x, y);
  /** Lays the canvas on ground `z` high, in the camera's frame and world units; returns the brush for it. */
  const onGround = (z: number): Brush => {
    const [gx, gy] = st.at(0, 0, z);
    ctx.setTransform(base.multiply(new DOMMatrix([st.s, 0, 0, st.s * k, gx, gy])));
    return { ctx, px: 1 / st.s, light: [SHADOW[0], SHADOW[1]] };
  };
  const time = scene.still ? 0 : scene.time;

  // Glints on the water: each comes and goes in its own time and drifts a little as it does.
  if (painted.glints.length) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.3;
    painted.glints.forEach(([x, y, z], i) => {
      const phase = scene.still ? i * 0.37 : scene.time / (1700 + (i % 7) * 260) + i * 0.37;
      const beat = phase - Math.floor(phase);
      const glow = Math.sin(beat * Math.PI);
      if (glow < 0.15) return;
      const [gx, gy] = st.at(x, y, z);
      const w = 3 + (i % 4) * 1.6;
      const drift = (beat - 0.5) * 7;
      ctx.globalAlpha = glow * 0.75;
      ctx.beginPath();
      ctx.moveTo(gx + drift - w, gy);
      ctx.quadraticCurveTo(gx + drift, gy - 2.2, gx + drift + w, gy);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /** A point of the world on the ground, where the camera sees it. */
  const onTurf = (p: Point): Point => {
    const [x, y] = cam(p[0], p[1]);
    return st.at(x, y, land.heightAt(x, y));
  };
  if (scene.trace && scene.trace.length > 1) {
    ctx.save();
    for (const [width, colour] of [[4.5, "rgba(0, 0, 0, 0.4)"], [2.5, "rgba(255, 255, 255, 0.95)"]] as const) {
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      scene.trace.forEach((p, i) => {
        const [x, y] = onTurf(p);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  // A streak behind anything going fast: wide and bright at the ball, gone a ball or two back.
  for (const trail of scene.trails) {
    const at = trail.map(onTurf);
    for (let i = 1; i < at.length; i++) {
      const f = i / at.length;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.34 * f})`;
      ctx.lineWidth = 1 + 5 * f;
      ctx.beginPath();
      ctx.moveTo(at[i - 1]![0], at[i - 1]![1]);
      ctx.lineTo(at[i]![0], at[i]![1]);
      ctx.stroke();
    }
  }

  const effects = scene.effects.map((e) => {
    const [x, y] = cam(e.x, e.y);
    return { ...e, x, y, z: land.heightAt(x, y) };
  });
  for (const e of effects) if (e.kind !== "drop") drawEffect(onGround(e.z), e);

  // ---- Where everything that moves is ---------------------------------------------------------------
  // How high the ground is under each ball. A ball that rolls off a step falls to the lower
  // ground over a few frames; going up (a ramp) it simply follows the ground.
  if (heightsFor !== scene.table.key) heights.clear();
  heightsFor = scene.table.key;
  const elapsed = Math.min(50, Math.max(0, scene.time - lastTime));
  lastTime = scene.time;
  const live = new Set<string>();
  const things = scene.discs.map((d) => {
    const [x, y] = cam(d.x, d.y);
    const groundZ = land.heightAt(x, y);
    const was = heights.get(d.id);
    const z = was !== undefined && was > groundZ && !scene.still ? Math.max(groundZ, was - elapsed * 2.4) : groundZ;
    heights.set(d.id, z);
    live.add(d.id);
    return { d, x, y, z };
  });
  for (const id of heights.keys()) if (!live.has(id)) heights.delete(id);

  if (scene.aim) {
    const [x, y] = cam(scene.aim.x, scene.aim.y);
    const z = things.find((t) => t.x === x && t.y === y)?.z ?? land.heightAt(x, y);
    drawAim(onGround(z), { ...scene.aim, x, y, angle: scene.aim.angle + (view.turn * Math.PI) / 2 });
  }
  ctx.setTransform(base);

  // ---- From the back of the table to the front ------------------------------------------------------
  const flags = look.pockets === "cup" ? world.pockets.map((p) => ({ flag: p, x: p.x, y: p.y, z: land.heightAt(p.x, p.y) })) : [];
  const tall = Math.max(1500, 46 / (st.s * Math.max(0.4, st.r)));
  const hidden: { cx: number; cy: number; R: number; d: Disc }[] = [];
  /** Draws again, inside a box on the screen, whatever stands in front of a point on the ground; returns those things. */
  const cover = (x: number, y: number, box: [number, number, number, number]): Prop[] => {
    const front = painted.props.filter((p) => p.box[0] < box[2] && p.box[2] > box[0] && p.box[1] < box[3] && p.box[3] > box[1] && inFront(p, x, y));
    if (!front.length) return front;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    ctx.clip();
    for (const p of front) p.draw(st);
    ctx.restore();
    return front;
  };
  // Ghosts under the real thing where they share a spot, and whatever is yours on top.
  const layer = (d: Disc) => (d.ghost ? 0 : d.mine ? 2 : 1);
  const queue = [...things.map((t) => ({ ...t, flag: null as null | { r: number } })), ...flags.map((f) => ({ ...f, d: null as null | Disc }))].sort((a, b) => a.y - b.y || (a.d && b.d ? layer(a.d) - layer(b.d) : 0));
  for (const item of queue) {
    const { x, y, z } = item;
    if (!item.d) {
      // The flag stands in the cup so the hole can be found from across the green, and fades
      // when a ball comes near it on the screen, so that it never hides one.
      const [gx, gy] = st.at(x, y, z);
      const [, ty] = st.at(x, y, z + tall);
      const long = gy - ty;
      let nearest = Infinity;
      for (const t of things) {
        if (t.d.look?.kind === "toadstool") continue;
        const [bx, by] = st.at(t.x, t.y, t.z + t.d.r);
        // How far the ball is, on the screen, from the pole and from the pennant.
        const pole = Math.hypot(bx - gx, by - Math.min(gy, Math.max(ty, by)));
        const pennant = Math.hypot(bx - Math.min(gx + long * 0.5, Math.max(gx, bx)), by - Math.min(ty + long * 0.3, Math.max(ty, by)));
        nearest = Math.min(nearest, pole, pennant);
      }
      const alpha = Math.min(1, Math.max(0.22, (nearest / st.s - 500) / 700));
      drawFlag(st, x, y, z, tall, alpha, scene.time, scene.still);
      cover(x, y, [gx - 4, ty - 4, gx + (gy - ty) * 0.6 + 4, gy + 4]);
      continue;
    }
    const d = item.d;
    if (d.look?.kind === "toadstool") {
      const high = d.look.height ?? 450;
      drawToadstool(st, x, y, z, d.r, d.look.tone, high, d.struck ?? 0);
      const [gx, gy] = st.at(x, y, z);
      const reach = d.r * st.s * 1.25;
      cover(x, y, [gx - reach, gy - high * st.r * st.s - reach, gx + reach * 2, gy + reach * 1.6]);
      continue;
    }
    // Going down a hole (the cup, or a burrow), or on into a pipe.
    let down: Parameters<typeof drawBall>[6] = null;
    let slide: Parameters<typeof drawBall>[7] = null;
    const mouthOf = (mx: number, my: number, r: number) => {
      const [cx, cy] = st.at(mx, my, land.heightAt(mx, my));
      return { cx, cy, rx: r * st.s, ry: r * st.s * k };
    };
    if (d.sunk) {
      const p = world.pockets.reduce((best, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(best.x - x, best.y - y) ? q : best), world.pockets[0]!);
      if (p) down = { mouth: mouthOf(p.x, p.y, p.r), by: d.sunk };
    } else if (d.gone !== undefined) {
      const tunnel = world.tunnels?.find((t) => t.id === d.tunnel);
      const kind = look.tunnels.find((t) => t.id === d.tunnel);
      if (tunnel && kind?.kind === "burrow") down = { mouth: mouthOf(tunnel.x, tunnel.y, tunnel.r), by: d.gone };
      else if (kind) slide = { dx: Math.cos((kind.enter * Math.PI) / 18000), dy: Math.sin((kind.enter * Math.PI) / 18000), by: d.gone };
    }
    const drawn = drawBall(st, d, x, y, z, time, down, slide);
    const pad = drawn.R * 1.9 + 8;
    const front = cover(x, y, [drawn.cx - pad, drawn.cy - pad, drawn.cx + pad, drawn.cy + pad]);
    // Mostly behind something solid: remember it, to show it through.
    const solid = front.filter((p) => !p.thin);
    if (solid.length && !down && !slide) {
      const spots: Point[] = [[0, 0], [-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]];
      const covered = spots.filter(([dx, dy]) => solid.some((p) => inPolygon(p.hull, drawn.cx + dx * drawn.R, drawn.cy + dy * drawn.R))).length;
      if (covered >= 3) hidden.push({ ...drawn, d });
    }
  }
  for (const e of effects) if (e.kind === "drop") drawEffect(onGround(e.z), e);
  ctx.setTransform(base);

  // A ball behind a rock or a rail: a ring in its colour where it is, so nobody has to guess.
  for (const h of hidden) {
    const [fill] = TONES[h.d.look?.tone ?? "white"];
    ctx.save();
    ctx.globalAlpha = h.d.ghost ? 0.35 : 0.5;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(h.cx, h.cy, h.R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = h.d.ghost ? 0.5 : 1;
    for (const [width, colour, dash] of [[3.4, "rgba(0, 0, 0, 0.6)", []], [1.8, h.d.mine ? "#ffe27a" : "#ffffff", [4, 3]]] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.setLineDash([...dash]);
      ctx.beginPath();
      ctx.arc(h.cx, h.cy, h.R + 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
