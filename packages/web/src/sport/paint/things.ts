// The things on and round a table: rocks, pots, a sandcastle, gnomes, a wheelbarrow. Each is told
// what it is, where and how big, in world units, and builds itself out of the solid shapes in
// solids.ts, so it shows a top and a front, is lit like everything else and throws a shadow the
// same way. No picture files: a few shapes and gradients each.
//
// What stands up is a `Prop`: something with a footprint on the ground, which is what decides
// whether it is in front of a ball or behind it. What lies flat (a mat, a lily pad, a fish under
// the water) is painted straight onto the ground instead.
import type { SportBlock, SportDecor, SportTone, SportTunnel } from "@journey-to-code/games";
import type { Point, Tunnel } from "@journey-to-code/physics";
import { centreOf, dome, facing, offset, path, placed, rightOf, shadeOf as tint, shadow, trace, turning, type Brush } from "./geometry";
import { ball, bloom, castShadow, clockwise, cone, disc, drum, foliage, hull, mound, pipe, prism, ring, rod, SHADOW, upright, type Paint, type Stage } from "./solids";
import { scatter, textured } from "./textures";

export const TONES: Record<SportTone, [fill: string, shade: string, ink: string]> = {
  white: ["#fdfdf8", "#b9b6aa", "#1d1a16"],
  red: ["#e5382c", "#8f1f18", "#fff"],
  blue: ["#3478ea", "#1c4696", "#fff"],
  gold: ["#f7c81e", "#a57a07", "#1d1a16"],
  green: ["#35b862", "#1c6b3a", "#fff"],
  purple: ["#9a55dc", "#57298e", "#fff"],
  orange: ["#fa8a28", "#a95208", "#1d1a16"],
  pink: ["#f67fb4", "#a93a70", "#1d1a16"],
  maroon: ["#8e2a38", "#4d0f1a", "#fff"],
  black: ["#2a2622", "#000", "#fff"],
};

const circle = (b: Brush, x: number, y: number, r: number, fill: string) => {
  b.ctx.fillStyle = fill;
  b.ctx.beginPath();
  b.ctx.arc(x, y, r, 0, Math.PI * 2);
  b.ctx.fill();
};
const oval = (b: Brush, x: number, y: number, rx: number, ry: number, fill: string, turn = 0) => {
  b.ctx.fillStyle = fill;
  b.ctx.beginPath();
  b.ctx.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2);
  b.ctx.fill();
};
const outline = (b: Brush, width: number, colour = "rgba(30, 18, 8, 0.55)") => {
  b.ctx.lineWidth = width;
  b.ctx.strokeStyle = colour;
  b.ctx.stroke();
};

/** A thin lit and shaded edge just inside a flat-topped shape: what makes a board look sawn and not printed. */
function bevel(b: Brush, points: Point[], width: number) {
  const { ctx } = b;
  const inward = turning(points) > 0 ? 1 : -1;
  const inner = offset(points, true, inward * width);
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    const n = rightOf(p, q);
    ctx.beginPath();
    trace(ctx, { points: [p, q, inner[(i + 1) % points.length]!, inner[i]!] });
    ctx.fillStyle = tint(facing(b, -n[0] * inward, -n[1] * inward) * 0.4);
    ctx.fill();
  });
}

// ---- What lies flat --------------------------------------------------------------------------------

/** Scenery that lies on the ground or in the water: it is painted on the ground, and nothing can be behind it. */
export const liesFlat = (d: SportDecor) => d.kind === "tee" || d.kind === "doormat" || d.kind === "steppingstone" || d.kind === "lilypad" || d.kind === "fish" || d.kind === "shell" || d.kind === "spade" || d.kind === "plank" || d.kind === "flag";

