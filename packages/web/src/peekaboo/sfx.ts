// Peekaboo's sound effects, all made here with Web Audio (no files to fetch, so they work offline):
// a marimba note for every tap, so slapping the screen makes a tune; little jingles for a find, a
// blanket and a boing; and a cartoon sound for each picture (a moo, a beep-beep, a bounce), played
// after its name is said.
import type { Thing } from "./things";

let audio: AudioContext | null = null;
let master: AudioNode | null = null;
const context = () => {
  if (!audio) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === "suspended") void audio.resume().catch(() => {});
  return audio;
};
/** The page's one audio context, woken if it was asleep. */
export const audioContext = () => context();
/** Where every effect goes: through a limiter, so several at once never crackle or startle. */
export function output(): AudioNode | null {
  const ctx = context();
  if (!ctx) return null;
  if (!master) {
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -14;
    limit.ratio.value = 8;
    limit.attack.value = 0.003;
    limit.release.value = 0.2;
    limit.connect(ctx.destination);
    master = limit;
  }
  return master;
}

interface Voice {
  type: OscillatorType;
  /** The pitch over the sound: [how far through (0 to 1), Hz]. */
  f: [number, number][];
  len: number;
  at?: number;
  vol?: number;
  /** Vibrato: [times a second, Hz either way]. */
  vib?: [number, number];
  /** Tremolo: [times a second, depth 0 to 1]. */
  trem?: [number, number];
  /** A low-pass filter at this many Hz, or a band-pass [Hz, Q]. */
  lp?: number;
  bp?: [number, number];
  /** How quickly it starts, in seconds. */
  attack?: number;
}

function voiced(v: Voice) {
  const ctx = context();
  const out = output();
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + 0.01 + (v.at ?? 0);
  const vol = v.vol ?? 0.2;
  const osc = ctx.createOscillator();
  osc.type = v.type;
  osc.frequency.setValueAtTime(v.f[0]![1], t0);
  for (const [p, hz] of v.f.slice(1)) osc.frequency.exponentialRampToValueAtTime(hz, t0 + p * v.len);
  const stops: OscillatorNode[] = [osc];
  if (v.vib) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = v.vib[0];
    depth.gain.value = v.vib[1];
    lfo.connect(depth).connect(osc.frequency);
    stops.push(lfo);
  }
  let node: AudioNode = osc;
  if (v.lp || v.bp) {
    const filter = ctx.createBiquadFilter();
    filter.type = v.lp ? "lowpass" : "bandpass";
    filter.frequency.value = v.lp ?? v.bp![0];
    if (v.bp) filter.Q.value = v.bp[1];
    node = node.connect(filter);
  }
  if (v.trem) {
    const wobble = ctx.createGain();
    wobble.gain.value = 1 - v.trem[1] / 2;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = v.trem[0];
    depth.gain.value = v.trem[1] / 2;
    lfo.connect(depth).connect(wobble.gain);
    stops.push(lfo);
    node = node.connect(wobble);
  }
  const env = ctx.createGain();
  const attack = Math.min(v.attack ?? 0.02, v.len / 3);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  env.gain.setValueAtTime(vol, t0 + v.len * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + v.len);
  node.connect(env).connect(out);
  for (const s of stops) {
    s.start(t0);
    s.stop(t0 + v.len + 0.05);
  }
}

let hiss: AudioBuffer | null = null;
/** A puff of noise through a filter that sweeps from one pitch to another. */
function noise(at: number, len: number, vol: number, from: number, to: number, q = 1) {
  const ctx = context();
  const out = output();
  if (!ctx || !out) return;
  if (!hiss) {
    hiss = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = hiss.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + 0.01 + at;
  const src = ctx.createBufferSource();
  src.buffer = hiss;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + len);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.03, len / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(filter).connect(env).connect(out);
  src.start(t0);
  src.stop(t0 + len + 0.05);
}

/** A marimba note: round, with a bright knock at the front that dies away at once. */
function marimba(hz: number, at = 0, vol = 0.22, len = 0.5) {
  voiced({ type: "sine", f: [[0, hz], [1, hz]], len, at, vol, attack: 0.004 });
  voiced({ type: "sine", f: [[0, hz * 4], [1, hz * 4]], len: 0.09, at, vol: vol * 0.3, attack: 0.002 });
}

// C major pentatonic over two octaves: any note after any other sounds like a tune.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
let step = 2;
const note = (i: number) => SCALE[((i % SCALE.length) + SCALE.length) % SCALE.length]!;

