// The three.js half of the 3-D arcade games (see scene3d.ts, which loads this on demand).
//
// A game's view says what things are and where, in the field's own units; a world here decides what
// each looks like, as screen.ts does for the flat drawing. There is one world per game that has a
// scene: Tower of Ryan's is a model of a valley on a table, with the road through it, the gate at
// the bottom and the cave the creeps come out of at the top; Shitstorm's is the storm itself, seen
// from over the tail of your plunger-nosed plane.
//
// Scene units are field units / 1000, with x to the right, up as height and z down the screen (the
// field's y). The camera is tipped back from straight overhead and set so that the whole field is
// in the picture; `pick` and `project` turn a spot of the canvas into a spot of the field and back,
// which is all the table needs to know about it.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  OctahedronGeometry,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ArcadeBuild, ArcadeEvent, ArcadeGameId, ArcadeThing, ArcadeView } from "@journey-to-code/games";
import type { Arcade3d, ArcadeFrame3d } from "./scene3d";
import { bulwarkLook, loadBulwarkLook, lookMotion } from "./bulwark-look";
import { paintRoad } from "./road";
import { toneOf } from "./screen";

const K = 0.001;
const UP = new Vector3(0, 1, 0);
const SEAT_TONES = ["blue", "red", "green", "gold"];
const seatColour = (seat: number | undefined) => toneOf(SEAT_TONES[(seat ?? 0) % SEAT_TONES.length]);

