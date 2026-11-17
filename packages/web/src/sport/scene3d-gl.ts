// The three.js half of the 3-D table sports (see scene3d.ts, which loads this on demand).
//
// The camera is the one the flat drawing has always looked through: orthographic and tipped back
// from straight overhead by `tilt`, so a point of the world lands on exactly the pixel that
// `projection.ts` says. That is what lets the same aim, the same streaks and the same pointer
// maths work on top of this scene unchanged.
//
// Scene units are world units / 1000, with x to the right, up as height and z towards the viewer
// (the world's y). A quarter turn of the table (a hole laid on its side to fit a phone) is a turn
// of the group everything stands in; the camera and the light never move.
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Fog,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PCFShadowMap,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Scene,
  Shape as Outline,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  TubeGeometry,
  CatmullRomCurve3,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Point, Shape } from "@journey-to-code/physics";
import type { SportBody, SportDecor, SportMaterial, SportSurface, SportTone } from "@journey-to-code/games";
import { toneColour, type Disc } from "./draw";
import { landOf } from "./paint/terrain";
import type { Frame3d, Sport3d } from "./scene3d";
import { buildAlley, type Alley } from "./alley3d";

const K = 0.001;
/** The way the light travels, in the flat drawing's frame (x right, y towards you, z up), and so here too. */
const LIGHT = new Vector3(0.44, -0.846, 0.3);
const UP = new Vector3(0, 1, 0);

// ---- Textures ------------------------------------------------------------------------------------
// Everything is drawn from a few small canvases: boards, grass, stones. They are made the first
// time a surface is used and shared by every table after.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function texture(size: number, paint: (g: CanvasRenderingContext2D, n: () => number) => void, seed = 7): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  paint(g, rng(seed));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
export const shade = (hex: string, by: number) => {
  const c = new Color(hex);
  c.offsetHSL(0, 0, by);
  return `#${c.getHexString()}`;
};

type Grain = "boards" | "grass" | "stones" | "grit" | "none";
function grain(kind: Grain, base: string): Texture | null {
  if (kind === "none") return null;
  return texture(256, (g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    if (kind === "boards") {
      // Boards run the length of the table (up the picture), four to a tile.
      for (let i = 0; i < 4; i++) {
        g.fillStyle = shade(base, (n() - 0.5) * 0.07);
        g.fillRect(i * 64, 0, 64, 256);
        g.fillStyle = shade(base, -0.13);
        g.fillRect(i * 64, 0, 2, 256);
        g.fillStyle = shade(base, 0.04);
        g.fillRect(i * 64 + 2, 0, 1, 256);
      }
      g.globalAlpha = 0.18;
      for (let i = 0; i < 60; i++) {
        g.fillStyle = shade(base, -0.2);
        g.fillRect(n() * 256, n() * 256, 1, 8 + n() * 40);
      }
    } else if (kind === "grass") {
      for (let i = 0; i < 2400; i++) {
        g.globalAlpha = 0.25 + n() * 0.3;
        g.fillStyle = shade(base, (n() - 0.5) * 0.16);
        g.fillRect(n() * 256, n() * 256, 1.5, 2 + n() * 3);
      }
    } else if (kind === "stones") {
      g.strokeStyle = shade(base, -0.16);
      g.lineWidth = 3;
      for (let y = 0; y < 256; y += 64) {
        g.strokeRect(0, y, 256, 64);
        for (let x = (y / 64) % 2 ? 32 : 0; x < 256; x += 64) {
          g.fillStyle = shade(base, (n() - 0.5) * 0.08);
          g.fillRect(x + 2, y + 2, 60, 60);
        }
      }
    } else {
      for (let i = 0; i < 1800; i++) {
        g.globalAlpha = 0.3 + n() * 0.3;
        g.fillStyle = shade(base, (n() - 0.5) * 0.2);
        g.fillRect(n() * 256, n() * 256, 1 + n() * 2, 1 + n() * 2);
      }
    }
    g.globalAlpha = 1;
  });
}

interface Look {
  color: string;
  grain: Grain;
  /** How many world units one tile of the texture covers. */
  tile: number;
  rough: number;
  see?: number;
  shine?: number;
}
const SURFACES: Record<SportSurface, Look> = {
  green: { color: "#3f9a3c", grain: "grass", tile: 2600, rough: 0.95 },
  rough: { color: "#4f8a34", grain: "grass", tile: 2000, rough: 1 },
  slope: { color: "#4aa243", grain: "grass", tile: 2600, rough: 0.95 },
  lawn: { color: "#4c9b40", grain: "grass", tile: 3200, rough: 1 },
  sand: { color: "#e0c98f", grain: "grit", tile: 1800, rough: 1 },
  gravel: { color: "#a39d92", grain: "grit", tile: 1800, rough: 1 },
  soil: { color: "#6d4a33", grain: "grit", tile: 2200, rough: 1 },
  water: { color: "#2f78b4", grain: "none", tile: 1000, rough: 0.12, see: 0.9, shine: 0.7 },
  felt: { color: "#1e7a52", grain: "grit", tile: 800, rough: 1 },
  wood: { color: "#b98a55", grain: "boards", tile: 1100, rough: 0.6 },
  deck: { color: "#a77b4f", grain: "boards", tile: 1100, rough: 0.8 },
  lane: { color: "#dcb67c", grain: "boards", tile: 1090, rough: 0.28, shine: 0.45 },
  paving: { color: "#b3aa9b", grain: "stones", tile: 2400, rough: 0.95 },
};
const SOLIDS: Record<SportMaterial, string> = { timber: "#8a5a2b", brick: "#a9523a", stone: "#8d8a82", cushion: "#23845a" };
const BLOCKS: Record<string, string> = { rock: "#8b8a85", brick: "#a9523a", timber: "#8a5a2b", planter: "#7a5236", pot: "#c06a3c", stone: "#9a968c", castle: "#c9b48a", crate: "#a07a45" };

