// The things on and round a table: rocks, pots, a sandcastle, gnomes, a wheelbarrow. Each is told
// what it is and how big, in world units, and draws itself as it would look from straight above
// with the light at the top left: a shadow thrown down and to the right, the faces towards the
// light pale and the ones turned away dark. No picture files: a few shapes and gradients each.
import type { SportBlock, SportDecor, SportTone, SportTunnel } from "@cardroom/games";
import type { Point, Tunnel } from "@cardroom/physics";
import { centreOf, dome, facing, offset, path, placed, rightOf, shadeOf, shadow, trace, turning, type Brush } from "./geometry";
import { scatter, textured, type Texture } from "./textures";

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

// ---- Blocks: solid things with a footprint -------------------------------------------------------

/**
 * Something with sloping sides and a flat top, seen from above: the footprint, a smaller copy of
 * it for the top, and between the two a face for each side, pale or dark by which way it looks.
 */
function faceted(b: Brush, points: Point[], slope: number, texture: Texture, opts: { zoom?: number; contrast?: number; top?: number } = {}) {
  const { ctx } = b;
  const inward = turning(points) > 0 ? 1 : -1;
  const top = offset(points, true, inward * slope);
  const fill = textured(ctx, texture, b.px, 0, opts.zoom ?? 1);
  const contrast = opts.contrast ?? 0.42;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    const n = rightOf(p, q);
    ctx.beginPath();
    trace(ctx, { points: [p, q, top[(i + 1) % points.length]!, top[i]!] });
    ctx.fillStyle = fill;
    ctx.fill();
    // The outward face: the opposite way to the inside.
    ctx.fillStyle = shadeOf(facing(b, -n[0] * inward, -n[1] * inward) * contrast - 0.06);
    ctx.fill();
  });
  path(ctx, { points: top });
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = shadeOf(opts.top ?? 0.1);
  ctx.fill();
  // The arris between the faces, and a dark line where the thing meets the ground.
  ctx.lineJoin = "round";
  ctx.lineWidth = 1 * b.px;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.stroke();
  ctx.beginPath();
  points.forEach((p, i) => {
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(top[i]![0], top[i]![1]);
  });
  ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
  ctx.stroke();
  path(ctx, { points });
  outline(b, 1.2 * b.px, "rgba(20, 12, 4, 0.6)");
  return top;
}

export function blockShadow(b: Brush, points: Point[], height: number) {
  shadow(b, height, () => trace(b.ctx, { points }), 0.34);
}