// ---- Making things ---------------------------------------------------------------------------------
const paints = new Map<string, MeshStandardMaterial>();
/** A plain painted surface, shared by everything of that colour. */
function paint(color: string, rough = 0.8, metal = 0, glow = 0): MeshStandardMaterial {
  const key = `${color}/${rough}/${metal}/${glow}`;
  let m = paints.get(key);
  if (!m) paints.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: glow ? color : "#000000", emissiveIntensity: glow })));
  return m;
}
const lights = new Map<string, MeshBasicMaterial>();
/** Something that glows by itself. */
function lit(color: string): MeshBasicMaterial {
  let m = lights.get(color);
  if (!m) lights.set(color, (m = new MeshBasicMaterial({ color })));
  return m;
}
function put<T extends Object3D>(parent: Object3D, o: T, x = 0, y = 0, z = 0): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
const solid = (g: BufferGeometry, m: Material, shadow = true) => {
  const o = new Mesh(g, m);
  o.castShadow = shadow;
  o.receiveShadow = shadow;
  return o;
};
const box = (w: number, h: number, d: number, m: Material) => solid(new BoxGeometry(w, h, d), m);
const drum = (top: number, bottom: number, h: number, m: Material, sides = 16) => solid(new CylinderGeometry(top, bottom, h, sides), m);
const ball = (r: number, m: Material, sx = 1, sy = 1, sz = 1) => {
  const o = solid(new SphereGeometry(r, 16, 12), m);
  o.scale.set(sx, sy, sz);
  return o;
};
const spike = (r: number, h: number, m: Material, sides = 12) => solid(new ConeGeometry(r, h, sides), m);
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, n: () => number) => void, seed = 11): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { colorSpace: "srgb" })!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  draw(g, rng(seed));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** Free what a group holds on the graphics card, and take it out of the scene. */
function scrap(o: Object3D) {
  o.traverse((x) => {
    const m = x as Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  o.removeFromParent();
}

// ---- What flies apart: sparks, rings, beams, and the fire of a blast --------------------------------
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; colour: Color; fall: number }
interface Ring { mesh: Mesh; r: number; grow: number; life: number; max: number }
interface Beam { mesh: Mesh; from: Vector3; to: Vector3; life: number; max: number; kind: "line" | "bolt" | "lob"; wide: number }
interface Puff { sprite: Sprite; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; kind: "fire" | "smoke" | "flash" }

function effects(scene: Scene) {
  const MAX = 700;
  const sparkMesh = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), MAX);
  sparkMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  sparkMesh.frustumCulled = false;
  sparkMesh.count = 0;
  scene.add(sparkMesh);
  let sparks: Spark[] = [];
  let rings: Ring[] = [];
  let beams: Beam[] = [];
  const ringShape = new RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
  const rod = new CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2);
  const shell = new SphereGeometry(0.07, 10, 8);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const size = new Vector3();
  const here = new Vector3();
  const tint = new Map<string, Color>();
  const colourOf = (c: string) => tint.get(c) ?? (tint.set(c, new Color(c)), tint.get(c)!);
  const soft = canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, "#ffffffcc");
    grad.addColorStop(1, "#ffffff00");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
  let puffs: Puff[] = [];
  const spare: Sprite[] = [];
  /** A soft blob: fire and a flash add their light, smoke sits over the picture. Sprites are kept and used again. */
  function puff(x: number, y: number, z: number, kind: Puff["kind"], colour: string, size0: number, life: number, vx: number, vy: number, vz: number, grow: number) {
    if (puffs.length > 480) return;
    const sprite = spare.pop() ?? new Sprite(new SpriteMaterial({ map: soft, transparent: true, depthWrite: false, toneMapped: false }));
    const material = sprite.material as SpriteMaterial;
    material.color.set(colour);
    material.opacity = 0.85;
    material.blending = kind === "smoke" ? NormalBlending : AdditiveBlending;
    material.depthWrite = false;
    material.toneMapped = false;
    sprite.position.set(x, y, z);
    sprite.scale.set(size0, size0, 1);
    sprite.renderOrder = 5;
    sprite.visible = true;
    scene.add(sprite);
    puffs.push({ sprite, vx, vy, vz, life, max: life, size: size0, grow, kind });
  }
  const dropPuff = (p: Puff) => {
    p.sprite.removeFromParent();
    spare.push(p.sprite);
  };

  return {
    /** A burst of bits from a spot: `speed` is scene units a tick, `fall` how hard they are pulled down. */
    burst(x: number, y: number, z: number, n: number, colour: string, speed: number, life: number, size0 = 0.05, fall = 0.004) {
      for (let i = 0; i < n && sparks.length < MAX; i++) {
        const a = Math.random() * Math.PI * 2;
        const up = Math.random();
        const v = speed * (0.35 + Math.random() * 0.65);
        sparks.push({ x, y, z, vx: Math.cos(a) * v, vy: up * v * 1.1, vz: Math.sin(a) * v, life, max: life, size: size0 * (0.6 + Math.random() * 0.8), colour: colourOf(colour), fall });
      }
    },
    ring(x: number, y: number, z: number, r: number, grow: number, life: number, colour: string) {
      if (rings.length > 50) return;
      const mesh = new Mesh(ringShape, new MeshBasicMaterial({ color: colour, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
      mesh.position.set(x, y, z);
      scene.add(mesh);
      rings.push({ mesh, r, grow, life, max: life });
    },
    beam(from: Vector3, to: Vector3, colour: string, kind: Beam["kind"], life: number, wide = 0.02) {
      if (beams.length > 80) return;
      const mesh = kind === "lob" ? new Mesh(shell, lit("#2a2622")) : new Mesh(rod, new MeshBasicMaterial({ color: colour, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      scene.add(mesh);
      beams.push({ mesh, from: from.clone(), to: to.clone(), life, max: life, kind, wide });
    },
    /**
     * A blast in the manner of Over the Hill: a flash, fire that burns from white down to red,
     * a column going up, smoke that hangs, earth and sparks thrown out, and two rings of air.
     * `power` is how large, `smoke` how many puffs are left behind.
     */
    blast(x: number, y: number, z: number, power: number, smoke: number) {
      const motion = lookMotion();
      if (motion === 0) {
        puff(x, y + 0.06, z, "flash", "#fff6e0", 0.28, 5, 0, 0, 0, 0);
        return;
      }
      const scale = power * motion;
      const fires = Math.round(8 + 7 * scale);
      puff(x, y + 0.06, z, "flash", "#fff6e0", 0.42 * scale, 6, 0, 0.01, 0, 0.03);
      for (let i = 0; i < fires; i++) {
        const a = Math.random() * Math.PI * 2;
        const far = Math.random() * 0.16 * scale;
        const fast = (0.01 + Math.random() * 0.018) * scale;
        puff(x + Math.cos(a) * far, y + Math.random() * 0.04, z + Math.sin(a) * far, "fire", "#fff3c4", (0.1 + Math.random() * 0.14) * scale, 16 + Math.random() * 14, Math.cos(a) * fast, (0.01 + Math.random() * 0.018) * scale, Math.sin(a) * fast, 0.003);
      }
      const column = Math.round(3 + 2 * scale);
      for (let i = 0; i < column; i++) puff(x + (Math.random() - 0.5) * 0.08 * scale, y, z + (Math.random() - 0.5) * 0.08 * scale, "fire", "#ffd27a", 0.12 * scale, 20 + Math.random() * 12, (Math.random() - 0.5) * 0.005, 0.018 + Math.random() * 0.016, (Math.random() - 0.5) * 0.005, 0.002);
      const hanging = Math.round(smoke * motion);
      for (let i = 0; i < hanging; i++) puff(x + (Math.random() - 0.5) * 0.22 * scale, y + 0.04, z + (Math.random() - 0.5) * 0.22 * scale, "smoke", Math.random() < 0.5 ? "#4a4540" : "#6b645c", (0.14 + Math.random() * 0.1) * scale, 48 + Math.random() * 36, (Math.random() - 0.5) * 0.004, 0.004 + Math.random() * 0.005, (Math.random() - 0.5) * 0.004, 0.005);
      this.burst(x, y, z, Math.round(8 * scale), "#ffd27a", 0.035 * scale, 20, 0.028, 0.003);
      this.burst(x, y, z, Math.round(6 * scale), "#5b4a33", 0.028 * scale, 26, 0.04, 0.006);
      this.ring(x, 0.04, z, 0.08 * scale, 0.04 * scale, 14, "#fff1c9");
      this.ring(x, 0.03, z, 0.05 * scale, 0.065 * scale, 16, "#ffb347");
    },
    /** A tick: everything moves on, and what is spent goes. */
    settle() {
      sparks = sparks.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.vx *= 0.94;
        p.vz *= 0.94;
        p.vy = p.vy * 0.94 - p.fall;
        if (p.y < 0.02 && p.fall > 0) {
          p.y = 0.02;
          p.vy = 0;
        }
        return --p.life > 0;
      });
      rings = rings.filter((r) => {
        r.r += r.grow;
        if (--r.life > 0) return true;
        (r.mesh.material as Material).dispose();
        r.mesh.removeFromParent();
        return false;
      });
      beams = beams.filter((b) => {
        if (--b.life > 0) return true;
        if (b.kind !== "lob") (b.mesh.material as Material).dispose();
        b.mesh.removeFromParent();
        return false;
      });
      puffs = puffs.filter((p) => {
        p.sprite.position.x += p.vx;
        p.sprite.position.y += p.vy;
        p.sprite.position.z += p.vz;
        p.vx *= 0.94;
        p.vz *= 0.94;
        p.vy *= p.kind === "smoke" ? 0.985 : 0.96;
        p.size += p.grow;
        if (--p.life > 0) return true;
        dropPuff(p);
        return false;
      });
    },
    /** Put everything where it is for this frame. */
    show() {
      sparkMesh.count = sparks.length;
      sparks.forEach((p, i) => {
        const s = p.size * Math.min(1, (p.life / p.max) * 1.6);
        m4.compose(here.set(p.x, p.y, p.z), q.identity(), size.set(s, s, s));
        sparkMesh.setMatrixAt(i, m4);
        sparkMesh.setColorAt(i, p.colour);
      });
      sparkMesh.instanceMatrix.needsUpdate = true;
      if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
      for (const r of rings) {
        r.mesh.scale.set(r.r, 1, r.r);
        (r.mesh.material as MeshBasicMaterial).opacity = (r.life / r.max) * 0.9;
      }
      for (const b of beams) {
        const left = b.life / b.max;
        if (b.kind === "lob") {
          // The shell on its way: a ball along an arc.
          const p = 1 - left;
          b.mesh.position.lerpVectors(b.from, b.to, p);
          b.mesh.position.y += Math.sin(p * Math.PI) * 0.9;
          continue;
        }
        const far = b.from.distanceTo(b.to);
        b.mesh.position.lerpVectors(b.from, b.to, 0.5);
        // Lightning shivers.
        if (b.kind === "bolt") b.mesh.position.add(here.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08));
        b.mesh.lookAt(b.to);
        const w = b.wide * (b.kind === "bolt" ? 0.7 + Math.random() * 0.9 : 0.4 + left * 0.6);
        b.mesh.scale.set(w, w, far);
        (b.mesh.material as MeshBasicMaterial).opacity = left;
      }
      for (const p of puffs) {
        const mat = p.sprite.material as SpriteMaterial;
        const left = p.life / p.max;
        const age = 1 - left;
        if (p.kind === "fire") {
          mat.color.set(age < 0.15 ? "#fff6dc" : age < 0.4 ? "#ffb347" : age < 0.65 ? "#ff6a1a" : "#c43212");
          mat.opacity = age < 0.5 ? 0.8 : Math.max(0, 0.8 * (1 - (age - 0.5) / 0.28));
        } else if (p.kind === "smoke") mat.opacity = 0.5 * Math.pow(left, 1.4);
        else mat.opacity = left * 0.9;
        p.sprite.scale.set(p.size, p.size, 1);
      }
    },
    clear() {
      sparks = [];
      for (const r of rings) {
        (r.mesh.material as Material).dispose();
        r.mesh.removeFromParent();
      }
      for (const b of beams) {
        if (b.kind !== "lob") (b.mesh.material as Material).dispose();
        b.mesh.removeFromParent();
      }
      for (const p of puffs) dropPuff(p);
      rings = [];
      beams = [];
      puffs = [];
      sparkMesh.count = 0;
    },
    /** Give the sprites back to the graphics card. The scene is going away. */
    release() {
      this.clear();
      for (const sprite of spare) (sprite.material as Material).dispose();
      spare.length = 0;
      soft.dispose();
      sparkMesh.geometry.dispose();
      (sparkMesh.material as Material).dispose();
    },
  };
}
type Effects = ReturnType<typeof effects>;

/** A game's own look: what it builds once, and what it does with each frame's things and events. */
interface World {
  /** How far the camera is tipped back from straight overhead, in radians, and room to leave over the far edge. */
  tilt: number;
  headroom: number;
  show(frame: ArcadeFrame3d): void;
  hear(events: readonly ArcadeEvent[]): void;
  reset(): void;
  /** How hard the picture is shaking just now, in scene units. */
  shake(): number;
}

// ====================================================================================================
// Tower of Ryan
// ====================================================================================================
const TOWER_TOP: Record<string, number> = { dart: 0.5, mortar: 0.36, frost: 0.56, tesla: 0.62, sniper: 0.78 };

function towerModel(kind: string, colour: string, level: number, seat: number | undefined) {
  const g = new Group();
  const head = new Group();
  const stone = paint("#9a9ca6", 0.9);
  const darkStone = paint("#6f727c", 0.9);
  const wood = paint("#9b6b3c", 0.8);
  const iron = paint("#2c3038", 0.45, 0.6);
  const tone = paint(colour, 0.5, 0.1);
  const gold = paint("#f2c14e", 0.35, 0.6);
  // The footing every tower stands on, with a band of gold for each level it has been raised.
  put(g, drum(0.2, 0.22, 0.1, darkStone, 8), 0, 0.05, 0);
  for (let i = 0; i < level; i++) put(g, drum(0.205 - i * 0.012, 0.205 - i * 0.012, 0.022, gold, 20), 0, 0.115 + i * 0.03, 0);
  // Whose it is: a pennant in the builder's colour.
  put(g, drum(0.008, 0.008, 0.3, iron, 5), -0.17, 0.25, -0.17);
  put(g, box(0.1, 0.06, 0.008, paint(seatColour(seat), 0.7)), -0.12, 0.36, -0.17);
  const grow = 1 + (level - 1) * 0.14;
  if (kind === "mortar") {
    put(g, drum(0.17, 0.19, 0.14, stone, 12), 0, 0.17, 0);
    head.position.y = 0.26;
    const pot = put(head, drum(0.1, 0.12, 0.22, iron, 14), 0.03, 0.04, 0);
    pot.rotation.z = -0.75;
    const band = put(head, drum(0.125, 0.125, 0.04, tone, 14), 0.03, 0.04, 0);
    band.rotation.z = -0.75;
    put(head, drum(0.11, 0.11, 0.05, wood, 12), 0, -0.04, 0);
  } else if (kind === "frost") {
    put(g, drum(0.11, 0.16, 0.2, stone, 6), 0, 0.2, 0);
    put(g, drum(0.14, 0.11, 0.03, paint("#dff6ff", 0.3), 6), 0, 0.31, 0);
    head.position.y = 0.5;
    const ice = new MeshStandardMaterial({ color: "#bff3ff", emissive: colour, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
    const crystal = solid(new OctahedronGeometry(0.11, 0), ice);
    crystal.scale.y = 1.7;
    crystal.name = "spin";
    head.add(crystal);
    for (let i = 1; i < level; i++) {
      const shard = solid(new OctahedronGeometry(0.04, 0), ice);
      shard.scale.y = 1.6;
      shard.position.set(Math.cos(i * 2.6) * 0.17, -0.06, Math.sin(i * 2.6) * 0.17);
      crystal.add(shard);
    }
  } else if (kind === "tesla") {
    put(g, drum(0.1, 0.15, 0.1, iron, 10), 0, 0.15, 0);
    put(g, drum(0.03, 0.04, 0.42, iron, 8), 0, 0.38, 0);
    const copper = paint("#c9793a", 0.3, 0.8);
    [0.13, 0.1, 0.075].forEach((r, i) => {
      const coil = solid(new TorusGeometry(r, 0.018, 8, 20), copper);
      coil.rotation.x = Math.PI / 2;
      put(g, coil, 0, 0.27 + i * 0.11, 0);
    });
    head.position.y = 0.62;
    const orb = solid(new SphereGeometry(0.07, 14, 10), new MeshStandardMaterial({ color: "#ffffff", emissive: colour, emissiveIntensity: 1.6, roughness: 0.2 }), false);
    orb.name = "pulse";
    head.add(orb);
  } else if (kind === "sniper") {
    put(g, drum(0.085, 0.12, 0.52, stone, 10), 0, 0.36, 0);
    put(g, drum(0.14, 0.1, 0.05, darkStone, 10), 0, 0.64, 0);
    head.position.y = 0.72;
    put(head, box(0.14, 0.08, 0.1, tone), 0, 0.02, 0);
    const barrel = put(head, drum(0.014, 0.018, 0.5, iron, 8), 0.26, 0.03, 0);
    barrel.rotation.z = Math.PI / 2;
    put(head, box(0.1, 0.03, 0.03, gold), 0.05, 0.085, 0);
  } else {
    // A dart tower, and anything this scene hasn't been taught yet.
    put(g, drum(0.13, 0.15, 0.24, wood, 10), 0, 0.22, 0);
    put(g, drum(0.17, 0.14, 0.05, stone, 10), 0, 0.365, 0);
    for (let i = 0; i < 6; i++) put(g, box(0.05, 0.05, 0.05, stone), Math.cos((i * Math.PI) / 3) * 0.14, 0.415, Math.sin((i * Math.PI) / 3) * 0.14);
    head.position.y = 0.46;
    put(head, box(0.14, 0.08, 0.12, tone), 0, 0, 0);
    const barrel = put(head, drum(0.022, 0.028, 0.26, iron, 8), 0.14, 0.01, 0);
    barrel.rotation.z = Math.PI / 2;
    // A crossbow's arms.
    put(head, box(0.02, 0.02, 0.3, wood), 0.1, 0.02, 0);
  }
  head.scale.setScalar(grow);
  g.add(head);
  // A little over life size, so that it fills its square.
  g.scale.setScalar(1.22);
  return { group: g, head };
}

interface Creep { group: Group; body: Object3D; wings: Object3D[]; skin: MeshStandardMaterial; kind: string; last: [number, number]; turn: number; slowed: boolean }

function creepModel(kind: string, colour: string, r: number): Creep {
  const g = new Group();
  const body = new Group();
  g.add(body);
  const skin = new MeshStandardMaterial({ color: colour, roughness: 0.65 });
  const dark = paint("#1b1e26", 0.8);
  const white = lit("#ffffff");
  const wings: Object3D[] = [];
  // Every creep is modelled facing +x and about a unit wide, then scaled to its own size.
  const eyes = (x: number, y: number, apart: number, size: number) => {
    for (const side of [-1, 1]) {
      put(body, ball(size, white), x, y, side * apart);
      put(body, ball(size * 0.55, dark), x + size * 0.6, y, side * apart);
    }
  };
  if (kind === "flyer") {
    body.position.y = 3.6;
    put(body, ball(0.75, skin, 1.5, 0.7, 0.8), 0, 0, 0);
    put(body, spike(0.25, 0.7, paint("#f2c14e", 0.5)), 1.3, 0, 0).rotation.z = -Math.PI / 2;
    eyes(0.8, 0.25, 0.3, 0.16);
    for (const side of [-1, 1]) {
      const wing = new Group();
      put(wing, box(0.8, 0.06, 1.5, skin), 0, 0, side * 0.75);
      put(body, wing, -0.1, 0.2, side * 0.45);
      wing.userData.side = side;
      wings.push(wing);
    }
    // What it leaves on the ground.
    const shade = new Mesh(new CircleGeometry(0.9, 16).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28, depthWrite: false }));
    put(g, shade, 0, 0.06, 0);
  } else if (kind === "brute") {
    put(body, solid(new DodecahedronGeometry(0.95, 0), skin), 0, 1.0, 0);
    put(body, ball(0.42, paint("#d9c7a8", 0.7)), 0.25, 2.05, 0);
    eyes(0.55, 2.1, 0.17, 0.09);
    for (const side of [-1, 1]) {
      put(body, ball(0.45, paint("#4a4e5a", 0.5, 0.5)), 0, 1.5, side * 0.95);
      put(body, ball(0.36, skin), 0.35, 0.75, side * 1.05);
    }
    put(body, box(0.5, 0.2, 1.3, paint("#4a4e5a", 0.5, 0.5)), 0.55, 1.05, 0);
  } else if (kind === "boss") {
    put(body, ball(1, skin, 1, 1.05, 1), 0, 1.05, 0);
    eyes(0.82, 1.35, 0.36, 0.18);
    for (const side of [-1, 1]) put(body, spike(0.2, 0.7, paint("#f4ead2", 0.5)), 0.3, 2.0, side * 0.55).rotation.x = side * 0.5;
    const crown = solid(new TorusGeometry(0.42, 0.09, 8, 16), paint("#f2c14e", 0.3, 0.7));
    crown.rotation.x = Math.PI / 2;
    put(body, crown, 0, 2.12, 0);
    for (let i = 0; i < 5; i++) put(body, spike(0.09, 0.3, paint("#f2c14e", 0.3, 0.7), 6), Math.cos((i * Math.PI * 2) / 5) * 0.42, 2.3, Math.sin((i * Math.PI * 2) / 5) * 0.42);
    put(body, box(0.3, 0.12, 0.9, dark), 0.85, 0.7, 0);
  } else if (kind === "runner") {
    const lean = put(body, spike(0.6, 1.7, skin, 10), 0, 0.95, 0);
    lean.rotation.z = -1.1;
    put(body, ball(0.42, paint("#f0d9b5", 0.7)), 0.75, 1.35, 0);
    eyes(1.0, 1.42, 0.17, 0.09);
    for (const side of [-1, 1]) wings.push(put(body, ball(0.2, dark), -0.1, 0.2, side * 0.3));
  } else if (kind === "swarm") {
    put(body, ball(0.95, skin), 0, 1.0, 0);
    eyes(0.72, 1.25, 0.32, 0.2);
  } else {
    // A grunt: a round body, a head, and a helmet.
    put(body, ball(0.8, skin, 1, 1.1, 1), 0, 0.95, 0);
    put(body, ball(0.5, paint("#f0d9b5", 0.7)), 0.15, 2.0, 0);
    eyes(0.5, 2.05, 0.2, 0.1);
    put(body, solid(new SphereGeometry(0.54, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint("#6f727c", 0.4, 0.6)), 0.15, 2.08, 0);
    for (const side of [-1, 1]) wings.push(put(body, ball(0.26, dark), 0.05, 0.22, side * 0.4));
  }
  g.scale.setScalar(r);
  return { group: g, body, wings, skin, kind, last: [NaN, NaN], turn: Math.PI / 2, slowed: false };
}

function tree(n: () => number): Group {
  const g = new Group();
  const h = 0.5 + n() * 0.5;
  const leaf = paint(["#2f7a3a", "#3a8a42", "#2a6b35", "#4a9648"][Math.floor(n() * 4)]!, 0.95);
  put(g, drum(0.04, 0.06, h * 0.5, paint("#6a4a2c", 0.9), 6), 0, h * 0.25, 0);
  if (n() < 0.55) {
    for (let i = 0; i < 3; i++) put(g, spike(0.26 - i * 0.06, 0.36, leaf, 7), 0, h * 0.5 + i * 0.2, 0);
  } else {
    put(g, ball(0.26, leaf, 1, 0.9, 1), 0, h * 0.72, 0);
    put(g, ball(0.18, leaf), 0.14, h * 0.9, 0.05);
  }
  g.rotation.y = n() * 6;
  return g;
}

function bulwarkWorld(scene: Scene, fx: Effects, FW: number, FH: number): World {
  void loadBulwarkLook();
  scene.background = new Color("#22382b");
  scene.add(new HemisphereLight(0xdcefff, 0x41553a, 1.25));
  const sun = new DirectionalLight(0xfff0d2, 2.4);
  sun.position.set(FW / 2 - 4, 9, FH / 2 - 2.5);
  sun.target.position.set(FW / 2, 0, FH / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const cam = sun.shadow.camera;
  const reach = Math.hypot(FW, FH) * 0.6;
  cam.left = cam.bottom = -reach;
  cam.right = cam.top = reach;
  cam.near = 1;
  cam.far = 30;
  scene.add(sun, sun.target);

  const land = new Group();
  scene.add(land);
  let landKey = "";
  const towers = new Map<number, { group: Group; head: Group; level: number; kind: string }>();
  const creeps = new Map<number, Creep>();
  const live = new Group();
  scene.add(live);
  let shaking = 0;

  // Where the player is pointing: a frame round the square, and the reach of what stands or would stand there.
  const frameBars = new Group();
  const barMaterial = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false });
  const reachRing = new Mesh(new RingGeometry(0.975, 1, 72).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false }));
  const reachFill = new Mesh(new CircleGeometry(1, 72).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.09, depthWrite: false }));
  reachRing.renderOrder = reachFill.renderOrder = 3;
  scene.add(frameBars, reachRing, reachFill);

  function buildLand(build: ArcadeBuild) {
    scrap(land);
    scene.add(land);
    land.clear();
    const cell = build.cell * K;
    const closed = new Set(build.closed);
    const n = rng(4242);
    // The board: turf, the squares that can be built on, and the road, painted once.
    const px = 128;
    const map = canvasTexture(build.cols * px, build.rows * px, (g, noise) => {
      const s = px / build.cell;
      g.fillStyle = "#3f7d3c";
      g.fillRect(0, 0, build.cols * px, build.rows * px);
      for (let i = 0; i < 9000; i++) {
        g.globalAlpha = 0.2 + noise() * 0.25;
        g.fillStyle = noise() < 0.5 ? "#356f35" : "#4f9146";
        g.fillRect(noise() * build.cols * px, noise() * build.rows * px, 2, 3 + noise() * 4);
      }
      g.globalAlpha = 1;
      for (let row = 0; row < build.rows; row++)
        for (let col = 0; col < build.cols; col++) {
          if (closed.has(row * build.cols + col)) continue;
          g.fillStyle = (row + col) % 2 ? "rgba(255,255,255,0.075)" : "rgba(0,0,0,0.06)";
          g.beginPath();
          g.roundRect(col * px + 5, row * px + 5, px - 10, px - 10, 14);
          g.fill();
          g.strokeStyle = "rgba(20,50,24,0.35)";
          g.lineWidth = 2;
          g.stroke();
        }
      paintRoad(
        g,
        build.road.map(([x, y]) => [x * s, y * s]),
        px,
        bulwarkLook().roadBend,
        { shoulder: "#4d3c27", dirt: "#b99a6b", crown: "#c9ac7c", rut: "rgba(77,60,39,0.45)", stone: "#6e5a40", grass: "#2f6a33" },
      );
    });
    const board = new Mesh(new PlaneGeometry(FW, FH).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map, roughness: 1 }));
    board.receiveShadow = true;
    put(land, board, FW / 2, 0, FH / 2);
    // The table it stands on: darker turf running off under the edge of the picture.
    const grass = canvasTexture(128, 128, (g, noise) => {
      g.fillStyle = "#2f6a33";
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = 0.3;
        g.fillStyle = noise() < 0.5 ? "#28592c" : "#3b7c3c";
        g.fillRect(noise() * 128, noise() * 128, 2, 4);
      }
    });
    grass.wrapS = grass.wrapT = RepeatWrapping;
    grass.repeat.set(30, 30);
    const outer = new Mesh(new PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: grass, roughness: 1 }));
    outer.receiveShadow = true;
    put(land, outer, FW / 2, -0.012, FH / 2);

    // Woods and rocks down both sides, clear of the board.
    for (let i = 0; i < 70; i++) {
      const side = i % 2 ? -1 : 1;
      const x = side < 0 ? -0.35 - n() * 3.2 : FW + 0.35 + n() * 3.2;
      const z = -1.5 + n() * (FH + 2.5);
      if (n() < 0.82) put(land, tree(n), x, 0, z).scale.setScalar(0.9 + n() * 0.9);
      else {
        const rock = solid(new DodecahedronGeometry(0.16 + n() * 0.16, 0), paint("#8c8f96", 0.95));
        rock.scale.y = 0.6;
        rock.rotation.y = n() * 6;
        put(land, rock, x, 0.06, z);
      }
    }

    // The top of the road: a cave in a crag, where they come from.
    const [sx, sy] = build.road[0]!;
    const crag = paint("#70747e", 0.95);
    const mouth = new Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      const rock = solid(new DodecahedronGeometry(0.2 + n() * 0.08, 0), crag);
      put(mouth, rock, Math.cos(a) * 0.5, Math.sin(a) * 0.55, (n() - 0.5) * 0.1);
    }
    for (let i = 0; i < 14; i++) {
      const rock = solid(new DodecahedronGeometry(0.3 + n() * 0.35, 0), paint(n() < 0.5 ? "#666a74" : "#7c8089", 0.95));
      put(mouth, rock, (n() - 0.5) * 3.2, n() * 0.5, -0.55 - n() * 0.8);
    }
    put(mouth, new Mesh(new CircleGeometry(0.46, 20, 0, Math.PI), lit("#120a1c")), 0, 0, 0.02);
    const glowMouth = new Mesh(new CircleGeometry(0.34, 20, 0, Math.PI), new MeshBasicMaterial({ color: "#8a4dff", transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
    glowMouth.name = "cave-glow";
    put(mouth, glowMouth, 0, 0, 0.04);
    put(land, mouth, sx * K, 0, Math.min(sy * K, 0) - 0.42);

    // The bottom of the road: the wall of Ryan's tower, and the gate nobody is to get through.
    const [ex] = build.road[build.road.length - 1]!;
    const wallStone = paint("#a7a294", 0.9);
    const wallDark = paint("#857f71", 0.9);
    const zWall = FH + 0.28;
    const gate = ex * K;
    const wallHigh = 0.34;
    for (const [from, to] of [[-0.6, gate - cell * 0.62], [gate + cell * 0.62, FW + 0.6]] as const) {
      if (to - from < 0.05) continue;
      put(land, box(to - from, wallHigh, 0.24, wallStone), (from + to) / 2, wallHigh / 2, zWall);
      for (let x = from + 0.08; x < to - 0.04; x += 0.2) put(land, box(0.1, 0.08, 0.24, wallDark), x, wallHigh + 0.04, zWall);
    }
    for (const side of [-1, 1]) {
      const x = gate + side * cell * 0.74;
      put(land, drum(0.17, 0.19, 0.62, wallStone, 10), x, 0.31, zWall);
      put(land, drum(0.21, 0.17, 0.07, wallDark, 10), x, 0.65, zWall);
      put(land, spike(0.2, 0.26, paint("#b5432f", 0.7), 10), x, 0.81, zWall);
    }
    // The gate's arch and its portcullis.
    put(land, box(cell * 1.2, 0.12, 0.26, wallDark), gate, 0.46, zWall);
    for (let i = -2; i <= 2; i++) put(land, drum(0.012, 0.012, 0.4, paint("#2c3038", 0.4, 0.7), 5), gate + i * cell * 0.2, 0.2, zWall);
    // Ryan's colours over the gate.
    const banner = canvasTexture(256, 96, (g) => {
      g.fillStyle = "#8f2a22";
      g.fillRect(0, 0, 256, 96);
      g.strokeStyle = "#f2c14e";
      g.lineWidth = 8;
      g.strokeRect(6, 6, 244, 84);
      g.fillStyle = "#f8e7b6";
      g.font = "900 54px Georgia, 'Times New Roman', serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("RYAN", 128, 50);
    });
    const flag = new Mesh(new PlaneGeometry(0.52, 0.2), new MeshBasicMaterial({ map: banner, side: DoubleSide }));
    flag.rotation.x = -0.6;
    put(land, flag, gate, 0.62, zWall + 0.02);
  }

  /** How far a shot from a tower starts above the ground, by what stands at the spot. */
  function muzzle(x: number, y: number): number {
    for (const t of towers.values()) if (Math.abs(t.group.position.x - x * K) < 0.05 && Math.abs(t.group.position.z - y * K) < 0.05) return ((TOWER_TOP[t.kind] ?? 0.5) + (t.level - 1) * 0.03) * 1.22;
    return 0.5;
  }
  const from = new Vector3();
  const to = new Vector3();

  return {
    tilt: 0.6,
    headroom: 0.9,
    shake: () => shaking,
    reset() {
      for (const t of towers.values()) scrap(t.group);
      for (const c of creeps.values()) scrap(c.group);
      towers.clear();
      creeps.clear();
      shaking = 0;
    },
    hear(events) {
      shaking *= 0.86;
      for (const e of events) {
        const colour = toneOf(e.tone);
        const x = e.x * K;
        const z = e.y * K;
        const tx = (e.to?.[0] ?? e.x) * K;
        const tz = (e.to?.[1] ?? e.y) * K;
        // A full blast when the host has asked for one. Embers keep the old sparks, unless nothing is meant to travel.
        const bang = (bx: number, by: number, bz: number, scale: number) => {
          const look = bulwarkLook();
          if (look.blast === "embers" && lookMotion() > 0) return false;
          const power = (look.blast === "inferno" ? 1.65 : 1) * scale;
          fx.blast(bx, by, bz, power, Math.round(look.smokePuffs * Math.min(1.5, scale)));
          return true;
        };
        switch (e.kind) {
          case "shot":
            fx.beam(from.set(x, muzzle(e.x, e.y), z), to.set(tx, 0.16, tz), colour, "line", 5, 0.02);
            break;
          case "snipe":
            fx.beam(from.set(x, muzzle(e.x, e.y), z), to.set(tx, 0.16, tz), colour, "line", 12, 0.03);
            fx.burst(tx, 0.16, tz, 4, "#ffffff", 0.03, 10, 0.03);
            break;
          case "zap":
            fx.beam(from.set(x, e.to && muzzle(e.x, e.y) > 0.5 ? muzzle(e.x, e.y) : 0.2, z), to.set(tx, 0.18, tz), colour, "bolt", 7, 0.03);
            break;
          case "shell":
            fx.beam(from.set(x, muzzle(e.x, e.y), z), to.set(tx, 0.05, tz), colour, "lob", 9);
            if (!bang(tx, 0.1, tz, 1)) {
              fx.ring(tx, 0.04, tz, 0.06, ((e.amount ?? 500) * K) / 9, 9, "#ffb347");
              fx.burst(tx, 0.08, tz, 10, "#ffb347", 0.05, 16, 0.045);
              fx.burst(tx, 0.08, tz, 5, "#5b4a33", 0.035, 20, 0.05);
            } else shaking = Math.max(shaking, 0.04);
            break;
          case "frost":
            fx.ring(x, 0.05, z, 0.08, ((e.amount ?? 1000) * K) / 14, 14, "#8fe9ff");
            break;
          case "pop":
            if (!bang(x, 0.18, z, 0.62)) fx.burst(x, 0.2, z, 9, colour, 0.04, 18, 0.05);
            break;
          case "boss-down":
            if (!bang(x, 0.4, z, 2.3)) {
              fx.burst(x, 0.4, z, 70, "#ffd166", 0.09, 50, 0.07);
              fx.burst(x, 0.4, z, 40, colour, 0.07, 60, 0.08);
              fx.ring(x, 0.05, z, 0.2, 0.09, 36, "#ffffff");
            }
            shaking = 0.14;
            break;
          case "leak":
            shaking = Math.max(shaking, 0.06);
            if (!bang(x, 0.2, Math.min(z, FH), 0.85)) fx.burst(x, 0.2, Math.min(z, FH), 14, "#ff5a6e", 0.05, 22, 0.05);
            break;
          case "built":
          case "upgraded":
            fx.ring(x, 0.04, z, 0.06, 0.03, 12, colour);
            fx.burst(x, 0.1, z, e.kind === "built" ? 8 : 14, e.kind === "built" ? "#d8cdb0" : "#ffd166", 0.03, 18, 0.04);
            break;
          case "sold":
            fx.burst(x, 0.2, z, 10, "#ffd166", 0.035, 20, 0.04);
            break;
        }
      }
    },
    show({ view, frame, pointer, still }) {
      const build = view.build;
      if (!build) return;
      const key = `${build.cols}x${build.rows}:${bulwarkLook().roadBend}:${build.closed.join(",")}`;
      if (key !== landKey) {
        landKey = key;
        buildLand(build);
      }
      const seenTowers = new Set<number>();
      const seenCreeps = new Set<number>();
      for (const t of view.things) {
        if (t.kind.startsWith("tower:")) {
          seenTowers.add(t.id);
          const kind = t.kind.slice(6);
          let tower = towers.get(t.id);
          if (!tower || tower.level !== (t.level ?? 1) || tower.kind !== kind) {
            if (tower) scrap(tower.group);
            const made = towerModel(kind, toneOf(t.tone), t.level ?? 1, t.seat);
            tower = { ...made, level: t.level ?? 1, kind };
            towers.set(t.id, tower);
            live.add(made.group);
          }
          tower.group.position.set(t.x * K, 0, t.y * K);
          tower.head.rotation.y = -(((t.angle ?? 27000) / 18000) * Math.PI);
          const spin = tower.head.getObjectByName("spin");
          if (spin && !still) spin.rotation.y = frame / 30;
          const pulse = tower.head.getObjectByName("pulse");
          if (pulse) pulse.scale.setScalar(still ? 1 : 1 + Math.sin(frame / 4 + t.id) * 0.14);
        } else if (t.kind.startsWith("creep:")) {
          seenCreeps.add(t.id);
          const kind = t.kind.slice(6);
          let c = creeps.get(t.id);
          if (!c || c.kind !== kind) {
            if (c) scrap(c.group);
            c = creepModel(kind, toneOf(t.tone), (t.r * K) / (kind === "boss" || kind === "swarm" || kind === "brute" ? 1 : 0.9));
            creeps.set(t.id, c);
            live.add(c.group);
          }
          // It faces the way it is going.
          const dx = t.x - c.last[0];
          const dy = t.y - c.last[1];
          if (Number.isFinite(dx) && Math.hypot(dx, dy) > 0.5) {
            const want = Math.atan2(dy, dx);
            let d = want - c.turn;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            c.turn += d * 0.3;
          }
          c.last = [t.x, t.y];
          c.group.position.set(t.x * K, 0, t.y * K);
          c.group.rotation.y = -c.turn;
          const pace = kind === "runner" ? 2.4 : kind === "swarm" ? 3.2 : kind === "brute" || kind === "boss" ? 6 : 4;
          const step = still ? 0 : Math.sin(frame / pace + t.id);
          if (kind === "flyer") {
            c.body.position.y = 3.6 + step * 0.25;
            for (const w of c.wings) w.rotation.x = (w.userData.side as number) * step * 0.6;
          } else {
            c.body.position.y = Math.abs(step) * (kind === "brute" || kind === "boss" ? 0.08 : 0.22);
            c.body.rotation.z = step * 0.06;
            c.wings.forEach((foot, i) => (foot.position.x = (i ? -1 : 1) * step * 0.22));
          }
          const slowed = t.mark === "slowed";
          if (slowed !== c.slowed) {
            c.slowed = slowed;
            c.skin.emissive.set(slowed ? "#3aa9d6" : "#000000");
            c.skin.emissiveIntensity = slowed ? 0.7 : 0;
          }
        }
      }
      for (const [id, t] of towers) if (!seenTowers.has(id)) (scrap(t.group), towers.delete(id));
      for (const [id, c] of creeps)
        if (!seenCreeps.has(id)) {
          scrap(c.group);
          c.skin.dispose();
          creeps.delete(id);
        }
      const glow = land.getObjectByName("cave-glow") as Mesh | undefined;
      if (glow) (glow.material as MeshBasicMaterial).opacity = still ? 0.35 : 0.3 + Math.sin(frame / 14) * 0.12;

      // The square pointed at.
      frameBars.clear();
      const cell = build.cell * K;
      const shown = !!pointer?.cell;
      reachRing.visible = reachFill.visible = shown && !!pointer?.range;
      if (pointer?.cell) {
        const [col, row] = pointer.cell;
        const cx = (col + 0.5) * cell;
        const cz = (row + 0.5) * cell;
        const colour = pointer.open === false ? "#ff5a6e" : toneOf(pointer.tone);
        barMaterial.color.set(colour);
        const side = cell * 0.9;
        for (const [w, d, ox, oz] of [[side, 0.035, 0, -side / 2], [side, 0.035, 0, side / 2], [0.035, side, -side / 2, 0], [0.035, side, side / 2, 0]] as const) {
          const bar = new Mesh(new BoxGeometry(w, 0.02, d), barMaterial);
          bar.position.set(cx + ox, 0.03, cz + oz);
          bar.renderOrder = 4;
          frameBars.add(bar);
        }
        if (pointer.range) {
          const r = pointer.range * K;
          reachRing.position.set(cx, 0.025, cz);
          reachFill.position.set(cx, 0.02, cz);
          reachRing.scale.set(r, 1, r);
          reachFill.scale.set(r, 1, r);
          (reachRing.material as MeshBasicMaterial).color.set(colour);
        }
      }
    },
  };
}

// ====================================================================================================
// Shitstorm
// ====================================================================================================
// What the name means, here: it is raining exactly that. The sky is a storm over a town at night;
// what comes at you is birds, flying outhouses, whirling toilet rolls and a honey wagon, and what
// they throw is what you would expect. You fly a little plane with a plunger for a nose and shoot
// water. Every fifth wave it hits the fan: the boss is the fan.

/** One dropping: three coils and a tip. Radius about 1, sitting on the ground. */
function droppingShape(): BufferGeometry {
  const coil = (r: number, y: number) => new SphereGeometry(r, 10, 7).scale(1, 0.55, 1).translate(0, y, 0);
  const tip = new ConeGeometry(0.22, 0.42, 8).translate(0.06, 1.36, 0);
  return mergeGeometries([coil(1, 0.3), coil(0.72, 0.75), coil(0.44, 1.1), tip])!;
}

interface Foe { group: Group; kind: string; spin: Object3D[]; flap: Object3D[] }

function foeModel(kind: string, colour: string): Foe {
  const g = new Group();
  const spin: Object3D[] = [];
  const flap: Object3D[] = [];
  const tone = paint(colour, 0.5, 0.1, 0.25);
  const white = paint("#f3f1ea", 0.7);
  const dark = paint("#1d2028", 0.7);
  const steel = paint("#9aa3b2", 0.35, 0.7);
  // Everything is modelled about a unit in radius, flying down the screen (+z).
  if (kind === "drone") {
    // A pigeon.
    const feather = paint("#8791a6", 0.8);
    put(g, ball(0.55, feather, 0.8, 0.7, 1.25), 0, 0, 0);
    put(g, ball(0.3, feather), 0, 0.22, 0.62);
    put(g, drum(0.3, 0.3, 0.12, tone, 12), 0, 0.12, 0.42).rotation.x = Math.PI / 2;
    put(g, spike(0.09, 0.26, paint("#f0a030", 0.5), 6), 0, 0.2, 0.95).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      put(g, ball(0.06, lit("#ff4b3a")), side * 0.17, 0.34, 0.8);
      const wing = new Group();
      put(wing, box(0.95, 0.06, 0.6, feather), side * 0.5, 0, 0);
      put(wing, box(0.3, 0.05, 0.45, dark), side * 0.95, 0, 0.04);
      wing.userData.side = side;
      put(g, wing, side * 0.35, 0.1, 0);
      flap.push(wing);
    }
    put(g, box(0.4, 0.05, 0.4, dark), 0, 0, -0.75);
  } else if (kind === "dart") {
    // A gull, coming in fast with its wings back.
    put(g, ball(0.42, white, 0.75, 0.65, 1.7), 0, 0, 0);
    put(g, ball(0.26, white), 0, 0.1, 0.72);
    put(g, spike(0.1, 0.42, paint("#f2c230", 0.5), 6), 0, 0.08, 1.12).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      put(g, ball(0.05, dark), side * 0.14, 0.22, 0.86);
      const wing = new Group();
      const span = put(wing, box(1.25, 0.05, 0.36, white), side * 0.62, 0, -0.2);
      span.rotation.y = side * 0.55;
      const end = put(wing, box(0.42, 0.045, 0.26, tone), side * 1.22, 0, -0.62);
      end.rotation.y = side * 0.55;
      wing.userData.side = side;
      put(g, wing, side * 0.2, 0.06, 0.1);
      flap.push(wing);
    }
  } else if (kind === "gunship") {
    // An outhouse on rotors.
    put(g, box(1.05, 1.0, 1.05, tone), 0, 0, 0);
    put(g, box(1.24, 0.1, 1.24, white), 0, 0.52, 0);
    // A pitched roof in its own colour, which is most of what is seen of it from up here.
    for (const side of [-1, 1]) put(g, box(0.62, 0.08, 1.16, tone), side * 0.27, 0.66, 0).rotation.z = -side * 0.42;
    put(g, box(0.1, 0.06, 1.2, white), 0, 0.79, 0);
    put(g, box(0.62, 0.74, 0.04, paint("#20242c", 0.6)), 0, -0.06, 0.54);
    put(g, drum(0.07, 0.07, 0.34, steel, 8), 0.34, 0.76, -0.3);
    // The moon cut in the door.
    put(g, ball(0.11, lit("#ffe9a6"), 1, 1, 0.3), 0, 0.14, 0.56);
    for (const side of [-1, 1]) {
      put(g, box(0.5, 0.06, 0.1, dark), side * 0.75, 0.2, 0);
      const rotor = new Group();
      put(rotor, box(1.0, 0.02, 0.1, steel));
      put(rotor, box(0.1, 0.02, 1.0, steel));
      put(g, rotor, side * 1.0, 0.3, 0);
      spin.push(rotor);
    }
  } else if (kind === "spinner") {
    // A toilet roll, whirling, with its paper flying.
    const roll = new Group();
    put(roll, drum(0.62, 0.62, 0.62, white, 22));
    put(roll, drum(0.24, 0.24, 0.64, paint("#a98a5c", 0.9), 14));
    put(roll, drum(0.2, 0.2, 0.66, dark, 12));
    put(roll, drum(0.635, 0.635, 0.1, tone, 22), 0, 0.2, 0);
    for (let i = 0; i < 3; i++) {
      const arm = new Group();
      put(arm, box(0.9, 0.02, 0.3, white), 0.95, 0, 0);
      const tail = put(arm, box(0.5, 0.02, 0.3, white), 1.55, 0, 0.16);
      tail.rotation.y = -0.7;
      arm.rotation.y = (i * Math.PI * 2) / 3;
      roll.add(arm);
    }
    g.add(roll);
    spin.push(roll);
  } else if (kind === "carrier") {
    // The honey wagon: a tanker with no business being up here.
    const tank = put(g, drum(0.5, 0.5, 2.0, steel, 18), 0, 0, 0);
    tank.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) put(g, ball(0.5, steel, 0.5, 1, 1), side * 1.0, 0, 0);
    for (const x of [-0.6, 0, 0.6]) put(g, drum(0.515, 0.515, 0.07, tone, 18), x, 0, 0).rotation.z = Math.PI / 2;
    for (const x of [-0.55, 0.55]) put(g, drum(0.2, 0.22, 0.16, paint("#ff9f43", 0.4, 0.2, 0.5), 10), x, 0.52, 0);
    put(g, box(0.7, 0.55, 0.5, paint("#c9a437", 0.5)), 0, -0.05, 0.62);
    put(g, box(0.56, 0.2, 0.06, lit("#9fe3ff")), 0, 0.06, 0.88);
    const hose = solid(new TorusGeometry(0.34, 0.06, 8, 16, Math.PI), paint("#3c7a45", 0.7));
    hose.rotation.y = Math.PI / 2;
    put(g, hose, -1.05, -0.3, 0.2);
    for (const side of [-1, 1]) {
      const rotor = new Group();
      put(rotor, box(1.3, 0.02, 0.12, dark));
      put(rotor, box(0.12, 0.02, 1.3, dark));
      put(g, rotor, side * 0.8, 0.75, -0.2);
      spin.push(rotor);
    }
  } else if (kind === "boss") {
    // The fan. It lies face up to you, in a cage, and everything hits it.
    const housing = solid(new TorusGeometry(1.0, 0.1, 10, 40), steel);
    housing.rotation.x = Math.PI / 2;
    g.add(housing);
    const guard = solid(new TorusGeometry(0.62, 0.025, 6, 30), steel);
    guard.rotation.x = Math.PI / 2;
    put(g, guard, 0, 0.16, 0);
    for (let i = 0; i < 8; i++) {
      const strut = put(g, box(2.0, 0.03, 0.03, steel), 0, 0.16, 0);
      strut.rotation.y = (i * Math.PI) / 8;
    }
    const blades = new Group();
    for (let i = 0; i < 5; i++) {
      const arm = new Group();
      const blade = put(arm, box(0.72, 0.03, 0.36, tone), 0.5, 0, 0);
      blade.rotation.x = 0.5;
      arm.rotation.y = (i * Math.PI * 2) / 5;
      blades.add(arm);
    }
    g.add(blades);
    spin.push(blades);
    put(g, drum(0.2, 0.24, 0.3, paint("#ffd166", 0.3, 0.6, 0.3), 14), 0, 0.06, 0);
    put(g, drum(0.5, 0.42, 0.5, dark, 14), 0, -0.3, 0);
    // What has hit it already.
    const muck = paint("#6b4423", 0.6);
    const n = rng(99);
    for (let i = 0; i < 9; i++) {
      const a = n() * Math.PI * 2;
      put(g, ball(0.07 + n() * 0.06, muck, 1, 0.5, 1), Math.cos(a) * 1.0, 0.1, Math.sin(a) * 1.0);
    }
  } else put(g, solid(new IcosahedronGeometry(0.9, 0), tone));
  return { group: g, kind, spin, flap };
}

