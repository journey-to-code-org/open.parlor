// What Zubra Quest sounds like: a blip or a burst for each thing that happens, and a tune under it
// that changes with where the hero is. All of it is made on the spot with the arcade's two
// oscillators and its noise (arcade/sounds.ts), under the same switch as every other sound.
import type { ArcadeEvent } from "@journey-to-code/games";
import { blip, crash, notes } from "../arcade/sounds";

export function questSounds(events: readonly ArcadeEvent[]) {
  for (const e of events) {
    switch (e.kind) {
      case "swing": blip(520, 0.06, "square", 0.03, 300); break;
      case "cut": crash(0.08, 0.04); break;
      case "hit": blip(220, 0.08, "square", 0.05, -100); break;
      case "clink": blip(1400, 0.05, "triangle", 0.05); break;
      case "boom": crash(0.2, 0.08); break;
      case "bigboom": crash(0.9, 0.16); notes([262, 330, 392, 523, 659], 120, 0.2); break;
      case "blast": crash(0.4, 0.14); break;
      case "crumble": crash(0.25, 0.06); break;
      case "hurt": blip(160, 0.2, "sawtooth", 0.06, -80); break;
      case "down": notes([392, 330, 262, 196], 150, 0.2); break;
      case "get": notes([523, 659, 784, 1047], 110, 0.2); break;
      case "chest": notes([784, 988], 80); break;
      case "pick": blip(1200, 0.05, "square", 0.03, 300); break;
      case "unlock": case "open": notes([392, 523], 90); break;
      case "arrow": blip(900, 0.08, "triangle", 0.04, -500); break;
      case "set": blip(200, 0.05, "square", 0.04); break;
      case "hook": blip(700, 0.1, "square", 0.03, 400); break;
      case "latch": blip(1000, 0.05, "triangle", 0.05); break;
      case "spit": blip(300, 0.07, "square", 0.03, -150); break;
      case "tell": blip(880, 0.1, "square", 0.03); break;
      case "quake": crash(0.3, 0.1); break;
      case "buy": notes([659, 880], 80); break;
      case "empty": blip(140, 0.1, "square", 0.04); break;
    }
  }
}

/** A note's pitch from its name: "A4" is 440. A dot is a rest. */
function pitch(name: string): number {
  const at = "C C#D D#E F F#G G#A A#B ".indexOf(name.length === 3 ? name.slice(0, 2) : `${name[0]} `) / 2;
  const octave = Number(name[name.length - 1]);
  return 440 * 2 ** ((at - 9) / 12 + octave - 4);
}
interface Tune { lead: string[]; bass: string[]; ms: number }
const tune = (ms: number, lead: string, bass: string): Tune => ({ ms, lead: lead.split(/\s+/).filter((n) => n !== "|"), bass: bass.split(/\s+/).filter((n) => n !== "|") });
/** The tunes, by where the hero is. Each is a few bars that go round. */
const TUNES: Record<string, Tune> = {
  over: tune(150,
    "C5 . E5 G5 . G5 A5 G5 | E5 . C5 D5 . E5 D5 . | C5 . E5 G5 . C6 B5 A5 | G5 . . . F5 E5 D5 . | E5 . G5 C6 . C6 D6 C6 | A5 . F5 G5 . A5 G5 . | E5 . C5 D5 . E5 F5 D5 | C5 . . . . . . .",
    "C3 . G3 . C3 . G3 . | A2 . E3 . G2 . D3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . B2 . | C3 . G3 . C3 . G3 . | F2 . C3 . G2 . D3 . | A2 . E3 . F2 . G2 . | C3 . G2 . C3 . . ."),
  den: tune(210,
    "A4 . . C5 . . B4 . | A4 . . E4 . . . . | F4 . . A4 . . G#4 . | E4 . . . . . . . | A4 . . C5 . . D5 . | E5 . . C5 . . . . | D5 . . B4 . . G#4 . | A4 . . . . . . .",
    "A2 . . . E2 . . . | A2 . . . C3 . . . | F2 . . . D2 . . . | E2 . . . E2 . . . | A2 . . . E2 . . . | C3 . . . A2 . . . | D2 . . . E2 . . . | A2 . . . . . . ."),
  boss: tune(105,
    "E5 E5 . E5 G5 . F#5 E5 | D5 D5 . D5 F5 . E5 D5 | C5 C5 . C5 E5 . D5 C5 | B4 . D#5 . F#5 . B5 . | E5 E5 . E5 G5 . A5 B5 | C6 . B5 . A5 . G5 . | F#5 . E5 . D#5 . F#5 . | E5 . . . . . . .",
    "E2 E3 E2 E3 E2 E3 E2 E3 | D2 D3 D2 D3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 | B1 B2 B1 B2 B1 B2 B2 B2 | E2 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3 | B1 B2 B1 B2 B1 B2 B2 B2 | E2 . E3 . E2 . . ."),
  cave: tune(170,
    "G4 . B4 D5 . B4 G4 . | A4 . C5 E5 . C5 A4 . | B4 . D5 G5 . D5 B4 . | A4 . F#4 D4 . . . .",
    "G2 . . D3 . . G2 . | A2 . . E3 . . A2 . | G2 . . D3 . . G2 . | D2 . . A2 . . D3 ."),
};

/** The tune under the game. `play` changes it (or stops it, with null); it carries on by itself until then. */
export function questMusic() {
  let name: string | null = null;
  let step = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const beat = () => {
    const t = name ? TUNES[name] : undefined;
    if (!t) return;
    const lead = t.lead[step % t.lead.length]!;
    const bass = t.bass[step % t.bass.length]!;
    if (lead !== ".") blip(pitch(lead), (t.ms / 1000) * 1.6, "square", 0.022);
    if (bass !== ".") blip(pitch(bass), (t.ms / 1000) * 1.9, "triangle", 0.05);
    step++;
  };
  return {
    play(next: string | null) {
      if (next === name) return;
      name = next;
      step = 0;
      clearInterval(timer);
      if (next && TUNES[next]) timer = setInterval(beat, TUNES[next]!.ms);
    },
    stop() {
      clearInterval(timer);
      name = null;
    },
  };
}
