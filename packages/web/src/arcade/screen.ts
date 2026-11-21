// The arcade screen's drawing: any ArcadeView, on a canvas. The view says what things are and where
// (a "ship", a "bullet", a "foe:drone", in the field's own units); this file decides what each looks
// like. It also keeps what is only for show and never part of the game: the stars going by, the
// sparks and rings of an explosion, the words that float up from a pickup, the shake of a hit. Those
// come from the view's events, one tick's worth at a time.
import type { ArcadeEvent, ArcadeView } from "@journey-to-code/games";
import { bulwarkLook, loadBulwarkLook, lookMotion } from "./bulwark-look";
import { paintRoad } from "./road";
import { blip, crash, notes } from "./sounds";

const TONES: Record<string, string> = {
  blue: "#4cc9ff", red: "#ff5a6e", green: "#5ee6a0", gold: "#ffd166", pink: "#ff6ad5", orange: "#ff9f43",
  purple: "#b08cff", teal: "#3fe0d0", grey: "#b9c4d6", crimson: "#ff3355", white: "#ffffff",
};
export const toneOf = (tone?: string) => (tone && TONES[tone]) || "#ffffff";
/** Whose something is, by seat: the same colours the games give their seats. */
const TONES_BY_SEAT = ["blue", "red", "green", "gold"];
const FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

type Shape = [number, number][];
const SHIP: Shape = [[0, -1.15], [0.28, -0.3], [0.95, 0.55], [0.4, 0.5], [0.22, 0.9], [-0.22, 0.9], [-0.4, 0.5], [-0.95, 0.55], [-0.28, -0.3]];
const DRONE: Shape = [[0, 1], [0.9, -0.1], [0.5, -0.8], [-0.5, -0.8], [-0.9, -0.1]];
const DART: Shape = [[1.2, 0], [-0.7, 0.75], [-0.3, 0], [-0.7, -0.75]];
const HEX: Shape = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);
const STAR: Shape = Array.from({ length: 16 }, (_, i) => {
  const r = i % 2 ? 0.55 : 1;
  return [Math.cos((i * Math.PI) / 8) * r, Math.sin((i * Math.PI) / 8) * r];
});
const BOSS: Shape = [[0, 1], [0.5, 0.55], [1.25, 0.35], [1.05, -0.35], [0.5, -0.5], [0.3, -0.95], [-0.3, -0.95], [-0.5, -0.5], [-1.05, -0.35], [-1.25, 0.35], [-0.5, 0.55]];
const CARRIER: Shape = [[-1.15, -0.5], [1.15, -0.5], [1.3, 0.1], [0.7, 0.75], [-0.7, 0.75], [-1.3, 0.1]];

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; colour: string; size: number; kind?: "bit" | "fire" | "smoke" | "flash" }
interface Ring { x: number; y: number; r: number; grow: number; life: number; max: number; colour: string }
interface Word { x: number; y: number; text: string; life: number; max: number; big: boolean; colour: string }
interface Beam { x: number; y: number; tx: number; ty: number; life: number; max: number; colour: string; kind: "line" | "bolt" | "lob"; blast: number }

/** What the player is pointing at on a grid, for the screen to show: nothing the game knows about. */
export interface ArcadePointer {
  /** The cell picked out. */
  cell?: [col: number, row: number];
  /** A reach to draw round it: the tower's that stands there, or the one about to be built. */
  range?: number;
  /** Whether something could be built there. */
  open?: boolean;
  tone?: string;
}

export interface ArcadeScreen {
  /** Fit the canvas to its box, keeping the field's shape. */
  resize(): void;
  /** One tick's events: sparks, shakes and (unless `quiet`) sounds. `me` is the seat whose guns are heard. */
  hear(events: readonly ArcadeEvent[], quiet: boolean, me?: number): void;
  /** Move the sparks on by a tick. */
  settle(): void;
  draw(view: ArcadeView, frame: number, pointer?: ArcadePointer): void;
  /**
   * Only what lies over a field that something else has drawn (the 3-D scene, on a canvas under
   * this one): the bars of what has been hurt, the words that float up, the banner, the boss's bar
   * and the flash of a hit. `project` says where a spot of the field (and a height over it) is in
   * that picture, in the field's units across the canvas.
   */
  drawOverlay(view: ArcadeView, frame: number, project: (x: number, y: number, lift?: number) => [number, number]): void;
  /** Clear what is left over from the last game. */
  reset(): void;
}

