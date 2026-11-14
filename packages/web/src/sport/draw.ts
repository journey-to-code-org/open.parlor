// Drawing a table sport on a canvas. Everything here is told what to draw (a view's table, where
// each ball is this instant, the aim) and draws it; it knows nothing about turns, rules or time.
//
// `drawScene` is the one way in, and the only thing the table screen knows about drawing. A view
// says what is on the table in the world's own units and by kind (a timber rail so high, a rock,
// a gnome); everything about how that looks is decided behind this function, in `paint/`. A
// different renderer, one in three dimensions say, would take the same `Scene` and replace this
// file: nothing above it would change.
//
// The table is drawn as a model seen from straight above, lit from the top left. The part that
// never moves (the ground, the rails, the scenery) is painted once for a hole and a screen size
// and kept; each frame copies it and adds only what moves. Because nothing has a "right way up"
// from above, the table can be turned a quarter turn to fill a screen of the other shape, and the
// light stays where it was.
import type { SportBody, SportView } from "@cardroom/games";
import type { Point } from "@cardroom/physics";
import { paintCourse, type Painted } from "./paint/course";
import { dome, type Brush, type Ctx } from "./paint/geometry";
import { drawToadstool, TONES } from "./paint/things";

/**
 * How world units land on the screen, in CSS pixels. `turn` is how many quarter turns clockwise
 * the table is drawn at: 0 as the world has it, 1 with the world's bottom at the screen's left,
 * 3 with the world's left at the screen's bottom.
 */
export interface Fit {
  scale: number;
  ox: number;
  oy: number;
  turn: 0 | 1 | 3;
}

/** Where a point of the world is on the screen. */
export function toScreen(fit: Fit, x: number, y: number): Point {
  if (fit.turn === 1) return [-y * fit.scale + fit.ox, x * fit.scale + fit.oy];
  if (fit.turn === 3) return [y * fit.scale + fit.ox, -x * fit.scale + fit.oy];
  return [x * fit.scale + fit.ox, y * fit.scale + fit.oy];
}
/** A direction on the screen, as a direction in the world: what turns a drag of the thumb into an aim. */
export function toWorldVector(fit: Fit, dx: number, dy: number): Point {
  if (fit.turn === 1) return [dy, -dx];
  if (fit.turn === 3) return [-dy, dx];
  return [dx, dy];
}
const matrixOf = (fit: Fit, dpr: number): DOMMatrix => {
  const s = fit.scale * dpr;
  const [a, b, c, d] = fit.turn === 1 ? [0, s, -s, 0] : fit.turn === 3 ? [0, -s, s, 0] : [s, 0, 0, s];
  return new DOMMatrix([a, b, c, d, fit.ox * dpr, fit.oy * dpr]);
};

/**
 * The biggest the frame can be drawn in a box, centred. `top` keeps a strip at the top clear (a
 * sign is standing there). If turning the table on its side would show it a good deal bigger
 * (a tall hole on a wide screen, or a wide one on a phone), it is turned.
 */
export function fitFrame(frame: { x: number; y: number; w: number; h: number }, width: number, height: number, { pad = 4, top = 0 }: { pad?: number; top?: number } = {}): Fit {
  const roomW = Math.max(1, width - 2 * pad);
  const roomH = Math.max(1, height - top - 2 * pad);
  const upright = Math.min(roomW / frame.w, roomH / frame.h);
  const sideways = Math.min(roomW / frame.h, roomH / frame.w);
  const midX = frame.x + frame.w / 2;
  const midY = frame.y + frame.h / 2;
  const cx = width / 2;
  const cy = top + (height - top) / 2;
  if (sideways > upright * 1.2) {
    // A wide table on a tall screen is turned so that its left (where a hole's tee is) comes to
    // the bottom; a tall one on a wide screen so that its bottom comes to the left.
    const turn = frame.w > frame.h ? 3 : 1;
    const scale = Math.max(0.0001, sideways);
    return turn === 1 ? { scale, turn, ox: cx + midY * scale, oy: cy - midX * scale } : { scale, turn, ox: cx - midY * scale, oy: cy + midX * scale };
  }
  const scale = Math.max(0.0001, upright);
  return { scale, turn: 0, ox: cx - midX * scale, oy: cy - midY * scale };
}

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

