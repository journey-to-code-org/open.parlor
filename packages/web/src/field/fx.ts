// Everything on a field that is only for show: fire, sparks, flying earth, smoke, dust, the
// shake of the screen. None of it is the game: the flight (in the games package) decides where a
// shell goes and what it does, and tells this what happened (a burst here, this wide); this makes
// it look like something. So it can use dice of its own, and nothing depends on where a spark went.
//
// Positions and speeds are in the field's own units, a tick at a time, like the flight's.
import type { FieldEvent } from "@journey-to-code/games";

export type Bit = "flash" | "fire" | "ring" | "spark" | "chunk" | "smoke" | "dust" | "flame" | "glint" | "snow";

export interface Particle {
  kind: Bit;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How long it lasts, in ticks, and how long it has. */
  life: number;
  age: number;
  /** How big, in the field's units (a radius, or a streak's length). */
  size: number;
  /** How much it falls: 1 is as a shell does. */
  weight: number;
  /** What slows it: 1 keeps all its speed every tick. */
  drag: number;
  colour: string;
  spin: number;
}

/** Words that pop up over the field: "Direct hit!". */
export interface Shout {
  text: string;
  x: number;
  y: number;
  age: number;
  life: number;
  tone: "good" | "bad" | "plain";
}

/** Something that keeps giving off smoke or flame for a while: a fire on the ground, a wreck. */
interface Burner {
  x: number;
  y: number;
  /** Ticks left; Infinity for a wreck. */
  left: number;
  kind: "flame" | "smoke";
  size: number;
  id?: string;
}

/** What the land is made of, for what flies out of it. */
export interface Earth {
  soil: string[];
  dust: string;
}

const MOST = 700;
const FALL = 0.25;

export class Fx {
  bits: Particle[] = [];
  shouts: Shout[] = [];
  private burners: Burner[] = [];
  /** How hard the screen is shaking, in pixels; it dies away by itself. */
  shake = 0;
  private seed = 12345;
  private clock = 0;

