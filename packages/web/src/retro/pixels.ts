// The parlor's sixteen-bit screen: a small picture kept as plain numbers (256 by 224, what a Super
// Nintendo drew), sprites made of letters, and a font of five-by-seven dots. Nothing here touches
// the page: a frame is drawn into an array, pixel by pixel, the way the old machines did it, and
// whoever owns a canvas copies it up whole and lets the browser make the pixels big and square.
// That also means a frame can be drawn (and looked at) where there is no browser at all.
//
// A sprite is written as rows of letters, one letter a pixel, and each letter is a colour of the
// one palette below. Keeping to one palette is most of what makes a screen look of a piece.

export const RETRO_W = 256;
export const RETRO_H = 224;
/**
 * How many real pixels there are to one of those, each way. Things are placed on the 256 by 224
 * screen, as a Super Nintendo game places them, but drawn at twice that (its high-resolution mode,
 * 512 by 448), so a tile is 32 pixels across and a curve has room to be a curve.
 */
export const RETRO_ZOOM = 2;

/** The palette: every colour a hand-drawn sprite may use, by its letter. A dot is nothing at all. */
export const PALETTE: Record<string, string> = {
  "0": "#0b0b14", "1": "#ffffff", "2": "#c8ccd8", "3": "#8a90a4", "4": "#545a70", "5": "#2e3248",
  a: "#f8e8d0", b: "#e8c090", c: "#b88050", d: "#7a4a2c", e: "#4a2a1c",
  r: "#ff5a5a", R: "#c8283c", q: "#7a1428",
  o: "#ffa030", y: "#ffe060", Y: "#c89818",
  g: "#a8e060", G: "#58b838", h: "#2e8030", H: "#1a5028",
  u: "#8cd8ff", U: "#3c90e8", v: "#2850b0", V: "#182c68",
  p: "#d090ff", P: "#8848c8", m: "#4c2480",
  t: "#60e0c8", T: "#208878",
  s: "#f0d890", S: "#d0a858", n: "#a07838",
  k: "#ff9ad0",
};

export type Rgb = [r: number, g: number, b: number];
export const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const COLOURS: Record<string, Rgb> = Object.fromEntries(Object.entries(PALETTE).map(([k, hex]) => [k, rgb(hex)]));
export const ink = (letter: string): Rgb => COLOURS[letter] ?? [255, 0, 255];

/** A picture: its size and its pixels, four numbers each (red, green, blue, and whether it is there). */
export interface Sprite {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}
export const blank = (w: number, h: number): Sprite => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });

/**
 * What makes a drawing in four flat colours look sixteen-bit: light and shade. Every patch of
 * colour is lit along its top and left edges and darkened along its bottom and right, and the
 * black line round the outside takes on a dark shade of whatever it is the edge of, so a green
 * thing has a deep green edge and not a black one. Dark marks inside a drawing (an eye, a stripe)
 * are left alone.
 */
