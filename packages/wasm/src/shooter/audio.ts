// Sound effects through Web Audio. The engine hands over each effect as it sits in the WAD (a DMX
// lump: a short header, then unsigned 8-bit samples); it is decoded once and kept.
//
// And the song. The engine hands over the song's lump, whole. A lump that only names a song
// ("song:steel-teeth") is one of the game's own: its file is fetched, once, and kept for playing
// with no connection. Anything else is played if it is sound the browser can decode (an MP3, an
// Ogg, a WAV someone put in a song's place), round and round if the engine says so, and is
// silence if it isn't.
import { asset } from "../../host/assets.ts";
import { decodeDmx, songNamed } from "../../wad/sound.ts";
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

/** The game's songs are mastered loud, and the effects are short and plain: a song is played under them. */
const SONG_LEVEL = 0.6;

/** `songs` is where each of the game's own songs is, by name. */
export function createAudio(songs: Record<string, string> = {}): Audio {
  const Context = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = Context ? new Context() : null;
  const buffers = new Map<number, AudioBuffer | null>();
  const voices = new Map<number, Voice>();
  let muted = false;
  // The song: one at a time. `asked` tells a song that finishes decoding late that it was replaced.
  const songGain = context?.createGain();
  songGain?.connect(context!.destination);
  let song: AudioBufferSourceNode | null = null;
  let asked = 0;
  const stopSong = () => {
    asked++;
    try {
      song?.stop();
    } catch {}
    song?.disconnect();
    song = null;
  };

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
    music: {
      play(data, looping) {
        stopSong();
        if (!context) return;
        const mine = asked;
        const named = songNamed(data);
        // A song that is only named is fetched; one whose file can't be had (no connection, and never played before) is silence.
        const bytes = named === undefined ? Promise.resolve(data) : songs[named] ? asset(songs[named]) : Promise.reject(new Error("no such song"));
        // What isn't sound the browser knows is silence too.
        void bytes.then((sound) => context.decodeAudioData(sound.buffer.slice(sound.byteOffset, sound.byteOffset + sound.byteLength) as ArrayBuffer)).then(
          (buffer) => {
            if (mine !== asked) return;
            song = context.createBufferSource();
            song.buffer = buffer;
            song.loop = looping;
            song.connect(songGain!);
            song.start();
          },
          () => {},
        );
      },
      stop: stopSong,
      volume: (volume) => void (songGain && (songGain.gain.value = level(volume) * SONG_LEVEL)),
      pause: (paused) => void (song && (song.playbackRate.value = paused ? 0 : 1)),
    },
    mute: (on) => void (muted = on),
    unlock() {
      if (context?.state === "suspended") void context.resume();
    },
    close() {
      for (const channel of [...voices.keys()]) stop(channel);
      stopSong();
      void context?.close();
    },
  };
}
