// The Go board the rules and the computer player both stand on: stones in flat arrays, groups that
// know their own liberties as stones come and go, a hash of the position that changes with each
// stone (Zobrist), the count at the end, and the search (playouts and a tree over them).
//
// It is built to be fast before anything else, because the computer player plays whole games out
// to the end thousands of times a move, so it reads more like arithmetic than like the rest of
// the kit. go.ts is the game; nothing here knows about seats, rules presets or views.
//
// The board is kept with a border one point wide all round it (so a point's four neighbours are
// always there to look at, and the edge is just a colour nothing ever plays on). A "point" in this
// file is an index into that padded board; a "cell" is the kit's row-major index into the board
// itself, which is what states, moves and views use.
import { mulberry32 } from "@spades/rules";

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
const EDGE = 3;
/** A stone's colour: BLACK or WHITE. The other one is `3 - colour`. */
export type Stone = 1 | 2;

export interface GoGeometry {
  /** The board is n × n. */
  n: number;
  /** The padded board is w × w, w = n + 2. */
  w: number;
  size: number;
  /** The point of each cell. */
  at: Int16Array;
  /** The cell of each point; -1 for the border. */
  cell: Int16Array;
  /** Steps to the four neighbours, and to the four diagonal ones. */
  dirs: Int16Array;
  diags: Int16Array;
  /** How far each point is from the nearest edge, from 1 (the edge itself). */
  line: Uint8Array;
  /** The star points (where handicap stones go), as a flag per point. */
  star: Uint8Array;
  /** Two random 32-bit numbers for each (point, colour): the position's hash is every stone's, xored together. */
  zobHi: Int32Array;
  zobLo: Int32Array;
}

/** The lines the star points are on: the third on a small board, the fourth otherwise, and the middle. */
function starLines(n: number): number[] {
  const near = n < 13 ? 2 : 3;
  return [near, (n - 1) / 2, n - 1 - near];
}

/**
 * The nine star points of a board, as cells, in the order handicap stones are put down: two
 * opposite corners, the third and fourth corner, then the sides; the middle is used for 5, 7 and 9.
 */
export function starCells(n: number): { corners: number[]; sides: number[]; centre: number } {
  const [a, m, z] = starLines(n) as [number, number, number];
  const at = (r: number, c: number) => r * n + c;
  return { corners: [at(a, z), at(z, a), at(z, z), at(a, a)], sides: [at(m, a), at(m, z), at(a, m), at(z, m)], centre: at(m, m) };
}

/** Where `count` handicap stones go (2 to 9), as cells. */
export function handicapCells(n: number, count: number): number[] {
  const { corners, sides, centre } = starCells(n);
  const k = Math.max(0, Math.min(9, Math.floor(count)));
  if (k < 2) return [];
  if (k <= 4) return corners.slice(0, k);
  // An odd number takes the middle; the rest go on the corners and then the sides, in opposite pairs.
  const rest = [...corners, ...sides].slice(0, k - (k % 2));
  return k % 2 ? [...rest, centre] : rest;
}

/** The star points drawn on a board: all nine on the full board, the corners and the middle on the smaller ones. */
export function starPoints(n: number): number[] {
  const { corners, sides, centre } = starCells(n);
  return n >= 19 ? [...corners, ...sides, centre] : [...corners, centre];
}

const GEOMETRY = new Map<number, GoGeometry>();
export function goGeometry(n: number): GoGeometry {
  let g = GEOMETRY.get(n);
  if (g) return g;
  const w = n + 2;
  const size = w * w;
  const at = new Int16Array(n * n);
  const cell = new Int16Array(size).fill(-1);
  const line = new Uint8Array(size);
  const star = new Uint8Array(size);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = (r + 1) * w + c + 1;
      at[r * n + c] = p;
      cell[p] = r * n + c;
      line[p] = Math.min(r, c, n - 1 - r, n - 1 - c) + 1;
    }
  }
  const stars = starCells(n);
  for (const s of [...stars.corners, ...stars.sides, stars.centre]) star[at[s]!] = 1;
  // A fixed table, from a fixed seed: the same position has the same hash in every game, on every
  // machine, for ever (hashes are kept in saved games).
  const rand = mulberry32(0x60b0a2d ^ (n * 0x9e3779b1));
  const zobHi = new Int32Array(size * 2);
  const zobLo = new Int32Array(size * 2);
  for (let i = 0; i < size * 2; i++) {
    zobHi[i] = Math.floor(rand() * 4294967296) | 0;
    zobLo[i] = Math.floor(rand() * 4294967296) | 0;
  }
  g = { n, w, size, at, cell, line, star, dirs: Int16Array.of(-w, -1, 1, w), diags: Int16Array.of(-w - 1, -w + 1, w - 1, w + 1), zobHi, zobLo };
  GEOMETRY.set(n, g);
  return g;
}

