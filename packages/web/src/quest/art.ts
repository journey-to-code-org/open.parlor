// Zubra Quest's pictures: what lies about, and the ground it is played on. (Who is in it is in
// cast.ts.) Small things are drawn by hand, a letter a pixel (see retro/pixels.ts for the letters),
// and come out at twice that size with their edges smoothed; most are the same on both sides, so
// only their left half is written down. The ground, the trees, the water and the walls are painted
// by rule, 32 pixels to a tile, so no two tiles of grass are the same tile.
import { QUEST_TILE } from "@journey-to-code/games";
import { blank, mirrored, rgb, speck, sprite, turned, type Rgb, type Sprite } from "../retro/pixels";

const half = (rows: string[], swap?: Record<string, string>) => sprite(mirrored(rows), swap);

export { BOSSES, FOES, FOLK, ZUB } from "./cast";

// ---- Things that lie about, and things in the hand -------------------------------------------------

const HEART = [
  "........",
  "........",
  "........",
  "........",
  "....000.",
  "...0rrr0",
  "..0r1rrr",
  "..0rrrrr",
  "..0rrrrR",
  "...0rrrR",
  "....0rRR",
  ".....0RR",
  "......0R",
  ".......0",
  "........",
  "........",
];
const ACORN = [
  "........",
  "........",
  "........",
  "......00",
  ".....0dd",
  "....0ddd",
  "....0ede",
  "....0000",
  "....0ccb",
  "....0ccb",
  "....0dcc",
  ".....0dc",
  "......00",
  "........",
  "........",
  "........",
];
const ARROW = [
  "........",
  ".......0",
  "......02",
  ".....022",
  "....0222",
  "....000c",
  "......0c",
  "......0c",
  "......0c",
  "......0c",
  "......0c",
  ".....0rc",
  "....0rrc",
  "....0r0c",
  "....00.0",
  "........",
];
const BOMB = [
  "........",
  ".......y",
  "......0c",
  "......0c",
  "....0000",
  "...05555",
  "..055255",
  "..052555",
  "..055555",
  "..055555",
  "..055555",
  "..005555",
  "...05555",
  "....0000",
  "........",
  "........",
];
const KEY = [
  "........",
  "........",
  ".....000",
  "....0yyy",
  "....0y00",
  "....0yyy",
  ".....00y",
  "......0y",
  "......0y",
  ".....0yy",
  "......0y",
  ".....0yy",
  "......0y",
  ".......0",
  "........",
  "........",
];
export const SWORD_UP = half([
  ".......0",
  "......02",
  "......01",
  "......02",
  "......01",
  "......02",
  "......01",
  "......02",
  "......02",
  "...00002",
  "..0YYYYy",
  "...0000d",
  "......0d",
  "......0d",
  "......0Y",
  ".......0",
]);
export const SWORD_SLANT = sprite([
  "..............00",
  ".............021",
  "............0210",
  "...........0220.",
  "..........0210..",
  ".........0220...",
  "........0210....",
  ".......0220.....",
  "..0...0220......",
  ".0Y0.0220.......",
  "..0Y0220........",
  "...0YY0.........",
  "..0d0YY0........",
  ".0d0.0Y0........",
  "0Y0...0.........",
  ".0..............",
]);
const BOW = sprite([
  "................",
  "....0000........",
  "...0cccc00......",
  "....00dcc10.....",
  "......0dc010....",
  ".......0dc010...",
  "........0c0.10..",
  "........0c0..10.",
  "........0c0..10.",
  "........0c0.10..",
  ".......0dc010...",
  "......0dc010....",
  "....00dcc10.....",
  "...0cccc00......",
  "....0000........",
  "................",
]);
const HOOK = sprite([
  "................",
  "...........000..",
  "..........03320.",
  ".........0320320",
  "..........00.030",
  ".........0..030.",
  "........030030..",
  ".......0303330..",
  "......030.000...",
  ".....030........",
  "....030.........",
  "..0030..........",
  ".0cc0...........",
  "0cdc0...........",
  "0dc0............",
  ".00.............",
]);
export const ITEMS: Record<string, Sprite> = {
  heart: half(HEART),
  coin: half(ACORN),
  gem: half(ACORN, { d: "Y", e: "o", c: "y", b: "1" }),
  arrows: half(ARROW),
  bombs: half(BOMB),
  key: half(KEY),
  bosskey: half(KEY, { y: "r" }),
  vessel: half(HEART, { "0": "Y", R: "r" }),
  potion: half([
    "........",
    "........",
    "......00",
    "......0c",
    "......0c",
    ".....001",
    "....0111",
    "...01rrr",
    "...0rr1r",
    "...0rrrr",
    "...0rrrr",
    "...0Rrrr",
    "....0RRR",
    ".....000",
    "........",
    "........",
  ]),
  stripe: half([
    "........",
    ".......U",
    "......U1",
    ".....U11",
    "....U000",
    "...U1111",
    "..U11111",
    "..U00000",
    "..U11111",
    "...U1111",
    "....U000",
    ".....U11",
    "......U1",
    ".......U",
    "........",
    "........",
  ]),
  sword: SWORD_UP,
  blade: half([
    ".......0",
    "......0u",
    "......01",
    "......0u",
    "......01",
    "......0u",
    "......01",
    "......0u",
    "......0u",
    "...0000u",
    "..0rrrry",
    "...0000d",
    "......0d",
    "......0d",
    "......0r",
    ".......0",
  ]),
  bow: BOW,
  hook: HOOK,
};
/** An arrow in the air, by the way it flies. */
export const ARROWS = [1, 2, 3, 0].map((q) => turned(ITEMS.arrows!, q));
export const HOOK_HEAD = sprite(["..00..", ".0320.", "032230", "032230", ".0330.", "..00.."]);

