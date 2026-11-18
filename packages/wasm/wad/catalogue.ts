// Which of a WAD's lumps are things someone might want to change, and what kind each is. A WAD
// doesn't say what a lump is: sprites, wall pieces and floors sit between marker lumps, and the
// rest is told by its name and by whether its bytes are a picture or a sound.
import { isLevelName } from "./level.ts";
import { describe } from "./names.ts";
import { decodePatch, FLAT } from "./picture.ts";
import { decodeDmx } from "./sound.ts";
import type { Wad } from "./wad.ts";

/**
 * A sprite, a piece of wall, a floor or ceiling, any other picture (screens, menus, the status
 * bar), a sound effect; and two that are a level, named by the level: "things", everything
 * placed in it, and "walls", what it is built of. And "words": what the game says (words.ts).
 */
export type Kind = "sprite" | "wall" | "floor" | "screen" | "sound" | "things" | "walls" | "words";
/** The kinds that are part of a level, not a picture or a sound. */
export const isLevelKind = (kind: Kind) => kind === "things" || kind === "walls";

/** The kinds that are a picture or a sound: one lump, swapped for a file. */
export const KINDS: Kind[] = ["sprite", "wall", "floor", "screen", "sound"];
export const EVERY_KIND: Kind[] = [...KINDS, "things", "walls", "words"];
/** The kinds that are a picture or a sound: what can be shown small, and dropped a file on. */
export const isDrawn = (kind: Kind) => !isLevelKind(kind) && kind !== "words";

export interface Asset {
  kind: Kind;
  name: string;
  /** Which lump of the WAD it is. A level's walls are several lumps: this is the level's marker. */
  index: number;
  /** What the engine uses it for, when that is known. */
  note: string;
}

/** A kind and a name, as one word: what an asset is known by. */
export const key = (kind: Kind, name: string) => `${kind}/${name}`;

/** The markers a section opens and closes with. A doubled first letter (SS_START) is what add-on WADs use. */
const SECTIONS: [RegExp, RegExp, Kind][] = [
  [/^SS?_START$/, /^SS?_END$/, "sprite"],
  [/^PP?_START$/, /^PP?_END$/, "wall"],
  [/^FF?_START$/, /^FF?_END$/, "floor"],
];

/** Lumps outside the sections that are not pictures, whatever their bytes look like. */
const NOT_PICTURES = /^(THINGS|LINEDEFS|SIDEDEFS|VERTEXES|SEGS|SSECTORS|NODES|SECTORS|REJECT|BLOCKMAP|BEHAVIOR|PLAYPAL|COLORMAP|ENDOOM|GENMIDI|DMXGUSC?|PNAMES|TEXTURE\d|DEHACKED|E\dM\d|MAP\d\d|D_.*|DP.*|DEMO\d)$/;

export function catalogue(wad: Wad): Asset[] {
  /** By key: a name used twice is the later lump, as it is to the engine. */
  const found = new Map<string, Asset>();
  let section: Kind | null = null;
  wad.lumps.forEach(({ name, data }, index) => {
    // A level: its marker, then its lumps, the first of them what is placed in it.
    if (name === "WORDS") found.set(key("words", name), { kind: "words", name, index, note: "What the game says" });
    if (isLevelName(name) && wad.lumps[index + 1]?.name === "THINGS") {
      found.set(key("things", name), { kind: "things", name, index: index + 1, note: "What is placed in this level" });
      found.set(key("walls", name), { kind: "walls", name, index, note: "The walls and rooms of this level" });
    }
    const opening = SECTIONS.find(([start]) => start.test(name));
    if (opening) return void (section = opening[2]);
    if (SECTIONS.some(([, end]) => end.test(name))) return void (section = null);
    // Markers within a section (F1_START, P2_END) have nothing in them.
    if (data.length === 0) return;
    let kind: Kind | null = section;
    if (kind === "floor" && data.length < FLAT * FLAT) return;
    if (!kind && name.startsWith("DS") && decodeDmx(data)) kind = "sound";
    if (!kind && !NOT_PICTURES.test(name) && decodePatch(data)) kind = "screen";
    if (kind) found.set(key(kind, name), { kind, name, index, note: describe(kind, name) });
  });
  return [...found.values()];
}
