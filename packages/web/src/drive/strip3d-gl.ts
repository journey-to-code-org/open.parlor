// The three.js half of the strip (see strip3d.ts, which loads this on demand).
//
// A drag strip at night: the road with its lane line and the rubber laid down off the start,
// concrete walls, lamp posts, a tower and stands, the tree, a finish gantry and a timing board for
// each lane. The cars are built here from a side profile pushed out to the car's width, one profile
// for each kind of body, so a wagon looks like a wagon and a pickup like a pickup. The camera
// follows your own car from behind and a little above, and widens as the speed builds.
//
// Scene units are metres. The strip runs away from the viewer along -z; x is across it.
import {
  AdditiveBlending, AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Fog, Group, HemisphereLight,
  Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, RepeatWrapping, Scene, Shape, SphereGeometry, SpotLight, Sprite, SpriteMaterial,
  SRGBColorSpace, Texture, WebGLRenderer,
} from "three";
import type { Frame3d, Strip3d } from "./strip3d";

const LANE = 4.6;
const LENGTH = 760;
const START = 40;

// ---- Bodies ----------------------------------------------------------------------------------------
// A side profile from the back bumper (x = 0) to the front, in metres; the glass front and back as
// lines along it; and the side windows as a shape.

type Pt = [x: number, y: number];
interface BodyStyle {
  width: number;
  profile: Pt[];
  /** Windscreen and back window: each a line from its bottom edge to its top. */
  glass: [Pt, Pt][];
  side: Pt[];
  /** Where a wing would bolt on: the back deck's height. */
  deck: number;
}
const STYLES: Record<string, BodyStyle> = {
  hatch: { width: 1.6, deck: 1.38, profile: [[0, 0.25], [0, 0.95], [0.28, 1.38], [1.9, 1.42], [2.55, 0.98], [3.6, 0.86], [3.7, 0.5], [3.7, 0.25]], glass: [[[0.02, 0.98], [0.26, 1.34]], [[2.52, 1.0], [1.95, 1.39]]], side: [[0.45, 0.98], [0.6, 1.33], [1.85, 1.36], [2.35, 1.0]] },
  sedan: { width: 1.7, deck: 0.98, profile: [[0, 0.25], [0, 0.92], [0.85, 0.98], [1.3, 1.4], [2.6, 1.42], [3.2, 0.98], [4.4, 0.86], [4.5, 0.5], [4.5, 0.25]], glass: [[[0.9, 1.0], [1.27, 1.36]], [[3.16, 1.0], [2.65, 1.39]]], side: [[1.15, 1.0], [1.45, 1.34], [2.55, 1.36], [3.0, 1.0]] },
  wagon: { width: 1.76, deck: 1.44, profile: [[0, 0.25], [0, 1.0], [0.16, 1.44], [2.9, 1.46], [3.5, 1.0], [4.7, 0.88], [4.8, 0.5], [4.8, 0.25]], glass: [[[0.02, 1.03], [0.15, 1.4]], [[3.46, 1.02], [2.95, 1.43]]], side: [[0.35, 1.03], [0.45, 1.38], [2.85, 1.4], [3.3, 1.03]] },
  pickup: { width: 1.66, deck: 0.95, profile: [[0, 0.3], [0, 0.95], [1.9, 0.95], [1.95, 1.5], [3.0, 1.52], [3.5, 1.02], [4.5, 0.92], [4.6, 0.55], [4.6, 0.3]], glass: [[[1.91, 1.02], [1.94, 1.44]], [[3.46, 1.04], [3.04, 1.48]]], side: [[2.1, 1.05], [2.15, 1.44], [2.95, 1.46], [3.3, 1.05]] },
  van: { width: 1.8, deck: 1.72, profile: [[0, 0.28], [0, 1.1], [0.1, 1.72], [3.3, 1.74], [4.1, 1.1], [4.5, 0.95], [4.6, 0.55], [4.6, 0.28]], glass: [[[0.02, 1.14], [0.09, 1.66]], [[4.05, 1.13], [3.36, 1.7]]], side: [[0.3, 1.14], [0.35, 1.64], [3.25, 1.66], [3.85, 1.14]] },
  coupe: { width: 1.72, deck: 0.94, profile: [[0, 0.24], [0, 0.88], [0.5, 0.96], [1.5, 1.26], [2.45, 1.28], [3.1, 0.92], [4.3, 0.78], [4.4, 0.46], [4.4, 0.24]], glass: [[[0.58, 0.99], [1.46, 1.24]], [[3.05, 0.95], [2.5, 1.25]]], side: [[1.2, 0.97], [1.65, 1.21], [2.42, 1.23], [2.9, 0.95]] },
  roadster: { width: 1.64, deck: 0.84, profile: [[0, 0.24], [0, 0.82], [1.2, 0.9], [2.3, 0.92], [3.8, 0.76], [3.9, 0.46], [3.9, 0.24]], glass: [[[2.42, 0.93], [2.2, 1.2]]], side: [] },
};
const CARS: Record<string, { style: keyof typeof STYLES; wing?: boolean; scale?: number }> = {
  sparrow: { style: "hatch" }, custodian: { style: "sedan" }, estate: { style: "wagon" }, mule: { style: "pickup" }, caravel: { style: "van" },
  wasp: { style: "hatch", wing: true }, brumby: { style: "coupe", scale: 1.05 }, kite: { style: "roadster" }, brick: { style: "sedan", scale: 1.04 },
  umbra: { style: "coupe", wing: true }, cyclone: { style: "coupe", scale: 0.97 }, zenith: { style: "coupe", wing: true, scale: 1.06 },
};

