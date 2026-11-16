// The sea, for Combat in 3-D (see board3d.ts, which loads this on demand, and board3d-gl.ts, whose
// camera this shares: the board's grid of buttons is laid over the picture the same way).
//
// A board is a tray of water in a steel rim with the letters and numbers on it. A ship is a model
// lying across its squares, rising and falling with the swell; one that has been hit burns where it
// was hit, and one that is sunk lies over on its side, low in the water and black. A shot that
// missed leaves a white marker bobbing where it fell, and one that hit something not yet seen a
// fire on the water. A shot that has only just landed throws up a column of spray or a burst of
// flame first.
//
// Scene units are squares: x across the board, z down it towards the player, y up off the water.
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { PERSPECTIVE, SCALE, SHIFT, TILT, type Board3d, type BoardFrame3d, type Piece3d } from "./board3d";

const RIM = 0.34;
/** How high the swell stands at a spot, at a time (seconds). */
const swell = (x: number, z: number, t: number) => Math.sin(x * 1.3 + t * 1.1) * 0.04 + Math.sin(z * 1.7 - t * 0.9) * 0.032 + Math.sin((x + z) * 2.3 + t * 1.6) * 0.018;

const paints = new Map<string, MeshStandardMaterial>();
function paint(color: string, rough = 0.7, metal = 0.1): MeshStandardMaterial {
  const key = `${color}/${rough}/${metal}`;
  let m = paints.get(key);
  if (!m) paints.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
}
function put<T extends Object3D>(parent: Object3D, o: T, x = 0, y = 0, z = 0): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
const box = (w: number, h: number, d: number, m: Material) => new Mesh(new BoxGeometry(w, h, d), m);
const drum = (top: number, bottom: number, h: number, m: Material, sides = 12) => new Mesh(new CylinderGeometry(top, bottom, h, sides), m);

/** A hull seen from above: square at the stern, pointed at the bow (+x), `long` squares from end to end. */
function hull(long: number, beam: number, high: number): BufferGeometry {
  const h = long / 2;
  const s = new Shape();
  const outline: [number, number][] = [[-h, -beam * 0.7], [-h + 0.1, -beam], [h * 0.4, -beam], [h * 0.8, -beam * 0.55], [h, 0], [h * 0.8, beam * 0.55], [h * 0.4, beam], [-h + 0.1, beam], [-h, beam * 0.7]];
  outline.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return new ExtrudeGeometry(s, { depth: high, bevelEnabled: false }).rotateX(Math.PI / 2);
}

/** A gun turret: a low house with barrels out of the front of it. */
function turret(parent: Object3D, x: number, y: number, size: number, aft: boolean, steel: Material, dark: Material) {
  const g = new Group();
  put(g, drum(size, size * 1.1, size * 0.7, steel, 10), 0, size * 0.35, 0);
  for (const side of [-1, 1]) {
    const barrel = put(g, drum(size * 0.12, size * 0.12, size * 2.2, dark, 6), size * 1.1, size * 0.45, side * size * 0.35);
    barrel.rotation.z = Math.PI / 2;
  }
  if (aft) g.rotation.y = Math.PI;
  put(parent, g, x, y, 0);
}

/**
 * A ship `size` squares long, lying along +x with its middle at the origin. What kind it is goes by
 * its length and, where two are the same length, its name.
 */
