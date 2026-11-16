// The three.js half of the 3-D board (see board3d.ts, which loads this on demand).
//
// The camera is the one the CSS transform in board3d.ts describes: an eye straight in front of the
// middle of the board's box, `PERSPECTIVE` board-widths back, with the board tipped away from it by
// `TILT`. A square of the board therefore lands on exactly the pixels its button does, which is
// what lets the buttons stay where they are and be the thing that is tapped.
//
// One scene serves every game that is a plain board with pieces on it. What the board is made of
// and what a piece looks like go by the game (`surface` and `pieceOf`, below): a turned chess set
// on walnut, draughtsmen on green and buff, Reversi's two-faced discs on baize, Go stones on the
// crossings of a kaya board, noughts and crosses chalked on a slate, Drop Four's discs in their
// blue rack. A game this file hasn't been taught still gets a board and plain counters.
//
// Scene units are squares. The board lies in a group that is turned to the tilt; inside it x runs
// across the board, z down it towards the player, and y stands up off it.
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  TorusGeometry,
  MeshStandardMaterial,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PERSPECTIVE, SCALE, SHIFT, TILT, type Board3d, type BoardFrame3d, type Piece3d } from "./board3d";

// ---- The set -------------------------------------------------------------------------------------
// Each piece is turned on a lathe from a profile (radius, height), the way a real one is, with
// whatever a lathe can't make (a rook's battlements, a king's cross, a knight's head) added on.
// All of them stand on the same foot. Heights are in squares.
type Profile = [r: number, y: number][];
const FOOT: Profile = [[0, 0], [0.36, 0], [0.385, 0.03], [0.385, 0.07], [0.34, 0.11], [0.3, 0.13], [0.29, 0.17]];
const turn = (profile: Profile) => new LatheGeometry([...FOOT, ...profile].map(([r, y]) => new Vector2(r, y)), 32);
const moved = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
/** Lathe geometry has UVs and indices that the added shapes may not: bring them all to one form to join them. */
function join(parts: BufferGeometry[]): BufferGeometry {
  const plain = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    g.deleteAttribute("uv");
    return g;
  });
  const out = mergeGeometries(plain)!;
  out.computeVertexNormals();
  return out;
}

function pieceShape(kind: string): BufferGeometry {
  switch (kind) {
    case "rook": {
      const body = turn([[0.21, 0.22], [0.19, 0.58], [0.26, 0.62], [0.27, 0.66], [0.27, 0.8], [0.19, 0.8], [0.19, 0.72], [0, 0.72]]);
      const merlons = Array.from({ length: 5 }, (_, i) => {
        const a = (i * Math.PI * 2) / 5;
        return moved(new BoxGeometry(0.13, 0.1, 0.085).rotateY(-a + Math.PI / 2), Math.cos(a) * 0.228, 0.845, Math.sin(a) * 0.228);
      });
      return join([body, ...merlons]);
    }
    case "bishop": {
      const body = turn([[0.17, 0.26], [0.115, 0.56], [0.2, 0.6], [0.2, 0.64], [0.13, 0.66], [0.165, 0.76], [0.175, 0.84], [0.14, 0.94], [0.075, 1.02], [0, 1.05]]);
      return join([body, moved(new SphereGeometry(0.052, 12, 10), 0, 1.08, 0)]);
    }
    case "queen": {
      const body = turn([[0.2, 0.28], [0.125, 0.7], [0.215, 0.75], [0.215, 0.79], [0.15, 0.81], [0.18, 0.92], [0.245, 1.03], [0.2, 1.05], [0.1, 1.07], [0, 1.09]]);
      const points = Array.from({ length: 8 }, (_, i) => moved(new SphereGeometry(0.043, 8, 6), Math.cos((i * Math.PI) / 4) * 0.225, 1.06, Math.sin((i * Math.PI) / 4) * 0.225));
      return join([body, ...points, moved(new SphereGeometry(0.065, 12, 10), 0, 1.14, 0)]);
    }
    case "king": {
      const body = turn([[0.21, 0.3], [0.135, 0.76], [0.225, 0.81], [0.225, 0.85], [0.16, 0.87], [0.195, 0.99], [0.24, 1.09], [0.18, 1.12], [0, 1.15]]);
      return join([body, moved(new BoxGeometry(0.058, 0.25, 0.058), 0, 1.26, 0), moved(new BoxGeometry(0.17, 0.058, 0.058), 0, 1.28, 0)]);
    }
    case "knight": {
      const collar = turn([[0.25, 0.24], [0.27, 0.27], [0.27, 0.3], [0.2, 0.32], [0, 0.32]]);
      // The horse's head and neck, cut out of a board and rounded off: it looks along +x.
      const s = new Shape();
      const outline: [number, number][] = [[-0.2, 0.3], [0.2, 0.3], [0.2, 0.44], [0.13, 0.56], [0.17, 0.63], [0.31, 0.64], [0.375, 0.7], [0.37, 0.79], [0.3, 0.87], [0.19, 0.95], [0.12, 1.0], [0.1, 1.09], [0.03, 1.02], [-0.07, 0.98], [-0.17, 0.86], [-0.23, 0.68], [-0.24, 0.48]];
      outline.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      const head = new ExtrudeGeometry(s, { depth: 0.17, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.045, bevelSegments: 3, curveSegments: 4 }).translate(0, 0, -0.085);
      return join([collar, head]);
    }
    default:
      // A pawn, and anything this set hasn't been taught.
      return join([turn([[0.16, 0.26], [0.125, 0.42], [0.19, 0.46], [0.19, 0.5], [0.12, 0.52]]), moved(new SphereGeometry(0.165, 20, 14), 0, 0.64, 0)]);
  }
}
const shapes = new Map<string, BufferGeometry>();
const shapeOf = (kind: string) => shapes.get(kind) ?? (shapes.set(kind, pieceShape(kind)), shapes.get(kind)!);