function shipModel(colour: string): { group: Group; flame: Mesh; core: Mesh } {
  const g = new Group();
  const hull = paint(colour, 0.35, 0.3, 0.15);
  const trim = paint("#e9edf5", 0.4, 0.2);
  // Nose up the screen (−z), about a unit from middle to wingtip.
  const body = put(g, drum(0.2, 0.26, 1.3, hull, 12), 0, 0, 0);
  body.rotation.x = Math.PI / 2;
  put(g, ball(0.19, new MeshStandardMaterial({ color: "#bfe9ff", roughness: 0.1, metalness: 0.4, emissive: "#3aa9d6", emissiveIntensity: 0.35 }), 1, 0.8, 1.7), 0, 0.17, -0.12);
  put(g, box(2.0, 0.07, 0.5, hull), 0, -0.02, 0.2);
  put(g, box(2.0, 0.075, 0.12, trim), 0, -0.02, 0.0);
  put(g, box(0.8, 0.06, 0.3, hull), 0, 0, 0.72);
  put(g, box(0.06, 0.4, 0.34, trim), 0, 0.2, 0.72);
  for (const side of [-1, 1]) put(g, drum(0.07, 0.07, 0.5, trim, 8), side * 0.98, -0.02, 0.2).rotation.x = Math.PI / 2;
  // The plunger: a wooden handle out of the nose and a red rubber cup on the end of it.
  put(g, drum(0.045, 0.045, 0.5, paint("#b98a55", 0.7), 8), 0, 0, -0.88).rotation.x = Math.PI / 2;
  const cup = solid(new SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: "#c8372d", roughness: 0.45, side: DoubleSide }));
  cup.rotation.x = Math.PI / 2;
  put(g, cup, 0, 0, -1.32);
  const flame = new Mesh(new ConeGeometry(0.16, 0.7, 8).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#ffd166", transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }));
  put(g, flame, 0, 0, 1.0);
  // The only part that can be hit.
  const core = new Mesh(new SphereGeometry(1, 12, 10), lit("#ffffff"));
  put(g, core, 0, 0.42, 0);
  return { group: g, flame, core };
}

