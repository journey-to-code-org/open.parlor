// Drawing a field game: the sky, the far hills, the land, the tanks on it, whatever is in the air,
// and everything that is only for show (fx.ts). A view says what things are and where, in the
// field's own units; everything about how they look is here and in looks.ts.
//
// A `Painter` belongs to one canvas. The sky and the land are each painted once onto a canvas of
// their own and kept until they change (a new size, a new hole), so a frame is two pictures laid
// down and then the things that move.
import { BARREL, PIECE_UP, landAt, type FieldLand, type FieldPieceLook } from "@journey-to-code/games";
import { toneColour } from "../sport/draw";
import type { Fx, Particle } from "./fx";
import { lookOf, type Look } from "./looks";
import type { Frame } from "./play";

/** A piece as it is this instant: where the view has it, and what the screen is doing with it. */
export interface Actor extends FieldPieceLook {
  /** How far back the barrel has kicked, 0 to 1. */
  recoil: number;
  /** Lit up by a hit, 0 to 1. */
  struck: number;
  /** How far its tracks have turned, for a tank that is driving. */
  rolled: number;
  /** Not there for the moment: carried off, about to be set down. */
  hidden?: boolean;
}

export interface Scene {
  scene: string;
  width: number;
  height: number;
  step: number;
  land: number[];
  wind: number;
  pieces: Actor[];
  names: string[];
  /** Whose turn it is, to mark their tank. */
  turn: number | null;
  /** The barrel being aimed: its piece, the angle and power, and the first of the shell's path as dots. */
  aim: { piece: string; angle: number; power: number; dots: [number, number][] } | null;
  /** What is in the air, while a flight plays. */
  frame: Frame | null;
  fx: Fx;
  /** Seconds since the table opened, for what drifts. */
  time: number;
  /** The colour of whoever fired, for the band on the shell. */
  firing?: string;
  /** Where shells have gone off: the earth is left burnt there. */
  scorches: { x: number; y: number; r: number }[];
}

/** A tank is drawn at least this wide on the screen, however small the field has to be drawn. */
const TANK_MIN = 30;
const TANK_WIDE = 60;