export function drawBlock(b: Brush, points: Point[], block: SportBlock) {
  const { ctx } = b;
  const [cx, cy] = centreOf(points);
  const size = Math.min(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  const rand = scatter(Math.round(cx * 7 + cy * 13));
  if (block.kind === "rock") {
    // Two tiers of faces, the upper one knocked a little askew, so no two rocks are the same lump.
    const top = faceted(b, points, Math.min(size * 0.34, block.height * 0.3), "rock", { zoom: 1.3 });
    const [tx, ty] = centreOf(top);
    const upper = top.map(([x, y]): Point => [tx + (x - tx) * (0.82 + rand() * 0.12) + (rand() - 0.5) * size * 0.1, ty + (y - ty) * (0.82 + rand() * 0.12) + (rand() - 0.5) * size * 0.1]);
    faceted(b, upper, Math.min(size * 0.3, block.height * 0.25), "rock", { zoom: 1.3, top: 0.2, contrast: 0.36 });
    // Moss in a hollow or two.
    for (let i = 0; i < 2; i++) oval(b, tx + (rand() - 0.5) * size * 0.9, ty + (rand() - 0.5) * size * 0.7, size * 0.16, size * 0.1, "rgba(70, 130, 60, 0.5)", rand() * 3);
  } else if (block.kind === "castle") {
    const top = faceted(b, points, size * 0.22, "castle", { top: 0.14 });
    // A keep in the middle and a turret at each corner, each a little drum of packed sand.
    const turret = (x: number, y: number, r: number) => {
      shadow(b, r * 0.9, () => ctx.arc(x, y, r, 0, Math.PI * 2), 0.3);
      circle(b, x, y, r, "#c9a15c");
      ctx.fillStyle = textured(ctx, "castle", b.px);
      ctx.fill();
      dome(b, x, y, r, "rgba(0,0,0,0)", 0, 0.3);
      circle(b, x, y, r * 0.55, "rgba(120, 84, 36, 0.35)");
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      outline(b, 1 * b.px, "rgba(80, 52, 20, 0.6)");
    };
    for (const [x, y] of top) turret(x, y, size * 0.2);
    turret(cx, cy, size * 0.36);
    // A paper flag on a stick.
    ctx.strokeStyle = "#6b4a2c";
    ctx.lineWidth = 1.5 * b.px;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + size * 0.34, cy - size * 0.4);
    ctx.stroke();
    ctx.fillStyle = "#e5382c";
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.34, cy - size * 0.4);
    ctx.lineTo(cx + size * 0.75, cy - size * 0.36);
    ctx.lineTo(cx + size * 0.42, cy - size * 0.16);
    ctx.fill();
  } else if (block.kind === "pot" || block.kind === "planter") {
    // A terracotta pot from above: the rim, the dark soil inside it, and what's growing.
    const r = Math.max(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    path(ctx, { points });
    ctx.fillStyle = textured(ctx, "terracotta", b.px);
    ctx.fill();
    dome(b, cx, cy, r * 0.96, "rgba(0,0,0,0)", 0, 0.35);
    path(ctx, { points });
    outline(b, 1.2 * b.px);
    circle(b, cx, cy, r * 0.72, "#4a2f1c");
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.arc(cx - b.light[0] * r * 0.1, cy - b.light[1] * r * 0.1, r * 0.72, 0, Math.PI * 2);
    ctx.arc(cx + b.light[0] * r * 0.08, cy + b.light[1] * r * 0.08, r * 0.6, 0, Math.PI * 2, true);
    ctx.fill();
    foliage(b, cx, cy, r * 0.62, rand, ["#2e8a44", "#3da557", "#256f38"]);
    for (let i = 0; i < 5; i++) bloom(b, cx + (rand() - 0.5) * r * 0.8, cy + (rand() - 0.5) * r * 0.8, r * 0.15, ["#f6d24a", "#f67fb4", "#fdfdf8", "#fa8a28"][i % 4]!);
  } else if (block.kind === "timber" || block.kind === "crate") {
    // A sawn board: grain along its longer side.
    const long = points.reduce<[number, Point, Point]>((best, p, i) => {
      const q = points[(i + 1) % points.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return len > best[0] ? [len, p, q] : best;
    }, [0, points[0]!, points[1]!]);
    const turn = Math.atan2(long[2][1] - long[1][1], long[2][0] - long[1][0]);
    path(ctx, { points });
    ctx.fillStyle = textured(ctx, "timber", b.px, turn);
    ctx.fill();
    bevel(b, points, Math.min(size * 0.5, 70));
    path(ctx, { points });
    outline(b, 1.2 * b.px);
  } else {
    faceted(b, points, Math.min(size * 0.35, block.height * 0.3), block.kind === "brick" ? "brick" : "stone", { top: 0.16 });
  }
}

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
    ctx.fillStyle = shadeOf(facing(b, -n[0] * inward, -n[1] * inward) * 0.4);
    ctx.fill();
  });
}

// ---- Plants ---------------------------------------------------------------------------------------

function foliage(b: Brush, x: number, y: number, r: number, rand: () => number, greens: string[]) {
  const blobs = 9;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rand();
    const k = i === blobs - 1 ? 0 : 0.5 + rand() * 0.15;
    const bx = x + Math.cos(a) * r * k;
    const by = y + Math.sin(a) * r * k;
    const br = r * (0.42 + rand() * 0.16);
    dome(b, bx, by, br, greens[i % greens.length]!, 0, 0.32);
  }
  // Leaves catching the light.
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const k = rand() * 0.8;
    oval(b, x + Math.cos(a) * r * k - b.light[0] * r * 0.12, y + Math.sin(a) * r * k - b.light[1] * r * 0.12, r * 0.1, r * 0.05, "rgba(190, 240, 150, 0.4)", rand() * 3);
  }
}

function bloom(b: Brush, x: number, y: number, r: number, colour: string) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(b, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, colour);
  }
  circle(b, x, y, r * 0.42, "#8a5a14");
  circle(b, x - b.light[0] * r * 0.1, y - b.light[1] * r * 0.1, r * 0.2, "#f2c230");
}

// ---- Scenery --------------------------------------------------------------------------------------