function dropModel(kind: string, colour: string): Group {
  const g = new Group();
  const halo = new Mesh(new CircleGeometry(0.5, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false }));
  put(g, halo, 0, -0.1, 0);
  const turn = new Group();
  turn.name = "turn";
  if (kind === "medal") {
    // A golden roll.
    const gold = paint("#ffd166", 0.25, 0.8, 0.35);
    put(turn, drum(0.24, 0.24, 0.26, gold, 18)).rotation.x = Math.PI / 2;
    put(turn, drum(0.09, 0.09, 0.27, paint("#7a5a18", 0.6), 12)).rotation.x = Math.PI / 2;
  } else if (kind === "power") {
    // A spare plunger: more pressure.
    put(turn, drum(0.03, 0.03, 0.42, paint("#b98a55", 0.7), 8), 0, 0.12, 0);
    put(turn, solid(new SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: "#e0453a", roughness: 0.4, emissive: "#e0453a", emissiveIntensity: 0.3, side: DoubleSide })), 0, -0.2, 0);
  } else {
    // A flush: a drop of clean water.
    const water = new MeshStandardMaterial({ color: "#9fe3ff", emissive: colour, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.2 });
    put(turn, ball(0.2, water), 0, -0.05, 0);
    put(turn, spike(0.16, 0.32, water, 12), 0, 0.2, 0);
  }
  g.add(turn);
  g.scale.setScalar(0.72);
  return g;
}

