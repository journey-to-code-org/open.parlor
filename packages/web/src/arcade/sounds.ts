// The arcade's sounds: short synthesised blips and bursts, made with the Web Audio API like every
// other sound in the parlor, and under the same switch (the table's sound setting).
import { loadFeedbackSettings } from "../feedback/sounds";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let on = true;

/** Call from a tap or a key press: browsers only start audio then. */
export function wakeArcadeSound() {
  on = loadFeedbackSettings().sound;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctx && Ctor) ctx = new Ctor();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => undefined);
  } catch {
    ctx = null;
  }
}
export const setArcadeSound = (sound: boolean) => (on = sound);
/** The audio context, when sound is on and running: for a sound that has to be held and bent, like an engine. */
export const arcadeAudio = (): AudioContext | null => (on && ctx?.state === "running" ? ctx : null);

export function blip(freq: number, dur: number, type: OscillatorType = "square", vol = 0.05, slide = 0) {
  if (!ctx || !on || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

/** A burst of noise, falling away: an explosion. */
export function crash(dur: number, vol: number) {
  if (!ctx || !on || ctx.state !== "running") return;
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
}

/** A few notes one after the other. */
export const notes = (freqs: number[], gap = 90, dur = 0.14) => freqs.forEach((f, i) => setTimeout(() => blip(f, dur, "triangle", 0.07), i * gap));