/** How tall a piece of scenery is, for its shadow; nothing for the ones that lie flat. */
const HEIGHTS: Partial<Record<SportDecor["kind"], number>> = { bush: 500, tree: 1500, gnome: 600, flowerpot: 450, wateringcan: 350, wheelbarrow: 450, rock: 350, bucket: 320, bricks: 200, bench: 450, birdbath: 600, hosereel: 400, duck: 120, poolring: 220, flowers: 120, reeds: 300, spade: 60, molehill: 160 };

/** Scenery that lies on the ground or in the water is drawn before the rails; what stands up, after. */
export const liesFlat = (d: SportDecor) => d.kind === "tee" || d.kind === "doormat" || d.kind === "steppingstone" || d.kind === "lilypad" || d.kind === "fish" || d.kind === "shell" || d.kind === "molehill" || d.kind === "plank";

export function drawDecor(b: Brush, d: SportDecor) {
  const { ctx } = b;
  const r = d.r ?? 350;
  const rand = scatter(Math.round(d.x * 13 + d.y * 7));
  const tone = TONES[d.tone ?? "red"];
  const tall = HEIGHTS[d.kind] ?? 0;
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

    case "molehill":
      molehill(b, d.x, d.y, r, d.tone === "black");
      break;

    case "bush":
      shadow(b, tall, () => ctx.arc(d.x, d.y, r * 0.95, 0, Math.PI * 2), 0.32);
      foliage(b, d.x, d.y, r, rand, ["#2c7a41", "#236636", "#34894a"]);
      break;

    case "tree":
      // The crown from above, thrown shadow and all; a hint of the trunk through the leaves.
      shadow(b, tall, () => ctx.arc(d.x, d.y, r, 0, Math.PI * 2), 0.3);
      foliage(b, d.x, d.y, r, rand, ["#2f7f3c", "#1f6131", "#3c9647", "#286f36"]);
      foliage(b, d.x - b.light[0] * r * 0.15, d.y - b.light[1] * r * 0.15, r * 0.55, rand, ["#43a04e", "#4fb059", "#3a9446"]);
      for (let i = 0; i < 4; i++) circle(b, d.x + (rand() - 0.5) * r * 1.2, d.y + (rand() - 0.5) * r * 1.2, r * 0.045, i % 2 ? "#d8362a" : "#e9502e");
      break;

    case "flowers": {
      // A clump: leaves underneath, then a handful of blooms.
      const petal = TONES[d.tone ?? "gold"][0];
      for (let i = 0; i < 9; i++) oval(b, d.x + (rand() - 0.5) * 760, d.y + (rand() - 0.5) * 760, 150, 60, i % 2 ? "#2e8a44" : "#3da557", rand() * 3);
      for (let i = 0; i < 7; i++) {
        const x = d.x + (rand() - 0.5) * 720;
        const y = d.y + (rand() - 0.5) * 720;
        const size = Math.max(105, 3 * b.px);
        circle(b, x + b.light[0] * 50, y + b.light[1] * 50, size, "rgba(0, 30, 10, 0.3)");
        bloom(b, x, y, size, i % 3 === 2 ? "#fdfdf8" : petal);
      }
      break;
    }

    case "rock": {
      const points = Array.from({ length: 7 }, (_, i): Point => {
        const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
        const k = r * (0.8 + rand() * 0.3);
        return [d.x + Math.cos(a) * k, d.y + Math.sin(a) * k * 0.82];
      });
      blockShadow(b, points, tall);
      drawBlock(b, points, { wall: "", kind: "rock", height: tall * 2 });
      break;
    }

    case "gnome":
      // From above a gnome is mostly hat: a cone with its point leaning back, a beard and a nose
      // poking out in front, and two boots.
      shadow(b, tall, () => ctx.ellipse(d.x, d.y, 330, 300, 0, 0, Math.PI * 2), 0.36);
      at((b) => {
        const { ctx } = b;
        oval(b, 210, -130, 120, 80, "#3a2a1c");
        oval(b, 210, 130, 120, 80, "#3a2a1c");
        dome(b, 0, 0, 300, TONES[d.tone === "blue" ? "red" : "blue"][0], 0, 0.4);
        // Hands.
        circle(b, 90, -290, 70, "#f1c7a0");
        circle(b, 90, 290, 70, "#f1c7a0");
        // Beard, face, nose.
        ctx.fillStyle = "#f8f6ee";
        ctx.beginPath();
        ctx.moveTo(40, -220);
        ctx.quadraticCurveTo(420, -160, 400, 0);
        ctx.quadraticCurveTo(420, 160, 40, 220);
        ctx.closePath();
        ctx.fill();
        outline(b, 0.8 * b.px, "rgba(90, 80, 70, 0.6)");
        circle(b, 250, 0, 70, "#eda07c");
        // The hat.
        dome(b, -40, 0, 260, tone[0], 0, 0.35);
        ctx.beginPath();
        ctx.arc(-40, 0, 260, 0, Math.PI * 2);
        outline(b, 1 * b.px, "rgba(40, 10, 10, 0.5)");
        const g = ctx.createRadialGradient(-110, 0, 0, -110, 0, 200);
        g.addColorStop(0, "rgba(255, 255, 255, 0.55)");
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(-320, -220, 440, 440);
        circle(b, -120, 0, 45, tone[1]);
      });
      break;

    case "flowerpot": {
      const points = Array.from({ length: 12 }, (_, i): Point => [d.x + Math.cos((i / 12) * Math.PI * 2) * r, d.y + Math.sin((i / 12) * Math.PI * 2) * r]);
      blockShadow(b, points, tall);
      drawBlock(b, points, { wall: "", kind: "pot", height: tall });
      // Its own flowers, in its own colour.
      for (let i = 0; i < 4; i++) bloom(b, d.x + (rand() - 0.5) * r, d.y + (rand() - 0.5) * r, r * 0.2, tone[0]);
      break;
    }

    case "wateringcan":
      shadow(b, tall, () => ctx.ellipse(d.x, d.y, 420, 330, 0, 0, Math.PI * 2), 0.34);
      at((b) => {
        const { ctx } = b;
        // Spout and rose, handle, then the body with water inside.
        ctx.strokeStyle = "#4f8f86";
        ctx.lineWidth = 90;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(250, 0);
        ctx.lineTo(720, 0);
        ctx.stroke();
        dome(b, 760, 0, 130, "#6fb3a8", 0.3, 0.4);
        ctx.strokeStyle = "#3d756d";
        ctx.lineWidth = 70;
        ctx.beginPath();
        ctx.arc(-330, 0, 190, Math.PI * 0.5, Math.PI * 1.5);
        ctx.stroke();
        dome(b, 0, 0, 340, "#5fa79c", 0, 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, 340, 0, Math.PI * 2);
        outline(b, 1.2 * b.px, "rgba(20, 50, 46, 0.7)");
        circle(b, 0, 0, 255, "#1f5a70");
        oval(b, -b.light[0] * 90, -b.light[1] * 90, 120, 60, "rgba(200, 240, 250, 0.5)", 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, 255, 0, Math.PI * 2);
        outline(b, 1 * b.px, "rgba(10, 40, 36, 0.6)");
      });
      break;

    case "wheelbarrow":
      shadow(b, tall, () => ctx.roundRect(d.x - 700, d.y - 480, 1400, 960, 200), 0.3);
      at((b) => {
        const { ctx } = b;
        // Handles and legs, the wheel out in front, and a tray of soil with a trowel stuck in it.
        ctx.strokeStyle = "#8a5a34";
        ctx.lineWidth = 80;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-500, -330);
        ctx.lineTo(-1050, -400);
        ctx.moveTo(-500, 330);
        ctx.lineTo(-1050, 400);
        ctx.stroke();
        ctx.fillStyle = "#26221e";
        ctx.beginPath();
        ctx.roundRect(640, -70, 330, 140, 60);
        ctx.fill();
        const tray: Point[] = [[-560, -430], [520, -330], [640, 0], [520, 330], [-560, 430]];
        path(ctx, { points: tray });
        ctx.fillStyle = "#3f8f5a";
        ctx.fill();
        bevel(b, tray, 110);
        path(ctx, { points: tray });
        outline(b, 1.2 * b.px, "rgba(10, 40, 20, 0.7)");
        const soil = offset(tray, true, 130);
        path(ctx, { points: soil });
        ctx.fillStyle = textured(ctx, "soil", b.px);
        ctx.fill();
        ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
        ctx.fill();
        ctx.strokeStyle = "#c9c4b8";
        ctx.lineWidth = 60;
        ctx.beginPath();
        ctx.moveTo(-150, -60);
        ctx.lineTo(120, 90);
        ctx.stroke();
        ctx.strokeStyle = "#d8362a";
        ctx.beginPath();
        ctx.moveTo(120, 90);
        ctx.lineTo(300, 190);
        ctx.stroke();
      });
      break;

    case "duck":
      // A bath duck, afloat.
      at((b) => {
        const { ctx } = b;
        shadow(b, 260, () => ctx.ellipse(0, 0, 260, 200, 0, 0, Math.PI * 2), 0.2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = 1.2 * b.px;
        ctx.beginPath();
        ctx.ellipse(0, 0, 330, 270, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#f7c81e";
        ctx.beginPath();
        ctx.moveTo(-330, 0);
        ctx.quadraticCurveTo(-200, -220, 60, -200);
        ctx.quadraticCurveTo(260, -150, 250, 0);
        ctx.quadraticCurveTo(260, 150, 60, 200);
        ctx.quadraticCurveTo(-200, 220, -330, 0);
        ctx.fill();
        outline(b, 1 * b.px, "rgba(140, 90, 0, 0.7)");
        ctx.fillStyle = "#fa8a28";
        ctx.beginPath();
        ctx.ellipse(330, 0, 90, 70, 0, 0, Math.PI * 2);
        ctx.fill();
        dome(b, 170, 0, 150, "#f9d43a", 0.5, 0.25);
        circle(b, 215, -75, 24, "#1d1a16");
        circle(b, 215, 75, 24, "#1d1a16");
      });
      break;

    case "reeds":
      for (let i = 0; i < 9; i++) {
        const x = d.x + (rand() - 0.5) * 800;
        const y = d.y + (rand() - 0.5) * 600;
        const lean = (rand() - 0.5) * 300;
        ctx.strokeStyle = i % 2 ? "#3f8a3c" : "#5aa84a";
        ctx.lineWidth = 2.2 * b.px;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + lean * 0.3, y - 250, x + lean, y - 520);
        ctx.stroke();
        if (i % 3 === 0) oval(b, x + lean, y - 540, 55, 150, "#6b4426", lean / 900);
      }
      break;

    case "bucket":
      shadow(b, tall, () => ctx.arc(d.x, d.y, 300, 0, Math.PI * 2), 0.34);
      dome(b, d.x, d.y, 300, tone[0], 0, 0.4);
      ctx.beginPath();
      ctx.arc(d.x, d.y, 300, 0, Math.PI * 2);
      outline(b, 1.2 * b.px);
      circle(b, d.x, d.y, 235, tone[1]);
      ctx.fillStyle = textured(ctx, "sand", b.px);
      ctx.beginPath();
      ctx.arc(d.x + b.light[0] * 30, d.y + b.light[1] * 30, 200, 0, Math.PI * 2);
      ctx.fill();
      // The handle, flopped to one side.
      ctx.strokeStyle = "#f4f1e6";
      ctx.lineWidth = 1.6 * b.px;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + 120, 300, 230, 0, 0.15, Math.PI - 0.15);
      ctx.stroke();
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

    case "bricks":
      // A little stack left over from building the rails.
      at((b) => {
        const { ctx } = b;
        shadow(b, tall, () => ctx.rect(-450, -330, 900, 660), 0.34);
        const brick = (x: number, y: number, turn: number) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(turn);
          ctx.beginPath();
          ctx.rect(-215, -105, 430, 210);
          ctx.fillStyle = textured(ctx, "terracotta", b.px);
          ctx.fill();
          ctx.fillStyle = "rgba(140, 40, 26, 0.35)";
          ctx.fill();
          bevel(turnedBy(b, turn), [[-215, -105], [215, -105], [215, 105], [-215, 105]], 40);
          ctx.beginPath();
          ctx.rect(-215, -105, 430, 210);
          outline(b, 1 * b.px);
          ctx.restore();
        };
        brick(-220, -115, 0);
        brick(225, -115, 0);
        brick(-220, 115, 0);
        brick(225, 115, 0);
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(-150, -80, 520, 300);
        brick(40, 20, 0.35);
      });
      break;

    case "bench":
      at((b) => {
        const { ctx } = b;
        const long = d.length ?? 2400;
        shadow(b, tall, () => ctx.rect(-long / 2, -420, long, 840), 0.32);
        // Legs at the ends, then the slats of the seat and the back rail.
        ctx.fillStyle = "#3b2a1c";
        ctx.fillRect(-long / 2 + 60, -420, 130, 840);
        ctx.fillRect(long / 2 - 190, -420, 130, 840);
        for (const [y, h] of [[-420, 150], [-210, 170], [0, 170], [210, 170]] as const) {
          const slat: Point[] = [[-long / 2, y], [long / 2, y], [long / 2, y + h], [-long / 2, y + h]];
          path(ctx, { points: slat });
          ctx.fillStyle = textured(ctx, "timber", b.px);
          ctx.fill();
          if (y === -420) {
            ctx.fillStyle = "rgba(60, 30, 10, 0.3)";
            ctx.fill();
          }
          bevel(b, slat, 36);
          path(ctx, { points: slat });
          outline(b, 0.8 * b.px);
        }
      });
      break;

    case "birdbath":
      shadow(b, tall, () => ctx.arc(d.x, d.y, r, 0, Math.PI * 2), 0.34);
      dome(b, d.x, d.y, r, "#c2c0b4", 0, 0.35);
      ctx.fillStyle = textured(ctx, "stone", b.px);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      outline(b, 1.2 * b.px, "rgba(40, 40, 30, 0.6)");
      circle(b, d.x, d.y, r * 0.74, "#2f86b8");
      ctx.fillStyle = textured(ctx, "water", b.px);
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0, 20, 40, 0.35)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, r * 0.74, 0, Math.PI * 2);
      ctx.arc(d.x + b.light[0] * r * 0.12, d.y + b.light[1] * r * 0.12, r * 0.66, 0, Math.PI * 2, true);
      ctx.fill();
      // A sparrow on the rim.
      oval(b, d.x + r * 0.55, d.y - r * 0.5, r * 0.2, r * 0.13, "#7a5a3c", 0.7);
      circle(b, d.x + r * 0.42, d.y - r * 0.62, r * 0.09, "#5a4028");
      break;

    case "poolring":
      // The blown-up wall of a paddling pool, round water that is there already: a fat ring in
      // two colours, shiny on top.
      shadow(b, tall, () => {
        ctx.arc(d.x, d.y, r + 330, 0, Math.PI * 2);
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2, true);
      }, 0.32);
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, r + 165, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2 + 0.01);
        ctx.lineWidth = 330;
        ctx.lineCap = "butt";
        ctx.strokeStyle = i % 2 ? tone[0] : "#fdfdf8";
        ctx.stroke();
      }
      for (const [k, colour, width] of [[0.08, "rgba(0, 0, 0, 0.22)", 60], [0.92, "rgba(0, 0, 0, 0.28)", 70], [0.42, "rgba(255, 255, 255, 0.6)", 60]] as const) {
        ctx.beginPath();
        if (k === 0.42) ctx.arc(d.x, d.y, r + 330 * k, Math.PI * 0.95, Math.PI * 1.75);
        else ctx.arc(d.x, d.y, r + 330 * k, 0, Math.PI * 2);
        ctx.lineWidth = width;
        ctx.strokeStyle = colour;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      break;

    case "hosereel":
      shadow(b, tall, () => ctx.arc(d.x, d.y, 520, 0, Math.PI * 2), 0.34);
      at((b) => {
        const { ctx } = b;
        ctx.fillStyle = "#4b4b48";
        ctx.beginPath();
        ctx.roundRect(-560, -430, 1120, 860, 90);
        ctx.fill();
        outline(b, 1 * b.px);
        // The drum, wound with hose.
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, 400 - i * 52, 0, Math.PI * 2);
          ctx.lineWidth = 50;
          ctx.strokeStyle = i % 2 ? "#2f8f4a" : "#3aa257";
          ctx.stroke();
        }
        dome(b, 0, 0, 110, "#d8362a", 0.5, 0.3);
        ctx.strokeStyle = "#26221e";
        ctx.lineWidth = 60;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(300, -260);
        ctx.stroke();
      });
      break;

    case "plank":
    case "flag":
      break;
  }
}