const IVORY = new MeshPhysicalMaterial({ color: "#f3e7cd", roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.25 });
const EBONY = new MeshPhysicalMaterial({ color: "#3a2a24", roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 });

// ---- The other sets --------------------------------------------------------------------------------
/** A piece's colour by name, as the engines give it: the two sides of most boards, and the bright ones. */
const TONES: Record<string, string> = { light: "#f3e7cd", dark: "#2c2420", red: "#c8372d", blue: "#2f6fd0", green: "#3f9a55", gold: "#f2c230" };
const lacquers = new Map<string, MeshPhysicalMaterial>();
/** A glossy painted or polished surface in a tone. */
function lacquer(tone: string | undefined, light: boolean): MeshPhysicalMaterial {
  const colour = TONES[tone ?? ""] ?? (light ? TONES.light! : TONES.dark!);
  let m = lacquers.get(colour);
  if (!m) lacquers.set(colour, (m = new MeshPhysicalMaterial({ color: colour, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.22 })));
  return m;
}
const GILT = new MeshPhysicalMaterial({ color: "#f2c14e", roughness: 0.3, metalness: 0.7, clearcoat: 0.4 });
const lathe = (profile: Profile, sides = 36) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), sides);
const solids = new Map<string, BufferGeometry>();
const solid = (key: string, make: () => BufferGeometry) => solids.get(key) ?? (solids.set(key, make()), solids.get(key)!);
/** A draughtsman: a low disc with a rim and a dished top. */
const MAN: Profile = [[0, 0], [0.37, 0], [0.39, 0.02], [0.39, 0.11], [0.37, 0.13], [0.31, 0.13], [0.29, 0.105], [0.12, 0.105], [0.1, 0.12], [0, 0.12]];

/**
 * What a piece looks like. Chess has its set; the rest are made here. The thing that comes back
 * stands on y = 0 at the middle of its square, and may be several meshes.
 */
