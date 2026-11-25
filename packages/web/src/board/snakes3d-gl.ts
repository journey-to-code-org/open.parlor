// The three.js half of Snakes & Ladders in 3-D (see snakes3d.ts, which loads this on demand).
//
// Scene units are squares. The board lies flat: x runs across it, z down it towards the player
// (the far row, 91 to 100, at the back), y stands up off it. The start row sits in front of
// square 1. The camera looks down on the whole board, and while a move is walked it leans in on
// the counter and follows it, then pulls back.
//
// What is in it:
// - the board, painted onto a canvas (tiles, numbers, the crown on 100) and laid on a wooden or
//   steel slab;
// - ladders of round rails and rungs, lifted off the board so they cast shadows;
// - snakes as tapering tubes along the same curve the flat board draws, the head reared up off
//   the board, with eyes and a tongue that flicks (or, in the parts store, hoses with brass
//   fittings);
// - stars and shields that float and turn, portals with a swirl;
// - the counters: a pawn, a rook, a duck, a robot, a rocket or a cat, glossy, in the seat's colour.
//
// A move: a hop a square (a puff of dust where it lands), a climb up the ladder (sparkles at the
// top), a ride down the snake's body after it rears and bites, a spiral into one portal and out of
// the other, and anyone swapped flying back over. The winner bounces under confetti.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  ShadowMaterial,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { play } from "../feedback/sounds";
import type { Pt3, SnakesCallbacks, SnakesFrame3d, SnakesScene3d } from "./snakes3d";

const COLS = 10;

const SEATS = [
  { body: "#e2483d", light: "#ff9d8c", dark: "#8c1c15" },
  { body: "#2f78e4", light: "#9cc8ff", dark: "#153f86" },
  { body: "#25a55c", light: "#93e6b2", dark: "#0f5a2e" },
  { body: "#f2b81f", light: "#ffe98f", dark: "#8d5f05" },
];
const SKINS = [
  { skin: "#3fae5a", dark: "#1b5a29", spot: "#f2d24b", belly: "#d4f5b0" },
  { skin: "#8b52cc", dark: "#3c1d69", spot: "#ffb3f5", belly: "#e7d2ff" },
  { skin: "#ef7f2e", dark: "#86370a", spot: "#3a1c06", belly: "#ffe1a8" },
  { skin: "#14a39c", dark: "#08504c", spot: "#ffd36b", belly: "#c4fff6" },
  { skin: "#d9443a", dark: "#6e140f", spot: "#1c1210", belly: "#ffc9b8" },
  { skin: "#3b6fd8", dark: "#142f6a", spot: "#ffe066", belly: "#cfe0ff" },
];
const HOSES = ["#2a2a2a", "#c0362c", "#2b2b2b", "#e0b116", "#24477f", "#2a2a2a"];

/** Where a cell's middle is in the scene, on the board's surface. */
const at = (cell: number) => new Vector3((cell % COLS) + 0.5 - COLS / 2, 0, Math.floor(cell / COLS) + 0.5 - COLS / 2);
/** A point of the flat board (squares from its top left) in the scene. */
const onBoard = (p: Pt3, y = 0) => new Vector3(p.x - COLS / 2, y, p.y - COLS / 2);
const ease = { out: (t: number) => 1 - (1 - t) ** 3, inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2), in: (t: number) => t * t, back: (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2 };

// ---- Materials and textures -----------------------------------------------------------------------

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** The board's face: a hundred tiles with their numbers, the start row, the crown on 100. */
function boardFace(f: SnakesFrame3d, px: number): CanvasTexture {
  const s = px / COLS;
  const { c, g } = canvasOf(px, Math.round(px * 1.1));
  g.fillStyle = f.store ? "#8d8a85" : "#b08e5f";
  g.fillRect(0, 0, c.width, c.height);
  for (const t of f.tiles) {
    const x = (t.cell % COLS) * s;
    const y = Math.floor(t.cell / COLS) * s;
    const finish = t.square === 100;
    // The tile's side, a shade under it, then its face with a shine.
    g.fillStyle = "rgba(60,38,15,0.35)";
    rounded(g, x + s * 0.03, y + s * 0.08, s * 0.94, s * 0.94, s * 0.12);
    g.fill();
    if (finish) {
      const gold = g.createRadialGradient(x + s * 0.35, y + s * 0.3, s * 0.05, x + s * 0.5, y + s * 0.5, s * 0.8);
      gold.addColorStop(0, "#fff6c2");
      gold.addColorStop(0.5, "#f6c945");
      gold.addColorStop(1, "#c58a0c");
      g.fillStyle = gold;
    } else g.fillStyle = t.tint;
    rounded(g, x + s * 0.03, y + s * 0.03, s * 0.94, s * 0.94, s * 0.12);
    g.fill();
    const shine = g.createLinearGradient(0, y, 0, y + s * 0.6);
    shine.addColorStop(0, "rgba(255,255,255,0.5)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = shine;
    rounded(g, x + s * 0.03, y + s * 0.03, s * 0.94, s * 0.55, s * 0.12);
    g.fill();
    if (f.store && !finish) {
      g.fillStyle = "rgba(245,232,200,0.55)";
      g.fillRect(x + s * 0.03, y + s * 0.44, s * 0.94, s * 0.12);
    }
    g.font = `800 ${Math.round(s * 0.26)}px system-ui, sans-serif`;
    g.textBaseline = "top";
    g.lineWidth = s * 0.06;
    g.lineJoin = "round";
    g.strokeStyle = finish ? "#f6c945" : t.tint;
    g.strokeText(String(t.square), x + s * 0.1, y + s * 0.09);
    g.fillStyle = finish ? "#6b4405" : "rgba(40,30,20,0.72)";
    g.fillText(String(t.square), x + s * 0.1, y + s * 0.09);
    if (t.square === 1) {
      g.font = `800 ${Math.round(s * 0.15)}px system-ui, sans-serif`;
      g.fillStyle = "rgba(40,30,20,0.55)";
      g.textAlign = "center";
      g.fillText("START", x + s * 0.5, y + s * 0.7);
      g.textAlign = "left";
    }
  }
  const hundred = f.tiles.find((t) => t.square === 100);
  if (hundred) crown(g, (hundred.cell % COLS) * s, Math.floor(hundred.cell / COLS) * s, s);
  // The start row: a pad for each seat, and the word.
  for (let seat = 0; seat < f.seats; seat++) {
    const x = seat * s + s / 2;
    const y = COLS * s + s * 0.5;
    g.fillStyle = SEATS[seat]!.light;
    g.globalAlpha = 0.45;
    g.beginPath();
    g.arc(x, y, s * 0.36, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = SEATS[seat]!.body;
    g.lineWidth = s * 0.06;
    g.stroke();
  }
  g.font = `800 ${Math.round(s * 0.32)}px system-ui, sans-serif`;
  g.fillStyle = f.store ? "#eef2f5" : "#fbe7c7";
  g.textAlign = "right";
  g.textBaseline = "middle";
  g.fillText("← START", COLS * s - s * 0.2, COLS * s + s * 0.5);
  return texture(c);
}
function crown(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const pts = [[0.28, 0.74], [0.34, 0.44], [0.44, 0.58], [0.5, 0.38], [0.56, 0.58], [0.66, 0.44], [0.72, 0.74]];
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(x + px! * s, y + py! * s) : g.moveTo(x + px! * s, y + py! * s)));
  g.closePath();
  g.fillStyle = "#fff8d6";
  g.fill();
  g.strokeStyle = "#a46d06";
  g.lineWidth = s * 0.025;
  g.stroke();
}

