// The part of a table that never moves, painted once: the ground and everything built on it. A
// hole is drawn as a model seen from straight above with the light at the top left, so depth is
// all in the shading: rails have a lit face and a dark one and throw a shadow on the turf, sand
// lies a little lower than the grass, water gets deeper away from its banks.
//
// It is painted into a canvas of its own, the size of the screen, and kept until the hole or the
// screen changes (see draw.ts). Each frame then starts by copying it, and only the balls, the aim
// and the glints on the water are drawn afresh.
import type { SportMaterial, SportSurface, SportView } from "@cardroom/games";
import type { Point } from "@cardroom/physics";
import { boxOf, facing, offset, path, rightOf, shadeOf, trace, type Brush, type Ctx } from "./geometry";
import { scatter, textured, type Texture } from "./textures";
import { blockShadow, drawBlock, drawCup, drawDecor, drawTunnel, liesFlat } from "./things";

const TEXTURE: Record<SportSurface, Texture> = { green: "green", rough: "rough", sand: "sand", water: "water", slope: "green", felt: "felt", wood: "wood", lane: "lane", lawn: "lawn", gravel: "gravel", paving: "paving", soil: "soil", deck: "deck" };
const RAIL: Record<SportMaterial, Texture> = { timber: "timber", brick: "brick", stone: "stone" };

/** What the painting leaves behind for the frames that follow. */
export interface Painted {
  canvas: HTMLCanvasElement;
  /** Places on open water, in world units, where a glint can come and go. */
  glints: Point[];
}

interface Sheet {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
}

