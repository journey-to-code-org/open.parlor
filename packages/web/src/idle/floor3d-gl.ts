// The three.js half of Delbie's floor plan as a room (see floor3d.ts, which loads this on demand).
//
// The store with its roof off, seen from the front: a floor of squares, a wall along the back and
// one side, and on each square whatever stands there. A terminal is a desk with a screen, and
// somebody at it once they have been taken on; the office is a glassed-in corner; the bathroom is
// a cubicle; the microwave is on its table, the warranty desk under its returns, the drivers'
// bench with the drivers on it. Two things that stand side by side and do something to each other
// are joined by a bar on the floor between them: green for what helps, red for what doesn't.
//
// The camera is the board camera (board/board3d.ts): the floor plan's grid of buttons is laid over
// this picture by the same transform, so a square of the room is the button it always was.
//
// Scene units are squares: x across the room, z towards the front, y up.
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
  type Material,
} from "three";
import { PERSPECTIVE, SCALE, SHIFT, TILT } from "../board/board3d";
import { box, crewPerson, drum as drumOf, paint, put, rabbit, type Person } from "./people3d";
import type { Floor3d, FloorLook } from "./floor3d";

const drum = (top: number, bottom: number, h: number, m: Material, sides = 12) => drumOf(top, bottom, h, m, sides);
function plate(text: string, ground: string, ink: string): MeshBasicMaterial {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = ground;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = ink;
  g.font = "900 40px 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 35, 116);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map: t });
}
/** One of the crew at the room's scale, facing the front. */
function figure(id: string): Person {
  const p = crewPerson(id);
  p.group.scale.multiplyScalar(0.4);
  return p;
}

interface Standing { group: Group; key: string; x: number; z: number; people: Person[]; steam?: Mesh[]; bubble?: Mesh }
/** What is going on that changes what a piece looks like. */
interface Doings { drivers: string[]; rickyOut: boolean; cinnamon: boolean; hungry: boolean }