const surfaces = new Map<SportSurface, MeshStandardMaterial>();
export function surfaceMaterial(s: SportSurface): MeshStandardMaterial {
  let m = surfaces.get(s);
  if (m) return m;
  const l = SURFACES[s] ?? SURFACES.green;
  const map = grain(l.grain, l.color);
  if (map) map.repeat.set(1 / l.tile, 1 / l.tile);
  m = new MeshStandardMaterial({ color: map ? "#ffffff" : l.color, map, roughness: l.rough, metalness: l.shine ? 0.05 : 0, transparent: l.see !== undefined, opacity: l.see ?? 1 });
  surfaces.set(s, m);
  return m;
}
const plain = new Map<string, MeshStandardMaterial>();
export function paint(color: string, rough = 0.8, metal = 0): MeshStandardMaterial {
  const key = `${color}/${rough}/${metal}`;
  let m = plain.get(key);
  if (!m) plain.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
}

// ---- Geometry ------------------------------------------------------------------------------------
function outline(s: Shape): Outline {
  const o = new Outline();
  if ("points" in s) s.points.forEach(([x, y], i) => (i ? o.lineTo(x, -y) : o.moveTo(x, -y)));
  else o.absarc(s.x, -s.y, s.r, 0, Math.PI * 2, false);
  return o;
}
/** A patch of the ground, in its top plane, facing up. */
export function patch(s: Shape): BufferGeometry {
  return new ShapeGeometry(outline(s), 36).rotateX(-Math.PI / 2);
}
/** A shape stood up from the ground to `height`. */
function prism(s: Shape, height: number): BufferGeometry {
  return new ExtrudeGeometry(outline(s), { depth: height, bevelEnabled: false, curveSegments: 36 }).rotateX(-Math.PI / 2);
}
export function rectangle(x: number, y: number, w: number, h: number): Shape {
  return { points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
}

export const mesh = (g: BufferGeometry, m: Material, shadows = true) => {
  const o = new Mesh(g, m);
  o.castShadow = shadows;
  o.receiveShadow = true;
  return o;
};
export const at = (o: Object3D, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  return o;
};

/** How high the ground is at a point of the world: flat unless a table has terraces or slopes. */
export type Ground = (x: number, y: number) => number;
const level: Ground = () => 0;
/** Pieces a long rail is cut into, so it can stand on ground that changes height along it. */
const RAIL_STEP = 400;

/**
 * A rail: a box along each segment of the wall, beside the line the ball stops at, with the joints
 * filled. Where the ground beside it isn't level (a terrace part of the way along), a segment is cut
 * into short pieces, each standing on the ground on the ball's side of it.
 */
function rail(points: Point[], width: number, height: number, side: "left" | "right" | "both", closed: boolean, material: Material, ground: Ground = level): Group {
  const g = new Group();
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) continue;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    const off = side === "both" ? 0 : (side === "left" ? 1 : -1) * (width / 2);
    const cx = (x0 + x1) / 2 + dy * off;
    const cy = (y0 + y1) / 2 - dx * off;
    // The ball's side of the line, where the ground it stands on is.
    const inX = side === "left" ? -dy : side === "right" ? dy : 0;
    const inY = side === "left" ? dx : side === "right" ? -dx : 0;
    const sample = (t: number) => ground(x0 + (x1 - x0) * t + inX * (width / 2 + 20), y0 + (y1 - y0) * t + inY * (width / 2 + 20));
    const pieces = ground === level ? 1 : Math.max(1, Math.ceil(len / RAIL_STEP));
    const heights = Array.from({ length: pieces }, (_, k) => sample((k + 0.5) / pieces));
    if (heights.every((h) => h === heights[0])) {
      const b = mesh(new BoxGeometry(len + (closed ? 0 : width), height, width), material);
      b.position.set(cx, heights[0]! + height / 2, cy);
      b.rotation.y = -Math.atan2(dy, dx);
      g.add(b);
      continue;
    }
    for (let k = 0; k < pieces; k++) {
      const piece = len / pieces;
      const t = (k + 0.5) / pieces;
      const b = mesh(new BoxGeometry(piece + (k === 0 || k === pieces - 1 ? (closed ? 0 : width / 2) : 0) + 2, height, width), material);
      b.position.set(cx + (x1 - x0) * (t - 0.5), heights[k]! + height / 2, cy + (y1 - y0) * (t - 0.5));
      b.rotation.y = -Math.atan2(dy, dx);
      g.add(b);
    }
  }
  return g;
}

/** A patch of the ground laid over a slope: its top plane tilted to the ground's height at each point. */
function tilted(s: Shape, ground: Ground, lift: number): BufferGeometry {
  const g = patch(s);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)) + lift);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** The face of a step down: a wall of stone along a ledge, on its low side, as high as the drop. */
function stepFace(points: Point[], drop: number, ground: Ground, material: Material): Group {
  const g = new Group();
  const thick = 70;
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) continue;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    // A ledge has the high ground on its left: the face looks out over the right, the low side.
    const ox = -dy * (thick / 2);
    const oy = dx * (thick / 2);
    const foot = ground((x0 + x1) / 2 - dy * 120, (y0 + y1) / 2 + dx * 120);
    const b = mesh(new BoxGeometry(len, drop, thick), material);
    b.position.set((x0 + x1) / 2 + ox, foot + drop / 2, (y0 + y1) / 2 + oy);
    b.rotation.y = -Math.atan2(dy, dx);
    g.add(b);
  }
  return g;
}