/** A quick, seedable source of whole numbers for playouts (xorshift): a call to `Math.random` per stone would be most of the cost. */
export class GoDice {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0 || 0x2545f491;
  }
  /** A whole number from 0 up to (not including) `below`. */
  roll(below: number): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x;
    return (x >>> 0) % below;
  }
}

/**
 * A position. Stones of one colour that touch are a group: every stone knows its group (`head`),
 * the stones of a group are a ring (`next`), and the group keeps a count of its liberties, counted
 * once for every stone that touches each (so a liberty two stones share counts twice), with the
 * sum and the sum of squares of where they are. That is enough to tell at once when a group has
 * none (it is captured) or exactly one (it is in atari, and where), without ever walking it.
 */
export class GoBoard {
  readonly g: GoGeometry;
  readonly color: Uint8Array;
  private readonly head: Int16Array;
  private readonly next: Int16Array;
  private readonly libs: Int16Array;
  private readonly libSum: Int32Array;
  private readonly libSq: Int32Array;
  private readonly count: Int16Array;
  /** The empty points, in no order, and where each is in that list. */
  readonly empties: Int16Array;
  private readonly where: Int16Array;
  nEmpty = 0;
  /** The point that can't be played next because it would take back a ko; 0 for none. */
  ko = 0;
  /** The position's hash, in two halves. */
  hi = 0;
  lo = 0;
  /** Where the last stone went down; 0 for none, or after a pass. */
  last = 0;
  /** How many stones the last `play` took off (the other side's, or with suicide its own). */
  taken = 0;

  constructor(g: GoGeometry) {
    this.g = g;
    const { size } = g;
    this.color = new Uint8Array(size).fill(EDGE);
    this.head = new Int16Array(size);
    this.next = new Int16Array(size);
    this.libs = new Int16Array(size);
    this.libSum = new Int32Array(size);
    this.libSq = new Int32Array(size);
    this.count = new Int16Array(size);
    this.empties = new Int16Array(g.n * g.n);
    this.where = new Int16Array(size);
    for (let i = 0; i < g.at.length; i++) {
      const p = g.at[i]!;
      this.color[p] = EMPTY;
      this.where[p] = i;
      this.empties[i] = p;
    }
    this.nEmpty = g.at.length;
  }

  copyFrom(b: GoBoard): this {
    this.color.set(b.color);
    this.head.set(b.head);
    this.next.set(b.next);
    this.libs.set(b.libs);
    this.libSum.set(b.libSum);
    this.libSq.set(b.libSq);
    this.count.set(b.count);
    this.empties.set(b.empties);
    this.where.set(b.where);
    this.nEmpty = b.nEmpty;
    this.ko = b.ko;
    this.hi = b.hi;
    this.lo = b.lo;
    this.last = b.last;
    this.taken = b.taken;
    return this;
  }
  clone(): GoBoard {
    return new GoBoard(this.g).copyFrom(this);
  }

  /** The position's hash as one whole number (53 bits: as many as a number keeps exactly). */
  get hash(): number {
    return (this.hi >>> 11) * 4294967296 + (this.lo >>> 0);
  }
  /** What the hash would be with a stone of `c` added at `p` and nothing taken off. */
  hashWith(p: number, c: Stone): number {
    const z = p * 2 + c - 1;
    return ((this.hi ^ this.g.zobHi[z]!) >>> 11) * 4294967296 + ((this.lo ^ this.g.zobLo[z]!) >>> 0);
  }

