// The chips, drawn with three.js: fetched by chips3d.ts when a table with chips is on screen.
//
// One camera looks straight at the page, a unit of the scene to a CSS pixel, so a stack is put down
// exactly where its place on the page is. Each stack is tipped towards the eye by the same angle,
// which is what makes it a stack of cylinders seen from a chair and not a column of rectangles.
// The canvas is see-through: the felt, the seats and the buttons are the page's, under it.

import { AmbientLight, CanvasTexture, CircleGeometry, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer, type Material } from "three";
import { MARK_GLYPHS, chipValueLabel, type ChipMark } from "@open-parlor/ui/chip-design";
import { CHIP_THICK, CHIP_TILT, chipHeight, dropLeft, type Chips3d, type ChipsFrame3d } from "./chips3d";

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // Already sRGB. Asking the context for a colour space makes some Windows drivers upload a black texture.
  const g = c.getContext("2d")!;
  draw(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A chip's edge: its own colour with its insets cut the way the set says. */
const chipEdge = (colour: string, inset: string, edge: string) =>
  canvasTexture(256, 16, (g) => {
    g.fillStyle = colour;
    g.fillRect(0, 0, 256, 16);
    g.fillStyle = inset;
    if (edge === "ring") g.fillRect(0, 6, 256, 4);
    else if (edge !== "plain") {
      // Eight insets round the edge: narrow stripes, wide blocks or little dots.
      const [w, h, y] = edge === "blocks" ? [20, 16, 0] : edge === "dots" ? [6, 6, 5] : [12, 16, 0];
      for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 16 - w / 2, y, w, h);
    }
  });
