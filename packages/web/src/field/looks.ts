// What each kind of place looks like. A view names the place ("meadow", "moon"); the colours of
// its sky, its far hills, its earth and the rim along the top of its land are all here, and
// nowhere in the game.
import type { Earth } from "./fx";

export interface Look {
  /** The sky, top to bottom: where each colour sits (0 to 1) and the colour. */
  sky: [number, string][];
  /** A sun (or a pale moon): where in the sky, how big (as shares of the width), and its colour. */
  sun: { x: number; y: number; r: number; colour: string } | null;
  /** How many stars. */
  stars: number;
  /** The Earth, hanging in the sky. */
  earthrise?: boolean;
  /** Clouds of this colour, or none. */
  clouds: string | null;
  /** Snow falling. */
  snowfall?: boolean;
  /** Far hills, the furthest first: how far down the sky they sit, how tall, their colour, and whether they are flat-topped. */
  ridges: { base: number; tall: number; colour: string; flat?: boolean; capped?: string }[];
  /** The earth, from just under the surface to the bottom. */
  soil: [string, string];
  /** Pebbles and flecks in it. */
  flecks: [string, string];
  /** The rim along the top: a dark edge, the colour over it, a highlight, and how thick (in the field's units). */
  rim: { under: string; top: string; light: string; thick: number };
  /** Blades of grass along the rim, or none. */
  tufts: string | null;
  /** What flies out of the ground. */
  earth: Earth;
}

const meadow: Look = {
  sky: [[0, "#2f7fd6"], [0.6, "#8cc8f5"], [1, "#dcf1ff"]],
  sun: { x: 0.8, y: 0.16, r: 0.04, colour: "#fff6c9" },
  stars: 0,
  clouds: "#ffffff",
  ridges: [
    { base: 0.6, tall: 0.11, colour: "#8fbcd6" },
    { base: 0.7, tall: 0.09, colour: "#6ba58f" },
  ],
  soil: ["#8f5f36", "#3f2817"],
  flecks: ["#5a3a1f", "#b08355"],
  rim: { under: "#2c6427", top: "#69bd47", light: "#b9ee7e", thick: 16 },
  tufts: "#4c9636",
  earth: { soil: ["#7a5330", "#5c3d22", "#69bd47", "#8f5f36"], dust: "#b59a78" },
};

const dusk: Look = {
  sky: [[0, "#141d44"], [0.5, "#5a5a9c"], [0.82, "#f0a57e"], [1, "#f9d6a0"]],
  sun: { x: 0.7, y: 0.66, r: 0.05, colour: "#ffe7b0" },
  stars: 70,
  clouds: "#f4b6a6",
  ridges: [
    { base: 0.6, tall: 0.11, colour: "#4d4f8c" },
    { base: 0.71, tall: 0.09, colour: "#353a6e" },
  ],
  soil: ["#6f4a30", "#2a1a11"],
  flecks: ["#3d2617", "#93694a"],
  rim: { under: "#1f4726", top: "#4c9646", light: "#96cf78", thick: 16 },
  tufts: "#387232",
  earth: { soil: ["#6f4a30", "#4a3020", "#4c9646"], dust: "#a08a78" },
};

const desert: Look = {
  sky: [[0, "#3a8fd0"], [0.55, "#f3d9a4"], [1, "#fbe8c4"]],
  sun: { x: 0.24, y: 0.2, r: 0.055, colour: "#fffbe0" },
  stars: 0,
  clouds: null,
  ridges: [
    { base: 0.62, tall: 0.12, colour: "#dba673", flat: true },
    { base: 0.72, tall: 0.1, colour: "#c58454", flat: true },
  ],
  soil: ["#d9a665", "#7a4a26"],
  flecks: ["#a8733a", "#f0cd8a"],
  rim: { under: "#b47b3b", top: "#f0cd8a", light: "#fff3cc", thick: 13 },
  tufts: null,
  earth: { soil: ["#d4a060", "#b9803f", "#f0cd8a"], dust: "#e8cfa0" },
};

const snow: Look = {
  sky: [[0, "#557799"], [0.6, "#b4cbdd"], [1, "#eef5fa"]],
  sun: { x: 0.3, y: 0.22, r: 0.035, colour: "#ffffff" },
  stars: 0,
  clouds: "#eef3f8",
  snowfall: true,
  ridges: [
    { base: 0.58, tall: 0.15, colour: "#9db4c8", capped: "#f4f8fb" },
    { base: 0.71, tall: 0.1, colour: "#7f99b0", capped: "#e6eef5" },
  ],
  soil: ["#74869a", "#2c3743"],
  flecks: ["#4a5866", "#a7b7c7"],
  rim: { under: "#a9bdd4", top: "#ffffff", light: "#ffffff", thick: 24 },
  tufts: null,
  earth: { soil: ["#ffffff", "#74869a", "#dfe9f2", "#ffffff"], dust: "#f2f6fa" },
};

const moon: Look = {
  sky: [[0, "#000004"], [1, "#0d0d1e"]],
  sun: null,
  stars: 240,
  earthrise: true,
  clouds: null,
  ridges: [
    { base: 0.66, tall: 0.07, colour: "#24242c" },
    { base: 0.74, tall: 0.06, colour: "#34343e" },
  ],
  soil: ["#9c9ca6", "#34343e"],
  flecks: ["#5e5e68", "#c9c9d2"],
  rim: { under: "#55555f", top: "#c9c9d2", light: "#f4f4fa", thick: 12 },
  tufts: null,
  earth: { soil: ["#9c9ca6", "#6d6d77", "#c9c9d2"], dust: "#b6b6c0" },
};

const LOOKS: Record<string, Look> = { meadow, dusk, desert, snow, moon };
/** The look of a place; one the screen has never heard of is drawn as the hills at dusk. */
export const lookOf = (scene: string): Look => LOOKS[scene] ?? dusk;
