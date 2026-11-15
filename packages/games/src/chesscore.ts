// The inside of Chess: a position a computer can search quickly, every move that can be made from
// it, and the computer player's search. chess.ts is the game (the table's state, notation, clocks,
// what a seat sees); this file knows nothing of seats or tables.
//
// The board is the classic "0x88" one: 128 numbers, a square is rank × 16 + file, and a square is
// off the board exactly when it has a bit of 0x88 set, so a piece walking off an edge is caught
// with one test. Rank 0 is White's home rank and file 0 the a-file. A piece is its kind (pawn 1 to
// king 6) plus 8 if it is Black's.
//
// Everything here is our own: the evaluation's tables are worked out from a few plain ideas (the
// middle of the board, getting pieces off the back rank, pushing passed pawns) and not copied
// from anybody's engine, and there is no opening book.

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export const WHITE = 0;
export const BLACK = 1;

const KNIGHT_STEPS = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING_STEPS = [-17, -16, -15, -1, 1, 15, 16, 17];
const BISHOP_STEPS = [-17, -15, 15, 17];
const ROOK_STEPS = [-16, -1, 1, 16];

// A move is one number: where from (7 bits), where to (7), what a pawn becomes (3), and what kind
// of move it is (3).
export const FLAG_EP = 1;
export const FLAG_CASTLE_K = 2;
export const FLAG_CASTLE_Q = 3;
export const FLAG_DOUBLE = 4;
export const moveFrom = (m: number) => m & 127;
export const moveTo = (m: number) => (m >> 7) & 127;
export const movePromo = (m: number) => (m >> 14) & 7;
export const moveFlag = (m: number) => (m >> 17) & 7;
const mv = (from: number, to: number, promo = 0, flag = 0) => from | (to << 7) | (promo << 14) | (flag << 17);

/** A view's cell (row by row from a8) as a square here, and back. */
export const squareOf = (cell: number) => ((7 - (cell >> 3)) << 4) | (cell & 7);
export const cellOf = (sq: number) => ((7 - (sq >> 4)) << 3) | (sq & 7);

/** A position in plain numbers, the way chess.ts keeps one: cells run row by row from a8. */
export interface ChessSetup {
  /** 64 pieces (0 for an empty square), a8 first. */
  board: ArrayLike<number>;
  side: number;
  /** The cell each castling rook stands on, or −1 where the right is gone: White's king side, queen side, Black's king side, queen side. */
  rooks: ArrayLike<number>;
  /** The cell a pawn that has just moved two squares passed over, or −1. */
  ep: number;
  /** Moves by either side since a capture or a pawn move. */
  half: number;
  full: number;
}

// ---- Zobrist keys -------------------------------------------------------------------------------
// A position's key is the XOR of a random number for each piece on each square, the side to move,
// the castling rights and the en passant file. The numbers come from a fixed seed, so a search
// gives the same answer every time and on every machine. Keys are 64 bits, kept as two halves.

const Z_LO = new Int32Array(16 * 128 + 16 + 8 + 1);
const Z_HI = new Int32Array(Z_LO.length);
const Z_CASTLE = 16 * 128;
const Z_EP = Z_CASTLE + 16;
const Z_SIDE = Z_EP + 8;
{
  // mulberry32, written out so the table can never change under a search by a change elsewhere.
  let seed = 0x6c0ffee5;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
  for (let i = 0; i < Z_LO.length; i++) {
    Z_LO[i] = next();
    Z_HI[i] = next();
  }
}

// ---- What a piece is worth, and where --------------------------------------------------------------
// Two tables a piece: the middlegame and the endgame, mixed by how much is left on the board.

const WORTH = [0, 100, 320, 330, 500, 900, 0];
/** How much each piece counts towards "still a middlegame": 24 with everything on. */
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const MG = new Int16Array(16 * 128);
const EG = new Int16Array(16 * 128);
{
  for (let kind = PAWN; kind <= KING; kind++) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        // How far in from the edge, 0 to 3 each way.
        const cf = Math.min(f, 7 - f);
        const cr = Math.min(r, 7 - r);
        const centre = cf + cr;
        let mg = 0;
        let eg = 0;
        if (kind === PAWN) {
          const adv = r - 1;
          // The middle pawns want to be out; one still at home is in its bishop's way.
          mg = adv * 4 + (cf === 3 ? [-8, 4, 18, 22, 22, 22][adv]! : cf === 2 ? [0, 2, 8, 10, 10, 10][adv]! : 0);
          eg = adv * adv * 2 + adv * 4;
          if (r === 0 || r === 7) mg = eg = 0;
        } else if (kind === KNIGHT) {
          mg = centre * 8 - 28 - (r === 0 ? 10 : 0);
          eg = centre * 6 - 20;
        } else if (kind === BISHOP) {
          mg = centre * 4 - 10 - (r === 0 ? 8 : 0);
          eg = centre * 3 - 8;
        } else if (kind === ROOK) {
          mg = (r === 6 ? 18 : 0) + cf * 3 - 4;
          eg = r === 6 ? 10 : 0;
        } else if (kind === QUEEN) {
          mg = centre - 3 - (r === 0 ? 2 : 0);
          eg = centre * 4 - 10;
        } else {
          // Tucked in a corner while there are queens about; in the middle once there aren't.
          mg = r === 0 ? [18, 26, 6, -6][cf]! : -20 - r * 14;
          eg = centre * 10 - 30;
        }
        const white = r * 16 + f;
        const black = (7 - r) * 16 + f;
        MG[kind * 128 + white] = WORTH[kind]! + mg;
        EG[kind * 128 + white] = WORTH[kind]! + eg;
        MG[(kind | 8) * 128 + black] = -(WORTH[kind]! + mg);
        EG[(kind | 8) * 128 + black] = -(WORTH[kind]! + eg);
      }
    }
  }
}

