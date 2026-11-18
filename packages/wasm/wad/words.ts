// The game's words: what it says when something is picked up, what its levels are called, and
// lines to say when things happen. They live in a lump of the WAD called WORDS, which the engine
// reads (games/shooter/engine/words.c). It is plain text, a line each:
//
//   Picked up a clip.=Found a box of fuses.     the engine's own words, and what to say instead
//   !kill=Got him!|That's one less.             lines for a moment, one picked each time
//
// The engine's font has capitals, figures and common marks only, so what is written is kept to
// those: anything else is left out.

/** A moment the game has something to say at, and its key in the lump (after the "!"). */
export const MOMENTS = [
  { key: "start", label: "When a level starts" },
  { key: "see", label: "When a rat notices you" },
  { key: "hurt", label: "When one bites you" },
  { key: "kill", label: "When you get one" },
  { key: "die", label: "When you die" },
] as const;

/** The engine's own words that can be replaced: exactly as they are in d_englsh.h, and what each is. */
export const TEXTS = [
  { from: "E1M1: Hangar", label: "Level 1's name", group: "Levels" },
  { from: "E1M2: Nuclear Plant", label: "Level 2's name", group: "Levels" },
  { from: "E1M3: Toxin Refinery", label: "Level 3's name", group: "Levels" },
  { from: "E1M4: Command Control", label: "Level 4's name", group: "Levels" },
  { from: "E1M5: Phobos Lab", label: "Level 5's name", group: "Levels" },
  { from: "E1M6: Central Processing", label: "Level 6's name", group: "Levels" },
  { from: "E1M7: Computer Station", label: "Level 7's name", group: "Levels" },
  { from: "E1M8: Phobos Anomaly", label: "Level 8's name", group: "Levels" },
  { from: "E1M9: Military Base", label: "Level 9's name", group: "Levels" },
  { from: "E2M1: Deimos Anomaly", label: "Level 10's name", group: "Levels" },
  { from: "E2M2: Containment Area", label: "Level 11's name", group: "Levels" },
  { from: "E2M3: Refinery", label: "Level 12's name", group: "Levels" },
  { from: "Picked up a stimpack.", label: "A little health", group: "Picked up" },
  { from: "Picked up a medikit.", label: "A lot of health", group: "Picked up" },
  { from: "Picked up a health bonus.", label: "A health bonus", group: "Picked up" },
  { from: "Supercharge!", label: "The big health prize", group: "Picked up" },
  { from: "Picked up the armor.", label: "Armour", group: "Picked up" },
  { from: "Picked up an armor bonus.", label: "An armour bonus", group: "Picked up" },
  { from: "Picked up a clip.", label: "Bullets", group: "Picked up" },
  { from: "Picked up 4 shotgun shells.", label: "Shotgun shells", group: "Picked up" },
  { from: "Picked up a box of shotgun shells.", label: "A box of shells", group: "Picked up" },
  { from: "You got the shotgun!", label: "The shotgun", group: "Picked up" },
  { from: "A chainsaw!  Find some meat!", label: "The chainsaw", group: "Picked up" },
  { from: "You got the chaingun!", label: "The chaingun", group: "Picked up" },
  { from: "Picked up a blue keycard.", label: "The blue key", group: "Picked up" },
  { from: "Picked up a yellow keycard.", label: "The yellow key", group: "Picked up" },
  { from: "Picked up a red keycard.", label: "The red key", group: "Picked up" },
  { from: "You need a blue key to open this door", label: "A door that wants the blue key", group: "Doors" },
  { from: "You need a yellow key to open this door", label: "A door that wants the yellow key", group: "Doors" },
  { from: "You need a red key to open this door", label: "A door that wants the red key", group: "Doors" },
] as const;

/** The lump's name, and so the name its change goes by. */
export const WORDS = "WORDS";

/** Only what the engine's font can show; quotes and dashes of the curly kind made plain. */
export const plain = (text: string) =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e]/g, "");

/** The lump as what replaces what: the keys are the engine's own words, or "!" and a moment. */
export function readWords(data: Uint8Array | undefined): Map<string, string> {
  const words = new Map<string, string>();
  for (const line of new TextDecoder("latin1").decode(data ?? new Uint8Array(0)).split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (line.startsWith("#") || at < 1 || at === line.length - 1) continue;
    words.set(line.slice(0, at), line.slice(at + 1));
  }
  return words;
}

/** The lump, from what replaces what. A thing with nothing to say in its place is left out. */
export function writeWords(words: Map<string, string>): Uint8Array {
  const lines = [...words].filter(([from, to]) => from && plain(to).trim()).map(([from, to]) => `${from}=${plain(to).trim()}`);
  return Uint8Array.from(`${lines.join("\n")}\n`, (letter) => letter.charCodeAt(0));
}

/** The lines for a moment, one each. */
export const linesFor = (words: Map<string, string>, moment: string) => (words.get(`!${moment}`) ?? "").split("|").filter((line) => line.trim());
/** Sets the lines for a moment: none, and the game says nothing then. */
export function setLines(words: Map<string, string>, moment: string, lines: string[]) {
  const kept = lines.map((line) => plain(line).replace(/\|/g, "").trim()).filter(Boolean);
  if (kept.length) words.set(`!${moment}`, kept.join("|"));
  else words.delete(`!${moment}`);
}