  /** How many stones are in the group at `p` (a point with a stone on it). */
  groupSize(p: number): number {
    return this.count[this.head[p]!]!;
  }
  /** Whether the group at `p` has exactly one liberty left. */
  inAtari(p: number): boolean {
    const h = this.head[p]!;
    const l = this.libs[h]!;
    return l > 0 && l * this.libSq[h]! === this.libSum[h]! * this.libSum[h]!;
  }
  /** The one liberty of a group in atari. */
  lastLiberty(p: number): number {
    const h = this.head[p]!;
    return this.libSum[h]! / this.libs[h]!;
  }
  /** Whether two points with stones on them are in the same group. */
  sameGroup(p: number, q: number): boolean {
    return this.head[p] === this.head[q];
  }
  /** The stones of the group at `p`, as points. */
  groupAt(p: number): number[] {
    const out = [p];
    for (let s = this.next[p]!; s !== p; s = this.next[s]!) out.push(s);
    return out;
  }

  private setStone(p: number, c: Stone) {
    const { zobHi, zobLo } = this.g;
    this.color[p] = c;
    const z = p * 2 + c - 1;
    this.hi ^= zobHi[z]!;
    this.lo ^= zobLo[z]!;
    // Off the list of empty points: the last one takes its place.
    const i = this.where[p]!;
    const moved = this.empties[--this.nEmpty]!;
    this.empties[i] = moved;
    this.where[moved] = i;
  }

  /** How many of `p`'s four neighbours are stones of the group headed `h`. */
  private touches(p: number, h: number): number {
    const { dirs } = this.g;
    let k = 0;
    for (let d = 0; d < 4; d++) {
      const q = p + dirs[d]!;
      const cq = this.color[q]!;
      if ((cq === BLACK || cq === WHITE) && this.head[q] === h) k++;
    }
    return k;
  }

  /** Put a stone down and join it to its neighbours. Takes nothing off: `play` does that. */
  private place(p: number, c: Stone) {
    const { dirs } = this.g;
    this.setStone(p, c);
    this.head[p] = p;
    this.next[p] = p;
    this.count[p] = 1;
    this.libs[p] = 0;
    this.libSum[p] = 0;
    this.libSq[p] = 0;
    for (let d = 0; d < 4; d++) {
      const q = p + dirs[d]!;
      const cq = this.color[q]!;
      if (cq === EDGE) continue;
      if (cq === EMPTY) {
        const me = this.head[p]!;
        this.libs[me]!++;
        this.libSum[me]! += q;
        this.libSq[me]! += q * q;
        continue;
      }
      // A stone beside it has lost this liberty.
      const h = this.head[q]!;
      this.libs[h]!--;
      this.libSum[h]! -= p;
      this.libSq[h]! -= p * p;
      if (cq === c && h !== this.head[p]) this.merge(this.head[p]!, h);
    }
  }

  /** Two groups of one colour become one: the smaller takes the larger's name. */
  private merge(a: number, b: number) {
    if (this.count[a]! < this.count[b]!) [a, b] = [b, a];
    let s = b;
    do {
      this.head[s] = a;
      s = this.next[s]!;
    } while (s !== b);
    // Two rings cut and joined to each other are one ring.
    const t = this.next[a]!;
    this.next[a] = this.next[b]!;
    this.next[b] = t;
    this.count[a]! += this.count[b]!;
    this.libs[a]! += this.libs[b]!;
    this.libSum[a]! += this.libSum[b]!;
    this.libSq[a]! += this.libSq[b]!;
  }

  /** Take the group at `p` off the board. Returns how many stones that was, and remembers one of them in `lifted`. */
  private lifted = 0;
  private remove(p: number): number {
    const { dirs, zobHi, zobLo } = this.g;
    const c = this.color[p]!;
    let n = 0;
    let s = p;
    do {
      const after = this.next[s]!;
      this.color[s] = EMPTY;
      const z = s * 2 + c - 1;
      this.hi ^= zobHi[z]!;
      this.lo ^= zobLo[z]!;
      this.where[s] = this.nEmpty;
      this.empties[this.nEmpty++] = s;
      n++;
      // Every stone left standing beside it has a liberty back. (Stones of the group being lifted
      // get one too; they are gone by the time anyone looks.)
      for (let d = 0; d < 4; d++) {
        const q = s + dirs[d]!;
        const cq = this.color[q]!;
        if (cq !== BLACK && cq !== WHITE) continue;
        const h = this.head[q]!;
        this.libs[h]!++;
        this.libSum[h]! += s;
        this.libSq[h]! += s * s;
      }
      s = after;
    } while (s !== p);
    this.lifted = p;
    return n;
  }

  /** Set a stone on the board with no questions asked: for building a position from a saved one. */
  put(p: number, c: Stone) {
    this.place(p, c);
  }