export const sounds = {
  /** A picture appears: the next note of a wandering tune, so tap after tap plays music. */
  pop() {
    step = Math.max(0, Math.min(SCALE.length - 1, step + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]!));
    marimba(note(step));
    noise(0, 0.05, 0.05, 2500, 5000, 0.7);
  },
  /** A touch that did nothing else: the quietest tick, so every touch is answered. */
  tick() {
    marimba(note(step) / 2, 0, 0.07, 0.15);
  },
  /** Found it: a run up the scale, and sparkles over the top. */
  cheer() {
    [0, 2, 3, 5].forEach((n, i) => marimba(note(n), i * 0.09, 0.13, 0.45));
    marimba(note(5) * 1.5, 0.4, 0.1, 0.7);
    for (let i = 0; i < 6; i++) marimba(note(5 + Math.floor(Math.random() * 4)) * 2, 0.45 + i * 0.07, 0.05, 0.25);
  },
  /** A gentle "boop" for a try that wasn't it: no buzzer, nothing that sounds like losing. */
  boop() {
    voiced({ type: "sine", f: [[0, 330], [1, 250]], len: 0.22, vol: 0.14 });
  },
  /** The blanket coming off, or a page turning: a whoosh and a rising whistle. */
  swish() {
    noise(0, 0.35, 0.22, 400, 3200, 0.8);
    voiced({ type: "sine", f: [[0, 300], [1, 1100]], len: 0.3, vol: 0.08 });
  },
  /** A picture poked: a springy boing. */
  boing() {
    voiced({ type: "sine", f: [[0, 220], [0.25, 520], [1, 300]], len: 0.35, vol: 0.2, vib: [22, 30] });
  },
  /** A soft sparkle, to say "I'm still here" when nobody has touched for a while. */
  twinkle() {
    [5, 7, 6, 8].forEach((n, i) => marimba(note(n), i * 0.12, 0.08, 0.4));
  },
};

const beep = (at: number, len = 0.14) => {
  voiced({ type: "square", f: [[0, 440], [1, 440]], len, at, vol: 0.09, lp: 2200 });
  voiced({ type: "square", f: [[0, 554], [1, 554]], len, at, vol: 0.09, lp: 2200 });
};
const jingle = (notes: number[], gap = 0.11, vol = 0.11) => notes.forEach((n, i) => marimba(note(n), i * gap, vol, 0.4));