function pieceOf(game: string, p: Piece3d): Object3D {
  const paint = lacquer(p.tone, p.light);
  const one = (g: BufferGeometry, m = paint as MeshPhysicalMaterial | MeshBasicMaterial) => new Mesh(g, m);
  if (game === "chess") return one(shapeOf(p.kind), p.light ? IVORY : EBONY);
  const g = new Group();
  if (p.kind === "man" || p.kind === "king") {
    g.add(one(solid("man", () => lathe(MAN))));
    if (p.kind === "king") {
      // Crowned: a second man on the first, with a gold band round it.
      const upper = one(solid("man", () => lathe(MAN)));
      upper.position.y = 0.13;
      const band = one(solid("band", () => new TorusGeometry(0.33, 0.028, 8, 32).rotateX(Math.PI / 2)), GILT);
      band.position.y = 0.265;
      g.add(upper, band);
    }
  } else if (p.kind === "stone") {
    // A Go stone: a lens, thick in the middle.
    const stone = one(solid("stone", () => new SphereGeometry(0.46, 28, 16)), p.light ? lacquer("light", true) : lacquer("dark", false));
    stone.scale.y = 0.4;
    stone.position.y = 0.17;
    g.add(stone);
  } else if (p.kind === "x") {
    for (const turn of [Math.PI / 4, -Math.PI / 4]) {
      const bar = one(solid("bar", () => new BoxGeometry(0.78, 0.12, 0.15)));
      bar.rotation.y = turn;
      bar.position.y = 0.07;
      g.add(bar);
    }
  } else if (p.kind === "o") {
    const ring = one(solid("ring", () => new TorusGeometry(0.27, 0.075, 12, 36).rotateX(Math.PI / 2)));
    ring.position.y = 0.08;
    g.add(ring);
  } else if (game === "reversi") {
    // Two-faced: its own colour up, the other side's underneath, so that it can be turned over.
    const up = one(solid("face", () => new CylinderGeometry(0.4, 0.4, 0.06, 36)));
    up.position.y = 0.09;
    const under = one(solid("face", () => new CylinderGeometry(0.4, 0.4, 0.06, 36)), lacquer(p.light ? "dark" : "light", !p.light));
    under.position.y = 0.03;
    g.add(up, under);
  } else {
    // A counter: Drop Four's discs, and anything this file hasn't been taught.
    const disc = one(solid("counter", () => lathe([[0, 0], [0.38, 0], [0.4, 0.02], [0.4, 0.13], [0.38, 0.15], [0.3, 0.15], [0.28, 0.125], [0, 0.125]])));
    g.add(disc);
  }
  return g;
}