/** A snake's skin: diamonds down its back, repeated along it. */
function skinTexture(skin: (typeof SKINS)[number]): CanvasTexture {
  const { c, g } = canvasOf(128, 64);
  g.fillStyle = skin.skin;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = skin.belly;
  g.globalAlpha = 0.55;
  g.fillRect(0, 0, 128, 10);
  g.fillRect(0, 54, 128, 10);
  g.globalAlpha = 1;
  g.fillStyle = skin.spot;
  for (const cx of [32, 96]) {
    g.beginPath();
    g.moveTo(cx - 22, 32);
    g.lineTo(cx, 20);
    g.lineTo(cx + 22, 32);
    g.lineTo(cx, 44);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = skin.dark;
  g.globalAlpha = 0.25;
  for (let x = 0; x < 128; x += 8) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 4, 64);
    g.stroke();
  }
  const t = texture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}
/** A hose: ribs across it. */
function hoseTexture(colour: string): CanvasTexture {
  const { c, g } = canvasOf(64, 32);
  g.fillStyle = colour;
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = "rgba(255,255,255,0.14)";
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 5, 32);
  const t = texture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** A chip with words on it, standing over a target square. */
function chipSprite(label: string, colour: string): Sprite {
  const { c, g } = canvasOf(512, 128);
  g.font = "800 64px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  const w = Math.min(500, g.measureText(label).width + 64);
  const x = (512 - w) / 2;
  g.fillStyle = "#fffdf3";
  rounded(g, x - 6, 10, w + 12, 108, 54);
  g.fill();
  g.fillStyle = colour;
  rounded(g, x, 16, w, 96, 48);
  g.fill();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 256, 66);
  const sprite = new Sprite(new SpriteMaterial({ map: texture(c), depthTest: false, transparent: true }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ---- The things on the board ---------------------------------------------------------------------

const shiny = (colour: string, extra: Partial<ConstructorParameters<typeof MeshPhysicalMaterial>[0]> = {}) => new MeshPhysicalMaterial({ color: colour, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25, ...extra });
const matte = (colour: string, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) => new MeshStandardMaterial({ color: colour, roughness: 0.7, ...extra });
function cast<T extends Object3D>(o: T): T {
  o.traverse((m) => {
    if (m instanceof Mesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

/** A ladder of round rails and rungs, from one cell to another, lifted a little off the board. */
function ladder(from: Vector3, to: Vector3, store: boolean): Group {
  const g = new Group();
  const dir = to.clone().sub(from);
  const len = dir.length();
  const wood = store ? new MeshStandardMaterial({ color: "#8e979f", metalness: 0.75, roughness: 0.35 }) : matte("#9a5f2c", { roughness: 0.55 });
  const rungWood = store ? new MeshStandardMaterial({ color: "#b5bec6", metalness: 0.7, roughness: 0.3 }) : matte("#c0844a", { roughness: 0.5 });
  const rail = new CylinderGeometry(0.055, 0.055, len + 0.4, 10).rotateX(Math.PI / 2);
  for (const side of [-0.19, 0.19]) {
    const m = new Mesh(rail, wood);
    m.position.set(side, 0, 0);
    g.add(m);
  }
  const rungs = Math.max(3, Math.round(len / 0.36));
  const rung = new CylinderGeometry(0.035, 0.035, 0.38, 8).rotateZ(Math.PI / 2);
  for (let k = 0; k < rungs; k++) {
    const m = new Mesh(rung, rungWood);
    m.position.set(0, 0, -len / 2 + (len * (k + 0.5)) / rungs);
    g.add(m);
  }
  // Laid along the line from foot to top, a little off the board.
  g.position.copy(from.clone().add(to).multiplyScalar(0.5)).setY(0.12);
  g.rotation.y = Math.atan2(dir.x, dir.z);
  return cast(g);
}

/** A tube along `curve`, `radius(t)` wide a part of the way along, with a skin repeated down it. */
function tube(curve: CatmullRomCurve3, radius: (t: number) => number, segments = 120, radial = 12): BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const length = curve.getLength();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = frames.normals[i]!.clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i]!.clone().multiplyScalar(Math.sin(a)));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      norm.push(n.x, n.y, n.z);
      uv.push((t * length) / 0.9, j / radial);
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(norm), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(index);
  return geo;
}

interface SnakeParts {
  group: Group;
  head: Group;
  tongue: Group | null;
  /** The way down it, for a counter riding it: head to tail, a little over its back. */
  ride: CatmullRomCurve3;
}

/** A snake (or, in the store, a hose) along the flat board's curve, its head reared up. */
function snake(spine: Pt3[], n: number, store: boolean): SnakeParts {
  const pts = spine.map((p, k) => {
    const t = k / (spine.length - 1);
    // The head rears up off the board; the body lies on it, humped a little where it bends.
    const rear = store ? 0.06 : 0.42 * Math.max(0, 1 - t * 7) ** 1.4;
    return onBoard(p, 0.14 + rear + 0.035 * Math.abs(Math.sin(t * Math.PI * 5)));
  });
  const curve = new CatmullRomCurve3(pts);
  const group = new Group();
  const skin = SKINS[n % SKINS.length]!;
  const map = store ? hoseTexture(HOSES[n % HOSES.length]!) : skinTexture(skin);
  map.repeat.set(1, 1);
  const body = new Mesh(tube(curve, store ? () => 0.11 : (t) => 0.15 * (1 - t) ** 0.75 + 0.025), new MeshPhysicalMaterial({ map, roughness: store ? 0.6 : 0.38, clearcoat: store ? 0.1 : 0.6, clearcoatRoughness: 0.4 }));
  group.add(body);

  const head = new Group();
  const p0 = curve.getPointAt(0);
  const back = curve.getTangentAt(0.02).negate();
  head.position.copy(p0);
  head.lookAt(p0.clone().add(back));
  let tongue: Group | null = null;
  if (store) {
    // Brass fittings: a hex nut at the top end, a crimp at the bottom.
    const brass = new MeshStandardMaterial({ color: "#d4ac2b", metalness: 0.85, roughness: 0.3 });
    const nut = new Mesh(new CylinderGeometry(0.17, 0.17, 0.22, 6).rotateX(Math.PI / 2), brass);
    nut.position.z = 0.06;
    const nose = new Mesh(new CylinderGeometry(0.1, 0.12, 0.18, 16).rotateX(Math.PI / 2), brass);
    nose.position.z = 0.24;
    head.add(nut, nose);
    const tail = new Mesh(new CylinderGeometry(0.14, 0.14, 0.24, 16).rotateX(Math.PI / 2), brass);
    const pEnd = curve.getPointAt(1);
    tail.position.copy(pEnd);
    tail.lookAt(pEnd.clone().add(curve.getTangentAt(0.99)));
    group.add(cast(tail));
  } else {
    const skull = new Mesh(new SphereGeometry(0.2, 20, 14), new MeshPhysicalMaterial({ color: skin.skin, roughness: 0.35, clearcoat: 0.7 }));
    skull.scale.set(1.05, 0.72, 1.35);
    skull.position.z = 0.06;
    head.add(skull);
    const white = new MeshStandardMaterial({ color: "#fffdf3", roughness: 0.2 });
    const black = new MeshStandardMaterial({ color: "#111", roughness: 0.1 });
    for (const side of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.065, 12, 10), white);
      eye.position.set(side * 0.11, 0.09, 0.13);
      const pupil = new Mesh(new SphereGeometry(0.032, 10, 8), black);
      pupil.scale.set(0.6, 1.2, 0.6);
      pupil.position.set(side * 0.12, 0.1, 0.185);
      head.add(eye, pupil);
    }
    tongue = new Group();
    const red = new MeshStandardMaterial({ color: "#e0263a", roughness: 0.4 });
    const stem = new Mesh(new BoxGeometry(0.025, 0.012, 0.16), red);
    stem.position.z = 0.08;
    tongue.add(stem);
    for (const side of [-1, 1]) {
      const fork = new Mesh(new BoxGeometry(0.02, 0.012, 0.07), red);
      fork.position.set(side * 0.022, 0, 0.18);
      fork.rotation.y = side * 0.5;
      tongue.add(fork);
    }
    tongue.position.set(0, -0.02, 0.28);
    tongue.scale.z = 0.01;
    head.add(tongue);
  }
  group.add(head);
  const ride = new CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + 0.18)));
  return { group: cast(group) as Group, head, tongue, ride };
}