export function createArcadeScreen(canvas: HTMLCanvasElement, field: { width: number; height: number }, says: (text: string) => string = (text) => text, game?: string): ArcadeScreen {
  if (game === "bulwark") void loadBulwarkLook();
  const ctx = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" })!;
  const FW = field.width;
  const FH = field.height;
  /** Nothing should travel: Zubra's reduced motion, or the parlor's motion turned off. */
  const frozen = () => lookMotion() === 0;
  const stars = Array.from({ length: 110 }, (_, i) => ({ x: Math.random() * FW, y: Math.random() * FH, z: 1 + (i % 3) }));
  let sparks: Spark[] = [];
  let rings: Ring[] = [];
  let words: Word[] = [];
  let beams: Beam[] = [];
  let shake = 0;
  let flash = 0;
  let streak = 0;
  /** How much the big chip is squashed by a tap just now. */
  let bump = 0;
  let scale = 1;
  let dpr = 1;

  function burst(x: number, y: number, n: number, colour: string, speed: number, life: number) {
    if (sparks.length > 900) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, colour, size: 30 + Math.random() * 50 });
    }
  }
  const ring = (x: number, y: number, r: number, grow: number, life: number, colour: string) => rings.push({ x, y, r, grow, life, max: life, colour });
  /**
   * Fire, smoke and a ring of air, as Over the Hill draws a blast. False when this game keeps
   * the old sparks. When nothing is meant to travel, one flash fades where it landed and this
   * still returns true, so the old sparks are not put back.
   */
  function bang(x: number, y: number, scale: number): boolean {
    if (game !== "bulwark") return false;
    const look = bulwarkLook();
    const motion = lookMotion();
    // Embers keep the old sparks, unless nothing is meant to travel: then one flash that fades in place.
    if (look.blast === "embers" && motion > 0) return false;
    if (motion === 0) {
      sparks.push({ x, y, vx: 0, vy: 0, life: 5, max: 5, colour: "#fff6e0", size: 180 * Math.min(1, scale), kind: "flash" });
      return true;
    }
    const power = (look.blast === "inferno" ? 1.65 : 1) * scale * motion;
    sparks.push({ x, y, vx: 0, vy: 0, life: 7, max: 7, colour: "#fff6e0", size: 240 * power, kind: "flash" });
    const fires = Math.round(10 + 8 * power);
    for (let i = 0; i < fires && sparks.length < 900; i++) {
      const a = Math.random() * Math.PI * 2;
      const far = Math.random() * 90 * power;
      const life = 18 + Math.random() * 16;
      sparks.push({
        x: x + Math.cos(a) * far,
        y: y + Math.sin(a) * far * 0.55,
        vx: Math.cos(a) * (18 + Math.random() * 36) * power,
        vy: -(30 + Math.random() * 50) * (0.5 + 0.5 * Math.min(1, power)),
        life,
        max: life,
        colour: Math.random() < 0.34 ? "#fff3c4" : Math.random() < 0.5 ? "#ffb347" : "#ff6a1a",
        size: (55 + Math.random() * 70) * power,
        kind: "fire",
      });
    }
    const column = Math.round(3 + 2 * power);
    for (let i = 0; i < column && sparks.length < 900; i++) {
      const life = 22 + Math.random() * 12;
      sparks.push({ x: x + (Math.random() - 0.5) * 50 * power, y, vx: (Math.random() - 0.5) * 16, vy: -(70 + Math.random() * 80), life, max: life, colour: "#ffd27a", size: (40 + Math.random() * 40) * power, kind: "fire" });
    }
    const smokes = Math.round(look.smokePuffs * Math.min(1.4, scale));
    for (let i = 0; i < smokes && sparks.length < 900; i++) {
      const life = 50 + Math.random() * 40;
      sparks.push({
        x: x + (Math.random() - 0.5) * 120 * power,
        y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 14,
        vy: -(8 + Math.random() * 16),
        life,
        max: life,
        colour: Math.random() < 0.5 ? "#4a4540" : "#6b645c",
        size: (46 + Math.random() * 50) * power,
        kind: "smoke",
      });
    }
    burst(x, y, Math.round(8 * power), "#ffd27a", 80 * power, 22);
    burst(x, y, Math.round(6 * power), "#5b4a33", 55, 28);
    ring(x, y, 36 * power, 30 * power, 14, "#fff1c9");
    ring(x, y, 18 * power, 20 * power, 18, "#ffb347");
    return true;
  }
  const beam = (e: ArcadeEvent, kind: Beam["kind"], life: number, blast = 0) => e.to && beams.length < 200 && beams.push({ x: e.x, y: e.y, tx: e.to[0], ty: e.to[1], life, max: life, colour: toneOf(e.tone), kind, blast });

  /** The ground of a game that builds on a grid: grass, the road, and the squares that can be built on. */
  let ground: HTMLCanvasElement | null = null;
  let groundKey = "";
  function groundFor(build: NonNullable<ArcadeView["build"]>) {
    const key = `${canvas.width}:${bulwarkLook().roadBend}:${build.closed.join(",")}`;
    if (ground && key === groundKey) return ground;
    groundKey = key;
    ground = document.createElement("canvas");
    ground.width = canvas.width;
    ground.height = canvas.height;
    const g = ground.getContext("2d", { alpha: false, colorSpace: "srgb" })!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.scale(scale, scale);
    g.fillStyle = "#1d3b2a";
    g.fillRect(0, 0, FW, FH);
    const closed = new Set(build.closed);
    for (let row = 0; row < build.rows; row++) {
      for (let col = 0; col < build.cols; col++) {
        if (closed.has(row * build.cols + col)) continue;
        g.fillStyle = (row + col) % 2 ? "#24482f" : "#214330";
        g.fillRect(col * build.cell + 12, row * build.cell + 12, build.cell - 24, build.cell - 24);
      }
    }
    paintRoad(g, build.road, build.cell, bulwarkLook().roadBend, {
      shoulder: "#5b4a33",
      dirt: "#cdb48a",
      crown: "#e4d2ae",
      rut: "rgba(91,74,51,0.5)",
      stone: "#6e5a40",
      grass: "#2f6a38",
    });
    return ground;
  }

  // Glowing dots are drawn once and stamped: hundreds of bullets a frame have to be cheap.
  const stamps = new Map<string, HTMLCanvasElement>();
  function stamp(colour: string, hollow: boolean) {
    const key = colour + (hollow ? "h" : "");
    let c = stamps.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(hollow ? 0.22 : 0.34, "#ffffff");
    grad.addColorStop(hollow ? 0.3 : 0.44, colour);
    grad.addColorStop(0.62, `${colour}aa`);
    grad.addColorStop(1, `${colour}00`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    stamps.set(key, c);
    return c;
  }

  function path(shape: Shape, x: number, y: number, r: number, turn = 0) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    ctx.beginPath();
    shape.forEach(([px, py], i) => {
      const qx = x + (px * c - py * s) * r;
      const qy = y + (px * s + py * c) * r;
      if (i) ctx.lineTo(qx, qy);
      else ctx.moveTo(qx, qy);
    });
    ctx.closePath();
  }
  /** A dark body with a glowing outline in the thing's colour. */
  function solid(shape: Shape, x: number, y: number, r: number, colour: string, turn = 0) {
    const alpha = ctx.globalAlpha;
    path(shape, x, y, r, turn);
    ctx.fillStyle = "#0b1020";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.strokeStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = r * 0.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.28;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  /** The words that float up from where something happened; `at` says where that is in the picture. */
  function sayWords(at: (x: number, y: number) => [number, number] = (x, y) => [x, y]) {
    for (const w of words) {
      const [x, y] = at(w.x, w.y);
      ctx.globalAlpha = Math.min(1, (w.life / w.max) * 2);
      ctx.fillStyle = w.colour;
      ctx.font = `700 ${w.big ? 330 : 190}px ${FONT}`;
      ctx.fillText(w.text, Math.max(900, Math.min(FW - 900, x)), y - (w.max - w.life) * 9);
    }
  }
  /** What is written across the field: the banner, the boss's bar, and the white of a flash. */
  function hud(view: ArcadeView, frame: number) {
    const W = canvas.width;
    const H = canvas.height;
    if (view.banner && !view.over) {
      ctx.fillStyle = view.banner === "Warning" && frame % 30 < 15 ? "#ff5a6e" : "#ffffff";
      const banner = says(view.banner).toUpperCase();
      ctx.font = `700 560px ${FONT}`;
      // A long one is set smaller, to fit across.
      const fits = Math.min(1, (FW - 500) / Math.max(1, ctx.measureText(banner).width));
      if (fits < 1) ctx.font = `700 ${Math.floor(560 * fits)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.9;
      ctx.fillText(banner, FW / 2, FH * 0.38);
      ctx.globalAlpha = 1;
    }
    if (view.boss) {
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(500, 330, FW - 1000, 90);
      ctx.fillStyle = "#ff3355";
      ctx.fillRect(500, 330, ((FW - 1000) * view.boss.health) / 1000, 90);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (const mark of [1 / 3, 2 / 3]) ctx.fillRect(500 + (FW - 1000) * mark - 8, 310, 16, 130);
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 170px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(says(view.boss.name).toUpperCase(), 500, 540);
    }
    if (flash > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${frozen() ? flash * 0.2 : flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return {
    resize() {
      const box = canvas.parentElement?.getBoundingClientRect();
      if (!box || !box.width || !box.height) return;
      const w = Math.min(box.width, (box.height * FW) / FH);
      const h = (w * FH) / FW;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      scale = canvas.width / FW;
    },
    reset() {
      beams = [];
      sparks = [];
      rings = [];
      words = [];
      shake = flash = streak = 0;
    },
    hear(events, quiet, me = 0) {
      for (const e of events) {
        switch (e.kind) {
          case "boom":
            burst(e.x, e.y, 9, "#ffb347", 70, 22);
            ring(e.x, e.y, 80, 26, 12, "#ffd9a0");
            if (!quiet) crash(0.16, 0.07);
            break;
          case "big-boom":
            burst(e.x, e.y, 26, "#ff8a3d", 110, 34);
            ring(e.x, e.y, 120, 46, 18, "#fff0c8");
            shake = Math.max(shake, 10);
            if (!quiet) crash(0.4, 0.14);
            break;
          case "boss-down":
            if (!bang(e.x, e.y, 2.3)) {
              burst(e.x, e.y, 90, "#ffd166", 170, 60);
              burst(e.x, e.y, 60, "#ff5a6e", 120, 70);
              ring(e.x, e.y, 200, 90, 40, "#ffffff");
            }
            shake = 34;
            flash = 1;
            if (!quiet) {
              crash(1.4, 0.25);
              blip(110, 1.2, "sawtooth", 0.08, -70);
            }
            break;
          case "down":
            burst(e.x, e.y, 40, "#9fe3ff", 120, 40);
            ring(e.x, e.y, 100, 60, 22, "#9fe3ff");
            shake = 20;
            flash = 0.5;
            if (e.seat === me) streak = 0;
            if (!quiet) {
              crash(0.7, 0.2);
              blip(300, 0.6, "sawtooth", 0.08, -250);
            }
            break;
          case "bomb":
            ring(e.x, e.y, 200, 170, 50, "#ffffff");
            flash = 0.7;
            shake = 14;
            if (!quiet) {
              crash(1.0, 0.2);
              blip(80, 0.9, "sine", 0.15, 300);
            }
            break;
          case "fizz":
            if (sparks.length < 700) sparks.push({ x: e.x, y: e.y, vx: 0, vy: -8, life: 14, max: 14, colour: "#bfe9ff", size: 55 });
            break;
          case "hit":
            if (sparks.length < 700) burst(e.x, e.y, 1, "#ffffff", 40, 8);
            break;
          case "graze":
            burst(e.x, e.y, 2, "#ffffff", 50, 10);
            if (!quiet && e.seat === me) blip(1900, 0.03, "square", 0.012);
            break;
          case "medal":
            streak++;
            if (!quiet) blip(660 + Math.min(12, streak) * 70, 0.09, "triangle", 0.06);
            break;
          case "medal-lost":
            streak = 0;
            if (!quiet) blip(220, 0.3, "sawtooth", 0.05, -120);
            break;
          case "power":
          case "bomb-up":
            if (!quiet) notes([520, 780], 70, 0.1);
            break;
          case "extend":
            if (!quiet) notes([523, 659, 784, 1046]);
            break;
          case "boss":
            if (!quiet) {
              blip(140, 0.5, "sawtooth", 0.08);
              setTimeout(() => blip(140, 0.5, "sawtooth", 0.08), 600);
            }
            break;
          case "dive":
            if (!quiet) blip(900, 0.18, "sawtooth", 0.025, -600);
            break;
          case "shoot":
            if (!quiet && e.seat === me) blip(1250, 0.03, "square", 0.008, -500);
            break;
          // A game that builds: shots go from a tower to what it hit.
          case "shot":
            beam(e, "line", 5);
            if (!quiet) blip(880, 0.025, "square", 0.006, -300);
            break;
          case "snipe":
            beam(e, "line", 12);
            if (!quiet) blip(240, 0.14, "sawtooth", 0.035, -150);
            break;
          case "zap":
            beam(e, "bolt", 7);
            if (!quiet) blip(1500, 0.05, "sawtooth", 0.008, 600);
            break;
          case "shell":
            beam(e, "lob", 9, e.amount ?? 500);
            if (e.to && !bang(e.to[0], e.to[1], 1)) {
              ring(e.to[0], e.to[1], 60, (e.amount ?? 500) / 9, 9, "#ffb347");
              burst(e.to[0], e.to[1], 7, "#ffb347", 60, 16);
            } else if (e.to) shake = Math.max(shake, 8);
            if (!quiet) crash(0.22, 0.06);
            break;
          case "frost":
            if (rings.length < 60) ring(e.x, e.y, 80, (e.amount ?? 1000) / 14, 14, "#8fe9ff");
            break;
          case "pop":
            if (!bang(e.x, e.y, 0.62)) burst(e.x, e.y, 6, toneOf(e.tone), 55, 16);
            if (!quiet) blip(520, 0.05, "triangle", 0.02, -200);
            break;
          case "leak":
            bang(e.x, e.y, 0.85);
            flash = Math.max(flash, 0.35);
            shake = Math.max(shake, 12);
            if (!quiet) blip(160, 0.35, "sawtooth", 0.08, -80);
            break;
          case "built":
          case "upgraded":
            ring(e.x, e.y, 60, 30, 12, toneOf(e.tone));
            if (!quiet) notes(e.kind === "built" ? [440, 660] : [520, 780, 1040], 60, 0.09);
            break;
          case "sold":
            if (!quiet) notes([660, 440], 60, 0.09);
            break;
          case "nope":
            if (!quiet && e.seat === me) blip(140, 0.12, "square", 0.04);
            break;
          case "wave":
            if (!quiet) notes([330, 330, 440], 120, 0.12);
            break;
          // A game with a market: taps, purchases, and the golden chip.
          case "tap":
            bump = 1;
            if (!quiet && e.seat === me) blip(700 + Math.random() * 120, 0.035, "triangle", 0.03, -250);
            break;
          case "buy":
            if (!quiet) notes([520, 700], 50, 0.07);
            break;
          case "boost":
            if (!quiet) notes([520, 780, 1040], 60, 0.09);
            break;
          case "golden":
            ring(e.x, e.y, 60, 40, 20, "#ffd166");
            if (!quiet) notes([1320, 1760, 2090], 70, 0.1);
            break;
          case "frenzy":
          case "lucky":
            burst(e.x, e.y, 40, "#ffd166", 120, 40);
            ring(e.x, e.y, 100, 80, 24, "#ffd166");
            flash = Math.max(flash, 0.35);
            if (!quiet) notes([660, 880, 1100, 1320, 1760], 60, 0.12);
            break;
          case "cashout":
            burst(e.x, e.y, 80, "#b08cff", 150, 60);
            flash = 0.8;
            if (!quiet) notes([523, 659, 784, 1046, 1318, 1568], 80, 0.16);
            break;
          case "send":
          case "pay":
          case "interest":
            if (!quiet) blip(990, 0.08, "triangle", 0.04);
            break;
        }
        // Someone else's refusal is theirs to read.
        if (e.kind === "nope" && e.seat !== me) continue;
        if (e.text && words.length < 40 && e.kind !== "boom") {
          const big = e.kind === "perfect" || e.kind === "extend" || e.kind === "medal-lost";
          const colour = e.kind === "medal" || e.kind === "pop" || e.kind === "sold" || e.kind === "pay" || e.kind === "interest" || e.kind === "send" ? "#ffd166" : e.kind === "medal-lost" || e.kind === "leak" || e.kind === "nope" ? "#ff8a8a" : "#ffffff";
          const slow = big || e.kind === "pay" || e.kind === "interest" || e.kind === "send" || e.kind === "nope" || e.kind === "frenzy" || e.kind === "lucky" || e.kind === "cashout";
          words.push({ x: e.x, y: e.y, text: says(e.text), life: slow ? 110 : 46, max: slow ? 110 : 46, big, colour });
        }
      }
    },
    settle() {
      sparks = sparks.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        if (p.kind === "fire") p.vy -= 1.2;
        else if (p.kind === "smoke") p.vy -= 0.35;
        return --p.life > 0;
      });
      rings = rings.filter((r) => {
        r.r += r.grow;
        return --r.life > 0;
      });
      words = words.filter((w) => --w.life > 0);
      beams = beams.filter((b) => --b.life > 0);
      shake *= 0.86;
      flash *= 0.86;
      bump *= 0.8;
    },
    drawOverlay(view, frame, project) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // How much is left of anything that has been hurt, over its head.
      for (const t of view.things) {
        if (t.health === undefined || t.health >= 1000) continue;
        const foe = t.kind.startsWith("foe:");
        if ((!foe && !t.kind.startsWith("creep:")) || t.kind.endsWith(":boss")) continue;
        const [x, y] = project(t.x, t.y - (foe ? t.r : 0), foe ? 300 : t.kind === "creep:flyer" ? 900 : t.r * 3);
        const w = Math.max(170, t.r * 1.7);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(x - w / 2 - 6, y - 76, w + 12, 44);
        ctx.fillStyle = t.health > 500 ? "#5ee6a0" : t.health > 250 ? "#ffd166" : "#ff5a6e";
        ctx.fillRect(x - w / 2, y - 70, (w * t.health) / 1000, 32);
      }
      sayWords((x, y) => project(x, y, 300));
      ctx.globalAlpha = 1;
      hud(view, frame);
    },
    draw(view, frame, pointer) {
      const W = canvas.width;
      const H = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const sway = lookMotion();
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#05060f");
      sky.addColorStop(0.6, "#0a1024");
      sky.addColorStop(1, "#141a3a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const sx = sway === 0 ? 0 : (Math.random() - 0.5) * shake * dpr * sway;
      const sy = sway === 0 ? 0 : (Math.random() - 0.5) * shake * dpr * sway;
      ctx.setTransform(scale, 0, 0, scale, sx, sy);

      const build = view.build;
      if (build) {
        ctx.setTransform(1, 0, 0, 1, sx, sy);
        ctx.drawImage(groundFor(build), 0, 0);
        ctx.setTransform(scale, 0, 0, scale, sx, sy);
        if (pointer?.cell) {
          const [col, row] = pointer.cell;
          const x = col * build.cell + build.cell / 2;
          const y = row * build.cell + build.cell / 2;
          const colour = pointer.open === false ? "#ff5a6e" : toneOf(pointer.tone);
          if (pointer.range) {
            ctx.beginPath();
            ctx.arc(x, y, pointer.range, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.07)";
            ctx.fill();
            ctx.strokeStyle = colour;
            ctx.lineWidth = 22;
            ctx.setLineDash([70, 70]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.strokeStyle = colour;
          ctx.lineWidth = 34;
          ctx.strokeRect(col * build.cell + 30, row * build.cell + 30, build.cell - 60, build.cell - 60);
        }
      } else if (view.market) {
        // A card table's felt under the chip.
        const felt = ctx.createRadialGradient(FW / 2, FH / 2, 200, FW / 2, FH / 2, FW * 0.7);
        felt.addColorStop(0, "#2b6a50");
        felt.addColorStop(1, "#143628");
        ctx.fillStyle = felt;
        ctx.fillRect(0, 0, FW, FH);
      } else {
        for (const st of stars) {
          ctx.globalAlpha = 0.25 + st.z * 0.2;
          ctx.fillStyle = st.z === 3 ? "#cfe6ff" : "#8fa3d6";
          const size = 8 + st.z * 7;
          ctx.fillRect(st.x, (st.y + (frozen() ? 0 : frame * st.z * 9)) % FH, size, size * (1 + st.z));
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const t of view.things) {
        const colour = toneOf(t.tone);
        if (t.kind === "bullet") {
          const r = t.r * 2.1;
          ctx.drawImage(stamp(colour, false), t.x - r, t.y - r, r * 2, r * 2);
        } else if (t.kind === "shot") {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = colour;
          ctx.fillRect(t.x - 22, t.y - 60, 44, 230);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(t.x - 9, t.y - 60, 18, 170);
          ctx.globalAlpha = 1;
        } else if (t.kind === "ship") {
          if (t.ghost && frame % 6 < 3) ctx.globalAlpha = 0.35;
          ctx.fillStyle = frame % 4 < 2 ? "#ffd166" : "#ff8a3d";
          path([[-0.16, 0.9], [0.16, 0.9], [0, 1.25 + (frame % 5) * 0.09]], t.x, t.y, t.r);
          ctx.fill();
          solid(SHIP, t.x, t.y, t.r, colour);
          // The only part that can be hit.
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "#ffffff";
          ctx.shadowBlur = 14 * dpr;
          ctx.beginPath();
          ctx.arc(t.x, t.y, (t.core ?? 40) * (1.5 + 0.25 * Math.sin(frame / 5)), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        } else if (t.kind === "blast") {
          ctx.globalAlpha = Math.max(0, 0.5 - t.r / 20000);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 260;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (t.kind.startsWith("drop:")) {
          const bob = frozen() ? 0 : Math.sin(frame / 8 + t.id) * 20;
          ctx.drawImage(stamp(colour, true), t.x - 260, t.y - 260 + bob, 520, 520);
          ctx.fillStyle = "#0b1020";
          ctx.font = `700 190px ${FONT}`;
          ctx.fillText(t.kind === "drop:medal" ? "★" : t.kind === "drop:power" ? "P" : t.kind === "drop:bomb" ? "B" : "?", t.x, t.y + bob + 8);
        } else if (t.kind.startsWith("foe:")) {
          const kind = t.kind.slice(4);
          if (kind === "drone") solid(DRONE, t.x, t.y, t.r, colour);
          else if (kind === "dart") solid(DART, t.x, t.y, t.r, colour, t.angle === undefined ? Math.PI / 2 : (t.angle / 18000) * Math.PI);
          else if (kind === "gunship") {
            solid(HEX, t.x, t.y, t.r, colour, Math.PI / 6);
            solid(HEX, t.x, t.y, t.r * 0.45, colour);
          } else if (kind === "spinner") {
            solid(STAR, t.x, t.y, t.r, colour, frame / 14);
            solid(HEX, t.x, t.y, t.r * 0.35, "#ffffff");
          } else if (kind === "carrier") {
            solid(CARRIER, t.x, t.y, t.r, colour);
            solid(HEX, t.x - t.r * 0.55, t.y, t.r * 0.22, "#ff9f43");
            solid(HEX, t.x + t.r * 0.55, t.y, t.r * 0.22, "#ff9f43");
          } else if (kind === "boss") {
            solid(BOSS, t.x, t.y, t.r, colour);
            solid(STAR, t.x, t.y, t.r * 0.38, "#ffd166", -frame / 20);
          } else solid(HEX, t.x, t.y, t.r, colour); // a kind this screen hasn't been taught yet
          if (t.health !== undefined && kind !== "boss" && t.health < 1000) {
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.fillRect(t.x - t.r, t.y - t.r - 110, t.r * 2, 36);
            ctx.fillStyle = colour;
            ctx.fillRect(t.x - t.r, t.y - t.r - 110, (t.r * 2 * t.health) / 1000, 36);
          }
        } else if (t.kind === "chip" || t.kind === "golden") {
          const big = t.kind === "chip";
          const r = big ? t.r * (1 - bump * 0.06) : t.r * (1 + (frozen() ? 0 : Math.sin(frame / 6) * 0.06));
          const face = big ? colour : "#ffd166";
          const edge = big ? "#fbf6ec" : "#fff3c4";
          if (big && t.health) {
            // Heat: a glow round the chip that grows with it.
            ctx.globalAlpha = (t.health / 1000) * 0.55;
            ctx.drawImage(stamp("#ff5a6e", false), t.x - r * 1.6, t.y - r * 1.6, r * 3.2, r * 3.2);
            ctx.globalAlpha = 1;
          }
          if (!big) ctx.drawImage(stamp("#ffd166", false), t.x - r * 2, t.y - r * 2, r * 4, r * 4);
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.arc(t.x + r * 0.05, t.y + r * 0.08, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = face;
          ctx.beginPath();
          ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
          ctx.fill();
          // The stripes round a chip's edge.
          ctx.strokeStyle = edge;
          ctx.lineWidth = r * 0.16;
          ctx.setLineDash([r * 0.3, (r * 2 * Math.PI * 0.92) / 8 - r * 0.3]);
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.92, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = r * 0.04;
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.68, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = edge;
          ctx.font = `700 ${r * 0.7}px Georgia, 'Times New Roman', serif`;
          ctx.fillText(big ? "♠\uFE0E" : "★", t.x, t.y + r * 0.04);
          if (!big && t.health !== undefined) {
            // How long it has left.
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 36;
            ctx.beginPath();
            ctx.arc(t.x, t.y, r * 1.25, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * t.health) / 1000);
            ctx.stroke();
          }
        } else if (t.kind.startsWith("tower:")) {
          const kind = t.kind.slice(6);
          const turn = ((t.angle ?? 27000) / 18000) * Math.PI;
          // A stone base, then what stands on it, turned the way it last fired.
          ctx.fillStyle = "#2a3140";
          ctx.strokeStyle = "#0e131c";
          ctx.lineWidth = 16;
          ctx.beginPath();
          ctx.roundRect(t.x - 200, t.y - 200, 400, 400, 60);
          ctx.fill();
          ctx.stroke();
          if (kind === "frost") solid(STAR, t.x, t.y, 165, colour, frame / 40);
          else if (kind === "tesla") {
            solid(HEX, t.x, t.y, 150, colour);
            solid(HEX, t.x, t.y, 60, "#ffffff", frame / 9);
          } else {
            solid(HEX, t.x, t.y, kind === "mortar" ? 150 : 120, colour, Math.PI / 6);
            // The barrel.
            const long = kind === "sniper" ? 230 : kind === "mortar" ? 130 : 170;
            const wide = kind === "mortar" ? 60 : kind === "sniper" ? 22 : 30;
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.rotate(turn);
            ctx.fillStyle = colour;
            ctx.strokeStyle = "#0e131c";
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.roundRect(0, -wide, long, wide * 2, 14);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          // A pip for each level, in the colour of whoever built it.
          ctx.fillStyle = toneOf(TONES_BY_SEAT[(t.seat ?? 0) % TONES_BY_SEAT.length]);
          for (let i = 0; i < (t.level ?? 1); i++) ctx.fillRect(t.x - 160 + i * 70, t.y + 140, 50, 34);
        } else if (t.kind.startsWith("creep:")) {
          const kind = t.kind.slice(6);
          const tint = t.mark === "slowed" ? "#8fe9ff" : colour;
          const bob = frozen() ? 0 : Math.sin(frame / 5 + t.id) * 12;
          if (kind === "flyer") {
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.beginPath();
            ctx.ellipse(t.x + 60, t.y + 150, t.r * 0.8, t.r * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            solid(DART, t.x, t.y + bob, t.r, tint, Math.PI / 2);
          } else if (kind === "brute") solid(HEX, t.x, t.y, t.r, tint, Math.PI / 6);
          else if (kind === "boss") {
            solid(BOSS, t.x, t.y, t.r, tint);
            solid(STAR, t.x, t.y, t.r * 0.35, "#ffd166", frame / 20);
          } else if (kind === "runner") solid(DRONE, t.x, t.y + bob / 2, t.r, tint);
          else {
            ctx.beginPath();
            ctx.arc(t.x, t.y + (kind === "swarm" ? bob / 2 : 0), t.r, 0, Math.PI * 2);
            ctx.fillStyle = "#0b1020";
            ctx.fill();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = tint;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = tint;
            ctx.lineWidth = 22;
            ctx.stroke();
          }
          if (t.health !== undefined && t.health < 1000 && kind !== "boss") {
            const w = Math.max(160, t.r * 1.8);
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(t.x - w / 2, t.y - t.r - 80, w, 32);
            ctx.fillStyle = t.health > 500 ? "#5ee6a0" : t.health > 250 ? "#ffd166" : "#ff5a6e";
            ctx.fillRect(t.x - w / 2, t.y - t.r - 80, (w * t.health) / 1000, 32);
          }
        } else {
          const r = t.r * 1.6;
          ctx.drawImage(stamp(colour, false), t.x - r, t.y - r, r * 2, r * 2);
        }
      }

      for (const b of beams) {
        const left = b.life / b.max;
        ctx.globalAlpha = left;
        ctx.strokeStyle = b.colour;
        ctx.lineCap = "round";
        if (b.kind === "lob") {
          // The shell on its way: a dot along an arc.
          const p = 1 - left;
          const x = b.x + (b.tx - b.x) * p;
          const y = b.y + (b.ty - b.y) * p - Math.sin(p * Math.PI) * 500;
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#1d1a16";
          ctx.beginPath();
          ctx.arc(x, y, 60, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.lineWidth = b.kind === "bolt" ? 26 : 20;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        if (b.kind === "bolt") {
          // Lightning: a few kinks on the way, different every frame.
          for (let i = 1; i < 4; i++) ctx.lineTo(b.x + ((b.tx - b.x) * i) / 4 + (Math.random() - 0.5) * 160, b.y + ((b.ty - b.y) * i) / 4 + (Math.random() - 0.5) * 160);
        }
        ctx.lineTo(b.tx, b.ty);
        ctx.stroke();
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const r of rings) {
        ctx.globalAlpha = r.life / r.max;
        ctx.strokeStyle = r.colour;
        ctx.lineWidth = 40 + 60 * (r.life / r.max);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of sparks) {
        const left = p.life / p.max;
        if (p.kind === "fire" || p.kind === "flash") {
          const age = 1 - left;
          const colour = p.kind === "flash" ? p.colour : age < 0.15 ? "#fff6dc" : age < 0.4 ? "#ffb347" : age < 0.65 ? "#ff6a1a" : "#c43212";
          const r = p.size * (p.kind === "flash" ? left : 0.65 + 0.7 * age);
          ctx.globalAlpha = p.kind === "flash" ? left : Math.min(1, left * 1.5);
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(stamp(colour, false), p.x - r, p.y - r, r * 2, r * 2);
          ctx.globalCompositeOperation = "source-over";
        } else if (p.kind === "smoke") {
          const r = p.size * (0.65 + 1.6 * (1 - left));
          ctx.globalAlpha = 0.42 * Math.pow(left, 1.3);
          ctx.fillStyle = p.colour;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = left;
          ctx.fillStyle = p.colour;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      sayWords();
      ctx.globalAlpha = 1;

      hud(view, frame);
    },
  };
}