/** The light, for something drawn inside a further turn of the canvas. */
function turnedBy(b: Brush, angle: number): Brush {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  return { ...b, light: [b.light[0] * c - b.light[1] * s, b.light[0] * s + b.light[1] * c] };
}

/** A heap of fresh earth, with the hole in the top if a mole (or a ball) might come out of it. */
function molehill(b: Brush, x: number, y: number, r: number, mole = false, open = false) {
  const { ctx } = b;
  const rand = scatter(Math.round(x * 3 + y * 5));
  shadow(b, 220, () => ctx.arc(x, y, r * 0.95, 0, Math.PI * 2), 0.3);
  // Crumbs thrown out round it.
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const k = r * (0.95 + rand() * 0.35);
    circle(b, x + Math.cos(a) * k, y + Math.sin(a) * k, r * (0.05 + rand() * 0.07), i % 2 ? "#5d3d24" : "#7a5434");
  }
  dome(b, x, y, r, "#6f4a2c", 0, 0.45);
  ctx.fillStyle = textured(ctx, "soil", b.px);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  dome(b, x, y, r, "rgba(0,0,0,0)", 0, 0.4);
  if (mole || open) {
    circle(b, x, y, r * 0.46, "#1a0f08");
    ctx.fillStyle = "rgba(120, 84, 50, 0.6)";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
    ctx.arc(x - b.light[0] * r * 0.07, y - b.light[1] * r * 0.07, r * 0.42, 0, Math.PI * 2, true);
    ctx.fill();
  }
  if (mole) {
    // He is looking out: a velvet head, a pink nose, two paws on the rim.
    dome(b, x, y + r * 0.04, r * 0.34, "#3b3340", 0.25, 0.4);
    circle(b, x, y + r * 0.3, r * 0.1, "#f39ab0");
    circle(b, x - r * 0.3, y + r * 0.36, r * 0.11, "#f3b6a0");
    circle(b, x + r * 0.3, y + r * 0.36, r * 0.11, "#f3b6a0");
    circle(b, x - r * 0.13, y + r * 0.08, r * 0.035, "#0d0a0d");
    circle(b, x + r * 0.13, y + r * 0.08, r * 0.035, "#0d0a0d");
  }
}

