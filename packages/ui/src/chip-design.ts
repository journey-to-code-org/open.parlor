// Poker chips people design (in the designer's chip screen, /designer/#chips) and play with. A
// design is data only: a colour and an inset colour for each of the eight values, and choices from
// fixed lists for the edge, the mark in the middle and the finish. Checked again wherever it is read,
// so nothing saved can carry markup or CSS of its own.
//
// The chips this browser plays with, and the sets its owner has made, are kept in this browser
// (like the deck it plays with): they work offline, and nobody else's table changes.

/** What each chip is worth, smallest first. A design gives each of these its colours. */
export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000, 5000, 25000] as const;
/** How the insets round a chip's edge are cut. */
export const CHIP_EDGES = ["stripes", "blocks", "dots", "ring", "plain"] as const;
/** What is in the middle of a chip's face. */
export const CHIP_MARKS = ["value", "spade", "heart", "diamond", "club", "star", "crown", "none"] as const;
/** What a chip is made of, as the light shows it in 3-D. */
export const CHIP_FINISHES = ["clay", "gloss", "metal"] as const;

export type ChipEdge = (typeof CHIP_EDGES)[number];
export type ChipMark = (typeof CHIP_MARKS)[number];
export type ChipFinish = (typeof CHIP_FINISHES)[number];

export interface ChipColours {
  /** The chip's body. */
  colour: string;
  /** Its insets, its rings and its mark. */
  inset: string;
}

export interface ChipDesign {
  name: string;
  /** One for each of CHIP_VALUES, in order. */
  chips: ChipColours[];
  edge: ChipEdge;
  mark: ChipMark;
  finish: ChipFinish;
}

/** The glyph for each mark (drawn as text, never as an emoji). */
export const MARK_GLYPHS: Record<ChipMark, string> = {
  value: "",
  spade: "♠︎",
  heart: "♥︎",
  diamond: "♦︎",
  club: "♣︎",
  star: "★︎",
  crown: "♛︎",
  none: "",
};

/** A value as a chip says it: 1, 25, 1K, 25K. */
export const chipValueLabel = (value: number) => (value >= 1000 ? `${value / 1000}K` : String(value));

const IVORY = "#f7f3ea";
const INK = "#23252b";

/** The parlor's own chips: the colours a casino rack has. */
export const PARLOR_CHIPS: ChipDesign = {
  name: "The parlor's own",
  chips: [
    { colour: "#f4f1e8", inset: "#2b5fad" },
    { colour: "#c8322b", inset: IVORY },
    { colour: "#1f8a4c", inset: IVORY },
    { colour: INK, inset: IVORY },
    { colour: "#6b3fa0", inset: IVORY },
    { colour: "#e0a81e", inset: INK },
    { colour: "#e2701d", inset: IVORY },
    { colour: "#3aa0c9", inset: IVORY },
  ],
  edge: "stripes",
  mark: "value",
  finish: "clay",
};

/** Sets to start from. */
export const CHIP_STARTERS: ChipDesign[] = [
  PARLOR_CHIPS,
  {
    name: "Midnight",
    chips: ["#1d3270", "#6a1830", "#11553f", "#111216", "#4a2a80", "#6b4a14", "#7a2e14", "#0f5a6b"].map((colour) => ({ colour, inset: "#d9b23a" })),
    edge: "blocks",
    mark: "spade",
    finish: "gloss",
  },
  {
    name: "Candy",
    chips: [
      { colour: "#fff3f8", inset: "#ff6fa8" },
      { colour: "#ff8fb8", inset: "#ffffff" },
      { colour: "#7fd8be", inset: "#ffffff" },
      { colour: "#8fb8ff", inset: "#ffffff" },
      { colour: "#c9a2ff", inset: "#ffffff" },
      { colour: "#ffd166", inset: "#ff6fa8" },
      { colour: "#ffa36c", inset: "#ffffff" },
      { colour: "#6fe0ff", inset: "#ffffff" },
    ],
    edge: "dots",
    mark: "heart",
    finish: "gloss",
  },
  {
    name: "Brass",
    // All brass, so each value is told by the colour of its insets.
    chips: [
      ["#d4b97c", "#3b2a12"],
      ["#b08d57", "#8f1d1d"],
      ["#b08d57", "#1d5c3a"],
      ["#9c7a45", "#14141a"],
      ["#c7a76a", "#4a2a80"],
      ["#e0c88f", "#1d3270"],
      ["#bf9a5a", "#7a2e14"],
      ["#a6814a", "#0f5a6b"],
    ].map(([colour, inset]) => ({ colour: colour!, inset: inset! })),
    edge: "ring",
    mark: "crown",
    finish: "metal",
  },
];

const HEX = /^#[0-9a-f]{6}$/;
const colourOr = (given: unknown, fallback: string) => (typeof given === "string" && HEX.test(given.trim().toLowerCase()) ? given.trim().toLowerCase() : fallback);
const oneOf = <T extends string>(list: readonly T[], given: unknown, fallback: T): T => (list.includes(given as T) ? (given as T) : fallback);

/** A name kept to a short line of plain text. */
export const cleanChipName = (given: unknown, fallback = "My chips") => {
  const name = typeof given === "string" ? given.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return name || fallback;
};