/** What stands on a square, modelled about its middle and within it. */
function pieceModel(id: string, empty: boolean, who: string | undefined, doing: Doings): { group: Group; people: Person[]; steam?: Mesh[]; bubble?: Mesh } {
  const g = new Group();
  const people: Person[] = [];
  const wood = paint("#a8794a", 0.8);
  const steel = paint("#5b6470", 0.5, 0.4);
  const dark = paint("#1d1f24", 0.5);
  if (id === "door") {
    // The front door: a frame, glass, and the mat.
    put(g, box(0.08, 0.9, 0.08, steel), -0.36, 0.45, 0.36);
    put(g, box(0.08, 0.9, 0.08, steel), 0.36, 0.45, 0.36);
    put(g, box(0.8, 0.08, 0.08, steel), 0, 0.9, 0.36);
    put(g, new Mesh(new PlaneGeometry(0.64, 0.82), new MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.45, roughness: 0.1 })), 0, 0.45, 0.36);
    put(g, box(0.6, 0.02, 0.36, paint("#5a2d22", 1)), 0, 0.012, 0.05);
    put(g, new Mesh(new PlaneGeometry(0.42, 0.14), plate("OPEN", "#2f8a4b", "#ffffff")), 0, 0.62, 0.37);
  } else if (id === "office") {
    // Delbie's office: a glassed-in corner with his desk and the filing in it.
    const glass = new MeshStandardMaterial({ color: "#f2d98a", transparent: true, opacity: 0.3, roughness: 0.1 });
    put(g, new Mesh(new BoxGeometry(0.9, 0.7, 0.03), glass), 0, 0.37, 0.44);
    put(g, new Mesh(new BoxGeometry(0.03, 0.7, 0.9), glass), -0.44, 0.37, 0);
    for (const [x, z] of [[-0.44, 0.44], [0.44, 0.44], [-0.44, -0.44]] as const) put(g, box(0.05, 0.74, 0.05, paint("#6b5a2a", 0.5, 0.4)), x, 0.37, z);
    put(g, box(0.5, 0.26, 0.28, wood), 0.05, 0.13, -0.05);
    put(g, box(0.2, 0.42, 0.22, steel), 0.3, 0.21, -0.3);
    put(g, box(0.16, 0.13, 0.02, dark), 0.05, 0.34, -0.1);
    put(g, new Mesh(new PlaneGeometry(0.5, 0.16), plate("DELBIE", "#1f2a3a", "#f2c230")), 0, 0.62, 0.46);
  } else if (id === "bathroom") {
    put(g, box(0.7, 0.8, 0.7, paint("#dfe7ee", 0.8)), 0, 0.4, -0.04);
    put(g, box(0.3, 0.6, 0.02, paint("#3f78b5", 0.7)), 0, 0.3, 0.32);
    put(g, new Mesh(new PlaneGeometry(0.26, 0.13), plate("WC", "#ffffff", "#3f78b5")), 0, 0.7, 0.325);
    put(g, new Mesh(new SphereGeometry(0.02, 8, 6), paint("#f2c230", 0.3, 0.8)), 0.1, 0.3, 0.335);
    // Ricky, when that is where he is: outside it, on his phone, in no hurry.
    if (doing.rickyOut) {
      const p = figure("ricky");
      put(g, p.group, 0.36, 0, 0.38);
      people.push(p);
    }
  } else if (id === "microwave") {
    // The pasta microwave, on its table, going.
    put(g, box(0.56, 0.04, 0.4, wood), 0, 0.3, 0);
    for (const [x, z] of [[-0.24, -0.16], [0.24, -0.16], [-0.24, 0.16], [0.24, 0.16]] as const) put(g, box(0.04, 0.3, 0.04, wood), x, 0.15, z);
    put(g, box(0.4, 0.22, 0.28, paint("#e8e8e4", 0.4, 0.2)), 0, 0.43, 0);
    put(g, new Mesh(new PlaneGeometry(0.24, 0.15), new MeshBasicMaterial({ color: "#ffb347" })), -0.05, 0.43, 0.141);
    // The cinnamon roll somebody left, which Ricky will not come near.
    if (doing.cinnamon) {
      put(g, drum(0.07, 0.08, 0.05, paint("#b9773a", 0.8), 14), 0.2, 0.345, 0.12);
      put(g, drum(0.04, 0.045, 0.02, paint("#f6efe0", 0.6), 12), 0.2, 0.375, 0.12);
    }
    const steam = [0, 1, 2].map(() => put(g, new Mesh(new SphereGeometry(0.05, 8, 6), new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 })), 0, 0.6, 0));
    return { group: g, people, steam };
  } else if (id === "warranty") {
    // The warranty desk, under what has come back.
    put(g, box(0.7, 0.3, 0.34, paint("#7a5a3a", 0.8)), 0, 0.15, -0.05);
    put(g, box(0.24, 0.18, 0.22, paint("#c9a36b", 0.95)), -0.2, 0.39, -0.05);
    put(g, box(0.2, 0.14, 0.2, paint("#b98a55", 0.95)), -0.18, 0.55, -0.04).rotation.y = 0.3;
    put(g, box(0.22, 0.16, 0.2, paint("#c9a36b", 0.95)), 0.14, 0.38, -0.08);
    put(g, new Mesh(new PlaneGeometry(0.2, 0.1), plate("RMA", "#ffffff", "#a33a30")), 0.14, 0.38, 0.025);
    if (!empty) {
      const p = figure(who ?? "snowcap");
      put(g, p.group, 0.05, 0, -0.33);
      people.push(p);
    }
  } else if (id === "bench") {
    // The drivers' bench, with whoever isn't on the road.
    put(g, box(0.82, 0.05, 0.24, wood), 0, 0.2, 0);
    put(g, box(0.82, 0.22, 0.04, wood), 0, 0.36, -0.11);
    for (const x of [-0.36, 0.36]) put(g, box(0.05, 0.2, 0.22, steel), x, 0.1, 0);
    doing.drivers.slice(0, 3).forEach((driver, i, all) => {
      const p = figure(driver);
      p.group.scale.multiplyScalar(0.9);
      put(g, p.group, (i - (all.length - 1) / 2) * 0.27, 0.1, 0.02);
      people.push(p);
    });
  } else {
    // A terminal: a stretch of counter, a screen that is on when somebody sits at it, and them.
    put(g, box(0.78, 0.3, 0.3, paint("#a33a30", 0.7)), 0, 0.15, 0.12);
    put(g, box(0.82, 0.03, 0.36, paint("#d8cdb6", 0.5)), 0, 0.315, 0.12);
    put(g, box(0.22, 0.17, 0.02, dark), 0, 0.44, 0.06);
    put(g, new Mesh(new PlaneGeometry(0.19, 0.14), new MeshBasicMaterial({ color: empty ? "#16191e" : "#7dffb0" })), 0, 0.44, 0.048).rotation.y = Math.PI;
    put(g, box(0.03, 0.06, 0.03, dark), 0, 0.35, 0.06);
    put(g, box(0.2, 0.012, 0.07, dark), 0, 0.337, -0.02);
    if (empty) {
      // Nobody yet: the stool is pushed in.
      put(g, drum(0.09, 0.09, 0.03, steel, 12), 0, 0.2, -0.26);
      put(g, drum(0.015, 0.015, 0.2, steel, 6), 0, 0.1, -0.26);
    } else {
      const p = figure(who ?? id);
      put(g, p.group, 0, 0, -0.26);
      people.push(p);
      // Pluto breeds rabbits. One of them comes to work.
      if (who === "pluto") put(g, rabbit(), 0.27, 0.33, 0.14).scale.setScalar(0.75);
      // B-Rice, when he hasn't eaten: it is all he can think about.
      if (who === "brice" && doing.hungry) {
        const bubble = new Mesh(new PlaneGeometry(0.46, 0.2), plate("PASTA?", "#ffffff", "#a33a30"));
        put(g, bubble, 0, 1.0, -0.26);
        return { group: g, people, bubble };
      }
    }
  }
  return { group: g, people };
}

