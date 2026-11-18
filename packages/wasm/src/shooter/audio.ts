// Sound effects through Web Audio. The engine hands over each effect as it sits in the WAD (a DMX
// lump: a short header, then unsigned 8-bit samples); it is decoded once and kept.
import { decodeDmx } from "../../wad/sound.ts";
import type { SoundHost } from "./engine.ts";

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

export interface Audio extends SoundHost {
  /** No new sounds while this is on: a game being caught up on would play them all at once. */
  mute(on: boolean): void;
  /** Browsers start audio suspended until a tap or a key: call this from one. */
  unlock(): void;
  /** Silence everything and let the device go (the page is closing the game). */
  close(): void;
}

export function createAudio(): Audio {
  const Context = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = Context ? new Context() : null;
  const buffers = new Map<number, AudioBuffer | null>();
  const voices = new Map<number, Voice>();
  let muted = false;

  const level = (volume: number) => Math.max(0, Math.min(1, volume / 127));
  const side = (separation: number) => Math.max(-1, Math.min(1, (separation - 127) / 127));

  function stop(channel: number) {
    const voice = voices.get(channel);
    if (!voice) return;
    voices.delete(channel);
    voice.source.onended = null;
    try {
      voice.source.stop();
    } catch {}
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.pan.disconnect();
  }

  return {
    start(channel, lump, data, volume, separation) {
      if (!context || context.state !== "running" || muted) return;
      let buffer = buffers.get(lump);
      if (buffer === undefined) {
        const decoded = decodeDmx(data());
        buffer = decoded ? context.createBuffer(1, decoded.samples.length, decoded.rate) : null;
        buffer?.getChannelData(0).set(decoded!.samples);
        buffers.set(lump, buffer);
      }
      stop(channel);
      if (!buffer) return;
      const voice: Voice = { source: context.createBufferSource(), gain: context.createGain(), pan: context.createStereoPanner() };
      voice.source.buffer = buffer;
      voice.gain.gain.value = level(volume);
      voice.pan.pan.value = side(separation);
      voice.source.connect(voice.gain).connect(voice.pan).connect(context.destination);
      voice.source.onended = () => stop(channel);
      voices.set(channel, voice);
      voice.source.start();
    },
    update(channel, volume, separation) {
      const voice = voices.get(channel);
      if (!voice) return;
      voice.gain.gain.value = level(volume);
      voice.pan.pan.value = side(separation);
    },
    stop,
    playing: (channel) => voices.has(channel),
    mute: (on) => void (muted = on),
    unlock() {
      if (context?.state === "suspended") void context.resume();
    },
    close() {
      for (const channel of [...voices.keys()]) stop(channel);
      void context?.close();
    },
  };
}