export function polished(s: Sprite): Sprite {
  const { w, h } = s;
  const out: Sprite = { w, h, data: s.data.slice() };
  const there = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && s.data[(y * w + x) * 4 + 3]! > 0;
  const line = (x: number, y: number) => { const i = (y * w + x) * 4; return s.data[i] === 11 && s.data[i + 1] === 11 && s.data[i + 2] === 20; };
  // 0 nothing, 1 the line round the outside, 2 colour (and dark marks inside, which count as colour).
  const kind = (x: number, y: number): number => {
    if (!there(x, y)) return 0;
    if (!line(x, y)) return 2;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!there(x + dx, y + dy)) return 1;
    return 2;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = kind(x, y);
    const i = (y * w + x) * 4;
    if (k === 2 && !line(x, y)) {
      const lit = kind(x, y - 1) !== 2 || kind(x - 1, y) !== 2;
      const dim = kind(x, y + 1) !== 2 || kind(x + 1, y) !== 2;
      const near = !lit && !dim && (kind(x + 1, y + 1) !== 2 || kind(x, y + 2) !== 2 || kind(x + 2, y) !== 2);
      for (let c = 0; c < 3; c++) {
        const v = s.data[i + c]!;
        out.data[i + c] = lit && !dim ? v + (255 - v) * 0.24 : dim && !lit ? v * 0.74 : near ? v * 0.88 : v;
      }
    } else if (k === 1) {
      let n = 0;
      const sum = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (kind(x + dx, y + dy) === 2 && !line(x + dx, y + dy)) { n++; for (let c = 0; c < 3; c++) sum[c]! += s.data[((y + dy) * w + x + dx) * 4 + c]!; }
      if (!n) continue;
      const top = !there(x, y - 1) || !there(x - 1, y);
      for (let c = 0; c < 3; c++) out.data[i + c] = (sum[c]! / n) * (top ? 0.42 : 0.28);
    }
  }
  return out;
}

/**
 * A sprite from rows of letters, at the screen's fine size: made twice as big with its staircases
 * smoothed, then lit and shaded. `swap` trades letters for others first: the same drawing in other
 * colours.
 */
export function sprite(rows: readonly string[], swap: Record<string, string> = {}): Sprite {
  return polished(smoothed(flat(rows, swap)));
}
/** A sprite exactly as its letters say, with no light or shade added. */
export function flat(rows: readonly string[], swap: Record<string, string> = {}): Sprite {
  const w = Math.max(...rows.map((row) => row.length));
  const out = blank(w, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const letter = swap[row[x]!] ?? row[x]!;
      if (letter === "." || letter === " ") continue;
      const [r, g, b] = ink(letter);
      out.data.set([r, g, b, 255], (y * w + x) * 4);
    }
  });
  return out;
}
/** Rows that are the left half of something the same on both sides, made whole. */
export const mirrored = (rows: readonly string[]): string[] => rows.map((row) => row + [...row].reverse().join(""));

export function flipped(s: Sprite): Sprite {
  const out = blank(s.w, s.h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) out.data.set(s.data.subarray((y * s.w + x) * 4, (y * s.w + x) * 4 + 4), (y * s.w + (s.w - 1 - x)) * 4);
  return out;
}
/** Turned a quarter of the way round, clockwise, as many times as asked. */
export function turned(s: Sprite, quarters: number): Sprite {
  let now = s;
  for (let n = ((quarters % 4) + 4) % 4; n > 0; n--) {
    const out = blank(now.h, now.w);
    for (let y = 0; y < now.h; y++) for (let x = 0; x < now.w; x++) out.data.set(now.data.subarray((y * now.w + x) * 4, (y * now.w + x) * 4 + 4), (x * out.w + (now.h - 1 - y)) * 4);
    now = out;
  }
  return now;
}
/** The same picture with everything above its feet a pixel lower: the second frame of something that bobs as it goes. */
export function bobbed(s: Sprite, feet = 2): Sprite {
  const out = blank(s.w, s.h);
  for (let y = 0; y < s.h; y++) {
    const from = y >= s.h - feet ? y : y - 1;
    if (from >= 0) out.data.set(s.data.subarray(from * s.w * 4, (from + 1) * s.w * 4), y * s.w * 4);
  }
  return out;
}
/** Each pixel made a square of them. */
export function scaled(s: Sprite, by: number): Sprite {
  const out = blank(s.w * by, s.h * by);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.data.set(s.data.subarray((Math.floor(y / by) * s.w + Math.floor(x / by)) * 4, (Math.floor(y / by) * s.w + Math.floor(x / by)) * 4 + 4), (y * out.w + x) * 4);
  return out;
}

/**
 * Twice the size, with the corners taken off the staircases: where two neighbours of a pixel agree
 * and the others do not, the corner between them takes their colour. A drawing made at half size
 * comes out with slopes instead of steps.
 */