/** Moves a search can have made and not yet taken back: its deepest line and the captures looked at beyond it. */
const STACK = 256;

export class Position {
  b = new Int8Array(128);
  side = WHITE;
  /** Castling rights, a bit each: White's king side (1), queen side (2), Black's (4, 8). */
  castle = 0;
  /** Where each castling rook started (Chess960 puts them anywhere). */
  rookFrom = new Int16Array(4).fill(-1);
  /** Per square: the rights that survive a move from or to it. */
  private mask = new Uint8Array(128).fill(15);
  ep = -1;
  half = 0;
  full = 1;
  king = new Int16Array(2);
  lo = 0;
  hi = 0;
  /** Material and squares, White's less Black's, for the middlegame and the endgame. */
  mg = 0;
  eg = 0;
  phase = 0;

  private sp = 0;
  private uCap = new Int8Array(STACK);
  private uCastle = new Int8Array(STACK);
  private uEp = new Int16Array(STACK);
  private uHalf = new Int16Array(STACK);
  private uLo = new Int32Array(STACK);
  private uHi = new Int32Array(STACK);
  private uMg = new Int32Array(STACK);
  private uEg = new Int32Array(STACK);
  private uPhase = new Int8Array(STACK);

  constructor(setup: ChessSetup) {
    this.reset(setup);
  }

  /** Set the position up afresh. */
  reset(setup: ChessSetup) {
    this.b.fill(0);
    this.mask.fill(15);
    this.rookFrom.fill(-1);
    this.castle = this.lo = this.hi = this.mg = this.eg = this.phase = this.sp = 0;
    this.ep = -1;
    for (let cell = 0; cell < 64; cell++) {
      const p = setup.board[cell]!;
      if (!p) continue;
      const sq = squareOf(cell);
      this.put(sq, p);
      if ((p & 7) === KING) this.king[p >> 3] = sq;
    }
    this.side = setup.side;
    for (let i = 0; i < 4; i++) {
      const cell = setup.rooks[i]!;
      if (cell < 0) continue;
      const sq = squareOf(cell);
      this.castle |= 1 << i;
      this.rookFrom[i] = sq;
      this.mask[sq]! &= ~(1 << i);
      this.mask[this.king[i >> 1]!]! &= ~(3 << ((i >> 1) * 2));
    }
    this.half = setup.half;
    this.full = setup.full;
    // Only an en passant square a pawn could really take on counts: otherwise the same position
    // would look different the move after a pawn's double step.
    if (setup.ep >= 0) {
      const sq = squareOf(setup.ep);
      const from = sq + (this.side === WHITE ? -16 : 16);
      const taker = PAWN | (this.side << 3);
      if ((!((from - 1) & 0x88) && this.b[from - 1] === taker) || (!((from + 1) & 0x88) && this.b[from + 1] === taker)) this.ep = sq;
    }
    this.lo ^= Z_LO[Z_CASTLE + this.castle]!;
    this.hi ^= Z_HI[Z_CASTLE + this.castle]!;
    if (this.ep >= 0) {
      this.lo ^= Z_LO[Z_EP + (this.ep & 7)]!;
      this.hi ^= Z_HI[Z_EP + (this.ep & 7)]!;
    }
    if (this.side === BLACK) {
      this.lo ^= Z_LO[Z_SIDE]!;
      this.hi ^= Z_HI[Z_SIDE]!;
    }
  }

  private put(sq: number, p: number) {
    this.b[sq] = p;
    const i = p * 128 + sq;
    this.lo ^= Z_LO[i]!;
    this.hi ^= Z_HI[i]!;
    this.mg += MG[i]!;
    this.eg += EG[i]!;
    this.phase += PHASE[p & 7]!;
  }

  private take(sq: number) {
    const p = this.b[sq]!;
    this.b[sq] = 0;
    const i = p * 128 + sq;
    this.lo ^= Z_LO[i]!;
    this.hi ^= Z_HI[i]!;
    this.mg -= MG[i]!;
    this.eg -= EG[i]!;
    this.phase -= PHASE[p & 7]!;
  }

  /** Whether `by` attacks the square. */
  attacked(sq: number, by: number): boolean {
    const b = this.b;
    const own = by << 3;
    // A white pawn attacks the two squares diagonally above it.
    const pawn = PAWN | own;
    const back = by === WHITE ? -16 : 16;
    let from = sq + back - 1;
    if (!(from & 0x88) && b[from] === pawn) return true;
    from = sq + back + 1;
    if (!(from & 0x88) && b[from] === pawn) return true;
    const knight = KNIGHT | own;
    const king = KING | own;
    for (let i = 0; i < 8; i++) {
      from = sq + KNIGHT_STEPS[i]!;
      if (!(from & 0x88) && b[from] === knight) return true;
      from = sq + KING_STEPS[i]!;
      if (!(from & 0x88) && b[from] === king) return true;
    }
    const bishop = BISHOP | own;
    const rook = ROOK | own;
    const queen = QUEEN | own;
    for (let i = 0; i < 4; i++) {
      let step = BISHOP_STEPS[i]!;
      from = sq + step;
      while (!(from & 0x88)) {
        const p = b[from]!;
        if (p) {
          if (p === bishop || p === queen) return true;
          break;
        }
        from += step;
      }
      step = ROOK_STEPS[i]!;
      from = sq + step;
      while (!(from & 0x88)) {
        const p = b[from]!;
        if (p) {
          if (p === rook || p === queen) return true;
          break;
        }
        from += step;
      }
    }
    return false;
  }