/** The hearts along the top: full, half and empty. */
const SMALL_HEART = [".00.00..", "0rr0rr0.", "0r1rrr0.", "0rrrrR0.", ".0rrR0..", "..0R0...", "...0....", "........"];
export const HEARTS = [
  sprite(SMALL_HEART),
  sprite(SMALL_HEART.map((row) => row.slice(0, 4) + row.slice(4).replace(/[rR1]/g, "5"))),
  sprite(SMALL_HEART.map((row) => row.replace(/[rR1]/g, "5"))),
];

// ---- Things that stand on a tile -------------------------------------------------------------------

const T = QUEST_TILE;
const STONE = [
  "00000000",
  "02222222",
  "02333333",
  "02333333",
  "02333333",
  "02333333",
  "02333333",
  "02333333",
  "02333333",
  "02333333",
  "02333333",
  "02333333",
  "03444444",
  "04444444",
  "04555555",
  "00000000",
];
const DOOR = [
  "00000000",
  "02222222",
  "02333333",
  "02333333",
  "02330000",
  "0230YYYY",
  "0230Yy00",
  "0230Yy00",
  "0230YYY0",
  "0230YYY0",
  "0230YYYY",
  "02330000",
  "03444444",
  "04444444",
  "04555555",
  "00000000",
];
const BARS = ["00000000", "03200320", "03200320", "02222222", "03333333", "03200320", "03200320", "03200320", "03200320", "03200320", "03200320", "02222222", "03333333", "03200320", "03200320", "00000000"];
const TORCH_FOOT = ["..000000", "..033222", "...03332", "....0433", "....0433", "...04333", "..044444", "..000000"];
export const PROPS: Record<string, Sprite> = {
  bush: half([
    "........",
    "....0000",
    "..00gggg",
    ".0ggGGgG",
    "0gGGGGGG",
    "0gGGgGGG",
    "0GGGGGhG",
    "0GGhGGGG",
    "0GhGGGGG",
    "0GGGGgGG",
    "0hGGGGGh",
    "0hhGGhGG",
    ".0hhGGGh",
    "..0hhhhh",
    "...00000",
    "........",
  ]),
  cactus: half([
    "......00",
    ".....0Gg",
    ".00..0GG",
    "0Gg0.0GG",
    "0GG0.0Gg",
    "0GG0.0GG",
    "0GG000GG",
    "0GGGGGGg",
    ".0hGGGGG",
    "..0000GG",
    ".....0Gg",
    ".....0GG",
    ".....0hG",
    ".....0hG",
    ".....0hh",
    "......00",
  ]),
  crack: half([
    "........",
    "...00000",
    "..032222",
    ".0322232",
    "03223022",
    "03230322",
    "03303332",
    "03033033",
    "04333303",
    "04330333",
    "04433033",
    "04443303",
    ".0444433",
    "..044444",
    "...00000",
    "........",
  ]),
  post: half([
    "........",
    "......00",
    ".....022",
    ".....020",
    ".....022",
    "......00",
    ".....0cb",
    ".....0cb",
    ".....0cb",
    ".....0cb",
    ".....0cb",
    ".....0db",
    "....0ddc",
    "...0eddd",
    "...00000",
    "........",
  ]),
  chest: half([
    "........",
    "........",
    ".0000000",
    "0dcccccc",
    "0cbbbbbb",
    "0cbbbbbb",
    "0dcccccc",
    "0000000y",
    "0YYYYY0y",
    "0000000y",
    "0dccccc0",
    "0dcccccc",
    "0dcccccc",
    "0edddddd",
    "00000000",
    "........",
  ]),
  opened: half([
    ".0000000",
    "0dcccccc",
    "0dbbbbbb",
    "0edddddd",
    "00000000",
    "05555555",
    "05555555",
    "00000000",
    "0YYYYYYY",
    "00000000",
    "0dcccccc",
    "0dcccccc",
    "0dcccccc",
    "0edddddd",
    "00000000",
    "........",
  ]),
  stairs: half(["00000000", "05555555", "05000000", "05055555", "05055555", "05000000", "05004444", "05004444", "05000000", "05000333", "05000333", "05000000", "05000022", "05000022", "05000000", "05000000"]),
  doorway: half(["00000000", "02222222", "02333300", "02330000", "02300000", "02300000", "0230000V", "023000VV", "023000VV", "02300VVV", "02300VVV", "0230VVvv", "0230VVvv", "0230Vvvv", "0230Vvvv", "0230vvvU"]),
  lock: half(DOOR),
  bossDoor: half(DOOR, { "2": "r", "3": "R", "4": "q", "5": "q" }),
  eye: half([
    "00000000",
    "02222222",
    "02333333",
    "02333333",
    "02330000",
    "02301111",
    "0301110R",
    "030111Rq",
    "030111Rq",
    "0301110R",
    "02301111",
    "02330000",
    "03444444",
    "04444444",
    "04555555",
    "00000000",
  ]),
  shutter: half(BARS),
  gate: half(BARS, { "2": "y", "3": "Y" }),
  block: half(STONE),
  torch: half(["........", ".......y", "......yy", ".....oyy", ".....oy1", "....ooyy", "....Rooy", ".....Roo", ...TORCH_FOOT]),
  "torch:2": half(["........", "........", "......oy", "......yy", "....oyy1", ".....oyy", "....Rooy", "....RRoo", ...TORCH_FOOT]),
  flowers: sprite([
    "................",
    "................",
    "...r............",
    "..ryr...........",
    "...r......1.....",
    "...h.....1y1....",
    "..........1.....",
    "..........h.....",
    "................",
    "................",
    ".....k..........",
    "....kyk.........",
    ".....k..........",
    ".....h..........",
    "................",
    "................",
  ]),
};
const PROP_OF: Record<number, string> = {
  [T.bush]: "bush", [T.crack]: "crack", [T.post]: "post", [T.chest]: "chest", [T.opened]: "opened", [T.stairs]: "stairs", [T.doorway]: "doorway", [T.lock]: "lock",
  [T.bossDoor]: "bossDoor", [T.eye]: "eye", [T.shutter]: "shutter", [T.gate]: "gate", [T.block]: "block", [T.torch]: "torch", [T.flower]: "flowers",
};

