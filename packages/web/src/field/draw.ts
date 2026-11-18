// Drawing a field game: the sky, the land, the tanks on it, and whatever is in the air. A view
// says what things are and where, in the field's own units; everything about how they look is
// here. One function, `drawField`, takes a `Scene` and paints it, so another renderer could take
// the same scene.
import { BARREL, PIECE_UP, landAt, type FieldLand, type FieldPieceLook } from "@journey-to-code/games";
import { toneColour } from "../sport/draw";
import type { Frame } from "./play";

export interface Scene {
  width: number;
  height: number;
  step: number;
  land: number[];
  /** The pieces where they are this instant (a flight may have moved them from where the view has them). */
  pieces: FieldPieceLook[];
  names: string[];
  /** Whose turn it is, to mark their tank. */
  turn: number | null;
  /** The barrel being aimed: its piece, the angle, and the first of the shell's path as dots. */
  aim: { piece: string; angle: number; dots: [number, number][] } | null;
  /** What is in the air and bursting, while a flight plays. */
  frame: Frame | null;
}

/** A tank is drawn at least this wide on the screen, however small the field has to be drawn. */
const TANK_MIN = 22;
const TANK_WIDE = 60;

/** How a field fits a canvas: all of its width, with the ground at the bottom. */
export function fitField(scene: Pick<Scene, "width">, w: number, h: number) {
  const scale = w / scene.width;
  return { scale, x: (wx: number) => wx * scale, y: (wy: number) => h - wy * scale, back: (sx: number, sy: number): [number, number] => [sx / scale, (h - sy) / scale] };
}

const shade = (hex: string, by: number) => {
  const n = parseInt(hex.slice(1), 16);
  const part = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * by)));
  return `rgb(${part(16)}, ${part(8)}, ${part(0)})`;
};

function sky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1d2f57");
  g.addColorStop(0.55, "#6e7fb0");
  g.addColorStop(0.85, "#f0b88c");
  g.addColorStop(1, "#f6d7a8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A low sun, and two far ridges for depth.
  ctx.fillStyle = "rgba(255, 236, 190, 0.85)";
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.62, Math.max(10, w * 0.035), 0, Math.PI * 2);
  ctx.fill();
  for (const [base, tall, tone, wave] of [
    [0.6, 0.11, "rgba(58, 62, 110, 0.55)", 2.1],
    [0.7, 0.08, "rgba(44, 50, 92, 0.7)", 3.7],
  ] as const) {
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      ctx.lineTo(t * w, h * (base - tall * (0.5 + 0.5 * Math.sin(t * Math.PI * wave + wave)) - 0.02 * Math.sin(t * 31)));
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
}

function land(ctx: CanvasRenderingContext2D, scene: Scene, fit: ReturnType<typeof fitField>, w: number, h: number) {
  const top = () => {
    ctx.beginPath();
    scene.land.forEach((height, i) => (i ? ctx.lineTo(fit.x(i * scene.step), fit.y(height)) : ctx.moveTo(fit.x(0), fit.y(height))));
  };
  top();
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const soil = ctx.createLinearGradient(0, h * 0.25, 0, h);
  soil.addColorStop(0, "#7a5533");
  soil.addColorStop(1, "#3b2616");
  ctx.fillStyle = soil;
  ctx.fill();
  // Grass along the top: a dark edge under a bright one.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const grass = Math.max(3, 16 * fit.scale);
  top();
  ctx.strokeStyle = "#2f6b2a";
  ctx.lineWidth = grass + 2;
  ctx.stroke();
  top();
  ctx.strokeStyle = "#67b548";
  ctx.lineWidth = grass * 0.55;
  ctx.stroke();
}