  inCheck(): boolean {
    return this.attacked(this.king[this.side]!, this.side ^ 1);
  }

  /**
   * Every move the side to move could make if its own king's safety didn't matter (`make` refuses
   * the ones that leave it in check), written into `out` from `at`. Returns where the list ends.
   * With `loud`, only captures and promotions to a queen: what a search looks at before it trusts
   * a position to be quiet.
   */
  gen(out: Int32Array, at: number, loud = false): number {
    const b = this.b;
    const us = this.side;
    const them = us ^ 1;
    const up = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const lastRank = us === WHITE ? 7 : 0;
    for (let rank = 0; rank < 8; rank++) {
      for (let sq = rank << 4, end = sq + 8; sq < end; sq++) {
        const p = b[sq]!;
        if (!p || p >> 3 !== us) continue;
        const kind = p & 7;
        if (kind === PAWN) {
          const one = sq + up;
          const promotes = one >> 4 === lastRank;
          if (!b[one]) {
            if (promotes) {
              out[at++] = mv(sq, one, QUEEN);
              if (!loud) {
                out[at++] = mv(sq, one, KNIGHT);
                out[at++] = mv(sq, one, ROOK);
                out[at++] = mv(sq, one, BISHOP);
              }
            } else if (!loud) {
              out[at++] = mv(sq, one);
              if (rank === startRank && !b[one + up]) out[at++] = mv(sq, one + up, 0, FLAG_DOUBLE);
            }
          }
          for (let side = -1; side <= 1; side += 2) {
            const to = one + side;
            if (to & 0x88) continue;
            const target = b[to]!;
            if (target && target >> 3 === them) {
              if (promotes) {
                out[at++] = mv(sq, to, QUEEN);
                if (!loud) {
                  out[at++] = mv(sq, to, KNIGHT);
                  out[at++] = mv(sq, to, ROOK);
                  out[at++] = mv(sq, to, BISHOP);
                }
              } else out[at++] = mv(sq, to);
            } else if (to === this.ep) out[at++] = mv(sq, to, 0, FLAG_EP);
          }
        } else if (kind === KNIGHT || kind === KING) {
          const steps = kind === KNIGHT ? KNIGHT_STEPS : KING_STEPS;
          for (let i = 0; i < 8; i++) {
            const to = sq + steps[i]!;
            if (to & 0x88) continue;
            const target = b[to]!;
            if (!target ? !loud : target >> 3 === them) out[at++] = mv(sq, to);
          }
        } else {
          for (let i = 0; i < 4; i++) {
            for (let set = 0; set < 2; set++) {
              if (set === 0 ? kind === ROOK : kind === BISHOP) continue;
              const step = set === 0 ? BISHOP_STEPS[i]! : ROOK_STEPS[i]!;
              let to = sq + step;
              while (!(to & 0x88)) {
                const target = b[to]!;
                if (target) {
                  if (target >> 3 === them) out[at++] = mv(sq, to);
                  break;
                }
                if (!loud) out[at++] = mv(sq, to);
                to += step;
              }
            }
          }
        }
      }
    }
    if (loud || !(this.castle & (3 << (us * 2)))) return at;
    // Castling, written for any starting row (Chess960): the king ends on the g- or c-file and the
    // rook on the f- or d-file, wherever they began. Every square either of them crosses or lands
    // on has to be empty but for the two of them, and the king may not start on, cross or land on
    // an attacked square. (A king left in check once the rook has moved away is caught by `make`.)
    const home = us === WHITE ? 0 : 112;
    const kf = this.king[us]!;
    for (let k = 0; k < 2; k++) {
      const right = us * 2 + k;
      if (!(this.castle & (1 << right))) continue;
      const rf = this.rookFrom[right]!;
      const kt = home + (k === 0 ? 6 : 2);
      const rt = home + (k === 0 ? 5 : 3);
      let ok = true;
      for (let sq = Math.min(kf, rf, kt, rt), end = Math.max(kf, rf, kt, rt); sq <= end && ok; sq++) if (sq !== kf && sq !== rf && b[sq]) ok = false;
      const step = kt > kf ? 1 : -1;
      for (let sq = kf; ok; sq += step) {
        if (this.attacked(sq, them)) ok = false;
        if (sq === kt) break;
      }
      if (ok) out[at++] = mv(kf, kt, 0, FLAG_CASTLE_K + k);
    }
    return at;
  }