/** The counters: a pawn, a rook, a duck, a robot, a rocket or a cat, about a square high. */
function piece(shape: string, seat: number): Group {
  const c = SEATS[seat % SEATS.length]!;
  const body = shiny(c.body);
  const dark = shiny(c.dark);
  const black = new MeshStandardMaterial({ color: "#111", roughness: 0.2 });
  const g = new Group();
  const lathe = (pts: [number, number][], m: Material = body) => new Mesh(new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), 28), m);
  const add = (m: Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  switch (shape) {
    case "rook": {
      g.add(lathe([[0, 0], [0.3, 0], [0.31, 0.06], [0.24, 0.12], [0.2, 0.5], [0.26, 0.56], [0.26, 0.7], [0, 0.7]]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const m = add(new Mesh(new BoxGeometry(0.1, 0.1, 0.08), body), Math.cos(a) * 0.21, 0.75, Math.sin(a) * 0.21);
        m.rotation.y = -a;
      }
      break;
    }
    case "duck": {
      const b = add(new Mesh(new SphereGeometry(0.28, 24, 18), body), 0, 0.26, 0);
      b.scale.set(1, 0.85, 1.25);
      const tail = add(new Mesh(new ConeGeometry(0.12, 0.22, 12), body), 0, 0.38, -0.33);
      tail.rotation.x = -2.2;
      add(new Mesh(new SphereGeometry(0.17, 20, 16), body), 0, 0.6, 0.17);
      const beak = add(new Mesh(new ConeGeometry(0.07, 0.2, 12), new MeshStandardMaterial({ color: "#f59e0b", roughness: 0.4 })), 0, 0.57, 0.37);
      beak.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) add(new Mesh(new SphereGeometry(0.03, 8, 8), black), s * 0.09, 0.65, 0.3);
      break;
    }
    case "robot": {
      add(new Mesh(new BoxGeometry(0.44, 0.36, 0.34), body), 0, 0.26, 0);
      add(new Mesh(new BoxGeometry(0.36, 0.26, 0.3), body), 0, 0.6, 0);
      add(new Mesh(new BoxGeometry(0.2, 0.08, 0.02), dark), 0, 0.26, 0.18);
      add(new Mesh(new CylinderGeometry(0.015, 0.015, 0.16), dark), 0, 0.81, 0);
      add(new Mesh(new SphereGeometry(0.045, 12, 10), new MeshStandardMaterial({ color: "#ffe066", emissive: "#ffb300", emissiveIntensity: 1.2 })), 0, 0.9, 0);
      for (const s of [-1, 1]) add(new Mesh(new SphereGeometry(0.045, 12, 10), new MeshStandardMaterial({ color: "#bff6ff", emissive: "#3fd5ff", emissiveIntensity: 1.1 })), s * 0.08, 0.62, 0.15);
      break;
    }
    case "rocket": {
      g.add(lathe([[0, 0.12], [0.16, 0.12], [0.2, 0.3], [0.19, 0.55], [0.12, 0.78], [0.04, 0.9], [0, 0.93]]));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const fin = add(new Mesh(new BoxGeometry(0.03, 0.26, 0.16), dark), Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2);
        fin.rotation.y = -a;
      }
      add(new Mesh(new SphereGeometry(0.07, 14, 12), new MeshStandardMaterial({ color: "#bff6ff", emissive: "#3fd5ff", emissiveIntensity: 0.5, roughness: 0.1 })), 0, 0.52, 0.16);
      const flame = add(new Mesh(new ConeGeometry(0.1, 0.24, 14), new MeshBasicMaterial({ color: "#ffb02e", transparent: true, opacity: 0.9 })), 0, 0.02, 0);
      flame.rotation.x = Math.PI;
      flame.name = "flame";
      break;
    }
    case "cat": {
      const b = add(new Mesh(new SphereGeometry(0.25, 22, 16), body), 0, 0.25, -0.02);
      b.scale.set(1, 1, 1.15);
      add(new Mesh(new SphereGeometry(0.2, 22, 16), body), 0, 0.58, 0.08);
      for (const s of [-1, 1]) {
        const ear = add(new Mesh(new ConeGeometry(0.07, 0.14, 10), body), s * 0.11, 0.76, 0.06);
        ear.rotation.z = -s * 0.3;
        add(new Mesh(new SphereGeometry(0.03, 8, 8), black), s * 0.07, 0.62, 0.25);
      }
      add(new Mesh(new SphereGeometry(0.025, 8, 8), new MeshStandardMaterial({ color: "#f472b6" })), 0, 0.56, 0.28);
      const tail = add(new Mesh(new TorusGeometry(0.16, 0.035, 8, 20, Math.PI * 1.1), body), 0, 0.3, -0.3);
      tail.rotation.y = Math.PI / 2;
      break;
    }
    default: {
      g.add(lathe([[0, 0], [0.32, 0], [0.33, 0.06], [0.26, 0.1], [0.2, 0.16], [0.13, 0.36], [0.11, 0.46], [0.17, 0.49], [0.17, 0.53], [0.1, 0.55]]));
      add(new Mesh(new SphereGeometry(0.17, 24, 18), body), 0, 0.67, 0);
    }
  }
  g.scale.setScalar(1.3);
  return cast(g) as Group;
}