// ---- The board -----------------------------------------------------------------------------------
/** The frame round the squares, in squares, and how thick the board is. */
const FRAME = 0.34;
const THICK = 0.2;
/** What each game's board is made of: the frame, and how its playing surface is painted. */
interface Surface {
  frame: string;
  grain: [string, string];
  inlay: string;
  ink: string;
  /** Paint the squares: `x`, `y` is the top left of the playing surface and `px` a square's side. */
  paint(g: CanvasRenderingContext2D, x: number, y: number, px: number, frame: BoardFrame3d, n: () => number): void;
}
/** Squares in two colours, each with a little grain of its own. */
const chequered = (light: string, dark: string, lightGrain: string, darkGrain: string): Surface["paint"] => (g, x0, y0, px, frame, n) => {
  for (let r = 0; r < frame.rows; r++)
    for (let c = 0; c < frame.cols; c++) {
      const shade = frame.shades?.[r * frame.cols + c];
      const pale = shade ? shade !== "dark" : (r + c) % 2 === 0;
      const x = x0 + c * px;
      const y = y0 + r * px;
      g.fillStyle = pale ? light : dark;
      g.fillRect(x, y, px, px);
      for (let i = 0; i < 9; i++) {
        g.globalAlpha = 0.05 + n() * 0.07;
        g.fillStyle = pale ? lightGrain : darkGrain;
        g.fillRect(x, y + n() * px, px, 1 + n() * 2);
      }
      g.globalAlpha = 1;
    }
};
/** One colour all over, with lines between the squares (or, on a board of crossings, through their middles). */
const ruled = (ground: string, line: string, wide: number, speckle: string): Surface["paint"] => (g, x0, y0, px, frame, n) => {
  const { cols, rows } = frame;
  g.fillStyle = ground;
  g.fillRect(x0, y0, cols * px, rows * px);
  for (let i = 0; i < cols * rows * 5; i++) {
    g.globalAlpha = 0.05 + n() * 0.06;
    g.fillStyle = speckle;
    g.fillRect(x0 + n() * cols * px, y0 + n() * rows * px, 1 + n() * (frame.points ? 40 : 2), 1 + n() * 2);
  }
  g.globalAlpha = 1;
  g.strokeStyle = line;
  g.lineWidth = wide;
  g.lineCap = "round";
  g.beginPath();
  const off = frame.points ? 0.5 : 0;
  for (let c = frame.points ? 0 : 1; c < cols; c++) {
    g.moveTo(x0 + (c + off) * px, y0 + off * px + (frame.points ? 0 : px * 0.08));
    g.lineTo(x0 + (c + off) * px, y0 + (rows - off) * px - (frame.points ? 0 : px * 0.08));
  }
  for (let r = frame.points ? 0 : 1; r < rows; r++) {
    g.moveTo(x0 + off * px + (frame.points ? 0 : px * 0.08), y0 + (r + off) * px);
    g.lineTo(x0 + (cols - off) * px - (frame.points ? 0 : px * 0.08), y0 + (r + off) * px);
  }
  g.stroke();
  // The marked crossings of a Go board.
  g.fillStyle = line;
  frame.shades?.forEach((shade, at) => {
    if (shade !== "spot") return;
    g.beginPath();
    g.arc(x0 + ((at % cols) + 0.5) * px, y0 + (Math.floor(at / cols) + 0.5) * px, px * (cols > 13 ? 0.13 : 0.09), 0, Math.PI * 2);
    g.fill();
  });
};
const WALNUT: Pick<Surface, "frame" | "grain" | "inlay" | "ink"> = { frame: "#4b2f1d", grain: ["#3a2315", "#5e3d27"], inlay: "#c9a56b", ink: "#e8cf9d" };
const SURFACES: Record<string, Surface> = {
  chess: { ...WALNUT, paint: chequered("#ecdcb9", "#a57a50", "#b99a68", "#6d4a2c") },
  checkers: { frame: "#2a2420", grain: ["#1d1815", "#3a322c"], inlay: "#d8c08a", ink: "#ead9ae", paint: chequered("#f0e6c8", "#2f6b4a", "#c9b98c", "#1f4a33") },
  reversi: { frame: "#20281f", grain: ["#161d16", "#2c372b"], inlay: "#9fb59a", ink: "#d6e3cf", paint: ruled("#2f8a5b", "rgba(10, 40, 26, 0.85)", 3, "#205f3f") },
  go: { frame: "#b88a45", grain: ["#a47a3a", "#c99b54"], inlay: "#8a6427", ink: "#3d2a10", paint: ruled("#dcb46a", "#2a1d0c", 2, "#b98f47") },
  tictactoe: { frame: "#b98a55", grain: ["#a37746", "#caa06c"], inlay: "#6a4a2a", ink: "#3d2a10", paint: ruled("#2b3a36", "rgba(244, 244, 236, 0.9)", 7, "#3d4f4a") },
  // The rack: blue, with a hole for every disc.
  dropfour: {
    frame: "#173f8c",
    grain: ["#123372", "#1c4aa2"],
    inlay: "#0e2a61",
    ink: "#dfe9ff",
    paint(g, x0, y0, px, frame) {
      g.fillStyle = "#1f55b5";
      g.fillRect(x0, y0, frame.cols * px, frame.rows * px);
      for (let r = 0; r < frame.rows; r++)
        for (let c = 0; c < frame.cols; c++) {
          const hole = g.createRadialGradient(x0 + (c + 0.5) * px, y0 + (r + 0.42) * px, px * 0.1, x0 + (c + 0.5) * px, y0 + (r + 0.5) * px, px * 0.43);
          hole.addColorStop(0, "#0c1f47");
          hole.addColorStop(1, "#08142f");
          g.fillStyle = hole;
          g.beginPath();
          g.arc(x0 + (c + 0.5) * px, y0 + (r + 0.5) * px, px * 0.43, 0, Math.PI * 2);
          g.fill();
        }
    },
  },
};
/** A game with no board of its own here: cream squares on walnut, chequered if the game says so. */
const PLAIN: Surface = { ...WALNUT, paint: (g, x, y, px, frame, n) => (frame.shades ? chequered("#ecdcb9", "#a57a50", "#b99a68", "#6d4a2c") : ruled("#ecdcb9", "rgba(60, 40, 20, 0.6)", 2, "#cdb98e"))(g, x, y, px, frame, n) };