  /** Make a move from `gen`. False, with nothing changed, if it would leave the mover's king in check. */
  make(m: number): boolean {
    const b = this.b;
    const from = m & 127;
    const to = (m >> 7) & 127;
    const promo = (m >> 14) & 7;
    const flag = (m >> 17) & 7;
    const us = this.side;
    const them = us ^ 1;
    const piece = b[from]!;
    const sp = this.sp++;
    this.uCastle[sp] = this.castle;
    this.uEp[sp] = this.ep;
    this.uHalf[sp] = this.half;
    this.uLo[sp] = this.lo;
    this.uHi[sp] = this.hi;
    this.uMg[sp] = this.mg;
    this.uEg[sp] = this.eg;
    this.uPhase[sp] = this.phase;
    let captured = 0;
    let key = Z_CASTLE + this.castle;
    this.lo ^= Z_LO[key]!;
    this.hi ^= Z_HI[key]!;
    if (this.ep >= 0) {
      key = Z_EP + (this.ep & 7);
      this.lo ^= Z_LO[key]!;
      this.hi ^= Z_HI[key]!;
    }
    if (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q) {
      const rf = this.rookFrom[us * 2 + flag - FLAG_CASTLE_K]!;
      const rook = b[rf]!;
      const rt = (to & 0x70) + (flag === FLAG_CASTLE_K ? 5 : 3);
      // Both off, then both on: either may be landing where the other stood.
      this.take(from);
      this.take(rf);
      this.put(to, piece);
      this.put(rt, rook);
      this.king[us] = to;
    } else {
      if (flag === FLAG_EP) {
        const at = to + (us === WHITE ? -16 : 16);
        captured = b[at]!;
        this.take(at);
      } else if (b[to]) {
        captured = b[to]!;
        this.take(to);
      }
      this.take(from);
      this.put(to, promo ? promo | (us << 3) : piece);
      if ((piece & 7) === KING) this.king[us] = to;
    }
    this.uCap[sp] = captured;
    this.half = (piece & 7) === PAWN || captured ? 0 : this.half + 1;
    this.ep = -1;
    if (flag === FLAG_DOUBLE) {
      const taker = PAWN | (them << 3);
      if ((!((to - 1) & 0x88) && b[to - 1] === taker) || (!((to + 1) & 0x88) && b[to + 1] === taker)) this.ep = (from + to) >> 1;
    }
    this.castle &= this.mask[from]! & this.mask[to]!;
    key = Z_CASTLE + this.castle;
    this.lo ^= Z_LO[key]! ^ Z_LO[Z_SIDE]!;
    this.hi ^= Z_HI[key]! ^ Z_HI[Z_SIDE]!;
    if (this.ep >= 0) {
      key = Z_EP + (this.ep & 7);
      this.lo ^= Z_LO[key]!;
      this.hi ^= Z_HI[key]!;
    }
    this.side = them;
    if (us === BLACK) this.full++;
    if (this.attacked(this.king[us]!, them)) {
      this.unmake(m);
      return false;
    }
    return true;
  }

  unmake(m: number) {
    const b = this.b;
    const from = m & 127;
    const to = (m >> 7) & 127;
    const flag = (m >> 17) & 7;
    const us = this.side ^ 1;
    const sp = --this.sp;
    this.side = us;
    if (us === BLACK) this.full--;
    this.castle = this.uCastle[sp]!;
    this.ep = this.uEp[sp]!;
    this.half = this.uHalf[sp]!;
    this.lo = this.uLo[sp]!;
    this.hi = this.uHi[sp]!;
    this.mg = this.uMg[sp]!;
    this.eg = this.uEg[sp]!;
    this.phase = this.uPhase[sp]!;
    if (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q) {
      const rf = this.rookFrom[us * 2 + flag - FLAG_CASTLE_K]!;
      const rt = (to & 0x70) + (flag === FLAG_CASTLE_K ? 5 : 3);
      const king = b[to]!;
      const rook = b[rt]!;
      b[to] = 0;
      b[rt] = 0;
      b[from] = king;
      b[rf] = rook;
      this.king[us] = from;
      return;
    }
    const piece = (m >> 14) & 7 ? PAWN | (us << 3) : b[to]!;
    const captured = this.uCap[sp]!;
    b[from] = piece;
    if (flag === FLAG_EP) {
      b[to] = 0;
      b[to + (us === WHITE ? -16 : 16)] = captured;
    } else b[to] = captured;
    if ((piece & 7) === KING) this.king[us] = from;
  }

  /** Pass the turn: for a search asking "what if I did nothing?". Never when in check. */
  makeNull() {
    const sp = this.sp++;
    this.uEp[sp] = this.ep;
    this.uLo[sp] = this.lo;
    this.uHi[sp] = this.hi;
    if (this.ep >= 0) {
      const key = Z_EP + (this.ep & 7);
      this.lo ^= Z_LO[key]!;
      this.hi ^= Z_HI[key]!;
    }
    this.lo ^= Z_LO[Z_SIDE]!;
    this.hi ^= Z_HI[Z_SIDE]!;
    this.ep = -1;
    this.side ^= 1;
  }

  unmakeNull() {
    const sp = --this.sp;
    this.side ^= 1;
    this.ep = this.uEp[sp]!;
    this.lo = this.uLo[sp]!;
    this.hi = this.uHi[sp]!;
  }

  /** Every legal move. */
  legal(): number[] {
    const end = this.gen(SCRATCH, 0);
    const out: number[] = [];
    for (let i = 0; i < end; i++) {
      const m = SCRATCH[i]!;
      if (this.make(m)) {
        this.unmake(m);
        out.push(m);
      }
    }
    return out;
  }