/** Paints a flat thing on the ground. The brush draws in the camera's frame, so a round mat comes out as the ellipse it is seen as. */
export function drawFlat(b: Brush, d: SportDecor) {
  const { ctx } = b;
  const r = d.r ?? 350;
  const rand = scatter(Math.round(d.x * 13 + d.y * 7));
  const tone = TONES[d.tone ?? "red"];
  const tall = 60;
  const at = (draw: (b: Brush) => void) => placed(b, d.x, d.y, d.angle ?? 0, draw);

  switch (d.kind) {
    case "tee":
      // A rubber mat with a worn middle and two markers.
      at((b) => {
        const { ctx } = b;
        ctx.beginPath();
        ctx.roundRect(-430, -720, 860, 1440, 120);
        ctx.fillStyle = "#1f3b2a";
        ctx.fill();
        ctx.fillStyle = textured(ctx, "felt", b.px);
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
        outline(b, 1.5 * b.px, "rgba(8, 24, 14, 0.7)");
        ctx.beginPath();
        ctx.roundRect(-360, -650, 720, 1300, 80);
        outline(b, 1 * b.px, "rgba(255, 255, 255, 0.22)");
        oval(b, 0, 0, 230, 330, "rgba(130, 170, 120, 0.3)");
        for (const y of [-560, 560]) {
          shadow(b, 90, () => ctx.arc(0, y, 75, 0, Math.PI * 2), 0.4);
          dome(b, 0, y, 75, "#f4f1e6", 0.6, 0.3);
        }
      });
      break;

    case "doormat":
      at((b) => {
        const { ctx } = b;
        shadow(b, 60, () => ctx.roundRect(-800, -480, 1600, 960, 60), 0.3);
        ctx.beginPath();
        ctx.roundRect(-800, -480, 1600, 960, 60);
        ctx.fillStyle = "#9a6a3a";
        ctx.fill();
        // Coir: short bristles.
        ctx.save();
        ctx.clip();
        for (let i = 0; i < 260; i++) {
          const x = (rand() - 0.5) * 1600;
          const y = (rand() - 0.5) * 960;
          ctx.strokeStyle = rand() > 0.5 ? "rgba(214, 170, 110, 0.6)" : "rgba(90, 54, 22, 0.5)";
          ctx.lineWidth = 1 * b.px;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rand() - 0.5) * 60, y + 70);
          ctx.stroke();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.roundRect(-690, -370, 1380, 740, 40);
        outline(b, 2.2 * b.px, "rgba(60, 34, 12, 0.75)");
        ctx.beginPath();
        ctx.roundRect(-800, -480, 1600, 960, 60);
        outline(b, 1.2 * b.px);
      });
      break;

    case "steppingstone": {
      const points = Array.from({ length: 9 }, (_, i): Point => {
        const a = (i / 9) * Math.PI * 2;
        const k = r * (0.82 + rand() * 0.24);
        return [d.x + Math.cos(a) * k, d.y + Math.sin(a) * k * 0.85];
      });
      shadow(b, 90, () => trace(ctx, { points }), 0.3);
      path(ctx, { points });
      ctx.fillStyle = textured(ctx, "stone", b.px);
      ctx.fill();
      bevel(b, points, r * 0.16);
      path(ctx, { points });
      outline(b, 1 * b.px, "rgba(30, 30, 24, 0.5)");
      break;
    }

    case "lilypad":
      at((b) => {
        const { ctx } = b;
        const leaf = () => {
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r, 0.28, Math.PI * 2 - 0.28);
          ctx.closePath();
        };
        // On the water its shadow is on the bottom of the pond: further off, and fainter.
        shadow(b, 260, leaf, 0.2);
        ctx.beginPath();
        leaf();
        ctx.fillStyle = "#3f9f4c";
        ctx.fill();
        const g = ctx.createRadialGradient(-b.light[0] * r * 0.4, -b.light[1] * r * 0.4, r * 0.1, 0, 0, r);
        g.addColorStop(0, "rgba(200, 240, 140, 0.5)");
        g.addColorStop(1, "rgba(10, 70, 30, 0.35)");
        ctx.fillStyle = g;
        ctx.fill();
        outline(b, 1 * b.px, "rgba(16, 70, 34, 0.7)");
        ctx.strokeStyle = "rgba(20, 90, 40, 0.5)";
        ctx.lineWidth = 0.8 * b.px;
        ctx.beginPath();
        for (let i = 1; i < 8; i++) {
          const a = 0.28 + (i / 8) * (Math.PI * 2 - 0.56);
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        }
        ctx.stroke();
        if (d.tone) {
          // A water lily: two rings of petals round a yellow heart.
          const petal = TONES[d.tone][0];
          for (const [ring, size] of [[0.42, 0.2], [0.24, 0.17]] as const) {
            for (let i = 0; i < 7; i++) {
              const a = (i / 7) * Math.PI * 2 + ring * 4;
              oval(b, -r * 0.25 + Math.cos(a) * r * ring, r * 0.2 + Math.sin(a) * r * ring, r * size, r * size * 0.55, petal, a);
            }
          }
          ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
          circle(b, -r * 0.25, r * 0.2, r * 0.12, "#f7c81e");
        }
      });
      break;

    case "fish":
      // A koi under the surface: a soft shape, mostly colour.
      at((b) => {
        const { ctx } = b;
        ctx.globalAlpha = 0.8;
        oval(b, 60, 70, 300, 95, "rgba(6, 40, 80, 0.3)");
        ctx.fillStyle = tone[0];
        ctx.beginPath();
        ctx.moveTo(320, 0);
        ctx.bezierCurveTo(200, -150, -100, -110, -250, 0);
        ctx.bezierCurveTo(-100, 110, 200, 150, 320, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-220, 0);
        ctx.quadraticCurveTo(-380, -60, -470, -170);
        ctx.quadraticCurveTo(-400, 0, -470, 170);
        ctx.quadraticCurveTo(-380, 60, -220, 0);
        ctx.fill();
        oval(b, 40, -20, 110, 70, "rgba(255, 255, 255, 0.75)", 0.3);
        oval(b, -110, 30, 60, 40, "rgba(240, 90, 40, 0.8)");
        circle(b, 240, -40, 18, "#1d1a16");
        circle(b, 240, 40, 18, "#1d1a16");
        ctx.globalAlpha = 1;
      });
      break;

    case "shell":
      at((b) => {
        const { ctx } = b;
        shadow(b, 60, () => ctx.arc(0, 0, 170, 0, Math.PI * 2), 0.3);
        ctx.fillStyle = "#fbe9d2";
        ctx.beginPath();
        ctx.moveTo(-150, 60);
        ctx.quadraticCurveTo(-190, -170, 0, -180);
        ctx.quadraticCurveTo(190, -170, 150, 60);
        ctx.quadraticCurveTo(0, 150, -150, 60);
        ctx.fill();
        outline(b, 0.8 * b.px, "rgba(150, 100, 70, 0.7)");
        ctx.strokeStyle = "rgba(214, 140, 110, 0.8)";
        ctx.beginPath();
        for (const x of [-100, -50, 0, 50, 100]) {
          ctx.moveTo(0, 90);
          ctx.lineTo(x * 1.2, -140 + Math.abs(x) * 0.5);
        }
        ctx.stroke();
      });
      break;

    case "spade":
      at((b) => {
        const { ctx } = b;
        shadow(b, tall, () => ctx.roundRect(-600, -150, 1200, 300, 100), 0.3);
        ctx.strokeStyle = "#f4d58a";
        ctx.lineWidth = 80;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-560, 0);
        ctx.lineTo(180, 0);
        ctx.stroke();
        ctx.fillStyle = tone[0];
        ctx.beginPath();
        ctx.roundRect(-660, -110, 200, 220, 70);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(150, -170);
        ctx.lineTo(480, -170);
        ctx.quadraticCurveTo(680, 0, 480, 170);
        ctx.lineTo(150, 170);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(190, -130, 250, 70);
        outline(b, 1 * b.px);
      });
      break;

    default:
      break;
  }
}

// ---- Holes in the ground ---------------------------------------------------------------------------

/** A brush that also knows how far towards the camera the bottom of a hole is seen, for each unit it is deep. */
export type GroundBrush = Brush & { sink: number };

/**
 * A round hole: the wall on the far side, which is all of the wall the camera can see, and what
 * can be seen of the bottom. `wall` is the wall's colour and `lip` a line round the rim.
 */
function pit(b: GroundBrush, x: number, y: number, r: number, depth: number, wall: string, lip: string | null) {
  const { ctx } = b;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = wall;
  ctx.fill();
  // The wall goes round: the side the light gets into is paler, and it is darker the deeper it goes.
  const across = ctx.createLinearGradient(x - r, y, x + r, y);
  across.addColorStop(0, "rgba(0, 0, 0, 0.6)");
  across.addColorStop(0.55, "rgba(0, 0, 0, 0.3)");
  across.addColorStop(1, "rgba(255, 255, 255, 0.12)");
  ctx.fillStyle = across;
  ctx.fill();
  const down = ctx.createLinearGradient(x, y - r, x, y + r);
  down.addColorStop(0, "rgba(0, 0, 0, 0)");
  down.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = down;
  ctx.fill();
  ctx.clip();
  // The bottom, seen through the mouth: nearer the camera than the rim by as much as it is deep.
  circle(b, x, y + depth * b.sink, r * 0.98, "#070605");
  ctx.restore();
  if (lip) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.6 * b.px;
    ctx.strokeStyle = lip;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r + 1.2 * b.px, 0, Math.PI * 2);
    ctx.lineWidth = 1 * b.px;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.stroke();
  }
}

/** How deep a cup is, for the ball that drops into it. */
export const CUP_DEPTH = 330;

export function drawCup(b: GroundBrush, x: number, y: number, r: number, kind: "cup" | "pocket") {
  const { ctx } = b;
  if (kind === "cup") {
    // The turf dips a little towards the lip.
    const dip = ctx.createRadialGradient(x, y, r, x, y, r * 1.7);
    dip.addColorStop(0, "rgba(0, 30, 10, 0.3)");
    dip.addColorStop(1, "rgba(0, 30, 10, 0)");
    ctx.fillStyle = dip;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  pit(b, x, y, r, CUP_DEPTH, kind === "cup" ? "#d9d5c8" : "#3a2a1c", kind === "cup" ? "rgba(255, 255, 255, 0.85)" : null);
}

/** The way into a burrow: a hole in the turf with the earth that came out of it scattered round. */
export function drawBurrow(b: GroundBrush, tunnel: Tunnel) {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    circle(b, tunnel.x + Math.cos(a) * tunnel.r * 1.12, tunnel.y + Math.sin(a) * tunnel.r * 1.12, tunnel.r * (0.2 + (i % 3) * 0.05), i % 2 ? "#5d3d24" : "#7a5434");
  }
  pit(b, tunnel.x, tunnel.y, tunnel.r, 380, "#8a6038", null);
}