function skyfireWorld(scene: Scene, fx: Effects, FW: number, FH: number): World {
  scene.background = new Color("#10131d");
  scene.fog = new Fog("#10131d", 13, 30);
  const sky = new HemisphereLight(0xaab8dc, 0x2a2118, 1.35);
  const key = new DirectionalLight(0xfff2dc, 1.9);
  key.position.set(FW / 2 - 3, 10, FH / 2 + 5);
  key.target.position.set(FW / 2, 0, FH / 2);
  scene.add(sky, key, key.target);

  // The town, a long way down: blocks, streets, and a few lit windows, going by underneath.
  const town = canvasTexture(512, 512, (g, n) => {
    g.fillStyle = "#0c1018";
    g.fillRect(0, 0, 512, 512);
    for (let by = 0; by < 8; by++)
      for (let bx = 0; bx < 8; bx++) {
        const x = bx * 64 + 7;
        const y = by * 64 + 7;
        g.fillStyle = ["#2a3350", "#232b44", "#313b5c", "#1f2740"][Math.floor(n() * 4)]!;
        if (n() < 0.12) {
          // A park.
          g.fillStyle = "#1c3a2a";
          g.fillRect(x, y, 50, 50);
          continue;
        }
        const split = n() < 0.5;
        g.fillRect(x, y, split ? 23 : 50, 50);
        if (split) g.fillRect(x + 27, y, 23, 50);
        for (let i = 0; i < 12; i++) {
          g.fillStyle = n() < 0.7 ? "#ffe09a" : "#b5e2ff";
          g.globalAlpha = 0.5 + n() * 0.5;
          g.fillRect(x + 3 + Math.floor(n() * 11) * 4, y + 3 + Math.floor(n() * 11) * 4, 3, 3);
        }
        g.globalAlpha = 1;
      }
    // Street lamps along the streets.
    g.fillStyle = "#ffb65c";
    for (let i = 0; i < 8; i++)
      for (let k = 0; k < 8; k++) {
        g.globalAlpha = 0.5;
        g.fillRect(i * 64 + 1, k * 64 + 30, 2, 2);
        g.fillRect(k * 64 + 30, i * 64 + 1, 2, 2);
      }
    g.globalAlpha = 1;
  }, 5);
  town.wrapS = town.wrapT = RepeatWrapping;
  town.repeat.set(5, 7);
  const ground = new Mesh(new PlaneGeometry(50, 70).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: town }));
  put(scene, ground, FW / 2, -9, FH / 2 - 8);

  // The storm: clouds between you and the town, coming up the screen at you.
  const cloudStuff = new MeshStandardMaterial({ color: "#4d5570", roughness: 1, transparent: true, opacity: 0.5, depthWrite: false, emissive: "#c8d4ff", emissiveIntensity: 0 });
  const n = rng(77);
  const clouds: { group: Group; speed: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const g = new Group();
    const puffs = 4 + Math.floor(n() * 4);
    for (let k = 0; k < puffs; k++) {
      const puff = new Mesh(new SphereGeometry(0.45 + n() * 0.45, 18, 12), cloudStuff);
      puff.scale.y = 0.4;
      puff.position.set((n() - 0.5) * 2.2, (n() - 0.5) * 0.25, (n() - 0.5) * 1.3);
      g.add(puff);
    }
    const deep = n();
    g.position.set(-4 + n() * (FW + 8), -1.4 - deep * 4.5, -8 + n() * (FH + 14));
    g.scale.setScalar(0.8 + deep * 0.9);
    scene.add(g);
    clouds.push({ group: g, speed: 0.05 - deep * 0.028 });
  }
  // Rain, the ordinary kind, slanting through all of it.
  const DROPS = 260;
  const drops = new Float32Array(DROPS * 6);
  const rainAt = Array.from({ length: DROPS }, () => [-3 + n() * (FW + 6), -6 + n() * 9, -4 + n() * (FH + 8)] as [number, number, number]);
  const rain = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: "#9db4dc", transparent: true, opacity: 0.32 }));
  rain.geometry.setAttribute("position", new BufferAttribute(drops, 3).setUsage(DynamicDrawUsage));
  rain.frustumCulled = false;
  scene.add(rain);

  // Bullets, by the hundred: one mesh drawn many times, and a ring of the bullet's own colour
  // under each, which is what the eye follows.
  const MAXB = 760;
  const droppings = new InstancedMesh(droppingShape(), new MeshStandardMaterial({ color: "#7a4d27", roughness: 0.5, emissive: "#3a2210", emissiveIntensity: 0.6 }), MAXB);
  const halos = new InstancedMesh(new RingGeometry(0.55, 1, 20).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }), MAXB);
  const jets = new InstancedMesh(new CylinderGeometry(0.035, 0.05, 0.42, 6).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92 }), 400);
  for (const m of [droppings, halos, jets]) {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
  }
  halos.renderOrder = 2;

  const foes = new Map<number, Foe>();
  const ships = new Map<number, ReturnType<typeof shipModel> & { lastX: number; bank: number }>();
  const pickups = new Map<number, { group: Group; kind: string }>();
  const blasts = new Map<number, Mesh>();
  const live = new Group();
  scene.add(live);
  let shaking = 0;
  let strike = 0;
  let nextStrike = 200;

  const m4 = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const size = new Vector3();
  const colours = new Map<string, Color>();
  const colourOf = (c: string) => colours.get(c) ?? (colours.set(c, new Color(c)), colours.get(c)!);
  const MUCK = "#8a5a2e";

  return {
    tilt: 0.5,
    headroom: 0.3,
    shake: () => shaking,
    reset() {
      for (const f of foes.values()) scrap(f.group);
      for (const s of ships.values()) scrap(s.group);
      for (const p of pickups.values()) scrap(p.group);
      for (const b of blasts.values()) scrap(b);
      foes.clear();
      ships.clear();
      pickups.clear();
      blasts.clear();
      shaking = 0;
    },
    hear(events) {
      shaking *= 0.86;
      for (const e of events) {
        const x = e.x * K;
        const z = e.y * K;
        switch (e.kind) {
          case "boom":
            // Feathers, and the rest.
            fx.burst(x, 0.2, z, 7, "#f3f1ea", 0.07, 22, 0.05, 0.001);
            fx.burst(x, 0.2, z, 5, MUCK, 0.06, 20, 0.06, 0.002);
            fx.ring(x, 0.1, z, 0.08, 0.026, 12, "#ffd9a0");
            break;
          case "big-boom":
            fx.burst(x, 0.2, z, 18, "#ff8a3d", 0.11, 34, 0.07, 0.001);
            fx.burst(x, 0.2, z, 14, MUCK, 0.09, 36, 0.08, 0.002);
            fx.ring(x, 0.1, z, 0.12, 0.046, 18, "#fff0c8");
            shaking = Math.max(shaking, 0.04);
            break;
          case "boss-down":
            fx.burst(x, 0.3, z, 80, "#ffd166", 0.17, 60, 0.08, 0.001);
            fx.burst(x, 0.3, z, 80, MUCK, 0.14, 70, 0.1, 0.002);
            fx.burst(x, 0.3, z, 30, "#9aa3b2", 0.12, 70, 0.09, 0.002);
            fx.ring(x, 0.1, z, 0.2, 0.09, 40, "#ffffff");
            shaking = 0.16;
            break;
          case "down":
            fx.burst(x, 0.2, z, 36, "#9fe3ff", 0.12, 40, 0.07, 0.001);
            fx.ring(x, 0.1, z, 0.1, 0.06, 22, "#9fe3ff");
            shaking = 0.09;
            break;
          case "bomb":
            // The flush.
            fx.ring(x, 0.1, z, 0.2, 0.17, 50, "#9fe3ff");
            fx.ring(x, 0.1, z, 0.1, 0.12, 50, "#ffffff");
            fx.burst(x, 0.2, z, 40, "#9fe3ff", 0.16, 40, 0.06, 0);
            shaking = 0.06;
            break;
          case "fizz":
            fx.burst(x, 0.2, z, 1, "#bfe9ff", 0.02, 12, 0.05, 0);
            break;
          case "hit":
            fx.burst(x, 0.25, z, 2, "#9fe3ff", 0.04, 8, 0.035, 0);
            break;
          case "graze":
            fx.burst(x, 0.3, z, 2, "#ffffff", 0.05, 10, 0.03, 0);
            break;
          case "boss":
            strike = 1;
            break;
        }
      }
    },
    show({ view, frame, still }) {
      // The storm goes by.
      if (!still) {
        town.offset.y = (frame * 0.0012) % 1;
        for (const c of clouds) {
          c.group.position.z += c.speed;
          if (c.group.position.z > FH + 7) c.group.position.z = -9;
        }
        let k = 0;
        for (const d of rainAt) {
          d[1] -= 0.34;
          d[2] += 0.1;
          if (d[1] < -6) {
            d[1] = 3;
            d[2] = -4 + Math.random() * (FH + 8);
          }
          drops[k++] = d[0];
          drops[k++] = d[1];
          drops[k++] = d[2];
          drops[k++] = d[0];
          drops[k++] = d[1] + 0.42;
          drops[k++] = d[2] - 0.12;
        }
        rain.geometry.getAttribute("position").needsUpdate = true;
        // Lightning, now and then: the clouds light up from inside for a moment.
        if (frame > nextStrike) {
          strike = 1;
          nextStrike = frame + 240 + Math.random() * 520;
        }
        strike *= 0.86;
        cloudStuff.emissiveIntensity = strike * (0.6 + Math.random() * 0.4);
        sky.intensity = 1.35 + strike * 1.6;
      }

      let bullets = 0;
      let shots = 0;
      const seen = new Set<number>();
      for (const t of view.things) {
        const x = t.x * K;
        const z = t.y * K;
        if (t.kind === "bullet") {
          if (bullets >= MAXB) continue;
          const r = t.r * K * 1.15;
          q.setFromAxisAngle(UP, t.id * 1.7 + (still ? 0 : frame * 0.05));
          m4.compose(pos.set(x, 0.22, z), q, size.set(r, r, r));
          droppings.setMatrixAt(bullets, m4);
          const h = t.r * K * 2.1;
          m4.compose(pos.set(x, 0.2, z), q.identity(), size.set(h, h, h));
          halos.setMatrixAt(bullets, m4);
          halos.setColorAt(bullets, colourOf(toneOf(t.tone)));
          bullets++;
        } else if (t.kind === "shot") {
          if (shots >= 400) continue;
          m4.compose(pos.set(x, 0.25, z + 0.05), q.identity(), size.set(1.5, 1.5, 1.5));
          jets.setMatrixAt(shots, m4);
          jets.setColorAt(shots, colourOf(shots % 2 ? "#dff6ff" : "#8fdcff"));
          shots++;
        } else if (t.kind === "ship") {
          seen.add(t.id);
          let ship = ships.get(t.id);
          if (!ship) {
            ship = { ...shipModel(toneOf(t.tone)), lastX: t.x, bank: 0 };
            ship.group.scale.setScalar(t.r * K * 1.3);
            ships.set(t.id, ship);
            live.add(ship.group);
          }
          // It banks into a turn.
          ship.bank += (Math.max(-1, Math.min(1, (t.x - ship.lastX) / 70)) - ship.bank) * 0.25;
          ship.lastX = t.x;
          ship.group.position.set(x, 0.3, z);
          ship.group.rotation.z = -ship.bank * 0.6;
          ship.group.visible = !(t.ghost && frame % 6 < 3);
          ship.flame.scale.set(1, 1, 0.7 + (frame % 5) * 0.14);
          const core = ((t.core ?? 40) / t.r) * (1.5 + 0.25 * Math.sin(frame / 5));
          ship.core.scale.setScalar(core);
        } else if (t.kind === "blast") {
          seen.add(t.id);
          let ring = blasts.get(t.id);
          if (!ring) {
            ring = new Mesh(new TorusGeometry(1, 0.035, 8, 64).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: "#bfe9ff", transparent: true, blending: AdditiveBlending, depthWrite: false }));
            blasts.set(t.id, ring);
            live.add(ring);
          }
          ring.position.set(x, 0.25, z);
          ring.scale.set(t.r * K, 3, t.r * K);
          ring.rotation.y = frame * 0.4;
          (ring.material as MeshBasicMaterial).opacity = Math.max(0, 0.9 - t.r / 12000);
        } else if (t.kind.startsWith("drop:")) {
          seen.add(t.id);
          const kind = t.kind.slice(5);
          let drop = pickups.get(t.id);
          if (!drop) {
            drop = { group: dropModel(kind, toneOf(t.tone)), kind };
            pickups.set(t.id, drop);
            live.add(drop.group);
          }
          drop.group.position.set(x, 0.35 + (still ? 0 : Math.sin(frame / 8 + t.id) * 0.04), z);
          const turn = drop.group.getObjectByName("turn");
          if (turn && !still) turn.rotation.y = frame / 12 + t.id;
        } else if (t.kind.startsWith("foe:")) {
          seen.add(t.id);
          const kind = t.kind.slice(4);
          let foe = foes.get(t.id);
          if (!foe || foe.kind !== kind) {
            if (foe) scrap(foe.group);
            foe = foeModel(kind, toneOf(t.tone));
            foes.set(t.id, foe);
            live.add(foe.group);
          }
          foe.group.position.set(x, kind === "boss" || kind === "carrier" ? 0.1 : 0.25, z);
          foe.group.scale.setScalar(t.r * K * (kind === "boss" ? 1 : kind === "carrier" ? 0.95 : 1.05));
          // A gull points where it dives; the rest face down the screen.
          foe.group.rotation.y = kind === "dart" && t.angle !== undefined ? Math.PI / 2 - (t.angle / 18000) * Math.PI : 0;
          if (!still) {
            const rate = kind === "boss" ? 0.5 : kind === "spinner" ? 0.07 : 0.9;
            for (const s of foe.spin) s.rotation.y = frame * rate + t.id;
            const beat = Math.sin(frame / (kind === "dart" ? 3 : 2.2) + t.id);
            for (const w of foe.flap) w.rotation.z = (w.userData.side as number) * beat * (kind === "dart" ? 0.25 : 0.7);
            if (kind === "gunship" || kind === "carrier") foe.group.rotation.z = Math.sin(frame / 22 + t.id) * 0.08;
          }
        }
      }
      droppings.count = halos.count = bullets;
      jets.count = shots;
      for (const m of [droppings, halos, jets]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      for (const [id, f] of foes) if (!seen.has(id)) (scrap(f.group), foes.delete(id));
      for (const [id, s] of ships) if (!seen.has(id)) (scrap(s.group), ships.delete(id));
      for (const [id, p] of pickups) if (!seen.has(id)) (scrap(p.group), pickups.delete(id));
      for (const [id, b] of blasts)
        if (!seen.has(id)) {
          (b.material as Material).dispose();
          scrap(b);
          blasts.delete(id);
        }
    },
  };
}