// ---- The ground, painted by rule -------------------------------------------------------------------
//
// Sixteen-bit ground is not a tile repeated: trees stand together as a wood, rock as a cliff with a
// face, water has a bank. So a tile is painted knowing which of its four neighbours are the same
// as it (`mask`: 1 right, 2 below, 4 left, 8 above), and joins up with them.

interface Land { base: string; light: string; dark: string; wall: [string, string, string, string]; water: [string, string, string]; inside: boolean; trees: boolean }
const LANDS: Record<string, Land> = {
  meadow: { base: "#48a048", light: "#68c058", dark: "#2c8038", wall: ["#78d060", "#3c9c44", "#1e6c34", "#0c3c24"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: false, trees: true },
  dunes: { base: "#e4c078", light: "#f8e4a8", dark: "#c09450", wall: ["#f0c080", "#c88c50", "#945c34", "#583020"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: false, trees: false },
  marsh: { base: "#3a7c64", light: "#58a080", dark: "#245c4c", wall: ["#58b088", "#2c7c60", "#145044", "#082c2c"], water: ["#2a7684", "#64b8b4", "#184c60"], inside: false, trees: true },
  crags: { base: "#9c8878", light: "#b8a898", dark: "#746454", wall: ["#c4c8d8", "#8c90a8", "#585c78", "#2c3048"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: false, trees: false },
  cave: { base: "#6c5444", light: "#846a58", dark: "#4c382c", wall: ["#b89878", "#886c54", "#584434", "#281c18"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: true, trees: false },
  bramble: { base: "#5c7858", light: "#74946c", dark: "#445c44", wall: ["#84b470", "#507c4c", "#30543c", "#142820"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: true, trees: false },
  vault: { base: "#c4a464", light: "#e0c488", dark: "#a08044", wall: ["#f0c878", "#bc8c48", "#885c30", "#442c18"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: true, trees: false },
  hollow: { base: "#685c84", light: "#8478a4", dark: "#4c4468", wall: ["#9c8cc8", "#645890", "#3c3468", "#1c1838"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: true, trees: false },
  keep: { base: "#7c5c64", light: "#987c84", dark: "#58444c", wall: ["#bc8088", "#844c5c", "#542c3c", "#24101c"], water: ["#3470d8", "#78b8ff", "#2048a0"], inside: true, trees: false },
};
const landOf = (biome: string) => LANDS[biome] ?? LANDS.meadow!;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A tile's side, in real pixels. */
const N = 32;

function paint(w = N, h = N) {
  const s = blank(w, h);
  const dot = (x: number, y: number, c: Rgb) => { if (x >= 0 && y >= 0 && x < w && y < h) s.data.set([c[0], c[1], c[2], 255], (y * w + x) * 4); };
  const rect = (x: number, y: number, rw: number, rh: number, c: Rgb) => { for (let py = y; py < y + rh; py++) for (let px = x; px < x + rw; px++) dot(px, py, c); };
  const stamp = (p: Sprite, ox = 0, oy = 0) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.data[(y * p.w + x) * 4 + 3]) dot(x + ox, y + oy, [p.data[(y * p.w + x) * 4]!, p.data[(y * p.w + x) * 4 + 1]!, p.data[(y * p.w + x) * 4 + 2]!]); };
  return { s, dot, rect, stamp };
}
type Paint = ReturnType<typeof paint>;

/** Open ground: grass in soft drifts with blades in it, sand in ripples, dirt with pebbles, or flagstones under a roof. */
function ground(land: Land, biome: string, seed: number, path: boolean): Paint {
  const p = paint();
  const [base, light, dark] = [rgb(land.base), rgb(land.light), rgb(land.dark)];
  if (land.inside) {
    // Flagstones, four to a tile: each a shade of its own, bevelled, lit from the top left, some cracked.
    for (const [ox, oy] of [[0, 0], [16, 0], [0, 16], [16, 16]] as const) {
      const own = mix(base, speck(ox, oy, seed) < 0.5 ? light : dark, speck(oy, ox, seed + 3) * 0.28);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.dot(ox + x, oy + y, mix(own, speck(x >> 1, y >> 1, seed + ox + oy) > 0.5 ? light : dark, 0.07));
      p.rect(ox, oy, 16, 1, mix(own, light, 0.75));
      p.rect(ox, oy, 1, 16, mix(own, light, 0.55));
      p.rect(ox, oy + 15, 16, 1, mix(own, dark, 0.95));
      p.rect(ox + 15, oy, 1, 16, mix(own, dark, 0.8));
      p.rect(ox + 1, oy + 14, 14, 1, mix(own, dark, 0.35));
      if (speck(ox, oy, seed) < 0.3) { let cx = ox + 4 + Math.floor(speck(oy, ox, seed) * 7); for (let y = 3; y < 12; y++) { if (speck(cx, y, seed) > 0.55) cx += speck(y, cx, seed) > 0.5 ? 1 : -1; p.dot(cx, oy + y, mix(own, dark, 0.9)); p.dot(cx + 1, oy + y, mix(own, light, 0.4)); } }
    }
    return p;
  }
  const floor = path ? mix(base, light, 0.55) : base;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // Soft drifts of lighter and darker, so the ground is never one flat colour.
    // It repeats exactly once a tile, so one tile runs into the next without a seam.
    const drift = Math.sin((x / N) * Math.PI * 2 + 1) * Math.cos((y / N) * Math.PI * 2) + (speck(x, y, seed + 11) - 0.5) * 0.35;
    p.dot(x, y, mix(floor, drift > 0 ? light : dark, Math.min(0.3, Math.abs(drift) * 0.26)));
  }
  if (biome === "dunes") {
    // Ripples: a dark crest with a pale line under it, bowed.
    for (let n = 0; n < 7; n++) { const x = Math.floor(speck(n, 1, seed) * 22); const y = 3 + Math.floor(speck(n, 2, seed) * 26); const len = 6 + Math.floor(speck(n, 3, seed) * 5); for (let i = 0; i < len; i++) { const bow = Math.round(Math.sin((i / (len - 1)) * Math.PI) * -1.6); p.dot(x + i, y + bow, dark); p.dot(x + i, y + bow + 1, light); } }
  } else if (biome === "crags" || path) {
    // Pebbles, each lit on top with a shadow beneath.
    for (let n = 0; n < 7; n++) { const x = 1 + Math.floor(speck(n, 3, seed) * 27); const y = 1 + Math.floor(speck(n, 4, seed) * 27); const r = 1 + Math.floor(speck(n, 5, seed) * 2); p.rect(x, y, r + 2, r + 1, mix(floor, dark, 0.75)); p.rect(x, y, r + 1, 1, light); p.dot(x, y + 1, light); p.rect(x + 1, y + r + 1, r + 2, 1, mix(dark, [0, 0, 0], 0.3)); }
  } else {
    // Blades of grass in little tufts: three strokes fanning up, pale at the tips.
    for (let n = 0; n < 9; n++) {
      const x = 2 + Math.floor(speck(n, 5, seed) * 26);
      const y = 5 + Math.floor(speck(n, 6, seed) * 24);
      const tip = mix(light, [255, 255, 255], 0.3);
      p.dot(x, y, dark); p.dot(x + 1, y, dark); p.dot(x + 2, y, dark);
      p.dot(x - 1, y - 1, light); p.dot(x - 1, y - 2, tip);
      p.dot(x + 1, y - 1, light); p.dot(x + 1, y - 2, light); p.dot(x + 1, y - 3, tip);
      p.dot(x + 3, y - 1, light); p.dot(x + 3, y - 2, tip);
    }
  }
  return p;
}

/** How far a pixel is inside a patch of tiles that join: 0 on an open edge, growing inwards. Corners where two open sides meet are rounded. */
function inset(x: number, y: number, mask: number, round = 9): number {
  const r = mask & 1 ? 99 : N - 1 - x;
  const d = mask & 2 ? 99 : N - 1 - y;
  const l = mask & 4 ? 99 : x;
  const u = mask & 8 ? 99 : y;
  let far = Math.min(r, d, l, u);
  for (const [a, b] of [[l, u], [r, u], [l, d], [r, d]]) if (a! < round && b! < round) far = Math.min(far, round - Math.sqrt((round - a!) * (round - a!) + (round - b!) * (round - b!)));
  return far;
}

/** Something that blocks the way. Out of doors, a wood or a cliff; under a roof, a wall of stone. Each shows a face where the tile below it is open. */
function wall(land: Land, biome: string, seed: number, mask: number): Paint {
  const [light, mid, dark, deep] = land.wall.map(rgb) as [Rgb, Rgb, Rgb, Rgb];
  const face = !(mask & 2);
  if (land.inside) {
    const p = paint();
    const top = face ? 13 : N;
    // The top, seen from above: capstones, each lit along its top, with a pale rim along every open side.
    for (let y = 0; y < top; y++) for (let x = 0; x < N; x++) {
      const course = y >> 4;
      const joint = y % 16 === 15 || (x + (course ? 8 : 0)) % 16 === 11;
      p.dot(x, y, joint ? mix(mid, deep, 0.55) : y % 16 === 0 ? mix(mid, light, 0.65) : mix(mid, speck(x >> 1, y >> 1, seed + 1) > 0.5 ? light : dark, 0.12 + speck(x >> 2, y >> 2, seed) * 0.12));
    }
    if (!(mask & 8)) { p.rect(0, 0, N, 1, light); p.rect(0, 1, N, 1, mix(mid, light, 0.6)); }
    if (!(mask & 4)) p.rect(0, 0, 2, top, mix(mid, light, 0.7));
    if (!(mask & 1)) p.rect(N - 2, 0, 2, top, dark);
    if (!face) return p;
    p.rect(0, top - 2, N, 2, light);
    // Its front: courses of brick, each lit along its top and darker towards the floor.
    for (let row = 0; row < 3; row++) {
      const y = top + row * 6;
      const body = mix(mid, dark, 0.15 + row * 0.38);
      for (let by = 0; by < 6; by++) for (let x = 0; x < N; x++) p.dot(x, y + by, mix(body, speck(x >> 1, y + by, seed) > 0.5 ? light : deep, 0.08));
      p.rect(0, y, N, 1, mix(body, light, 0.45));
      p.rect(0, y + 5, N, 1, mix(dark, deep, 0.7));
      for (let x = row % 2 ? 5 : 13; x < N; x += 16) { p.rect(x, y, 1, 5, mix(dark, deep, 0.7)); p.rect(x + 1, y, 1, 5, mix(body, light, 0.3)); }
    }
    p.rect(0, N - 1, N, 1, deep);
    return p;
  }
  const p = ground(land, biome, seed, false);
  if (land.trees) {
    // A wood: round heads of leaves crowding together, each lit on its top left and dark beneath, with trunks showing along the bottom.
    if (face) for (const tx of [7, 23]) { p.rect(tx - 3, 20, 7, 12, rgb("#2e1a14")); p.rect(tx - 2, 20, 4, 11, rgb("#6e4428")); p.rect(tx - 1, 20, 2, 10, rgb("#9a6838")); p.rect(tx - 6, 30, 13, 2, mix(rgb(land.base), [0, 0, 0], 0.35)); }
    const low = face ? 24 : N;
    for (let y = 0; y < low; y++) for (let x = 0; x < N; x++) {
      const scallop = Math.sin((x + y * 0.6 + seed * 2) * 0.72) * 1.6;
      const far = inset(x, face ? y + 8 : y, face ? mask | 2 : mask) + scallop;
      const hem = face ? low - 1 - y + Math.sin((x + seed) * 0.8) * 2.2 : 99;
      const depth = Math.min(far, hem);
      if (depth < 1) continue;
      // The nearest head of leaves, on a lattice that wraps at the tile's edge.
      const cx = ((x + ((y / 11) | 0) * 5 + seed * 3) % 11) - 5;
      const cy = (y % 11) - 5;
      const d = Math.sqrt(cx * cx + cy * cy);
      const lit = -cx * 0.6 - cy * 0.8;
      let c = d > 5.4 ? deep : lit > 2.6 ? light : lit > 0.2 ? mid : lit > -2.6 ? dark : mix(dark, deep, 0.7);
      if (lit > 3.8 && d < 4.4) c = mix(light, [255, 255, 255], 0.22);
      if (depth < 2.2) c = deep;
      else if (depth < 4 && lit < 1) c = mix(c, deep, 0.5);
      p.dot(x, y, c);
    }
    return p;
  }
  // A cliff: a flat top with a pale rim, and a face of rock where it drops to the ground below.
  const top = face ? 18 : N;
  for (let y = 0; y < top; y++) for (let x = 0; x < N; x++) {
    const far = inset(x, y, mask | 2, 6);
    if (far < 0.5) continue;
    const grain = Math.sin((x * 0.5 + y * 0.9 + seed) * 0.8) * 0.5 + (speck(x >> 1, y >> 1, seed) - 0.5);
    const lit = (!(mask & 8) && y < 4) || (!(mask & 4) && x < 4);
    p.dot(x, y, far < 1.5 ? deep : far < 4 ? (lit ? light : mix(mid, dark, 0.6)) : mix(mid, grain > 0 ? light : dark, Math.min(0.45, Math.abs(grain) * 0.4)));
  }
  for (let n = 0; n < 4; n++) { const x = 6 + Math.floor(speck(n, 1, seed) * 20); const y = 5 + Math.floor(speck(n, 2, seed) * 8); if (inset(x, y, mask | 2, 6) > 5 && y < top - 4) { p.dot(x, y, dark); p.dot(x + 1, y + 1, dark); p.dot(x + 2, y + 1, dark); p.dot(x + 1, y + 2, light); } }
  if (face) {
    for (let y = top; y < N; y++) for (let x = 0; x < N; x++) {
      if (inset(x, 10, mask | 2 | 8, 6) < 0.5) continue;
      // Strata: columns of rock, each lit down its left side.
      const col = (x + seed * 3) % 9;
      const t = (y - top) / (N - top);
      const body = mix(mix(mid, dark, 0.5 + t * 0.5), deep, t * 0.5);
      p.dot(x, y, y === top ? light : y === top + 1 ? mix(mid, light, 0.4) : y >= N - 1 ? deep : col === 0 ? mix(body, deep, 0.6) : col === 1 ? mix(body, light, 0.3) : body);
    }
  }
  return p;
}

/** Water: bands of light moving across it, and a bank wherever it meets the land. */
function water(land: Land, seed: number, frame: number, mask: number): Paint {
  const p = paint();
  const [base, light, deep] = land.water.map(rgb) as [Rgb, Rgb, Rgb];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wave = Math.sin((x + frame * 8) * 0.2 + Math.sin(y * 0.4 + seed) * 1.3 + y * 0.5);
    const far = inset(x, y, mask, 7);
    const c = wave > 0.9 ? mix(light, [255, 255, 255], 0.3) : wave > 0.62 ? mix(base, light, 0.5) : wave < -0.72 ? mix(base, deep, 0.5) : base;
    // The bank: its shadow under the top edge, and foam that comes and goes along the others.
    const foam = Math.sin((x + y) * 0.7 + frame * 1.57) > -0.2;
    p.dot(x, y, far < 0 ? mix(rgb(land.base), [0, 0, 0], 0.25) : far < 4 && !(mask & 8) && y < 4 ? deep : far < 1.5 ? (foam ? [240, 248, 255] : light) : far < 3 ? mix(c, light, 0.45) : far < 7 ? mix(c, deep, 0.22) : c);
  }
  return p;
}

function pit(mask: number): Paint {
  const p = paint();
  p.rect(0, 0, N, N, [6, 6, 14]);
  if (!(mask & 8)) { p.rect(0, 0, N, 2, rgb("#545a70")); p.rect(0, 2, N, 3, rgb("#2e3248")); p.rect(0, 5, N, 4, rgb("#1a1c30")); for (let x = 0; x < N; x += 2) p.dot(x, 9, rgb("#1a1c30")); }
  if (!(mask & 4)) p.rect(0, 0, 2, N, rgb("#1a1c30"));
  if (!(mask & 1)) p.rect(N - 2, 0, 2, N, rgb("#1a1c30"));
  return p;
}

const made = new Map<string, Sprite>();
/**
 * One tile of a room, as a picture 32 pixels square. `seed` picks which of the many grasses or
 * bricks it is, `frame` moves what moves (water, a torch's flame), and `mask` says which neighbours
 * are the same kind of tile (1 right, 2 below, 4 left, 8 above), so that woods, cliffs, walls and
 * water join up.
 */
export function tileArt(biome: string, tile: number, seed: number, frame: number, mask: number): Sprite {
  const land = landOf(biome);
  const moving = tile === T.water || tile === T.torch;
  const joins = tile === T.wall || tile === T.water || tile === T.pit;
  const key = `${biome}:${tile}:${seed % 8}:${moving ? frame % 4 : 0}:${joins ? mask : 0}`;
  let got = made.get(key);
  if (got) return got;
  let p: Paint;
  if (tile === T.wall) p = wall(land, biome, seed % 8, mask);
  else if (tile === T.water) p = water(land, seed % 8, frame % 4, mask);
  else if (tile === T.pit) p = pit(mask);
  else {
    p = ground(land, biome, seed % 8, tile === T.path);
    const name = tile === T.bush && biome === "dunes" ? "cactus" : tile === T.torch && frame % 4 >= 2 ? "torch:2" : PROP_OF[tile];
    if (name) p.stamp(PROPS[name]!);
  }
  got = p.s;
  made.set(key, got);
  return got;
}