  /** Dice of its own: nothing here has to come out the same twice. */
  private dice(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private between(a: number, b: number) {
    return a + (b - a) * this.dice();
  }
  private add(p: Partial<Particle> & Pick<Particle, "kind" | "x" | "y" | "life" | "size">) {
    if (this.bits.length >= MOST) this.bits.splice(0, 40);
    this.bits.push({ vx: 0, vy: 0, age: 0, weight: 0, drag: 1, colour: "#fff", spin: 0, ...p });
  }

  clear() {
    this.bits = [];
    this.shouts = [];
    this.burners = this.burners.filter((b) => b.left === Infinity);
    this.shake = 0;
  }

  say(text: string, x: number, y: number, tone: Shout["tone"] = "plain") {
    this.shouts.push({ text, x, y, age: 0, life: 80, tone });
  }

  /** A gun going off: a flash at the muzzle, and smoke blown the way it fired. */
  muzzle(x: number, y: number, angle: number) {
    const [c, s] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
    this.add({ kind: "flash", x, y, life: 5, size: 34, colour: "#fff3c4" });
    for (let i = 0; i < 7; i++) this.add({ kind: "fire", x, y, vx: c * this.between(2, 7) + this.between(-1, 1), vy: s * this.between(2, 7) + this.between(-1, 1), life: this.between(8, 14), size: this.between(8, 16), drag: 0.86 });
    for (let i = 0; i < 6; i++) this.add({ kind: "smoke", x, y, vx: c * this.between(1, 4) + this.between(-0.6, 0.6), vy: s * this.between(1, 4) + this.between(0, 0.8), life: this.between(30, 55), size: this.between(10, 20), drag: 0.93, colour: "#cfcfcf" });
    this.shake = Math.max(this.shake, 3);
  }

  /** A puff behind something in the air. */
  trail(x: number, y: number, look: string, small: boolean) {
    if (look === "beam") return;
    if (look === "fire") this.add({ kind: "fire", x, y, vx: this.between(-0.4, 0.4), vy: this.between(-0.2, 0.6), life: this.between(8, 14), size: small ? 7 : 12, drag: 0.9 });
    else if (look === "orb") this.add({ kind: "glint", x: x + this.between(-8, 8), y: y + this.between(-8, 8), life: 16, size: 5, colour: "#9ad8ff" });
    else this.add({ kind: "smoke", x, y, vx: this.between(-0.3, 0.3), vy: this.between(0, 0.5), life: this.between(18, 30), size: small ? 5 : 8, drag: 0.95, colour: look === "dirt" ? "#a98d68" : "#e8e8e8" });
  }

  /** A blast: flash, fireball, ring, sparks, earth thrown up, and smoke that hangs about. */
  private blast(x: number, y: number, r: number, earth: Earth) {
    const big = Math.min(2.4, r / 70);
    this.add({ kind: "flash", x, y, life: 7, size: r * 2.4, colour: "#ffffff" });
    this.add({ kind: "ring", x, y, life: 18, size: r * 2.3, colour: "#fff1c9" });
    const balls = Math.round(10 + 8 * big);
    for (let i = 0; i < balls; i++) {
      const a = this.between(0, Math.PI * 2);
      const far = this.between(0, r * 0.7);
      this.add({ kind: "fire", x: x + Math.cos(a) * far, y: y + Math.sin(a) * far, vx: Math.cos(a) * this.between(0.6, 3.4) * big, vy: Math.sin(a) * this.between(0.6, 3.4) * big + 1.2, life: this.between(18, 36), size: r * this.between(0.5, 0.95), drag: 0.9 });
    }
    // A column of fire going up out of the middle of it.
    for (let i = 0; i < 4 + Math.round(3 * big); i++) this.add({ kind: "fire", x: x + this.between(-r, r) * 0.2, y, vx: this.between(-0.5, 0.5), vy: this.between(3, 8) * (0.7 + 0.3 * big), life: this.between(22, 40), size: r * this.between(0.4, 0.7), drag: 0.92 });
    const sparks = Math.round(10 + 10 * big);
    for (let i = 0; i < sparks; i++) {
      const a = this.between(0.1, Math.PI - 0.1);
      const fast = this.between(5, 15) * (0.7 + 0.3 * big);
      this.add({ kind: "spark", x, y, vx: Math.cos(a) * fast, vy: Math.sin(a) * fast, life: this.between(16, 38), size: this.between(8, 20), weight: 0.9, drag: 0.97, colour: this.dice() < 0.5 ? "#ffd27a" : "#fff6dc" });
    }
    const chunks = Math.round(8 + 9 * big);
    for (let i = 0; i < chunks; i++) {
      const a = this.between(0.25, Math.PI - 0.25);
      const fast = this.between(4, 12) * (0.7 + 0.3 * big);
      this.add({ kind: "chunk", x: x + this.between(-r, r) * 0.4, y, vx: Math.cos(a) * fast, vy: Math.sin(a) * fast, life: this.between(50, 95), size: this.between(4, 10) * (0.8 + 0.2 * big), weight: 1, drag: 0.99, colour: earth.soil[Math.floor(this.dice() * earth.soil.length)]!, spin: this.between(-0.4, 0.4) });
    }
    const puffs = Math.round(5 + 4 * big);
    for (let i = 0; i < puffs; i++) this.add({ kind: "smoke", x: x + this.between(-r, r) * 0.5, y: y + this.between(0, r * 0.4), vx: this.between(-0.7, 0.7), vy: this.between(0.5, 1.6), life: this.between(60, 120), size: r * this.between(0.35, 0.7), drag: 0.97, colour: this.dice() < 0.5 ? "#4a4540" : "#6b645c" });
    this.shake = Math.max(this.shake, Math.min(22, r / 9));
  }

  /** Earth thrown about without a bang: a heap landing, a skip, a bore. */
  private scatter(x: number, y: number, r: number, earth: Earth, much: number) {
    for (let i = 0; i < much; i++) {
      const a = this.between(0.3, Math.PI - 0.3);
      const fast = this.between(2, 8);
      this.add({ kind: "chunk", x: x + this.between(-r, r) * 0.5, y, vx: Math.cos(a) * fast, vy: Math.sin(a) * fast, life: this.between(35, 70), size: this.between(3, 8), weight: 1, drag: 0.99, colour: earth.soil[Math.floor(this.dice() * earth.soil.length)]!, spin: this.between(-0.4, 0.4) });
    }
    for (let i = 0; i < Math.ceil(much / 2); i++) this.add({ kind: "dust", x: x + this.between(-r, r) * 0.6, y: y + this.between(0, 10), vx: this.between(-1.4, 1.4), vy: this.between(0.2, 1.2), life: this.between(30, 60), size: this.between(14, 30) + r * 0.2, drag: 0.94, colour: earth.dust });
  }

  /** What an event of a flight looks like. */
  event(e: FieldEvent, earth: Earth) {
    if (e.kind === "burst") {
      // A shell with no bang to speak of (a tracer) is a spark and a puff.
      if (e.r < 12) this.scatter(e.x, e.y, 10, earth, 3);
      else this.blast(e.x, e.y, e.r, earth);
    } else if (e.kind === "fire") {
      this.add({ kind: "flash", x: e.x, y: e.y, life: 5, size: e.r * 1.3, colour: "#ffd9a0" });
      for (let i = 0; i < 14; i++) this.add({ kind: "fire", x: e.x + this.between(-e.r, e.r) * 0.6, y: e.y + this.between(0, 12), vx: this.between(-1.2, 1.2), vy: this.between(1, 4), life: this.between(18, 34), size: e.r * this.between(0.25, 0.5), drag: 0.93 });
      this.burners.push({ x: e.x, y: e.y, left: 150, kind: "flame", size: e.r * 0.5 });
      this.shake = Math.max(this.shake, 4);
    } else if (e.kind === "heap") {
      this.scatter(e.x, e.y + e.r * 0.5, e.r, earth, 16);
      this.shake = Math.max(this.shake, 5);
    } else if (e.kind === "skip") {
      this.scatter(e.x, e.y, 16, earth, 5);
      for (let i = 0; i < 5; i++) this.add({ kind: "spark", x: e.x, y: e.y, vx: this.between(-5, 5), vy: this.between(2, 7), life: 14, size: 8, weight: 0.9, colour: "#ffe2a0" });
    } else if (e.kind === "bore") {
      this.scatter(e.x, e.y, 12, earth, 2);
    } else if (e.kind === "split") {
      this.add({ kind: "flash", x: e.x, y: e.y, life: 6, size: 60, colour: "#ffffff" });
      for (let i = 0; i < 12; i++) {
        const a = this.between(0, Math.PI * 2);
        this.add({ kind: "spark", x: e.x, y: e.y, vx: Math.cos(a) * this.between(3, 8), vy: Math.sin(a) * this.between(3, 8), life: 16, size: 10, weight: 0.4, colour: "#fff2c0" });
      }
    } else if (e.kind === "carry") {
      this.warp(e.x, e.y + 20);
    }
    for (const hit of e.hits) if (hit.damage > 0) for (let i = 0; i < 6; i++) this.add({ kind: "spark", x: e.x, y: e.y, vx: this.between(-9, 9), vy: this.between(3, 12), life: 22, size: 12, weight: 0.9, colour: "#ffffff" });
  }

  /** A ring of light where a tank leaves or arrives. */
  warp(x: number, y: number) {
    this.add({ kind: "ring", x, y, life: 20, size: 90, colour: "#9ad8ff" });
    this.add({ kind: "flash", x, y, life: 8, size: 70, colour: "#cfeaff" });
    for (let i = 0; i < 22; i++) {
      const a = this.between(0, Math.PI * 2);
      this.add({ kind: "glint", x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30, vx: Math.cos(a) * this.between(0.5, 3), vy: Math.sin(a) * this.between(0.5, 3) + 1, life: this.between(20, 40), size: 6, colour: "#9ad8ff" });
    }
  }

  /** A tank knocked out: a second, dirtier bang, and it smokes for the rest of the game. */
  wreck(id: string, x: number, y: number, earth: Earth) {
    this.blast(x, y, 120, earth);
    for (let i = 0; i < 10; i++) this.add({ kind: "chunk", x, y, vx: this.between(-9, 9), vy: this.between(5, 15), life: 90, size: this.between(5, 11), weight: 1, drag: 0.99, colour: "#2a2a2a", spin: this.between(-0.5, 0.5) });
    this.smoulder(id, x, y);
  }
  /** Keep a wreck smoking (asked every frame: it is only added once, and follows the wreck down a hole). */
  smoulder(id: string, x: number, y: number) {
    const has = this.burners.find((b) => b.id === id);
    if (has) Object.assign(has, { x, y });
    else this.burners.push({ id, x, y, left: Infinity, kind: "smoke", size: 16 });
  }

  /** Move everything on by `ticks` (a fraction is fine). `wind` leans the smoke; `ground` says where earth stops falling. */
  step(ticks: number, wind: number, gravity: number, ground: (x: number) => number) {
    this.clock += ticks;
    this.shake *= Math.pow(0.86, ticks);
    if (this.shake < 0.3) this.shake = 0;
    for (const b of this.burners) {
      b.left -= ticks;
      // About one bit of flame every two ticks, one of smoke every six.
      if (this.dice() < ticks / (b.kind === "flame" ? 2 : 6)) {
        if (b.kind === "flame") this.add({ kind: "flame", x: b.x + this.between(-b.size, b.size), y: ground(b.x) + 4, vx: this.between(-0.3, 0.3), vy: this.between(0.8, 2.2), life: this.between(14, 26), size: this.between(8, 16), drag: 0.96 });
        else this.add({ kind: "smoke", x: b.x + this.between(-8, 8), y: b.y + 26, vx: this.between(-0.2, 0.2), vy: this.between(0.7, 1.4), life: this.between(70, 120), size: this.between(10, 18), drag: 0.985, colour: "#3d3a37" });
      }
    }
    this.burners = this.burners.filter((b) => b.left > 0);
    const fall = (FALL * gravity) / 100;
    for (const p of this.bits) {
      p.age += ticks;
      if (p.weight) p.vy -= fall * p.weight * ticks;
      if (p.kind === "smoke" || p.kind === "dust" || p.kind === "flame") p.vx += wind * 0.004 * ticks;
      const slow = Math.pow(p.drag, ticks);
      p.vx *= slow;
      p.vy *= slow;
      p.x += p.vx * ticks;
      p.y += p.vy * ticks;
      // Earth comes to rest on the ground it lands on, and is gone a moment after.
      if (p.kind === "chunk" && p.vy < 0 && p.y <= ground(p.x)) {
        p.y = ground(p.x);
        p.vx = 0;
        p.vy = 0;
        p.weight = 0;
        p.spin = 0;
        p.life = Math.min(p.life, p.age + 14);
      }
    }
    this.bits = this.bits.filter((p) => p.age < p.life);
    for (const s of this.shouts) s.age += ticks;
    this.shouts = this.shouts.filter((s) => s.age < s.life);
  }

  /** Whether anything is still moving, so the screen knows to keep drawing. */
  get busy() {
    return this.bits.length > 0 || this.shouts.length > 0 || this.shake > 0 || this.burners.length > 0;
  }
  /** Where the screen is shaken to, this instant. */
  get jolt(): [number, number] {
    if (!this.shake) return [0, 0];
    return [Math.sin(this.clock * 1.9) * this.shake, Math.cos(this.clock * 2.7) * this.shake * 0.7];
  }
}