/** Arrows on the ground pointing downhill across a slope, one every so often, darker than what they're on. */
function downhill(s: Shape, pull: Point, ground: Ground, lift: number): Group {
  const g = new Group();
  const pts = "points" in s ? s.points : [[s.x - s.r, s.y - s.r], [s.x + s.r, s.y + s.r]] as Point[];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.min(900, (x1 - x0) * 0.4, (y1 - y0) * 0.4);
  if (size < 120) return g;
  const arrow = new Outline();
  arrow.moveTo(size, 0);
  arrow.lineTo(-size * 0.6, size * 0.65);
  arrow.lineTo(-size * 0.25, 0);
  arrow.lineTo(-size * 0.6, -size * 0.65);
  arrow.lineTo(size, 0);
  const shape = new ShapeGeometry(arrow).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false });
  const angle = Math.atan2(pull[1], pull[0]);
  const step = size * 2.6;
  for (let y = y0 + step / 2; y < y1; y += step)
    for (let x = x0 + step / 2; x < x1; x += step) {
      if ("points" in s && !insidePolygon(s.points, x, y)) continue;
      const m = new Mesh(shape, material);
      m.position.set(x, ground(x, y) + lift, y);
      m.rotation.y = -angle;
      g.add(m);
    }
  return g;
}
function insidePolygon(points: Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const SOIL = "#6b4a2e";
/** A tunnel: a hole in the ground and a mound where it comes up, a pipe lying on the grass, or a hose. */
function tunnelOf(kind: "pipe" | "hose" | "burrow", mouth: Point, r: number, out: Point, path: Point[] | undefined, ground: Ground, lift: number): Group {
  const g = new Group();
  if (kind === "burrow") {
    const hole = new Mesh(new CircleOf(r * 0.92), paint("#140e09", 1));
    hole.position.set(mouth[0], ground(...mouth) + lift + 4, mouth[1]);
    g.add(hole);
    const rim = new Mesh(new RingGeometry(r * 0.9, r * 1.3, 28).rotateX(-Math.PI / 2), paint(SOIL, 1));
    rim.position.set(mouth[0], ground(...mouth) + lift + 6, mouth[1]);
    rim.receiveShadow = true;
    g.add(rim);
    // The molehill: a low heap of soil with the hole in its top that the ball pops out of.
    const hill = mesh(new SphereGeometry(r * 1.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint(SOIL, 1));
    hill.scale.set(1, 0.32, 1);
    hill.position.set(out[0], ground(...out) + lift, out[1]);
    g.add(hill);
    const top = new Mesh(new CircleOf(r * 0.45), paint("#140e09", 1));
    top.position.set(out[0], ground(...out) + lift + r * 0.37, out[1]);
    g.add(top);
    return g;
  }
  const line = path && path.length >= 2 ? path : [mouth, out];
  const radius = kind === "pipe" ? r * 0.95 : 150;
  const curve = new CatmullRomCurve3(line.map(([x, y]) => new Vector3(x, ground(x, y) + lift + radius, y)), false, "catmullrom", kind === "pipe" ? 0 : 0.5);
  const tube = mesh(new TubeGeometry(curve, Math.max(8, line.length * 12), radius, 18, false), paint(kind === "pipe" ? "#7d8a8f" : "#3f8f3a", kind === "pipe" ? 0.45 : 0.7, kind === "pipe" ? 0.4 : 0));
  (tube.material as MeshStandardMaterial).side = DoubleSide;
  g.add(tube);
  return g;
}
/** A flat disc facing up. */
class CircleOf extends RingGeometry {
  constructor(r: number) {
    super(0, r, 28);
    this.rotateX(-Math.PI / 2);
  }
}

// ---- Bodies --------------------------------------------------------------------------------------
const ballMaps = new Map<string, Texture>();
/** A ball's skin: its colour with a seam round it and a few flecks, so that its rolling shows. */
function ballSkin(tone: SportTone | undefined): Texture {
  const colour = toneColour(tone);
  let t = ballMaps.get(colour);
  if (!t) {
    t = texture(256, (g, n) => {
      g.fillStyle = colour;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = shade(colour, 0.12);
      g.fillRect(0, 118, 256, 20);
      g.fillStyle = shade(colour, -0.16);
      for (let i = 0; i < 46; i++) {
        g.beginPath();
        g.arc(n() * 256, n() * 256, 2 + n() * 4, 0, Math.PI * 2);
        g.fill();
      }
    }, 31);
    ballMaps.set(colour, t);
  }
  return t;
}

let pinGeometry: BufferGeometry | null = null;
/** A ten-pin: the real silhouette, white with two red bands on the neck. Radius 1, height 1. */
export function pinMesh(): BufferGeometry {
  if (pinGeometry) return pinGeometry;
  const profile: [number, number][] = [[0, 0], [0.62, 0], [0.66, 0.02], [0.78, 0.1], [0.92, 0.22], [1, 0.3], [0.95, 0.38], [0.78, 0.5], [0.56, 0.62], [0.42, 0.72], [0.4, 0.78], [0.5, 0.86], [0.58, 0.93], [0.52, 0.98], [0, 1]];
  const g = new LatheGeometry(profile.map(([r, h]) => new Vector2(r, h)), 28);
  const pos = g.getAttribute("position");
  const colours: number[] = [];
  const white = new Color("#fbf7ee");
  const red = new Color("#c2312c");
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const band = (h > 0.755 && h < 0.8) || (h > 0.815 && h < 0.86);
    const c = band ? red : white;
    colours.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return (pinGeometry = g);
}
export const pinMaterial = new MeshPhysicalMaterial({ vertexColors: true, emissive: "#3a3630", roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 });

interface Thing {
  group: Group;
  last: Point;
  home: Point;
  skin: Mesh | null;
  marker: Mesh | null;
  kind: string;
  height: number;
  r: number;
  ghost: boolean;
  rolls: boolean;
  tone: SportTone | undefined;
  stem?: Mesh;
  /** A pin going over: when it began, which way (a unit vector on the ground), and a twist of its own. */
  fall?: { at: number; hx: number; hy: number; twist: number };
}

const markerMaterial = new MeshBasicMaterial({ color: "#ffd45a", transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false });

function makeThing(d: Disc): Thing {
  const kind = d.look?.kind ?? "ball";
  const r = d.r;
  const group = new Group();
  let skin: Mesh | null = null;
  const height = d.look?.height ?? (kind === "pin" ? 3800 : kind === "toadstool" ? 450 : r * 2);
  const stuff: Thing = { group, last: [d.x, d.y], home: [d.x, d.y], skin: null, marker: null, kind, height, r, ghost: !!d.ghost, rolls: false, tone: d.look?.tone };
  if (kind === "pin") {
    skin = mesh(pinMesh(), pinMaterial);
    skin.scale.set(r, height, r);
    group.add(skin);
  } else if (kind === "toadstool") {
    const capColour = toneColour(d.look?.tone ?? "red");
    const stem = mesh(new CylinderGeometry(r * 0.42, r * 0.5, height * 0.75, 20), paint("#efe6d0"));
    stem.position.y = height * 0.375;
    const cap = mesh(new SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint(capColour, 0.55));
    cap.scale.set(r, height * 0.55, r);
    cap.position.y = height * 0.5;
    group.add(stem, cap);
    const spots = rng(Math.round(r + height));
    for (let i = 0; i < 7; i++) {
      const a = spots() * Math.PI * 2;
      const up = 0.25 + spots() * 0.55;
      const s = mesh(new SphereGeometry(r * 0.1, 8, 6), paint("#fffdf4"), false);
      const ring = Math.cos(up * 1.2);
      s.position.set(Math.cos(a) * r * 0.86 * ring, height * 0.5 + Math.sin(up * 1.2) * height * 0.55 * 0.92, Math.sin(a) * r * 0.86 * ring);
      group.add(s);
    }
    stuff.stem = stem;
  } else if (d.look && d.look.height && (!/^(ball|cue|striker)$/.test(kind) || d.look.height < r)) {
    // A bumper or a peg: a short post in its own colour. A flat disc too (a carrom piece, its
    // striker): a post lower than it is wide.
    skin = mesh(new CylinderGeometry(r, r, height, 24), paint(toneColour(d.look.tone), 0.5));
    skin.position.y = height / 2;
    group.add(skin);
  } else {
    const m = new MeshPhysicalMaterial({ map: ballSkin(d.look?.tone), roughness: 0.22, clearcoat: 0.85, clearcoatRoughness: 0.15 });
    if (d.ghost) {
      m.transparent = true;
      m.opacity = 0.4;
      m.depthWrite = false;
    }
    skin = mesh(new SphereGeometry(1, 36, 24), m, !d.ghost);
    skin.scale.setScalar(r);
    skin.position.y = r;
    group.add(skin);
    stuff.rolls = true;
  }
  stuff.skin = skin;
  group.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = !d.ghost) : null));
  return stuff;
}