/** A star or shield that floats over its square and turns; a portal that swirls. */
function special(kind: string): Group {
  const g = new Group();
  if (kind === "portal") {
    const rim = new Mesh(new TorusGeometry(0.34, 0.06, 12, 36), new MeshStandardMaterial({ color: "#7b3fe4", emissive: "#5a1fd0", emissiveIntensity: 0.8, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    const { c, g: d } = canvasOf(128, 128);
    const grad = d.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.3, "#c49bff");
    grad.addColorStop(1, "#24104a");
    d.fillStyle = grad;
    d.fillRect(0, 0, 128, 128);
    d.strokeStyle = "rgba(255,255,255,0.8)";
    d.lineWidth = 6;
    for (let k = 0; k < 3; k++) {
      d.beginPath();
      d.arc(64, 64, 20 + k * 14, k, k + 2.2);
      d.stroke();
    }
    const swirl = new Mesh(new CircleGeometry(0.32, 32), new MeshBasicMaterial({ map: texture(c) }));
    swirl.rotation.x = -Math.PI / 2;
    swirl.position.y = 0.05;
    swirl.name = "swirl";
    g.add(rim, swirl);
    return g;
  }
  const shape = new Shape();
  if (kind === "star") {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.11 : 0.26;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      i ? shape.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    }
  } else {
    shape.moveTo(0, 0.26);
    shape.lineTo(0.22, 0.18);
    shape.bezierCurveTo(0.22, -0.04, 0.14, -0.18, 0, -0.26);
    shape.bezierCurveTo(-0.14, -0.18, -0.22, -0.04, -0.22, 0.18);
    shape.closePath();
  }
  const geo = new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }).center();
  const m = new Mesh(geo, kind === "star" ? new MeshStandardMaterial({ color: "#ffd84d", emissive: "#c98a00", emissiveIntensity: 0.45, metalness: 0.6, roughness: 0.3 }) : new MeshStandardMaterial({ color: "#dfe7f1", emissive: "#5a7aa8", emissiveIntensity: 0.25, metalness: 0.25, roughness: 0.3 }));
  m.name = "spin";
  m.position.y = 0.45;
  m.scale.setScalar(1.35);
  g.add(cast(m));
  return g;
}

// ---- The scene ------------------------------------------------------------------------------------