  /**
   * Whether `c` may play at `p` as far as the board alone can say: the point is empty, isn't the ko
   * point, and the stone would have a liberty (its own, a friend's, or one made by capturing).
   * Positions that may not be repeated are the game's business (go.ts keeps the history).
   */
  legal(p: number, c: Stone): boolean {
    if (this.color[p] !== EMPTY || p === this.ko) return false;
    const { dirs } = this.g;
    for (let d = 0; d < 4; d++) if (this.color[p + dirs[d]!] === EMPTY) return true;
    for (let d = 0; d < 4; d++) {
      const q = p + dirs[d]!;
      const cq = this.color[q]!;
      if (cq === EDGE) continue;
      const h = this.head[q]!;
      const k = this.touches(p, h);
      // A friend with a liberty somewhere else, or an enemy whose last liberty this is.
      if (cq === c ? this.libs[h]! > k : this.libs[h]! === k) return true;
    }
    return false;
  }

  /** Whether a stone of `c` at the empty point `p` would take anything off. */
  captures(p: number, c: Stone): boolean {
    const { dirs } = this.g;
    const them = 3 - c;
    for (let d = 0; d < 4; d++) {
      const q = p + dirs[d]!;
      if (this.color[q] !== them) continue;
      const h = this.head[q]!;
      if (this.libs[h]! === this.touches(p, h)) return true;
    }
    return false;
  }

  /**
   * Play a stone: it goes down, any of the other side's groups left without a liberty come off,
   * and then (only when `legal` would have said no: a table that allows suicide) its own group if
   * that has none. Sets `taken`, `ko` and `last`.
   */
  play(p: number, c: Stone) {
    const { dirs } = this.g;
    const them = 3 - c;
    this.place(p, c);
    let taken = 0;
    for (let d = 0; d < 4; d++) {
      const q = p + dirs[d]!;
      if (this.color[q] === them && this.libs[this.head[q]!] === 0) taken += this.remove(q);
    }
    const me = this.head[p]!;
    // Taking one stone with one stone that is then itself in atari on that very point: a ko.
    this.ko = taken === 1 && this.count[me] === 1 && this.libs[me] === 1 ? this.lifted : 0;
    if (taken === 0 && this.libs[me] === 0) taken = this.remove(p);
    this.taken = taken;
    this.last = this.color[p] === EMPTY ? 0 : p;
  }

  pass() {
    this.ko = 0;
    this.last = 0;
    this.taken = 0;
  }

  /**
   * Whether a stone of `c` at `p` would leave its own group with one liberty or none, taking
   * nothing: a stone thrown away, usually. Gives the size the group would be (0 when it's safe).
   */
  selfAtari(p: number, c: Stone): number {
    const { dirs } = this.g;
    let liberty = 0;
    let size = 1;
    let g0 = -1;
    let g1 = -1;
    let g2 = -1;
    for (let d = 0; d < 4; d++) {
      const q = p + dirs[d]!;
      const cq = this.color[q]!;
      if (cq === EDGE) continue;
      let found = 0;
      if (cq === EMPTY) found = q;
      else {
        const h = this.head[q]!;
        const k = this.touches(p, h);
        const l = this.libs[h]! - k;
        if (cq !== c) {
          if (l === 0) return 0; // it captures
          continue;
        }
        if (h !== g0 && h !== g1 && h !== g2) {
          size += this.count[h]!;
          if (g0 < 0) g0 = h;
          else if (g1 < 0) g1 = h;
          else g2 = h;
        }
        if (l === 0) continue;
        const sum = this.libSum[h]! - k * p;
        if (l * (this.libSq[h]! - k * p * p) !== sum * sum) return 0; // two liberties of its own elsewhere
        found = sum / l;
      }
      if (liberty === 0) liberty = found;
      else if (liberty !== found) return 0;
    }
    return size;
  }

  /**
   * Whether the empty point `p` is an eye of `c`'s: every neighbour is `c`'s, and the other side
   * doesn't hold enough of the corners to make it a false one. Nobody fills their own eyes.
   */
  isEye(p: number, c: Stone): boolean {
    const { dirs, diags } = this.g;
    let edge = false;
    for (let d = 0; d < 4; d++) {
      const cq = this.color[p + dirs[d]!]!;
      if (cq === EDGE) edge = true;
      else if (cq !== c) return false;
    }
    const them = 3 - c;
    let bad = 0;
    for (let d = 0; d < 4; d++) if (this.color[p + diags[d]!] === them) bad++;
    return edge ? bad === 0 : bad <= 1;
  }

