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
 * And "other": every lump that is none of those (the colours, the lists of wall pictures, the
 * songs, the recordings), changed only by putting another in its place, byte for byte. And
 * "rules": what each thing is and the numbers the engine plays by (rules.ts).
 */
export type Kind = "sprite" | "wall" | "floor" | "screen" | "sound" | "things" | "walls" | "words" | "rules" | "other";
/** The kinds that are part of a level, not a picture or a sound. */
export const isLevelKind = (kind: Kind) => kind === "things" || kind === "walls";

/** The kinds that are a picture or a sound: one lump, swapped for a file. */
export const KINDS: Kind[] = ["sprite", "wall", "floor", "screen", "sound"];
export const EVERY_KIND: Kind[] = [...KINDS, "things", "walls", "words", "rules", "other"];
/** The kinds that are a picture or a sound: what can be shown small, and dropped a file on. */
export const isDrawn = (kind: Kind) => !isLevelKind(kind) && kind !== "words" && kind !== "rules" && kind !== "other";

/**
 * The kinds a game can be given more of, under a name it hasn't got: a floor, a wall (a piece,
 * and with it a wall picture of that name made of the one piece: mod.ts), any other lump, and a
 * sprite or a sound. The engine draws and plays its own by name, so a new sprite or sound is
 * seen or heard once the rules give it to a thing (rules.ts).
 */
export const canAdd = (kind: Kind) => kind === "floor" || kind === "wall" || kind === "other" || kind === "sprite" || kind === "sound";
/** The lumps of a level, and the markers: names nothing else may take. */
const TAKEN = /^(THINGS|LINEDEFS|SIDEDEFS|VERTEXES|SEGS|SSECTORS|NODES|SECTORS|REJECT|BLOCKMAP|BEHAVIOR|E\dM\d|MAP\d\d|[SPF][SPF123]?_(START|END)|WORDS|RULES)$/;
/** Whether something new could go by this name: what a WAD can hold (eight of capitals, figures and a few marks) and not a name with a meaning of its own. */
export const isNewName = (name: string) => /^[A-Z0-9_\-\[\]\\^]{1,8}$/.test(name) && !TAKEN.test(name);
/**
 * Whether something new of a kind could go by this name. A sprite's says what it is a picture
 * of: four letters for the thing, a letter for the moment and a figure for the side it is seen
 * from (0 for all of them), and perhaps the same again for the side that is its mirror. A
 * sound's starts DS.
 */
export const isNewNameFor = (kind: Kind, name: string) =>
  isNewName(name) && (kind === "sprite" ? /^[A-Z0-9_]{4}([A-Z\[\]\\][0-8]){1,2}$/.test(name) : kind === "sound" ? /^DS[A-Z0-9_]{1,6}$/.test(name) : true);

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
    if (name === "RULES") found.set(key("rules", name), { kind: "rules", name, index, note: "What each thing is, and the numbers the game plays by" });
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
    // Whatever is left is a lump all the same; a level's own lumps are the level's.
    if (!kind && !TAKEN.test(name)) kind = "other";
    if (kind) found.set(key(kind, name), { kind, name, index, note: describe(kind, name) });
  });
  return [...found.values()];
}