const shapeOf = (pts: Pt[]) => {
  const s = new Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};

interface Car {
  group: Group;
  body: Group;
  wheels: Object3D[];
  tails: MeshBasicMaterial;
  pool: Mesh;
  key: string;
  length: number;
  speed: number;
  pitch: number;
}

function buildCar(key: string, tone: string, poolTexture: Texture, shadeTexture: Texture): Car {
  const spec = CARS[key] ?? CARS.sparrow!;
  const style = STYLES[spec.style]!;
  const L = style.profile.reduce((m, p) => Math.max(m, p[0]), 0);
  const W = style.width;
  // Everything is built with x forward and z across, centred, then turned to face down the strip.
  const shell = new Group();
  const paint = new MeshStandardMaterial({ color: new Color(tone), metalness: 0.12, roughness: 0.38 });
  const dark = new MeshStandardMaterial({ color: 0x0b0d12, metalness: 0.3, roughness: 0.25 });
  const trim = new MeshStandardMaterial({ color: 0x16181d, roughness: 0.8 });
  const body = new Mesh(new ExtrudeGeometry(shapeOf(style.profile), { depth: W - 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }), paint);
  body.geometry.translate(-L / 2, 0, -(W - 0.12) / 2);
  shell.add(body);
  if (style.side.length) {
    const side = new Mesh(new ExtrudeGeometry(shapeOf(style.side), { depth: W + 0.02, bevelEnabled: false }), dark);
    side.geometry.translate(-L / 2, 0, -(W + 0.02) / 2);
    shell.add(side);
  }
  for (const [a, b] of style.glass) {
    // A pane lying on the body, a finger's width proud of it.
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len;
    if (ny < 0 || (Math.abs(ny) < 0.2 && nx * (a[0] - L / 2) < 0)) (nx = -nx), (ny = -ny);
    const hw = W / 2 - 0.16;
    const v = [a, b].flatMap(([x, y]) => [-1, 1].flatMap((sgn) => [x - L / 2 + nx * 0.07, y + ny * 0.07, sgn * hw]));
    const pane = new BufferGeometry();
    pane.setAttribute("position", new Float32BufferAttribute(v, 3));
    pane.setIndex([0, 1, 2, 2, 1, 3]);
    pane.computeVertexNormals();
    shell.add(new Mesh(pane, new MeshStandardMaterial({ color: 0x0b0d12, metalness: 0.3, roughness: 0.2, side: DoubleSide })));
  }
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: Material) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    shell.add(mesh);
    return mesh;
  };
  const back = style.profile[1]![1];
  box(0.16, 0.16, W + 0.04, -L / 2 - 0.02, 0.38, 0, trim);
  box(0.16, 0.16, W + 0.04, L / 2 + 0.02, 0.38, 0, trim);
  const tails = new MeshBasicMaterial({ color: 0xff2020 });
  for (const sgn of [-1, 1]) {
    box(0.05, 0.13, 0.42, -L / 2 - 0.075, back - 0.2, sgn * (W / 2 - 0.3), tails);
    box(0.05, 0.13, 0.3, L / 2 + 0.075, 0.62, sgn * (W / 2 - 0.26), new MeshBasicMaterial({ color: 0xfff1c9 }));
  }
  box(0.03, 0.12, 0.34, -L / 2 - 0.08, back - 0.42, 0, new MeshBasicMaterial({ color: 0xe9e6dc }));
  if (spec.wing) {
    box(0.34, 0.035, W - 0.1, -L / 2 + 0.2, style.deck + 0.24, 0, paint);
    for (const sgn of [-1, 1]) box(0.08, 0.24, 0.04, -L / 2 + 0.2, style.deck + 0.12, sgn * (W / 2 - 0.3), trim);
  }
  // Wheels: a tyre, a hub, and a bar across the hub so you can see them turn.
  const wheels: Object3D[] = [];
  const tyre = new MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
  const hub = new MeshStandardMaterial({ color: 0xb9bec9, metalness: 0.8, roughness: 0.3 });
  const r = 0.31;
  for (const fx of [-1, 1]) for (const sgn of [-1, 1]) {
    const wheel = new Group();
    const t = new Mesh(new CylinderGeometry(r, r, 0.22, 20), tyre);
    t.rotation.x = Math.PI / 2;
    const h = new Mesh(new CylinderGeometry(r * 0.62, r * 0.62, 0.23, 14), hub);
    h.rotation.x = Math.PI / 2;
    const bar = new Mesh(new BoxGeometry(r * 1.1, 0.07, 0.24), trim);
    wheel.add(t, h, bar);
    wheel.position.set(fx * (L / 2 - 0.78), r, sgn * (W / 2 - 0.06));
    shell.add(wheel);
    wheels.push(wheel);
  }
  shell.rotation.y = Math.PI / 2;
  const tilt = new Group();
  tilt.add(shell);
  // The light the headlamps throw on the road ahead.
  const pool = new Mesh(new PlaneGeometry(4.2, 16), new MeshBasicMaterial({ map: poolTexture, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.55 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.03, -L / 2 - 8.2);
  // And the dark under it, which is what puts it on the road.
  const shade = new Mesh(new PlaneGeometry(W + 0.9, L + 1.0), new MeshBasicMaterial({ map: shadeTexture, transparent: true, depthWrite: false }));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.02;
  const group = new Group();
  group.add(tilt, pool, shade);
  group.scale.setScalar(spec.scale ?? 1);
  return { group, body: tilt, wheels, tails, pool, key, length: L, speed: 0, pitch: 0 };
}

// ---- Textures --------------------------------------------------------------------------------------

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Twelve metres of road: tarmac with grit in it, edge lines, and a dash between each pair of lanes. */
function roadTexture(lanes: number, width: number): CanvasTexture {
  const t = canvasTexture(512, 512, (g) => {
    g.fillStyle = "#26252d";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = `rgba(${i % 2 ? 255 : 0}, ${i % 2 ? 255 : 0}, ${i % 2 ? 255 : 0}, ${0.02 + ((i * 37) % 7) / 180})`;
      g.fillRect((i * 7919) % 512, (i * 104729) % 512, 2, 2);
    }
    const px = (m: number) => ((m + width / 2) / width) * 512;
    g.fillStyle = "#d9d3c1";
    g.fillRect(px(-(lanes * LANE) / 2 - 0.25), 0, 5, 512);
    g.fillRect(px((lanes * LANE) / 2 + 0.1), 0, 5, 512);
    for (let l = 1; l < lanes; l++) g.fillRect(px((l * 2 - lanes) * (LANE / 2)) - 2, 0, 5, 171);
    // Where the tyres run it is darker, and shinier for it.
    for (let l = 0; l < lanes; l++) for (const off of [-0.75, 0.75]) {
      const x = px((l * 2 - (lanes - 1)) * (LANE / 2) + off);
      const rub = g.createLinearGradient(x - 16, 0, x + 16, 0);
      rub.addColorStop(0, "rgba(0, 0, 0, 0)");
      rub.addColorStop(0.5, "rgba(0, 0, 0, 0.3)");
      rub.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = rub;
      g.fillRect(x - 16, 0, 32, 512);
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, LENGTH / 12);
  t.anisotropy = 8;
  return t;
}

const glow = (inner: string, outer: string) =>
  canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, inner);
    r.addColorStop(1, outer);
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });

function boardTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  let shown = "";
  return {
    texture: t,
    show(top: string, bottom: string) {
      if (shown === top + bottom) return;
      shown = top + bottom;
      const g = c.getContext("2d")!;
      g.fillStyle = "#07080b";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#ffb627";
      g.font = "700 56px 'Courier New', monospace";
      g.textAlign = "center";
      g.fillText(top, 128, 54);
      g.fillText(bottom, 128, 114);
      t.needsUpdate = true;
    },
  };
}

// ---- The scene -------------------------------------------------------------------------------------

export function makeStrip3d(canvas: HTMLCanvasElement): Strip3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(0x120d1f);
  scene.fog = new Fog(0x1d1430, 70, 560);
  const camera = new PerspectiveCamera(58, 1, 0.3, 1400);
  scene.add(new AmbientLight(0xa9acd0, 1.0), new HemisphereLight(0x8a92d8, 0x2a241c, 1.5));
  const moon = new DirectionalLight(0xdfe6ff, 1.9);
  moon.position.set(-20, 40, 60);
  scene.add(moon);
  const lamps = new SpotLight(0xfff0cf, 220, 70, 0.5, 0.6, 1.4);
  scene.add(lamps, lamps.target);

  const poolTexture = glow("rgba(255, 240, 200, 0.9)", "rgba(255, 240, 200, 0)");
  const shadeTexture = glow("rgba(0, 0, 0, 0.85)", "rgba(0, 0, 0, 0)");
  const puff = glow("rgba(255, 255, 255, 0.8)", "rgba(255, 255, 255, 0)");
  const world = new Group();
  scene.add(world);
  let built = "";
  let cars: Car[] = [];
  let boards: ReturnType<typeof boardTexture>[] = [];
  const smoke: { sprite: Sprite; life: number; vx: number; vy: number; vz: number }[] = [];
  let last = 0;
  let camX = 0;

  const laneX = (seat: number, lanes: number) => (seat * 2 - (lanes - 1)) * (LANE / 2);
  const off = new Color(0x1b1e26);

  function build(frame: Frame3d) {
    world.clear();
    cars = [];
    const lanes = frame.race.lanes.length;
    const line = frame.race.distance / 1000;
    const half = (lanes * LANE) / 2 + 1.2;
    const width = half * 2;
    const flat = (w: number, d: number, m: Material, x: number, y: number, z: number) => {
      const mesh = new Mesh(new PlaneGeometry(w, d), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      world.add(mesh);
      return mesh;
    };
    const block = (w: number, h: number, d: number, m: Material, x: number, y: number, z: number) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      world.add(mesh);
      return mesh;
    };
    const mid = START - LENGTH / 2;
    flat(1600, 1800, new MeshStandardMaterial({ color: 0x0e1210, roughness: 1 }), 0, -0.02, mid);
    flat(width, LENGTH, new MeshStandardMaterial({ map: roadTexture(lanes, width), roughness: 0.62, metalness: 0.05 }), 0, 0, mid);
    // The rubber off the start, and the lines.
    const burn = canvasTexture(64, 256, (g) => {
      const fade = g.createLinearGradient(0, 0, 0, 256);
      fade.addColorStop(0, "rgba(0, 0, 0, 0)");
      fade.addColorStop(0.75, "rgba(0, 0, 0, 0.75)");
      fade.addColorStop(1, "rgba(0, 0, 0, 0.2)");
      g.fillStyle = fade;
      g.fillRect(0, 0, 64, 256);
    });
    for (let seat = 0; seat < lanes; seat++) for (const side of [-0.75, 0.75]) flat(0.46, 90, new MeshBasicMaterial({ map: burn, transparent: true, depthWrite: false }), laneX(seat, lanes) + side, 0.012, -38);
    flat(lanes * LANE, 0.4, new MeshBasicMaterial({ color: 0xf4f0e6 }), 0, 0.014, -0.2);
    const checks = canvasTexture(256, 32, (g) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? "#f4f0e6" : "#0c0c0e";
        g.fillRect(i * 16, j * 16, 16, 16);
      }
    });
    flat(lanes * LANE, 1.6, new MeshBasicMaterial({ map: checks }), 0, 0.014, -line - 0.8);

    // Walls, and lamp posts along them.
    const concrete = new MeshStandardMaterial({ color: 0x8d8f96, roughness: 0.9 });
    const steel = new MeshStandardMaterial({ color: 0x4a5060, roughness: 0.6, metalness: 0.5 });
    const bulb = new MeshBasicMaterial({ color: 0xffe2a8 });
    const halo = new SpriteMaterial({ map: glow("rgba(255, 214, 140, 0.55)", "rgba(255, 214, 140, 0)"), transparent: true, blending: AdditiveBlending, depthWrite: false });
    const light = glow("rgba(255, 214, 150, 0.34)", "rgba(255, 214, 150, 0)");
    for (const side of [-1, 1]) {
      block(0.4, 0.95, LENGTH, concrete, side * (half + 0.5), 0.47, mid);
      for (let z = 20; z > -LENGTH + START + 20; z -= 40) {
        const x = side * (half + 2.6);
        const post = new Mesh(new CylinderGeometry(0.09, 0.12, 8.5, 8), steel);
        post.position.set(x, 4.25, z);
        const arm = block(2.2, 0.1, 0.1, steel, x - side * 1.1, 8.45, z);
        const head = new Mesh(new SphereGeometry(0.28, 10, 8), bulb);
        head.position.set(x - side * 2.1, 8.3, z);
        const shine = new Sprite(halo);
        shine.scale.setScalar(4.5);
        shine.position.copy(head.position);
        world.add(post, arm, head, shine);
        flat(13, 20, new MeshBasicMaterial({ map: light, transparent: true, blending: AdditiveBlending, depthWrite: false }), x - side * 4.6, 0.016, z);
      }
    }

    // A tower by the start with its lights on, stands with a crowd's phones in them, and a town far off.
    const windows = canvasTexture(64, 128, (g) => {
      g.fillStyle = "#15171d";
      g.fillRect(0, 0, 64, 128);
      for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) {
        g.fillStyle = (r * 3 + c * 5) % 4 ? "#ffd27a" : "#2a2d38";
        g.fillRect(6 + c * 19, 8 + r * 17, 14, 10);
      }
    });
    block(9, 16, 9, new MeshBasicMaterial({ map: windows }), -(half + 16), 8, -8);
    const seats = new MeshStandardMaterial({ color: 0x2a2e3a, roughness: 0.9 });
    for (let tier = 0; tier < 5; tier++) block(3, 1.1 + tier * 1.1, 150, seats, half + 9 + tier * 3, (1.1 + tier * 1.1) / 2, -95);
    const dots = (count: number, place: (i: number) => [number, number, number], colour: number, size: number) => {
      const at: number[] = [];
      for (let i = 0; i < count; i++) at.push(...place(i));
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(at, 3));
      world.add(new Points(geo, new PointsMaterial({ color: colour, size, sizeAttenuation: true, fog: false })));
    };
    const rnd = (i: number, k: number) => ((i * k * 9301 + 49297) % 233280) / 233280;
    dots(260, (i) => [half + 9 + rnd(i, 3) * 14, 1.6 + rnd(i, 7) * 5.5, -20 - rnd(i, 11) * 150], 0xdfe9ff, 0.22);
    dots(420, (i) => [(rnd(i, 13) - 0.5) * 1500, 2 + rnd(i, 5) * 16, -900 - rnd(i, 17) * 200], 0xffcf7a, 3.2);
    dots(500, (i) => [(rnd(i, 19) - 0.5) * 2200, 120 + rnd(i, 23) * 700, -1100], 0xffffff, 2.4);

    // The tree, between the lanes, a few lengths down.
    const treeX = lanes > 1 ? 0 : LANE / 2 + 0.6;
    block(0.14, 3.2, 0.14, steel, treeX, 1.6, -14);
    block(1.5, 2.5, 0.2, new MeshStandardMaterial({ color: 0x23262f, roughness: 0.8 }), treeX, 3.2, -14);
    const lampAt = (col: number, row: number) => {
      const m = new MeshBasicMaterial({ color: off.clone() });
      const lamp = new Mesh(new SphereGeometry(0.17, 12, 10), m);
      lamp.position.set(treeX + col * 0.4, 4.15 - row * 0.44, -13.86);
      world.add(lamp);
      return m;
    };
    const cols = lanes > 1 ? [-1, 1] : [0];
    const ambers: MeshBasicMaterial[][] = [[], [], []];
    const greens: MeshBasicMaterial[] = [];
    const reds: MeshBasicMaterial[] = [];
    cols.forEach((col) => {
      for (let i = 0; i < 3; i++) ambers[i]!.push(lampAt(col, i));
      greens.push(lampAt(col, 3));
      reds.push(lampAt(col, 4));
    });
    treeAll = { ambers, greens, reds };

    // The finish: a gantry, and a board for each lane a little way past it.
    const red = new MeshBasicMaterial({ color: 0xc8323c });
    block(width + 2, 1.1, 0.3, red, 0, 7.2, -line);
    for (const side of [-1, 1]) block(0.3, 7.8, 0.3, steel, side * (half + 0.9), 3.9, -line);
    boards = [];
    for (let seat = 0; seat < lanes; seat++) {
      const board = boardTexture();
      board.show("", "");
      boards.push(board);
      const x = lanes > 1 ? (seat ? 1 : -1) * (half + 4.5) : half + 4.5;
      block(5.6, 2.8, 0.3, new MeshBasicMaterial({ map: board.texture, fog: false }), x, 5.6, -line - 30);
      block(0.3, 4.4, 0.3, steel, x, 2.2, -line - 30);
    }

    frame.race.lanes.forEach((_, seat) => {
      const car = buildCar(frame.cars[seat] ?? "sparrow", frame.tones[seat] ?? "#4cc9ff", poolTexture, shadeTexture);
      car.group.position.x = laneX(seat, lanes);
      world.add(car.group);
      cars.push(car);
    });
  }
  let treeAll: { ambers: MeshBasicMaterial[][]; greens: MeshBasicMaterial[]; reds: MeshBasicMaterial[] } = { ambers: [], greens: [], reds: [] };

  function puffAt(x: number, y: number, z: number, darkness: number, speed: number) {
    let p = smoke.find((s) => s.life <= 0);
    if (!p) {
      if (smoke.length >= 70) return;
      p = { sprite: new Sprite(new SpriteMaterial({ map: puff, transparent: true, depthWrite: false })), life: 0, vx: 0, vy: 0, vz: 0 };
      scene.add(p.sprite);
      smoke.push(p);
    }
    p.life = 1;
    p.sprite.position.set(x + (Math.random() - 0.5) * 0.5, y, z);
    p.sprite.material.color.setScalar(darkness);
    p.vx = (Math.random() - 0.5) * 1.4;
    p.vy = 1 + Math.random() * 1.6;
    p.vz = speed * 0.25 + 1.5 + Math.random() * 2;
  }

  return {
    render(frame) {
      const sig = `${frame.cars.join()}|${frame.tones.join()}|${frame.race.distance}`;
      if (sig !== built) {
        built = sig;
        build(frame);
      }
      const dt = Math.min(0.05, last ? (frame.time - last) / 1000 : 0.016);
      last = frame.time;
      const race = frame.race;
      const lanes = race.lanes.length;
      const me = race.lanes[0]!;
      const myZ = -me.distance / 1000;

      race.lanes.forEach((lane, seat) => {
        const car = cars[seat];
        if (!car) return;
        car.group.visible = lane.staged;
        const speed = lane.speed / 1000;
        const accel = dt > 0 ? (speed - car.speed) / dt : 0;
        car.speed = speed;
        // It sits back on the springs when it leaves, and noses down when it lifts.
        car.pitch += (Math.max(-0.035, Math.min(0.05, accel * 0.006)) - car.pitch) * Math.min(1, dt * 8);
        car.body.rotation.x = car.pitch;
        car.body.position.y = lane.spinning ? Math.sin(frame.time * 0.05 + seat) * 0.012 : 0;
        car.group.position.z = -lane.distance / 1000;
        car.group.position.x = laneX(seat, lanes) + (lane.spinning ? Math.sin(frame.time * 0.021 + seat * 2) * 0.05 : 0);
        const turn = lane.spinning ? Math.max(speed, 14) : speed;
        for (const wheel of car.wheels) wheel.rotation.z -= (turn / 0.31) * dt;
        car.tails.color.setHex(lane.gear === 0 || lane.blown ? 0xff2020 : 0xa01212);
        (car.pool.material as MeshBasicMaterial).opacity = lane.blown ? 0.15 : 0.55;
        if (!frame.still) {
          if (lane.spinning && Math.random() < 0.7) puffAt(car.group.position.x, 0.25, car.group.position.z + car.length / 2 - 0.4, 0.9, speed);
          if (lane.blown && Math.random() < 0.5) puffAt(car.group.position.x, 0.9, car.group.position.z - car.length / 2 + 0.6, 0.18, speed);
        }
      });
      for (const p of smoke) {
        if (p.life <= 0) {
          p.sprite.visible = false;
          continue;
        }
        p.life -= dt * 0.9;
        p.sprite.visible = true;
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        p.sprite.scale.setScalar(1.2 + (1 - p.life) * 4);
        p.sprite.material.opacity = Math.max(0, p.life) * 0.5;
      }

      // The lights.
      const lit = (m: MeshBasicMaterial, on: boolean, colour: number) => m.color.setHex(on ? colour : 0x1b1e26);
      treeAll.ambers.forEach((row, i) => row.forEach((m) => lit(m, !!race.tree.ambers[i], 0xffb627)));
      treeAll.greens.forEach((m) => lit(m, race.tree.green, 0x55d68a));
      treeAll.reds.forEach((m, i) => lit(m, lanes > 1 ? !!race.lanes[i]?.foul : race.lanes.some((l) => l.foul), 0xff3b3b));
      race.lanes.forEach((lane, seat) => boards[seat]?.show(lane.time === null ? "" : (lane.time / 1000).toFixed(3), lane.trap === null ? "" : `${lane.trap} MPH`));

      // The camera: behind your car, pulled toward the middle of the road, and wider with speed.
      const aspect = frame.width / Math.max(1, frame.height);
      const tall = aspect < 0.9;
      const mine = laneX(0, lanes);
      camX += ((tall ? 0 : mine * 0.62) - camX) * Math.min(1, dt * 4 + (last ? 0 : 1));
      const speed = me.speed / 1000;
      const shake = frame.still ? 0 : Math.min(0.05, speed * 0.0007);
      camera.fov = (tall ? 70 : 46) + Math.min(14, speed * 0.22);
      camera.aspect = aspect;
      camera.position.set(camX + Math.sin(frame.time * 0.037) * shake, (tall ? 4.2 : 3.3) + Math.sin(frame.time * 0.051) * shake, myZ + (tall ? 11 : 9.2));
      // Looking down a little, so the car rides above the gauges.
      camera.lookAt(tall ? 0 : mine * 0.75, tall ? -3.4 : -2.6, myZ - 13);
      camera.updateProjectionMatrix();
      lamps.position.set(mine, 1.1, myZ - 1.5);
      lamps.target.position.set(mine, 0, myZ - 26);

      const w = Math.round(frame.width * frame.dpr);
      const h = Math.round(frame.height * frame.dpr);
      if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
      renderer.render(scene, camera);
      return true;
    },
    dispose() {
      scene.traverse((o) => {
        const mesh = o as Mesh;
        mesh.geometry?.dispose?.();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          (m as MeshBasicMaterial).map?.dispose?.();
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
