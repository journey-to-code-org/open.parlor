// Sing-along: Old MacDonald Had a Farm (a traditional song, free for anyone to sing), one verse per
// animal. The words show on the screen, a line at a time, so a grown-up can sing along; the tune is
// played softly underneath, or the grown-up's own recorded verse in its place.
import type { Thing } from "./things";

/** A note: its MIDI number, and how many beats it lasts. */
type Note = readonly [number, number];
export interface Line {
  text: string;
  notes: Note[];
  /** Whether this line is the animal's own sound: it is drawn bigger. */
  sound?: boolean;
}

// In G: G4 = 67, A4 = 69, B4 = 71, D4 = 62, E4 = 64.
const G = 67, A = 69, B = 71, D = 62, E = 64;
const OLD_MAC: Note[] = [[G, 1], [G, 1], [G, 1], [D, 1], [E, 1], [E, 1], [D, 2]];
const EIEIO = (last: number): Note[] => [[B, 1], [B, 1], [A, 1], [A, 1], [G, last]];

const an = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** The verse for one animal, line by line with its notes. */
export function verse(animal: Thing): Line[] {
  const name = animal.word.toLowerCase();
  const s = animal.sing ?? "la";
  return [
    { text: "Old MacDonald had a farm,", notes: OLD_MAC },
    { text: "E-I-E-I-O!", notes: EIEIO(3) },
    { text: `And on that farm he had ${an(name)} ${name},`, notes: [[D, 1], [G, 1], [G, 1], [G, 1], [D, 1], [E, 1], [E, 1], [D, 2]] },
    { text: "E-I-E-I-O!", notes: EIEIO(3) },
    { text: `With a ${s} ${s} here, and a ${s} ${s} there,`, notes: [[D, 0.5], [D, 0.5], [G, 1], [G, 1], [G, 1.5], [D, 0.5], [D, 0.5], [G, 1], [G, 1], [G, 1.5]], sound: true },
    { text: `Here a ${s}, there a ${s}, everywhere a ${s} ${s}!`, notes: [[G, 0.5], [G, 0.5], [G, 1], [G, 0.5], [G, 0.5], [G, 1], [G, 0.5], [G, 0.5], [G, 0.5], [G, 0.5], [G, 1], [G, 1]], sound: true },
    { text: "Old MacDonald had a farm,", notes: OLD_MAC },
    { text: "E-I-E-I-O!", notes: EIEIO(4) },
  ];
}

export const BEAT_MS = 480;
/** When each line starts, in milliseconds from the start of the verse, and how long the verse lasts. */
export function timing(lines: Line[], beat = BEAT_MS): { starts: number[]; length: number } {
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.notes.reduce((sum, [, beats]) => sum + beats, 0) * beat;
  }
  return { starts, length: at };
}

/** The animals that can be sung about. */
export const singable = (things: readonly Thing[]) => things.filter((th) => th.category === "animals" && th.sing);

/** Play the tune of a verse: soft, round notes, like a music box. Returns a way to stop it. */
export function playTune(lines: Line[], context: AudioContext | null, beat = BEAT_MS): () => void {
  if (!context) return () => {};
  const out = context.createGain();
  out.gain.value = 0.16;
  out.connect(context.destination);
  let at = context.currentTime + 0.05;
  for (const line of lines) {
    for (const [midi, beats] of line.notes) {
      const length = (beats * beat) / 1000;
      const osc = context.createOscillator();
      const env = context.createGain();
      osc.type = "triangle";
      osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(1, at + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.12, length * 0.95));
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + length);
      at += length;
    }
  }
  return () => {
    try {
      out.disconnect();
    } catch {}
  };
}