export function smoothed(s: Sprite): Sprite {
  const out = blank(s.w * 2, s.h * 2);
  const at = (x: number, y: number) => { x = Math.min(s.w - 1, Math.max(0, x)); y = Math.min(s.h - 1, Math.max(0, y)); const i = (y * s.w + x) * 4; return ((s.data[i]! << 24) | (s.data[i + 1]! << 16) | (s.data[i + 2]! << 8) | s.data[i + 3]!) >>> 0; };
  const put = (x: number, y: number, c: number) => out.data.set([c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255], (y * out.w + x) * 4);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const p = at(x, y);
    const a = at(x, y - 1);
    const b = at(x + 1, y);
    const c = at(x - 1, y);
    const d = at(x, y + 1);
    put(x * 2, y * 2, c === a && c !== d && a !== b ? a : p);
    put(x * 2 + 1, y * 2, a === b && a !== c && b !== d ? b : p);
    put(x * 2, y * 2 + 1, d === c && d !== b && c !== a ? c : p);
    put(x * 2 + 1, y * 2 + 1, b === d && b !== a && d !== c ? d : p);
  }
  return out;
}

/** A number from two places and a seed, the same every time: where the tufts of grass go. */
export function speck(x: number, y: number, seed: number): number {
  let n = (Math.imul(x + 37, 0x9e3779b1) ^ Math.imul(y + 101, 0x85ebca6b) ^ Math.imul(seed + 7, 0xc2b2ae35)) >>> 0;
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d) >>> 0;
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39) >>> 0;
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export interface BlitOptions {
  flip?: boolean;
  /** Every pixel in one colour: the white flash of something hit. */
  flash?: Rgb;
  /** Only every other pixel, like a thing half there. */
  thin?: boolean;
  /** Only the part of the picture inside these edges of the screen. */
  clip?: { x: number; y: number; w: number; h: number };
}

/**
 * The screen: somewhere to draw. Everything is placed in the screen's own measure (256 by 224) and
 * drawn `zoom` times finer: a rectangle or a line of words is that many times bigger in real
 * pixels, a round spot is properly round, and a sprite, which is drawn at the fine size already,
 * is only put where it is told. `raw` and `pw` by `ph` are the real pixels, for what works on them.
 */