// ---- What stands up --------------------------------------------------------------------------------

/**
 * Something standing on the table. Its footprint (in the camera's frame) says what it is in front
 * of and what is in front of it; `box` and `hull` are where it is on the screen, for knowing
 * whether it has to be drawn again over a ball, and whether a ball behind it can still be seen.
 */
export interface Prop {
  foot: Point[];
  box: [x0: number, y0: number, x1: number, y1: number];
  hull: Point[];
  /** Too slight to hide a ball: a few reeds, a clump of flowers. */
  thin: boolean;
  shadow(st: Stage, into: Path2D): void;
  draw(st: Stage): void;
}

interface PropOpts {
  thin?: boolean;
  /** Points on the screen that it reaches beyond its footprint raised to its height: the crown of a tree. */
  reach?: Point[];
  /** How its shadow is cast, when that isn't simply its footprint to its height; false for none. */
  shadow?: false | ((st: Stage, into: Path2D) => void);
}

export function prop(st: Stage, foot: Point[], z0: number, height: number, draw: (st: Stage) => void, opts: PropOpts = {}): Prop {
  const outline = hull([...foot.map((p) => st.at(p[0], p[1], z0)), ...foot.map((p) => st.at(p[0], p[1], z0 + height)), ...(opts.reach ?? [])]);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  return {
    foot,
    hull: outline,
    box: [Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3],
    thin: opts.thin ?? false,
    shadow: opts.shadow === false ? () => {} : (opts.shadow ?? ((st, into) => castShadow(st, into, foot, z0, height))),
    draw,
  };
}

/** Points given round something facing along +x, put where it is and turned the way it faces. */
function facingPoints(x: number, y: number, hundredths: number, local: Point[]): Point[] {
  const a = (hundredths * Math.PI) / 18000;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return local.map(([lx, ly]): Point => [x + lx * c - ly * s, y + lx * s + ly * c]);
}

// ---- Blocks: solid things with a footprint ---------------------------------------------------------