interface Tween {
  start: number;
  ms: number;
  step: (t: number) => void;
  done: () => void;
}

interface Particle {
  mesh: Mesh;
  v: Vector3;
  life: number;
  age: number;
  spin: number;
  gravity: number;
}

export function build(canvas: HTMLCanvasElement, on: SnakesCallbacks): SnakesScene3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  const narrow = () => canvas.clientWidth < 560;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100);
  scene.add(new HemisphereLight("#fff6e6", "#3b4a3f", 1.4));
  const sun = new DirectionalLight("#fff1dc", 2.1);
  sun.position.set(-4, 12, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(narrow() ? 1024 : 2048, narrow() ? 1024 : 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // The felt under it all only catches the board's shadow; the page's own felt shows through.
  const floor = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ opacity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.42;
  floor.receiveShadow = true;
  scene.add(floor);

  const boardGroup = new Group();
  scene.add(boardGroup);
  const linkGroup = new Group();
  const markGroup = new Group();
  const pieceGroup = new Group();
  scene.add(linkGroup, markGroup, pieceGroup);

  let staticKey = "";
  let snakes = new Map<number, SnakeParts>();
  const specials: Group[] = [];
  const dropping: { obj: Object3D; y: number; delay: number }[] = [];

  /** Board, ladders, snakes and specials: built again only when the board itself changes. */
  function buildBoard(f: SnakesFrame3d) {
    const dispose = (g: Group) => {
      g.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          for (const m of [o.material].flat()) {
            (m as MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
      g.clear();
    };
    dispose(boardGroup);
    dispose(linkGroup);
    specials.length = 0;
    snakes = new Map();
    const px = narrow() ? 1024 : 2048;
    // The slab: wood, or steel in the store, with the painted face on top.
    const slab = new Mesh(new BoxGeometry(10.7, 0.4, 11.8), f.store ? new MeshStandardMaterial({ color: "#6a737b", metalness: 0.6, roughness: 0.45 }) : matte("#8a5226", { roughness: 0.6 }));
    slab.position.set(0, -0.2, 0.5);
    slab.receiveShadow = slab.castShadow = true;
    const face = new Mesh(new PlaneGeometry(10, 11), new MeshStandardMaterial({ map: boardFace(f, px), roughness: 0.75 }));
    face.rotation.x = -Math.PI / 2;
    face.position.set(0, 0.002, 0.5);
    face.receiveShadow = true;
    boardGroup.add(slab, face);

    let n = 0;
    for (const link of f.links) {
      if (link.kind === "ladder") linkGroup.add(ladder(at(link.from), at(link.to), f.store));
      else if (link.kind === "snake" && link.spine) {
        const parts = snake(link.spine, n++, f.store);
        snakes.set(link.from, parts);
        linkGroup.add(parts.group);
      }
    }
    for (const sp of f.specials) {
      const g = special(sp.kind);
      g.position.copy(at(sp.cell));
      g.userData.kind = sp.kind;
      linkGroup.add(g);
      specials.push(g);
    }
    // A new game: everything drops on, one after another.
    dropping.length = 0;
    if (f.reveal && f.speed > 0)
      linkGroup.children.forEach((obj, i) => {
        dropping.push({ obj, y: obj.position.y, delay: 150 + i * 70 });
        obj.position.y += 6;
      });
  }

  // ---- Counters ----
  interface Counter {
    group: Group;
    inner: Group;
    shape: string;
    seat: number;
    /** Where it rests, and whether a move is carrying it (then it isn't put back). */
    rest: Vector3;
    busy: boolean;
  }
  const counters = new Map<string, Counter>();
  const restOf = (t: SnakesFrame3d["tokens"][number]) => at(t.cell).add(new Vector3((t.k - (t.n - 1) / 2) * 0.3, 0, (t.k - (t.n - 1) / 2) * -0.12));

  function syncCounters(f: SnakesFrame3d) {
    const seen = new Set<string>();
    for (const t of f.tokens) {
      seen.add(t.id);
      let c = counters.get(t.id);
      if (!c || c.shape !== t.shape) {
        const inner = piece(t.shape, t.seat);
        const group = new Group();
        group.add(inner);
        if (c) {
          group.position.copy(c.group.position);
          pieceGroup.remove(c.group);
          // A new shape pops in.
          if (f.speed > 0) {
            inner.scale.setScalar(0.01);
            tween(380, (k) => inner.scale.setScalar(ease.back(k)));
            puff(group.position, SEATS[t.seat % 4]!.light, 14);
          }
        } else group.position.copy(restOf(t));
        pieceGroup.add(group);
        c = { group, inner, shape: t.shape, seat: t.seat, rest: restOf(t), busy: c?.busy ?? false };
        counters.set(t.id, c);
      }
      c.rest = restOf(t);
      if (!c.busy) c.group.position.copy(c.rest);
    }
    for (const [id, c] of counters)
      if (!seen.has(id)) {
        pieceGroup.remove(c.group);
        counters.delete(id);
      }
  }

  // ---- Marks: targets, the way to one, footprints, the turn ring ----
  const targetMeshes: { cell: number; ring: Mesh; chip: Sprite }[] = [];
  let targetKey = "";
  const VIA: Record<string, string> = { ladder: "#2f9e5b", snake: "#c8372d", portal: "#7b3fe4" };
  function syncMarks(f: SnakesFrame3d) {
    const key = JSON.stringify([f.targets, f.preview, f.steps, f.me]);
    if (key === targetKey) return;
    targetKey = key;
    markGroup.traverse((o) => {
      if (o instanceof Mesh || o instanceof Sprite) {
        o.geometry.dispose();
        (o.material as MeshBasicMaterial).map?.dispose();
        (o.material as Material).dispose();
      }
    });
    markGroup.clear();
    targetMeshes.length = 0;
    const mine = SEATS[f.me % 4]!;
    for (const t of f.targets) {
      const colour = t.via ? VIA[t.via]! : mine.body;
      const ring = new Mesh(new RingGeometry(0.3, 0.44, 40), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(at(t.cell)).setY(0.03);
      const glow = new Mesh(new CircleGeometry(0.44, 40), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.copy(ring.position).setY(0.025);
      const chip = chipSprite(t.label, colour);
      chip.position.copy(at(t.cell)).setY(1.15);
      markGroup.add(ring, glow, chip);
      targetMeshes.push({ cell: t.cell, ring, chip });
    }
    if (f.preview) {
      const dot = new SphereGeometry(0.07, 10, 8);
      const m = new MeshBasicMaterial({ color: mine.body });
      f.preview.slice(1).forEach((cell, i) => {
        const d = new Mesh(dot, m);
        d.position.copy(at(cell)).setY(0.12 + Math.sin(i) * 0.0);
        markGroup.add(d);
      });
    }
    if (f.steps) {
      const foot = new CircleGeometry(0.08, 16);
      const m = new MeshBasicMaterial({ color: SEATS[f.steps.seat % 4]!.body, transparent: true, opacity: 0.45, depthWrite: false });
      for (const cell of f.steps.cells.slice(1, -1)) {
        const d = new Mesh(foot, m);
        d.rotation.x = -Math.PI / 2;
        d.position.copy(at(cell)).add(new Vector3(0, 0.02, 0.22));
        markGroup.add(d);
      }
    }
  }
  const turnRing = new Mesh(new RingGeometry(0.34, 0.46, 40), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide }));
  turnRing.rotation.x = -Math.PI / 2;
  scene.add(turnRing);

  // ---- Particles: dust, sparkles, confetti ----
  const particles: Particle[] = [];
  const bit = new BoxGeometry(0.07, 0.07, 0.07);
  function burst(where: Vector3, colours: string[], count: number, speed: number, gravity: number, life: number, size = 1) {
    for (let i = 0; i < count; i++) {
      const mesh = new Mesh(bit, new MeshBasicMaterial({ color: colours[i % colours.length], transparent: true }));
      mesh.position.copy(where);
      mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      particles.push({ mesh, v: new Vector3(Math.cos(a) * speed * (0.4 + Math.random()), speed * (0.5 + up * 1.5), Math.sin(a) * speed * (0.4 + Math.random())), life, age: 0, spin: (Math.random() - 0.5) * 12, gravity });
      scene.add(mesh);
    }
  }
  const puff = (where: Vector3, colour = "#d8c4a0", n = 8) => burst(where.clone().setY(0.08), [colour, "#fff3dc"], n, 1.2, 4, 0.45, 0.8);

  // ---- Tweens ----
  const tweens = new Set<Tween>();
  let now = performance.now();
  function tween(ms: number, step: (t: number) => void): Promise<void> {
    return new Promise((done) => {
      if (ms <= 0) {
        step(1);
        return done();
      }
      tweens.add({ start: now, ms, step, done });
    });
  }
  let run = 0;
  const wait = (ms: number) => tween(ms, () => undefined);

  // ---- The camera ----
  // The whole board from above and in front; while a move is walked, close behind the counter.
  const view = { focus: new Vector3(0, 0, 0.5), dist: 15, want: { focus: new Vector3(0, 0, 0.5), dist: 15 }, shake: 0 };
  const PITCH = (58 * Math.PI) / 180;
  let overview = 15;
  function fit() {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // The nearest distance at which every corner of the board is on the screen.
    const corners = [new Vector3(-5.4, 0, -5.4), new Vector3(5.4, 0, -5.4), new Vector3(-5.4, 0, 6.3), new Vector3(5.4, 0, 6.3), new Vector3(0, 1.2, -5.2)];
    for (let d = 8; d < 40; d += 0.25) {
      place(new Vector3(0, 0, 0.5), d);
      camera.updateMatrixWorld();
      if (corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.97;
      })) {
        overview = d;
        break;
      }
    }
    if (!following) {
      view.want.dist = overview;
      view.dist = overview;
    }
  }
  function place(focus: Vector3, dist: number) {
    camera.position.set(focus.x, focus.y + Math.sin(PITCH) * dist, focus.z + Math.cos(PITCH) * dist);
    camera.lookAt(focus);
  }
  let following = false;
  const follow = (where: Vector3 | null) => {
    following = !!where;
    view.want.focus.copy(where ?? new Vector3(0, 0, 0.5));
    view.want.dist = where ? overview * (narrow() ? 0.55 : 0.7) : overview;
  };
  const resize = new ResizeObserver(() => fit());
  resize.observe(canvas);

  // ---- Tapping a target ----
  const ray = new Raycaster();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  function cellAt(e: PointerEvent): number | null {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    // A chip stands up over its square: tapping the chip is tapping the square.
    const hitChip = ray.intersectObjects(targetMeshes.map((t) => t.chip))[0];
    if (hitChip) return targetMeshes.find((t) => t.chip === hitChip.object)?.cell ?? null;
    const p = ray.ray.intersectPlane(ground, new Vector3());
    if (!p) return null;
    const col = Math.floor(p.x + COLS / 2);
    const row = Math.floor(p.z + COLS / 2);
    if (col < 0 || col >= COLS || row < 0 || row > COLS) return null;
    return row * COLS + col;
  }
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
    down = null;
    const cell = cellAt(e);
    if (cell !== null && targetMeshes.some((t) => t.cell === cell)) on.onTarget(cell);
  };
  let hovered: number | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const cell = cellAt(e);
    const over = cell !== null && targetMeshes.some((t) => t.cell === cell) ? cell : null;
    canvas.style.cursor = over === null ? "" : "pointer";
    if (over !== hovered) on.onHover((hovered = over));
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointermove", onMove);

  // ---- Walking a move ----
  let frame: SnakesFrame3d | null = null;
  let lastKey: number | null | undefined;
  let lastRoll = -1;
  let celebrated = false;

  async function walk(f: SnakesFrame3d, rolled: boolean) {
    const me = ++run;
    const live = () => run === me;
    const k = Math.max(0.5, f.speed);
    const ms = (n: number) => n * k;
    const trail = f.trail!;
    const [mover, ...swapped] = trail.paths;
    const final = new Map(f.tokens.map((t) => [t.id, restOf(t)] as const));
    for (const p of trail.paths) {
      const c = counters.get(p.id);
      if (c) {
        c.busy = true;
        c.group.position.copy(at(p.cells[0]!));
      }
    }
    on.onMoving(true);
    try {
      if (!mover) return;
      const c = counters.get(mover.id);
      if (!c) return;
      if (rolled) await wait(ms(700));
      if (!live()) return;
      follow(c.group.position.clone());
      await wait(ms(250));
      for (let i = 0; i < mover.by.length && live(); i++) {
        const kind = mover.by[i]!;
        const fromCell = mover.cells[i]!;
        const toCell = mover.cells[i + 1]!;
        const last = i === mover.by.length - 1;
        const a = c.group.position.clone();
        const b = last ? final.get(mover.id)!.clone() : at(toCell);
        c.inner.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (kind === "step") {
          play("hop");
          follow(b);
          await tween(ms(210), (t) => {
            c.group.position.lerpVectors(a, b, t);
            c.group.position.y = Math.sin(Math.PI * t) * 0.6;
            c.inner.scale.set(1 - Math.sin(Math.PI * t) * 0.08, 1 + Math.sin(Math.PI * t) * 0.14, 1 - Math.sin(Math.PI * t) * 0.08);
          });
          puff(b, f.store ? "#c9b79a" : "#e6d2ad", 5);
          await tween(ms(70), (t) => c.inner.scale.set(1 + Math.sin(Math.PI * t) * 0.12, 1 - Math.sin(Math.PI * t) * 0.18, 1 + Math.sin(Math.PI * t) * 0.12));
        } else if (kind === "ladder") {
          play("climb");
          follow(b);
          const rungs = Math.max(3, Math.round(a.distanceTo(b) / 0.36));
          await tween(ms(1000), (t) => {
            const e = ease.inOut(t);
            c.group.position.lerpVectors(a, b, e);
            c.group.position.y = 0.2 + Math.abs(Math.sin(e * rungs * Math.PI)) * 0.14;
            c.inner.rotation.z = Math.sin(e * rungs * Math.PI) * 0.15;
          });
          c.inner.rotation.z = 0;
          burst(b.clone().setY(0.6), ["#fff6b0", "#ffd54d", "#ffffff"], 26, 2.2, 3, 0.9);
          await tween(ms(160), (t) => (c.group.position.y = 0.2 * (1 - t)));
        } else if (kind === "snake") {
          const parts = snakes.get(fromCell);
          // The snake rears and bites, then the counter rides it down, spinning.
          play("slither");
          if (parts) {
            const head = parts.head;
            const rest = head.position.clone();
            const scale = head.scale.clone();
            await tween(ms(260), (t) => {
              head.position.y = rest.y + Math.sin(Math.PI * t) * 0.35;
              head.scale.setScalar(scale.x * (1 + Math.sin(Math.PI * t) * 0.35));
            });
            head.position.copy(rest);
            head.scale.copy(scale);
            view.shake = 0.12;
          }
          const ride = parts?.ride;
          follow(b);
          await tween(ms(1300), (t) => {
            const e = ease.in(t) * 0.6 + t * 0.4;
            if (ride) c.group.position.copy(ride.getPointAt(Math.min(1, e)));
            else c.group.position.lerpVectors(a, b, e);
            c.inner.rotation.y += 0.25;
          });
          puff(b, "#a08a6a", 12);
          await tween(ms(160), (t) => c.group.position.lerpVectors(c.group.position.clone(), b, t));
        } else if (kind === "portal") {
          play("zap");
          burst(a.clone().setY(0.3), ["#c49bff", "#ffffff", "#7b3fe4"], 20, 1.6, 0.5, 0.7);
          await tween(ms(420), (t) => {
            c.inner.scale.setScalar(1 - t);
            c.inner.rotation.y += 0.5;
            c.group.position.y = -t * 0.2;
          });
          c.group.position.copy(b);
          follow(b);
          await wait(ms(250));
          burst(b.clone().setY(0.3), ["#c49bff", "#ffffff", "#7b3fe4"], 20, 1.6, 0.5, 0.7);
          await tween(ms(420), (t) => {
            c.inner.scale.setScalar(ease.back(t));
            c.inner.rotation.y += 0.5;
          });
          c.inner.scale.setScalar(1);
        }
        if (last) c.group.position.copy(b);
      }
      // Anyone landed on flies back over to where the mover came from.
      const flights = swapped.map(async (p) => {
        const o = counters.get(p.id);
        if (!o || !live()) return;
        const a = o.group.position.clone();
        const b = final.get(p.id)!.clone();
        play("swap");
        await tween(ms(650), (t) => {
          o.group.position.lerpVectors(a, b, ease.inOut(t));
          o.group.position.y = Math.sin(Math.PI * t) * 1.6;
          o.inner.rotation.x = t * Math.PI * 2;
        });
        o.inner.rotation.x = 0;
        puff(b, SEATS[o.seat % 4]!.light, 10);
      });
      await Promise.all(flights);
      if (live()) {
        await wait(ms(300));
        follow(null);
      }
    } finally {
      if (live()) {
        for (const p of trail.paths) {
          const o = counters.get(p.id);
          if (o) {
            o.busy = false;
            o.inner.scale.setScalar(1);
            o.group.position.copy(o.rest);
          }
        }
        on.onMoving(false);
      }
    }
  }

  // ---- Each frame ----
  let raf = 0;
  let lastDraw = 0;
  let disposed = false;
  function loop(time: number) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (time - now) / 1000);
    now = time;
    for (const t of [...tweens]) {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.step(k);
      if (k >= 1) {
        tweens.delete(t);
        t.done();
      }
    }
    const busy = tweens.size > 0 || particles.length > 0 || dropping.length > 0 || Math.abs(view.dist - view.want.dist) > 0.01 || view.focus.distanceTo(view.want.focus) > 0.01;
    // Nothing moving but the idle things: a frame every other tick is plenty.
    if (!busy && time - lastDraw < 32) return;
    lastDraw = time;
    const s = time / 1000;

    // Dropping on, at the start of a game.
    for (let i = dropping.length - 1; i >= 0; i--) {
      const d = dropping[i]!;
      const t = Math.max(0, Math.min(1, (time - startTime - d.delay) / 600));
      d.obj.position.y = d.y + 6 * (1 - ease.back(t));
      if (t >= 1) {
        d.obj.position.y = d.y;
        dropping.splice(i, 1);
      }
    }
    // Idle life: tongues flick, heads sway, stars turn, portals swirl, the turn ring breathes.
    let n = 0;
    for (const parts of snakes.values()) {
      const phase = s * 1.3 + n * 1.7;
      parts.head.rotation.z = Math.sin(phase) * 0.12;
      if (parts.tongue) {
        const flick = (s + n * 0.9) % 3.2;
        parts.tongue.scale.z = flick < 0.35 ? Math.sin((flick / 0.35) * Math.PI) : 0.01;
      }
      n++;
    }
    for (const g of specials) {
      const spin = g.getObjectByName("spin");
      if (spin) {
        // Facing the camera, leaning back a little, swaying rather than turning edge-on.
        spin.rotation.set(-0.5, Math.sin(s * 1.6 + g.position.x) * 0.7, 0);
        spin.position.y = 0.45 + Math.sin(s * 2 + g.position.x) * 0.07;
      }
      const swirl = g.getObjectByName("swirl");
      if (swirl) swirl.rotation.z = -s * 2.4;
    }
    for (const c of counters.values()) {
      const flame = c.inner.getObjectByName("flame");
      if (flame) flame.scale.y = 0.8 + Math.random() * 0.5 + (c.busy ? 0.8 : 0);
    }
    const f = frame;
    if (f) {
      const turnC = f.turn === null ? null : [...counters.values()].find((c) => c.seat === f.turn);
      turnRing.visible = !!turnC && !f.winner;
      if (turnC) {
        turnRing.position.copy(turnC.group.position).setY(0.02);
        turnRing.scale.setScalar(1 + Math.sin(s * 4) * 0.08);
        (turnRing.material as MeshBasicMaterial).color.set(SEATS[turnC.seat % 4]!.light);
      }
      // Your counter, when it has somewhere to go, bobs.
      for (const c of counters.values()) {
        if (c.busy) continue;
        const ready = f.targets.length > 0 && c.seat === f.me;
        const won = f.winner === c.seat;
        c.group.position.y = won ? Math.abs(Math.sin(s * 5)) * 0.5 : ready ? Math.abs(Math.sin(s * 3.2)) * 0.12 : 0;
        if (won) c.inner.rotation.y = s * 3;
      }
      for (const t of targetMeshes) {
        t.ring.scale.setScalar(1 + Math.sin(s * 5) * 0.07);
        t.chip.position.y = 1.15 + Math.sin(s * 3 + t.cell) * 0.04;
      }
    }
    // Particles fly and fall.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.age += dt;
      p.v.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * dt * 0.7;
      (p.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) {
        scene.remove(p.mesh);
        (p.mesh.material as Material).dispose();
        particles.splice(i, 1);
      }
    }
    // The camera eases towards where it wants to be, with a shake after a snake bites.
    const lerp = 1 - Math.pow(0.0015, dt);
    view.focus.lerp(view.want.focus, lerp);
    view.dist += (view.want.dist - view.dist) * lerp;
    place(view.focus, view.dist);
    if (view.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * view.shake;
      camera.position.y += (Math.random() - 0.5) * view.shake;
      view.shake = Math.max(0, view.shake - dt * 0.4);
    }
    renderer.render(scene, camera);
  }
  const startTime = performance.now();
  fit();
  raf = requestAnimationFrame(loop);

  return {
    update(f) {
      frame = f;
      const key = JSON.stringify([f.tiles.map((t) => t.tint), f.links.map((l) => [l.kind, l.from, l.to]), f.specials, f.store, f.seats]);
      if (key !== staticKey) {
        staticKey = key;
        buildBoard(f);
      }
      syncCounters(f);
      syncMarks(f);
      const rolled = f.roll !== lastRoll && lastRoll !== -1;
      lastRoll = f.roll;
      const trailKey = f.trail?.key ?? null;
      const first = lastKey === undefined;
      if (trailKey !== lastKey) {
        lastKey = trailKey;
        if (!first && f.trail && f.speed > 0) void walk(f, rolled);
        else {
          run++;
          for (const c of counters.values()) {
            c.busy = false;
            c.group.position.copy(c.rest);
          }
        }
      }
      // The winner: confetti, and the camera on them.
      if (f.winner !== null && !celebrated) {
        celebrated = true;
        const c = [...counters.values()].find((o) => o.seat === f.winner);
        void (async () => {
          await wait(f.speed > 0 ? 2600 : 0);
          if (c) follow(c.rest.clone());
          for (let i = 0; i < 4; i++) {
            burst(new Vector3((Math.random() - 0.5) * 8, 6, (Math.random() - 0.5) * 6), ["#e2483d", "#2f78e4", "#25a55c", "#f2b81f", "#ffffff", "#c49bff"], 40, 1.5, 2.2, 3.2, 1.4);
            await wait(350);
          }
        })();
      }
      if (f.winner === null) celebrated = false;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        if (o instanceof Mesh || o instanceof Sprite) {
          o.geometry?.dispose();
          for (const m of [o.material].flat()) {
            (m as MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
      renderer.dispose();
    },
  };
}