function shipModel(size: number, name: string): Group {
  const g = new Group();
  const grey = paint("#8a94a1", 0.6, 0.3);
  const deck = paint("#a9b1bb", 0.7, 0.2);
  const dark = paint("#3c434c", 0.6, 0.4);
  const long = size - 0.14;
  const sub = /sub/i.test(name);
  if (sub) {
    // Low and black, mostly under water: a long round hull and a sail.
    const body = put(g, new Mesh(new SphereGeometry(0.23, 16, 10), paint("#2b3038", 0.45, 0.4)), 0, 0.02, 0);
    body.scale.set(long / 0.46, 0.75, 1);
    put(g, box(0.5, 0.26, 0.16, dark), 0.1, 0.24, 0);
    put(g, drum(0.015, 0.015, 0.3, dark, 5), 0.2, 0.5, 0);
    put(g, box(0.2, 0.02, 0.5, dark), 0.1, 0.3, 0);
    return g;
  }
  const beam = size >= 5 ? 0.3 : size >= 3 ? 0.25 : 0.21;
  put(g, new Mesh(hull(long, beam, 0.26), grey), 0, 0.16, 0);
  put(g, new Mesh(hull(long * 0.96, beam * 0.86, 0.02), deck), 0, 0.18, 0);
  // The boot-topping at the waterline.
  put(g, new Mesh(hull(long * 1.005, beam * 1.02, 0.05), paint("#8f2f28", 0.7)), 0, 0.0, 0);
  if (/carrier/i.test(name) || size >= 5) {
    // A flight deck from end to end, its lines, and the island to one side.
    put(g, box(long * 0.94, 0.04, beam * 2.25, paint("#454b54", 0.85)), -0.05, 0.22, 0);
    put(g, box(long * 0.8, 0.005, 0.03, paint("#f1f1ea", 0.8)), -0.05, 0.245, -0.04);
    for (let i = 0; i < 6; i++) put(g, box(0.12, 0.005, 0.02, paint("#f2c94c", 0.8)), -long * 0.36 + i * (long * 0.14), 0.245, 0.14);
    put(g, box(0.5, 0.26, 0.12, grey), 0.3, 0.37, beam * 0.92);
    put(g, box(0.2, 0.16, 0.1, dark), 0.3, 0.56, beam * 0.92);
    put(g, drum(0.012, 0.012, 0.3, dark, 5), 0.38, 0.75, beam * 0.92);
    return g;
  }
  if (size >= 4) {
    turret(g, long * 0.3, 0.18, 0.13, false, grey, dark);
    turret(g, long * 0.17, 0.25, 0.11, false, grey, dark);
    turret(g, -long * 0.32, 0.18, 0.13, true, grey, dark);
    put(g, box(0.46, 0.2, 0.3, grey), -0.02, 0.28, 0);
    put(g, box(0.26, 0.2, 0.22, deck), 0.04, 0.48, 0);
    put(g, drum(0.02, 0.02, 0.36, dark, 5), 0.04, 0.74, 0);
    put(g, drum(0.07, 0.085, 0.26, dark, 10), -0.26, 0.42, 0);
  } else if (size === 3) {
    turret(g, long * 0.28, 0.18, 0.11, false, grey, dark);
    put(g, box(0.42, 0.18, 0.26, grey), -0.05, 0.27, 0);
    put(g, box(0.2, 0.16, 0.18, deck), 0.04, 0.44, 0);
    put(g, drum(0.06, 0.075, 0.22, dark, 10), -0.25, 0.4, 0);
    turret(g, -long * 0.33, 0.18, 0.09, true, grey, dark);
  } else if (size === 2) {
    turret(g, long * 0.24, 0.18, 0.085, false, grey, dark);
    put(g, box(0.3, 0.16, 0.2, grey), -0.1, 0.26, 0);
    put(g, drum(0.045, 0.055, 0.18, dark, 8), -0.32, 0.36, 0);
  } else {
    // A boat: a wheelhouse and a gun.
    put(g, box(0.22, 0.14, 0.18, deck), -0.08, 0.25, 0);
    const gun = put(g, drum(0.015, 0.015, 0.2, dark, 5), 0.2, 0.24, 0);
    gun.rotation.z = Math.PI / 2;
  }
  return g;
}