  /** Whether the side to move has any legal move at all. */
  canMove(): boolean {
    const end = this.gen(SCRATCH, 0);
    for (let i = 0; i < end; i++) {
      const m = SCRATCH[i]!;
      if (this.make(m)) {
        this.unmake(m);
        return true;
      }
    }
    return false;
  }

  /**
   * Nobody can ever be mated with what is left: bare kings, a king and one knight or bishop
   * against a king, or kings and bishops that all stand on squares of one colour.
   */
  dead(): boolean {
    const b = this.b;
    let knights = 0;
    let light = 0;
    let dark = 0;
    for (let rank = 0; rank < 8; rank++) {
      for (let sq = rank << 4, end = sq + 8; sq < end; sq++) {
        const kind = b[sq]! & 7;
        if (!kind || kind === KING) continue;
        if (kind === KNIGHT) knights++;
        else if (kind === BISHOP) {
          if ((rank + sq) & 1) light++;
          else dark++;
        } else return false;
      }
    }
    if (knights + light + dark <= 1) return true;
    return knights === 0 && (light === 0 || dark === 0);
  }
}

/** A position's key (see `Position.lo`, `hi`) without setting the position up: for the positions a game has already been through. */
export function positionKey(setup: ChessSetup): { lo: number; hi: number } {
  const pos = KEYED;
  pos.reset(setup);
  return { lo: pos.lo, hi: pos.hi };
}

const SCRATCH = new Int32Array(256);
const MAX_PLY = 96;
const KEYED = new Position({ board: [], side: 0, rooks: [], ep: -1, half: 0, full: 1 });
const MOVES = new Int32Array((MAX_PLY + 2) * 256);
const ORDER = new Int32Array((MAX_PLY + 2) * 256);

/** How many positions are exactly `depth` moves from here: the standard test of move generation. */
export function perft(pos: Position, depth: number, ply = 0): number {
  const start = ply * 256;
  const end = pos.gen(MOVES, start);
  let count = 0;
  for (let i = start; i < end; i++) {
    const m = MOVES[i]!;
    if (!pos.make(m)) continue;
    count += depth <= 1 ? 1 : perft(pos, depth - 1, ply + 1);
    pos.unmake(m);
  }
  return count;
}

// ---- Judging a position -------------------------------------------------------------------------
// Material and where it stands (kept up to date as moves are made), then a look over the board for
// what that misses: pawns that are doubled, alone or past the other side's pawns; how many squares
// the pieces have; a pair of bishops; rooks on open files; and pawns still in front of a king
// while there are enough pieces about to hurt it.

const PASSED = [0, 4, 8, 16, 30, 52, 85, 0];
const pawnCount = [new Int8Array(10), new Int8Array(10)];
/** White's rearmost pawn on each file (8 for none), Black's rearmost from its own side (−1 for none). */
const whiteBack = new Int8Array(10);
const blackBack = new Int8Array(10);
/** White's most advanced pawn on each file (−1 for none) and Black's (8 for none). */
const whiteFront = new Int8Array(10);
const blackFront = new Int8Array(10);