  /**
   * The move a quick player makes: a capture or an escape by the stone just played if there is one,
   * and otherwise any point that isn't its own eye and doesn't throw three or more stones away.
   * 0 means pass.
   */
  quickMove(c: Stone, dice: GoDice): number {
    const { dirs } = this.g;
    const last = this.last;
    if (last) {
      // The stone just played can be taken: take it.
      if (this.inAtari(last)) {
        const l = this.lastLiberty(last);
        if (this.legal(l, c)) return l;
      }
      // It put one of mine in atari: run, if running gets anywhere.
      for (let d = 0; d < 4; d++) {
        const q = last + dirs[d]!;
        if (this.color[q] !== c || !this.inAtari(q)) continue;
        const l = this.lastLiberty(q);
        if (this.legal(l, c) && this.selfAtari(l, c) === 0) return l;
      }
    }
    const n = this.nEmpty;
    if (n === 0) return 0;
    const start = dice.roll(n);
    for (let k = 0; k < n; k++) {
      const p = this.empties[start + k < n ? start + k : start + k - n]!;
      if (p === this.ko || this.isEye(p, c) || !this.legal(p, c)) continue;
      if (this.selfAtari(p, c) >= 3) continue;
      return p;
    }
    return 0;
  }

  /**
   * Play the game out from here with quick moves until both sides pass. `first` (if given) notes
   * the colour that first played each point, for the search's "all moves as first" figures.
   */
  playOut(toMove: Stone, dice: GoDice, first?: Uint8Array) {
    let c = toMove;
    let passes = 0;
    // Captures can make a playout long; three boards' worth of moves is past any real game.
    for (let left = this.g.n * this.g.n * 3; left > 0 && passes < 2; left--) {
      const p = this.quickMove(c, dice);
      if (p === 0) {
        passes++;
        this.pass();
      } else {
        passes = 0;
        this.play(p, c);
        if (first && first[p] === 0) first[p] = c;
      }
      c = (3 - c) as Stone;
    }
  }

  /**
   * Black's points minus White's, counting the board as it stands (stones, and empty points only
   * one colour touches): right for a playout's last position, where everything that could be taken
   * has been. `owner`, if given, has each point added to it: +1 Black's, -1 White's.
   */
  areaMargin(owner?: Int32Array): number {
    const { at, dirs } = this.g;
    let margin = 0;
    for (let i = 0; i < at.length; i++) {
      const p = at[i]!;
      let c = this.color[p]!;
      if (c === EMPTY) {
        let black = false;
        let white = false;
        for (let d = 0; d < 4; d++) {
          const cq = this.color[p + dirs[d]!];
          if (cq === BLACK) black = true;
          else if (cq === WHITE) white = true;
        }
        c = black && !white ? BLACK : white && !black ? WHITE : EMPTY;
      }
      if (c === BLACK) {
        margin++;
        if (owner) owner[i]!++;
      } else if (c === WHITE) {
        margin--;
        if (owner) owner[i]!--;
      }
    }
    return margin;
  }
}

/** A board from its cells (0 empty, 1 black, 2 white), row by row. */
export function boardFromCells(n: number, cells: ArrayLike<number>): GoBoard {
  const g = goGeometry(n);
  const b = new GoBoard(g);
  // In any order: a group never has fewer liberties half built than it has in the finished position.
  for (let i = 0; i < cells.length; i++) if (cells[i] === BLACK || cells[i] === WHITE) b.put(g.at[i]!, cells[i] as Stone);
  return b;
}

// ---- The count ------------------------------------------------------------------------------------

export interface GoCount {
  /** Whose each cell is at the end: BLACK, WHITE or EMPTY for nobody's (a shared liberty, a point between the two). */
  owner: Uint8Array;
  /** Stones left standing, by colour (index BLACK and WHITE; index 0 unused). */
  stones: [number, number, number];
  /** Empty points (and points under dead stones) only that colour surrounds. */
  territory: [number, number, number];
  /** Stones of each colour marked dead and lifted off. */
  dead: [number, number, number];
}

/**
 * Count a finished position. Stones marked dead come off first; then every stretch of empty points
 * that touches stones of only one colour is that colour's. Stones that share liberties neither
 * dares fill (a seki) are simply left standing: they count as stones, and the points between them
 * are nobody's.
 */