export function paintCourse(table: SportView["table"], width: number, height: number, dpr: number, transform: DOMMatrix, brush: Omit<Brush, "ctx">): Painted {
  const W = Math.max(1, Math.round(width * dpr));
  const H = Math.max(1, Math.round(height * dpr));
  const sheet = (): Sheet => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(transform);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    return { canvas, ctx };
  };
  /** Copies one whole sheet onto another, pixel for pixel, with whatever blending `set` asks for. */
  const stamp = (onto: Ctx, from: HTMLCanvasElement, set?: (ctx: Ctx) => void) => {
    onto.save();
    onto.setTransform(1, 0, 0, 1, 0, 0);
    set?.(onto);
    onto.drawImage(from, 0, 0);
    onto.restore();
  };
  const everywhere = (ctx: Ctx, fill: string | CanvasPattern | CanvasGradient) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  const { world, look } = table;
  const out = sheet();
  const b: Brush = { ...brush, ctx: out.ctx };
  const { px } = b;
  const frame = look.frame;
  const rand = scatter(Math.round(frame.w * 3 + world.walls.length * 7 + world.pockets[0]!.x));
  // A device pixel's worth of blur is nothing on a dense screen: blurs are given in CSS pixels.
  const blur = (cssPixels: number) => cssPixels * dpr;

  // ---- The ground the table sits in ---------------------------------------------------------------
  everywhere(out.ctx, textured(out.ctx, TEXTURE[look.base], dpr));
  // Big soft patches of light and shade, so a lawn isn't the same tile from edge to edge.
  for (let i = 0; i < 26; i++) {
    const x = frame.x - frame.w * 0.3 + rand() * frame.w * 1.6;
    const y = frame.y - frame.h * 0.3 + rand() * frame.h * 1.6;
    const r = 900 + rand() * 2200;
    const g = out.ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = i % 2 ? "255, 255, 190" : "0, 30, 10";
    g.addColorStop(0, `rgba(${tint}, 0.11)`);
    g.addColorStop(1, `rgba(${tint}, 0)`);
    out.ctx.fillStyle = g;
    out.ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  if (look.base === "lawn" || look.base === "rough") {
    // Daisies and clover in the grass.
    for (let i = 0; i < 70; i++) {
      const x = frame.x - 1500 + rand() * (frame.w + 3000);
      const y = frame.y - 1500 + rand() * (frame.h + 3000);
      const r = Math.max(34, 1.2 * px);
      out.ctx.fillStyle = i % 5 === 0 ? "rgba(250, 222, 90, 0.9)" : "rgba(255, 255, 250, 0.9)";
      out.ctx.beginPath();
      out.ctx.arc(x, y, r, 0, Math.PI * 2);
      out.ctx.fill();
    }
  }

  // ---- Surfaces ------------------------------------------------------------------------------------
  // Patches are laid in order, each covering what is under it. For each kind of surface, find
  // exactly where it ends up showing (its own patches, less whatever was laid over them later),
  // and paint that as one piece: then its edge is the real edge, wherever several patches meet.
  const kinds = [...new Set(look.ground.map((g) => g.surface))];
  const showing = (surface: SportSurface): Sheet => {
    const mask = sheet();
    for (const g of look.ground) {
      mask.ctx.globalCompositeOperation = g.surface === surface ? "source-over" : "destination-out";
      mask.ctx.fillStyle = "#000";
      path(mask.ctx, g.shape);
      mask.ctx.fill("evenodd");
    }
    mask.ctx.globalCompositeOperation = "source-over";
    return mask;
  };
  /** A shadow thrown inward from a mask's edge onto a layer: what makes a thing look sunk, or lit from one side. */
  const outsides = new Map<Sheet, Sheet>();
  const inner = (layer: Sheet, mask: Sheet, colour: string, blurBy: number, dx = 0, dy = 0) => {
    // Everything that isn't the mask, worked out once for each mask however many shadows it throws.
    let outside = outsides.get(mask);
    if (!outside) {
      outside = sheet();
      everywhere(outside.ctx, "#000");
      stamp(outside.ctx, mask.canvas, (c) => (c.globalCompositeOperation = "destination-out"));
      outsides.set(mask, outside);
    }
    layer.ctx.save();
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.ctx.globalCompositeOperation = "source-atop";
    layer.ctx.shadowColor = colour;
    layer.ctx.shadowBlur = blurBy;
    // Only the shadow is wanted: the thing that throws it is drawn far off the sheet.
    layer.ctx.shadowOffsetX = dx * dpr + 3 * W;
    layer.ctx.shadowOffsetY = dy * dpr;
    layer.ctx.drawImage(outside.canvas, -3 * W, 0);
    layer.ctx.restore();
  };
  const glints: Point[] = [];
  // Where the light falls, on the screen: world vectors are turned with the table.
  const sx = (b.light[0] * transform.a + b.light[1] * transform.c) / Math.hypot(transform.a, transform.b) || 0;
  const sy = (b.light[0] * transform.b + b.light[1] * transform.d) / Math.hypot(transform.a, transform.b) || 0;

  const order: SportSurface[] = ["lawn", "rough", "soil", "gravel", "paving", "wood", "lane", "felt", "green", "deck", "sand", "water"];
  for (const surface of order.filter((s) => kinds.includes(s))) {
    const mask = showing(surface);
    const layer = sheet();
    everywhere(layer.ctx, textured(layer.ctx, TEXTURE[surface], dpr, 0, surface === "water" ? 1.5 : 1));
    if (surface === "green") {
      // The nap of a mown green: broad bands, alternately brushed towards and away from the light.
      layer.ctx.save();
      const band = 1050;
      layer.ctx.rotate(-0.5);
      const reach = Math.hypot(frame.w, frame.h) * 1.5;
      for (let y = -reach; y < reach; y += 2 * band) {
        layer.ctx.fillStyle = "rgba(255, 255, 210, 0.075)";
        layer.ctx.fillRect(-reach, y, 2 * reach, band);
        layer.ctx.fillStyle = "rgba(0, 40, 10, 0.06)";
        layer.ctx.fillRect(-reach, y + band, 2 * reach, band);
      }
      layer.ctx.restore();
    }
    stamp(layer.ctx, mask.canvas, (c) => (c.globalCompositeOperation = "destination-in"));
    if (surface === "green") {
      // Darker where the grass runs up to something.
      inner(layer, mask, "rgba(6, 40, 16, 0.5)", blur(7));
    } else if (surface === "sand") {
      // Sand lies lower than the grass: the edge towards the light throws a shadow in, and the
      // rim all round is damp and dark.
      inner(layer, mask, "rgba(110, 76, 30, 0.65)", blur(5));
      inner(layer, mask, "rgba(70, 44, 12, 0.6)", blur(4), sx * 3, sy * 3);
    } else if (surface === "water") {
      // Deep in the middle, pale in the shallows, a bright line where it laps the bank, and the
      // bank's own shadow on the side towards the light.
      layer.ctx.save();
      layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      layer.ctx.globalCompositeOperation = "source-atop";
      layer.ctx.fillStyle = "rgba(8, 44, 110, 0.4)";
      layer.ctx.fillRect(0, 0, W, H);
      layer.ctx.restore();
      inner(layer, mask, "rgba(160, 240, 234, 0.95)", blur(13));
      inner(layer, mask, "rgba(255, 255, 255, 0.95)", blur(1.6));
      inner(layer, mask, "rgba(0, 30, 60, 0.6)", blur(5), sx * 4, sy * 4);
      // Somewhere for the glints: spots well out from the bank.
      const data = mask.ctx.getImageData(0, 0, W, H).data;
      const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && data[(Math.round(y) * W + Math.round(x)) * 4 + 3]! > 200;
      const inverse = transform.inverse();
      const pick = scatter(97);
      const clear = 16 * dpr;
      for (let i = 0; i < 1400 && glints.length < 46; i++) {
        const x = pick() * W;
        const y = pick() * H;
        if (!wet(x, y) || !wet(x - clear, y) || !wet(x + clear, y) || !wet(x, y - clear) || !wet(x, y + clear)) continue;
        const at = inverse.transformPoint({ x, y });
        glints.push([at.x, at.y]);
      }
    } else if (surface === "deck") {
      inner(layer, mask, "rgba(40, 20, 6, 0.6)", blur(3));
    } else {
      // Paths, beds and patios: a soft dark edge where the grass overhangs.
      inner(layer, mask, "rgba(10, 24, 6, 0.6)", blur(4), sx * 1.5, sy * 1.5);
    }
    if (surface === "water") {
      // The bank: a lip of dark earth all round, wider on the side the light comes from.
      for (const [colour, by, k] of [["rgba(52, 36, 16, 0.9)", 2.2, 0], ["rgba(30, 44, 14, 0.75)", 5, -2]] as const) {
        stamp(out.ctx, mask.canvas, (c) => {
          c.shadowColor = colour;
          c.shadowBlur = blur(by);
          c.shadowOffsetX = sx * k * dpr;
          c.shadowOffsetY = sy * k * dpr;
        });
      }
    }
    // Anything that isn't the ground itself stands a hair proud of it or below it.
    if (surface === "green" || surface === "deck") stamp(out.ctx, mask.canvas, (c) => {
      c.shadowColor = "rgba(6, 26, 10, 0.55)";
      c.shadowBlur = blur(5);
      c.shadowOffsetX = sx * 3 * dpr;
      c.shadowOffsetY = sy * 3 * dpr;
    });
    stamp(out.ctx, layer.canvas);
  }

  // ---- Terraces and pits ---------------------------------------------------------------------------
  // Ground that stands higher is a shade paler and throws a shadow off its edge; a pit is a shade
  // darker and the ground round it throws a shadow in.
  for (const g of look.ground) {
    if (!g.level) continue;
    const reach = Math.abs(g.level) * 0.75;
    out.ctx.save();
    if (g.surface === "green") {
      // A terrace of turf is edged by steps and ramps, and those draw the shadows where there is
      // a drop; all the ground itself needs is to be a shade paler the higher it stands.
      path(out.ctx, g.shape);
      out.ctx.fillStyle = g.level > 0 ? `rgba(226, 255, 150, ${Math.min(0.22, g.level / 3200)})` : `rgba(0, 30, 12, ${Math.min(0.26, -g.level / 1300)})`;
      out.ctx.fill();
      out.ctx.restore();
      continue;
    }
    if (g.level > 0) {
      // The shadow belongs on the ground beside the terrace, not on the terrace: cut the terrace out of where it may fall.
      out.ctx.beginPath();
      out.ctx.rect(frame.x - frame.w, frame.y - frame.h, frame.w * 3, frame.h * 3);
      trace(out.ctx, g.shape);
      out.ctx.clip("evenodd");
      out.ctx.translate(b.light[0] * reach, b.light[1] * reach);
      out.ctx.shadowColor = "rgba(4, 24, 8, 0.5)";
      out.ctx.shadowBlur = blur(6);
      out.ctx.fillStyle = "rgba(4, 24, 8, 0.4)";
      path(out.ctx, g.shape);
      out.ctx.fill();
    } else {
      path(out.ctx, g.shape);
      out.ctx.clip();
      out.ctx.fillStyle = "rgba(0, 26, 8, 0.14)";
      out.ctx.fill();
      // Everything outside the pit, slid towards where shadows fall: what shows inside is the rim's shadow.
      out.ctx.translate(b.light[0] * reach, b.light[1] * reach);
      out.ctx.beginPath();
      out.ctx.rect(frame.x - frame.w, frame.y - frame.h, frame.w * 3, frame.h * 3);
      trace(out.ctx, g.shape);
      out.ctx.shadowColor = "rgba(4, 24, 8, 0.5)";
      out.ctx.shadowBlur = blur(5);
      out.ctx.fillStyle = "rgba(4, 24, 8, 0.42)";
      out.ctx.fill("evenodd");
    }
    out.ctx.restore();
  }

  // ---- Slopes --------------------------------------------------------------------------------------
  // A slope is the same grass tilted: paler if it faces the light and darker if it faces away,
  // ruled with faint lines along the level and small marks pointing downhill.
  for (const r of look.regions) {
    const region = world.regions.find((g) => g.id === r.id);
    if (r.surface !== "slope" || !region?.slope) continue;
    const [ax, ay] = region.slope;
    const steep = Math.hypot(ax, ay) || 1;
    const ux = ax / steep;
    const uy = ay / steep;
    const box = boxOf(region.shape);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const half = (Math.abs(ux) * box.w + Math.abs(uy) * box.h) / 2;
    out.ctx.save();
    path(out.ctx, region.shape);
    out.ctx.clip();
    // The face of the slope looks the way it runs downhill.
    const lit = facing(b, ux, uy);
    out.ctx.fillStyle = lit > 0 ? `rgba(226, 255, 150, ${lit * 0.2})` : `rgba(0, 34, 12, ${-lit * 0.24})`;
    out.ctx.fillRect(box.x, box.y, box.w, box.h);
    // A touch darker at the foot than at the top, so the eye reads which end is up.
    const g = out.ctx.createLinearGradient(cx - ux * half, cy - uy * half, cx + ux * half, cy + uy * half);
    g.addColorStop(0, "rgba(226, 255, 150, 0.1)");
    g.addColorStop(1, "rgba(0, 30, 10, 0.12)");
    out.ctx.fillStyle = g;
    out.ctx.fillRect(box.x, box.y, box.w, box.h);
    out.ctx.lineWidth = 1 * px;
    out.ctx.setLineDash([3 * px, 4 * px]);
    const gap = Math.max(520, 16 * px);
    for (let d = -half + gap / 2; d < half; d += gap) {
      out.ctx.strokeStyle = "rgba(236, 255, 200, 0.16)";
      out.ctx.beginPath();
      out.ctx.moveTo(cx + ux * d - uy * 9999, cy + uy * d + ux * 9999);
      out.ctx.lineTo(cx + ux * d + uy * 9999, cy + uy * d - ux * 9999);
      out.ctx.stroke();
    }
    out.ctx.setLineDash([]);
    const across = (Math.abs(uy) * box.w + Math.abs(ux) * box.h) / 2;
    const spread = Math.max(1000, 32 * px);
    const size = Math.max(110, 4 * px);
    out.ctx.lineWidth = 1.6 * px;
    out.ctx.strokeStyle = "rgba(240, 255, 210, 0.42)";
    for (let d = -half + spread / 2; d < half; d += spread) {
      for (let k = -across + spread / 2; k < across; k += spread) {
        const x = cx + ux * d - uy * k;
        const y = cy + uy * d + ux * k;
        out.ctx.beginPath();
        out.ctx.moveTo(x - ux * size - uy * size, y - uy * size + ux * size);
        out.ctx.lineTo(x + ux * size * 0.4, y + uy * size * 0.4);
        out.ctx.lineTo(x - ux * size + uy * size, y - uy * size - ux * size);
        out.ctx.stroke();
      }
    }
    out.ctx.restore();
  }

  // ---- Steps ---------------------------------------------------------------------------------------
  const wallOf = (id: string) => world.walls.find((w) => w.id === id);
  for (const ledge of look.ledges) {
    const wall = wallOf(ledge.wall);
    if (!wall) continue;
    // The riser is seen edge on: a band of stone along the low side (the right of the wall as
    // listed), lit or dark by which way it looks, with the step's shadow on the ground below.
    const rise = Math.max(ledge.drop * 0.8, 6 * px);
    const low = offset(wall.points, false, rise);
    const far = offset(wall.points, false, rise + Math.max(ledge.drop * 1.3, 9 * px));
    for (let i = 0; i < wall.points.length - 1; i++) {
      const p = wall.points[i]!;
      const q = wall.points[i + 1]!;
      const n = rightOf(p, q);
      const lit = facing(b, n[0], n[1]);
      if (lit < 0) {
        const g = out.ctx.createLinearGradient(low[i]![0], low[i]![1], far[i]![0], far[i]![1]);
        g.addColorStop(0, `rgba(4, 24, 8, ${0.75 * -lit})`);
        g.addColorStop(1, "rgba(4, 24, 8, 0)");
        out.ctx.fillStyle = g;
        path(out.ctx, { points: [low[i]!, low[i + 1]!, far[i + 1]!, far[i]!] });
        out.ctx.fill();
      }
      path(out.ctx, { points: [p, q, low[i + 1]!, low[i]!] });
      out.ctx.fillStyle = textured(out.ctx, RAIL[ledge.material], px, Math.atan2(q[1] - p[1], q[0] - p[0]));
      out.ctx.fill();
      out.ctx.fillStyle = shadeOf(lit * 0.34 - 0.12);
      out.ctx.fill();
      out.ctx.lineWidth = 1 * px;
      out.ctx.strokeStyle = "rgba(20, 16, 8, 0.6)";
      out.ctx.stroke();
      // The lip.
      out.ctx.beginPath();
      out.ctx.moveTo(p[0], p[1]);
      out.ctx.lineTo(q[0], q[1]);
      out.ctx.lineWidth = 1.6 * px;
      out.ctx.strokeStyle = "rgba(255, 255, 230, 0.65)";
      out.ctx.stroke();
    }
  }

  // ---- What lies flat, then the shadows of what stands up, then what stands up ---------------------
  for (const d of look.decor) if (liesFlat(d)) drawDecor(b, d);
  for (const t of look.tunnels) {
    const tunnel = world.tunnels?.find((w) => w.id === t.id);
    if (tunnel && t.kind !== "pipe") drawTunnel(b, tunnel, t);
  }
  for (const p of world.pockets) drawCup(b, p.x, p.y, p.r, look.pockets);

  const rails = look.rails.flatMap((rail) => {
    const wall = wallOf(rail.wall);
    if (!wall) return [];
    const closed = wall.closed === true;
    // The rail's two long edges: the wall's own line (which the ball touches) and the far side.
    const [from, to] = rail.side === "left" ? [0, -rail.width] : rail.side === "right" ? [0, rail.width] : [-rail.width / 2, rail.width / 2];
    return [{ rail, wall, closed, from, to }];
  });
  const stretch = (pts: Point[], closed: boolean) => (closed ? pts.length : pts.length - 1);

  // One path for every rail's footprint, so that where two rails meet their shadows don't double.
  out.ctx.save();
  out.ctx.beginPath();
  for (const { rail, wall, closed, from, to } of rails) {
    const a = offset(wall.points, closed, from);
    const c = offset(wall.points, closed, to);
    const reach = rail.height * 0.65;
    for (let i = 0; i < stretch(wall.points, closed); i++) {
      const j = (i + 1) % wall.points.length;
      const quad: Point[] = [a[i]!, a[j]!, c[j]!, c[i]!];
      // Each piece and the same piece slid along the light: together, the ground it shades.
      for (const k of [0.5, 1]) trace(out.ctx, { points: quad.map(([x, y]): Point => [x + b.light[0] * reach * k, y + b.light[1] * reach * k]) });
    }
  }
  out.ctx.shadowColor = "rgba(4, 22, 8, 0.5)";
  out.ctx.shadowBlur = blur(3.5);
  out.ctx.fillStyle = "rgba(4, 22, 8, 0.46)";
  out.ctx.fill("nonzero");
  out.ctx.restore();
  for (const block of look.blocks) {
    const wall = wallOf(block.wall);
    if (wall) blockShadow(b, wall.points, block.height);
  }

  for (const { rail, wall, closed, from, to } of rails) {
    // Across its width a rail is a chamfer, a flat top and another chamfer. The chamfers are what
    // make it stand up: each is pale or dark by which way it faces.
    const chamfer = Math.min(Math.abs(to - from) * 0.24, rail.height * 0.3);
    const sign = Math.sign(to - from);
    const lines = [from, from + sign * chamfer, to - sign * chamfer, to].map((d) => offset(wall.points, closed, d));
    const n = wall.points.length;
    for (let i = 0; i < stretch(wall.points, closed); i++) {
      const j = (i + 1) % n;
      const p = wall.points[i]!;
      const q = wall.points[j]!;
      const right = rightOf(p, q);
      const turn = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const fill = textured(out.ctx, RAIL[rail.material], px, turn, 1, [p[0], p[1]]);
      for (let band = 0; band < 3; band++) {
        path(out.ctx, { points: [lines[band]![i]!, lines[band]![j]!, lines[band + 1]![j]!, lines[band + 1]![i]!] });
        out.ctx.fillStyle = fill;
        out.ctx.fill();
        // The first chamfer faces back across the wall's line, the last one faces away from it.
        const way = band === 0 ? -sign : band === 2 ? sign : 0;
        out.ctx.fillStyle = way ? shadeOf(facing(b, right[0] * way, right[1] * way) * 0.42 - 0.1) : "rgba(255, 255, 230, 0.07)";
        out.ctx.fill();
      }
    }
    // The joints: a dark line across the rail at each corner, where two lengths are mitred.
    out.ctx.lineWidth = 1 * px;
    out.ctx.strokeStyle = "rgba(30, 16, 4, 0.5)";
    out.ctx.beginPath();
    wall.points.forEach((_, i) => {
      if (!closed && (i === 0 || i === n - 1)) return;
      out.ctx.moveTo(lines[0]![i]![0], lines[0]![i]![1]);
      out.ctx.lineTo(lines[3]![i]![0], lines[3]![i]![1]);
    });
    out.ctx.stroke();
    // The outline, and a pale line along each edge of the top.
    for (const [line, colour, width] of [[lines[0]!, "rgba(24, 12, 2, 0.75)", 1.2], [lines[3]!, "rgba(24, 12, 2, 0.75)", 1.2], [lines[1]!, "rgba(255, 244, 214, 0.28)", 0.8], [lines[2]!, "rgba(255, 244, 214, 0.2)", 0.8]] as const) {
      path(out.ctx, { points: line }, closed);
      out.ctx.lineWidth = width * px;
      out.ctx.strokeStyle = colour;
      out.ctx.stroke();
    }
    if (!closed) {
      // The sawn ends of a rail that stops.
      for (const i of [0, n - 1]) {
        out.ctx.beginPath();
        out.ctx.moveTo(lines[0]![i]![0], lines[0]![i]![1]);
        out.ctx.lineTo(lines[3]![i]![0], lines[3]![i]![1]);
        out.ctx.lineWidth = 1.2 * px;
        out.ctx.strokeStyle = "rgba(24, 12, 2, 0.75)";
        out.ctx.stroke();
      }
    }
  }

  for (const block of look.blocks) {
    const wall = wallOf(block.wall);
    if (wall) drawBlock(b, wall.points, block);
  }
  // A pipe's ends sit on whatever it runs through, so they come after the blocks.
  for (const t of look.tunnels) {
    const tunnel = world.tunnels?.find((w) => w.id === t.id);
    if (tunnel && t.kind === "pipe") drawTunnel(b, tunnel, t);
  }
  // Trees last: their crowns hang over everything.
  for (const d of look.decor) if (!liesFlat(d) && d.kind !== "tree") drawDecor(b, d);
  for (const d of look.decor) if (d.kind === "tree") drawDecor(b, d);

  // A whisper of shade towards the corners pulls the eye to the hole.
  const corner = out.ctx.createRadialGradient(frame.x + frame.w / 2, frame.y + frame.h / 2, Math.min(frame.w, frame.h) * 0.45, frame.x + frame.w / 2, frame.y + frame.h / 2, Math.hypot(frame.w, frame.h) * 0.75);
  corner.addColorStop(0, "rgba(0, 20, 6, 0)");
  corner.addColorStop(1, "rgba(0, 20, 6, 0.32)");
  out.ctx.fillStyle = corner;
  out.ctx.fillRect(frame.x - frame.w * 2, frame.y - frame.h * 2, frame.w * 5, frame.h * 5);

  return { canvas: out.canvas, glints };
}