/** A chip's face: the insets round its rim, an inner ring, and its mark: its value, a suit, a star or a crown. */
const chipFace = (colour: string, inset: string, edge: string, mark: string, value: number) =>
  canvasTexture(128, 128, (g) => {
    g.fillStyle = colour;
    g.beginPath();
    g.arc(64, 64, 64, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = inset;
    if (edge === "ring") {
      g.lineWidth = 6;
      g.beginPath();
      g.arc(64, 64, 55, 0, Math.PI * 2);
      g.stroke();
    } else if (edge !== "plain") {
      const ring = 2 * Math.PI * 55;
      const [on, width] = edge === "blocks" ? [ring / 8 - 8, 14] : edge === "dots" ? [0.01, 9] : [ring / 8 - 27, 14];
      g.lineWidth = width;
      g.lineCap = edge === "dots" ? "round" : "butt";
      g.setLineDash([on, ring / 8 - on]);
      g.beginPath();
      g.arc(64, 64, 55, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.lineCap = "butt";
    }
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 64, 38, 0, Math.PI * 2);
    g.stroke();
    const said = mark === "value" ? chipValueLabel(value) : (MARK_GLYPHS[mark as ChipMark] ?? "");
    if (said) {
      g.fillStyle = inset;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = mark === "value" ? `700 ${said.length > 2 ? 26 : 34}px Georgia, 'Times New Roman', serif` : "40px 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', system-ui, sans-serif";
      g.fillText(said, 64, 67);
    }
  });

/** What a chip is made of, as the light catches it. */
function finishOf(finish: string, map: CanvasTexture): Material {
  if (finish === "gloss") return new MeshPhysicalMaterial({ map, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
  if (finish === "metal") return new MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.65 });
  return new MeshStandardMaterial({ map, roughness: 0.55 });
}

/** The same little turn and nudge for the same chip every frame, so a stack looks put down by hand and doesn't shimmer. */
const jitter = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function build(canvas: HTMLCanvasElement): Chips3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  scene.add(new AmbientLight(0xffffff, 1.1));
  // A felt-green fill from below and a warm one from above, so a metal chip has something to show.
  scene.add(new HemisphereLight(0xfff6e0, 0x2b6a50, 0.9));
  // The lamp over the table: above, a little to the left, and on the eye's side of the chips.
  const lamp = new DirectionalLight(0xfff4dc, 2.4);
  lamp.position.set(-0.5, 1, 0.9);
  scene.add(lamp);

  // One chip, a pixel across: every chip on the table is this, scaled to its stack's width.
  const chip = new CylinderGeometry(0.5, 0.5, CHIP_THICK, 40);
  const skins = new Map<string, Material[]>();
  /** The three sides of a chip (its edge and its two faces): one set of them for each look and value. */
  const skin = (stack: { colour: string; inset: string; edge: string; mark: string; finish: string; value: number }) => {
    const key = [stack.colour, stack.inset, stack.edge, stack.finish, stack.mark, stack.mark === "value" ? stack.value : ""].join("/");
    let m = skins.get(key);
    if (!m) {
      const face = finishOf(stack.finish, chipFace(stack.colour, stack.inset, stack.edge, stack.mark, stack.value));
      skins.set(key, (m = [finishOf(stack.finish, chipEdge(stack.colour, stack.inset, stack.edge)), face, face]));
    }
    return m;
  };
  // What a stack throws on the felt: a soft dark round under it, a little towards the eye and away from the lamp.
  const shade = new MeshBasicMaterial({
    map: canvasTexture(64, 64, (g) => {
      const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      fade.addColorStop(0, "rgba(0, 0, 0, 0.55)");
      fade.addColorStop(0.55, "rgba(0, 0, 0, 0.4)");
      fade.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = fade;
      g.fillRect(0, 0, 64, 64);
    }),
    transparent: true,
    depthWrite: false,
  });
  const round = new CircleGeometry(0.5, 32).rotateX(-Math.PI / 2);

  /** A stack's place in the scene: a group tipped towards the eye, its shadow, and as many chips as it has needed so far. */
  interface Standing {
    group: Group;
    chips: Mesh[];
  }
  const standing: Standing[] = [];
  const stand = (i: number) => {
    let s = standing[i];
    if (!s) {
      const group = new Group();
      group.rotation.x = (CHIP_TILT * Math.PI) / 180;
      const shadow = new Mesh(round, shade);
      shadow.scale.set(1.5, 1, 1.5);
      shadow.position.set(0.12, 0.002, 0.1);
      shadow.renderOrder = -1;
      group.add(shadow);
      scene.add(group);
      standing[i] = s = { group, chips: [] };
    }
    return s;
  };

  /** What each stack had last frame, and when each of its chips was put on (ms; 0 for one that was simply there). */
  let seen = new Map<object, number[]>();
  let started = false;
  let width = 0;
  let height = 0;
  let dpr = 0;

  return {
    render(frame: ChipsFrame3d) {
      if (lost) return null;
      if (frame.width !== width || frame.height !== height || frame.dpr !== dpr) {
        ({ width, height, dpr } = frame);
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        camera.right = width;
        camera.bottom = -height;
        camera.updateProjectionMatrix();
      }
      let busy = false;
      const now = new Map<object, number[]>();
      const lean = Math.sin((CHIP_TILT * Math.PI) / 180);
      frame.stacks.forEach((stack, i) => {
        const s = stand(i);
        s.group.visible = true;
        // The stack's foot: the page gives the nearest point of the bottom chip, and its middle is half a face further up.
        s.group.position.set(stack.x, -(stack.y - (stack.width / 2) * lean), 0);
        s.group.scale.setScalar(stack.width);
        const before = seen.get(stack.id);
        // A chip this stack didn't have a frame ago was just put on it. Not on the scene's first frame: those were already on the table.
        const put = Array.from({ length: stack.count }, (_, k) => before?.[k] ?? (stack.drops && started && !frame.still ? frame.time : 0));
        now.set(stack.id, put);
        const skinned = skin(stack);
        for (let k = 0; k < Math.max(stack.count, s.chips.length); k++) {
          let mesh = s.chips[k];
          if (k >= stack.count) {
            if (mesh) mesh.visible = false;
            continue;
          }
          if (!mesh) {
            mesh = new Mesh(chip, skinned);
            s.group.add(mesh);
            s.chips[k] = mesh;
          }
          mesh.visible = true;
          mesh.material = skinned;
          const left = put[k] ? dropLeft(frame.time - put[k]!, k - (before?.length ?? 0)) : 0;
          if (left > 0) busy = true;
          const seed = i * 31 + k;
          mesh.position.set((jitter(seed) - 0.5) * 0.05, chipHeight(k) + left * 1.1, (jitter(seed + 0.5) - 0.5) * 0.05);
          mesh.rotation.y = jitter(seed + 0.25) * Math.PI * 2;
        }
      });
      for (let i = frame.stacks.length; i < standing.length; i++) standing[i]!.group.visible = false;
      seen = now;
      started = true;
      renderer.render(scene, camera);
      return busy ? "busy" : "idle";
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      chip.dispose();
      round.dispose();
      shade.map?.dispose();
      shade.dispose();
      for (const sides of skins.values())
        for (const m of new Set(sides)) {
          (m as MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      renderer.dispose();
    },
  };
}
