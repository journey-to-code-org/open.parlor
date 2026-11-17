// The part of a table that never moves, painted once: the ground and everything built on it. A
// hole is drawn as a model looked down on at an angle (see projection.ts), lit from the upper
// left: rails, rocks and scenery are solid things with a top and a front, raised ground is a step
// with a riser, sand and water lie below the turf with a bank on the far side, and everything
// that stands up throws a shadow.
//
// It is done in three passes. First the ground is painted as if it were all at one level, the way
// a map is: turf, sand, water, whatever lies flat. Then that map is laid out at its true heights,
// lowest first: because the camera only tilts, a patch of ground that stands higher is the same
// picture moved straight up the screen, and a ramp is the same picture sheared. Last come the
// risers between levels, the shadows, and the things that stand up, the furthest first so the
// nearer ones cover them.
//
// The result is kept until the hole or the screen changes (see draw.ts). Each frame then starts
// by copying it, and only the balls, the aim and the glints on the water are drawn afresh. The
// things that stand up are kept too, as instructions: whichever of them is in front of a ball is
// drawn again over it.
import type { SportMaterial, SportSurface, SportView } from "@journey-to-code/games";
import type { Point } from "@journey-to-code/physics";
import { depthOf, riseOf, type Projection } from "../projection";
import { boxOf, facing, offset, path } from "./geometry";
import { castShadow, face, hull, lit, prism, shadeOf, SHADOW, type Paint, type Stage } from "./solids";
import { inPolygon, inShape, landOf, outlineOf, type Land } from "./terrain";
import { scatter, textured, type Texture } from "./textures";
import { farthestFirst } from "./order";
import { blockProp, decorProps, drawBurrow, drawCup, drawFlat, liesFlat, tunnelProps, type GroundBrush, type Prop } from "./things";

type Ctx = CanvasRenderingContext2D;

const TEXTURE: Record<SportSurface, Texture> = { green: "green", rough: "rough", sand: "sand", water: "water", slope: "green", felt: "felt", wood: "wood", lane: "lane", lawn: "lawn", gravel: "gravel", paving: "paving", soil: "soil", deck: "deck" };
const RAIL: Record<SportMaterial, Texture> = { timber: "timber", brick: "brick", stone: "stone", cushion: "felt" };

/** What the painting leaves behind for the frames that follow. */
export interface Painted {
  canvas: HTMLCanvasElement;
  /** The table as the camera has it, and how high its ground is anywhere. */
  land: Land;
  /** Everything that stands up, the furthest from the camera first. */
  props: Prop[];
  /** Places on open water (in the camera's frame, with the water's height) where a glint can come and go. */
  glints: [x: number, y: number, z: number][];
}

interface Sheet {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
}

/** What draws solid things for a projection: points of the camera's frame to CSS pixels. */
export function stageOf(ctx: Ctx, proj: Projection, land: Land): Stage {
  const s = proj.scale;
  const k = depthOf(proj);
  const r = riseOf(proj);
  return { ctx, s, k, r, land, at: (x, y, z = 0) => [proj.ox + x * s, proj.oy + (y * k - z * r) * s] };
}

