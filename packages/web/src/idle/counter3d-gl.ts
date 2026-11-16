// The three.js half of the counter at Delbie's (see counter3d.ts, which loads this on demand).
//
// A parts store seen from the customers' side of the counter: shelves of boxes on the back wall
// under the sign, the counter with its till and its phones, Delbie behind it, and the line in
// front. Everything that changes is something the game's numbers already say. The line is as long
// as the counter is chaotic; the phones ring with it; whoever has been taken on stands at the
// counter; a truck is out the back for every driver; the lamp is on at the billing desk when
// somebody is at it; the back room's boxes pile up by the wall; a red light turns when the books
// are full. When Delbie has the afternoon off there is a sign on the counter instead.
//
// Units are metres, near enough: x along the counter, y up, z towards the customers.
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
  type Material,
} from "three";
import type { Counter3d, CounterLook } from "./counter3d";

const paints = new Map<string, MeshStandardMaterial>();
function paint(color: string, rough = 0.8, metal = 0): MeshStandardMaterial {
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
const solid = <T extends Mesh>(o: T) => {
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};
const box = (w: number, h: number, d: number, m: Material) => solid(new Mesh(new BoxGeometry(w, h, d), m));
const drum = (top: number, bottom: number, h: number, m: Material, sides = 14) => solid(new Mesh(new CylinderGeometry(top, bottom, h, sides), m));
const ball = (r: number, m: Material) => solid(new Mesh(new SphereGeometry(r, 16, 12), m));
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function sign(text: string, w: number, h: number, ground: string, ink: string, edge: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = ground;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = edge;
  g.lineWidth = h * 0.08;
  g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  g.fillStyle = ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${Math.round(h * 0.56)}px 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif`;
  g.fillText(text, w / 2, h / 2 + h * 0.03, w * 0.88);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const SKINS = ["#f1c9a5", "#e0ac84", "#c68a5e", "#9a6a45", "#f4d6ba"];
const SHIRTS = ["#3f78b5", "#b5483f", "#4c8a4a", "#8a5bb5", "#c98a2c", "#3a9a9a", "#6a6f7a", "#b53f7a"];

interface Person { group: Group; arms: [Group, Group]; head: Mesh; phase: number }
/** Somebody, standing: a shirt, a head, two arms that swing from the shoulder, and perhaps a cap. */
function person(shirt: string, skin: string, cap: string | null, seed: number): Person {
  const g = new Group();
  const cloth = paint(shirt, 0.85);
  const flesh = paint(skin, 0.7);
  put(g, drum(0.2, 0.24, 0.5, paint("#2b3240", 0.9)), 0, 0.25, 0);
  put(g, drum(0.25, 0.22, 0.62, cloth), 0, 0.82, 0);
  put(g, ball(0.25, cloth), 0, 1.12, 0).scale.set(1, 0.5, 0.9);
  const head = put(g, ball(0.2, flesh), 0, 1.42, 0);
  if (cap) {
    put(g, solid(new Mesh(new SphereGeometry(0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint(cap, 0.7))), 0, 1.46, 0);
    put(g, box(0.26, 0.03, 0.2, paint(cap, 0.7)), 0, 1.48, 0.2);
  } else put(g, solid(new Mesh(new SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), paint(["#3a2a1c", "#1d1a18", "#8a8a8a", "#6a4a2a"][seed % 4]!, 0.9))), 0, 1.45, -0.01);
  const arms = [-1, 1].map((side) => {
    const arm = new Group();
    put(arm, drum(0.07, 0.06, 0.5, cloth, 8), 0, -0.25, 0);
    put(arm, ball(0.075, flesh), 0, -0.52, 0);
    put(g, arm, side * 0.3, 1.1, 0);
    return arm;
  }) as [Group, Group];
  return { group: g, arms, head, phase: (seed % 100) / 16 };
}

export function build(canvas: HTMLCanvasElement): Counter3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => (lost = false));

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 2.4, 0.5, 60);
  const room = new AmbientLight(0xfff4e2, 1.5);
  const tubes = new DirectionalLight(0xffffff, 2.0);
  tubes.position.set(-2.5, 6, 5);
  tubes.castShadow = true;
  tubes.shadow.mapSize.set(1024, 1024);
  tubes.shadow.bias = -0.0008;
  const sc = tubes.shadow.camera;
  sc.left = sc.bottom = -6;
  sc.right = sc.top = 6;
  sc.near = 1;
  sc.far = 20;
  scene.add(room, tubes);

  // ---- The shop, which never changes ----------------------------------------------------------
  const floor = new Mesh(new PlaneGeometry(30, 14).rotateX(-Math.PI / 2), paint("#8f8a80", 0.9));
  floor.receiveShadow = true;
  put(scene, floor, 0, 0, 0.5);
  // Tiles: a darker one every other square.
  const tile = paint("#7b766c", 0.9);
  for (let x = -13; x < 13; x++) for (let z = -2; z < 7; z++) if ((x + z) % 2 === 0) put(scene, new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), tile), x + 0.5, 0.002, z + 0.5).receiveShadow = true;
  // The back wall, with the door on the right standing open on the yard.
  const wall = paint("#d9d2c2", 0.95);
  put(scene, box(18.05, 8, 0.2, wall), -5.975, 4, -2.5);
  put(scene, box(9.65, 8, 0.2, wall), 10.175, 4, -2.5);
  put(scene, box(2.3, 5.5, 0.2, wall), 4.2, 5.25, -2.5);
  put(scene, box(2.5, 0.16, 0.26, paint("#5b6470", 0.6, 0.4)), 4.2, 2.52, -2.4);
  const yard = new MeshBasicMaterial({ color: "#bfe0f5" });
  put(scene, new Mesh(new PlaneGeometry(12, 8), yard), 4.2, 2, -8);
  const tarmac = new Mesh(new PlaneGeometry(8, 6).rotateX(-Math.PI / 2), paint("#5d6168", 1));
  put(scene, tarmac, 4.2, -0.01, -5.4);
  // Shelves of parts boxes along the wall.
  const n = rng(7);
  const cartons = ["#c8372d", "#2f6fd0", "#f2c230", "#e8e2d2", "#2c2f36", "#3f9a55", "#e07a2c"];
  for (let shelf = 0; shelf < 3; shelf++) {
    put(scene, box(6.4, 0.06, 0.5, paint("#6a7078", 0.6, 0.4)), -0.6, 1.25 + shelf * 0.62, -2.18);
    for (let x = -3.7; x < 2.4; ) {
      const w = 0.22 + n() * 0.3;
      const h = 0.2 + n() * 0.3;
      if (n() < 0.88) put(scene, box(w, h, 0.34, paint(cartons[Math.floor(n() * cartons.length)]!, 0.8)), x + w / 2, 1.28 + shelf * 0.62 + h / 2, -2.16);
      x += w + 0.03;
    }
  }
  for (const x of [-3.8, -0.6, 2.6]) put(scene, box(0.07, 2.6, 0.5, paint("#6a7078", 0.6, 0.4)), x, 1.3, -2.18);
  const board = new Mesh(new PlaneGeometry(3.6, 0.62), new MeshBasicMaterial({ map: sign("DELBIE'S AUTO PARTS", 1024, 176, "#1f2a3a", "#f2c230", "#f2c230") }));
  put(scene, board, -0.6, 3.2, -2.38);
  // The counter, its top worn pale, with a kick plate.
  put(scene, box(7.2, 1.0, 0.75, paint("#a33a30", 0.7)), 0, 0.5, 0);
  put(scene, box(7.4, 0.07, 0.9, paint("#d8cdb6", 0.5)), 0, 1.035, 0);
  put(scene, box(7.2, 0.14, 0.02, paint("#2c2f36", 0.5, 0.4)), 0, 0.09, 0.39);
  // The till: its drawer comes out when a sale is rung up.
  const till = new Group();
  put(till, box(0.5, 0.2, 0.44, paint("#33383f", 0.5, 0.3)), 0, 0.1, 0);
  put(till, box(0.44, 0.22, 0.2, paint("#3d434c", 0.5, 0.3)), 0, 0.3, -0.1).rotation.x = -0.3;
  put(till, new Mesh(new PlaneGeometry(0.3, 0.1), new MeshBasicMaterial({ color: "#7dffb0" })), 0, 0.36, 0.01).rotation.x = -0.3;
  const drawer = put(till, box(0.44, 0.1, 0.4, paint("#4a515c", 0.5, 0.4)), 0, 0.06, 0.02);
  put(scene, till, 0.95, 1.07, 0.02);
  // Two phones, which ring when it gets busy.
  const phones = [-1.1, -2.9].map((x) => {
    const phone = new Group();
    put(phone, box(0.3, 0.09, 0.24, paint("#1d1f24", 0.5)), 0, 0.045, 0);
    put(phone, box(0.34, 0.07, 0.08, paint("#2a2d33", 0.5)), 0, 0.13, -0.04);
    const lamp = put(phone, new Mesh(new SphereGeometry(0.03, 8, 6), new MeshBasicMaterial({ color: "#ff3b30" })), 0.1, 0.1, 0.09);
    lamp.name = "lamp";
    put(scene, phone, x, 1.07, 0.1);
    return phone;
  });
  // The billing desk, back left: a desk, a monitor and a lamp that is on when somebody is at it.
  put(scene, box(1.5, 0.75, 0.7, paint("#7a5a3a", 0.8)), -5.1, 0.375, -1.5);
  put(scene, box(0.5, 0.36, 0.05, paint("#1d1f24", 0.4)), -5.2, 1.0, -1.6);
  const shade = put(scene, new Mesh(new ConeGeometry(0.16, 0.2, 12, 1, true), new MeshBasicMaterial({ color: "#3a3d42" })), -4.6, 1.2, -1.55);
  put(scene, drum(0.015, 0.015, 0.4, paint("#2c2f36", 0.5, 0.5), 6), -4.6, 0.95, -1.55);
  const deskGlow = new PointLight(0xffd9a0, 0, 3.5);
  put(scene, deskGlow, -4.6, 1.1, -1.4);
  const clerk = person("#8a5bb5", SKINS[0]!, null, 3);
  clerk.group.scale.setScalar(0.92);
  put(scene, clerk.group, -5.1, -0.25, -2.0);
  // The light that turns when the books are full.
  const beacon = put(scene, new Mesh(new SphereGeometry(0.12, 12, 10), new MeshBasicMaterial({ color: "#5a1512" })), 2.9, 3.1, -2.3);
  const alarm = new PointLight(0xff2a1f, 0, 9);
  put(scene, alarm, 2.9, 3.0, -1.6);

  // ---- The people, and what comes and goes ----------------------------------------------------
  const delbie = person("#1f2a3a", SKINS[1]!, "#f2c230", 1);
  delbie.group.scale.setScalar(1.12);
  put(scene, delbie.group, 0, 0, -0.75);
  // What he gets like: a red face, and steam.
  const face = (delbie.head.material = (delbie.head.material as MeshStandardMaterial).clone());
  const calm = new Color(SKINS[1]!);
  const cross = new Color("#d8553f");
  const puffs = Array.from({ length: 6 }, () => put(scene, new Mesh(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 })), 0, 0, 0));
  const coins = Array.from({ length: 8 }, () => ({ mesh: put(scene, new Mesh(new CylinderGeometry(0.06, 0.06, 0.02, 12), new MeshBasicMaterial({ color: "#ffd166" })), 0, -5, 0), born: -1e9, vx: 0, vz: 0 }));
  // Gone for the afternoon: a sign on the counter and a rod against the shelves.
  const gone = new Group();
  put(gone, new Mesh(new PlaneGeometry(1.5, 0.5), new MeshBasicMaterial({ map: sign("GONE FISHING", 512, 170, "#f6efdc", "#1f2a3a", "#a33a30") })), 0, 1.36, 0.2);
  put(gone, box(0.06, 0.5, 0.06, paint("#6a4a2c")), -0.5, 1.2, 0.16);
  put(gone, box(0.06, 0.5, 0.06, paint("#6a4a2c")), 0.5, 1.2, 0.16);
  const rod = put(gone, drum(0.012, 0.02, 2.2, paint("#3a2a1c"), 6), -0.6, 1.1, -1.9);
  rod.rotation.z = 0.25;
  scene.add(gone);

  const crew: { key: number; who: Person }[] = [];
  const CREW_AT = [-1.9, 1.9, -3.3, 3.2];
  const line: Person[] = [];
  // (Nobody stands straight in front of Delbie: he is who the picture is of.)
  const QUEUE: [number, number][] = [[-0.85, 1.0], [1.75, 1.15], [-1.9, 1.7], [0.9, 1.95], [2.8, 2.0], [-0.6, 2.5], [-3.0, 2.5], [2.0, 2.9]];
  QUEUE.forEach(([x, z], i) => {
    const p = person(SHIRTS[(i * 3 + 1) % SHIRTS.length]!, SKINS[(i * 2) % SKINS.length]!, i % 3 === 1 ? "#33383f" : null, i + 11);
    p.group.rotation.y = Math.PI + (i % 2 ? 0.25 : -0.2);
    p.group.scale.setScalar(0.95 + (i % 3) * 0.05);
    p.group.visible = false;
    put(scene, p.group, x, 0, z);
    line.push(p);
  });
  // The one at the front has something to ask.
  const bubble = new Mesh(new PlaneGeometry(0.5, 0.5), new MeshBasicMaterial({ map: sign("?", 128, 128, "#ffffff", "#1f2a3a", "#f2c230"), transparent: true }));
  bubble.visible = false;
  put(scene, bubble, -0.85, 2.05, 1.0);
  const trucks = [0, 1].map((i) => {
    const t = new Group();
    put(t, box(1.5, 0.9, 0.8, paint("#f1f1ea", 0.6)), 0.1, 0.85, 0);
    put(t, box(0.55, 0.6, 0.78, paint(i ? "#3f78b5" : "#a33a30", 0.5)), -0.9, 0.62, 0);
    for (const x of [-0.8, 0.5]) put(t, drum(0.2, 0.2, 0.84, paint("#1d1f24", 0.9), 14), x, 0.2, 0).rotation.x = Math.PI / 2;
    t.visible = false;
    put(scene, t, 4.5 - i * 0.5, 0, -3.7 - i * 1.3);
    return t;
  });
  const pile: Mesh[] = [];
  const stack = rng(31);
  for (let i = 0; i < 12; i++) {
    const s = 0.34 + stack() * 0.16;
    const carton = put(scene, box(s * 1.2, s, s, paint(i % 4 === 3 ? "#b98a55" : "#c9a36b", 0.95)), -4.5 + (i % 3) * 0.52 + stack() * 0.08, 0.2 + Math.floor(i / 3) * 0.44, 0.9 + stack() * 0.2);
    carton.rotation.y = (stack() - 0.5) * 0.5;
    carton.visible = false;
    pile.push(carton);
  }

  let rung = -1e9;
  let crewKey = "";
  let now = 0;
  let size = "";
  let drawn = 0;

  return {
    ring() {
      rung = now;
      const free = coins.reduce((a, b) => (a.born < b.born ? a : b));
      free.born = now;
      free.vx = (Math.random() - 0.5) * 1.2;
      free.vz = 0.4 + Math.random() * 0.8;
    },
    render(look, time, width, height, dpr, still) {
      if (lost || !width || !height) return false;
      now = time;
      // Thirty times a second is plenty for a shop.
      if (!still && drawn && time - drawn < 30) return true;
      drawn = time;
      try {
        const next = `${width}|${height}|${dpr}`;
        if (next !== size) {
          size = next;
          renderer.setPixelRatio(dpr);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          // The whole counter is in the picture however narrow the screen: further back when it is.
          const back = Math.max(1, 2.3 / camera.aspect);
          camera.position.set(0.4, 2.7 + back * 1.1, 5.9 * back + 0.6);
          camera.lookAt(0.4, 1.4, -1.0);
          camera.updateProjectionMatrix();
        }
        const t = still ? 0 : time / 1000;
        // Daylight through the door from seven till seven, and the tubes do the rest.
        const hour = look.minute / 60;
        const day = Math.max(0, Math.min(1, Math.min(hour - 6, 20 - hour) / 1.5));
        yard.color.set("#16233a").lerp(new Color("#bfe0f5"), day);
        room.intensity = 1.25 + day * 0.35;

        // Who is on the counter: made again only when that changes.
        const key = look.counter.map((c) => `${c.who}.${c.level}`).join(",");
        if (key !== crewKey) {
          crewKey = key;
          for (const c of crew) scene.remove(c.who.group);
          crew.length = 0;
          look.counter.slice(0, CREW_AT.length).forEach((c, i) => {
            const who = person(SHIRTS[c.who % SHIRTS.length]!, SKINS[(c.who >> 3) % SKINS.length]!, c.who % 2 ? ["#a33a30", "#2f6fd0", "#3f9a55"][c.who % 3]! : null, c.who);
            who.group.scale.setScalar(0.94 + Math.min(3, c.level) * 0.03);
            put(scene, who.group, CREW_AT[i]!, 0, -0.75);
            crew.push({ key: c.who, who });
          });
        }
        const sway = (p: Person, rate: number, far: number) => {
          p.group.position.y = still ? 0 : Math.abs(Math.sin(t * rate + p.phase)) * far;
          p.arms[0].rotation.x = Math.sin(t * rate + p.phase) * 0.25;
          p.arms[1].rotation.x = -Math.sin(t * rate + p.phase) * 0.25;
        };
        for (const c of crew) sway(c.who, 2.2, 0.02);
        // The line: as long as the counter is chaotic, and less patient the longer it gets.
        const waiting = look.away ? Math.min(2, Math.ceil(look.chaos * line.length)) : Math.ceil(look.chaos * line.length);
        line.forEach((p, i) => {
          p.group.visible = i < Math.max(waiting, look.asking ? 1 : 0);
          sway(p, 1.6 + look.chaos * 3, 0.015 + look.chaos * 0.05);
          p.group.rotation.z = still ? 0 : Math.sin(t * (1 + look.chaos * 2) + p.phase) * 0.03 * (1 + look.chaos * 2);
        });
        bubble.visible = look.asking || look.radio;
        bubble.position.y = 2.05 + (still ? 0 : Math.sin(t * 3) * 0.05);
        // The phones: both lit and shaking when it is bad, one when it is busy.
        phones.forEach((phone, i) => {
          const ringing = look.chaos > (i ? 0.6 : 0.3) || (i === 0 && look.radio);
          (phone.getObjectByName("lamp") as Mesh).visible = ringing && (still || Math.floor(t * 6) % 2 === 0);
          phone.rotation.z = ringing && !still ? Math.sin(t * 40) * 0.06 : 0;
        });

        // Delbie: in or out, how wound up, and the hand that comes down on the till.
        delbie.group.visible = !look.away;
        gone.visible = look.away;
        const heat = look.dream ? 0 : Math.max(look.chaos, look.stress * 0.6);
        face.color.copy(calm).lerp(cross, Math.max(0, heat - 0.35) * 1.3);
        const since = (time - rung) / 1000;
        const slam = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) : 0;
        const pace = look.dream ? 9 : 2 + heat * 7;
        delbie.group.position.y = still ? 0 : Math.abs(Math.sin(t * pace)) * (look.dream ? 0.12 : 0.02 + heat * 0.04);
        delbie.group.rotation.z = still ? 0 : Math.sin(t * pace * 0.5) * (look.dream ? 0.08 : heat * 0.05);
        delbie.group.rotation.y = 0.18 - slam * 0.25;
        // Both arms up when he is living that dream; one down on the till for a sale.
        delbie.arms[0].rotation.x = look.dream ? -2.7 + Math.sin(t * 9) * 0.3 : -0.3 - heat * 0.5;
        delbie.arms[1].rotation.x = look.dream ? -2.7 - Math.sin(t * 9) * 0.3 : -0.9 - slam * 0.9;
        delbie.arms[0].rotation.z = look.dream ? -0.4 : 0;
        delbie.arms[1].rotation.z = look.dream ? 0.4 : -0.35;
        drawer.position.z = 0.02 + (since < 0.5 ? Math.sin((since / 0.5) * Math.PI) * 0.26 : 0);
        coins.forEach((c) => {
          const age = (time - c.born) / 1000;
          if (age > 0.9 || still) return c.mesh.position.set(0, -5, 0);
          c.mesh.position.set(0.95 + c.vx * age, 1.3 + 2.6 * age - 4.2 * age * age, 0.2 + c.vz * age);
          c.mesh.rotation.set(age * 14, age * 9, 0);
        });
        puffs.forEach((p, i) => {
          const life = ((t * 0.7 + i / puffs.length) % 1 + 1) % 1;
          const on = !still && !look.away && !look.dream && heat > 0.55;
          (p.material as MeshBasicMaterial).opacity = on ? (1 - life) * 0.55 * Math.min(1, (heat - 0.55) * 4) : 0;
          p.position.set((i % 2 ? 0.22 : -0.22) + Math.sin(i * 2.1) * 0.05, 1.75 + life * 0.7, -0.75);
          p.scale.setScalar(0.6 + life * 1.4);
        });

        // Round the edges: the desk, the yard, the back room, the alarm.
        deskGlow.intensity = look.desk ? 2.2 : 0;
        (shade.material as MeshBasicMaterial).color.set(look.desk ? "#ffd9a0" : "#3a3d42");
        clerk.group.visible = look.desk;
        trucks.forEach((truck, i) => {
          truck.visible = look.drivers > i;
          truck.position.y = still ? 0 : Math.abs(Math.sin(t * 9 + i)) * 0.012;
        });
        pile.forEach((carton, i) => (carton.visible = i < Math.round(look.clutter * pile.length)));
        const flash = look.panic ? (still ? 1 : 0.5 + Math.sin(t * 7) * 0.5) : 0;
        alarm.intensity = flash * 14;
        (beacon.material as MeshBasicMaterial).color.set(look.panic ? (flash > 0.5 ? "#ff3b30" : "#8a1f1a") : "#5a1512");

        renderer.render(scene, camera);
        return true;
      } catch {
        lost = true;
        return false;
      }
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      renderer.dispose();
    },
  };
}