/** Each picture's own sound. Every one is short (under a second and a quarter) and soft at the edges. */
const EFFECTS: Record<string, () => void> = {
  "animals:cow": () => voiced({ type: "sawtooth", f: [[0, 105], [0.3, 150], [1, 100]], len: 0.95, vol: 0.24, lp: 650, attack: 0.08 }),
  "animals:dog": () => [0, 0.24].forEach((at) => (voiced({ type: "sawtooth", f: [[0, 320], [1, 150]], len: 0.14, at, vol: 0.24, lp: 1300 }), noise(at, 0.1, 0.1, 900, 400))),
  "animals:cat": () => voiced({ type: "sawtooth", f: [[0, 520], [0.3, 820], [1, 430]], len: 0.6, vol: 0.42, bp: [1500, 2.5], vib: [6, 14], attack: 0.06 }),
  "animals:duck": () => [0, 0.2, 0.4].forEach((at) => voiced({ type: "sawtooth", f: [[0, 440], [1, 300]], len: 0.13, at, vol: 0.6, bp: [1500, 4] })),
  "animals:pig": () => [0, 0.26].forEach((at) => voiced({ type: "sawtooth", f: [[0, 150], [0.5, 230], [1, 140]], len: 0.2, at, vol: 0.6, bp: [900, 4], trem: [45, 0.9] })),
  "animals:sheep": () => voiced({ type: "sawtooth", f: [[0, 350], [1, 300]], len: 0.7, vol: 0.42, bp: [1100, 2], trem: [9, 0.75], attack: 0.05 }),
  "animals:horse": () => voiced({ type: "sawtooth", f: [[0, 950], [0.15, 1350], [1, 480]], len: 0.9, vol: 0.36, bp: [1500, 1.5], vib: [14, 90] }),
  "animals:chicken": () => {
    [0, 0.13, 0.26].forEach((at) => voiced({ type: "triangle", f: [[0, 720], [1, 500]], len: 0.07, at, vol: 0.2 }));
    voiced({ type: "triangle", f: [[0, 600], [0.5, 1050], [1, 700]], len: 0.22, at: 0.42, vol: 0.2 });
  },
  "animals:frog": () => [0, 0.3].forEach((at) => voiced({ type: "square", f: [[0, 170], [1, 270]], len: 0.2, at, vol: 0.16, lp: 900, trem: [38, 1] })),
  "animals:owl": () => {
    voiced({ type: "sine", f: [[0, 390], [1, 360]], len: 0.25, vol: 0.22, attack: 0.05 });
    voiced({ type: "sine", f: [[0, 390], [1, 330]], len: 0.55, at: 0.36, vol: 0.22, attack: 0.05 });
  },
  "animals:lion": () => (voiced({ type: "sawtooth", f: [[0, 85], [0.3, 130], [1, 65]], len: 1.1, vol: 0.3, lp: 480, trem: [26, 0.6], attack: 0.12 }), noise(0, 1.0, 0.08, 500, 200)),
  "animals:bee": () => voiced({ type: "sawtooth", f: [[0, 190], [0.5, 235], [1, 180]], len: 0.8, vol: 0.26, bp: [1200, 1], trem: [25, 0.5], attack: 0.1 }),
  "vehicles:car": () => (beep(0), beep(0.22)),
  "vehicles:bus": () => (beep(0, 0.18), beep(0.28, 0.3)),
  "vehicles:truck": () => (voiced({ type: "sawtooth", f: [[0, 70], [0.6, 120], [1, 95]], len: 0.9, vol: 0.26, lp: 420, trem: [22, 0.8], attack: 0.1 }), noise(0, 0.9, 0.05, 200, 500)),
  "vehicles:tractor": () => [0, 0.16, 0.32, 0.48, 0.64].forEach((at) => voiced({ type: "sawtooth", f: [[0, 95], [1, 70]], len: 0.11, at, vol: 0.28, lp: 500 })),
  "vehicles:train": () =>
    [0, 0.42].forEach((at) => {
      voiced({ type: "triangle", f: [[0, 740], [1, 740]], len: 0.34, at, vol: 0.12, attack: 0.04 });
      voiced({ type: "triangle", f: [[0, 932], [1, 932]], len: 0.34, at, vol: 0.12, attack: 0.04 });
      noise(at, 0.3, 0.04, 3000, 5000, 0.5);
    }),
  "vehicles:airplane": () => noise(0, 1.1, 0.8, 350, 1900, 1.2),
  "vehicles:fire-truck": () => voiced({ type: "sine", f: [[0, 620], [0.25, 920], [0.5, 620], [0.75, 920], [1, 620]], len: 1.1, vol: 0.16, attack: 0.05 }),
  "vehicles:boat": () => voiced({ type: "sawtooth", f: [[0, 140], [1, 138]], len: 0.8, vol: 0.24, lp: 520, attack: 0.1 }),
  "things:ball": () => [0, 0.24, 0.42, 0.55].forEach((at, i) => voiced({ type: "sine", f: [[0, 300], [0.2, 620 - i * 60], [1, 220]], len: 0.16 - i * 0.02, at, vol: 0.22 - i * 0.04 })),
  "things:apple": () => (noise(0, 0.09, 0.5, 2200, 3500, 1.5), noise(0.16, 0.07, 0.36, 2600, 1800, 1.5)),
  "things:teddy-bear": () => jingle([2, 4, 3, 5], 0.16, 0.12),
  "things:moon": () => jingle([5, 4, 2, 0], 0.2, 0.1),
  "things:sun": () => jingle([0, 2, 4, 5], 0.1, 0.09),
  "things:book": () => noise(0, 0.25, 0.32, 1500, 4000, 0.6),
  "things:cup": () => [0, 0.15, 0.3].forEach((at, i) => voiced({ type: "sine", f: [[0, 400 + i * 120], [1, 700 + i * 150]], len: 0.1, at, vol: 0.16 })),
  "shapes:star": () => jingle([5, 7, 6, 8, 7], 0.09, 0.1),
};

/**
 * Play a picture's own sound, if it has one. Things without one of their own get a little motif by
 * kind: shapes a step of the scale each (so each shape has its own note), colours a slide.
 */
export function effect(thing: Thing, order = 0): void {
  const own = EFFECTS[thing.id];
  if (own) return own();
  if (thing.category === "shapes") return jingle([order % 8, (order % 8) + 2], 0.14);
  if (thing.category === "colors") return jingle([order % 6, (order % 6) + 1, (order % 6) + 2], 0.07, 0.09);
  if (thing.category === "family" || thing.id.startsWith("mine:")) return [0, 2, 4].forEach((n) => marimba(note(n), 0, 0.12, 0.7));
  if (thing.category === "things") return jingle([3, 5], 0.12, 0.1);
}
export const EFFECT_IDS = Object.keys(EFFECTS);