function tank(ctx: CanvasRenderingContext2D, scene: Scene, fit: ReturnType<typeof fitField>, piece: FieldPieceLook, angle: number, up: boolean) {
  const ground: FieldLand = { width: scene.width, step: scene.step, heights: scene.land };
  const colour = toneColour(piece.tone);
  const dark = shade(colour, 0.5);
  // Units of the field, drawn bigger where the field is small on the screen.
  const u = fit.scale * Math.max(1, TANK_MIN / (TANK_WIDE * fit.scale));
  const tilt = Math.atan2(landAt(ground, piece.x + 24) - landAt(ground, piece.x - 24), 48);
  ctx.save();
  ctx.translate(fit.x(piece.x), fit.y(piece.y));
  // The barrel points where it is aimed, whatever the hull is standing on.
  const rad = (angle * Math.PI) / 180;
  ctx.strokeStyle = dark;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2.5, 7 * u);
  ctx.beginPath();
  ctx.moveTo(0, -PIECE_UP * u);
  ctx.lineTo(Math.cos(rad) * BARREL * u, -(PIECE_UP + Math.sin(rad) * BARREL) * u);
  ctx.stroke();
  ctx.rotate(-tilt);
  ctx.lineWidth = Math.max(1, 2 * u);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  // Tracks, hull, turret.
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.roundRect(-30 * u, -12 * u, 60 * u, 13 * u, 6 * u);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(-25 * u, -11 * u);
  ctx.lineTo(-19 * u, -23 * u);
  ctx.lineTo(19 * u, -23 * u);
  ctx.lineTo(25 * u, -11 * u);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -23 * u, 12 * u, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Whose it is, over it; and a mark over the one whose turn it is.
  const name = scene.names[piece.owner] ?? `Player ${piece.owner + 1}`;
  const size = Math.max(10, Math.min(14, 30 * u));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const tx = Math.max(24, Math.min(fit.x(scene.width) - 24, fit.x(piece.x)));
  const ty = fit.y(piece.y) - 62 * u;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.strokeText(name, tx, ty);
  ctx.fillStyle = up ? "#ffd166" : "#fff";
  ctx.fillText(name, tx, ty);
  if (up) {
    ctx.beginPath();
    ctx.moveTo(tx - 5, ty - size - 6);
    ctx.lineTo(tx + 5, ty - size - 6);
    ctx.lineTo(tx, ty - size + 1);
    ctx.closePath();
    ctx.fillStyle = "#ffd166";
    ctx.fill();
  }
}

/** Paint a scene onto a canvas `w` by `h` CSS pixels. */
export function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, scene: Scene) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fit = fitField(scene, w, h);
  sky(ctx, w, h);
  land(ctx, scene, fit, w, h);

  // The path a shot would start along: a few dots, fading.
  if (scene.aim) {
    scene.aim.dots.forEach(([x, y], i) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - i / scene.aim!.dots.length)})`;
      ctx.beginPath();
      ctx.arc(fit.x(x), fit.y(y), 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  for (const piece of scene.pieces) tank(ctx, scene, fit, piece, scene.aim?.piece === piece.id ? scene.aim.angle : piece.angle, scene.turn === piece.owner);

  const frame = scene.frame;
  if (!frame) return;
  for (const shell of frame.shells) {
    const r = Math.max(shell.small ? 2 : 3, (shell.small ? 6 : 9) * fit.scale);
    // A streak behind it, then the shell.
    if (shell.trail.length > 1) {
      ctx.lineCap = "round";
      for (let i = 1; i < shell.trail.length; i++) {
        ctx.strokeStyle = `rgba(255, 240, 200, ${(0.6 * i) / shell.trail.length})`;
        ctx.lineWidth = (r * 1.4 * i) / shell.trail.length;
        ctx.beginPath();
        ctx.moveTo(fit.x(shell.trail[i - 1]![0]), fit.y(shell.trail[i - 1]![1]));
        ctx.lineTo(fit.x(shell.trail[i]![0]), fit.y(shell.trail[i]![1]));
        ctx.stroke();
      }
    }
    const sy = fit.y(shell.y);
    if (sy < -r) {
      // Above the top of the screen: a mark at the edge says where it is.
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.moveTo(fit.x(shell.x), 4);
      ctx.lineTo(fit.x(shell.x) - 6, 14);
      ctx.lineTo(fit.x(shell.x) + 6, 14);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    ctx.fillStyle = "#1b1b1b";
    ctx.strokeStyle = "#ffe9a8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(fit.x(shell.x), sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const burst of frame.bursts) {
    const ease = 1 - (1 - burst.age) * (1 - burst.age);
    const x = fit.x(burst.x);
    const y = fit.y(burst.y);
    if (burst.kind === "burst") {
      const r = Math.max(6, burst.r * fit.scale) * (0.35 + 0.65 * ease);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 255, 235, ${1 - burst.age})`);
      g.addColorStop(0.45, `rgba(255, 190, 70, ${0.9 * (1 - burst.age)})`);
      g.addColorStop(1, `rgba(220, 70, 30, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Earth thrown up (a heap landing, a skip off the ground), or the flash of a shell breaking up.
      const r = Math.max(5, (burst.kind === "heap" ? burst.r * 0.7 : 34) * fit.scale) * (0.4 + 0.6 * ease);
      ctx.fillStyle = burst.kind === "split" ? `rgba(255, 255, 255, ${0.8 * (1 - burst.age)})` : `rgba(150, 110, 70, ${0.7 * (1 - burst.age)})`;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.4, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const number of frame.numbers) {
    const piece = scene.pieces.find((p) => p.id === number.piece);
    if (!piece) continue;
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.7 * (1 - number.age)})`;
    ctx.fillStyle = `rgba(255, 209, 102, ${1 - number.age * number.age})`;
    const x = Math.max(20, Math.min(w - 20, fit.x(piece.x)));
    const y = fit.y(piece.y) - 46 - number.age * 34;
    ctx.strokeText(String(number.damage), x, y);
    ctx.fillText(String(number.damage), x, y);
  }
}