export function build(canvas: HTMLCanvasElement): Floor3d | null {
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
    roomKey = "";
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 100);
  scene.add(new AmbientLight(0xfff6e6, 1.6));
  const tubes = new DirectionalLight(0xffffff, 2.3);
  tubes.position.set(-4, 7, 8);
  tubes.castShadow = true;
  tubes.shadow.mapSize.set(1536, 1536);
  tubes.shadow.bias = -0.0006;
  tubes.shadow.normalBias = 0.02;
  const sc = tubes.shadow.camera;
  sc.left = sc.bottom = -6;
  sc.right = sc.top = 6;
  sc.near = 1;
  sc.far = 30;
  scene.add(tubes);

  const table = new Group();
  table.rotation.x = Math.PI / 2 - (TILT * Math.PI) / 180;
  scene.add(table);
  const room = new Group();
  const links = new Group();
  const things = new Group();
  const marks = new Group();
  table.add(room, links, marks, things);
  let roomKey = "";
  let linksKey = "";
  let marksKey = "";
  let cols = 6;
  let rows = 4;
  const standing = new Map<string, Standing>();
  let size = "";
  let drawn = 0;
  let begun = false;

  const spot = (square: number): [number, number] => [(square % cols) + 0.5 - cols / 2, Math.floor(square / cols) + 0.5 - rows / 2];

  function buildRoom() {
    room.traverse((o) => ((o as Mesh).isMesh ? (o as Mesh).geometry.dispose() : null));
    room.clear();
    // The floor: lino squares, a little worn.
    const px = 96;
    const c = document.createElement("canvas");
    c.width = cols * px;
    c.height = rows * px;
    const g = c.getContext("2d")!;
    let seed = 99;
    const n = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let r = 0; r < rows; r++)
      for (let col = 0; col < cols; col++) {
        g.fillStyle = (r + col) % 2 ? "#b9b2a2" : "#a69f90";
        g.fillRect(col * px, r * px, px, px);
        for (let i = 0; i < 12; i++) {
          g.globalAlpha = 0.08;
          g.fillStyle = n() < 0.5 ? "#000000" : "#ffffff";
          g.fillRect(col * px + n() * px, r * px + n() * px, 2 + n() * 14, 1);
        }
        g.globalAlpha = 1;
        g.strokeStyle = "rgba(60, 55, 45, 0.35)";
        g.lineWidth = 2;
        g.strokeRect(col * px + 1, r * px + 1, px - 2, px - 2);
      }
    const map = new CanvasTexture(c);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    const wallStuff = paint("#e4dccb", 0.95);
    const slab = new Mesh(new BoxGeometry(cols + 0.24, 0.16, rows + 0.24), [paint("#6a6258"), paint("#6a6258"), new MeshStandardMaterial({ map, roughness: 0.75 }), paint("#6a6258"), paint("#6a6258"), paint("#6a6258")]);
    slab.position.y = -0.08;
    slab.receiveShadow = true;
    room.add(slab);
    // The walls that are left on: the back and one side, with a window and the shelves.
    put(room, box(cols + 0.24, 1.0, 0.12, wallStuff), 0, 0.5, -rows / 2 - 0.06);
    put(room, box(0.12, 1.0, rows + 0.12, wallStuff), -cols / 2 - 0.06, 0.5, 0);
    put(room, box(cols + 0.24, 0.05, 0.14, paint("#3d4652", 0.6)), 0, 1.02, -rows / 2 - 0.06);
    put(room, box(0.14, 0.05, rows + 0.12, paint("#3d4652", 0.6)), -cols / 2 - 0.06, 1.02, 0);
    const cartons = ["#c8372d", "#2f6fd0", "#f2c230", "#e8e2d2", "#3f9a55", "#e07a2c"];
    for (let shelf = 0; shelf < 2; shelf++) {
      put(room, box(cols * 0.56, 0.025, 0.14, paint("#6a7078", 0.6, 0.4)), -cols * 0.1, 0.5 + shelf * 0.24, -rows / 2 + 0.08);
      for (let x = -cols * 0.37; x < cols * 0.17; ) {
        const w = 0.09 + n() * 0.1;
        const h = 0.08 + n() * 0.1;
        if (n() < 0.85) put(room, box(w, h, 0.1, paint(cartons[Math.floor(n() * cartons.length)]!, 0.8)), x + w / 2, 0.515 + shelf * 0.24 + h / 2, -rows / 2 + 0.08);
        x += w + 0.015;
      }
    }
    const pane = new Mesh(new PlaneGeometry(rows * 0.4, 0.42), new MeshBasicMaterial({ color: "#bfe0f5" }));
    pane.rotation.y = Math.PI / 2;
    put(room, pane, -cols / 2 + 0.006, 0.6, rows * 0.12);
  }

  const good = new MeshBasicMaterial({ color: "#49d17d", transparent: true, opacity: 0.95, depthWrite: false });
  const bad = new MeshBasicMaterial({ color: "#ff5a4f", transparent: true, opacity: 0.95, depthWrite: false });
  function buildLinks(look: FloorLook) {
    links.clear();
    for (const l of look.links) {
      const [ax, az] = spot(l.a);
      const [bx, bz] = spot(l.b);
      // A bar from one square to the other, towards the front of them where nothing stands on it,
      // with a stud at each end.
      const across = Math.abs(bx - ax) > 0.5;
      const mx = (ax + bx) / 2 + (across ? 0 : 0.37);
      const mz = (az + bz) / 2 + (across ? 0.37 : 0);
      const paintOf = l.good ? good : bad;
      put(links, new Mesh(new BoxGeometry(across ? 0.46 : 0.08, 0.02, across ? 0.08 : 0.46), paintOf), mx, 0.012, mz);
      for (const end of [-1, 1]) put(links, new Mesh(new CircleGeometry(0.075, 16).rotateX(-Math.PI / 2), paintOf), mx + (across ? end * 0.23 : 0), 0.024, mz + (across ? 0 : end * 0.23));
    }
  }

  const ring = new MeshBasicMaterial({ color: "#f2c230", transparent: true, opacity: 0.95, depthWrite: false });
  const drop = new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthWrite: false });
  const frame = new RingGeometry(0.58, 0.66, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
  const dot = new CircleGeometry(0.09, 16).rotateX(-Math.PI / 2);
  function buildMarks(look: FloorLook) {
    marks.clear();
    if (!look.holding) return;
    const taken = new Map(look.pieces.map((p) => [p.square, p]));
    for (let square = 0; square < cols * rows; square++) {
      const there = taken.get(square);
      const [x, z] = spot(square);
      if (there?.id === look.holding) put(marks, new Mesh(frame, ring), x, 0.014, z);
      // Anywhere it can be put down: an empty square, or one whose piece would swap with it.
      else if (!there?.fixed) put(marks, new Mesh(dot, drop), x, 0.014, z + 0.36);
    }
  }

  return {
    render(look, time, width, height, board, dpr, still) {
      if (lost || !width || !height || !board) return false;
      if (!still && drawn && time - drawn < 30) return true;
      drawn = time;
      try {
        const next = `${width}|${height}|${dpr}`;
        if (next !== size) {
          size = next;
          renderer.setPixelRatio(dpr);
          renderer.setSize(width, height, false);
        }
        cols = look.cols;
        rows = look.rows;
        const unit = board / cols;
        const eye = (board * PERSPECTIVE) / unit;
        camera.aspect = width / height;
        camera.fov = (2 * Math.atan(height / unit / 2 / eye) * 180) / Math.PI;
        camera.position.set(0, 0, eye);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        table.position.y = -(SHIFT * board) / unit;
        table.scale.setScalar(SCALE);

        if (roomKey !== `${cols}x${rows}`) {
          roomKey = `${cols}x${rows}`;
          buildRoom();
        }
        const lKey = look.links.map((l) => `${l.a}-${l.b}${l.good}`).join(",");
        if (lKey !== linksKey) {
          linksKey = lKey;
          buildLinks(look);
        }
        const mKey = `${look.holding}|${look.pieces.map((p) => `${p.id}${p.square}`).join(",")}`;
        if (mKey !== marksKey) {
          marksKey = mKey;
          buildMarks(look);
        }
        const t = still ? 0 : time / 1000;
        const seen = new Set<string>();
        for (const p of look.pieces) {
          seen.add(p.id);
          const who = look.who[p.id];
          // A terminal is empty when nobody has been taken on for it, and while whoever has is somewhere else.
          const away = !!who && look.away.includes(who);
          const doing: Doings = { drivers: look.drivers, rickyOut: look.away.includes("ricky"), cinnamon: look.cinnamon, hungry: look.hungry };
          const key = `${p.empty || away}|${p.id === "bench" ? look.drivers.join("") : ""}|${p.id === "bathroom" ? doing.rickyOut : ""}|${p.id === "microwave" ? doing.cinnamon : ""}|${who === "brice" ? doing.hungry : ""}`;
          const [x, z] = spot(p.square);
          let s = standing.get(p.id);
          if (!s || s.key !== key) {
            const at = s ? [s.group.position.x, s.group.position.z] : [x, z];
            if (s) things.remove(s.group);
            const made = pieceModel(p.id, p.empty || away, who, doing);
            s = { ...made, key, x, z };
            s.group.position.set(at[0]!, 0, at[1]!);
            standing.set(p.id, s);
            things.add(s.group);
          }
          s.x = x;
          s.z = z;
          // Moved: it slides to its new square. Picked up: it hangs over the one it came from.
          const k = begun && !still ? 0.22 : 1;
          s.group.position.x += (x - s.group.position.x) * k;
          s.group.position.z += (z - s.group.position.z) * k;
          const held = look.holding === p.id;
          s.group.position.y += ((held ? 0.22 + (still ? 0 : Math.sin(t * 4) * 0.03) : 0) - s.group.position.y) * (still ? 1 : 0.3);
          for (const who of s.people) {
            who.arms[0].rotation.x = still ? -0.6 : -0.7 + Math.sin(t * 6 + who.phase) * 0.25;
            who.arms[1].rotation.x = still ? -0.6 : -0.7 - Math.sin(t * 6 + who.phase) * 0.25;
            who.head.rotation.y = still ? 0 : Math.sin(t * 0.8 + who.phase) * 0.4;
          }
          if (s.bubble) s.bubble.position.y = 1.0 + (still ? 0 : Math.sin(t * 3) * 0.03);
          // Pluto, after what B-Rice just ate: not himself.
          if (who === "pluto" && s.people[0]) s.people[0].group.rotation.z = look.shocked && !still ? Math.sin(t * 38) * 0.12 : 0;
          s.steam?.forEach((puff, i) => {
            const life = (t * 0.6 + i / 3) % 1;
            (puff.material as MeshBasicMaterial).opacity = still ? 0 : (1 - life) * 0.6;
            puff.position.set(Math.sin(i * 2.4 + t) * 0.04, 0.58 + life * 0.35, 0);
            puff.scale.setScalar(0.6 + life);
          });
        }
        for (const [id, s] of standing)
          if (!seen.has(id)) {
            things.remove(s.group);
            standing.delete(id);
          }
        begun = true;
        // What two neighbours do to each other beats gently.
        const beat = still ? 1 : 0.7 + Math.sin(t * 3) * 0.3;
        good.opacity = bad.opacity = beat;
        renderer.render(scene, camera);
        return true;
      } catch {
        lost = true;
        return false;
      }
    },
    dispose() {
      scene.traverse((o) => ((o as Mesh).isMesh ? (o as Mesh).geometry.dispose() : null));
      renderer.dispose();
    },
  };
}