/** A design from anywhere (storage, a page): anything missing or not allowed comes from the parlor's own. */
export function normalizeChips(given: unknown): ChipDesign {
  const g = (given && typeof given === "object" ? given : {}) as Partial<Record<keyof ChipDesign, unknown>>;
  const chips = Array.isArray(g.chips) ? g.chips : [];
  return {
    name: cleanChipName(g.name),
    chips: PARLOR_CHIPS.chips.map((own, i) => {
      const c = (chips[i] && typeof chips[i] === "object" ? chips[i] : {}) as Partial<ChipColours>;
      return { colour: colourOr(c.colour, own.colour), inset: colourOr(c.inset, own.inset) };
    }),
    edge: oneOf(CHIP_EDGES, g.edge, PARLOR_CHIPS.edge),
    mark: oneOf(CHIP_MARKS, g.mark, PARLOR_CHIPS.mark),
    finish: oneOf(CHIP_FINISHES, g.finish, PARLOR_CHIPS.finish),
  };
}

/** How different two colours look, roughly: 0 the same, about 1.7 black against white. */
function distance(a: string, b: string) {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
}

/** What would make a set hard to play with: chips that can't be told apart. Empty when it's fine. */
export function chipProblems(design: ChipDesign): string[] {
  const problems: string[] = [];
  design.chips.forEach((c, i) => {
    if (distance(c.colour, c.inset) < 0.25) problems.push(`The ${chipValueLabel(CHIP_VALUES[i]!)} chip's insets are too close to its colour to see.`);
  });
  for (let i = 0; i < design.chips.length; i++)
    for (let j = i + 1; j < design.chips.length; j++) {
      const a = design.chips[i]!;
      const b = design.chips[j]!;
      if (distance(a.colour, b.colour) < 0.08 && distance(a.inset, b.inset) < 0.08)
        problems.push(`The ${chipValueLabel(CHIP_VALUES[i]!)} and ${chipValueLabel(CHIP_VALUES[j]!)} chips look the same.`);
    }
  return problems;
}

// ---- Kept in this browser --------------------------------------------------------------------------

/** The chips this browser plays with. */
export const CHIPS_KEY = "cardroom.chips";
/** The sets this browser's owner has made. */
export const MY_CHIPS_KEY = "cardroom.chips.mine";
/** Said on the window when this page changes either, since `storage` only tells other tabs. */
export const CHIPS_EVENT = "cardroom:chips";

export interface SavedChips {
  id: string;
  design: ChipDesign;
  updated: number;
}

const told = () => {
  try {
    globalThis.dispatchEvent?.(new Event(CHIPS_EVENT));
  } catch {
    // No window (a test, the server): nobody to tell.
  }
};

/** The chips this browser plays with: the parlor's own unless its owner chose others. */
export function playingChips(storage: Storage | undefined = globalThis.localStorage): ChipDesign {
  try {
    const raw = storage?.getItem(CHIPS_KEY);
    return raw ? normalizeChips(JSON.parse(raw)) : PARLOR_CHIPS;
  } catch {
    return PARLOR_CHIPS;
  }
}

/** Play with these chips (null: the parlor's own). */
export function playWithChips(design: ChipDesign | null, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    if (design) storage?.setItem(CHIPS_KEY, JSON.stringify(normalizeChips(design)));
    else storage?.removeItem(CHIPS_KEY);
  } catch {
    throw new Error("This browser wouldn't keep the chips (private browsing, or its storage is full).");
  }
  told();
}

/** The sets made in this browser, newest first. */
export function myChips(storage: Storage | undefined = globalThis.localStorage): SavedChips[] {
  try {
    const list = JSON.parse(storage?.getItem(MY_CHIPS_KEY) ?? "[]") as SavedChips[];
    return Array.isArray(list)
      ? list.filter((s) => s && typeof s.id === "string").map((s) => ({ id: s.id, design: normalizeChips(s.design), updated: Number(s.updated) || 0 })).sort((a, b) => b.updated - a.updated)
      : [];
  } catch {
    return [];
  }
}

/** How many sets one browser keeps. */
export const MY_CHIPS_LIMIT = 30;

/** Keep a set: a new one (no id), or changes to one already kept. Returns what was kept. */
export function keepChips(design: ChipDesign, id?: string, storage: Storage | undefined = globalThis.localStorage): SavedChips {
  const list = myChips(storage);
  const kept: SavedChips = { id: id ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, design: normalizeChips(design), updated: Date.now() };
  const others = list.filter((s) => s.id !== kept.id);
  if (!id && others.length >= MY_CHIPS_LIMIT) throw new Error(`You can keep ${MY_CHIPS_LIMIT} sets. Delete one to make room.`);
  try {
    storage?.setItem(MY_CHIPS_KEY, JSON.stringify([kept, ...others]));
  } catch {
    throw new Error("This browser wouldn't keep the chips (private browsing, or its storage is full).");
  }
  told();
  return kept;
}

export function forgetChips(id: string, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(MY_CHIPS_KEY, JSON.stringify(myChips(storage).filter((s) => s.id !== id)));
  } catch {
    // Nothing kept, nothing to forget.
  }
  told();
}

/** Calls back whenever the chips this browser plays with, or its sets, change here or in another tab. */
export function watchChips(callback: () => void): () => void {
  if (typeof addEventListener !== "function") return () => {};
  const onStorage = (e: StorageEvent) => (e.key === null || e.key === CHIPS_KEY || e.key === MY_CHIPS_KEY) && callback();
  addEventListener("storage", onStorage);
  addEventListener(CHIPS_EVENT, callback);
  return () => {
    removeEventListener("storage", onStorage);
    removeEventListener(CHIPS_EVENT, callback);
  };
}

/** Two designs are the same set. */
export const sameChips = (a: ChipDesign | null | undefined, b: ChipDesign | null | undefined) => !!a && !!b && JSON.stringify(normalizeChips(a)) === JSON.stringify(normalizeChips(b));