export class Screen {
  readonly data: Uint8ClampedArray;
  readonly pw: number;
  readonly ph: number;
  constructor(readonly w = RETRO_W, readonly h = RETRO_H, readonly zoom = RETRO_ZOOM) {
    this.pw = w * zoom;
    this.ph = h * zoom;
    this.data = new Uint8ClampedArray(this.pw * this.ph * 4);
    this.fill([0, 0, 0]);
  }
  fill(c: Rgb) {
    for (let i = 0; i < this.data.length; i += 4) { this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255; }
  }
  /** One real pixel. */
  pdot(px: number, py: number, c: Rgb) {
    if (px < 0 || py < 0 || px >= this.pw || py >= this.ph) return;
    const i = (Math.floor(py) * this.pw + Math.floor(px)) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
  }
  private each(x: number, y: number, w: number, h: number, to: (i: number) => void) {
    const z = this.zoom;
    const x0 = Math.max(0, Math.round(x * z));
    const y0 = Math.max(0, Math.round(y * z));
    const x1 = Math.min(this.pw, Math.round((x + w) * z));
    const y1 = Math.min(this.ph, Math.round((y + h) * z));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) to((py * this.pw + px) * 4);
  }
  dot(x: number, y: number, c: Rgb) {
    this.rect(Math.floor(x), Math.floor(y), 1, 1, c);
  }
  rect(x: number, y: number, w: number, h: number, c: Rgb) {
    this.each(x, y, w, h, (i) => { this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; });
  }
  /** Darken what is there: 256 leaves it, 0 is black. */
  shade(x: number, y: number, w: number, h: number, keep: number) {
    this.each(x, y, w, h, (i) => { this.data[i] = (this.data[i]! * keep) >> 8; this.data[i + 1] = (this.data[i + 1]! * keep) >> 8; this.data[i + 2] = (this.data[i + 2]! * keep) >> 8; });
  }
  /** Lay a colour over what is there: 0 leaves it, 256 covers it. The see-through layers a Super Nintendo was proud of. */
  tint(x: number, y: number, w: number, h: number, c: Rgb, much: number) {
    this.each(x, y, w, h, (i) => {
      this.data[i] = this.data[i]! + (((c[0] - this.data[i]!) * much) >> 8);
      this.data[i + 1] = this.data[i + 1]! + (((c[1] - this.data[i + 1]!) * much) >> 8);
      this.data[i + 2] = this.data[i + 2]! + (((c[2] - this.data[i + 2]!) * much) >> 8);
    });
  }
  /** A filled round spot. */
  disc(cx: number, cy: number, r: number, c: Rgb) {
    const z = this.zoom;
    const pr = r * z + z / 2;
    for (let y = -Math.ceil(pr); y <= pr; y++) for (let x = -Math.ceil(pr); x <= pr; x++) if (x * x + y * y <= pr * pr) this.pdot(cx * z + x, cy * z + y, c);
  }
  /** The shadow something casts on the ground: a flat oval, darker. */
  shadow(cx: number, cy: number, rx: number) {
    const z = this.zoom;
    const ry = 2.6 * z;
    for (let y = -Math.ceil(ry); y <= ry; y++) {
      const half = Math.round(rx * z * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      for (let x = -half; x < half; x++) {
        const px = Math.round(cx * z) + x;
        const py = Math.round(cy * z) + y;
        if (px < 0 || py < 0 || px >= this.pw || py >= this.ph) continue;
        const i = (py * this.pw + px) * 4;
        this.data[i] = (this.data[i]! * 168) >> 8; this.data[i + 1] = (this.data[i + 1]! * 168) >> 8; this.data[i + 2] = (this.data[i + 2]! * 176) >> 8;
      }
    }
  }
  blit(s: Sprite, x: number, y: number, o: BlitOptions = {}) {
    const z = this.zoom;
    x = Math.round(x * z);
    y = Math.round(y * z);
    const cx = (o.clip?.x ?? 0) * z;
    const cy = (o.clip?.y ?? 0) * z;
    const cw = o.clip ? (o.clip.x + o.clip.w) * z : this.pw;
    const ch = o.clip ? (o.clip.y + o.clip.h) * z : this.ph;
    for (let sy = 0; sy < s.h; sy++) {
      const py = y + sy;
      if (py < cy || py >= ch) continue;
      for (let sx = 0; sx < s.w; sx++) {
        const px = x + sx;
        if (px < cx || px >= cw) continue;
        const from = (sy * s.w + (o.flip ? s.w - 1 - sx : sx)) * 4;
        if (!s.data[from + 3] || (o.thin && (px + py) % 2)) continue;
        const to = (py * this.pw + px) * 4;
        this.data[to] = o.flash ? o.flash[0] : s.data[from]!;
        this.data[to + 1] = o.flash ? o.flash[1] : s.data[from + 1]!;
        this.data[to + 2] = o.flash ? o.flash[2] : s.data[from + 2]!;
      }
    }
  }
  /** Words, in the font below. Returns how wide they came out. `to` fades the letters from their colour at the top to another at the bottom. */
  text(words: string, x: number, y: number, c: Rgb, shadow: Rgb | null = [11, 11, 20], size = 1, to: Rgb | null = null): number {
    const z = this.zoom;
    let at = x;
    for (const letter of words.toUpperCase()) {
      const glyph = glyphOf(letter, z);
      const tall = 7 * z;
      const wide = 5 * z;
      for (let pass = shadow ? 0 : 1; pass < 2; pass++) for (let gy = 0; gy < tall; gy++) for (let gx = 0; gx < wide; gx++) {
        if (!glyph[gy * wide + gx]) continue;
        const off = pass === 0 ? size : 0;
        const t = gy / (tall - 1);
        const ink = pass === 0 ? shadow! : to ? ([c[0] + (to[0] - c[0]) * t, c[1] + (to[1] - c[1]) * t, c[2] + (to[2] - c[2]) * t] as Rgb) : c;
        for (let sy = 0; sy < size; sy++) for (let sx = 0; sx < size; sx++) this.pdot(at * z + gx * size + sx + off, y * z + gy * size + sy + off, ink);
      }
      at += 6 * size;
    }
    return at - x;
  }
  /** A box for words to go in: rounded, a pale line round it, and a fill that deepens from top to bottom. */
  panel(x: number, y: number, w: number, h: number, fill: Rgb = [40, 56, 150], edge: Rgb = [232, 236, 248], deep: Rgb = [fill[0] * 0.35, fill[1] * 0.35, fill[2] * 0.45]) {
    const z = this.zoom;
    x *= z; y *= z; w *= z; h *= z;
    // How far in from the nearest edge, with the corners rounded.
    const far = (px: number, py: number) => {
      const dx = Math.min(px - x, x + w - 1 - px);
      const dy = Math.min(py - y, y + h - 1 - py);
      const r = 2 * z;
      return dx < r && dy < r ? r - Math.sqrt((r - dx) * (r - dx) + (r - dy) * (r - dy)) : Math.min(dx, dy);
    };
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      const d = far(px, py);
      if (d < 0) continue;
      const t = (py - y) / Math.max(1, h - 1);
      this.pdot(px, py, d < 1 ? [11, 11, 20] : d < z + 1 ? (t > 0.5 ? [edge[0] * 0.7, edge[1] * 0.7, edge[2] * 0.8] : edge) : d < z + 2 ? [fill[0] * 0.3, fill[1] * 0.3, fill[2] * 0.4] : [fill[0] + (deep[0] - fill[0]) * t, fill[1] + (deep[1] - fill[1]) * t, fill[2] + (deep[2] - fill[2]) * t]);
    }
  }
}