/** How good the position is for the side to move, in hundredths of a pawn. */
export function evaluate(pos: Position): number {
  const b = pos.b;
  for (let f = 0; f < 10; f++) {
    pawnCount[0]![f] = 0;
    pawnCount[1]![f] = 0;
    whiteBack[f] = 8;
    whiteFront[f] = -1;
    blackBack[f] = -1;
    blackFront[f] = 8;
  }
  for (let rank = 1; rank < 7; rank++) {
    for (let f = 0; f < 8; f++) {
      const p = b[(rank << 4) + f]!;
      if (p === PAWN) {
        pawnCount[0]![f + 1]!++;
        if (rank < whiteBack[f + 1]!) whiteBack[f + 1] = rank;
        if (rank > whiteFront[f + 1]!) whiteFront[f + 1] = rank;
      } else if (p === (PAWN | 8)) {
        pawnCount[1]![f + 1]!++;
        if (rank > blackBack[f + 1]!) blackBack[f + 1] = rank;
        if (rank < blackFront[f + 1]!) blackFront[f + 1] = rank;
      }
    }
  }
  let mg = pos.mg;
  let eg = pos.eg;
  const bishops = [0, 0];
  for (let rank = 0; rank < 8; rank++) {
    for (let f = 0; f < 8; f++) {
      const sq = (rank << 4) + f;
      const p = b[sq]!;
      if (!p) continue;
      const side = p >> 3;
      const sign = side === WHITE ? 1 : -1;
      const kind = p & 7;
      const file = f + 1;
      if (kind === PAWN) {
        const mine = pawnCount[side]!;
        let m = 0;
        let e = 0;
        if (mine[file]! > 1) {
          m -= 8;
          e -= 14;
        }
        if (!mine[file - 1] && !mine[file + 1]) {
          m -= 10;
          e -= 12;
        }
        // Passed: no pawn of theirs ahead of it on its own file or the ones beside it.
        const passed = side === WHITE ? blackBack[file - 1]! <= rank && blackBack[file]! <= rank && blackBack[file + 1]! <= rank : whiteBack[file - 1]! >= rank && whiteBack[file]! >= rank && whiteBack[file + 1]! >= rank;
        if (passed) {
          const gone = side === WHITE ? rank : 7 - rank;
          m += PASSED[gone]! >> 1;
          e += PASSED[gone]!;
        }
        mg += sign * m;
        eg += sign * e;
      } else if (kind === KING) {
        // Pawns in front of a king at home, and files beside it with none of its own.
        const home = side === WHITE ? rank <= 1 : rank >= 6;
        if (!home) continue;
        const ahead = side === WHITE ? 16 : -16;
        let shield = 0;
        const pawn = PAWN | (side << 3);
        for (let df = -1; df <= 1; df++) {
          if (f + df < 0 || f + df > 7) continue;
          const one = sq + ahead + df;
          if (b[one] === pawn) shield += 12;
          else if (!((one + ahead) & 0x88) && b[one + ahead] === pawn) shield += 6;
          if (!pawnCount[side]![file + df]) shield -= 14;
        }
        mg += sign * shield;
      } else {
        // Squares it can go to, counting captures: a piece with nowhere to go isn't doing much.
        let reach = 0;
        if (kind === KNIGHT) {
          for (let i = 0; i < 8; i++) {
            const to = sq + KNIGHT_STEPS[i]!;
            if (!(to & 0x88) && (!b[to] || b[to]! >> 3 !== side)) reach++;
          }
          mg += sign * (reach - 4) * 4;
          eg += sign * (reach - 4) * 4;
          continue;
        }
        for (let i = 0; i < 4; i++) {
          for (let set = 0; set < 2; set++) {
            if (set === 0 ? kind === ROOK : kind === BISHOP) continue;
            const step = set === 0 ? BISHOP_STEPS[i]! : ROOK_STEPS[i]!;
            let to = sq + step;
            while (!(to & 0x88)) {
              const target = b[to]!;
              if (target) {
                if (target >> 3 !== side) reach++;
                break;
              }
              reach++;
              to += step;
            }
          }
        }
        if (kind === BISHOP) {
          bishops[side]!++;
          mg += sign * (reach - 6) * 4;
          eg += sign * (reach - 6) * 4;
        } else if (kind === ROOK) {
          mg += sign * (reach - 7) * 2;
          eg += sign * (reach - 7) * 3;
          if (!pawnCount[side]![file]) {
            const open = pawnCount[side ^ 1]![file] ? 8 : 16;
            mg += sign * open;
            eg += sign * (open >> 1);
          }
        } else {
          mg += sign * (reach - 13);
          eg += sign * (reach - 13) * 2;
        }
      }
    }
  }
  if (bishops[0]! >= 2) {
    mg += 28;
    eg += 40;
  }
  if (bishops[1]! >= 2) {
    mg -= 28;
    eg -= 40;
  }
  const phase = pos.phase > 24 ? 24 : pos.phase;
  const white = ((mg * phase + eg * (24 - phase)) / 24) | 0;
  return (pos.side === WHITE ? white : -white) + 8;
}

// ---- The search ---------------------------------------------------------------------------------
// Look ahead by iterative deepening: a full search one move deep, then two, and so on, each one
// using what the last found to try the best moves first, until the work allowed or the time
// allowed is used up; the move played is the best of the last depth that finished (or of the part
// of the next that had already beaten it). Inside it is alpha-beta with the usual helpers:
//
//   - a transposition table, so a position reached by another order of moves isn't searched twice;
//   - move ordering: the table's move, captures (biggest victim by smallest attacker), two "killer"
//     quiet moves a ply, then quiet moves by how often they have cut a search short;
//   - a quiescence search, so a position is never judged in the middle of an exchange;
//   - a check is looked at one move deeper, and positions that repeat are a draw;
//   - a null move (if doing nothing is still too good, don't look further) and late quiet moves
//     searched less deeply.

export const MATE = 30_000;
const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const ttHi = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
/** Which search wrote an entry: anything older is as good as empty, so no search hears from the one before. */
const ttGen = new Uint16Array(TT_SIZE);
let gen = 0;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

const killers = new Int32Array((MAX_PLY + 2) * 2);
const history = new Int32Array(2 * 128 * 128);
const pathLo = new Int32Array(MAX_PLY + 4);
const pathHi = new Int32Array(MAX_PLY + 4);

export interface SearchLimits {
  /** Look no deeper than this many moves. */
  depth: number;
  /** Look at no more than this many positions (Infinity for no limit). */
  nodes: number;
  /** Stop after this many ms (Infinity for no limit). */
  ms: number;
  /** How much luck is worth, in hundredths of a pawn: moves within this of the best may be played instead. */
  luck: number;
  rand: () => number;
  /** Keys of positions the game has already been through (see `Position.lo`, `hi`): coming back to one is a draw. */
  seen?: { lo: number; hi: number }[];
}

export interface SearchResult {
  /** The move to play; 0 when there is none. */
  move: number;
  /** What it thinks of the position, for the side to move. */
  score: number;
  /** The last depth it finished. */
  depth: number;
  nodes: number;
  /** Stopped by the clock rather than by depth or work. */
  timedOut: boolean;
}

let nodes = 0;
let nodeCap = Infinity;
let stopAt = Infinity;
let stopped = false;
let timedOut = false;
let seenLo: number[] = [];
let seenHi: number[] = [];

const now = () => performance.now();