export function paintCourse(table: SportView["table"], width: number, height: number, dpr: number, proj: Projection): Painted {
  const land = landOf(table, proj.turn);
  const { world, look } = land;
  const s = proj.scale;
  const k = depthOf(proj);
  const rise = riseOf(proj);
  const W = Math.max(1, Math.round(width * dpr));
  const H = Math.max(1, Math.round(height * dpr));
  /** How far up the screen ground `z` high is moved, in whole device pixels, so a moved picture stays sharp. */
  const lift = (z: number) => Math.round(z * rise * s * dpr);
  // The map is painted with room to spare above and below: ground that is laid higher or lower
  // brings with it what was off the edge of the screen.
  const heights = [0, ...land.patches.map((p) => p.z), ...land.ramps.map((r) => r.z + r.rise)];
  const padTop = lift(-Math.min(...heights)) + 2;
  const padBottom = lift(Math.max(...heights)) + 2;
  const HF = H + padTop + padBottom;
  // The canvas transform that draws on the map in the camera's frame.
  const transform = new DOMMatrix([s * dpr, 0, 0, s * k * dpr, proj.ox * dpr, proj.oy * dpr + padTop]);
  const sheet = (): Sheet => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = HF;
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
    ctx.fillRect(0, 0, W, HF);
    ctx.restore();
  };

  const out = sheet();
  const px = 1 / s;
  // On the map, shadows fall the way the light goes along the ground.
  const fall = Math.hypot(SHADOW[0], SHADOW[1]) || 1;
  const b: GroundBrush = { ctx: out.ctx, px, light: [SHADOW[0] / fall, SHADOW[1] / fall], sink: k > 0 ? rise / k : 0 };
  const frame = look.frame;
  const rand = scatter(Math.round(table.look.frame.w * 3 + world.walls.length * 7 + (table.world.pockets[0]?.x ?? 0)));
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
  const glints: Painted["glints"] = [];
  // Where shadows fall on the screen: the same way, foreshortened.
  const sx = b.light[0] / Math.hypot(b.light[0], b.light[1] * k);
  const sy = (b.light[1] * k) / Math.hypot(b.light[0], b.light[1] * k);

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
      layer.ctx.fillRect(0, 0, W, HF);
      layer.ctx.restore();
      inner(layer, mask, "rgba(160, 240, 234, 0.95)", blur(13));
      inner(layer, mask, "rgba(255, 255, 255, 0.95)", blur(1.6));
      inner(layer, mask, "rgba(0, 30, 60, 0.6)", blur(5), sx * 4, sy * 4);
      // Somewhere for the glints: spots well out from the bank.
      const data = mask.ctx.getImageData(0, 0, W, HF).data;
      const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < HF && data[(Math.round(y) * W + Math.round(x)) * 4 + 3]! > 200;
      const inverse = transform.inverse();
      const pick = scatter(97);
      const clear = 16 * dpr;
      for (let i = 0; i < 1400 && glints.length < 46; i++) {
        const x = pick() * W;
        const y = pick() * HF;
        if (!wet(x, y) || !wet(x - clear, y) || !wet(x + clear, y) || !wet(x, y - clear) || !wet(x, y + clear)) continue;
        const at = inverse.transformPoint({ x, y });
        glints.push([at.x, at.y, land.heightAt(at.x, at.y)]);
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

  // ---- What lies flat ------------------------------------------------------------------------------
  for (const d of look.decor) if (liesFlat(d)) drawFlat(b, d);
  for (const t of look.tunnels) {
    const tunnel = world.tunnels?.find((w) => w.id === t.id);
    if (tunnel && t.kind === "burrow") drawBurrow(b, tunnel);
  }
  for (const p of world.pockets) drawCup(b, p.x, p.y, p.r, look.pockets);

  // ---- The map, laid out at its heights ------------------------------------------------------------
  // `out` is the map; `ground` is the picture, the size of the screen. Each level of the ground is
  // cut out of the map and put where the camera sees it, the lowest first: lower ground never
  // hides higher, so each covers exactly what it should of the ones before.
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ground = canvas.getContext("2d")!;
  ground.drawImage(out.canvas, 0, -padTop);
  const levels = [...new Set([0, ...land.patches.map((p) => p.z)])];
  if (levels.length > 1 || land.ramps.length) {
    const cut = sheet();
    const pieces = [...levels.map((z) => ({ top: z, z, ramp: null as Land["ramps"][number] | null })), ...land.ramps.map((ramp) => ({ top: ramp.z + ramp.rise, z: ramp.z, ramp }))].sort((p, q) => p.top - q.top);
    for (const piece of pieces) {
      const c = cut.ctx;
      c.globalCompositeOperation = "source-over";
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, HF);
      c.fillStyle = "#000";
      if (piece.ramp) {
        c.setTransform(transform);
        path(c, piece.ramp.shape);
        c.fill();
      } else {
        // Everywhere that is at this level: the patches laid at it, less whatever was laid over them at another.
        if (piece.z === 0) c.fillRect(0, 0, W, HF);
        c.setTransform(transform);
        for (const p of land.patches) {
          c.globalCompositeOperation = p.z === piece.z ? "source-over" : "destination-out";
          path(c, p.shape);
          c.fill();
        }
        c.globalCompositeOperation = "destination-out";
        for (const r of land.ramps) {
          path(c, r.shape);
          c.fill();
        }
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-in";
      c.drawImage(out.canvas, 0, 0);
      if (piece.ramp) {
        // A ramp is the map sheared: each point goes up the screen by as much as the ramp has climbed there.
        const r = piece.ramp;
        const g = (r.rise / r.run) * rise;
        ground.setTransform(1, -g * r.ux, 0, 1 - (g * r.uy) / k, 0, -lift(r.z) + g * dpr * (r.ux * proj.ox + (r.uy * proj.oy) / k + r.foot * s));
        ground.drawImage(cut.canvas, 0, -padTop);
        ground.setTransform(1, 0, 0, 1, 0, 0);
      } else ground.drawImage(cut.canvas, 0, -padTop - lift(piece.z));
    }
  }

  // From here on everything is drawn where the camera sees it, in CSS pixels.
  ground.setTransform(dpr, 0, 0, dpr, 0, 0);
  ground.lineJoin = "round";
  ground.lineCap = "round";
  const st = stageOf(ground, proj, land);
  const shade = new Path2D();
  const wallOf = (id: string) => world.walls.find((w) => w.id === id);

  // ---- Risers ---------------------------------------------------------------------------------------
  // Wherever the ground on one side of a line is higher than on the other, and the drop faces the
  // camera, there is a face to see: the riser of a step, the bank of a pond, the side of a ramp.
  const surfaceAt = (x: number, y: number): SportSurface => {
    for (let i = land.patches.length - 1; i >= 0; i--) if (inShape(land.patches[i]!.shape, x, y)) return land.patches[i]!.surface;
    return look.base;
  };
  const ledges = look.ledges.flatMap((l) => {
    const wall = wallOf(l.wall);
    return wall ? [{ points: wall.points, material: l.material }] : [];
  });
  const onLedge = (x: number, y: number): SportMaterial | null => {
    for (const l of ledges) {
      for (let i = 0; i + 1 < l.points.length; i++) {
        const [x1, y1] = l.points[i]!;
        const [x2, y2] = l.points[i + 1]!;
        const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
        const t = Math.min(1, Math.max(0, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / len2));
        if (Math.hypot(x - x1 - t * (x2 - x1), y - y1 - t * (y2 - y1)) < 20) return l.material;
      }
    }
    return null;
  };
  const risers: { near: number; draw: () => void }[] = [];
  const seen = new Set<string>();
  // A step that no ledge of the world runs along is still built of something: whatever this table's steps are built of.
  const built = look.ledges[0]?.material ?? null;
  interface Drop {
    p: Point;
    q: Point;
    /** The ground on the camera's side of the line at each end, and on the far side. */
    near: [number, number];
    far: [number, number];
  }
  const riser = (d: Drop, nx: number, ny: number) => {
    const { p, q, near, far } = d;
    const mid: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const ledge = onLedge(mid[0], mid[1]);
    const above = surfaceAt(mid[0] - nx * 14, mid[1] - ny * 14);
    const below = surfaceAt(mid[0] + nx * 14, mid[1] + ny * 14);
    const turn = Math.atan2((q[1] - p[1]) * k, q[0] - p[0]);
    // A step is stone or timber; a deck shows the ends of its planks; a bank is earth.
    const material = ledge ?? (above === "green" && below === "green" ? built : null);
    const paint: Paint = material ? { texture: RAIL[material], turn } : above === "deck" || above === "wood" ? { texture: "timber", turn } : { texture: "soil" };
    const light = lit(nx, ny);
    risers.push({
      near: mid[1],
      draw: () => {
        const quad = [st.at(p[0], p[1], Math.min(near[0], far[0])), st.at(q[0], q[1], Math.min(near[1], far[1])), st.at(q[0], q[1], far[1]), st.at(p[0], p[1], far[0])];
        face(st, quad, paint, shadeOf(light, material ? 0.42 : 0.5), null);
        // The lip: stone and timber catch the light along their top edge, turf hangs over a bank.
        ground.beginPath();
        ground.moveTo(quad[3]![0], quad[3]![1]);
        ground.lineTo(quad[2]![0], quad[2]![1]);
        ground.lineWidth = material ? 1.4 : 1;
        ground.strokeStyle = material ? "rgba(255, 255, 230, 0.6)" : "rgba(20, 40, 12, 0.55)";
        ground.stroke();
        // Darker at the foot, where it meets the ground below.
        ground.beginPath();
        ground.moveTo(quad[0]![0], quad[0]![1]);
        ground.lineTo(quad[1]![0], quad[1]![1]);
        ground.lineWidth = 1;
        ground.strokeStyle = "rgba(10, 16, 6, 0.5)";
        ground.stroke();
      },
    });
    // The step's shadow on the ground below it.
    const drop = (far[0] + far[1] - near[0] - near[1]) / 2;
    if (drop > 60 && near[0] === near[1]) castShadow(st, shade, [p, q, [q[0] + nx * 2, q[1] + ny * 2], [p[0] + nx * 2, p[1] + ny * 2]], near[0], drop);
  };
  for (const shape of [...land.patches.map((p) => p.shape), ...land.ramps.map((r) => r.shape)]) {
    const ring = outlineOf(shape);
    ring.forEach((a, i) => {
      const c = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 1) return;
      // The way across the line that is towards the camera.
      const side = c[0] - a[0] > 0 ? 1 : -1;
      const nx = (-(c[1] - a[1]) / len) * side;
      const ny = ((c[0] - a[0]) / len) * side;
      // Seen from the end, a drop shows nothing.
      if (ny < 0.03) return;
      // The line is walked a short piece at a time, because what is on either side of it changes
      // along the way; a run of pieces with the same drop is one face.
      const steps = Math.max(1, Math.ceil(len / 150));
      let run: Drop | null = null;
      const done = () => {
        if (run) riser(run, nx, ny);
        run = null;
      };
      for (let n = 0; n < steps; n++) {
        const p: Point = [a[0] + ((c[0] - a[0]) * n) / steps, a[1] + ((c[1] - a[1]) * n) / steps];
        const q: Point = [a[0] + ((c[0] - a[0]) * (n + 1)) / steps, a[1] + ((c[1] - a[1]) * (n + 1)) / steps];
        const key = [p, q].map((e) => `${Math.round(e[0])},${Math.round(e[1])}`).sort().join("|");
        const at = (t: number, towards: number) => land.heightAt(p[0] + (q[0] - p[0]) * t + nx * towards * 14, p[1] + (q[1] - p[1]) * t + ny * towards * 14);
        const near: [number, number] = [at(0.04, 1), at(0.96, 1)];
        const far: [number, number] = [at(0.04, -1), at(0.96, -1)];
        // Only a drop towards the camera shows its face, and only if it is there all along this piece.
        if (seen.has(key) || at(0.5, -1) - at(0.5, 1) < 6 || far[0] < near[0] || far[1] < near[1]) {
          done();
          continue;
        }
        seen.add(key);
        const level = near[0] === near[1] && far[0] === far[1];
        if (run && level && run.near[1] === near[0] && run.far[1] === far[0] && run.near[0] === near[0] && run.far[0] === far[0]) run.q = q;
        else {
          done();
          run = { p, q, near, far };
          if (!level) done();
        }
      }
      done();
    });
  }
  for (const r of risers.sort((p, q) => p.near - q.near)) r.draw();

  // A whisper of shade towards the corners pulls the eye to the hole.
  ground.save();
  ground.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [mx, my] = st.at(frame.x + frame.w / 2, frame.y + frame.h / 2);
  const corner = ground.createRadialGradient(mx, my, Math.min(frame.w, frame.h * k) * s * 0.45, mx, my, Math.hypot(frame.w, frame.h * k) * s * 0.75);
  corner.addColorStop(0, "rgba(0, 20, 6, 0)");
  corner.addColorStop(1, "rgba(0, 20, 6, 0.32)");
  ground.fillStyle = corner;
  ground.fillRect(0, 0, width, height);
  ground.restore();

  // ---- Rails ---------------------------------------------------------------------------------------
  // A rail is cut into lengths wherever the ground under it changes height, so that it steps down
  // with a terrace and climbs with a ramp. Each length is a block of its own: which of them is in
  // front of a ball is asked length by length.
  const props: Prop[] = [];
  const railTops: { foot: Point[]; top: number }[] = [];
  for (const rail of look.rails) {
    const wall = wallOf(rail.wall);
    if (!wall) continue;
    const closed = wall.closed === true;
    // The rail's two long edges: the wall's own line (which the ball touches) and the far side.
    const [from, to] = rail.side === "left" ? [0, -rail.width] : rail.side === "right" ? [0, rail.width] : [-rail.width / 2, rail.width / 2];
    const lineA = offset(wall.points, closed, from);
    const lineC = offset(wall.points, closed, to);
    const n = wall.points.length;
    const count = closed ? n : n - 1;
    interface Length {
      foot: Point[];
      /** The ground beyond each long edge at each end, and the top of the rail at each end. */
      a: [number, number];
      c: [number, number];
      top: [number, number];
      segment: number;
    }
    const lengths: Length[] = [];
    const laidFrom = st.at(wall.points[0]![0], wall.points[0]![1]);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % n;
      const [a0, a1, c0, c1] = [lineA[i]!, lineA[j]!, lineC[i]!, lineC[j]!];
      const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      if (len < 1) continue;
      // Away from the rail's body, on the wall's side of it.
      const ex = (a1[0] - a0[0]) / len;
      const ey = (a1[1] - a0[1]) / len;
      const awayA = Math.sign(from - to);
      // The ground beside the rail: the solid ground, so that beside water or sand it stands on the bank.
      const beside = land.bankAt;
      const beyond = (edge: [Point, Point], t: number, away: number, at = beside) => at(edge[0][0] + (edge[1][0] - edge[0][0]) * t - ey * away * 30, edge[0][1] + (edge[1][1] - edge[0][1]) * t + ex * away * 30);
      const steps = Math.max(1, Math.ceil(len / 320));
      const eps = Math.min(0.02, 6 / len);
      let run: Length | null = null;
      for (let m = 0; m < steps; m++) {
        const [t0, t1] = [m / steps, (m + 1) / steps];
        const a: [number, number] = [beyond([a0, a1], t0 + eps, awayA), beyond([a0, a1], t1 - eps, awayA)];
        const c: [number, number] = [beyond([c0, c1], t0 + eps, -awayA), beyond([c0, c1], t1 - eps, -awayA)];
        // It stands on whichever side is higher.
        const top: [number, number] = [Math.max(a[0], c[0]) + rail.height, Math.max(a[1], c[1]) + rail.height];
        const lerp = (p: Point, q: Point, t: number): Point => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const level = a[0] === a[1] && c[0] === c[1];
        // A level stretch is one length, however long; a climbing one is a run of short ones.
        if (run && level && top[0] === top[1] && run.top[1] === top[0] && run.a[0] === a[0] && run.a[1] === a[0] && run.c[0] === c[0] && run.c[1] === c[0]) {
          run.foot[1] = lerp(a0, a1, t1);
          run.foot[2] = lerp(c0, c1, t1);
          continue;
        }
        run = { foot: [lerp(a0, a1, t0), lerp(a0, a1, t1), lerp(c0, c1, t1), lerp(c0, c1, t0)], a, c, top, segment: i };
        lengths.push(run);
        if (!level || top[0] !== top[1]) run = null;
      }
    }
    lengths.forEach((l, at) => {
      const before = lengths[at - 1] ?? (closed ? lengths.at(-1) : undefined);
      const next = lengths[at + 1] ?? (closed ? lengths[0] : undefined);
      // An end is only seen where the rail stops, or steps down to a lower length.
      const endShows = [!before || before === l || before.top[1] < l.top[0] - 1, !next || next === l || next.top[0] < l.top[1] - 1];
      const turn = Math.atan2((l.foot[1]![1] - l.foot[0]![1]) * k, l.foot[1]![0] - l.foot[0]![0]);
      const paint: Paint = { texture: RAIL[rail.material], turn };
      const low = [l.a[0], l.a[1], l.c[1], l.c[0]];
      const high = [l.top[0], l.top[1], l.top[1], l.top[0]];
      railTops.push({ foot: l.foot, top: Math.max(...l.top) });
      const joint = before && before !== l && before.segment !== l.segment;
      props.push({
        ...blockLike(st, l.foot, Math.min(...low), Math.max(...high)),
        shadow: (st, into) => {
          // The shadow lies on the ground the light pushes it towards: inside the rail or outside it.
          const [p, q, far] = [l.foot[0]!, l.foot[1]!, l.foot[3]!];
          const towardsA = (p[0] + q[0] - 2 * far[0]) * SHADOW[0] + (p[1] + q[1] - 2 * far[1]) * SHADOW[1] > 0;
          const on = towardsA ? Math.min(...l.a) : Math.min(...l.c);
          castShadow(st, into, l.foot, on, Math.max(...l.top) - on);
        },
        draw: (st) => {
          const top = prism(st, l.foot, low, high, { side: paint, top: paint, topShade: 0.07, ink: null, anchor: laidFrom, skip: [false, !endShows[1], false, !endShows[0]] });
          const { ctx } = st;
          const corners = top.map((p, i) => st.at(p[0], p[1], high[i]!));
          // The two long edges of the top: a dark line, and inside it a pale one where the corner catches the light.
          for (const [colour, inward] of [["rgba(24, 14, 4, 0.55)", 0], ["rgba(255, 244, 214, 0.3)", 1]] as const) {
            const mx = (corners[0]![0] + corners[1]![0] + corners[2]![0] + corners[3]![0]) / 4;
            const my = (corners[0]![1] + corners[1]![1] + corners[2]![1] + corners[3]![1]) / 4;
            const nudge = (p: Point): Point => {
              const far = Math.hypot(mx - p[0], my - p[1]) || 1;
              return [p[0] + ((mx - p[0]) / far) * inward, p[1] + ((my - p[1]) / far) * inward];
            };
            ctx.lineWidth = 1;
            ctx.strokeStyle = colour;
            ctx.beginPath();
            for (const [u, v] of [[0, 1], [3, 2]] as const) {
              const [p, q] = [nudge(corners[u]!), nudge(corners[v]!)];
              ctx.moveTo(p[0], p[1]);
              ctx.lineTo(q[0], q[1]);
            }
            ctx.stroke();
          }
          // And a dark one along the foot of whichever long side faces the camera.
          const feet = l.foot.map((p, i) => st.at(p[0], p[1], low[i]!));
          const [u, v] = l.foot[0]![1] + l.foot[1]![1] > l.foot[2]![1] + l.foot[3]![1] ? [0, 1] : [3, 2];
          if (Math.abs(l.foot[0]![1] + l.foot[1]![1] - l.foot[2]![1] - l.foot[3]![1]) > 1) {
            ctx.beginPath();
            ctx.moveTo(feet[u]![0], feet[u]![1]);
            ctx.lineTo(feet[v]![0], feet[v]![1]);
            ctx.strokeStyle = "rgba(24, 14, 4, 0.6)";
            ctx.stroke();
          }
          if (joint) {
            // The joint where two lengths are mitred.
            ctx.beginPath();
            ctx.moveTo(corners[0]![0], corners[0]![1]);
            ctx.lineTo(corners[3]![0], corners[3]![1]);
            ctx.strokeStyle = "rgba(30, 16, 4, 0.55)";
            ctx.stroke();
          }
        },
      });
    });
  }

  // ---- Everything else that stands up ---------------------------------------------------------------
  for (const block of look.blocks) {
    const wall = wallOf(block.wall);
    if (!wall) continue;
    // It stands on whatever is under its middle.
    const mx = wall.points.reduce((sum, p) => sum + p[0], 0) / wall.points.length;
    const my = wall.points.reduce((sum, p) => sum + p[1], 0) / wall.points.length;
    props.push(blockProp(st, wall.points, block, land.bankAt(mx, my)));
  }
  /** How high whatever stands at a point is: a hose is draped over the rails it crosses. */
  const over = (x: number, y: number) => {
    for (const r of railTops) if (inPolygon(r.foot, x, y)) return r.top;
    return -Infinity;
  };
  for (const t of look.tunnels) {
    const tunnel = world.tunnels?.find((w) => w.id === t.id);
    if (tunnel) props.push(...tunnelProps(st, tunnel, t, over));
  }
  for (const d of look.decor) props.push(...decorProps(st, d, land.heightAt(d.x, d.y)));
  const ordered = farthestFirst(props);

  // The shadows of all of it, as one shape, so that where two overlap the ground is no darker.
  for (const p of ordered) p.shadow(st, shade);
  ground.save();
  ground.shadowColor = "rgba(4, 22, 8, 0.35)";
  ground.shadowBlur = blur(2.5);
  ground.fillStyle = "rgba(4, 22, 8, 0.36)";
  ground.fill(shade, "nonzero");
  ground.restore();

  for (const p of ordered) p.draw(st);
  return { canvas, land, props: ordered, glints };
}

/** The outline and box of a plain block, for a prop that draws itself. */
function blockLike(st: Stage, foot: Point[], z0: number, z1: number): Pick<Prop, "foot" | "box" | "hull" | "thin"> {
  const corners = [...foot.map((p) => st.at(p[0], p[1], z0)), ...foot.map((p) => st.at(p[0], p[1], z1))];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return { foot, hull: hull(corners), box: [Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3], thin: false };
}