export function decorShadowless(d: SportDecor) {
  return HEIGHTS[d.kind] === undefined;
}

// ---- Tunnels --------------------------------------------------------------------------------------

/** The end of a pipe, seen from above: a collar with a dark way in, facing along +x. */
function pipeEnd(b: Brush, x: number, y: number, hundredths: number, r: number, colour: Texture | string) {
  placed(b, x, y, hundredths, (b) => {
    const { ctx } = b;
    // The opening faces -x (a ball rolling along +x goes in), the pipe runs off along +x.
    shadow(b, 200, () => ctx.rect(-r * 0.2, -r * 1.05, r * 1.5, r * 2.1), 0.3);
    const body: Point[] = [[-r * 0.25, -r * 1.05], [r * 1.25, -r * 1.05], [r * 1.25, r * 1.05], [-r * 0.25, r * 1.05]];
    path(ctx, { points: body });
    ctx.fillStyle = colour.startsWith("#") ? colour : textured(ctx, colour as Texture, b.px);
    ctx.fill();
    // Round, so shaded across its width: pale along the top of the curve, dark at both edges.
    const g = ctx.createLinearGradient(0, -r * 1.05, 0, r * 1.05);
    const lit = facing(b, 0, -1);
    g.addColorStop(0, shadeOf(-0.35 + lit * 0.2));
    g.addColorStop(0.35 - lit * 0.15, "rgba(255, 255, 255, 0.32)");
    g.addColorStop(1, shadeOf(-0.35 - lit * 0.2));
    ctx.fillStyle = g;
    ctx.fill();
    outline(b, 1.1 * b.px);
    // A collar at the lip, and the dark inside.
    ctx.beginPath();
    ctx.roundRect(-r * 0.42, -r * 1.18, r * 0.5, r * 2.36, r * 0.12);
    ctx.fillStyle = colour.startsWith("#") ? colour : textured(ctx, colour as Texture, b.px);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.fill();
    outline(b, 1.1 * b.px);
    ctx.fillStyle = "#120c08";
    ctx.beginPath();
    ctx.ellipse(-r * 0.42, 0, r * 0.3, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.36, 0, r * 0.16, r * 0.7, 0, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
  });
}

/** A tunnel's two ends, and whatever of it shows in between. */
export function drawTunnel(b: Brush, tunnel: Tunnel, look: SportTunnel) {
  const { ctx } = b;
  if (look.kind === "burrow") {
    // In: a hole in the turf with a ring of earth. Out: a molehill with its top open.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      circle(b, tunnel.x + Math.cos(a) * tunnel.r * 1.12, tunnel.y + Math.sin(a) * tunnel.r * 1.12, tunnel.r * (0.2 + (i % 3) * 0.05), i % 2 ? "#5d3d24" : "#7a5434");
    }
    circle(b, tunnel.x, tunnel.y, tunnel.r, "#140c06");
    ctx.fillStyle = "rgba(130, 90, 54, 0.75)";
    ctx.beginPath();
    ctx.arc(tunnel.x, tunnel.y, tunnel.r, 0, Math.PI * 2);
    ctx.arc(tunnel.x - b.light[0] * tunnel.r * 0.16, tunnel.y - b.light[1] * tunnel.r * 0.16, tunnel.r * 0.9, 0, Math.PI * 2, true);
    ctx.fill();
    molehill(b, tunnel.to[0], tunnel.to[1], tunnel.r * 1.25, false, true);
    return;
  }
  const out = look.out ?? tunnel.to;
  if (look.kind === "hose" && look.path && look.path.length > 1) {
    // The hose lying across the garden: a soft line through its points, with a shadow under it.
    const run = (dx: number, dy: number) => {
      const p = look.path!;
      ctx.beginPath();
      ctx.moveTo(p[0]![0] + dx, p[0]![1] + dy);
      for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i]![0] + dx, p[i]![1] + dy, (p[i]![0] + p[i + 1]![0]) / 2 + dx, (p[i]![1] + p[i + 1]![1]) / 2 + dy);
      ctx.lineTo(p.at(-1)![0] + dx, p.at(-1)![1] + dy);
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    run(b.light[0] * 110, b.light[1] * 110);
    ctx.lineWidth = 300;
    ctx.strokeStyle = "rgba(8, 24, 12, 0.28)";
    ctx.stroke();
    run(0, 0);
    ctx.lineWidth = 300;
    ctx.strokeStyle = "#1f6b36";
    ctx.stroke();
    ctx.lineWidth = 220;
    ctx.strokeStyle = "#35a257";
    ctx.stroke();
    run(-b.light[0] * 50, -b.light[1] * 50);
    ctx.lineWidth = 60;
    ctx.strokeStyle = "rgba(210, 255, 200, 0.55)";
    ctx.stroke();
    pipeEnd(b, tunnel.x, tunnel.y, look.enter, tunnel.r * 0.8, "#e0a21e");
    pipeEnd(b, out[0], out[1], (tunnel.angle + 18000) % 36000, tunnel.r * 0.8, "#e0a21e");
    return;
  }
  pipeEnd(b, tunnel.x, tunnel.y, look.enter, tunnel.r, "terracotta");
  pipeEnd(b, out[0], out[1], (tunnel.angle + 18000) % 36000, tunnel.r, "terracotta");
}