/** How a field fits a canvas: all of its width, with the ground at the bottom. */
export function fitField(scene: Pick<Scene, "width">, w: number, h: number) {
  const scale = w / scene.width;
  return { scale, x: (wx: number) => wx * scale, y: (wy: number) => h - wy * scale, back: (sx: number, sy: number): [number, number] => [sx / scale, (h - sy) / scale] };
}
type Fit = ReturnType<typeof fitField>;

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
/** A colour darker (below 1) or lighter (above 1). */
const shade = (hex: string, by: number) => {
  const [r, g, b] = channels(hex);
  const part = (c: number) => Math.max(0, Math.min(255, Math.round(by <= 1 ? c * by : c + (255 - c) * (by - 1))));
  return `rgb(${part(r)}, ${part(g)}, ${part(b)})`;
};
const see = (hex: string, alpha: number) => {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
/** The same numbers every time for the same place: for stars, pebbles and blades of grass. */
const scatter = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const offscreen = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** A soft round blob of one colour, kept and stamped wherever fire, smoke or dust is wanted. */
const blobs = new Map<string, HTMLCanvasElement>();
function blob(colour: string): HTMLCanvasElement {
  let c = blobs.get(colour);
  if (!c) {
    c = offscreen(64, 64);
    const g = c.getContext("2d")!;
    const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fill.addColorStop(0, see(colour, 1));
    fill.addColorStop(0.45, see(colour, 0.7));
    fill.addColorStop(1, see(colour, 0));
    g.fillStyle = fill;
    g.fillRect(0, 0, 64, 64);
    blobs.set(colour, c);
  }
  return c;
}
function stamp(ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, r: number, alpha: number) {
  if (alpha <= 0.01 || r <= 0.2) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(blob(colour), x - r, y - r, r * 2, r * 2);
}

export class Painter {
  private sky: { key: string; canvas: HTMLCanvasElement } | null = null;
  private ground: { land: number[]; key: string; burnt: number; canvas: HTMLCanvasElement } | null = null;

  // ---- The sky: painted once ------------------------------------------------------------------
  private paintSky(look: Look, key: string, w: number, h: number, dpr: number) {
    const canvas = offscreen(w * dpr, h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [at, colour] of look.sky) g.addColorStop(at, colour);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const dice = scatter(key.length * 7919 + 13);
    for (let i = 0; i < look.stars; i++) {
      const [x, y, size] = [dice() * w, dice() * h * 0.75, dice()];
      ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + dice() * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, size < 0.9 ? 0.7 : 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (look.sun) {
      const [x, y, r] = [look.sun.x * w, look.sun.y * h, Math.max(9, look.sun.r * w)];
      const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 4.5);
      glow.addColorStop(0, see(look.sun.colour, 0.55));
      glow.addColorStop(1, see(look.sun.colour, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      ctx.fillStyle = look.sun.colour;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (look.earthrise) {
      // The Earth: a blue ball, half lit, with a little weather on it.
      const [x, y, r] = [w * 0.78, h * 0.2, Math.max(14, w * 0.05)];
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      const sea = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      sea.addColorStop(0, "#7cc0ff");
      sea.addColorStop(0.55, "#2a66c4");
      sea.addColorStop(1, "#04102c");
      ctx.fillStyle = sea;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = "rgba(120, 190, 120, 0.75)";
      for (const [dx, dy, s] of [[-0.3, -0.2, 0.42], [0.25, 0.3, 0.3], [-0.5, 0.45, 0.25]] as const) {
        ctx.beginPath();
        ctx.ellipse(x + dx * r, y + dy * r, r * s, r * s * 0.6, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      for (const [dx, dy, s] of [[-0.1, -0.5, 0.5], [0.1, 0.05, 0.45], [-0.4, 0.2, 0.3]] as const) {
        ctx.beginPath();
        ctx.ellipse(x + dx * r, y + dy * r, r * s, r * 0.09, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      const dark = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      dark.addColorStop(0.45, "rgba(0, 0, 10, 0)");
      dark.addColorStop(0.9, "rgba(0, 0, 10, 0.85)");
      ctx.fillStyle = dark;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }
    look.ridges.forEach((ridge, n) => {
      const wave = scatter(n * 101 + key.length);
      const [a, b, c] = [1.3 + wave() * 1.5, 3.1 + wave() * 2, wave() * 6];
      const top = (t: number) => {
        let up = 0.5 + 0.34 * Math.sin(t * Math.PI * a + c) + 0.16 * Math.sin(t * Math.PI * b * 2.3 + c * 2);
        // Mesas: the tops are cut off level, in two or three heights.
        if (ridge.flat) up = Math.round(up * 2.6) / 2.6;
        return h * (ridge.base - ridge.tall * up) - (ridge.flat ? 0 : h * 0.006 * Math.sin(t * 57 + n));
      };
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i <= 80; i++) ctx.lineTo((i / 80) * w, top(i / 80));
        ctx.lineTo(w, h);
        ctx.closePath();
      };
      path();
      ctx.fillStyle = ridge.colour;
      ctx.fill();
      if (ridge.capped) {
        // Snow on the tops: the ridge again, clipped to its upper part.
        ctx.save();
        path();
        ctx.clip();
        ctx.fillStyle = ridge.capped;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 0; i <= 80; i++) ctx.lineTo((i / 80) * w, top(i / 80) + h * ridge.tall * (0.22 + 0.1 * Math.sin(i * 1.7)));
        ctx.lineTo(w, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });
    // A little haze where the far hills meet the land.
    const haze = ctx.createLinearGradient(0, h * 0.5, 0, h);
    const last = look.sky[look.sky.length - 1]![1];
    haze.addColorStop(0, see(last, 0));
    haze.addColorStop(1, see(last, look.stars > 100 ? 0 : 0.35));
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
    return canvas;
  }

  // ---- The land: painted once for each shape it takes ----------------------------------------
  private paintLand(look: Look, scene: Scene, fit: Fit, w: number, h: number, dpr: number) {
    const canvas = offscreen(w * dpr, h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const top = () => {
      ctx.beginPath();
      scene.land.forEach((height, i) => (i ? ctx.lineTo(fit.x(i * scene.step), fit.y(height)) : ctx.moveTo(fit.x(0), fit.y(height))));
    };
    const highest = fit.y(Math.max(...scene.land));
    ctx.save();
    top();
    ctx.lineTo(w, h + 2);
    ctx.lineTo(0, h + 2);
    ctx.closePath();
    ctx.clip();
    const soil = ctx.createLinearGradient(0, highest, 0, h);
    soil.addColorStop(0, look.soil[0]);
    soil.addColorStop(1, look.soil[1]);
    ctx.fillStyle = soil;
    ctx.fillRect(0, 0, w, h);
    // Layers in the earth: wavering bands, a little lighter and darker by turns.
    for (let k = 0; k < 7; k++) {
      const y = highest + ((h - highest) * (k + 0.6)) / 7;
      ctx.fillStyle = k % 2 ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.09)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let i = 0; i <= 30; i++) ctx.lineTo((i / 30) * w, y + Math.sin(i * 0.9 + k * 2.1) * h * 0.012 + Math.sin(i * 0.23 + k) * h * 0.02);
      for (let i = 30; i >= 0; i--) ctx.lineTo((i / 30) * w, y + h * 0.035 + Math.sin(i * 0.7 + k * 1.3) * h * 0.012 + Math.sin(i * 0.23 + k) * h * 0.02);
      ctx.fill();
    }
    // Pebbles and flecks, always in the same places.
    const dice = scatter(4242);
    const many = Math.round(Math.min(700, (w * h) / 420));
    for (let i = 0; i < many; i++) {
      const [x, y, size, which] = [dice() * w, highest + dice() * (h - highest), dice(), dice()];
      ctx.fillStyle = see(look.flecks[which < 0.6 ? 0 : 1], 0.28 + dice() * 0.3);
      ctx.beginPath();
      ctx.ellipse(x, y, 0.8 + size * 2.2, 0.6 + size * 1.4, dice() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Burnt where shells have gone off: what is left of the earth round each hole is blackened.
    for (const mark of scene.scorches) {
      const [mx, my, mr] = [fit.x(mark.x), fit.y(mark.y), Math.max(8, mark.r * fit.scale * 1.45)];
      const burn = ctx.createRadialGradient(mx, my, mr * 0.55, mx, my, mr);
      burn.addColorStop(0, "rgba(12, 8, 6, 0.6)");
      burn.addColorStop(1, "rgba(12, 8, 6, 0)");
      ctx.fillStyle = burn;
      ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    // The earth is darker just under the surface, which gives the top an edge.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    top();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = Math.max(22, 90 * fit.scale);
    ctx.stroke();
    top();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
    ctx.lineWidth = Math.max(10, 40 * fit.scale);
    ctx.stroke();
    ctx.restore();

    // The rim: grass, sand, snow or dust, with a line of light along the very top.
    const thick = Math.max(4, look.rim.thick * fit.scale);
    top();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = look.rim.under;
    ctx.lineWidth = thick + 2.5;
    ctx.stroke();
    top();
    ctx.strokeStyle = look.rim.top;
    ctx.lineWidth = thick * 0.6;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -thick * 0.22);
    top();
    ctx.strokeStyle = see(look.rim.light.startsWith("#") ? look.rim.light : "#ffffff", 0.75);
    ctx.lineWidth = Math.max(1, thick * 0.14);
    ctx.stroke();
    ctx.restore();
    if (look.tufts) {
      const blade = scatter(99);
      const ground: FieldLand = { width: scene.width, step: scene.step, heights: scene.land };
      ctx.strokeStyle = look.tufts;
      ctx.lineWidth = Math.max(1, 2.4 * fit.scale);
      for (let x = 6; x < scene.width; x += 9 + blade() * 14) {
        const [sx, sy] = [fit.x(x), fit.y(landAt(ground, x)) - thick * 0.25];
        const tall = Math.max(3, (8 + blade() * 14) * fit.scale * 1.6);
        const lean = (blade() - 0.5) * tall * 0.9;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + lean * 0.2, sy - tall * 0.6, sx + lean, sy - tall);
        ctx.stroke();
      }
    }
    return canvas;
  }

  // ---- What drifts across the sky --------------------------------------------------------------
  private weather(ctx: CanvasRenderingContext2D, look: Look, scene: Scene, w: number, h: number) {
    if (look.clouds) {
      const dice = scatter(7);
      for (let i = 0; i < 5; i++) {
        const [at, high, size, speed] = [dice(), 0.06 + dice() * 0.3, 0.6 + dice() * 0.8, 3 + dice() * 5];
        const span = w + 260;
        const x = ((((at * span + scene.time * speed * (1 + scene.wind * 0.6)) % span) + span) % span) - 130;
        const y = high * h;
        const r = Math.max(9, w * 0.028) * size;
        ctx.fillStyle = see(look.clouds, 0.8);
        ctx.beginPath();
        for (const [dx, dy, s] of [[-1.6, 0.25, 0.75], [-0.7, -0.15, 1], [0.4, -0.3, 1.15], [1.4, 0.1, 0.85], [0, 0.4, 1.3]] as const) ctx.ellipse(x + dx * r, y + dy * r, r * s, r * s * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (scene.wind) {
      // The wind, as a few pale streaks going the way it blows.
      const dice = scatter(21);
      ctx.strokeStyle = look.stars > 100 ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        const [at, high, long] = [dice(), dice() * 0.5 + 0.05, 20 + dice() * 30];
        const span = w + 120;
        const x = ((((at * span + scene.time * scene.wind * 34) % span) + span) % span) - 60;
        ctx.beginPath();
        ctx.moveTo(x, high * h);
        ctx.lineTo(x + long * (0.5 + Math.abs(scene.wind) / 10) * Math.sign(scene.wind), high * h);
        ctx.stroke();
      }
    }
  }
  private snowfall(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number) {
    const dice = scatter(55);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (let i = 0; i < 70; i++) {
      const [at, high, speed, size] = [dice(), dice(), 18 + dice() * 30, 0.8 + dice() * 1.6];
      const y = (high * h + scene.time * speed) % h;
      const x = ((((at * w + Math.sin(scene.time * 0.8 + i) * 12 + scene.time * scene.wind * 12) % w) + w) % w);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- A tank --------------------------------------------------------------------------------
  private tank(ctx: CanvasRenderingContext2D, scene: Scene, fit: Fit, piece: Actor, angle: number, up: boolean) {
    const ground: FieldLand = { width: scene.width, step: scene.step, heights: scene.land };
    const colour = piece.out ? "#3a3734" : toneColour(piece.tone);
    const [light, dark, darker] = [shade(colour, 1.45), shade(colour, 0.62), shade(colour, 0.38)];
    // Units of the field, drawn bigger where the field is small on the screen.
    const u = fit.scale * Math.max(1, TANK_MIN / (TANK_WIDE * fit.scale));
    // It leans with the ground under it, but not so far that it looks to be falling over.
    const tilt = Math.max(-0.5, Math.min(0.5, Math.atan2(landAt(ground, piece.x + 24) - landAt(ground, piece.x - 24), 48))) + (piece.out ? 0.22 : 0);
    const [sx, sy] = [fit.x(piece.x), fit.y(piece.y)];
    ctx.save();
    ctx.translate(sx, sy);
    // A shadow on the ground under it.
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 1.5 * u, 34 * u, 5 * u, -tilt, 0, Math.PI * 2);
    ctx.fill();

    // The barrel points where it is aimed, whatever the hull is standing on. A wreck's has dropped.
    const rad = ((piece.out ? (angle < 90 ? -14 : 194) : angle) * Math.PI) / 180;
    const kick = piece.recoil * 11 * u;
    ctx.save();
    ctx.translate(0, -(PIECE_UP + 4) * u);
    ctx.rotate(-rad);
    const steel = ctx.createLinearGradient(0, -4 * u, 0, 4 * u);
    steel.addColorStop(0, piece.out ? "#55504b" : "#7b8794");
    steel.addColorStop(1, piece.out ? "#1f1d1b" : "#2c333b");
    ctx.fillStyle = steel;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = Math.max(0.8, 1.4 * u);
    ctx.beginPath();
    ctx.roundRect(2 * u - kick, -3.3 * u, (BARREL - 9) * u, 6.6 * u, 2 * u);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect((BARREL - 10) * u - kick, -4.8 * u, 10 * u, 9.6 * u, 1.6 * u);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.rotate(-tilt);
    ctx.lineJoin = "round";
    // Tracks: a dark band with wheels in it, and teeth that move when it drives.
    ctx.fillStyle = "#1c1c1e";
    ctx.beginPath();
    ctx.roundRect(-31 * u, -14 * u, 62 * u, 15 * u, 7.5 * u);
    ctx.fill();
    ctx.strokeStyle = "#3c3c40";
    ctx.lineWidth = Math.max(1, 2 * u);
    ctx.setLineDash([3 * u, 3 * u]);
    ctx.lineDashOffset = -piece.rolled * u;
    ctx.beginPath();
    ctx.roundRect(-30 * u, -13 * u, 60 * u, 13 * u, 6.5 * u);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const wx of [-21, -7, 7, 21]) {
      ctx.fillStyle = "#4a4a50";
      ctx.beginPath();
      ctx.arc(wx * u, -6.5 * u, 4.6 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#77777d";
      ctx.beginPath();
      ctx.arc(wx * u, -6.5 * u, 1.7 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    // The hull, lit from above.
    const body = ctx.createLinearGradient(0, -27 * u, 0, -12 * u);
    body.addColorStop(0, light);
    body.addColorStop(0.45, colour);
    body.addColorStop(1, dark);
    ctx.fillStyle = body;
    ctx.strokeStyle = darker;
    ctx.lineWidth = Math.max(1, 1.8 * u);
    ctx.beginPath();
    ctx.moveTo(-29 * u, -12.5 * u);
    ctx.lineTo(-22 * u, -25 * u);
    ctx.lineTo(22 * u, -25 * u);
    ctx.lineTo(29 * u, -12.5 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(-19 * u, -24 * u, 38 * u, 1.6 * u);
    // The turret, with a hatch.
    const dome = ctx.createRadialGradient(-4 * u, -33 * u, 1 * u, 0, -26 * u, 15 * u);
    dome.addColorStop(0, light);
    dome.addColorStop(0.6, colour);
    dome.addColorStop(1, dark);
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.arc(0, -25 * u, 13 * u, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = darker;
    ctx.beginPath();
    ctx.roundRect(-5 * u, -40.5 * u, 10 * u, 3.4 * u, 1.5 * u);
    ctx.fill();
    // Lit up for a moment by a hit.
    if (piece.struck > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * piece.struck})`;
      ctx.beginPath();
      ctx.roundRect(-31 * u, -40 * u, 62 * u, 40 * u, 8 * u);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();

    // Whose it is, on a plate over it; what armour it has left; and a mark over the one whose turn it is.
    const name = scene.names[piece.owner] ?? `Player ${piece.owner + 1}`;
    const size = 12;
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const wide = Math.min(110, ctx.measureText(name).width) + 14;
    const tx = Math.max(wide / 2 + 3, Math.min(fit.x(scene.width) - wide / 2 - 3, sx));
    const ty = sy - 56 * u - 8;
    ctx.fillStyle = piece.out ? "rgba(0, 0, 0, 0.35)" : "rgba(8, 12, 20, 0.62)";
    ctx.beginPath();
    ctx.roundRect(tx - wide / 2, ty - 9, wide, 18, 9);
    ctx.fill();
    if (up) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = piece.out ? "rgba(255, 255, 255, 0.5)" : up ? "#ffd166" : "#ffffff";
    ctx.fillText(name, tx, ty + 0.5, 110);
    if (piece.armour !== undefined && !piece.out) {
      const part = Math.max(0, Math.min(1, piece.armour / 100));
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.roundRect(tx - 20, ty + 12, 40, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = part > 0.5 ? "#62d26f" : part > 0.25 ? "#ffcb47" : "#ff5a4d";
      ctx.beginPath();
      ctx.roundRect(tx - 19, ty + 13, Math.max(2, 38 * part), 3, 1.5);
      ctx.fill();
    }
    if (up) {
      const bob = Math.sin(scene.time * 4) * 2;
      ctx.beginPath();
      ctx.moveTo(tx - 6, ty - 22 + bob);
      ctx.lineTo(tx + 6, ty - 22 + bob);
      ctx.lineTo(tx, ty - 13 + bob);
      ctx.closePath();
      ctx.fillStyle = "#ffd166";
      ctx.fill();
    }
  }

  // ---- Aiming --------------------------------------------------------------------------------
  private aim(ctx: CanvasRenderingContext2D, scene: Scene, fit: Fit) {
    const aim = scene.aim!;
    const piece = scene.pieces.find((p) => p.id === aim.piece);
    if (!piece) return;
    const u = fit.scale * Math.max(1, TANK_MIN / (TANK_WIDE * fit.scale));
    const [px, py] = [fit.x(piece.x), fit.y(piece.y) - (PIECE_UP + 4) * u];
    const rad = (aim.angle * Math.PI) / 180;
    // A dial round the tank: the whole sweep faintly, and how far round the barrel is.
    const r = 64 * u;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, r, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, r, -rad - 0.06, -rad + 0.06);
    ctx.stroke();
    // The path the shot would start along: dots that shrink and fade, crawling the way it goes.
    aim.dots.forEach(([x, y], i) => {
      const t = i / aim.dots.length;
      const pulse = 0.75 + 0.25 * Math.sin(scene.time * 6 - i * 0.9);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * (1 - t) * pulse})`;
      ctx.beginPath();
      ctx.arc(fit.x(x), fit.y(y), Math.max(1.4, 3.2 * (1 - t * 0.6)), 0, Math.PI * 2);
      ctx.fill();
    });
    // The two numbers, under the tank.
    const label = `${aim.angle}° · ${aim.power}`;
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const wide = ctx.measureText(label).width + 12;
    const lx = Math.max(wide / 2 + 3, Math.min(fit.x(scene.width) - wide / 2 - 3, px));
    const ly = fit.y(piece.y) + 16;
    ctx.fillStyle = "rgba(8, 12, 20, 0.7)";
    ctx.beginPath();
    ctx.roundRect(lx - wide / 2, ly - 8, wide, 16, 8);
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.fillText(label, lx, ly + 0.5);
  }

  // ---- Things in the air ---------------------------------------------------------------------
  private shells(ctx: CanvasRenderingContext2D, scene: Scene, fit: Fit) {
    const band = scene.firing ?? "#ffd166";
    for (const shell of scene.frame!.shells) {
      const [sx, sy] = [fit.x(shell.x), fit.y(shell.y)];
      const before = shell.trail[shell.trail.length - 2] ?? shell.trail[shell.trail.length - 1]!;
      const heading = Math.atan2(-(shell.y - before[1]), shell.x - before[0]);
      const size = Math.max(shell.small ? 3 : 4.5, (shell.small ? 9 : 14) * fit.scale * 1.5);
      if (shell.look === "beam") {
        // A line of light from where it has been to where it is.
        const [fx, fy] = shell.trail[0]!;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (const [wide, colour] of [[size * 2.2, "rgba(255, 60, 60, 0.25)"], [size * 1.1, "rgba(255, 120, 100, 0.6)"], [size * 0.4, "rgba(255, 255, 255, 0.95)"]] as const) {
          ctx.strokeStyle = colour;
          ctx.lineWidth = wide;
          ctx.beginPath();
          ctx.moveTo(fit.x(fx), fit.y(fy));
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
        stamp(ctx, "#ffd0c0", sx, sy, size * 2.4, 0.9);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        continue;
      }
      // A streak of light behind it.
      if (shell.trail.length > 1 && shell.look !== "dirt") {
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        const glow = shell.look === "orb" ? "154, 216, 255" : "255, 196, 110";
        for (let i = 1; i < shell.trail.length; i++) {
          ctx.strokeStyle = `rgba(${glow}, ${(0.5 * i) / shell.trail.length})`;
          ctx.lineWidth = (size * 0.9 * i) / shell.trail.length;
          ctx.beginPath();
          ctx.moveTo(fit.x(shell.trail[i - 1]![0]), fit.y(shell.trail[i - 1]![1]));
          ctx.lineTo(fit.x(shell.trail[i]![0]), fit.y(shell.trail[i]![1]));
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      if (sy < -size) {
        // Above the top of the screen: a mark at the edge says where it is, and how high.
        const high = Math.min(1, -sy / 300);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 - high * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(sx, 4);
        ctx.lineTo(sx - 6 + high * 2, 15 - high * 4);
        ctx.lineTo(sx + 6 - high * 2, 15 - high * 4);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      if (shell.look === "fire") {
        ctx.globalCompositeOperation = "lighter";
        stamp(ctx, "#ff7a2a", sx, sy, size * 2.2, 0.9);
        stamp(ctx, "#fff0b0", sx, sy, size * 1.1, 1);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      } else if (shell.look === "orb") {
        ctx.globalCompositeOperation = "lighter";
        stamp(ctx, "#4aa8ff", sx, sy, size * 2.6, 0.8);
        stamp(ctx, "#e8f6ff", sx, sy, size * 1.2, 1);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "rgba(200, 235, 255, 0.9)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(sx, sy, size * 1.5, size * 0.6, scene.time * 5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shell.look === "dirt") {
        ctx.fillStyle = "#6b4a2e";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(sx, sy, size * 1.25, size, scene.time * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#93694a";
        ctx.beginPath();
        ctx.arc(sx - size * 0.3, sy - size * 0.3, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (shell.look === "bomblet") {
        ctx.globalCompositeOperation = "lighter";
        stamp(ctx, "#ff9a3a", sx, sy, size * 1.9, 0.75);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#26262a";
        ctx.strokeStyle = "#ffd9a0";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // A proper shell: a pointed body with the firer's band round it, and fins.
        ctx.globalCompositeOperation = "lighter";
        stamp(ctx, "#ffb04a", sx - Math.cos(heading) * size, sy - Math.sin(heading) * size, size * 1.6, 0.7);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(heading);
        const long = size * 1.5;
        const fat = size * 0.62;
        ctx.fillStyle = "#3a4048";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-long, -fat);
        ctx.lineTo(long * 0.35, -fat);
        ctx.quadraticCurveTo(long * 1.1, -fat * 0.6, long * 1.25, 0);
        ctx.quadraticCurveTo(long * 1.1, fat * 0.6, long * 0.35, fat);
        ctx.lineTo(-long, fat);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = band;
        ctx.fillRect(-long * 0.25, -fat, long * 0.32, fat * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillRect(-long, -fat, long * 1.35, fat * 0.4);
        ctx.fillStyle = "#22262b";
        ctx.beginPath();
        ctx.moveTo(-long, -fat);
        ctx.lineTo(-long * 1.45, -fat * 1.7);
        ctx.lineTo(-long * 0.7, -fat);
        ctx.moveTo(-long, fat);
        ctx.lineTo(-long * 1.45, fat * 1.7);
        ctx.lineTo(-long * 0.7, fat);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ---- Fire, smoke and flying earth ------------------------------------------------------------
  private bit(ctx: CanvasRenderingContext2D, fit: Fit, p: Particle) {
    const t = p.age / p.life;
    const [x, y] = [fit.x(p.x), fit.y(p.y)];
    // The show is drawn bigger than the game where the field is small on the screen, as the tanks are.
    const s = Math.max(fit.scale * 1.5, 0.34);
    if (p.kind === "flash") {
      ctx.globalCompositeOperation = "lighter";
      stamp(ctx, p.colour, x, y, p.size * s * (0.7 + 0.5 * t), 1 - t);
    } else if (p.kind === "fire" || p.kind === "flame") {
      // White hot, then yellow, orange, red, and at the last a puff of dark smoke.
      const r = p.size * s * (p.kind === "flame" ? 1.3 - t * 0.6 : 0.85 + 1.0 * t);
      if (t < 0.72) {
        // Painted on in its own colour, so it shows against a bright sky, then lit from inside.
        const fade = t < 0.5 ? 1 : 1 - (t - 0.5) * 2.6;
        ctx.globalCompositeOperation = "source-over";
        stamp(ctx, t < 0.3 ? "#ffab2e" : t < 0.52 ? "#f2681c" : "#b8301a", x, y, r, 0.9 * fade);
        ctx.globalCompositeOperation = "lighter";
        if (t < 0.45) stamp(ctx, t < 0.2 ? "#fff6d8" : "#ffd45e", x, y, r * 0.62, 0.95 * (1 - t / 0.45));
      } else {
        ctx.globalCompositeOperation = "source-over";
        stamp(ctx, "#3a3532", x, y, r, 0.5 * (1 - (t - 0.72) / 0.28));
      }
    } else if (p.kind === "ring") {
      const ease = 1 - (1 - t) * (1 - t);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = p.colour;
      ctx.lineWidth = Math.max(1, 7 * (1 - t));
      ctx.beginPath();
      ctx.arc(x, y, p.size * s * ease, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "spark") {
      const fast = Math.hypot(p.vx, p.vy) || 1;
      const long = Math.max(3, p.size * s * 1.6);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1 - t * t;
      ctx.strokeStyle = p.colour;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (p.vx / fast) * long, y + (p.vy / fast) * long);
      ctx.stroke();
    } else if (p.kind === "chunk") {
      const r = Math.max(1.2, p.size * s);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = t > 0.8 ? (1 - t) * 5 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.age * p.spin);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(-r, 0, r * 2, r * 0.8);
      ctx.restore();
    } else if (p.kind === "smoke" || p.kind === "dust") {
      ctx.globalCompositeOperation = "source-over";
      stamp(ctx, p.colour, x, y, p.size * s * (0.7 + 1.5 * t), (p.kind === "dust" ? 0.5 : 0.55) * Math.pow(1 - t, 1.4));
    } else if (p.kind === "glint") {
      const r = Math.max(2, p.size * s * 1.6) * (1 - t * 0.5);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    }
  }

  /** Paint a scene onto a canvas `w` by `h` CSS pixels. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, scene: Scene) {
    const look = lookOf(scene.scene);
    const fit = fitField(scene, w, h);
    const skyKey = `${scene.scene}/${w}/${h}/${dpr}`;
    if (this.sky?.key !== skyKey) this.sky = { key: skyKey, canvas: this.paintSky(look, skyKey, w, h, dpr) };
    if (this.ground?.land !== scene.land || this.ground.key !== skyKey || this.ground.burnt !== scene.scorches.length) this.ground = { land: scene.land, key: skyKey, burnt: scene.scorches.length, canvas: this.paintLand(look, scene, fit, w, h, dpr) };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const [jx, jy] = scene.fx.jolt;
    // The sky shakes a third as much as the ground does: it is further off.
    ctx.drawImage(this.sky.canvas, jx * 0.3 - 3, jy * 0.3 - 3, w + 6, h + 6);
    this.weather(ctx, look, scene, w, h);
    ctx.save();
    ctx.translate(jx, jy);
    ctx.drawImage(this.ground.canvas, 0, 0, w, h);
    // If the shake has lifted the land off the bottom edge, earth shows there and not sky.
    ctx.fillStyle = look.soil[1];
    ctx.fillRect(-30, h - 1, w + 60, 40);

    for (const piece of scene.pieces) if (piece.out && !piece.hidden) this.tank(ctx, scene, fit, piece, piece.angle, false);
    if (scene.aim) this.aim(ctx, scene, fit);
    for (const piece of scene.pieces) if (!piece.out && !piece.hidden) this.tank(ctx, scene, fit, piece, scene.aim?.piece === piece.id ? scene.aim.angle : piece.angle, scene.turn === piece.owner);
    if (scene.frame) this.shells(ctx, scene, fit);
    for (const p of scene.fx.bits) this.bit(ctx, fit, p);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    if (look.snowfall) this.snowfall(ctx, scene, w, h);

    // What a hit took, floating up from whoever it hit; and anything worth shouting about.
    for (const number of scene.frame?.numbers ?? []) {
      const piece = scene.pieces.find((p) => p.id === number.piece);
      if (!piece) continue;
      const pop = number.age < 0.12 ? 0.6 + (number.age / 0.12) * 0.7 : 1.3 - Math.min(0.3, (number.age - 0.12) * 1.5);
      ctx.font = `900 ${Math.round(20 * pop)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(40, 10, 0, ${0.85 * (1 - number.age * number.age)})`;
      ctx.fillStyle = `rgba(255, 220, 110, ${1 - number.age * number.age})`;
      const x = Math.max(22, Math.min(w - 22, fit.x(piece.x)));
      const y = fit.y(piece.y) - 66 - number.age * 40;
      ctx.strokeText(`${number.damage}`, x, y);
      ctx.fillText(`${number.damage}`, x, y);
    }
    for (const shout of scene.fx.shouts) {
      const t = shout.age / shout.life;
      const pop = t < 0.1 ? 0.4 + (t / 0.1) * 0.8 : 1.2 - Math.min(0.2, (t - 0.1) * 2);
      const fade = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.font = `900 ${Math.round(Math.max(18, Math.min(30, w * 0.06)) * pop)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 6;
      const wide = ctx.measureText(shout.text).width / 2 + 8;
      const x = Math.max(wide, Math.min(w - wide, fit.x(shout.x)));
      const y = Math.max(30, fit.y(shout.y) - 120 - t * 30);
      ctx.strokeStyle = `rgba(20, 8, 0, ${0.9 * fade})`;
      ctx.fillStyle = shout.tone === "good" ? `rgba(255, 214, 92, ${fade})` : shout.tone === "bad" ? `rgba(255, 120, 100, ${fade})` : `rgba(255, 255, 255, ${fade})`;
      ctx.strokeText(shout.text, x, y);
      ctx.fillText(shout.text, x, y);
    }
    // The corners a little darker, as through a lens.
    const lens = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    lens.addColorStop(0, "rgba(0, 0, 0, 0)");
    lens.addColorStop(1, "rgba(0, 0, 0, 0.3)");
    ctx.fillStyle = lens;
    ctx.fillRect(0, 0, w, h);
  }
}