/** A lump of rock: two tiers of leaning faces, the upper one knocked a little askew, so no two are the same. */
function rock(st: Stage, points: Point[], z0: number, height: number, rand: () => number) {
  const [cx, cy] = centreOf(points);
  const size = Math.min(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const stone: Paint = { texture: "rock", zoom: 1.3 };
  const shelf = prism(st, points, z0, z0 + height * 0.58, { side: stone, top: stone, inset: Math.min(size * 0.3, height * 0.24), topShade: 0.08 });
  const [tx, ty] = centreOf(shelf);
  const upper = clockwise(shelf).map(([x, y]): Point => [tx + (x - tx) * (0.8 + rand() * 0.12) + (rand() - 0.5) * size * 0.1, ty + (y - ty) * (0.8 + rand() * 0.12) + (rand() - 0.5) * size * 0.1]);
  const top = prism(st, upper, z0 + height * 0.58, z0 + height, { side: stone, top: stone, inset: Math.min(size * 0.22, height * 0.2), topShade: 0.18, depth: 0.4 });
  // Moss in a hollow or two.
  const [mx, my] = centreOf(top);
  for (let i = 0; i < 2; i++) disc(st, mx + (rand() - 0.5) * size * 0.5, my + (rand() - 0.5) * size * 0.4, z0 + height, size * (0.12 + rand() * 0.08), "rgba(70, 130, 60, 0.5)");
}

/** A pot of flowers: terracotta, wider at the rim, dark soil, and what's growing. */
function pot(st: Stage, x: number, y: number, r: number, z0: number, height: number, rand: () => number, blooms: string[]) {
  const clay: Paint = { texture: "terracotta" };
  drum(st, x, y, r * 0.7, z0, z0 + height * 0.86, clay, null, { r1: r * 0.94 });
  // The rolled rim, and the soil a little way down inside it.
  drum(st, x, y, r, z0 + height * 0.86, z0 + height, clay, clay, { r1: r });
  disc(st, x, y, z0 + height, r * 0.8, "#3d2616");
  foliage(st, x, y, z0 + height + r * 0.3, r * 0.72, rand, ["#2e8a44", "#3da557", "#256f38"]);
  for (let i = 0; i < 5; i++) bloom(st, x + (rand() - 0.5) * r * 1.2, y + rand() * r * 0.3, z0 + height + r * (0.35 + rand() * 0.6), r * 0.17, blooms[i % blooms.length]!);
}

export function blockProp(st: Stage, points: Point[], block: SportBlock, z0: number): Prop {
  const [cx, cy] = centreOf(points);
  const size = Math.min(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const seed = Math.round(cx * 7 + cy * 13);
  const h = block.height;
  if (block.kind === "rock") return prop(st, points, z0, h, (st) => rock(st, points, z0, h, scatter(seed)));
  if (block.kind === "pot" || block.kind === "planter") {
    const r = Math.max(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    return prop(st, points, z0, h + r * 0.9, (st) => pot(st, cx, cy, r, z0, h, scatter(seed), ["#f6d24a", "#f67fb4", "#fdfdf8", "#fa8a28"]), { shadow: (st, into) => castShadow(st, into, points, z0, h + r * 0.5) });
  }
  if (block.kind === "castle") {
    return prop(st, points, z0, h * 1.5, (st) => {
      const sand: Paint = { texture: "castle" };
      const top = prism(st, points, z0, z0 + h * 0.55, { side: sand, top: sand, inset: size * 0.12, topShade: 0.1, ink: "rgba(90, 60, 24, 0.55)" });
      // A turret at each corner and a keep in the middle, each a little drum of packed sand: the far ones first.
      const towers = [...top.map(([x, y]) => ({ x, y, r: size * 0.2, h: h * 0.9 })), { x: cx, y: cy, r: size * 0.36, h: h * 1.15 }].sort((a, b) => a.y - b.y);
      for (const t of towers) {
        drum(st, t.x, t.y, t.r, z0 + h * 0.5, z0 + t.h, sand, sand, { ink: "rgba(90, 60, 24, 0.55)", depth: 0.34 });
        disc(st, t.x, t.y, z0 + t.h, t.r * 0.55, "rgba(120, 84, 36, 0.35)");
      }
      // A paper flag on a stick.
      rod(st, [cx, cy, z0 + h * 1.15], [cx, cy, z0 + h * 1.75], 26, "#6b4a2c", null);
      const a = st.at(cx, cy, z0 + h * 1.75);
      const s = size * st.s;
      st.ctx.fillStyle = "#e5382c";
      st.ctx.beginPath();
      st.ctx.moveTo(a[0], a[1]);
      st.ctx.lineTo(a[0] + s * 0.5, a[1] + s * 0.14);
      st.ctx.lineTo(a[0], a[1] + s * 0.3);
      st.ctx.fill();
    }, { shadow: (st, into) => castShadow(st, into, points, z0, h) });
  }
  if (block.kind === "timber" || block.kind === "crate") {
    // A sawn board: grain along its longer side.
    const long = points.reduce<[number, Point, Point]>((best, p, i) => {
      const q = points[(i + 1) % points.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return len > best[0] ? [len, p, q] : best;
    }, [0, points[0]!, points[1]!]);
    const wood: Paint = { texture: "timber", turn: Math.atan2(long[2][1] - long[1][1], (long[2][0] - long[1][0]) * 1) };
    return prop(st, points, z0, h, (st) => prism(st, points, z0, z0 + h, { side: wood, top: wood, topShade: 0.06 }));
  }
  const paint: Paint = { texture: block.kind === "brick" ? "brick" : "stone" };
  return prop(st, points, z0, h, (st) => prism(st, points, z0, z0 + h, { side: paint, top: paint, inset: Math.min(size * 0.16, h * 0.2), topShade: 0.14 }));
}

// ---- Scenery ---------------------------------------------------------------------------------------

/** How high a piece of scenery stands when a view doesn't say. */
const HEIGHTS: Partial<Record<SportDecor["kind"], number>> = { bush: 520, tree: 1500, gnome: 760, flowerpot: 420, wateringcan: 380, wheelbarrow: 520, rock: 420, bucket: 330, bricks: 220, bench: 640, birdbath: 620, hosereel: 520, duck: 300, poolring: 240, flowers: 260, reeds: 620, molehill: 230 };

/** A heap of fresh earth; `open` leaves a hole in the top for a ball to come out of, and `mole` has him looking out of it. */
function molehill(st: Stage, x: number, y: number, z: number, r: number, h: number, mole: boolean, open: boolean) {
  const rand = scatter(Math.round(x * 3 + y * 5));
  // Crumbs thrown out round it.
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const k = r * (0.95 + rand() * 0.35);
    disc(st, x + Math.cos(a) * k, y + Math.sin(a) * k, z, r * (0.05 + rand() * 0.07), i % 2 ? "#5d3d24" : "#7a5434");
  }
  mound(st, x, y, z, r, h, "#6f4a2c", 0.5);
  mound(st, x, y, z, r, h, { texture: "soil" }, 0.45);
  if (mole || open) {
    disc(st, x, y, z + h * 0.92, r * 0.42, "#1a0f08", "rgba(120, 84, 50, 0.7)");
  }
  if (mole) {
    // He is looking out: a velvet head, a pink nose, two paws on the rim.
    ball(st, x, y, z + h + r * 0.12, r * 0.33, "#3b3340", 0.25, 0.4);
    const [hx, hy] = st.at(x, y, z + h + r * 0.12);
    const R = r * st.s;
    const dot = (dx: number, dy: number, size: number, colour: string) => {
      st.ctx.fillStyle = colour;
      st.ctx.beginPath();
      st.ctx.arc(hx + dx * R, hy + dy * R, Math.max(0.7, size * R), 0, Math.PI * 2);
      st.ctx.fill();
    };
    dot(0, 0.2, 0.1, "#f39ab0");
    dot(-0.3, 0.34, 0.11, "#f3b6a0");
    dot(0.3, 0.34, 0.11, "#f3b6a0");
    dot(-0.13, 0.0, 0.04, "#0d0a0d");
    dot(0.13, 0.0, 0.04, "#0d0a0d");
  }
}

/** The props a piece of scenery makes: usually one. What lies flat makes none (see `drawFlat`). */
export function decorProps(st: Stage, d: SportDecor, z0: number): Prop[] {
  if (liesFlat(d)) return [];
  let r = d.r ?? 350;
  const seed = Math.round(d.x * 13 + d.y * 7);
  const tone = TONES[d.tone ?? "red"];
  const tall = d.height ?? HEIGHTS[d.kind] ?? 300;
  const angle = d.angle ?? 0;
  const turn = (angle * Math.PI) / 18000;
  // The way it faces, along the ground.
  const fx = Math.cos(turn);
  const fy = Math.sin(turn);
  const { x, y } = d;
  const local = (points: Point[]) => facingPoints(x, y, angle, points);

  switch (d.kind) {
    case "molehill":
      return [prop(st, ring(x, y, r), z0, tall * (r / 480), (st) => molehill(st, x, y, z0, r, tall * (r / 480), d.tone === "black", false))];

    case "bush":
      return [prop(st, ring(x, y, r * 0.8), z0, tall, (st) => foliage(st, x, y, z0 + r * 0.42, r, scatter(seed), ["#2c7a41", "#236636", "#34894a"]), { reach: ring(0, 0, r * 1.05 * st.s).map(([px, py]): Point => [st.at(x, y, z0 + r * 0.42)[0] + px, st.at(x, y, z0 + r * 0.42)[1] + py]) })];

    case "tree": {
      // A round little tree: a trunk, and a crown heaped on top of it.
      // Its crown is drawn smaller than its spread on the plan: seen from the side it would hang over half the green.
      const spread = r;
      r *= 0.72;
      const trunk = tall * 0.5;
      const crown = z0 + trunk + r * 0.45;
      const [cx, cy] = st.at(x, y, crown);
      return [
        prop(
          st,
          ring(x, y, r * 0.16, 8),
          z0,
          trunk,
          (st) => {
            const rand = scatter(seed);
            drum(st, x, y, r * 0.15, z0, z0 + trunk + r * 0.2, "#6b4a2c", null, { r1: r * 0.11 });
            foliage(st, x, y, crown, r, rand, ["#2f7f3c", "#1f6131", "#3c9647", "#286f36"]);
            foliage(st, x - r * 0.12, y, crown + r * 0.3, r * 0.55, rand, ["#43a04e", "#4fb059", "#3a9446"]);
            for (let i = 0; i < 4; i++) ball(st, x + (rand() - 0.5) * r * 1.2, y + r * 0.5, crown + (rand() - 0.6) * r * 0.9, r * 0.05, i % 2 ? "#d8362a" : "#e9502e");
          },
          { reach: ring(cx, cy, r * 1.1 * st.s), shadow: (st, into) => castShadow(st, into, ring(x, y, spread * 0.7), z0, r * 0.6, trunk * 0.6) },
        ),
      ];
    }

    case "flowers": {
      // A clump: leaves low down, then a handful of blooms on their stalks.
      const petal = TONES[d.tone ?? "gold"][0];
      return [
        prop(
          st,
          ring(x, y, 380, 8),
          z0,
          tall,
          (st) => {
            const rand = scatter(seed);
            for (let i = 0; i < 9; i++) disc(st, x + (rand() - 0.5) * 760, y + (rand() - 0.5) * 700, z0 + 20, 110, i % 2 ? "#2e8a44" : "#3da557");
            const stalks = Array.from({ length: 7 }, (_, i) => ({ x: x + (rand() - 0.5) * 720, y: y + (rand() - 0.5) * 660, h: tall * (0.55 + rand() * 0.45), i })).sort((a, b) => a.y - b.y);
            for (const s of stalks) {
              rod(st, [s.x, s.y, z0], [s.x, s.y, z0 + s.h], 22, "#2f7a3c", null);
              bloom(st, s.x, s.y, z0 + s.h, Math.max(105, 3 / st.s), s.i % 3 === 2 ? "#fdfdf8" : petal);
            }
          },
          { thin: true, shadow: (st, into) => castShadow(st, into, ring(x, y, 300, 8), z0, tall * 0.4) },
        ),
      ];
    }

    case "rock": {
      const rand = scatter(seed);
      const points = Array.from({ length: 7 }, (_, i): Point => {
        const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
        const k = r * (0.8 + rand() * 0.3);
        return [x + Math.cos(a) * k, y + Math.sin(a) * k * 0.82];
      });
      return [prop(st, points, z0, tall, (st) => rock(st, points, z0, tall, scatter(seed + 1)))];
    }

    case "gnome":
      // A coat, a white beard, a nose, and a pointed hat a size too big, leaning back.
      return [
        prop(st, ring(x, y, 250, 10), z0, tall, (st) => {
          const coat = TONES[d.tone === "blue" ? "red" : "blue"][0];
          const away = fy < -0.25;
          disc(st, x + fx * 150 - fy * 110, y + fy * 150 + fx * 110, z0 + 12, 105, "#3a2a1c");
          disc(st, x + fx * 150 + fy * 110, y + fy * 150 - fx * 110, z0 + 12, 105, "#3a2a1c");
          drum(st, x, y, 240, z0 + 20, z0 + 330, coat, coat, { r1: 180 });
          const head = z0 + 420;
          if (away) ball(st, x, y, head, 150, "#f1c7a0", 0, 0.3, "rgba(60, 30, 10, 0.5)");
          else {
            ball(st, x, y, head, 150, "#f1c7a0", 0, 0.3, "rgba(60, 30, 10, 0.5)");
            // The beard hangs from the face, on the side he is looking.
            const [bx, by] = st.at(x + fx * 110, y + fy * 110, head - 90);
            st.ctx.fillStyle = "#f8f6ee";
            st.ctx.beginPath();
            st.ctx.ellipse(bx, by, 125 * st.s, 150 * st.s, 0, 0, Math.PI * 2);
            st.ctx.fill();
            st.ctx.lineWidth = 0.8;
            st.ctx.strokeStyle = "rgba(90, 80, 70, 0.6)";
            st.ctx.stroke();
            ball(st, x + fx * 150, y + fy * 150, head + 10, 48, "#eda07c");
            const [ex, ey] = st.at(x + fx * 120, y + fy * 120, head + 70);
            st.ctx.fillStyle = "#1d1a16";
            for (const side of [-1, 1]) {
              st.ctx.beginPath();
              st.ctx.arc(ex - fy * side * 52 * st.s, ey + fx * side * 52 * st.s * st.k, Math.max(0.7, 16 * st.s), 0, Math.PI * 2);
              st.ctx.fill();
            }
          }
          cone(st, x, y, 175, head + 60, z0 + tall + 120, tone[0], [-fx * 90, -fy * 90]);
        }),
      ];

    case "flowerpot":
      return [prop(st, ring(x, y, r), z0, tall + r * 0.9, (st) => pot(st, x, y, r, z0, tall, scatter(seed), [tone[0], tone[0], "#fdfdf8"]), { shadow: (st, into) => castShadow(st, into, ring(x, y, r * 0.9), z0, tall + r * 0.4) })];

    case "wateringcan":
      return [
        prop(st, ring(x, y, 330, 10), z0, tall, (st) => {
          // Whichever of the spout and the handle is further from the camera goes on first.
          const spout = () => {
            rod(st, [x + fx * 250, y + fy * 250, z0 + 110], [x + fx * 700, y + fy * 700, z0 + tall + 60], 80, "#4f8f86");
            ball(st, x + fx * 740, y + fy * 740, z0 + tall + 90, 105, "#6fb3a8", 0.3, 0.4, "rgba(20, 50, 46, 0.6)");
          };
          const handle = () => {
            rod(st, [x - fx * 280, y - fy * 280, z0 + 90], [x - fx * 520, y - fy * 520, z0 + 240], 55, "#3d756d");
            rod(st, [x - fx * 520, y - fy * 520, z0 + 240], [x - fx * 250, y - fy * 250, z0 + tall - 30], 55, "#3d756d");
          };
          (fy < 0 ? spout : handle)();
          drum(st, x, y, 320, z0, z0 + tall, "#5fa79c", "#3d756d", { ink: "rgba(20, 50, 46, 0.7)" });
          disc(st, x, y, z0 + tall, 245, "#1f5a70");
          (fy < 0 ? handle : spout)();
        }, { reach: [st.at(x + fx * 800, y + fy * 800, z0 + tall + 180), st.at(x - fx * 560, y - fy * 560, z0 + 240)] }),
      ];

    case "wheelbarrow": {
      const tray = local([[-560, -400], [520, -300], [640, 0], [520, 300], [-560, 400]]);
      return [
        prop(st, tray, z0, tall, (st) => {
          const wheel = () => {
            // Seen from the side it is a disc; end on, the width of its tyre.
            rod(st, [x + fx * 760, y + fy * 760, z0 + 60], [x + fx * 760, y + fy * 760, z0 + 280], 110, "#26221e", null);
            upright(st, x + fx * 760, y + fy * 760, z0 + 170, 170, -fy, fx, "#26221e");
            upright(st, x + fx * 760, y + fy * 760, z0 + 170, 70, -fy, fx, "#8f8a80", null);
          };
          const handles = () => {
            for (const side of [-1, 1]) {
              const [hx, hy] = local([[-500, side * 340]])[0]!;
              const [ex, ey] = local([[-1100, side * 400]])[0]!;
              rod(st, [hx, hy, z0 + 330], [ex, ey, z0 + 430], 60, "#8a5a34");
              rod(st, [hx, hy, z0], [hx, hy, z0 + 260], 50, "#4a4640");
            }
          };
          (fy < 0 ? wheel : handles)();
          prism(st, tray, z0 + 230, z0 + tall, { side: "#3f8f5a", top: "#35794c", inset: -70, ink: "rgba(10, 40, 20, 0.7)" });
          // Soil heaped in the tray, and a trowel stuck in it.
          mound(st, x, y, z0 + tall, 330, 90, { texture: "soil" }, 0.4, null);
          rod(st, [x - 60, y + 40, z0 + tall + 60], [x + 90, y + 40, z0 + tall + 330], 40, "#d8362a", null);
          (fy < 0 ? handles : wheel)();
        }, { reach: [st.at(x + fx * 940, y + fy * 940, z0 + 340), ...local([[-1100, -400], [-1100, 400]]).map((p) => st.at(p[0], p[1], z0 + 430))] }),
      ];
    }

    case "duck": {
      // A bath duck, afloat: it sits on the water, wherever the water is.
      return [
        prop(st, ring(x, y, 250, 10), z0, tall, (st) => {
          const [wx, wy] = st.at(x, y, z0);
          st.ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
          st.ctx.lineWidth = 1.2;
          st.ctx.beginPath();
          st.ctx.ellipse(wx, wy, 340 * st.s, 300 * st.s * st.k, 0, 0, Math.PI * 2);
          st.ctx.stroke();
          const head = () => {
            ball(st, x + fx * 190, y + fy * 190, z0 + 250, 135, "#f9d43a", 0.5, 0.25, "rgba(140, 90, 0, 0.6)");
            if (fy > -0.5) {
              const [bx, by] = st.at(x + fx * 320, y + fy * 320, z0 + 225);
              st.ctx.fillStyle = "#fa8a28";
              st.ctx.beginPath();
              st.ctx.ellipse(bx, by, 75 * st.s, 45 * st.s, 0, 0, Math.PI * 2);
              st.ctx.fill();
              const [ex, ey] = st.at(x + fx * 250, y + fy * 250, z0 + 300);
              st.ctx.fillStyle = "#1d1a16";
              st.ctx.beginPath();
              st.ctx.arc(ex - fy * 60 * st.s, ey, Math.max(0.7, 20 * st.s), 0, Math.PI * 2);
              st.ctx.fill();
            }
          };
          if (fy < 0) head();
          mound(st, x - fx * 40, y - fy * 40, z0, 270, 190, "#f7c81e", 0.3, "rgba(140, 90, 0, 0.7)");
          if (fy >= 0) head();
        }, { thin: true, shadow: (st, into) => castShadow(st, into, ring(x, y, 230, 10), z0 - 120, 120) }),
      ];
    }

    case "reeds":
      return [
        prop(st, ring(x, y, 380, 8), z0, tall, (st) => {
          const rand = scatter(seed);
          const { ctx } = st;
          for (let i = 0; i < 9; i++) {
            const rx = x + (rand() - 0.5) * 800;
            const ry = y + (rand() - 0.5) * 600;
            const lean = (rand() - 0.5) * 300;
            const a = st.at(rx, ry, z0);
            const m = st.at(rx + lean * 0.3, ry, z0 + tall * 0.5);
            const t = st.at(rx + lean, ry, z0 + tall * (0.75 + rand() * 0.25));
            ctx.strokeStyle = i % 2 ? "#3f8a3c" : "#5aa84a";
            ctx.lineWidth = 2.2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.quadraticCurveTo(m[0], m[1], t[0], t[1]);
            ctx.stroke();
            if (i % 3 === 0) {
              ctx.fillStyle = "#6b4426";
              ctx.beginPath();
              ctx.ellipse(t[0], t[1], Math.max(1.4, 55 * st.s), Math.max(3, 150 * st.s), lean / 900, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }, { thin: true, shadow: false }),
      ];

    case "bucket":
      return [
        prop(st, ring(x, y, 290, 10), z0, tall, (st) => {
          drum(st, x, y, 220, z0, z0 + tall, tone[0], tone[1], { r1: 300 });
          disc(st, x, y, z0 + tall - 20, 250, { texture: "sand" });
          // The handle, flopped over the front.
          const [hx, hy] = st.at(x, y, z0 + tall);
          st.ctx.strokeStyle = "#f4f1e6";
          st.ctx.lineWidth = 1.6;
          st.ctx.beginPath();
          st.ctx.ellipse(hx, hy, 300 * st.s, 300 * st.s * (st.k * 0.6 + st.r * 0.6), 0, 0.1, Math.PI - 0.1);
          st.ctx.stroke();
        }),
      ];

    case "bricks": {
      // A little stack left over from building the rails.
      const brick = (cx: number, cy: number, by: number, low: number) => {
        const corners = facingPoints(x, y, angle + by, [[cx - 215, cy - 105], [cx + 215, cy - 105], [cx + 215, cy + 105], [cx - 215, cy + 105]]);
        return { corners, low, y: Math.max(...corners.map((p) => p[1])) };
      };
      const stack = [brick(-220, -115, 0, 0), brick(225, -115, 0, 0), brick(-220, 115, 0, 0), brick(225, 115, 0, 0)].sort((a, b) => a.y - b.y);
      stack.push(brick(40, 20, 2000, 110));
      return [
        prop(st, local([[-450, -230], [450, -230], [450, 230], [-450, 230]]), z0, tall, (st) => {
          for (const b of stack) prism(st, b.corners, z0 + b.low, z0 + b.low + 110, { side: "#b5553c", top: "#c4654a", inset: 14, ink: "rgba(60, 20, 10, 0.6)" });
        }),
      ];
    }

    case "bench": {
      const long = d.length ?? 2400;
      const half = long / 2;
      const seat = local([[-half, -330], [half, -330], [half, 330], [-half, 330]]);
      const wood: Paint = { texture: "timber", turn };
      return [
        prop(st, seat, z0, tall, (st) => {
          // Legs, the slats of the seat, and the rail of the back along whichever long side is `-y` of the way it faces.
          const legs = local([[-half + 120, -260], [half - 120, -260], [-half + 120, 260], [half - 120, 260]]).sort((a, b) => a[1] - b[1]);
          const back = local([[-half, -330], [half, -330], [half, -260], [-half, -260]]);
          const posts = local([[-half + 120, -295], [half - 120, -295]]);
          const backRail = () => {
            for (const p of posts) rod(st, [p[0], p[1], z0 + 300], [p[0], p[1], z0 + tall], 70, "#3b2a1c");
            prism(st, back, z0 + tall - 240, z0 + tall, { side: wood, top: wood, depth: 0.5 });
          };
          const behind = Math.max(...back.map((p) => p[1])) < Math.max(...seat.map((p) => p[1]));
          for (const p of legs) rod(st, [p[0], p[1], z0], [p[0], p[1], z0 + 280], 80, "#3b2a1c");
          if (behind) backRail();
          prism(st, seat, z0 + 280, z0 + 340, { side: wood, top: wood, topShade: 0.05 });
          // The gaps between the slats.
          for (const at of [-110, 110]) {
            const [a, b] = local([[-half, at], [half, at]]);
            const p = st.at(a![0], a![1], z0 + 340);
            const q = st.at(b![0], b![1], z0 + 340);
            st.ctx.beginPath();
            st.ctx.moveTo(p[0], p[1]);
            st.ctx.lineTo(q[0], q[1]);
            st.ctx.lineWidth = 1;
            st.ctx.strokeStyle = "rgba(30, 16, 4, 0.55)";
            st.ctx.stroke();
          }
          if (!behind) backRail();
        }, { shadow: (st, into) => castShadow(st, into, seat, z0, 340) }),
      ];
    }

    case "birdbath":
      return [
        prop(st, ring(x, y, r * 0.5, 10), z0, tall, (st) => {
          const stone: Paint = { texture: "stone" };
          drum(st, x, y, r * 0.42, z0, z0 + 70, stone, stone);
          drum(st, x, y, r * 0.2, z0 + 70, z0 + tall - 150, stone, null, { r1: r * 0.16 });
          drum(st, x, y, r * 0.5, z0 + tall - 150, z0 + tall, stone, stone, { r1: r });
          disc(st, x, y, z0 + tall, r * 0.82, "#2f86b8", "rgba(20, 50, 70, 0.6)");
          disc(st, x - r * 0.2, y - r * 0.15, z0 + tall, r * 0.3, "rgba(200, 240, 250, 0.35)");
          // A sparrow on the rim.
          mound(st, x + r * 0.78, y, z0 + tall, r * 0.17, r * 0.2, "#7a5a3c", 0.3, null);
          ball(st, x + r * 0.9, y, z0 + tall + r * 0.24, r * 0.1, "#5a4028");
        }, { reach: [st.at(x - r, y, z0 + tall), st.at(x + r * 1.05, y, z0 + tall + r * 0.3)], shadow: (st, into) => castShadow(st, into, ring(x, y, r * 0.9, 12), z0, 80, tall - 80) }),
      ];

    case "poolring": {
      // The blown-up wall of a paddling pool, round water that is there already: a fat ring in
      // two colours. The water is the ground's; this is the wall on the far side of it, seen
      // across the water, and the wall on the near side.
      const fat = 330;
      const water = st.land.heightAt(x, y);
      const whole = prop(st, ring(x, y, r + fat, 20), z0, tall, () => {}, { thin: true });
      // For what is in front of what, it is its far wall that counts: whatever floats in it is
      // nearer than that, and a ball beside it is nearer or further than the wall on its side.
      const farWall: Point[] = [...ring(x, y, r + fat, 20).filter((p) => p[1] <= y + 1), ...ring(x, y, r, 20).filter((p) => p[1] <= y + 1).reverse()];
      return [
        prop(st, farWall, z0, tall, (st) => {
          const { ctx } = st;
          const [cx, cy] = st.at(x, y, z0 + tall);
          const [, wy] = st.at(x, y, water);
          const stripes = (radius: number, width: number, from: number, to: number, lift: number) => {
            for (let i = 0; i < 12; i++) {
              const a0 = Math.max(from, (i / 12) * Math.PI * 2);
              const a1 = Math.min(to, ((i + 1) / 12) * Math.PI * 2 + 0.01);
              if (a1 <= a0) continue;
              ctx.beginPath();
              ctx.ellipse(cx, cy + lift, radius * st.s, radius * st.s * st.k, 0, a0, a1);
              ctx.lineWidth = width;
              ctx.lineCap = "butt";
              ctx.strokeStyle = i % 2 ? tone[0] : "#fdfdf8";
              ctx.stroke();
            }
          };
          // The inside of the far wall, from its top down to the water.
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, r * st.s, r * st.s * st.k, 0, 0, Math.PI * 2);
          ctx.clip();
          const inside = Math.max(0, wy - cy);
          for (let lift = inside; lift >= 0; lift -= 1.5) stripes(r, 3, Math.PI, Math.PI * 2, lift);
          if (inside > 1) {
            // In shade: everything above the far waterline.
            ctx.fillStyle = "rgba(0, 20, 40, 0.3)";
            ctx.beginPath();
            ctx.rect(cx - (r + fat) * st.s, cy - r * st.s, 2 * (r + fat) * st.s, r * st.s + inside);
            ctx.ellipse(cx, cy + inside, r * st.s, r * st.s * st.k, 0, 0, Math.PI * 2, true);
            ctx.fill("evenodd");
          }
          ctx.restore();
          // The outside of the near wall, from the ground up.
          const wall = tall * st.r * st.s;
          for (let lift = wall; lift >= 0; lift -= 1.5) stripes(r + fat, 3, 0, Math.PI, lift);
          ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
          ctx.beginPath();
          ctx.ellipse(cx, cy + wall, (r + fat) * st.s, (r + fat) * st.s * st.k, 0, 0, Math.PI);
          ctx.ellipse(cx, cy, (r + fat) * st.s, (r + fat) * st.s * st.k, 0, Math.PI, 0, true);
          ctx.fill();
          // The top of the ring, all the way round, shiny.
          stripes(r + fat / 2, fat * st.s * Math.max(st.k, 0.5), 0, Math.PI * 2, 0);
          for (const [k, colour, width] of [[0.04, "rgba(0, 0, 0, 0.22)", 1.4], [0.96, "rgba(0, 0, 0, 0.26)", 1.4], [0.4, "rgba(255, 255, 255, 0.6)", 1.8]] as const) {
            ctx.beginPath();
            if (k === 0.4) ctx.ellipse(cx, cy, (r + fat * k) * st.s, (r + fat * k) * st.s * st.k, 0, Math.PI * 0.95, Math.PI * 1.75);
            else ctx.ellipse(cx, cy, (r + fat * k) * st.s, (r + fat * k) * st.s * st.k, 0, 0, Math.PI * 2);
            ctx.lineWidth = width;
            ctx.strokeStyle = colour;
            ctx.lineCap = "round";
            ctx.stroke();
          }
        }, { thin: true, reach: whole.hull, shadow: whole.shadow }),
      ];
    }

    case "hosereel": {
      const box = local([[-330, -520], [330, -520], [330, 520], [-330, 520]]);
      const [ax, ay] = local([[0, -330]])[0]!;
      const [bx, by] = local([[0, 330]])[0]!;
      return [
        prop(st, box, z0, tall, (st) => {
          prism(st, box, z0, z0 + 110, { side: "#4b4b48", top: "#5a5a56" });
          // The drum lies across its stand, wound with hose; its near end is a wheel with a handle.
          const [near, far] = ay >= by ? [[ax, ay], [bx, by]] : [[bx, by], [ax, ay]];
          const n: Point = [(near[0]! - far[0]!) / 660, (near[1]! - far[1]!) / 660];
          upright(st, far[0]!, far[1]!, z0 + 310, 250, n[0], n[1], "#3a3a37");
          pipe(st, [far[0]!, far[1]!], [near[0]!, near[1]!], z0 + 310, 200, "#35a257");
          upright(st, near[0]!, near[1]!, z0 + 310, 250, n[0], n[1], "#4b4b48");
          upright(st, near[0]!, near[1]!, z0 + 310, 150, n[0], n[1], "#2f8f4a", "rgba(10, 40, 20, 0.6)");
          ball(st, near[0]! + n[0] * 30, near[1]! + n[1] * 30, z0 + 310, 60, "#d8362a", 0.5, 0.3);
        }),
      ];
    }

    default:
      return [];
  }
}

// ---- Tunnels --------------------------------------------------------------------------------------

/**
 * The end of a pipe: a short length of it lying on the ground with a collar at the lip, and, if
 * the camera can see into it, the dark way in. `into` is the way a ball rolls in (or, for the far
 * end, the opposite of the way it comes out), in hundredths of a degree.
 */
function pipeEnd(st: Stage, x: number, y: number, into: number, mouth: number, paint: Paint, z0: number): Prop {
  // The mouth a ball is caught by is wider than the pipe looks: a pipe that size would stand as high as the rockery.
  const r = mouth * 0.72;
  const a = (into * Math.PI) / 18000;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const lip: Point = [x - dx * r * 0.35, y - dy * r * 0.35];
  const back: Point = [x + dx * r * 0.8, y + dy * r * 0.8];
  const foot: Point[] = [[lip[0] - dy * r, lip[1] + dx * r], [back[0] - dy * r, back[1] + dx * r], [back[0] + dy * r, back[1] - dx * r], [lip[0] + dy * r, lip[1] - dx * r]];
  return prop(st, foot, z0, 2 * r, (st) => {
    const mouth = () => {
      // The collar, and inside it the dark.
      upright(st, lip[0], lip[1], z0 + r, r * 1.14, -dx, -dy, typeof paint === "string" ? paint : "#b5563a");
      upright(st, lip[0], lip[1], z0 + r, r * 0.86, -dx, -dy, "#120c08", null);
    };
    // Looking at the back of it: the mouth is on the far side, so it goes on first and the pipe covers it.
    if (dy > 0) mouth();
    pipe(st, lip, back, z0 + r, r, paint);
    if (dy <= 0) mouth();
  }, { thin: true, shadow: (st, into) => castShadow(st, into, foot, z0, r * 1.6) });
}

/**
 * A tunnel's two ends, and whatever of it shows in between. `over` says how high something
 * standing at a point is (a rail the hose is draped across), or nothing.
 */
export function tunnelProps(st: Stage, tunnel: Tunnel, look: SportTunnel, over: (x: number, y: number) => number): Prop[] {
  const h = (x: number, y: number) => st.land.heightAt(x, y);
  if (look.kind === "burrow") {
    // Out: a molehill with its top open. (In is a hole in the ground: see `drawBurrow`.)
    const [x, y] = tunnel.to;
    const r = tunnel.r * 1.25;
    const z = h(x, y);
    return [prop(st, ring(x, y, r), z, r * 0.5, (st) => molehill(st, x, y, z, r, r * 0.5, false, true), { thin: true })];
  }
  const out = look.out ?? tunnel.to;
  if (look.kind === "hose" && look.path && look.path.length > 1) {
    // The hose lying across the garden: a run of short lengths, each lying on whatever is under
    // it there, so it climbs onto a raised bed and hangs over a rail like a real one.
    const p = look.path;
    const fine: Point[] = [];
    const curve = (a: Point, c: Point, b: Point) => {
      for (let t = 0; t < 1; t += 0.125) fine.push([(1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1]]);
    };
    let from = p[0]!;
    for (let i = 1; i < p.length - 1; i++) {
      const to: Point = [(p[i]![0] + p[i + 1]![0]) / 2, (p[i]![1] + p[i + 1]![1]) / 2];
      curve(from, p[i]!, to);
      from = to;
    }
    fine.push(from, p.at(-1)!);
    const fat = 150;
    const raw = fine.map(([x, y]) => Math.max(h(x, y), over(x, y)) + fat);
    // A hose doesn't turn square corners: it sags from one height to the next.
    const z = raw.map((_, i) => {
      let top = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(raw.length - 1, i + 2); j++) top = Math.max(top, raw[j]! - Math.abs(j - i) * 90);
      return top;
    });
    const lengths: Prop[] = [];
    for (let i = 0; i + 1 < fine.length; i++) {
      const a = fine[i]!;
      const b = fine[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (-(b[1] - a[1]) / len) * fat;
      const ny = ((b[0] - a[0]) / len) * fat;
      const ground = Math.min(h(a[0], a[1]), h(b[0], b[1]));
      lengths.push(
        prop(st, [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], ground, Math.max(z[i]!, z[i + 1]!) + fat - ground, (st) => {
          rod(st, [a[0], a[1], z[i]!], [b[0], b[1], z[i + 1]!], 2 * fat, "#2f9a50", "rgba(14, 60, 28, 0.75)");
        }, { thin: true, shadow: (st, into) => castShadow(st, into, [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], ground, 220) }),
      );
    }
    return [...lengths, pipeEnd(st, tunnel.x, tunnel.y, look.enter, tunnel.r * 0.8, "#e0a21e", h(tunnel.x, tunnel.y)), pipeEnd(st, out[0], out[1], (tunnel.angle + 18000) % 36000, tunnel.r * 0.8, "#e0a21e", h(out[0], out[1]))];
  }
  const clay: Paint = { texture: "terracotta" };
  return [pipeEnd(st, tunnel.x, tunnel.y, look.enter, tunnel.r, clay, h(tunnel.x, tunnel.y)), pipeEnd(st, out[0], out[1], (tunnel.angle + 18000) % 36000, tunnel.r, clay, h(out[0], out[1]))];
}

// ---- Bumpers ---------------------------------------------------------------------------------------

/** A bowling pin: a white body, a neck with two red stripes and a round head, standing on its spot. */
export function drawPin(st: Stage, x: number, y: number, z: number, r: number, height: number) {
  const { ctx } = st;
  const [gx, gy] = st.at(x + SHADOW[0] * height * 0.5, y + SHADOW[1] * height * 0.5, z);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(gx, gy, r * 1.15 * st.s, Math.max(0.01, r * 1.15 * st.s * st.k), 0, 0, Math.PI * 2);
  ctx.fill();
  const cream = "#fbf8ee";
  drum(st, x, y, r * 0.86, z, z + height * 0.36, cream, null, { r1: r, depth: 0.3 });
  drum(st, x, y, r, z + height * 0.36, z + height * 0.74, cream, null, { r1: r * 0.4, depth: 0.3 });
  drum(st, x, y, r * 0.5, z + height * 0.6, z + height * 0.65, "#c4281d", null, { r1: r * 0.46, depth: 0.2 });
  drum(st, x, y, r * 0.44, z + height * 0.68, z + height * 0.72, "#c4281d", null, { r1: r * 0.41, depth: 0.2 });
  mound(st, x, y, z + height * 0.74, r * 0.62, r * 0.56, cream, 0.44, "rgba(60, 50, 40, 0.5)");
}

/** A toadstool: a pale stalk and a red cap with spots, squashed a little when it has just been hit. */
export function drawToadstool(st: Stage, x: number, y: number, z: number, r: number, tone: SportTone, height: number, squash = 0) {
  const { ctx } = st;
  const k = 1 + squash * 0.18;
  const stalk = height * 0.68 * (1 - squash * 0.25);
  // Its shadow on the turf: the cap's, thrown as far as the cap is high.
  const [gx, gy] = st.at(x + SHADOW[0] * stalk, y + SHADOW[1] * stalk, z);
  ctx.fillStyle = "rgba(4, 22, 8, 0.34)";
  ctx.beginPath();
  ctx.ellipse(gx, gy, r * k * st.s, Math.max(0.01, r * k * st.s * st.k), 0, 0, Math.PI * 2);
  ctx.fill();
  drum(st, x, y, r * 0.42, z, z + stalk, "#efe6d0", null, { r1: r * 0.34, depth: 0.3 });
  const cap = r * 0.55 * (1 - squash * 0.2);
  mound(st, x, y, z + stalk, r * k, cap, TONES[tone][0], 0.44, "rgba(60, 10, 6, 0.65)");
  // Spots: on the dome, so the ones near its edge are seen edge on.
  const rand = scatter(Math.round(x + y * 3));
  const [cx, cy] = st.at(x, y, z + stalk);
  const rx = r * k * st.s;
  const up = Math.hypot(cap * st.r, r * k * st.k) * st.s;
  ctx.fillStyle = "rgba(255, 252, 240, 0.92)";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand();
    const d = i === 0 ? 0 : 0.5 + rand() * 0.22;
    const size = r * st.s * (i === 0 ? 0.2 : 0.13 + rand() * 0.05);
    const sx = cx + Math.cos(a) * d * rx;
    const sy = cy - up * (0.62 - 0.5 * d * d) + Math.sin(a) * d * rx * st.k * 0.6;
    ctx.beginPath();
    ctx.ellipse(sx, sy, size, size * (0.55 + 0.3 * (1 - d)), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