// ---- Bumpers ---------------------------------------------------------------------------------------

/** A toadstool from above: a red cap with pale spots, and a glimpse of the stalk's shadow. */
export function drawToadstool(b: Brush, x: number, y: number, r: number, tone: SportTone, squash = 0) {
  const { ctx } = b;
  const k = 1 + squash * 0.18;
  shadow(b, 420, () => ctx.arc(x, y, r * k, 0, Math.PI * 2), 0.36);
  dome(b, x, y, r * k, TONES[tone][0], 0.55, 0.42);
  ctx.beginPath();
  ctx.arc(x, y, r * k, 0, Math.PI * 2);
  outline(b, 1.2 * b.px, "rgba(60, 10, 6, 0.65)");
  const rand = scatter(Math.round(x + y * 3));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand();
    const d = i === 0 ? 0 : r * k * (0.5 + rand() * 0.22);
    oval(b, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (i === 0 ? 0.2 : 0.14 + rand() * 0.06), r * (i === 0 ? 0.2 : 0.11), "rgba(255, 252, 240, 0.92)", a);
  }
}

// ---- The cup ----------------------------------------------------------------------------------------

export function drawCup(b: Brush, x: number, y: number, r: number, kind: "cup" | "pocket") {
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
  circle(b, x, y, r, "#0c0a08");
  // The far wall of the hole catches the light; the near one is in shadow.
  const g = ctx.createLinearGradient(x - b.light[0] * r, y - b.light[1] * r, x + b.light[0] * r, y + b.light[1] * r);
  g.addColorStop(0, "rgba(0, 0, 0, 0.9)");
  g.addColorStop(0.55, "rgba(40, 34, 28, 0.6)");
  g.addColorStop(1, "rgba(150, 140, 120, 0.75)");
  ctx.fillStyle = g;
  ctx.fill();
  // The bottom, lower down and so shifted away from the light.
  circle(b, x - b.light[0] * r * 0.16, y - b.light[1] * r * 0.16, r * 0.74, "#070605");
  if (kind === "cup") {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.6 * b.px;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r + 1.2 * b.px, 0, Math.PI * 2);
    ctx.lineWidth = 1 * b.px;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.stroke();
  }
}