// ---- Scenery -------------------------------------------------------------------------------------
function flagpole(group: Group, high: number) {
  group.add(at(mesh(new CylinderGeometry(28, 28, high, 8), paint("#f4f1e8", 0.4)), 0, high / 2, 0));
  const pennant = new Outline();
  pennant.moveTo(0, 0);
  pennant.lineTo(high * 0.34, high * 0.07);
  pennant.lineTo(0, high * 0.16);
  const flag = new Mesh(new ShapeGeometry(pennant), new MeshBasicMaterial({ color: "#d8352b", side: DoubleSide }));
  flag.position.set(22, high * 0.82, 0);
  flag.name = "pennant";
  group.add(flag);
}

function decorOf(d: SportDecor): Group {
  const g = new Group();
  const r = d.r ?? 600;
  const high = d.height;
  const tone = d.tone ? toneColour(d.tone) : undefined;
  const add = (o: Object3D, x = 0, y = 0, z = 0) => {
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const sphere = (rad: number, colour: string, x: number, y: number, z: number, sy = 1) => {
    const m = mesh(new SphereGeometry(rad, 16, 12), paint(colour, 0.85));
    m.scale.y = sy;
    return add(m, x, y, z);
  };
  switch (d.kind) {
    case "tee":
      add(mesh(new CylinderGeometry(r || 420, r || 420, 18, 24), paint("#3d443a", 0.9), false), 0, 14, 0);
      break;
    case "doormat": {
      const w = d.length ?? 2400;
      add(mesh(new BoxGeometry(w, 40, w * 0.6), paint("#8c6a45", 1)), 0, 20, 0);
      break;
    }
    case "gnome": {
      const h = high ?? 1700;
      add(mesh(new CylinderGeometry(h * 0.18, h * 0.24, h * 0.42, 14), paint("#3b6ea8", 0.7)), 0, h * 0.21, 0);
      sphere(h * 0.15, "#f2c9a4", 0, h * 0.5, 0);
      sphere(h * 0.12, "#f4f4f4", 0, h * 0.4, h * 0.07, 1.2);
      add(mesh(new ConeGeometry(h * 0.16, h * 0.42, 14), paint("#d3302b", 0.6)), 0, h * 0.78, 0);
      break;
    }
    case "flowerpot": {
      const h = high ?? 900;
      add(mesh(new CylinderGeometry(r * 0.9, r * 0.6, h, 18), paint("#c4693b", 0.8)), 0, h / 2, 0);
      sphere(r * 0.8, tone ?? "#e5558a", 0, h + r * 0.35, 0, 0.7);
      break;
    }
    case "flowers": {
      const n = rng(Math.round(d.x * 7 + d.y * 3));
      for (let i = 0; i < 6; i++) {
        const a = n() * Math.PI * 2;
        const rad = n() * r * 0.8;
        const h = 260 + n() * 220;
        add(mesh(new CylinderGeometry(9, 9, h, 5), paint("#3a7a2c"), false), Math.cos(a) * rad, h / 2, Math.sin(a) * rad);
        sphere(70 + n() * 40, ["#f2d03b", "#e8548a", "#f4f1ea", "#9b6fd3"][i % 4]!, Math.cos(a) * rad, h, Math.sin(a) * rad);
      }
      break;
    }
    case "bush":
      sphere(r, tone ?? "#2f7a2a", 0, r * 0.6, 0, 0.8);
      sphere(r * 0.7, "#3a8a33", r * 0.55, r * 0.45, r * 0.2, 0.8);
      sphere(r * 0.65, "#2a6f26", -r * 0.5, r * 0.4, -r * 0.2, 0.8);
      break;
    case "tree": {
      const h = high ?? r * 4;
      add(mesh(new CylinderGeometry(r * 0.16, r * 0.22, h * 0.45, 10), paint("#6a4a2c")), 0, h * 0.225, 0);
      sphere(r * 0.9, "#2f7a2a", 0, h * 0.62, 0);
      sphere(r * 0.65, "#3a8a33", r * 0.3, h * 0.82, 0);
      break;
    }
    case "rock": {
      const m = mesh(new DodecahedronGeometry(r, 0), paint("#8f8d86", 0.95));
      m.scale.y = 0.65;
      add(m, 0, r * 0.45, 0);
      break;
    }
    case "steppingstone":
      add(mesh(new CylinderGeometry(r, r * 1.05, 40, 18), paint("#a8a398", 0.95), false), 0, 20, 0);
      break;
    case "lilypad":
      add(mesh(new CylinderGeometry(r, r, 16, 20), paint("#4a9a3a", 0.8), false), 0, 22, 0);
      break;
    case "wateringcan":
      add(mesh(new CylinderGeometry(r * 0.55, r * 0.6, r * 1.1, 16), paint("#3f78b5", 0.5, 0.2)), 0, r * 0.55, 0);
      add(mesh(new CylinderGeometry(r * 0.07, r * 0.1, r * 1.1, 8), paint("#3f78b5", 0.5, 0.2)), r * 0.8, r * 0.7, 0).rotation.z = -0.9;
      break;
    case "bench": {
      const w = d.length ?? r * 3;
      add(mesh(new BoxGeometry(w, 60, r * 0.8), paint("#946a3a")), 0, r * 0.7, 0);
      add(mesh(new BoxGeometry(w, r * 0.6, 50), paint("#946a3a")), 0, r * 1.05, -r * 0.35);
      for (const s of [-1, 1]) add(mesh(new BoxGeometry(50, r * 0.7, r * 0.7), paint("#5b4026")), s * w * 0.4, r * 0.35, 0);
      break;
    }
    case "wheelbarrow":
      add(mesh(new BoxGeometry(r * 1.8, r * 0.5, r * 1.1), paint("#4a8a4a", 0.6)), 0, r * 0.7, 0);
      add(mesh(new CylinderGeometry(r * 0.32, r * 0.32, 50, 16), paint("#222")), r * 1.0, r * 0.32, 0).rotation.x = Math.PI / 2;
      break;
    case "bricks": {
      for (let i = 0; i < 6; i++) add(mesh(new BoxGeometry(r * 0.7, r * 0.3, r * 0.35), paint("#b35a3c")), ((i % 3) - 1) * r * 0.75, r * 0.15 + Math.floor(i / 3) * r * 0.3, 0);
      break;
    }
    case "bucket":
      add(mesh(new CylinderGeometry(r * 0.85, r * 0.6, r * 1.2, 18), paint(tone ?? "#d8453a", 0.5)), 0, r * 0.6, 0);
      break;
    case "spade":
      add(mesh(new BoxGeometry(r * 0.5, 30, r * 1.2), paint("#8a8f94", 0.4, 0.4)), 0, 30, 0);
      add(mesh(new CylinderGeometry(14, 14, r * 1.6, 6), paint("#946a3a")), 0, 60, -r * 1.2).rotation.x = Math.PI / 2;
      break;
    case "shell":
      sphere(r * 0.6, "#f0b9b0", 0, r * 0.2, 0, 0.45);
      break;
    case "fish":
      sphere(r * 0.7, "#f08a2b", 0, 40, 0, 0.35);
      break;
    case "reeds":
      for (let i = 0; i < 7; i++) add(mesh(new CylinderGeometry(10, 16, 900 + i * 70, 5), paint("#6a8a36"), false), (i - 3) * r * 0.18, 450, ((i * 37) % 5) * r * 0.1);
      break;
    case "duck":
      sphere(r * 0.6, "#f4d03a", 0, r * 0.45, 0, 0.8);
      sphere(r * 0.3, "#f4d03a", r * 0.45, r * 0.85, 0);
      add(mesh(new ConeGeometry(r * 0.12, r * 0.3, 8), paint("#ee8a2a")), r * 0.8, r * 0.82, 0).rotation.z = -Math.PI / 2;
      break;
    case "birdbath":
      add(mesh(new CylinderGeometry(r * 0.25, r * 0.35, r * 1.4, 14), paint("#b9b5aa")), 0, r * 0.7, 0);
      add(mesh(new CylinderGeometry(r * 0.9, r * 0.45, r * 0.35, 20), paint("#b9b5aa")), 0, r * 1.5, 0);
      break;
    case "molehill":
      add(mesh(new SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint("#5c3d28", 1)), 0, 0, 0).scale.y = 0.5;
      break;
    case "poolring":
      add(mesh(new TorusGeometry(r * 0.8, r * 0.22, 12, 28), paint(tone ?? "#f2a93a", 0.4)), 0, r * 0.22, 0).rotation.x = Math.PI / 2;
      break;
    case "hosereel":
      add(mesh(new CylinderGeometry(r * 0.7, r * 0.7, r * 0.5, 20), paint("#2f6a3a")), 0, r * 0.7, 0).rotation.x = Math.PI / 2;
      break;
    case "plank":
      add(mesh(new BoxGeometry(d.length ?? 2400, 40, r * 0.6), paint("#946a3a")), 0, 20, 0);
      break;
    case "flag":
      flagpole(g, high ?? 4200);
      break;
    default:
      add(mesh(new CylinderGeometry(r * 0.5, r * 0.5, high ?? r, 12), paint("#9a9a9a")), 0, (high ?? r) / 2, 0);
  }
  if (d.angle) g.rotation.y = -(d.angle * Math.PI) / 18000;
  return g;
}

// ---- The scene -----------------------------------------------------------------------------------
export function build(canvas: HTMLCanvasElement): Sport3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    built = "";
  });

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 600);
  // Bowling's camera: behind the bowler, down the lane, following the ball towards the pins.
  // The near plane is well out from the camera (nothing comes closer than the ball at the bowler's
  // feet), so the lane laid a few units over the floor never fights it for depth on a phone.
  const chase = new PerspectiveCamera(40, 1, 3, 300);
  /** The far end of the alley fades into the dark a little. */
  const haze = new Fog("#0a0d18", 70, 260);
  /** Where the chasing camera is (world y) and when it was last moved, so it eases rather than jumps. */
  const chaseAt = { y: Number.NaN, time: 0 };
  const guideLayer = new Group();
  let guideShown: Point[] | null = null;
  const guideMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false });
  const guideShadow = new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28, depthWrite: false });
  const turn = new Group();
  turn.scale.setScalar(K);
  scene.add(turn);
  scene.add(new AmbientLight(0xffffff, 1.25));
  scene.add(new HemisphereLight(0xdfeeff, 0x6a5a3a, 0.7));
  const sun = new DirectionalLight(0xfff3dc, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  let stat: Group | null = null;
  let built = "";
  const things = new Map<string, Thing>();
  const dynamic = new Group();
  turn.add(dynamic);
  turn.add(guideLayer);
  let size = "";
  let cupFlags: Object3D[] = [];
  /** How high the ground of the table being shown is, at a point. */
  let ground: Ground = level;
  /** The bowling alley round the lane, when the table is seen from behind the bowler. */
  let alley: Alley | null = null;

  function clear(group: Group) {
    group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    group.removeFromParent();
  }

  function buildStatic(table: Frame3d["table"], bowling: boolean) {
    if (stat) clear(stat);
    cupFlags = [];
    const { look, world } = table;
    const land = landOf(table, 0);
    const hilly = land.ramps.length > 0 || look.ground.some((p) => (p.level ?? 0) > 0);
    ground = hilly ? land.heightAt : level;
    const g = new Group();
    const f = look.frame;
    const pad = Math.max(f.w, f.h) * 1.5;
    // Seen from behind the bowler, the lane stands in a bowling alley: gutters that are really
    // sunk, the lanes either side, the pit and the masking units, a ceiling. The alley is built
    // round the lane; what the lane itself has on it (bumpers, sand, blocks) is still laid here.
    alley = bowling ? buildAlley(table) : null;
    if (alley) {
      g.add(alley.group);
      ground = alley.ground;
    } else {
      // Everything stands on one base that runs on as far as the screen does.
      const base = mesh(patch(rectangle(f.x - pad, f.y - pad, f.w + 2 * pad, f.h + 2 * pad)), surfaceMaterial(look.base), false);
      base.receiveShadow = true;
      g.add(base);
    }
    let layer = 1;
    const lay = (shape: Shape, surface: SportSurface, level = 0, on: Ground | null = null) => {
      // A patch with no level of its own lies on the ground under it (sand on a terrace).
      const under = on && "points" in shape ? Math.max(0, Math.min(...shape.points.map(([x, y]) => on(x, y)))) : 0;
      const high = level + under + layer++ * 3;
      const m = mesh(level > 0 ? prism(shape, level) : patch(shape), surfaceMaterial(surface), false);
      m.position.y = level > 0 ? layer * 3 : high;
      m.receiveShadow = true;
      if (surface === "water") m.renderOrder = 2;
      g.add(m);
    };
    for (const p of look.ground) {
      // The alley has its own floor under the gutters.
      if (alley && p.surface === "deck") continue;
      lay(p.shape, p.surface, p.level);
    }
    for (const r of look.regions) {
      const region = world.regions.find((x) => x.id === r.id);
      if (!region) continue;
      // The gutters and the pit are the alley's, sunk below the lane and not painted on it.
      if (alley && (r.id === "pit" || r.id.startsWith("gutter"))) continue;
      // A slope that rises is laid as a tilted plane; the rest lie flat on what they're set in.
      if (land.ramps.some((x) => x.id === r.id)) {
        const m = mesh(tilted(region.shape, ground, layer++ * 3), surfaceMaterial(r.surface), false);
        m.receiveShadow = true;
        g.add(m);
      } else if (r.surface === "slope" && region.slope) {
        // A slope that doesn't rise (on a bowling lane) is the lane itself, marked with arrows downhill.
        g.add(downhill(region.shape, region.slope, ground, layer * 3 + 4));
      } else lay(region.shape, r.surface, 0, ground);
    }
    const walls = new Map(world.walls.map((w) => [w.id, w]));
    for (const r of look.rails) {
      const w = walls.get(r.wall);
      if (w) g.add(rail(w.points, r.width, r.height, r.side, !!w.closed, paint(SOLIDS[r.material], 0.75), ground));
    }
    for (const l of look.ledges) {
      const w = walls.get(l.wall);
      if (w) g.add(stepFace(w.points, l.drop, ground, paint(SOLIDS[l.material], 0.9)));
    }
    for (const t of look.tunnels) {
      const w = world.tunnels?.find((x) => x.id === t.id);
      if (w) g.add(tunnelOf(t.kind, [w.x, w.y], w.r, t.out ?? w.to, t.path, ground, layer * 3));
    }
    for (const b of look.blocks) {
      const w = walls.get(b.wall);
      if (!w) continue;
      const m = mesh(prism({ points: w.points }, b.height), paint(BLOCKS[b.kind] ?? "#8b8a85", 0.9));
      // On whatever it stands on: the highest ground under its corners.
      m.position.y = Math.max(0, ...w.points.map(([x, y]) => ground(x, y)));
      g.add(m);
    }
    for (const p of world.pockets) {
      const cup = look.pockets === "cup";
      const z = ground(p.x, p.y);
      g.add(at(mesh(new CylinderGeometry(p.r, p.r, 12, 28), paint("#0c0c0a", 1), false), p.x, z + layer * 3 + 6, p.y));
      const rim = new Mesh(new RingGeometry(p.r * 0.98, p.r * 1.3, 28).rotateX(-Math.PI / 2), paint(cup ? "#e9e6dc" : "#4a3322", 0.5));
      rim.position.set(p.x, z + layer * 3 + 10, p.y);
      rim.receiveShadow = true;
      g.add(rim);
      if (cup) {
        const pole = new Group();
        pole.position.set(p.x, z + layer * 3, p.y);
        flagpole(pole, 4200);
        pole.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = true) : null));
        g.add(pole);
        cupFlags.push(pole);
      }
    }
    for (const d of look.decor) {
      const o = decorOf(d);
      o.position.set(d.x, ground(d.x, d.y) + layer * 3, d.y);
      g.add(o);
    }
    stat = g;
    turn.add(g);
  }

  function sync(frame: Frame3d) {
    const seen = new Set<string>();
    const { time } = frame;
    for (const d of frame.discs) {
      seen.add(d.id);
      let t = things.get(d.id);
      if (!t || t.ghost !== !!d.ghost || t.kind !== (d.look?.kind ?? "ball") || t.r !== d.r) {
        if (t) dynamic.remove(t.group);
        t = makeThing(d);
        things.set(d.id, t);
        dynamic.add(t.group);
      }
      const { group } = t;
      // Into a cup or down a tunnel, it sinks and shrinks out of sight.
      const down = d.sunk ?? d.gone ?? 0;
      const lift = down ? -down * d.r * 2 : 0;
      group.position.set(d.x, ground(d.x, d.y) + lift, d.y);
      group.scale.setScalar(down ? 1 - down * 0.35 : 1);
      if (t.kind === "pin") {
        // A pin that's knocked goes over the way it was knocked, all the way down in a moment, and
        // turns as it goes; one that is back on its spot (a new frame) stands again.
        const dx = d.x - t.home[0];
        const dy = d.y - t.home[1];
        const away = Math.hypot(dx, dy);
        if (away < d.r * 0.08) t.fall = undefined;
        else if (!t.fall && away > d.r * 0.3) {
          const mx = d.x - t.last[0];
          const my = d.y - t.last[1];
          const run = Math.hypot(mx, my);
          const [hx, hy] = run > 1 ? [mx / run, my / run] : [dx / away, dy / away];
          t.fall = { at: time, hx, hy, twist: ((d.id.charCodeAt(d.id.length - 1) * 37) % 100) / 100 - 0.5 };
        }
        const lean = t.fall ? (frame.still ? 1.45 : Math.min(1.45, ((time - t.fall.at) / 260) * 1.45)) : Math.min(0.25, Math.max(0, (away - d.r * 0.1) / (d.r * 2)));
        if (lean > 0) {
          const [hx, hy] = t.fall ? [t.fall.hx, t.fall.hy] : [dx / (away || 1), dy / (away || 1)];
          const heading = new Vector3(hx, 0, hy).normalize();
          const toward = UP.clone().multiplyScalar(Math.cos(lean)).add(heading.multiplyScalar(Math.sin(lean)));
          group.quaternion.setFromUnitVectors(UP, toward.normalize());
          if (t.fall) group.quaternion.multiply(new Quaternion().setFromAxisAngle(UP, t.fall.twist * Math.min(1, (time - t.fall.at) / 500) * 2));
          group.position.y += Math.sin(lean) * d.r * 0.9;
        } else group.quaternion.identity();
      } else if (t.kind === "toadstool") {
        const s = 1 + (d.struck ?? 0) * 0.14;
        group.scale.set(s, 1 / s, s);
      } else if (t.rolls && t.skin) {
        // It rolls: turned about the horizontal line across its way by how far it has gone.
        const mx = d.x - t.last[0];
        const my = d.y - t.last[1];
        const run = Math.hypot(mx, my);
        if (run > 0.01 && run < d.r * 8) {
          const axis = new Vector3(my, 0, -mx).normalize();
          t.skin.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis, run / d.r));
        }
      }
      t.last = [d.x, d.y];
      // Your ball wears a ring on the ground, so that it can be found among the others.
      if (d.mine && !t.marker) {
        t.marker = new Mesh(new RingGeometry(d.r * 1.35, d.r * 1.65, 36).rotateX(-Math.PI / 2), markerMaterial);
        t.marker.position.y = 14;
        group.add(t.marker);
      } else if (!d.mine && t.marker) {
        group.remove(t.marker);
        t.marker = null;
      }
      if (t.marker) {
        const pulse = frame.still ? 1 : 1 + Math.sin(time / 260) * 0.08;
        t.marker.scale.set(pulse, 1, pulse);
      }
    }
    for (const [id, t] of things) {
      if (seen.has(id)) continue;
      dynamic.remove(t.group);
      things.delete(id);
    }
    // The pennants stir.
    for (const p of cupFlags) {
      const flag = p.getObjectByName("pennant");
      if (flag) flag.rotation.y = frame.still ? 0 : Math.sin(time / 420) * 0.35;
    }
  }

  let broken = "";
  /** Camera, light, bodies, then one frame. */
  /** The guide on the lane: chalk dots along the path, rebuilt only when the path changes. */
  function showGuide(path: Point[] | null) {
    if (path === guideShown) return;
    guideShown = path;
    clear(guideLayer);
    guideLayer.clear();
    turn.add(guideLayer);
    if (!path || path.length < 2) return;
    const dot = new CircleOf(150);
    const under = new CircleOf(210);
    let gone = 0;
    for (let i = 1; i < path.length; i++) {
      gone += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
      if (gone < 1400) continue;
      gone = 0;
      const [x, y] = path[i]!;
      const z = ground(x, y);
      const shadow = new Mesh(under, guideShadow);
      shadow.position.set(x, z + 8, y);
      const m = new Mesh(dot, guideMaterial);
      m.position.set(x, z + 10, y);
      guideLayer.add(shadow, m);
    }
  }

  const draw = (frame: Frame3d) => {
    const { proj, width, height, table } = frame;
    if (frame.bowler) {
      // Behind the bowler: low over the foul line looking up the lane at the pins, and, while a
      // ball rolls, following it down to a little short of them, to watch them go.
      const ball = table.world.bodies.find((b) => !b.fixed && b.id === "ball");
      const foul = ball ? ball.y : table.look.frame.y + table.look.frame.h;
      const stop = Math.max(table.look.frame.y, 0) + 15000;
      const wanted = frame.bowler.follow === null ? foul + 12500 : Math.max(stop, Math.min(foul + 12500, frame.bowler.follow + 12500));
      const dt = chaseAt.time ? Math.min(0.1, (frame.time - chaseAt.time) / 1000) : 1;
      chaseAt.time = frame.time;
      // Following a ball it keeps up; back to the foul line afterwards it's brisk, so the next bowler isn't kept waiting.
      chaseAt.y = Number.isNaN(chaseAt.y) || frame.still ? wanted : chaseAt.y + (wanted - chaseAt.y) * Math.min(1, dt * (frame.bowler.follow === null ? 7 : 5));
      const high = frame.bowler.follow === null ? 7200 : 5600;
      chase.aspect = width / Math.max(1, height);
      chase.fov = width < height ? 46 : 34;
      chase.position.set(0, high * K, chaseAt.y * K);
      chase.lookAt(0, 0, Math.max(-6000, chaseAt.y - 40000) * K);
      chase.updateProjectionMatrix();
      turn.rotation.y = 0;
      showGuide(frame.bowler.guide);
      scene.fog = haze;
      alley?.play(frame.time, frame.still);
      const f = table.look.frame;
      const centre = new Vector3((f.x + f.w / 2) * K, 0, (f.y + f.h / 2) * K);
      const radius = Math.hypot(f.w, f.h) * 0.52 * K + 2;
      sun.target.position.copy(centre);
      sun.position.copy(centre).addScaledVector(LIGHT, -60);
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -radius;
      cam.right = cam.top = radius;
      cam.near = 1;
      cam.far = 140;
      cam.updateProjectionMatrix();
      sync(frame);
      renderer.render(scene, chase);
      return true;
    }
    showGuide(null);
    scene.fog = null;
    // The camera is projection.ts, in three's terms: a point of the world is where `project` puts it.
    const s = proj.scale;
    camera.left = (-proj.ox / s) * K;
    camera.right = ((width - proj.ox) / s) * K;
    camera.top = (proj.oy / s) * K;
    camera.bottom = (-(height - proj.oy) / s) * K;
    const reach = 220;
    camera.position.set(0, Math.cos(proj.tilt) * reach, Math.sin(proj.tilt) * reach);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    turn.rotation.y = (-proj.turn * Math.PI) / 2;

    // The sun stays where it is on the screen: it follows the middle of the table.
    const f = table.look.frame;
    const centre = new Vector3((f.x + f.w / 2) * K, 0, (f.y + f.h / 2) * K).applyAxisAngle(UP, turn.rotation.y);
    const radius = Math.hypot(f.w, f.h) * 0.52 * K + 2;
    sun.target.position.copy(centre);
    sun.position.copy(centre).addScaledVector(LIGHT, -60);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.near = 1;
    cam.far = 140;
    cam.updateProjectionMatrix();

    sync(frame);
    renderer.render(scene, camera);
    return true;
  };

  const api: Sport3d = {
    supports: () => true,
    render(frame) {
      if (lost) return false;
      const { width, height, dpr, table } = frame;
      const next = `${width}|${height}|${dpr}`;
      if (next !== size) {
        size = next;
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
      }
      // A table this scene can't build (a map somebody made that has something it doesn't expect)
      // is left to the flat drawing, and not tried again until the table changes.
      if (broken === table.key) return false;
      try {
        // The same lane is built differently from behind the bowler (an alley round it) and from above.
        const want = `${table.key}|${frame.bowler ? "alley" : ""}`;
        if (built !== want) {
          built = want;
          things.clear();
          dynamic.clear();
          buildStatic(table, !!frame.bowler);
        }
        return draw(frame);
      } catch {
        broken = table.key;
        built = "";
        return false;
      }
    },
    dispose() {
      if (stat) clear(stat);
      renderer.dispose();
    },
  };
  return api;
}