// ====================================================================================================
// Chip Stack
// ====================================================================================================
// A card table with the one big chip on it that everything comes from. What has been earned stands
// round it in stacks: the more in the bank, the more of them and the higher. The golden chip stands
// on its edge and spins.

/** A chip's edge: its own colour with white insets, the way a casino chip is striped. */
function chipEdge(colour: string): CanvasTexture {
  return canvasTexture(256, 16, (g) => {
    g.fillStyle = colour;
    g.fillRect(0, 0, 256, 16);
    g.fillStyle = "#fbf6ec";
    for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 4, 0, 12, 16);
  });
}
/** A chip's face: a ring of insets, an inner ring, and a spade. */
function chipFace(colour: string): CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = colour;
    g.beginPath();
    g.arc(128, 128, 128, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#fbf6ec";
    g.lineWidth = 22;
    g.setLineDash([36, 54]);
    g.beginPath();
    g.arc(128, 128, 114, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 5;
    g.beginPath();
    g.arc(128, 128, 84, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#fbf6ec";
    g.font = "700 96px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("\u2660\uFE0E", 128, 134);
  });
}

function chipstackWorld(scene: Scene, fx: Effects, FW: number, FH: number): World {
  scene.background = new Color("#143628");
  scene.add(new HemisphereLight(0xfff6e0, 0x1c3a2b, 1.5));
  const lamp = new DirectionalLight(0xfff0d0, 2.2);
  lamp.position.set(FW / 2 - 2, 8, FH / 2 + 4);
  lamp.target.position.set(FW / 2, 0, FH / 2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0006;
  const cam = lamp.shadow.camera;
  cam.left = cam.bottom = -5;
  cam.right = cam.top = 5;
  cam.near = 1;
  cam.far = 30;
  scene.add(lamp, lamp.target);
  // The felt, darker towards its edges.
  const felt = canvasTexture(256, 256, (g, n) => {
    const fade = g.createRadialGradient(128, 128, 20, 128, 128, 180);
    fade.addColorStop(0, "#2f7355");
    fade.addColorStop(1, "#143628");
    g.fillStyle = fade;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1500; i++) {
      g.globalAlpha = 0.06;
      g.fillStyle = n() < 0.5 ? "#000000" : "#ffffff";
      g.fillRect(n() * 256, n() * 256, 1, 1);
    }
  });
  const table = new Mesh(new PlaneGeometry(FW * 3, FH * 3.4).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: felt, roughness: 1 }));
  table.receiveShadow = true;
  put(scene, table, FW / 2, 0, FH / 2);

  const faces = new Map<string, MeshStandardMaterial[]>();
  /** The three sides of a chip in a colour: its edge, and its two faces. */
  const skin = (colour: string) => {
    let m = faces.get(colour);
    if (!m) {
      const edge = new MeshStandardMaterial({ map: chipEdge(colour), roughness: 0.5 });
      const face = new MeshStandardMaterial({ map: chipFace(colour), roughness: 0.45 });
      faces.set(colour, (m = [edge, face, face]));
    }
    return m;
  };
  const big = new Mesh(new CylinderGeometry(1, 1, 0.22, 48), skin(toneOf("red")));
  big.castShadow = true;
  scene.add(big);
  const heat = new Mesh(new CircleGeometry(1.5, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#ff5a6e", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  scene.add(heat);
  const golden = new Group();
  const coin = new Mesh(new CylinderGeometry(1, 1, 0.2, 36).rotateX(Math.PI / 2), skin("#f2c230"));
  coin.castShadow = true;
  const timer = new Mesh(new RingGeometry(1.25, 1.4, 48), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false }));
  golden.add(coin, timer);
  golden.visible = false;
  scene.add(golden);

  // The winnings: stacks of small chips round the big one.
  const SPOTS: [number, number][] = [];
  const n = rng(2024);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + n() * 0.2;
    const far = 1.75 + (i % 3) * 0.48 + n() * 0.12;
    SPOTS.push([FW / 2 + Math.cos(a) * far * 1.45, FH / 2 + Math.sin(a) * far * 0.8]);
  }
  const TALL = 14;
  const stacks = new InstancedMesh(new CylinderGeometry(0.2, 0.2, 0.05, 20), new MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }), SPOTS.length * TALL);
  stacks.castShadow = true;
  stacks.count = 0;
  stacks.instanceMatrix.setUsage(DynamicDrawUsage);
  scene.add(stacks);
  const COLOURS = ["#c8372d", "#2f6fd0", "#3f9a55", "#1d1a16", "#8a5bd6", "#f2c230"].map((c) => new Color(c));
  const cream = new Color("#fbf6ec");
  let stacked = -1;
  const m4 = new Matrix4();
  const q = new Quaternion();
  const at = new Vector3();
  const one = new Vector3(1, 1, 1);
  function restack(bank: number) {
    // A chip more for every doubling and a half, near enough: it never stops growing, but slowly.
    const chips = Math.min(SPOTS.length * TALL, Math.floor(Math.log2(Math.max(1, bank)) * 5));
    if (chips === stacked) return;
    stacked = chips;
    let k = 0;
    for (let level = 0; level < TALL && k < chips; level++)
      for (let spot = 0; spot < SPOTS.length && k < chips; spot++) {
        const [x, z] = SPOTS[spot]!;
        q.setFromAxisAngle(UP, spot * 1.3 + level * 0.4);
        m4.compose(at.set(x + Math.sin(level * 2.1 + spot) * 0.012, 0.025 + level * 0.05, z + Math.cos(level * 1.7 + spot) * 0.012), q, one);
        stacks.setMatrixAt(k, m4);
        stacks.setColorAt(k, (level + spot) % 5 === 4 ? cream : COLOURS[spot % COLOURS.length]!);
        k++;
      }
    stacks.count = k;
    stacks.instanceMatrix.needsUpdate = true;
    if (stacks.instanceColor) stacks.instanceColor.needsUpdate = true;
  }

  let bump = 0;
  let shaking = 0;
  return {
    tilt: 0.78,
    headroom: 0.4,
    shake: () => shaking,
    reset() {
      bump = shaking = 0;
      stacked = -1;
    },
    hear(events) {
      shaking *= 0.86;
      bump *= 0.8;
      for (const e of events) {
        const x = e.x * K;
        const z = e.y * K;
        switch (e.kind) {
          case "tap":
            bump = 1;
            fx.burst(FW / 2, 0.3, FH / 2, 3, "#ffd166", 0.06, 22, 0.05);
            break;
          case "buy":
          case "boost":
            fx.burst(FW / 2, 0.3, FH / 2, 12, e.kind === "buy" ? "#fbf6ec" : "#ffd166", 0.07, 26, 0.05);
            break;
          case "golden":
            fx.ring(x, 0.05, z, 0.06, 0.04, 20, "#ffd166");
            break;
          case "frenzy":
          case "lucky":
            fx.burst(x, 0.4, z, 50, "#ffd166", 0.12, 44, 0.06);
            fx.ring(x, 0.05, z, 0.1, 0.08, 24, "#ffd166");
            shaking = 0.05;
            break;
          case "cashout":
            fx.burst(FW / 2, 0.4, FH / 2, 90, "#b08cff", 0.16, 60, 0.07);
            fx.burst(FW / 2, 0.4, FH / 2, 50, "#ffd166", 0.13, 60, 0.06);
            shaking = 0.08;
            break;
        }
      }
    },
    show({ view, frame, still }) {
      restack(view.market?.bank ?? 0);
      golden.visible = false;
      for (const t of view.things) {
        const r = t.r * K;
        if (t.kind === "chip") {
          const colour = toneOf(t.tone);
          big.material = skin(colour === "#ffffff" ? "#c8372d" : colour);
          // A tap squashes it for a moment.
          big.scale.set(r * (1 + bump * 0.05), 1 - bump * 0.3, r * (1 + bump * 0.05));
          big.position.set(t.x * K, 0.11 * (1 - bump * 0.3), t.y * K);
          big.rotation.y = still ? 0 : frame * 0.004;
          heat.position.set(t.x * K, 0.012, t.y * K);
          heat.scale.setScalar(r);
          (heat.material as MeshBasicMaterial).opacity = ((t.health ?? 0) / 1000) * 0.55;
        } else if (t.kind === "golden") {
          golden.visible = true;
          golden.position.set(t.x * K, r * 1.25 + (still ? 0 : Math.sin(frame / 7) * 0.05), t.y * K);
          golden.scale.setScalar(r);
          coin.rotation.y = still ? 0.5 : frame * 0.09;
          // How long it has left: the ring round it runs down.
          timer.geometry.dispose();
          timer.geometry = new RingGeometry(1.25, 1.4, 48, 1, Math.PI / 2, -Math.PI * 2 * ((t.health ?? 1000) / 1000));
        }
      }
    },
  };
}

