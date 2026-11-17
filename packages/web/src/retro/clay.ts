// Characters modelled, not lettered. A drawing typed a letter a pixel is fine for a key or a chest,
// but a sixteen-bit hero is tall and round, with a head that catches the light, and he walks in
// more than two frames. So a character here is built from a few solid shapes (a ball for a head, a
// stick with round ends for a leg, a flat shape for a wing or a cape), each in a material that
// knows its own four tones. The shapes are turned into pixels with hard edges and no blending, lit
// from the top left in bands as a pixel artist would shade them, and given a dark line round the
// outside in a shade of what it encloses. Moving a shape a little and drawing again is a frame.
import { blank, rgb, type Rgb, type Sprite } from "./pixels";

/** A material: its lit tone, its own colour, its shade, its deep shade, and the line that goes round it. */
export interface Mat { tones: [Rgb, Rgb, Rgb, Rgb]; line: Rgb }
const blend = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A material from one colour. Shade goes towards a dusky blue as well as darker, as painted shadows do. */
export function mat(hex: string): Mat {
  const base = rgb(hex);
  const dusk: Rgb = [38, 30, 78];
  return { tones: [blend(base, [255, 255, 255], 0.38), base, blend(base, dusk, 0.3), blend(base, dusk, 0.56)], line: blend(blend(base, dusk, 0.6), [0, 0, 0], 0.45) };
}

export class Clay {
  private rgb: Float32Array;
  /** Which shape each pixel belongs to (0 for none), and which material. */
  private part: Int16Array;
  private mats: Mat[] = [];
  private of: Int16Array;
  private parts = 0;
  constructor(readonly w: number, readonly h: number) {
    this.rgb = new Float32Array(w * h * 3);
    this.part = new Int16Array(w * h);
    this.of = new Int16Array(w * h);
  }
  private put(x: number, y: number, c: Rgb, part: number, m: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.rgb.set(c, i * 3);
    this.part[i] = part;
    this.of[i] = m;
  }
  private use(m: Mat): number {
    let n = this.mats.indexOf(m);
    if (n < 0) n = this.mats.push(m) - 1;
    return n;
  }
  /** Which tone a surface shows, from which way it faces: up and to the left is towards the light. */
  private tone(m: Mat, nx: number, ny: number): Rgb {
    const lit = -nx * 0.55 - ny * 0.78;
    return m.tones[lit > 0.52 ? 0 : lit > -0.12 ? 1 : lit > -0.6 ? 2 : 3];
  }
  /** A ball, or an egg. Returns the shape's number, for marks to be put on it. */
  ball(cx: number, cy: number, rx: number, ry: number, m: Mat): number {
    const part = ++this.parts;
    const mi = this.use(m);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) this.put(x, y, this.tone(m, nx, ny), part, mi);
    }
    return part;
  }
  /** A stick with round ends: a leg, an arm, a tail. */
  limb(x1: number, y1: number, x2: number, y2: number, r: number, m: Mat): number {
    const part = ++this.parts;
    const mi = this.use(m);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y1, y2) - r); y <= Math.max(y1, y2) + r; y++) for (let x = Math.floor(Math.min(x1, x2) - r); x <= Math.max(x1, x2) + r; x++) {
      const t = Math.min(1, Math.max(0, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len));
      const nx = (x + 0.5 - (x1 + dx * t)) / r;
      const ny = (y + 0.5 - (y1 + dy * t)) / r;
      if (nx * nx + ny * ny <= 1) this.put(x, y, this.tone(m, nx, ny), part, mi);
    }
    return part;
  }
  /** A flat shape with straight sides: a wing, a cape, a crown. Lit down its length: pale at the top, deep at the bottom. */
  shape(points: readonly (readonly [number, number])[], m: Mat, flat = -1): number {
    const part = ++this.parts;
    const mi = this.use(m);
    const ys = points.map((p) => p[1]);
    const top = Math.min(...ys);
    const tall = Math.max(...ys) - top || 1;
    for (let y = Math.floor(top); y <= top + tall; y++) for (let x = Math.floor(Math.min(...points.map((p) => p[0]))); x <= Math.max(...points.map((p) => p[0])); x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]!;
        const [xj, yj] = points[j]!;
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) continue;
      const t = (y - top) / tall;
      this.put(x, y, m.tones[flat >= 0 ? flat : t < 0.22 ? 0 : t < 0.6 ? 1 : t < 0.85 ? 2 : 3]!, part, mi);
    }
    return part;
  }
  /** A mark in one flat colour: an eye, a nostril. Round. It does not count as a shape of its own. */
  spot(cx: number, cy: number, rx: number, ry: number, c: Rgb) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1 || x < 0 || y < 0 || x >= this.w || y >= this.h || !this.part[y * this.w + x]) continue;
      this.rgb.set(c, (y * this.w + x) * 3);
    }
  }
  /** A stroke of colour that only shows on one shape (or, with 0, on any): a stripe on a head, a seam on a tunic. */
  mark(x1: number, y1: number, x2: number, y2: number, c: Rgb, on: number, thick = 1) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2 || 1;
    for (let n = 0; n <= steps; n++) for (let ty = 0; ty < thick; ty++) for (let tx = 0; tx < thick; tx++) {
      const x = Math.round(x1 + ((x2 - x1) * n) / steps) + tx;
      const y = Math.round(y1 + ((y2 - y1) * n) / steps) + ty;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || (on > 0 ? this.part[y * this.w + x] !== on : !this.part[y * this.w + x])) continue;
      this.rgb.set(c, (y * this.w + x) * 3);
    }
  }
  /** The finished picture: where one shape lies over another the one under is shaded along the join, and a dark line goes round the whole. */
  done(): Sprite {
    const { w, h } = this;
    const out = blank(w, h);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : this.part[y * w + x]!);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = this.part[i]!;
      if (p) {
        // Under the edge of a shape drawn later, to the right or below: its shadow.
        const over = Math.max(at(x + 1, y), at(x, y + 1));
        const c: Rgb = over > p ? this.mats[this.of[i]!]!.tones[3] : [this.rgb[i * 3]!, this.rgb[i * 3 + 1]!, this.rgb[i * 3 + 2]!];
        out.data.set([c[0], c[1], c[2], 255], i * 4);
        continue;
      }
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const n = at(x + dx, y + dy);
        if (!n) continue;
        const line = this.mats[this.of[(y + dy) * w + x + dx]!]!.line;
        out.data.set([line[0], line[1], line[2], 255], i * 4);
        break;
      }
    }
    return out;
  }
}