function boardTexture(frame: BoardFrame3d): CanvasTexture {
  const { cols, rows, coords } = frame;
  const look = SURFACES[frame.game] ?? PLAIN;
  const px = cols > 13 ? 64 : 96;
  const edge = FRAME * px;
  const c = document.createElement("canvas");
  c.width = Math.round(cols * px + edge * 2);
  c.height = Math.round(rows * px + edge * 2);
  const g = c.getContext("2d")!;
  let seed = 1234567;
  const n = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  // The frame, with a line of inlay next to the squares.
  g.fillStyle = look.frame;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.12 + n() * 0.1;
    g.fillStyle = n() < 0.5 ? look.grain[0] : look.grain[1];
    g.fillRect(0, n() * c.height, c.width, 1 + n() * 2);
  }
  g.globalAlpha = 1;
  look.paint(g, edge, edge, px, frame, n);
  g.strokeStyle = look.inlay;
  g.lineWidth = 3;
  g.strokeRect(edge - 5, edge - 5, cols * px + 10, rows * px + 10);
  if (coords) {
    g.fillStyle = look.ink;
    g.font = `600 ${Math.round(edge * 0.62)}px Georgia, 'Times New Roman', serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    coords.cols.forEach((label, i) => g.fillText(label, edge + (i + 0.5) * px, c.height - edge / 2 + 1));
    coords.rows.forEach((label, i) => g.fillText(label, edge / 2, edge + (i + 0.5) * px + 1));
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let softDot: CanvasTexture | null = null;
/** A soft-edged disc: a shadow under the board, or the red under a king in check. */
function dotTexture(): CanvasTexture {
  if (softDot) return softDot;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const fade = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  fade.addColorStop(0, "rgba(255,255,255,1)");
  fade.addColorStop(0.55, "rgba(255,255,255,0.6)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, 128, 128);
  return (softDot = new CanvasTexture(c));
}

interface Standing {
  mesh: Object3D;
  /** What it was made as: its kind and colour. A piece that changes either is made again. */
  kind: string;
  light: boolean;
  tone: string | undefined;
  /** When it was put down, turned over to its other colour, or dropped into its column (ms; far in the past for none). */
  born: number;
  turned: number;
  fell: number;
  /** Where it is going, where it set off from and when, in squares. */
  to: [number, number];
  from: [number, number];
  since: number;
  /** Taken: when it began to go. */
  gone?: number;
}
const SLIDE = 260;
const ease = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

export function build(canvas: HTMLCanvasElement): Board3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
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
    boardKey = "";
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 100);
  scene.add(new AmbientLight(0xffffff, 1.5));
  const lamp = new DirectionalLight(0xfff4e0, 2.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1536, 1536);
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);

  /** The board and everything on it, turned to the tilt. */
  const table = new Group();
  table.rotation.x = Math.PI / 2 - (TILT * Math.PI) / 180;
  scene.add(table);
  const boardGroup = new Group();
  const marksGroup = new Group();
  const pieces = new Group();
  table.add(boardGroup, marksGroup, pieces);
  let boardKey = "";
  let marksKey = "";
  let cols = 8;
  let rows = 8;
  const standing = new Map<string, Standing>();
  let size = "";
  let dragging: { from: number; u: number; v: number } | null = null;
  const ray = new Raycaster();
  const ground = new Plane();
  const hit = new Vector3();

  /** The middle of a square, in the table's own coordinates. */
  const spot = (at: number): [number, number] => [(at % cols) + 0.5 - cols / 2, Math.floor(at / cols) + 0.5 - rows / 2];

  function buildBoard(frame: BoardFrame3d) {
    boardGroup.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    boardGroup.clear();
    const w = cols + FRAME * 2;
    const d = rows + FRAME * 2;
    const wood = new MeshStandardMaterial({ color: "#4b2f1d", roughness: 0.6 });
    const look = SURFACES[frame.game] ?? PLAIN;
    wood.color.set(look.frame);
    const top = new MeshStandardMaterial({ map: boardTexture(frame), roughness: frame.game === "tictactoe" ? 0.9 : 0.42 });
    const slab = new Mesh(new BoxGeometry(w, THICK, d), [wood, wood, top, wood, wood, wood]);
    slab.position.y = -THICK / 2;
    slab.receiveShadow = true;
    boardGroup.add(slab);
    // What the board leaves on the table under it.
    const shade = new Mesh(new PlaneGeometry(w * 1.3, d * 1.3).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: dotTexture(), color: "#000000", transparent: true, opacity: 0.5, depthWrite: false }));
    shade.position.set(0.2, -THICK - 0.02, 0.35);
    boardGroup.add(shade);
  }

  const gold = new MeshBasicMaterial({ color: "#f0c846", transparent: true, opacity: 0.5, depthWrite: false });
  const held = new MeshBasicMaterial({ color: "#f3cf4a", transparent: true, opacity: 0.85, depthWrite: false });
  const danger = new MeshBasicMaterial({ map: dotTexture(), color: "#e02a20", transparent: true, opacity: 0.95, depthWrite: false });
  const going = new MeshBasicMaterial({ color: "#1f4d3a", transparent: true, opacity: 0.6, depthWrite: false });
  const won = new MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.75, depthWrite: false });
  const must = new MeshBasicMaterial({ color: "#f08a2a", transparent: true, opacity: 0.9, depthWrite: false });
  const hint = new MeshBasicMaterial({ color: "#0c2b1c", transparent: true, opacity: 0.35, depthWrite: false });
  const ringed = new MeshBasicMaterial({ color: "#e0452f", transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
  const claimDark = new MeshBasicMaterial({ color: "#1b1613", transparent: true, opacity: 0.85, depthWrite: false });
  const claimLight = new MeshBasicMaterial({ color: "#fdf8ec", transparent: true, opacity: 0.9, depthWrite: false });
  const eye = new RingGeometry(0.14, 0.2, 24).rotateX(-Math.PI / 2);
  const claim = new PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
  const square = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const dot = new CircleGeometry(0.16, 24).rotateX(-Math.PI / 2);
  const hoop = new RingGeometry(0.4, 0.46, 40).rotateX(-Math.PI / 2);

  function buildMarks(frame: BoardFrame3d) {
    marksGroup.clear();
    const taken = new Set(frame.pieces.map((p) => p.at));
    const lay = (geometry: BufferGeometry, material: MeshBasicMaterial, at: number, lift: number) => {
      const m = new Mesh(geometry, material);
      const [x, z] = spot(at);
      m.position.set(x, lift, z);
      m.renderOrder = 1;
      marksGroup.add(m);
    };
    for (const m of frame.marks) {
      // On a board of crossings a square of colour would cover the lines: the stone last played
      // wears a small ring instead, the way it is marked on a Go board anywhere.
      if (m.mark === "from" || m.mark === "last") frame.points ? lay(eye, taken.has(m.at) ? ringed : gold, m.at, taken.has(m.at) ? 0.36 : 0.006) : lay(square, gold, m.at, 0.004);
      else if (m.mark === "threat") lay(square, danger, m.at, 0.006);
      else if (m.mark === "win") lay(square, won, m.at, 0.005);
      else if (m.mark === "must") lay(hoop, must, m.at, 0.008);
      else if (m.mark === "hint") lay(dot, hint, m.at, 0.008);
      else if (m.mark === "barred") lay(eye, danger, m.at, 0.008);
      else if (m.mark === "claimed") lay(claim, m.tone === "light" ? claimLight : claimDark, m.at, 0.01);
    }
    if (frame.picked !== null) lay(square, held, frame.picked, 0.005);
    for (const at of frame.targets) lay(taken.has(at) ? hoop : dot, going, at, 0.008);
    // A stone shown where it would go, before it is put down.
    if (frame.ghost) {
      const shade = pieceOf(frame.game, { at: frame.ghost.at, id: "ghost", kind: frame.ghost.kind, light: frame.ghost.tone === "light", near: true, tone: frame.ghost.tone });
      shade.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.material = (m.material as MeshPhysicalMaterial).clone();
        (m.material as MeshPhysicalMaterial).transparent = true;
        (m.material as MeshPhysicalMaterial).opacity = 0.55;
      });
      const [x, z] = spot(frame.ghost.at);
      shade.position.set(x, 0, z);
      marksGroup.add(shade);
    }
  }

  /** Nothing is animated on the first frame: the board is simply as it stands. */
  let begun = false;
  function place(p: Piece3d, frame: BoardFrame3d) {
    let s = standing.get(p.id);
    const to = spot(p.at);
    if (!s || s.kind !== p.kind || s.light !== p.light || s.tone !== p.tone) {
      // New to the board, a pawn that has become something else, or a disc turned to the other side.
      const from = s ? s.to : to;
      const lively = begun && !frame.still;
      const turned = !!s && s.kind === p.kind && (s.light !== p.light || s.tone !== p.tone);
      if (s) pieces.remove(s.mesh);
      const mesh = pieceOf(frame.game, p);
      mesh.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      s = { mesh, kind: p.kind, light: p.light, tone: p.tone, to, from, since: -1e9, born: !turned && lively && !frame.gravity ? frame.time : -1e9, turned: turned && lively ? frame.time : -1e9, fell: !turned && lively && frame.gravity ? frame.time : -1e9 };
      standing.set(p.id, s);
      pieces.add(mesh);
    }
    if (s.to[0] !== to[0] || s.to[1] !== to[1]) {
      s.from = [s.mesh.position.x, s.mesh.position.z];
      s.to = to;
      s.since = frame.still ? -1e9 : frame.time;
    }
    s.gone = undefined;
    // A knight looks up the board from its own side, turned a little so that its head is seen
    // from the side and not end on.
    s.mesh.rotation.y = frame.game === "chess" ? (p.near ? Math.PI / 2 : -Math.PI / 2) + 0.95 : 0;
  }

  function moveAll(frame: BoardFrame3d): boolean {
    let busy = false;
    for (const [id, s] of standing) {
      if (s.gone !== undefined) {
        // Taken: it sinks out of the way of what took it.
        const t = Math.min(1, (frame.time - s.gone) / 200);
        s.mesh.scale.setScalar(1 - t);
        if (t >= 1) {
          pieces.remove(s.mesh);
          standing.delete(id);
        } else busy = true;
        continue;
      }
      const t = Math.min(1, (frame.time - s.since) / SLIDE);
      const k = ease(t);
      const far = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
      // It is lifted over the board as it goes; a knight goes over the top of things.
      const hop = t < 1 ? Math.sin(t * Math.PI) * (s.kind === "knight" ? 0.55 : Math.min(0.22, far * 0.08)) : 0;
      s.mesh.position.set(s.from[0] + (s.to[0] - s.from[0]) * k, hop, s.from[1] + (s.to[1] - s.from[1]) * k);
      s.mesh.scale.setScalar(1);
      s.mesh.rotation.x = 0;
      // Just put down: it comes down onto the board.
      const down = (frame.time - s.born) / 150;
      if (down < 1) {
        s.mesh.position.y += (1 - down) * (1 - down) * 0.6;
        busy = true;
      }
      // Turned over to the other side: up, over and down again.
      const over = (frame.time - s.turned) / 380;
      if (over < 1) {
        s.mesh.rotation.x = (1 - ease(over)) * Math.PI;
        s.mesh.position.y += Math.sin(over * Math.PI) * 0.45;
        busy = true;
      }
      // Dropped into a rack: it runs down its column from the top, faster as it goes.
      const drop = (frame.time - s.fell) / (140 + 60 * (s.to[1] + rows / 2));
      if (drop < 1) {
        const top = -rows / 2 - 0.6;
        s.mesh.position.z = top + (s.to[1] - top) * drop * drop;
        busy = true;
      }
      if (t < 1) busy = true;
    }
    return busy;
  }

  return {
    drag(from, u = 0, v = 0) {
      dragging = from === null ? null : { from, u, v };
    },
    render(frame) {
      if (lost) return null;
      const { width, height, dpr } = frame;
      if (!width || !height || !frame.board) return null;
      try {
        const next = `${width}|${height}|${dpr}`;
        if (next !== size) {
          size = next;
          renderer.setPixelRatio(dpr);
          renderer.setSize(width, height, false);
        }
        cols = frame.cols;
        rows = frame.rows;
        // A square of the board is this many CSS pixels; everything else follows from the box.
        const unit = frame.board / cols;
        const eye = (frame.board * PERSPECTIVE) / unit;
        camera.aspect = width / height;
        camera.fov = (2 * Math.atan(height / unit / 2 / eye) * 180) / Math.PI;
        camera.position.set(0, 0, eye);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        table.position.y = -(SHIFT * frame.board) / unit;
        table.scale.setScalar(SCALE);
        table.updateMatrixWorld();
        // The lamp is over the player's left shoulder.
        lamp.position.set(-5, 6, 9);
        lamp.target.position.set(0, 0, 0);
        const reach = Math.max(cols, rows) * 0.8;
        const sc = lamp.shadow.camera;
        sc.left = sc.bottom = -reach;
        sc.right = sc.top = reach;
        sc.near = 1;
        sc.far = 30;
        sc.updateProjectionMatrix();

        const bKey = `${frame.game}|${frame.shades?.join("") ?? ""}|${cols}x${rows}|${frame.coords ? `${frame.coords.cols.join("")}|${frame.coords.rows.join("")}` : ""}`;
        if (bKey !== boardKey) {
          boardKey = bKey;
          buildBoard(frame);
        }
        const mKey = `${frame.marks.map((m) => `${m.at}${m.mark}${m.tone ?? ""}`).join(",")}|${frame.picked}|${frame.targets.join(",")}|${frame.pieces.map((p) => p.at).join(".")}|${frame.ghost ? `${frame.ghost.at}${frame.ghost.tone}` : ""}`;
        if (mKey !== marksKey) {
          marksKey = mKey;
          buildMarks(frame);
        }
        const seen = new Set<string>();
        for (const p of frame.pieces) {
          seen.add(p.id);
          place(p, frame);
        }
        for (const [id, s] of standing) {
          if (seen.has(id) || s.gone !== undefined) continue;
          if (frame.still) {
            pieces.remove(s.mesh);
            standing.delete(id);
          } else s.gone = frame.time + 120;
        }
        let busy = moveAll(frame);
        begun = true;

        // The piece in hand stands a little off the board; dragged, it goes where the pointer is.
        const inHand = frame.picked === null ? undefined : frame.pieces.find((p) => p.at === frame.picked);
        const lifted = inHand ? standing.get(inHand.id) : undefined;
        if (lifted) {
          lifted.mesh.position.y += 0.16;
          if (dragging && dragging.from === frame.picked) {
            // The ray from the eye through the pointer, met with a plane a little over the board.
            ray.setFromCamera(new Vector2(dragging.u * 2 - 1, 1 - dragging.v * 2), camera);
            const normal = new Vector3(0, 1, 0).transformDirection(table.matrixWorld);
            ground.setFromNormalAndCoplanarPoint(normal, table.localToWorld(new Vector3(0, 0.3, 0)));
            if (ray.ray.intersectPlane(ground, hit)) {
              table.worldToLocal(hit);
              lifted.mesh.position.set(Math.max(-cols / 2, Math.min(cols / 2, hit.x)), 0.3, Math.max(-rows / 2, Math.min(rows / 2, hit.z)));
              // Wherever it is let go it starts from there.
              lifted.from = [lifted.mesh.position.x, lifted.mesh.position.z];
              lifted.since = frame.time;
              if (!frame.still) busy = true;
            }
          }
        }
        renderer.render(scene, camera);
        return busy ? "busy" : "idle";
      } catch {
        lost = true;
        return null;
      }
    },
    dispose() {
      boardGroup.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      renderer.dispose();
    },
  };
}