const glyphs = new Map<string, Uint8Array>();
/** A letter's dots at a zoom: at 2, with the corners taken off its staircases, so an O is round. */
function glyphOf(letter: string, zoom: number): Uint8Array {
  const key = `${letter}:${zoom}`;
  let got = glyphs.get(key);
  if (got) return got;
  const rows = FONT[letter] ?? FONT["?"]!;
  let s = blank(5, 7);
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) if (rows[gy]! & (16 >> gx)) s.data.set([255, 255, 255, 255], (gy * 5 + gx) * 4);
  for (let z = zoom; z > 1; z >>= 1) s = smoothed(s);
  got = new Uint8Array(s.w * s.h);
  for (let i = 0; i < got.length; i++) got[i] = s.data[i * 4 + 3]! ? 1 : 0;
  glyphs.set(key, got);
  return got;
}

export const textWidth = (words: string, size = 1) => words.length * 6 * size - size;
/** Words broken into lines no longer than a width, at the spaces. */
export function wrapped(words: string, most: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words.split(" ")) {
    if (line && line.length + 1 + word.length > most) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Five dots across, seven down: each row is a number whose bits are its dots. */
const FONT: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11], B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e], C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e], E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f], F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f], H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11], I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c], K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11], N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11], O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10], Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d], R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e], T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04], U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04], W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11], X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04], Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e], "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e], "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e], "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02], "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e], "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08], "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c], ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08], "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04], "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0], "-": [0, 0, 0, 0x1f, 0, 0, 0], ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0], "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10], "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02], ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "·": [0, 0, 0, 0x04, 0, 0, 0], "×": [0, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0],
};
