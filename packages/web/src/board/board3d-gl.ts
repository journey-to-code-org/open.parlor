// The three.js half of the 3-D board (see board3d.ts, which loads this on demand).
//
// The camera is the one the CSS transform in board3d.ts describes: an eye straight in front of the
// middle of the board's box, `PERSPECTIVE` board-widths back, with the board tipped away from it by
// `TILT`. A square of the board therefore lands on exactly the pixels its button does, which is
// what lets the buttons stay where they are and be the thing that is tapped.
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

// ---- The board -----------------------------------------------------------------------------------
/** The frame round the squares, in squares, and how thick the board is. */
const FRAME = 0.34;
const THICK = 0.2;
function boardTexture(cols: number, rows: number, coords: BoardFrame3d["coords"]): CanvasTexture {
  const px = 96;
  const edge = FRAME * px;
  const c = document.createElement("canvas");
  c.width = Math.round(cols * px + edge * 2);
  c.height = Math.round(rows * px + edge * 2);
  const g = c.getContext("2d")!;
  let seed = 1234567;
  const n = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  // Walnut round the edge, with a line of inlay next to the squares.
  g.fillStyle = "#4b2f1d";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.12 + n() * 0.1;
    g.fillStyle = n() < 0.5 ? "#3a2315" : "#5e3d27";
    g.fillRect(0, n() * c.height, c.width, 1 + n() * 2);
  }
  g.globalAlpha = 1;
  g.strokeStyle = "#c9a56b";
  g.lineWidth = 3;
  g.strokeRect(edge - 5, edge - 5, cols * px + 10, rows * px + 10);
  for (let r = 0; r < rows; r++)
    for (let col = 0; col < cols; col++) {
      const light = (r + col) % 2 === 0;
      const x = edge + col * px;
      const y = edge + r * px;
      g.fillStyle = light ? "#ecdcb9" : "#a57a50";
      g.fillRect(x, y, px, px);
      // The grain of each square runs its own way a little.
      for (let i = 0; i < 9; i++) {
        g.globalAlpha = 0.05 + n() * 0.07;
        g.fillStyle = light ? "#b99a68" : "#6d4a2c";
        g.fillRect(x, y + n() * px, px, 1 + n() * 2);
      }
      g.globalAlpha = 1;
    }
  if (coords) {
    g.fillStyle = "#e8cf9d";
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
  mesh: Mesh;
  kind: string;
  light: boolean;
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
    const top = new MeshStandardMaterial({ map: boardTexture(cols, rows, frame.coords), roughness: 0.42 });
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
  const square = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const dot = new CircleGeometry(0.16, 24).rotateX(-Math.PI / 2);
  const hoop = new RingGeometry(0.4, 0.46, 40).rotateX(-Math.PI / 2);

  function buildMarks(frame: BoardFrame3d) {
    marksGroup.clear();
    const lay = (geometry: BufferGeometry, material: MeshBasicMaterial, at: number, lift: number) => {
      const m = new Mesh(geometry, material);
      const [x, z] = spot(at);
      m.position.set(x, lift, z);
      m.renderOrder = 1;
      marksGroup.add(m);
    };
    for (const m of frame.marks) {
      if (m.mark === "from" || m.mark === "last") lay(square, gold, m.at, 0.004);
      else if (m.mark === "threat") lay(square, danger, m.at, 0.006);
    }
    if (frame.picked !== null) lay(square, held, frame.picked, 0.005);
    const taken = new Set(frame.pieces.map((p) => p.at));
    for (const at of frame.targets) lay(taken.has(at) ? hoop : dot, going, at, 0.008);
  }

  function place(p: Piece3d, frame: BoardFrame3d) {
    let s = standing.get(p.id);
    const to = spot(p.at);
    if (!s || s.kind !== p.kind || s.light !== p.light) {
      // New to the board, or a pawn that has become something else.
      const from = s ? s.to : to;
      if (s) pieces.remove(s.mesh);
      const mesh = new Mesh(shapeOf(p.kind), p.light ? IVORY : EBONY);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s = { mesh, kind: p.kind, light: p.light, to, from, since: -1e9 };
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
    s.mesh.rotation.y = (p.near ? Math.PI / 2 : -Math.PI / 2) + 0.95;
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

        const bKey = `${cols}x${rows}|${frame.coords ? `${frame.coords.cols.join("")}|${frame.coords.rows.join("")}` : ""}`;
        if (bKey !== boardKey) {
          boardKey = bKey;
          buildBoard(frame);
        }
        const mKey = `${frame.marks.map((m) => `${m.at}${m.mark}`).join(",")}|${frame.picked}|${frame.targets.join(",")}|${frame.pieces.length}`;
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
