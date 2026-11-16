// The bowling alley round the lane, for the view from behind the bowler (see scene3d-gl.ts, which
// builds the lane itself and everything that is played with).
//
// A lane's table only knows the lane: its boards, a strip either side where a ball is out, the pit.
// Seen flat from above that is all there is to draw. Seen from the foul line it needs a room to be
// in: gutters that are really sunk below the boards, the lanes either side with their own pins (and
// somebody bowling on them), the dividers and kickbacks between, the pit and the masking units over
// it, a ceiling with its lights, and the walls. None of it is part of the game: a ball can't reach
// it, and nothing here is looked at by the rules.
//
// Lengths are world units, as everywhere in the scene: a thousand to a foot, near enough.
import { AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Shape as Outline, ShapeGeometry, SphereGeometry, SRGBColorSpace, type Material } from "three";
import { PIN_SPOTS, type SportView } from "@journey-to-code/games";
import { at, mesh, paint, patch, pinMaterial, pinMesh, rectangle, surfaceMaterial, type Ground } from "./scene3d-gl";

type Table = SportView["table"];

export interface Alley {
  group: Group;
  /** How high the floor is at a point: the boards are 0, a gutter dips, the pit is lower still. */
  ground: Ground;
  /** Move what moves by itself: the bowlers on the other lanes. */
  play(time: number, still: boolean): void;
}

/** How deep a gutter is at its middle, and how far down the pit's floor is. */
const GUTTER_DEEP = 760;
const PIT_DEEP = 900;
/** The strip between one lane's gutter and the next lane's. */
const DIVIDER = 1500;
/** The bottom of the masking units: just clear of a standing pin. */
const MASK_FROM = 4700;
const MASK_TO = 11200;
const CEILING = 12600;
const PIN_HIGH = 3800;
/** How many lanes there are either side of the one being bowled on. */
const BESIDE = 2;
/** The number on the lane being bowled on; the others count up and down from it. */
const OUR_LANE = 7;
const BALL_TONES = ["#d8453a", "#3f78d6", "#3fae6a", "#8a5bd6", "#e39a2c", "#d65b9a"];

// ---- Signs and glows, painted once --------------------------------------------------------------
const masks = new Map<number, CanvasTexture>();
/** The front of a masking unit: night blue, a starburst, the lane's number and two lit bands. */
function maskTexture(lane: number): CanvasTexture {
  let t = masks.get(lane);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 256;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#141a3c");
  sky.addColorStop(1, "#231848");
  g.fillStyle = sky;
  g.fillRect(0, 0, 768, 256);
  // Rays from behind the number.
  g.save();
  g.translate(384, 150);
  for (let i = 0; i < 18; i++) {
    g.rotate(Math.PI / 9);
    g.fillStyle = i % 2 ? "rgba(255, 196, 92, 0.10)" : "rgba(90, 209, 230, 0.08)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(520, -46);
    g.lineTo(520, 46);
    g.fill();
  }
  g.restore();
  // A row of pins either side, as plain shapes.
  g.fillStyle = "rgba(255, 255, 255, 0.16)";
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = 384 + side * (200 + i * 62);
      g.beginPath();
      g.ellipse(x, 142, 15, 34, 0, 0, Math.PI * 2);
      g.ellipse(x, 92, 9, 16, 0, 0, Math.PI * 2);
      g.fill();
    }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "900 150px 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";
  g.fillStyle = "#0c1030";
  g.fillText(String(lane), 390, 128);
  g.fillStyle = "#fff4d6";
  g.fillText(String(lane), 384, 122);
  // The lit bands along the bottom.
  g.fillStyle = "#5ad1e6";
  g.fillRect(0, 212, 768, 8);
  g.fillStyle = "#f2b84b";
  g.fillRect(0, 228, 768, 20);
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  masks.set(lane, t);
  return t;
}