function rimTexture(cols: number, rows: number, coords: BoardFrame3d["coords"]): CanvasTexture {
  const px = 96;
  const edge = RIM * px;
  const c = document.createElement("canvas");
  c.width = Math.round(cols * px + edge * 2);
  c.height = Math.round(rows * px + edge * 2);
  const g = c.getContext("2d")!;
  // Painted steel, a brass line next to the water, and a rivet at each square.
  const steel = g.createLinearGradient(0, 0, c.width, c.height);
  steel.addColorStop(0, "#33414f");
  steel.addColorStop(1, "#25303b");
  g.fillStyle = steel;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#c9a45c";
  g.lineWidth = 3;
  g.strokeRect(edge - 4, edge - 4, cols * px + 8, rows * px + 8);
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i <= cols; i++) for (const y of [5, c.height - 5]) g.fillRect(edge + i * px - 2, y - 2, 4, 4);
  for (let i = 0; i <= rows; i++) for (const x of [5, c.width - 5]) g.fillRect(x - 2, edge + i * px - 2, 4, 4);
  if (coords) {
    g.fillStyle = "#f1dfb4";
    g.font = `700 ${Math.round(edge * 0.6)}px 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    coords.cols.forEach((label, i) => g.fillText(label, edge + (i + 0.5) * px, c.height - edge / 2 + 1));
    coords.rows.forEach((label, i) => g.fillText(label, edge / 2, edge + (i + 0.5) * px + 1));
  }
  // The water shows through the middle.
  g.clearRect(edge, edge, cols * px, rows * px);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; fall: number; from: Color; to: Color }
/** Something standing on a square: a ship (over several), or the mark a shot left. */
interface Standing { group: Group; key: string; x: number; z: number; rides: number; roll: number; sunk: boolean; burning: [number, number][]; spin?: Object3D }

const WHITE = new Color("#ffffff");
const SPRAY = new Color("#cfe9f7");
const FLAME = new Color("#ffb347");
const EMBER = new Color("#e2401f");
const SMOKE = new Color("#3a3d42");
const SOOT = new Color("#15171a");

export function build(canvas: HTMLCanvasElement): Board3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      // Not every frame is drawn (thirty a second is plenty here), so the last one is kept: a
      // browser that composes the page again in between must find the picture still there.
      preserveDrawingBuffer: true,
    });
  } catch {
    return null;
  }
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    trayKey = "";
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 100);
  scene.add(new AmbientLight(0xdfeeff, 1.7));
  const sun = new DirectionalLight(0xfff2d8, 2.6);
  sun.position.set(-6, 7, 8);
  scene.add(sun);

  const table = new Group();
  table.rotation.x = Math.PI / 2 - (TILT * Math.PI) / 180;
  scene.add(table);
  const tray = new Group();
  const marks = new Group();
  const afloat = new Group();
  table.add(tray, afloat, marks);
  let trayKey = "";
  let marksKey = "";
  let cols = 10;
  let rows = 10;
  let water: Mesh | null = null;
  const standing = new Map<string, Standing>();
  /** The squares a shot has landed on, as of the last frame: one that is new gets its splash. */
  let shotAt: Set<string> | null = null;
  let size = "";
  let last = 0;
  let drawn = 0;

  // Spray, flame and smoke: one small shape drawn many times.
  const MAX = 420;
  const bits: Bit[] = [];
  const cloud = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: "#ffffff" }), MAX);
  cloud.instanceMatrix.setUsage(DynamicDrawUsage);
  cloud.frustumCulled = false;
  cloud.count = 0;
  table.add(cloud);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const at = new Vector3();
  const scale = new Vector3();
  const tint = new Color();
  function bit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size0: number, grow: number, fall: number, from: Color, to: Color) {
    if (bits.length < MAX) bits.push({ x, y, z, vx, vy, vz, age: 0, life, size: size0, grow, fall, from, to });
  }
  const spread = (n: number) => (Math.random() - 0.5) * n;

  /** The middle of a square. */
  const spot = (place: number): [number, number] => [(place % cols) + 0.5 - cols / 2, Math.floor(place / cols) + 0.5 - rows / 2];

  function buildTray(frame: BoardFrame3d) {
    tray.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh || (o as LineSegments).isLineSegments) m.geometry.dispose();
    });
    tray.clear();
    // The water: a sheet with enough points in it to roll.
    water = new Mesh(new PlaneGeometry(cols, rows, cols * 3, rows * 3).rotateX(-Math.PI / 2), new MeshPhysicalMaterial({ color: "#1a609a", roughness: 0.16, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: "#082a47", emissiveIntensity: 0.55 }));
    tray.add(water);
    // The squares, drawn on it in a thin line.
    const lines: number[] = [];
    for (let c = 0; c <= cols; c++) lines.push(c - cols / 2, 0.1, -rows / 2, c - cols / 2, 0.1, rows / 2);
    for (let r = 0; r <= rows; r++) lines.push(-cols / 2, 0.1, r - rows / 2, cols / 2, 0.1, r - rows / 2);
    const grid = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.3, depthWrite: false }));
    grid.geometry.setAttribute("position", new Float32BufferAttribute(lines, 3));
    tray.add(grid);
    // The rim of the tray, with the letters and numbers on its top.
    const w = cols + RIM * 2;
    const d = rows + RIM * 2;
    const top = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: rimTexture(cols, rows, frame.coords), roughness: 0.5, metalness: 0.3, transparent: true, alphaTest: 0.5 }));
    top.position.y = 0.16;
    tray.add(top);
    const steel = paint("#25303b", 0.5, 0.4);
    for (const [bw, bd, x, z] of [[w, RIM, 0, -(rows + RIM) / 2], [w, RIM, 0, (rows + RIM) / 2], [RIM, d, -(cols + RIM) / 2, 0], [RIM, d, (cols + RIM) / 2, 0]] as const) put(tray, box(bw, 0.4, bd, steel), x, -0.045, z);
  }

  const gold = new MeshBasicMaterial({ color: "#f3cf4a", transparent: true, opacity: 0.95, depthWrite: false });
  const going = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false });
  const ringShape = new RingGeometry(0.4, 0.47, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
  const dot = new CircleGeometry(0.12, 20).rotateX(-Math.PI / 2);
  function buildMarks(frame: BoardFrame3d) {
    marks.clear();
    for (const m of frame.marks) {
      if (m.mark !== "last" && m.mark !== "from") continue;
      const [x, z] = spot(m.at);
      const ring = new Mesh(ringShape, gold);
      ring.scale.set(1.5, 1, 1.5);
      put(marks, ring, x, 0.1, z);
    }
    for (const place of frame.targets) {
      const [x, z] = spot(place);
      put(marks, new Mesh(dot, going), x, 0.1, z);
    }
  }

  /** What stands on the board this frame: each ship once (however many squares it lies on), and each mark. */
  function muster(frame: BoardFrame3d) {
    const ships = new Map<string, Piece3d[]>();
    const seen = new Set<string>();
    const shots = new Set<string>();
    for (const p of frame.pieces) {
      if (p.span) ships.set(p.span, [...(ships.get(p.span) ?? []), p]);
      if (p.kind === "hit" || p.kind === "sunk" || p.kind === "miss") shots.add(`${p.at}`);
      if (p.span) continue;
      // A mark on the water.
      const id = `m${p.at}`;
      const key = p.kind;
      seen.add(id);
      let s = standing.get(id);
      if (!s || s.key !== key) {
        if (s) afloat.remove(s.group);
        const [x, z] = spot(p.at);
        const g = new Group();
        s = { group: g, key, x, z, rides: 0.6, roll: 0, sunk: false, burning: [] };
        if (p.kind === "miss") {
          // A white float where the shot fell, and the ring it left.
          put(g, new Mesh(new SphereGeometry(0.13, 14, 10), paint("#f4f6f8", 0.4)), 0, 0.07, 0);
          put(g, drum(0.012, 0.012, 0.22, paint("#f4f6f8", 0.4), 5), 0, 0.2, 0);
          const ripple = new Mesh(new RingGeometry(0.2, 0.25, 28).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false }));
          put(g, ripple, 0, 0.06, 0);
        } else if (p.kind === "hit") {
          // Something is burning here, though what isn't known yet.
          put(g, new Mesh(new SphereGeometry(0.16, 12, 8), paint("#2a2d33", 0.8)), 0, 0.03, 0).scale.y = 0.5;
          put(g, new Mesh(new SphereGeometry(0.1, 10, 8), new MeshBasicMaterial({ color: "#ff7a2e" })), 0, 0.14, 0);
          s.burning = [[0, 0]];
        } else if (p.kind === "aim") {
          // Marked to fire at: a gold sight, turning.
          const sight = new Group();
          const hoop = new Mesh(new TorusGeometry(0.3, 0.03, 8, 28), gold);
          hoop.rotation.x = Math.PI / 2;
          sight.add(hoop);
          for (let i = 0; i < 4; i++) {
            const tick = put(sight, box(0.16, 0.03, 0.04, gold), Math.cos((i * Math.PI) / 2) * 0.3, 0, Math.sin((i * Math.PI) / 2) * 0.3);
            tick.rotation.y = -(i * Math.PI) / 2;
          }
          put(g, sight, 0, 0.16, 0);
          s.spin = sight;
          s.rides = 0;
        } else {
          // Nothing can be here: a faint mark, out of the way.
          put(g, new Mesh(new CircleGeometry(0.07, 14).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#0b2538", transparent: true, opacity: 0.45, depthWrite: false })), 0, 0.09, 0);
          s.rides = 0;
        }
        standing.set(id, s);
        afloat.add(g);
      }
    }
    for (const [span, cells] of ships) {
      const id = `s${span}`;
      seen.add(id);
      cells.sort((a, b) => a.at - b.at);
      const sunk = cells.every((c) => c.kind === "sunk");
      const hit = cells.filter((c) => c.kind === "hit" || c.kind === "sunk").map((c) => c.at);
      const key = `${cells.map((c) => c.at).join(",")}|${sunk}|${hit.join(",")}`;
      let s = standing.get(id);
      if (s && s.key === key) continue;
      if (s) afloat.remove(s.group);
      const first = spot(cells[0]!.at);
      const end = spot(cells[cells.length - 1]!.at);
      const down = cells.length > 1 && cells[1]!.at - cells[0]!.at !== 1;
      const g = new Group();
      const model = shipModel(cells.length, cells[0]!.name ?? "");
      if (sunk) {
        // Gone: over on her side, low in the water, burnt black.
        const charred = paint("#2c2f35", 0.9, 0.1);
        model.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).material = charred) : null));
        model.rotation.x = 0.5;
        model.position.y = -0.13;
      }
      // A little broader and taller than life, so that she reads on a small board.
      model.scale.set(1, 1.3, 1.4);
      g.add(model);
      g.rotation.y = down ? -Math.PI / 2 : 0;
      const x = (first[0] + end[0]) / 2;
      const z = (first[1] + end[1]) / 2;
      s = { group: g, key, x, z, rides: sunk ? 0.3 : 1, roll: sunk ? 0 : 0.035, sunk, burning: hit.map((place) => spot(place)).map(([hx, hz]) => (down ? [hz - z, -(hx - x)] : [hx - x, hz - z]) as [number, number]) };
      // (Those are along and across the ship, as she lies: the model is turned for one that points down the board.)
      // A fire on each square that has been hit, while she is still afloat.
      if (!sunk)
        for (const [hx, hz] of s.burning) {
          const fire = new Mesh(new ConeGeometry(0.11, 0.3, 8), new MeshBasicMaterial({ color: "#ff8a2e" }));
          fire.name = "fire";
          fire.position.set(hx, 0.42, hz);
          g.add(fire);
          const scorch = new Mesh(new CircleGeometry(0.2, 14).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#16181b", transparent: true, opacity: 0.8, depthWrite: false }));
          scorch.position.set(hx, 0.275, hz);
          g.add(scorch);
        }
      standing.set(id, s);
      afloat.add(g);
    }
    for (const [id, s] of standing)
      if (!seen.has(id)) {
        afloat.remove(s.group);
        standing.delete(id);
      }
    return shots;
  }

  return {
    drag() {
      /* nothing is dragged about on the sea */
    },
    render(frame) {
      if (lost) return null;
      const { width, height, dpr } = frame;
      if (!width || !height || !frame.board) return null;
      // The sea is never still, so it is drawn all the time; thirty times a second is plenty.
      if (!frame.still && frame.time - drawn < 30 && drawn) return "busy";
      try {
        const next = `${width}|${height}|${dpr}`;
        if (next !== size) {
          size = next;
          renderer.setPixelRatio(dpr);
          renderer.setSize(width, height, false);
        }
        cols = frame.cols;
        rows = frame.rows;
        const unit = frame.board / cols;
        const eye = (frame.board * PERSPECTIVE) / unit;
        camera.aspect = width / height;
        camera.fov = (2 * Math.atan(height / unit / 2 / eye) * 180) / Math.PI;
        camera.position.set(0, 0, eye);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        table.position.y = -(SHIFT * frame.board) / unit;
        table.scale.setScalar(SCALE);

        const tKey = `${cols}x${rows}|${frame.coords ? `${frame.coords.cols.join("")}|${frame.coords.rows.join("")}` : ""}`;
        if (tKey !== trayKey) {
          trayKey = tKey;
          buildTray(frame);
        }
        const mKey = `${frame.marks.map((m) => `${m.at}${m.mark}`).join(",")}|${frame.targets.join(",")}`;
        if (mKey !== marksKey) {
          marksKey = mKey;
          buildMarks(frame);
        }
        const shots = muster(frame);
        const t = frame.still ? 0 : frame.time / 1000;
        const dt = last && !frame.still ? Math.min(0.1, (frame.time - last) / 1000) : 0;
        last = frame.time;
        drawn = frame.time;

        // A shot that wasn't there a moment ago has just landed: spray for a miss, flame for a hit.
        if (shotAt && !frame.still)
          for (const place of shots) {
            if (shotAt.has(place)) continue;
            const [x, z] = spot(Number(place));
            const struck = frame.pieces.some((p) => String(p.at) === place && (p.kind === "hit" || p.kind === "sunk"));
            if (struck) {
              for (let i = 0; i < 26; i++) bit(x, 0.3, z, spread(1.6), 0.6 + Math.random() * 1.8, spread(1.6), 0.5 + Math.random() * 0.4, 0.07, -0.05, 2.2, FLAME, EMBER);
              for (let i = 0; i < 10; i++) bit(x + spread(0.3), 0.4, z + spread(0.3), spread(0.4), 0.7 + Math.random() * 0.6, spread(0.4), 1.2 + Math.random(), 0.09, 0.14, 0, SMOKE, SOOT);
            } else {
              for (let i = 0; i < 22; i++) bit(x + spread(0.15), 0.1, z + spread(0.15), spread(0.7), 1.6 + Math.random() * 1.6, spread(0.7), 0.7 + Math.random() * 0.4, 0.055, -0.03, 4.5, WHITE, SPRAY);
              for (let i = 0; i < 12; i++) bit(x, 0.08, z, Math.cos(i * 0.52) * 0.9, 0.15, Math.sin(i * 0.52) * 0.9, 0.5, 0.045, -0.04, 0.6, WHITE, SPRAY);
            }
          }
        shotAt = shots;

        // The water rolls, and everything on it rides the roll.
        if (water) {
          const pos = water.geometry.getAttribute("position");
          for (let i = 0; i < pos.count; i++) pos.setY(i, swell(pos.getX(i), pos.getZ(i), t));
          pos.needsUpdate = true;
          water.geometry.computeVertexNormals();
        }
        for (const s of standing.values()) {
          s.group.position.set(s.x, swell(s.x, s.z, t) * s.rides, s.z);
          s.group.rotation.z = Math.sin(t * 1.1 + s.x) * s.roll;
          s.group.rotation.x = Math.cos(t * 0.9 + s.z) * s.roll;
          if (s.spin) s.spin.rotation.y = t * 1.4;
          if (frame.still) continue;
          for (const o of s.group.children) if (o.name === "fire") o.scale.set(0.8 + Math.random() * 0.4, 0.7 + Math.random() * 0.7, 0.8 + Math.random() * 0.4);
          // Smoke off whatever is burning, and a little off a wreck.
          for (const [hx, hz] of s.burning) {
            const turned = s.group.rotation.y !== 0;
            const wx = s.x + (turned ? -hz : hx);
            const wz = s.z + (turned ? hx : hz);
            if (Math.random() < (s.sunk ? 0.05 : 0.22)) bit(wx + spread(0.1), s.sunk ? 0.15 : 0.5, wz + spread(0.1), 0.12 + spread(0.1), 0.45 + Math.random() * 0.3, spread(0.1), 1.6 + Math.random(), 0.06, 0.1, 0, s.sunk ? SOOT : SMOKE, SOOT);
            if (!s.sunk && Math.random() < 0.18) bit(wx + spread(0.12), 0.42, wz + spread(0.12), spread(0.1), 0.5 + Math.random() * 0.4, spread(0.1), 0.35, 0.05, -0.08, 0, FLAME, EMBER);
          }
        }

        // The spray, flame and smoke move on.
        for (let i = bits.length - 1; i >= 0; i--) {
          const b = bits[i]!;
          b.age += dt;
          if (b.age >= b.life || frame.still) {
            bits.splice(i, 1);
            continue;
          }
          b.vy -= b.fall * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
        }
        cloud.count = bits.length;
        bits.forEach((b, i) => {
          const k = b.age / b.life;
          const sz = Math.max(0.005, (b.size + b.grow * b.age) * (k > 0.7 ? (1 - k) / 0.3 : 1));
          m4.compose(at.set(b.x, Math.max(0.02, b.y), b.z), q.identity(), scale.set(sz, sz, sz));
          cloud.setMatrixAt(i, m4);
          cloud.setColorAt(i, tint.copy(b.from).lerp(b.to, k));
        });
        cloud.instanceMatrix.needsUpdate = true;
        if (cloud.instanceColor) cloud.instanceColor.needsUpdate = true;

        renderer.render(scene, camera);
        return frame.still ? "idle" : "busy";
      } catch {
        lost = true;
        return null;
      }
    },
    dispose() {
      tray.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      renderer.dispose();
    },
  };
}