/** Count a position, and say whether the search has to stop. The clock is only looked at now and then. */
function spend(): boolean {
  if (stopped) return true;
  nodes++;
  if (nodes > nodeCap) return (stopped = true);
  if ((nodes & 127) === 0 && stopAt !== Infinity && now() >= stopAt) {
    timedOut = true;
    return (stopped = true);
  }
  return false;
}

/** Has this position come up before, in the game or on the way here? */
function repeated(pos: Position, ply: number): boolean {
  if (pos.half < 4) return false;
  const lo = pos.lo;
  const hi = pos.hi;
  // Only positions since the last capture or pawn move can come round again.
  for (let i = ply - 2; i >= 0 && ply - i <= pos.half; i -= 2) if (pathLo[i] === lo && pathHi[i] === hi) return true;
  if (pos.half >= ply) for (let i = 0; i < seenLo.length; i++) if (seenLo[i] === lo && seenHi[i] === hi) return true;
  return false;
}

/** Put the move worth most at `i`, so moves are tried best first without sorting the ones never reached. */
function pick(i: number, end: number) {
  let best = i;
  for (let j = i + 1; j < end; j++) if (ORDER[j]! > ORDER[best]!) best = j;
  if (best !== i) {
    const m = MOVES[i]!;
    MOVES[i] = MOVES[best]!;
    MOVES[best] = m;
    const o = ORDER[i]!;
    ORDER[i] = ORDER[best]!;
    ORDER[best] = o;
  }
}

function quiesce(pos: Position, alpha: number, beta: number, ply: number): number {
  if (spend()) return 0;
  const stand = evaluate(pos);
  if (ply >= MAX_PLY) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const b = pos.b;
  const start = ply * 256;
  const end = pos.gen(MOVES, start, true);
  for (let i = start; i < end; i++) {
    const m = MOVES[i]!;
    const victim = b[(m >> 7) & 127]! & 7;
    ORDER[i] = (victim || PAWN) * 16 - (b[m & 127]! & 7) + ((m >> 14) & 7 ? 80 : 0);
  }
  let best = stand;
  for (let i = start; i < end; i++) {
    pick(i, end);
    const m = MOVES[i]!;
    // A capture that couldn't bring the score up to what is already on offer isn't worth the look.
    const gain = WORTH[b[(m >> 7) & 127]! & 7]! + ((m >> 14) & 7 ? 800 : 0) + (m >> 17 === FLAG_EP ? 100 : 0);
    if (stand + gain + 200 < alpha && pos.phase > 4) continue;
    if (!pos.make(m)) continue;
    const value = -quiesce(pos, -beta, -alpha, ply + 1);
    pos.unmake(m);
    if (stopped) return 0;
    if (value > best) {
      best = value;
      if (value > alpha) {
        alpha = value;
        if (alpha >= beta) break;
      }
    }
  }
  return best;
}

