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

/** A sprite from rows of letters, lit and shaded. `swap` trades letters for others first: the same drawing in other colours. */
export function sprite(rows: readonly string[], swap: Record<string, string> = {}): Sprite {
  return polished(flat(rows, swap));
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

/** The screen: somewhere to draw. */
export class Screen {
  readonly data: Uint8ClampedArray;
  constructor(readonly w = RETRO_W, readonly h = RETRO_H) {
    this.data = new Uint8ClampedArray(w * h * 4);
    this.fill([0, 0, 0]);
  }
  fill(c: Rgb) {
    for (let i = 0; i < this.data.length; i += 4) { this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255; }
  }
  dot(x: number, y: number, c: Rgb) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (Math.floor(y) * this.w + Math.floor(x)) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: Rgb) {
    for (let py = Math.max(0, y); py < Math.min(this.h, y + h); py++) for (let px = Math.max(0, x); px < Math.min(this.w, x + w); px++) {
      const i = (py * this.w + px) * 4;
      this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
    }
  }
  /** Darken what is there: 256 leaves it, 0 is black. */
  shade(x: number, y: number, w: number, h: number, keep: number) {
    for (let py = Math.max(0, y); py < Math.min(this.h, y + h); py++) for (let px = Math.max(0, x); px < Math.min(this.w, x + w); px++) {
      const i = (py * this.w + px) * 4;
      this.data[i] = (this.data[i]! * keep) >> 8; this.data[i + 1] = (this.data[i + 1]! * keep) >> 8; this.data[i + 2] = (this.data[i + 2]! * keep) >> 8;
    }
  }
  /** A filled round spot. */
  disc(cx: number, cy: number, r: number, c: Rgb) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.dot(cx + x, cy + y, c);
  }
  /** The shadow something casts on the ground: a flat oval, darker. */
  shadow(cx: number, cy: number, rx: number) {
    for (let y = -2; y <= 2; y++) {
      const half = Math.round(rx * Math.sqrt(1 - (y * y) / 6.5));
      this.shade(Math.round(cx) - half, Math.round(cy) + y, half * 2, 1, 168);
    }
  }
  blit(s: Sprite, x: number, y: number, o: BlitOptions = {}) {
    x = Math.round(x);
    y = Math.round(y);
    const cx = o.clip?.x ?? 0;
    const cy = o.clip?.y ?? 0;
    const cw = o.clip ? o.clip.x + o.clip.w : this.w;
    const ch = o.clip ? o.clip.y + o.clip.h : this.h;
    for (let sy = 0; sy < s.h; sy++) {
      const py = y + sy;
      if (py < cy || py >= ch) continue;
      for (let sx = 0; sx < s.w; sx++) {
        const px = x + sx;
        if (px < cx || px >= cw) continue;
        const from = (sy * s.w + (o.flip ? s.w - 1 - sx : sx)) * 4;
        if (!s.data[from + 3] || (o.thin && (px + py) % 2)) continue;
        const to = (py * this.w + px) * 4;
        this.data[to] = o.flash ? o.flash[0] : s.data[from]!;
        this.data[to + 1] = o.flash ? o.flash[1] : s.data[from + 1]!;
        this.data[to + 2] = o.flash ? o.flash[2] : s.data[from + 2]!;
      }
    }
  }
  /** Words, in the font below. Returns how wide they came out. `to` fades the letters from their colour at the top to another at the bottom. */
  text(words: string, x: number, y: number, c: Rgb, shadow: Rgb | null = [11, 11, 20], size = 1, to: Rgb | null = null): number {
    let at = x;
    for (const letter of words.toUpperCase()) {
      const rows = FONT[letter] ?? FONT["?"]!;
      for (let pass = shadow ? 0 : 1; pass < 2; pass++) for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
        if (!(rows[gy]! & (16 >> gx))) continue;
        const off = pass === 0 ? size : 0;
        this.rect(at + gx * size + off, y + gy * size + off, size, size, pass === 0 ? shadow! : to ? [c[0] + ((to[0] - c[0]) * gy) / 6, c[1] + ((to[1] - c[1]) * gy) / 6, c[2] + ((to[2] - c[2]) * gy) / 6] : c);
      }
      at += 6 * size;
    }
    return at - x;
  }
  /** Lay a colour over what is there: 0 leaves it, 256 covers it. The see-through layers a Super Nintendo was proud of. */
  tint(x: number, y: number, w: number, h: number, c: Rgb, much: number) {
    for (let py = Math.max(0, y); py < Math.min(this.h, y + h); py++) for (let px = Math.max(0, x); px < Math.min(this.w, x + w); px++) {
      const i = (py * this.w + px) * 4;
      this.data[i] = this.data[i]! + (((c[0] - this.data[i]!) * much) >> 8);
      this.data[i + 1] = this.data[i + 1]! + (((c[1] - this.data[i + 1]!) * much) >> 8);
      this.data[i + 2] = this.data[i + 2]! + (((c[2] - this.data[i + 2]!) * much) >> 8);
    }
  }
  /** A box for words to go in: rounded, a pale line round it, and a fill that deepens from top to bottom. */
  panel(x: number, y: number, w: number, h: number, fill: Rgb = [40, 56, 150], edge: Rgb = [232, 236, 248], deep: Rgb = [fill[0] * 0.35, fill[1] * 0.35, fill[2] * 0.45]) {
    const round = (px: number, py: number, inset: number) => (px === x + inset || px === x + w - 1 - inset) && (py === y + inset || py === y + h - 1 - inset);
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      if (round(px, py, 0)) continue;
      const rim = px === x || py === y || px === x + w - 1 || py === y + h - 1;
      const line = !rim && (px === x + 1 || py === y + 1 || px === x + w - 2 || py === y + h - 2 || round(px, py, 2));
      const t = (py - y) / Math.max(1, h - 1);
      this.dot(px, py, rim ? [11, 11, 20] : line ? (py > y + h / 2 ? [edge[0] * 0.72, edge[1] * 0.72, edge[2] * 0.8] : edge) : [fill[0] + (deep[0] - fill[0]) * t, fill[1] + (deep[1] - fill[1]) * t, fill[2] + (deep[2] - fill[2]) * t]);
    }
  }
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