// ====================================================================================================
// The scene
// ====================================================================================================
export function build(canvas: HTMLCanvasElement, game: ArcadeGameId, field: { width: number; height: number }): Arcade3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  const FW = field.width * K;
  const FH = field.height * K;
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, FW / FH, 0.5, 120);
  const fx = effects(scene);
  let world: World;
  if (game === "bulwark") {
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    world = bulwarkWorld(scene, fx, FW, FH);
  } else if (game === "skyfire") world = skyfireWorld(scene, fx, FW, FH);
  else if (game === "chipstack") {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    world = chipstackWorld(scene, fx, FW, FH);
  }
  else {
    renderer.dispose();
    return null;
  }

  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => (lost = false));

  /** Where the camera stands when nothing is shaking it. */
  const home = new Vector3();
  const aim = new Vector3();
  const v = new Vector3();
  let fitted = "";
  /** Stand the camera back until the whole field (and a little over its far edge) is in the picture. */
  function fit(aspect: number) {
    camera.aspect = aspect;
    const away = new Vector3(0, Math.cos(world.tilt), Math.sin(world.tilt));
    let far = FH * 2;
    let cz = FH / 2;
    const corners: [number, number, number][] = [[0, 0, 0], [FW, 0, 0], [0, 0, FH], [FW, 0, FH], [0, world.headroom, 0], [FW, world.headroom, 0], [0, 0.25, FH], [FW, 0.25, FH]];
    for (let i = 0; i < 30; i++) {
      aim.set(FW / 2, 0, cz);
      camera.position.copy(aim).addScaledVector(away, far);
      camera.lookAt(aim);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      let wide = 0;
      let top = -Infinity;
      let bottom = Infinity;
      for (const c of corners) {
        v.set(...c).project(camera);
        wide = Math.max(wide, Math.abs(v.x));
        top = Math.max(top, v.y);
        bottom = Math.min(bottom, v.y);
      }
      far *= Math.max(wide, (top - bottom) / 2) / 0.985;
      // Level it up: as much room over the far edge as under the near one.
      cz -= (((top + bottom) / 2) * far * Math.tan((camera.fov * Math.PI) / 360)) / Math.cos(world.tilt) * 0.6;
    }
    home.copy(camera.position);
  }

  let size = "";
  const api: Arcade3d = {
    render(frame) {
      if (lost) return false;
      const { width, height, dpr } = frame;
      if (!width || !height) return false;
      const next = `${width}|${height}|${dpr}`;
      if (next !== size) {
        size = next;
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
      }
      const aspect = width / height;
      if (fitted !== aspect.toFixed(4)) {
        fitted = aspect.toFixed(4);
        fit(aspect);
      }
      try {
        world.show(frame);
        fx.show();
        const sway = frame.still ? 0 : lookMotion();
        const shake = sway === 0 ? 0 : world.shake() * sway;
        camera.position.copy(home);
        if (shake > 0.002) camera.position.add(v.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
        camera.updateMatrixWorld();
        renderer.render(scene, camera);
        return true;
      } catch {
        lost = true;
        return false;
      }
    },
    hear(events) {
      world.hear(events);
    },
    settle() {
      fx.settle();
    },
    reset() {
      world.reset();
      fx.clear();
    },
    pick(u, w) {
      // The ray through that point of the picture, met with the ground.
      camera.position.copy(home);
      camera.updateMatrixWorld();
      v.set(u * 2 - 1, 1 - w * 2, 0.5).unproject(camera).sub(home).normalize();
      if (v.y > -1e-4) return null;
      const t = -home.y / v.y;
      return [(home.x + v.x * t) / K, (home.z + v.z * t) / K];
    },
    project(x, y, lift = 0) {
      const at = camera.position.clone();
      camera.position.copy(home);
      camera.updateMatrixWorld();
      v.set(x * K, lift * K, y * K).project(camera);
      camera.position.copy(at);
      return [((v.x + 1) / 2) * field.width, ((1 - v.y) / 2) * field.height];
    },
    dispose() {
      world.reset();
      fx.release();
      renderer.dispose();
    },
  };
  return api;
}