function search(pos: Position, depth: number, alpha: number, beta: number, ply: number, nullOk: boolean): number {
  pathLo[ply] = pos.lo;
  pathHi[ply] = pos.hi;
  // A draw by the fifty-move rule or by coming back to a position. (Bare kings and the like are
  // caught by the evaluation staying level.)
  if (pos.half >= 100 || repeated(pos, ply)) return 0;
  const checked = pos.inCheck();
  if (checked) depth++;
  if (depth <= 0) return quiesce(pos, alpha, beta, ply);
  if (spend()) return 0;
  if (ply >= MAX_PLY) return evaluate(pos);

  const slot = pos.lo & (TT_SIZE - 1);
  let first = 0;
  if (ttGen[slot] === gen && ttHi[slot] === pos.hi) {
    first = ttMove[slot]!;
    if (ttDepth[slot]! >= depth) {
      let score = ttScore[slot]!;
      // A mate is so many moves from here, not from where it was first found.
      if (score > MATE - 200) score -= ply;
      else if (score < -MATE + 200) score += ply;
      const flag = ttFlag[slot]!;
      if (flag === EXACT || (flag === LOWER && score >= beta) || (flag === UPPER && score <= alpha)) return score;
    }
  }

  const us = pos.side;
  // If passing would still be too good for the other side to allow, so is moving. Not with only
  // pawns left, where having to move can be the whole problem.
  if (nullOk && !checked && depth >= 3 && beta < MATE - 200 && pos.phase > 2) {
    const stand = evaluate(pos);
    if (stand >= beta) {
      pos.makeNull();
      const value = -search(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (stopped) return 0;
      if (value >= beta) return value > MATE - 200 ? beta : value;
    }
  }

  const b = pos.b;
  const start = ply * 256;
  const end = pos.gen(MOVES, start);
  const k1 = killers[ply * 2]!;
  const k2 = killers[ply * 2 + 1]!;
  for (let i = start; i < end; i++) {
    const m = MOVES[i]!;
    const victim = b[(m >> 7) & 127]! & 7;
    const promo = (m >> 14) & 7;
    if (m === first) ORDER[i] = 2_000_000_000;
    else if (victim || promo === QUEEN || (m >> 17) === FLAG_EP) ORDER[i] = 1_000_000_000 + (victim || PAWN) * 16 - (b[m & 127]! & 7) + promo * 100;
    else if (m === k1) ORDER[i] = 900_000_000;
    else if (m === k2) ORDER[i] = 800_000_000;
    else ORDER[i] = history[(us << 14) | ((m & 127) << 7) | ((m >> 7) & 127)]!;
  }

  const alpha0 = alpha;
  let best = -Infinity;
  let bestMove = 0;
  let tried = 0;
  for (let i = start; i < end; i++) {
    pick(i, end);
    const m = MOVES[i]!;
    const quiet = !(b[(m >> 7) & 127]! || (m >> 14) & 7 || (m >> 17) === FLAG_EP);
    if (!pos.make(m)) continue;
    tried++;
    let value: number;
    if (tried === 1) value = -search(pos, depth - 1, -beta, -alpha, ply + 1, true);
    else {
      // Later quiet moves are unlikely to be the best: look at them less deeply first, with a
      // window that only asks "better than what we have?", and properly only if they are.
      const less = quiet && !checked && depth >= 3 && tried > 4 ? (tried > 12 && depth >= 6 ? 2 : 1) : 0;
      value = -search(pos, depth - 1 - less, -alpha - 1, -alpha, ply + 1, true);
      if (value > alpha && less && !stopped) value = -search(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (value > alpha && value < beta && !stopped) value = -search(pos, depth - 1, -beta, -alpha, ply + 1, true);
    }
    pos.unmake(m);
    if (stopped) return 0;
    if (value > best) {
      best = value;
      bestMove = m;
      if (value > alpha) {
        alpha = value;
        if (alpha >= beta) {
          if (quiet) {
            if (killers[ply * 2] !== m) {
              killers[ply * 2 + 1] = killers[ply * 2]!;
              killers[ply * 2] = m;
            }
            const h = (us << 14) | ((m & 127) << 7) | ((m >> 7) & 127);
            history[h] = Math.min(history[h]! + depth * depth, 700_000_000);
          }
          break;
        }
      }
    }
  }
  // No move at all: mated (the sooner the worse), or stalemated.
  if (!tried) return checked ? -MATE + ply : 0;

  ttGen[slot] = gen;
  ttHi[slot] = pos.hi;
  ttMove[slot] = bestMove;
  ttDepth[slot] = depth;
  ttScore[slot] = best > MATE - 200 ? best + ply : best < -MATE + 200 ? best - ply : best;
  ttFlag[slot] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
  return best;
}

/**
 * The best move for the side to move, within the limits given. With one legal move it is played
 * without a thought. The position is left as it was found.
 */
export function think(pos: Position, limits: SearchLimits): SearchResult {
  const began = now();
  const moves = pos.legal();
  if (moves.length < 2) return { move: moves[0] ?? 0, score: 0, depth: 0, nodes: 0, timedOut: false };
  nodes = 0;
  nodeCap = limits.nodes;
  stopAt = limits.ms === Infinity ? Infinity : began + limits.ms;
  stopped = false;
  timedOut = false;
  seenLo = (limits.seen ?? []).map((k) => k.lo);
  seenHi = (limits.seen ?? []).map((k) => k.hi);
  if (++gen > 65_000) {
    gen = 1;
    ttGen.fill(0);
  }
  killers.fill(0);
  history.fill(0);
  pathLo[0] = pos.lo;
  pathHi[0] = pos.hi;

  // Captures first, so that a search stopped before it has finished a single move still has a
  // sensible one to give.
  const b = pos.b;
  const options = moves
    .map((move) => ({ move, value: (b[moveTo(move)]! & 7) * 16 - (b[moveFrom(move)]! & 7), luck: Math.floor(limits.rand() * limits.luck) }))
    .sort((x, y) => y.value - x.value);
  let best = options[0]!;
  let score = 0;
  let reached = 0;
  for (let depth = 1; depth <= limits.depth && !stopped; depth++) {
    let top = -Infinity;
    let pickOf = options[0]!;
    let exact = 0;
    for (let i = 0; i < options.length; i++) {
      const o = options[i]!;
      pos.make(o.move);
      let value: number;
      if (i === 0) value = -search(pos, depth - 1, -MATE, MATE, 1, true);
      else {
        // A move only has to be scored exactly if, with its luck, it could come out on top.
        const need = top - o.luck;
        value = -search(pos, depth - 1, -need - 1, -need, 1, true);
        if (value > need && !stopped) value = -search(pos, depth - 1, -MATE, -need, 1, true);
      }
      pos.unmake(o.move);
      if (stopped) break;
      o.value = value + o.luck;
      if (o.value > top) {
        top = o.value;
        pickOf = o;
        exact = value;
      }
    }
    // Stopped part way: the moves looked at so far were looked at properly (last time's best
    // first), so the best of those stands. Stopped before the first was done, nothing is learned.
    if (stopped && top === -Infinity) break;
    best = pickOf;
    score = exact;
    if (stopped) break;
    reached = depth;
    // Best first next time round. Moves that failed low keep their order from before.
    const lead = options.indexOf(best);
    options.splice(lead, 1);
    options.unshift(best);
    // A forced mate found: looking deeper won't find a better move.
    if (score > MATE - 200 || score < -MATE + 200) break;
  }
  return { move: best.move, score, depth: reached, nodes, timedOut };
}

/** The value of a position from a search to a fixed depth with no luck in it: for tests and for judging who is ahead. */
export function searchScore(pos: Position, depth: number, cap = Infinity): number {
  const result = think(pos, { depth, nodes: cap, ms: Infinity, luck: 0, rand: () => 0 });
  return result.move ? result.score : pos.inCheck() ? -MATE : 0;
}
