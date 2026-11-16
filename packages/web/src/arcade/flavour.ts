// What a game is called on the page, where that is more than its engine says. An engine is plain
// about itself ("Bombs", "Warning", a boss called Thunderhead): it is the same game whatever is
// painted over it. The parlor's Shitstorm is painted as exactly what its name says (it is raining
// that, you fly a plunger and shoot water, a bomb is a flush, and every fifth wave it hits the
// fan), so its words are changed to match here, in one place, for the setup screen, the corners of
// the table and the words on the field alike.
import type { ArcadeGameId } from "@journey-to-code/games";

interface Flavour {
  blurb?: string;
  tagline?: string;
  /** Whole phrases an engine says, and what the page says instead. */
  phrases?: Record<string, string>;
  /** Words changed wherever they turn up in a longer line (the controls, a rule's hint). */
  words?: [from: RegExp, to: string][];
}

const FLAVOURS: Partial<Record<ArcadeGameId, Flavour>> = {
  skyfire: {
    blurb: "It's raining you-know-what: dodge it, flush it, beat your score",
    tagline:
      "The forecast was right. Fly the plunger through a storm of pigeons, gulls, flying outhouses and everything they drop: wave after wave, the fan every fifth, and a score to beat. Fly alone or with a crew of up to four.",
    phrases: {
      Warning: "It's about to hit the fan",
      Bomb: "Flush",
      Bombs: "Flushes",
      // Every boss is the fan, and they get bigger.
      Thunderhead: "The Fan",
      Ironclad: "The Bigger Fan",
      Nightglass: "The Industrial Fan",
      "Red Comet": "The Wind Tunnel",
      Leviathan: "The Turbine",
    },
    words: [
      [/\bbombs\b/g, "flushes"],
      [/\bBombs\b/g, "Flushes"],
      [/\ba bomb\b/g, "a flush"],
      [/\bA bomb\b/g, "A flush"],
      [/\bbomb\b/g, "flush"],
      [/\bthe bullets\b/g, "what's flying"],
      [/\bthe guns fire\b/g, "the water runs"],
      [/\bthe ship follows\b/g, "the plunger follows"],
      [/\bmiddle of your ship\b/g, "middle of your plane"],
    ],
  },
};

/** A game's line for the picker, and its heading on the setup screen, as the parlor puts them. */
export const arcadeBlurb = (game: ArcadeGameId, given: string) => FLAVOURS[game]?.blurb ?? given;
export const arcadeTagline = (game: ArcadeGameId, given: string) => FLAVOURS[game]?.tagline ?? given;

/** Anything a game says, as the parlor says it: a label, a banner, a boss's name, a line of the controls. */
export function arcadeSays(game: ArcadeGameId, text: string): string {
  const f = FLAVOURS[game];
  if (!f) return text;
  const whole = f.phrases?.[text];
  if (whole) return whole;
  return (f.words ?? []).reduce((line, [from, to]) => line.replace(from, to), text);
}
