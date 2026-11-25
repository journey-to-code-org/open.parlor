// A small painter for the pictures a list of boxes can't make: a golf hole's shapes, a hillside, a
// drawing. Filled polygons, circles and thick lines on an RGB picture, written out as a PNG with
// nothing but zlib. Words are never painted here: the television draws those itself, over the top.
import { crc32, deflateSync } from "node:zlib";

export type RGB = [number, number, number];

/** "0xRRGGBBAA" or "#rrggbb" as RGB. */
export function rgb(c: string): RGB {
  const hex = c.startsWith("0x") ? c.slice(2, 8) : c.replace("#", "").slice(0, 6);
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Picture {
  readonly px: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    fill: RGB = [0, 0, 0],
  ) {
    this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) this.px.set(fill, i * 3);
  }

  private span(y: number, x1: number, x2: number, c: RGB, a = 1) {
    if (y < 0 || y >= this.h) return;
    const from = Math.max(0, Math.ceil(x1));
    const to = Math.min(this.w - 1, Math.floor(x2));
    for (let x = from; x <= to; x++) {
      const i = (y * this.w + x) * 3;
      if (a >= 1) this.px.set(c, i);
      else for (let k = 0; k < 3; k++) this.px[i + k] = Math.round(this.px[i + k]! * (1 - a) + c[k]! * a);
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(this.h, Math.round(y + h)); yy++) this.span(yy, x, x + w - 1, c);
  }

  circle(cx: number, cy: number, r: number, c: RGB, a = 1) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y + 0.5 - cy;
      if (Math.abs(dy) > r) continue;
      const dx = Math.sqrt(r * r - dy * dy);
      this.span(y, cx - dx, cx + dx - 0.5, c, a);
    }
  }

  /** A filled polygon, even-odd. */
  polygon(points: [number, number][], c: RGB, a = 1) {
    if (points.length < 3) return;
    const ys = points.map((p) => p[1]);
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]!;
        const [x2, y2] = points[(i + 1) % points.length]!;
        if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) xs.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) this.span(y, xs[i]!, xs[i + 1]! - 0.5, c, a);
    }
  }

  /** A line `width` thick with round ends. */
  line(x1: number, y1: number, x2: number, y2: number, width: number, c: RGB) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const r = width / 2;
    if (len > 0) {
      const nx = (-dy / len) * r;
      const ny = (dx / len) * r;
      this.polygon([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], c);
    }
    this.circle(x1, y1, r, c);
    this.circle(x2, y2, r, c);
  }

  png(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      raw.set(this.px.subarray(y * this.w * 3, (y + 1) * this.w * 3), y * (this.w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2; // RGB
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
  }
}

function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