function drawBall(b: Brush, d: Disc, time: number, turn: Fit["turn"]) {
  const { ctx, px } = b;
  const [fill, , ink] = TONES[d.look?.tone ?? "white"];
  const sunk = d.sunk ?? 0;
  // Never smaller than a few pixels, however far out the screen is zoomed.
  const r = Math.max(d.r, 4.5 * px) * (1 - 0.3 * sunk);
  ctx.save();
  if (d.ghost) ctx.globalAlpha = 0.5;
  if (!sunk && !d.ghost) {
    // The shadow touches the ball on the side away from the light: it is sitting on the ground.
    ctx.fillStyle = "rgba(4, 22, 8, 0.42)";
    ctx.beginPath();
    ctx.ellipse(d.x + b.light[0] * r * 0.5, d.y + b.light[1] * r * 0.5, r * 1.02, r * 0.92, Math.atan2(b.light[1], b.light[0]), 0, Math.PI * 2);
    ctx.fill();
  }
  dome(b, d.x, d.y, r, fill, d.ghost ? 0.3 : 0.9, 0.45);
  ctx.beginPath();
  ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
  ctx.lineWidth = 1 * px;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  if (d.ghost) ctx.setLineDash([2.5 * px, 2.5 * px]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (d.look?.striped) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#fdfdf8";
    ctx.fillRect(d.x - r, d.y - r, 2 * r, r * 0.55);
    ctx.fillRect(d.x - r, d.y + r * 0.45, 2 * r, r * 0.55);
    ctx.restore();
  }
  if (d.look?.mark && r > 7 * px) {
    // Lettering stays upright however the table is turned.
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate((-turn * Math.PI) / 2);
    ctx.fillStyle = ink;
    ctx.font = `700 ${r * 1.05}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(d.look.mark, 0, r * 0.06);
    ctx.restore();
  }
  if (sunk) {
    // Going down: the hole's own darkness closes over it.
    ctx.fillStyle = `rgba(6, 5, 4, ${0.75 * sunk})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, r + 0.5 * px, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.mine) {
    // The ball to play: a gold ring that breathes, with a dark one under it so it shows on sand too.
    const beat = 0.5 + 0.5 * Math.sin(time / 320);
    const ring = r + (3.5 + 1.8 * beat) * px;
    ctx.globalAlpha = 1;
    for (const [width, colour] of [[4 * px, "rgba(0, 0, 0, 0.45)"], [2.2 * px, "#ffe27a"]] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.lineDashOffset = -time / 90;
      ctx.beginPath();
      ctx.arc(d.x, d.y, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

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

/** The flag in the cup: a pole standing up towards the top of the screen, its pennant, and its shadow on the green. */
function drawFlag(b: Brush, x: number, y: number, up: Point, alpha: number, time: number, still: boolean) {
  const { ctx, px } = b;
  const tall = Math.max(1500, 46 * px);
  const tx = x + up[0] * tall;
  const ty = y + up[1] * tall;
  // Across the pole, to the right as the screen has it.
  const ax = -up[1];
  const ay = up[0];
  const wave = still ? 0 : Math.sin(time / 380) * 0.12;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  // The shadow lies on the ground the way all shadows do.
  ctx.strokeStyle = "rgba(4, 22, 8, 0.3)";
  ctx.lineWidth = 2.4 * px;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + b.light[0] * tall * 0.6, y + b.light[1] * tall * 0.6);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 3.6 * px;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.strokeStyle = "#fbf6ec";
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  const w = tall * 0.5;
  const h = tall * 0.3;
  ctx.fillStyle = "#e5382c";
  ctx.strokeStyle = "rgba(60, 0, 0, 0.6)";
  ctx.lineWidth = 1 * px;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(tx + ax * w * 0.5 - up[0] * h * (0.5 + wave), ty + ay * w * 0.5 - up[1] * h * (0.5 + wave), tx + ax * w - up[0] * h * (0.5 - wave), ty + ay * w - up[1] * h * (0.5 - wave));
  ctx.lineTo(tx - up[0] * h, ty - up[1] * h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** The still part of a table, as last painted: for which table, on what size of screen, fitted how. */
let kept: (Painted & { key: string; table: string; fit: Fit }) | null = null;

/**
 * Draws the whole scene. `width` and `height` are the canvas's size in CSS pixels and `dpr` how
 * many device pixels each is, so lines stay crisp on a dense screen.
 */
export function drawScene(ctx: Ctx, width: number, height: number, dpr: number, fit: Fit, scene: Scene) {
  const { world, look } = scene.table;
  const matrix = matrixOf(fit, dpr);
  /** One CSS pixel, in world units. */
  const px = 1 / fit.scale;
  // The light is at the top left of the screen; in the world that depends on how the table is turned.
  const light = toWorldVector(fit, 0.6, 0.8);
  const up = toWorldVector(fit, 0.22, -0.975);
  const brush: Brush = { ctx, px, light };

  // What never moves: painted the first time this hole is seen at this size, then kept. Painting
  // takes a moment, so while something is moving a painting made for a slightly different size
  // of screen is made to do.
  const key = `${scene.table.key}|${width}|${height}|${dpr}|${fit.scale}|${fit.ox}|${fit.oy}|${fit.turn}`;
  const near = kept !== null && kept.table === scene.table.key && kept.fit.turn === fit.turn && Math.abs(kept.fit.scale / fit.scale - 1) < 0.25;
  if (kept?.key !== key && !(scene.hurry && near)) kept = { key, table: scene.table.key, fit, ...paintCourse(scene.table, width, height, dpr, matrix, { px, light }) };
  const painted = kept!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (painted.key === key) ctx.drawImage(painted.canvas, 0, 0);
  else {
    // Stretched: where a point of the old painting belongs under the new fit.
    const k = fit.scale / painted.fit.scale;
    ctx.fillStyle = "#2f6a2f";
    ctx.fillRect(0, 0, width * dpr, height * dpr);
    ctx.setTransform(k, 0, 0, k, (fit.ox - painted.fit.ox * k) * dpr, (fit.oy - painted.fit.oy * k) * dpr);
    ctx.drawImage(painted.canvas, 0, 0);
  }
  ctx.setTransform(matrix);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Glints on the water: each comes and goes in its own time and drifts a little as it does.
  if (painted.glints.length) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.3 * px;
    painted.glints.forEach(([x, y], i) => {
      const phase = scene.still ? i * 0.37 : scene.time / (1700 + (i % 7) * 260) + i * 0.37;
      const beat = phase - Math.floor(phase);
      const glow = Math.sin(beat * Math.PI);
      if (glow < 0.15) return;
      const w = (3 + (i % 4) * 1.6) * px;
      const drift = (beat - 0.5) * 7 * px;
      ctx.globalAlpha = glow * 0.75;
      ctx.beginPath();
      ctx.moveTo(x + drift - w, y);
      ctx.quadraticCurveTo(x + drift, y - 2.6 * px, x + drift + w, y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  if (scene.trace && scene.trace.length > 1) {
    ctx.save();
    for (const [width, colour] of [[4.5 * px, "rgba(0, 0, 0, 0.4)"], [2.5 * px, "rgba(255, 255, 255, 0.95)"]] as const) {
      ctx.setLineDash([2 * px, 6 * px]);
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      scene.trace.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  // A streak behind anything going fast: wide and bright at the ball, gone a ball or two back.
  for (const trail of scene.trails) {
    for (let i = 1; i < trail.length; i++) {
      const k = i / trail.length;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.34 * k})`;
      ctx.lineWidth = (1 + 5 * k) * px;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1]![0], trail[i - 1]![1]);
      ctx.lineTo(trail[i]![0], trail[i]![1]);
      ctx.stroke();
    }
  }

  for (const e of scene.effects) if (e.kind !== "drop") drawEffect(brush, e);

  // Ghosts under the real thing, and whatever is yours on top.
  const layer = (d: Disc) => (d.ghost ? 0 : d.mine ? 2 : 1);
  for (const d of [...scene.discs].sort((a, b) => layer(a) - layer(b))) {
    if (d.look?.kind === "toadstool") drawToadstool(brush, d.x, d.y, d.r, d.look.tone, d.struck ?? 0);
    else drawBall(brush, d, scene.still ? 0 : scene.time, fit.turn);
  }
  for (const e of scene.effects) if (e.kind === "drop") drawEffect(brush, e);

  // The flag stands in the cup so the hole can be found from across the green, and fades when a
  // ball comes near, so that it never hides one.
  if (look.pockets === "cup") {
    for (const p of world.pockets) {
      const tall = Math.max(1500, 46 * px);
      let near = Infinity;
      for (const d of scene.discs) {
        if (d.look?.kind === "toadstool") continue;
        // How far the ball is from the line of the pole, or from the cup itself.
        const along = Math.max(0, Math.min(tall * 1.1, (d.x - p.x) * up[0] + (d.y - p.y) * up[1]));
        near = Math.min(near, Math.hypot(d.x - p.x - up[0] * along, d.y - p.y - up[1] * along));
      }
      const alpha = Math.min(1, Math.max(0.22, (near - 700) / 900));
      drawFlag(brush, p.x, p.y, up, alpha, scene.time, scene.still);
    }
  }

  if (scene.aim) drawAim(brush, scene.aim);
}
