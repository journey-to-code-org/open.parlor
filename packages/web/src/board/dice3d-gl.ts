// The three.js half of the 3-D dice (see dice3d.ts, which loads this on demand).
//
// All the dice share one WebGL renderer: each die has its own 2D canvas, and a frame is drawn by
// rendering that die's cube once and copying it over. That keeps a table to a single GL context
// however many dice it has (Yacht's five, backgammon's two, a house's open tabs).
import { AmbientLight, CanvasTexture, DirectionalLight, Group, Euler, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** Which face of a box points where: the order three.js lists a box's six materials in. */
const FACE_NORMALS = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)];
/** What is on each of those faces, so that opposite faces always add to seven. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 2], [2, 0]],
  3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

import type { Dice3d, Die3d, DiePalette } from "./dice3d";

const SIZE = 192;
const TILT = new Quaternion().setFromEuler(new Euler(-0.5, 0.42, 0.08));
/** The turn that brings face `value` to point at the viewer. */
function facing(value: number): Quaternion {
  const at = Math.max(0, FACE_VALUES.indexOf(value));
  return new Quaternion().setFromUnitVectors(FACE_NORMALS[at]!, new Vector3(0, 0, 1));
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function faceTexture(value: number, p: DiePalette): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = p.body;
  g.fillRect(0, 0, 128, 128);
  const r = value === 1 ? 17 : 12;
  g.fillStyle = value === 1 ? p.one : p.pip;
  for (const [col, row] of PIPS[value] ?? []) {
    g.beginPath();
    g.arc(32 + col * 32, 32 + row * 32, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function build(): Dice3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return null;
  }
  renderer.setSize(SIZE, SIZE, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 0, 5.2);
  scene.add(new AmbientLight(0xffffff, 1.55));
  const key = new DirectionalLight(0xffffff, 2.1);
  key.position.set(-2.5, 3.5, 4);
  scene.add(key);
  const rim = new DirectionalLight(0xffe6b0, 0.7);
  rim.position.set(3, -2, 2);
  scene.add(rim);

  const geometry = new RoundedBoxGeometry(1.25, 1.25, 1.25, 4, 0.16);
  const textures = new Map<DiePalette, MeshStandardMaterial[]>();
  const materials = (p: DiePalette) => {
    let m = textures.get(p);
    if (!m) textures.set(p, (m = FACE_VALUES.map((v) => new MeshStandardMaterial({ map: faceTexture(v, p), roughness: 0.42, metalness: 0.05 }))));
    return m;
  };

  const live = new Set<Instance>();
  let frame = 0;
  const loop = (now: number) => {
    frame = 0;
    for (const d of live) d.step(now);
    if ([...live].some((d) => d.busy)) frame = requestAnimationFrame(loop);
  };
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(loop);
  };

  class Instance implements Die3d {
    private mesh: Mesh;
    private group = new Group();
    private at = facing(1);
    private from = new Quaternion();
    private axis = new Vector3(0.6, 1, 0.3).normalize();
    private spin = 0;
    private start = 0;
    private ms = 0;
    private hopped = 0;
    private shown = 1;
    busy = false;
    constructor(private canvas: HTMLCanvasElement, private palette: DiePalette) {
      this.mesh = new Mesh(geometry, materials(palette));
      this.group.add(this.mesh);
      canvas.width = canvas.height = SIZE;
      live.add(this);
    }
    private orient(angle: number) {
      const turn = new Quaternion().setFromAxisAngle(this.axis, angle);
      this.group.quaternion.copy(TILT).multiply(turn).multiply(this.at);
    }
    private draw(lift: number) {
      this.group.position.y = lift;
      scene.add(this.group);
      renderer.render(scene, camera);
      scene.remove(this.group);
      const g = this.canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, SIZE, SIZE);
      g.drawImage(renderer.domElement, 0, 0, SIZE, SIZE);
    }
    show(value: number) {
      this.shown = value;
      this.at = facing(value);
      if (!this.busy) {
        this.orient(0);
        this.draw(0);
      }
    }
    tumble(value: number, ms: number, delay = 0) {
      this.shown = value;
      this.at = facing(value);
      this.axis.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      this.spin = Math.PI * (3 + Math.random() * 2) * (Math.random() < 0.5 ? -1 : 1);
      this.start = performance.now() + delay;
      this.ms = ms;
      this.hopped = 0.15 + Math.random() * 0.12;
      this.busy = true;
      wake();
    }
    setPalette(palette: DiePalette) {
      this.palette = palette;
      this.mesh.material = materials(palette);
      if (!this.busy) this.show(this.shown);
    }
    step(now: number) {
      if (!this.busy) return;
      const t = Math.min(1, Math.max(0, (now - this.start) / this.ms));
      const e = easeOut(t);
      this.orient(this.spin * (1 - e));
      // Up, and down with a small bounce at the end.
      const lift = t < 1 ? Math.abs(Math.sin(t * Math.PI * 2.2)) * this.hopped * (1 - t) : 0;
      this.draw(lift);
      if (t >= 1) this.busy = false;
    }
    dispose() {
      live.delete(this);
      this.busy = false;
    }
  }
  return { create: (canvas, palette) => new Instance(canvas, palette) };
}
