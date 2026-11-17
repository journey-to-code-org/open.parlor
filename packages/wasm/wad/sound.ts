// The engine's sound effects, to and from samples. A sound lump is in the format of DMX, the
// sound library the game shipped with: a short header, then one channel of unsigned 8-bit samples.

export interface Sound {
  /** Samples a second. */
  rate: number;
  /** One channel, from -1 to 1. */
  samples: Float32Array;
}

/** The rate the game's own sounds are at. Any rate plays; this one is what the engine expects most. */
export const RATE = 11025;
/** A sound longer than this is cut: these are effects, not songs. */
export const LONGEST_SECONDS = 15;

/** The sound in a lump, or null if the lump isn't one. */
export function decodeDmx(lump: Uint8Array): Sound | null {
  if (lump.length <= 8 || lump[0] !== 3 || lump[1] !== 0) return null;
  const view = new DataView(lump.buffer, lump.byteOffset, lump.byteLength);
  const rate = view.getUint16(2, true);
  const length = Math.min(view.getUint32(4, true), lump.length - 8);
  // The first and last 16 samples are padding, when the lump is long enough to have them.
  const pad = length > 48 ? 16 : 0;
  const samples = new Float32Array(length - pad * 2);
  for (let i = 0; i < samples.length; i++) samples[i] = (lump[8 + pad + i]! - 128) / 128;
  return rate > 0 && samples.length > 0 ? { rate, samples } : null;
}

/** A sound lump of these samples. */
export function encodeDmx(sound: Sound): Uint8Array {
  const rate = Math.round(sound.rate);
  if (rate < 1 || rate > 65535) throw new Error("A sound for the engine is at most 65535 samples a second.");
  const samples = sound.samples.subarray(0, rate * LONGEST_SECONDS);
  const byte = (sample: number) => Math.max(0, Math.min(255, Math.round(sample * 127 + 128)));
  const lump = new Uint8Array(8 + 32 + samples.length);
  const view = new DataView(lump.buffer);
  view.setUint16(0, 3, true);
  view.setUint16(2, rate, true);
  view.setUint32(4, samples.length + 32, true);
  // The padding repeats the first and last samples, as the original tools did.
  lump.fill(byte(samples[0] ?? 0), 8, 24);
  for (let i = 0; i < samples.length; i++) lump[24 + i] = byte(samples[i]!);
  lump.fill(byte(samples.at(-1) ?? 0), 24 + samples.length);
  return lump;
}

/** The same sound at another rate. Going down, each new sample is the average of the old ones it covers, so nothing harsh is left behind. */
export function resample(sound: Sound, rate: number): Sound {
  if (sound.rate === rate) return sound;
  const step = sound.rate / rate;
  const samples = new Float32Array(Math.max(1, Math.floor(sound.samples.length / step)));
  for (let i = 0; i < samples.length; i++) {
    const from = i * step;
    if (step <= 1) {
      // Going up: a straight line between the two old samples either side.
      const at = Math.floor(from);
      const next = sound.samples[Math.min(at + 1, sound.samples.length - 1)]!;
      samples[i] = sound.samples[at]! + (next - sound.samples[at]!) * (from - at);
    } else {
      const start = Math.floor(from);
      const end = Math.min(sound.samples.length, Math.max(start + 1, Math.floor(from + step)));
      let sum = 0;
      for (let at = start; at < end; at++) sum += sound.samples[at]!;
      samples[i] = sum / (end - start);
    }
  }
  return { rate, samples };
}

/** Several channels as one: their average. */
export function mixDown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const mixed = new Float32Array(channels[0]!.length);
  for (const channel of channels) for (let i = 0; i < mixed.length; i++) mixed[i]! += channel[i]! / channels.length;
  return mixed;
}