export function countGo(n: number, cells: ArrayLike<number>, dead: Iterable<number> = []): GoCount {
  const board = Uint8Array.from(cells);
  const out: GoCount = { owner: new Uint8Array(n * n), stones: [0, 0, 0], territory: [0, 0, 0], dead: [0, 0, 0] };
  for (const cell of dead) {
    if (board[cell] === BLACK || board[cell] === WHITE) {
      out.dead[board[cell]!]!++;
      board[cell] = EMPTY;
    }
  }
  const seen = new Uint8Array(n * n);
  const stack: number[] = [];
  for (let start = 0; start < board.length; start++) {
    if (board[start] !== EMPTY) {
      out.owner[start] = board[start]!;
      out.stones[board[start]!]!++;
      continue;
    }
    if (seen[start]) continue;
    // One stretch of empty points, and the colours on its edge.
    const region: number[] = [];
    let touches = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const cell = stack.pop()!;
      region.push(cell);
      const r = Math.floor(cell / n);
      const c = cell % n;
      for (let d = 0; d < 4; d++) {
        const rr = r + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const cc = c + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const q = rr * n + cc;
        if (board[q] !== EMPTY) touches |= board[q]!;
        else if (!seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (touches === BLACK || touches === WHITE) {
      out.territory[touches]! += region.length;
      for (const cell of region) out.owner[cell] = touches;
    }
  }
  return out;
}

/** The stones of the group at `cell` (a cell with a stone on it), as cells. */
export function groupCells(n: number, cells: ArrayLike<number>, cell: number): number[] {
  const colour = cells[cell];
  const seen = new Set([cell]);
  const stack = [cell];
  while (stack.length) {
    const at = stack.pop()!;
    const r = Math.floor(at / n);
    const c = at % n;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as const) {
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const q = rr * n + cc;
      if (cells[q] === colour && !seen.has(q)) {
        seen.add(q);
        stack.push(q);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

// ---- Who owns what: an estimate -----------------------------------------------------------------

/**
 * Play the position out `playouts` times and say how each cell tends to end up: from +1 (always
 * Black's) to -1 (always White's). The dice come from `seed`, so the same position always gets the
 * same answer: the game uses this to propose which stones are dead, and that has to replay.
 */
export function estimateOwners(board: GoBoard, toMove: Stone, playouts: number, seed: number): Float32Array {
  const cells = board.g.at.length;
  const sum = new Int32Array(cells);
  const work = new GoBoard(board.g);
  const dice = new GoDice(seed);
  for (let i = 0; i < playouts; i++) {
    work.copyFrom(board);
    work.playOut(toMove, dice);
    work.areaMargin(sum);
  }
  const out = new Float32Array(cells);
  for (let i = 0; i < cells; i++) out[i] = playouts ? sum[i]! / playouts : 0;
  return out;
}

/**
 * The stones an estimate says are dead: every group whose points end up the other side's more
 * often than not, by a clear margin. A group nobody can say much about is left alive (the players
 * can mark it themselves).
 */
export function deadFromOwners(n: number, cells: ArrayLike<number>, owners: ArrayLike<number>, margin = 0.3): number[] {
  const dead: number[] = [];
  const done = new Uint8Array(n * n);
  for (let cell = 0; cell < n * n; cell++) {
    if (done[cell] || (cells[cell] !== BLACK && cells[cell] !== WHITE)) continue;
    const group = groupCells(n, cells, cell);
    const sign = cells[cell] === BLACK ? 1 : -1;
    let mean = 0;
    for (const s of group) {
      done[s] = 1;
      mean += owners[s]! * sign;
    }
    if (mean / group.length < -margin) dead.push(...group);
  }
  return dead.sort((a, b) => a - b);
}

// ---- The search -----------------------------------------------------------------------------------
// Monte Carlo tree search. Each turn of the handle is one game played to the end: down the tree by
// the moves that have done best so far (trying the others now and then), one new position added
// where the tree runs out, and from there a playout with quick moves. Whoever wins that game, every
// move on the way down hears about it. After enough of them the move that was tried most is the
// one to play.
//
// Two things make that work on a board with hundreds of moves. A move's worth is first guessed from
// every game in which that player played that point at any time ("all moves as first", RAVE), which
// says something about every move after a handful of games, and the guess gives way to the move's
// own results as they come in. And before any game at all, each move starts with a few made-up
// results from what any player knows: take stones that can be taken, save your own, don't throw
// stones away, play near what is on the board, stay off the first line in the opening.

interface Node {
  /** The point played to get here; 0 for a pass. */
  p: number;
  /** Who played it. */
  c: Stone;
  /** Games through here, and how many its player won. */
  n: number;
  w: number;
  /** The same, counting every game where its player played this point later on (and the made-up ones it starts with). */
  rn: number;
  rw: number;
  kids: Node[] | null;
}

/** How many games a move's own results need before they count for as much as the guess. */
const RAVE_WEIGHT = 2000;
/** How many made-up games a move starts with. */
const PRIOR_GAMES = 12;

function worth(k: Node): number {
  const guess = k.rw / k.rn;
  if (k.n === 0) return guess;
  const beta = k.rn / (k.rn + k.n + (k.rn * k.n) / RAVE_WEIGHT);
  return (1 - beta) * (k.w / k.n) + beta * guess;
}

/**
 * How good a move looks before any reading, from 0 to 1 (0.5 is "no opinion"): what a beginner is
 * told in the first lesson, and enough to keep a short search from looking foolish.
 */
export function goPrior(b: GoBoard, p: number, c: Stone): number {
  const { dirs, diags, line, star, n } = b.g;
  const them = 3 - c;
  let v = 0.5;
  let near = 0;
  let saves = false;
  let takes = 0;
  for (let d = 0; d < 4; d++) {
    const q = p + dirs[d]!;
    const cq = b.color[q]!;
    if (cq === BLACK || cq === WHITE) {
      near++;
      if (b.inAtari(q)) {
        if (cq === them) takes += b.groupSize(q);
        else saves = true;
      }
    }
    const dq = b.color[p + diags[d]!]!;
    if (dq === BLACK || dq === WHITE) near++;
  }
  const thrown = b.selfAtari(p, c);
  if (takes) v += takes > 1 ? 0.35 : 0.25;
  if (thrown) v -= thrown > 1 ? 0.4 : 0.3;
  else if (saves) v += 0.25;
  const l = line[p]!;
  if (near === 0) {
    // Open country: the third and fourth lines are where a game starts, the edge is where it ends.
    if (l === 1) v -= 0.3;
    else if (l === 2) v -= 0.15;
    else if (l === 3 || (l === 4 && n > 9)) v += 0.08;
    if (star[p] && n > 9) v += 0.12;
  } else {
    v += 0.05;
    if (l === 1 && !takes && !saves) v -= 0.1;
  }
  // An answer close to the stone just played is usually wanted.
  if (b.last) {
    const w = b.g.w;
    const dr = Math.abs(Math.floor(p / w) - Math.floor(b.last / w));
    const dc = Math.abs((p % w) - (b.last % w));
    const far = Math.max(dr, dc);
    if (far <= 1) v += 0.1;
    else if (far === 2) v += 0.05;
  }
  return v < 0.05 ? 0.05 : v > 0.95 ? 0.95 : v;
}

export interface GoSearch {
  /** The most games it may play out. The search stops there even with time in hand. */
  playouts: number;
  /** When to stop whatever the count, as a `performance.now()` time. Left out, only the count stops it. */
  deadline?: number;
  /** What White is given, taken off Black's count. */
  komi: number;
  /** Where the dice start. */
  seed: number;
  /** The other side has just passed: a pass now ends the game. */
  passed?: boolean;
  /** Passing is one of the moves weighed (near the end, when there may be nothing better). */
  canPass?: boolean;
}

export interface GoThought {
  /** The cell to play, or null to pass. */
  cell: number | null;
  /** Games actually played out. */
  playouts: number;
  /** How often the mover won them. */
  winning: number;
  /** How each cell tended to end up over those games: +1 Black's, -1 White's. Empty when none were played. */
  owners: Float32Array;
  /** How the pass did, if it was weighed: the share of its games the mover won. */
  passing: number | null;
}

/**
 * Think about `toMove`'s move. `legal` is every cell the rules allow (the game works that out, with
 * its history of positions); its own eyes are left out here, since filling one is never the move.
 * With no time or games at all it still answers, with the move that looks best at a glance.
 */
export function searchGo(root: GoBoard, toMove: Stone, legal: readonly number[], o: GoSearch): GoThought {
  const g = root.g;
  const dice = new GoDice(o.seed);
  const cells = g.at.length;
  const kids: Node[] = [];
  for (const cell of legal) {
    const p = g.at[cell]!;
    if (root.isEye(p, toMove)) continue;
    const prior = goPrior(root, p, toMove);
    kids.push({ p, c: toMove, n: 0, w: 0, rn: PRIOR_GAMES, rw: PRIOR_GAMES * prior, kids: null });
  }
  // Moves that look alike at a glance are looked at in a different order each time.
  for (let i = kids.length - 1; i > 0; i--) {
    const j = dice.roll(i + 1);
    [kids[i], kids[j]] = [kids[j]!, kids[i]!];
  }
  const pass: Node | null = o.canPass || kids.length === 0 ? { p: 0, c: toMove, n: 0, w: 0, rn: PRIOR_GAMES, rw: PRIOR_GAMES * 0.4, kids: null } : null;
  if (pass) kids.push(pass);
  const top: Node = { p: 0, c: (3 - toMove) as Stone, n: 0, w: 0, rn: 1, rw: 0, kids };
  const owners = new Float32Array(cells);
  const none = (cell: number | null): GoThought => ({ cell, playouts: 0, winning: 0.5, owners, passing: null });
  if (kids.length === 1) return none(kids[0]!.p ? g.cell[kids[0]!.p]! : null);

  const work = new GoBoard(g);
  const first = new Uint8Array(g.size);
  const sum = new Int32Array(cells);
  const path: Node[] = [];
  // A new position joins the tree once it has been through this many games: sooner on a small board.
  const grow = g.n > 9 ? 2 : 1;

  function expand(node: Node, c: Stone) {
    const list: Node[] = [];
    for (let i = 0; i < work.nEmpty; i++) {
      const p = work.empties[i]!;
      if (p === work.ko || work.isEye(p, c) || !work.legal(p, c)) continue;
      list.push({ p, c, n: 0, w: 0, rn: PRIOR_GAMES, rw: PRIOR_GAMES * goPrior(work, p, c), kids: null });
    }
    if (!list.length) list.push({ p: 0, c, n: 0, w: 0, rn: PRIOR_GAMES, rw: PRIOR_GAMES * 0.5, kids: null });
    node.kids = list;
  }

  let played = 0;
  while (played < o.playouts) {
    if (o.deadline !== undefined && performance.now() >= o.deadline) break;
    work.copyFrom(root);
    first.fill(0);
    path.length = 0;
    path.push(top);
    let node = top;
    let c = toMove;
    let passes = o.passed ? 1 : 0;
    while (passes < 2) {
      if (!node.kids) {
        if (node.n < grow) break;
        expand(node, c);
      }
      const list = node.kids!;
      let best = list[0]!;
      let bestWorth = -1;
      for (let i = 0; i < list.length; i++) {
        const v = worth(list[i]!);
        if (v > bestWorth) {
          bestWorth = v;
          best = list[i]!;
        }
      }
      if (best.p === 0) {
        passes++;
        work.pass();
      } else {
        passes = 0;
        work.play(best.p, c);
        if (first[best.p] === 0) first[best.p] = c;
      }
      path.push(best);
      node = best;
      c = (3 - c) as Stone;
    }
    if (passes < 2) work.playOut(c, dice, first);
    const margin = work.areaMargin(sum) - o.komi;
    const winner = margin > 0 ? BLACK : WHITE;
    for (let i = 1; i < path.length; i++) {
      const k = path[i]!;
      k.n++;
      if (k.c === winner) k.w++;
      // Its brothers hear about it too: any of them whose point this player went on to play.
      for (const s of path[i - 1]!.kids!) {
        if (s.p !== 0 && first[s.p] === s.c) {
          s.rn++;
          if (s.c === winner) s.rw++;
        }
      }
    }
    top.n++;
    played++;
  }

  if (played) for (let i = 0; i < cells; i++) owners[i] = sum[i]! / played;
  // The move tried most; with nothing tried, the one that looked best at a glance.
  let best = kids[0]!;
  for (const k of kids) if (k.n > best.n || (k.n === best.n && worth(k) > worth(best))) best = k;
  return { cell: best.p ? g.cell[best.p]! : null, playouts: played, winning: best.n ? best.w / best.n : 0.5, owners, passing: pass && pass.n ? pass.w / pass.n : null };
}
