// A painted grid: one piece a square, row by row. Shared by Mini Golf holes and bowling lanes.

export interface Grid {
  cols: number;
  rows: number;
  cells: string;
}

export const at = (h: Grid, c: number, r: number) => (c < 0 || r < 0 || c >= h.cols || r >= h.rows ? "." : h.cells[r * h.cols + c]!);

/** Rectangles that cover exactly the squares where `on` holds, as few as a simple sweep finds. */
export function rectangles(h: Grid, on: (piece: string) => boolean): [number, number, number, number][] {
  const used = new Set<number>();
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < h.rows; r++)
    for (let c = 0; c < h.cols; c++) {
      if (used.has(r * h.cols + c) || !on(at(h, c, r))) continue;
      let w = 1;
      while (c + w < h.cols && on(at(h, c + w, r)) && !used.has(r * h.cols + c + w)) w++;
      let d = 1;
      while (r + d < h.rows && Array.from({ length: w }, (_, i) => on(at(h, c + i, r + d)) && !used.has((r + d) * h.cols + c + i)).every(Boolean)) d++;
      for (let y = r; y < r + d; y++) for (let x = c; x < c + w; x++) used.add(y * h.cols + x);
      out.push([c, r, w, d]);
    }
  return out;
}

