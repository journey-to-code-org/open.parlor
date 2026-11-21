// The road Tower of Ryan draws. The game's road is a line of square cells, and the creeps walk
// that line. What is painted can bend through the corners and wander a little, so it reads as a
// track worn into the grass rather than a row of blocks. `bend` is 0 to 100: 0 stays on the
// corners, 100 rounds them off and lets the edges drift.

export interface RoadInk {
  shoulder: string;
  dirt: string;
  crown: string;
  rut: string;
  stone: string;
  grass: string;
}

function hash(x: number, y: number): number {
  let n = Math.imul(Math.round(x), 374761393) ^ Math.imul(Math.round(y), 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

interface Pt {
  x: number;
  y: number;
}

/** Points to stroke, already bent. The first and last stay put, so the cave and the gate still meet it. */
export function roadCenterline(points: readonly (readonly [number, number])[], cell: number, bend: number): [number, number][] {
  const pts: Pt[] = points.map(([x, y]) => ({ x, y }));
  if (pts.length < 2) return pts.map((p) => [p.x, p.y]);
  const t = Math.min(1, Math.max(0, bend / 100));
  const radius = cell * (0.08 + 0.5 * t);
  const wander = cell * 0.07 * t;
  const out: Pt[] = [];
  const add = (x: number, y: number, drift: boolean) => {
    if (drift && wander > 0) {
      const prev = out[out.length - 1];
      if (prev) {
        const dx = x - prev.x;
        const dy = y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const n = (hash(x, y) - 0.5) * 2 * wander;
        x += (-dy / len) * n;
        y += (dx / len) * n;
      }
    }
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 0.4) return;
    out.push({ x, y });
  };

  add(pts[0]!.x, pts[0]!.y, false);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    const ux = (b.x - a.x) / (ab || 1);
    const uy = (b.y - a.y) / (ab || 1);
    const vx = (c.x - b.x) / (bc || 1);
    const vy = (c.y - b.y) / (bc || 1);
    const turning = ux * vx + uy * vy < 0.92;
    const r = Math.min(radius, ab * 0.46, bc * 0.46);
    if (!turning || r < 1) {
      add(b.x, b.y, true);
      continue;
    }
    const p0x = b.x - ux * r;
    const p0y = b.y - uy * r;
    const p2x = b.x + vx * r;
    const p2y = b.y + vy * r;
    add(p0x, p0y, true);
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const k = 1 - u;
      add(k * k * p0x + 2 * k * u * b.x + u * u * p2x, k * k * p0y + 2 * k * u * b.y + u * u * p2y, false);
    }
  }
  add(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y, false);
  return out.map((p) => [p.x, p.y]);
}

function normals(line: readonly (readonly [number, number])[]): [number, number][] {
  return line.map((p, i) => {
    const prev = line[Math.max(0, i - 1)]!;
    const next = line[Math.min(line.length - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
}

/** How wide the road is here, a little fatter and thinner along its length. */
function widthAt(x: number, y: number, half: number, cell: number): number {
  const step = Math.max(1, cell * 0.5);
  return half * (0.9 + 0.22 * hash(Math.round(x / step), Math.round(y / step)));
}

function fillRibbon(g: CanvasRenderingContext2D, line: readonly (readonly [number, number])[], half: number, cell: number, colour: string) {
  if (line.length < 2) return;
  const n = normals(line);
  g.beginPath();
  line.forEach((p, i) => {
    const w = widthAt(p[0], p[1], half, cell);
    const x = p[0] + n[i]![0] * w;
    const y = p[1] + n[i]![1] * w;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  for (let i = line.length - 1; i >= 0; i--) {
    const p = line[i]!;
    const w = widthAt(p[0], p[1], half, cell);
    g.lineTo(p[0] - n[i]![0] * w, p[1] - n[i]![1] * w);
  }
  g.closePath();
  g.fillStyle = colour;
  g.fill();
}

function strokeOffset(g: CanvasRenderingContext2D, line: readonly (readonly [number, number])[], off: number, colour: string, width: number) {
  const n = normals(line);
  g.beginPath();
  line.forEach((p, i) => {
    const x = p[0] + n[i]![0] * off;
    const y = p[1] + n[i]![1] * off;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.setLineDash([width * 7, width * 5]);
  g.stroke();
  g.setLineDash([]);
}

/** Stones and tufts of grass along the edges, so the shoulder isn't a ruled line. */
function dress(g: CanvasRenderingContext2D, line: readonly (readonly [number, number])[], half: number, cell: number, colour: RoadInk) {
  const n = normals(line);
  const end = Math.max(2, Math.floor(line.length * 0.06));
  for (let i = end; i < line.length - end; i += 2) {
    const p = line[i]!;
    const h = hash(p[0], p[1] + 3);
    if (h < 0.62) continue;
    const side = h < 0.8 ? 1 : -1;
    const nx = n[i]![0] * side;
    const ny = n[i]![1] * side;
    const edge = widthAt(p[0], p[1], half, cell) * 1.05;
    const x = p[0] + nx * edge;
    const y = p[1] + ny * edge;
    if (h > 0.86) {
      g.fillStyle = colour.stone;
      g.beginPath();
      g.ellipse(x, y, cell * 0.035, cell * 0.022, h * 6, 0, Math.PI * 2);
      g.fill();
    } else {
      g.strokeStyle = colour.grass;
      g.lineWidth = Math.max(1, cell * 0.012);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + nx * cell * 0.06, y + ny * cell * 0.06 - cell * 0.02);
      g.stroke();
    }
  }
}

/** Paint the road: a dark shoulder, the dirt, a lighter crown, two ruts, and the rough edge. */
export function paintRoad(g: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], cell: number, bend: number, ink: RoadInk): void {
  const line = roadCenterline(points, cell, bend);
  if (line.length < 2) return;
  g.lineCap = "round";
  g.lineJoin = "round";
  const t = Math.min(1, Math.max(0, bend / 100));
  const half = cell * (0.4 + 0.05 * t);
  fillRibbon(g, line, half * 1.14, cell, ink.shoulder);
  fillRibbon(g, line, half * 0.9, cell, ink.dirt);
  fillRibbon(g, line, half * 0.46, cell, ink.crown);
  const rut = Math.max(1.5, cell * 0.028);
  strokeOffset(g, line, cell * 0.13, ink.rut, rut);
  strokeOffset(g, line, -cell * 0.13, ink.rut, rut);
  if (t > 0.15) dress(g, line, half, cell, ink);
}