let glowMap: CanvasTexture | null = null;
/** Light lying on the boards: bright at one end, gone by the other. */
function glowTexture(): CanvasTexture {
  if (glowMap) return glowMap;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 128;
  const g = c.getContext("2d")!;
  const fade = g.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, "rgba(255,255,255,1)");
  fade.addColorStop(0.35, "rgba(255,255,255,0.35)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, 8, 128);
  return (glowMap = new CanvasTexture(c));
}
let poolMap: CanvasTexture | null = null;
/** A soft-edged bar of light, for what a ceiling light leaves on the boards under it. */
function poolTexture(): CanvasTexture {
  if (poolMap) return poolMap;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 64;
  const g = c.getContext("2d")!;
  const fade = g.createLinearGradient(0, 0, 0, 64);
  fade.addColorStop(0, "rgba(255,255,255,0)");
  fade.addColorStop(0.5, "rgba(255,255,255,1)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, 8, 64);
  return (poolMap = new CanvasTexture(c));
}

const lit = new Map<string, MeshBasicMaterial>();
/** Something that glows by itself: a sign, a tube of neon, a light. */
function glowing(color: string): MeshBasicMaterial {
  let m = lit.get(color);
  if (!m) lit.set(color, (m = new MeshBasicMaterial({ color })));
  return m;
}
const flat = (w: number, d: number) => new PlaneGeometry(w, d).rotateX(-Math.PI / 2);
const still = (g: BufferGeometry, m: Material) => mesh(g, m, false);

/** A bowler on another lane: the ball they roll, their pins, and how often they bowl. */
interface Neighbour {
  ball: Mesh;
  pins: { skin: Mesh; x: number; z: number; lean: number; turn: number }[];
  x: number;
  every: number;
  after: number;
  seed: number;
}

export function buildAlley(table: Table): Alley | null {
  const { look, world } = table;
  const boards = look.ground.find((p) => p.surface === "lane");
  const gutter = world.regions.find((r) => r.id.startsWith("gutter"));
  if (!boards || !("points" in boards.shape) || !gutter || !("points" in gutter.shape)) return null;
  const xs = boards.shape.points.map((p) => p[0]);
  const ys = boards.shape.points.map((p) => p[1]);
  const half = Math.max(...xs);
  const pit = Math.min(...ys);
  const near = Math.max(...ys);
  const gx = gutter.shape.points.map((p) => p[0]);
  const wide = Math.max(...gx) - Math.min(...gx);
  if (!(half > 0) || !(wide > 0) || !(near > pit)) return null;
  const long = near - pit;
  const mid = (near + pit) / 2;
  /** From the middle of one lane to the middle of the next. */
  const pitch = 2 * (half + wide) + DIVIDER;
  const edge = (BESIDE + 0.5) * pitch;
  const ball = world.bodies.find((b) => b.id === "ball");
  const foul = ball ? ball.y : near - 3000;
  const ballR = ball?.r ?? 1300;
  const spots = PIN_SPOTS as readonly (readonly [number, number])[];
  const pinR = world.bodies.find((b) => b.id !== "ball" && !b.fixed)?.r ?? 800;

  const g = new Group();
  const dark = paint("#14171f", 0.9);
  const charcoal = paint("#4b505c", 0.6);
  const channel = new MeshStandardMaterial({ color: "#15171c", roughness: 0.35, metalness: 0.3, side: DoubleSide });
  const trim = paint("#8d94a3", 0.35, 0.5);
  const marking = new MeshBasicMaterial({ color: "#4a2f18", transparent: true, opacity: 0.75, depthWrite: false });
  const amber = new MeshBasicMaterial({ color: "#f2b84b", map: glowTexture(), transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false });
  const pool = new MeshBasicMaterial({ color: "#fff1cf", map: poolTexture(), transparent: true, opacity: 0.1, blending: AdditiveBlending, depthWrite: false });

  // Under everything: a floor in the dark, so nothing is ever seen through to.
  g.add(at(still(flat(edge * 2 + 40000, long + 80000), paint("#0b0d13", 1)), 0, -PIT_DEEP - 40, mid));
  // The approach: one floor of boards across every lane, behind the foul line.
  const approach = still(patch(rectangle(-edge, near, edge * 2, 26000)), surfaceMaterial("wood"));
  approach.position.y = 1;
  g.add(approach);

  // A gutter is the bottom half of a pipe, squashed: laid along the lane, open to the top.
  const trough = new CylinderGeometry(wide / 2, wide / 2, long, 18, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, GUTTER_DEEP / (wide / 2), 1);
  const arrow = new Outline();
  arrow.moveTo(0, 520);
  arrow.lineTo(190, -300);
  arrow.lineTo(-190, -300);
  const dart = new ShapeGeometry(arrow).rotateX(-Math.PI / 2);
  const dot = new CylinderGeometry(70, 70, 2, 12);
  const lights: number[] = [];
  for (let z = pit + 9000; z < near + 20000; z += 11000) lights.push(z);

  const neighbours: Neighbour[] = [];
  for (let i = -BESIDE; i <= BESIDE; i++) {
    const cx = i * pitch;
    // The boards of the lanes either side (the lane being bowled on is laid by the scene itself).
    if (i !== 0) {
      const lane = still(patch(rectangle(cx - half, pit, 2 * half, long)), surfaceMaterial("lane"));
      lane.position.y = 3;
      g.add(lane);
    }
    for (const side of [-1, 1]) {
      g.add(at(still(trough, channel), cx + side * (half + wide / 2), 2, mid));
      // A bright lip where the gutter meets the cap beside it, so the channel reads as one.
      g.add(at(still(new BoxGeometry(90, 40, long), trim), cx + side * (half + wide - 20), 6, mid));
      // The seven arrows a bowler aims by, and the dots short of them.
      for (let k = 0; k <= 3; k++) {
        if (k === 0 && side < 0) continue;
        const x = cx + side * k * (half / 4.6);
        g.add(at(new Mesh(dart, marking), x, 9, foul - 16000 + k * 900));
        if (k > 0) g.add(at(new Mesh(dot, marking), x + side * (half / 9.2), 9, foul - 7000));
      }
    }
    // Light from the sign over the pins lies on the boards in front of them, and each ceiling
    // light leaves a bar of its own.
    g.add(at(new Mesh(flat(2 * half, 30000), amber), cx, 10, pit + 15000));
    for (const z of lights) if (z < near) g.add(at(new Mesh(flat(2 * half, 3400), pool), cx, 11, z));
    // The pit: a dark floor below the boards, and the curtain at the back that stops the ball.
    g.add(at(still(flat(pitch, 3000), paint("#08090d", 1)), cx, -PIT_DEEP, pit - 1500));
    g.add(at(still(new BoxGeometry(pitch, MASK_FROM + PIT_DEEP, 200), paint("#0b0c11", 1)), cx, (MASK_FROM - PIT_DEEP) / 2, pit - 3000));
    // The masking unit over the pins, with the lane's number on it.
    g.add(at(new Mesh(new BoxGeometry(pitch - 60, MASK_TO - MASK_FROM, 500), [dark, dark, dark, dark, new MeshBasicMaterial({ map: maskTexture(OUR_LANE + i), color: i === 0 ? "#ffffff" : "#b9bccb" }), dark]), cx, (MASK_FROM + MASK_TO) / 2, pit - 300));

    if (i === 0) continue;
    // Somebody else's game: a rack of pins, and a ball that comes down the lane every so often.
    const seed = (i + 7) * 2654435761;
    const tone = BALL_TONES[(i + BESIDE * 3) % BALL_TONES.length]!;
    const rolling = mesh(new SphereGeometry(ballR, 24, 16), new MeshStandardMaterial({ color: tone, roughness: 0.25, metalness: 0.1 }), false);
    rolling.visible = false;
    g.add(rolling);
    const pins = spots.map(([x, z], n) => {
      const skin = still(pinMesh(), pinMaterial);
      skin.scale.set(pinR, PIN_HIGH, pinR);
      skin.position.set(cx + x, 3, z);
      g.add(skin);
      return { skin, x: cx + x, z, lean: ((n * 53 + i * 17) % 100) / 100 - 0.5, turn: ((n * 31 + i * 7) % 100) / 100 - 0.5 };
    });
    neighbours.push({ ball: rolling, pins, x: cx, every: 9 + ((i + BESIDE) * 3.7) % 6, after: (i + BESIDE) * 3.1, seed });
  }

  // Between the gutters of two lanes: a capped divider the length of the lane, which stands up
  // into a kickback wall either side of the pins.
  for (let i = -BESIDE - 1; i <= BESIDE; i++) {
    const x = (i + 0.5) * pitch;
    g.add(at(still(new BoxGeometry(DIVIDER, 420, long), charcoal), x, 210 - 40, mid));
    g.add(at(still(new BoxGeometry(DIVIDER * 0.34, 30, long), paint("#c7483c", 0.5, 0.1)), x, 392, mid));
    const back = pit - 3000;
    const front = Math.min(pit + 13500, near);
    g.add(at(still(new BoxGeometry(DIVIDER, MASK_FROM + PIT_DEEP, front - back), paint("#191c25", 0.6)), x, (MASK_FROM - PIT_DEEP) / 2, (front + back) / 2));
  }

  // The foul line, across every lane.
  g.add(at(still(flat(edge * 2, 220), paint("#1b1410", 0.6)), 0, 8, foul + ballR + 300));

  // Over the masking units the wall goes up to the ceiling; the ceiling has a light across it
  // every so often, and a wall runs down each side of the room with a line of neon along it.
  g.add(at(still(new BoxGeometry(edge * 2 + 2000, CEILING - MASK_TO + 400, 600), dark), 0, (CEILING + MASK_TO) / 2, pit - 350));
  const roof = still(flat(edge * 2 + 2000, long + 60000), paint("#10131c", 1));
  roof.rotation.x = Math.PI;
  g.add(at(roof, 0, CEILING, mid + 20000));
  for (const z of lights) {
    g.add(at(still(new BoxGeometry(edge * 2, 90, 800), glowing("#fff1cf")), 0, CEILING - 60, z));
    g.add(at(still(new BoxGeometry(edge * 2, 240, 1500), paint("#1a1e2a", 0.8)), 0, CEILING - 10, z));
  }
  for (const side of [-1, 1]) {
    const x = side * (edge + 500);
    g.add(at(still(new BoxGeometry(1000, CEILING + PIT_DEEP, long + 60000), paint("#161b2e", 0.9)), x, (CEILING - PIT_DEEP) / 2, mid + 20000));
    g.add(at(still(new BoxGeometry(60, 160, long + 60000), glowing("#ff5fa8")), x - side * 530, 6400, mid + 20000));
    g.add(at(still(new BoxGeometry(60, 160, long + 60000), glowing("#5ad1e6")), x - side * 530, 5600, mid + 20000));
  }

  const ground: Ground = (x, y) => {
    if (y < pit) return -PIT_DEEP;
    if (y > near) return 0;
    // Which lane's gutter, if any: the same shape either side of every lane.
    const across = Math.abs(x) - half;
    if (across <= 0 || across >= wide) return 0;
    const u = (across - wide / 2) / (wide / 2);
    return -GUTTER_DEEP * Math.sqrt(Math.max(0, 1 - u * u));
  };

  /** A number from 0 to 1 that is always the same for the same two whole numbers. */
  const chance = (a: number, b: number) => {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ROLL = 2.6;
  function play(time: number, quiet: boolean) {
    for (const n of neighbours) {
      const clock = time / 1000 + n.after;
      const turn = Math.floor(clock / n.every);
      const t = quiet ? n.every : clock - turn * n.every;
      // The ball: down the lane, a little off the middle, and into the pit.
      const rolling = t < ROLL + 0.25;
      n.ball.visible = rolling;
      if (rolling) {
        const p = t / ROLL;
        const off = (chance(turn, n.seed) - 0.5) * half * 0.9;
        const z = foul + (pit - 1500 - foul) * p;
        n.ball.position.set(n.x + off * (0.4 + 0.6 * p), ballR + 3, z);
        n.ball.rotation.x = -(foul - z) / ballR;
      }
      // The pins: some of them go over when the ball gets there, lie a while, and are set up again.
      const struck = (t - ROLL * 0.93) / 0.3;
      const cleared = t > n.every * 0.72;
      const strike = chance(turn, n.seed + 1) < 0.3;
      n.pins.forEach((pin, k) => {
        const falls = !quiet && (strike || chance(turn * 16 + k, n.seed + 2) < 0.72);
        const lean = falls && struck > 0 && !cleared ? Math.min(1, struck) * 1.45 : 0;
        pin.skin.visible = !(falls && cleared && t < n.every * 0.86);
        pin.skin.rotation.set(-lean, 0, lean * pin.lean * 0.9);
        pin.skin.rotation.y = lean * pin.turn;
        pin.skin.position.set(pin.x, 3 + Math.sin(lean) * pinR * 0.9, pin.z - Math.sin(lean) * pinR * 0.6);
      });
    }
  }
  play(0, true);
  return { group: g, ground, play };
}
