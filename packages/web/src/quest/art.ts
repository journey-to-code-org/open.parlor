// Zubra Quest's pictures: who is in it, what lies about, and the ground it is played on. People and
// things are drawn by hand, a letter a pixel (see retro/pixels.ts for the letters); most are the
// same on both sides, so only their left half is written down. The ground, the trees, the water
// and the walls are painted by rule instead, so no two tiles of grass are the same tile.
import { QUEST_TILE } from "@journey-to-code/games";
import { blank, bobbed, flipped, mirrored, rgb, speck, sprite, turned, type Rgb, type Sprite } from "../retro/pixels";

const half = (rows: string[], swap?: Record<string, string>) => sprite(mirrored(rows), swap);

// ---- Zub, and the people he meets ------------------------------------------------------------------

const ZUB_FRONT = [
  "......00",
  ".00..055",
  "0210.050",
  "02100515",
  ".0011111",
  ".0151111",
  ".0110011",
  ".0110011",
  ".0211111",
  "..023333",
  "..0r3403",
  ".0rRrrrr",
  ".01UUvUU",
  ".010UUvU",
  "..00UUUv",
  "...0550.",
];
const ZUB_BACK = [
  "......00",
  ".00..055",
  "0210.050",
  "02100515",
  ".0011150",
  ".0151105",
  ".0111150",
  ".0151105",
  ".0211150",
  "..021105",
  "..0r2250",
  ".0rRrrrr",
  ".01UUvUU",
  ".010UUvU",
  "..00UUUv",
  "...0550.",
];
const ZUB_SIDE = [
  ".....0000.......",
  "....0550500.....",
  "...055051120....",
  "...0501111110...",
  "..0550111111110.",
  "..0501151111110.",
  "..0550111100110.",
  "..05011111001330",
  "..05501111133340",
  "...0211111333300",
  "....0rRrrr00000.",
  "....0UUvUU10....",
  "....0UUUvU10....",
  "....0UvUUUU0....",
  "....0550.0550...",
  "....000..000....",
];
/** A step: one foot lifted, then the other. */
function steps(s: Sprite): [Sprite, Sprite] {
  const lift = (left: boolean) => {
    const out: Sprite = { w: s.w, h: s.h, data: s.data.slice() };
    for (let x = left ? 0 : s.w / 2; x < (left ? s.w / 2 : s.w); x++) out.data.fill(0, ((s.h - 1) * s.w + x) * 4, ((s.h - 1) * s.w + x) * 4 + 4);
    return out;
  };
  return [lift(true), lift(false)];
}
const front = half(ZUB_FRONT);
const back = half(ZUB_BACK);
const side = sprite(ZUB_SIDE);
/** Zub by the way he faces (right, down, left, up): standing, then the two frames of a walk. Left is right, turned round. */
export const ZUB: [Sprite, Sprite, Sprite][] = [[side, bobbed(side), side], [front, ...steps(front)], [flipped(side), flipped(bobbed(side)), flipped(side)], [back, ...steps(back)]];
export const ZUB_BIG = front;

export const FOLK: Record<string, Sprite> = {
  elder: half([
    "......00",
    ".00..033",
    "0320.030",
    "03200323",
    ".0022222",
    ".0232222",
    ".0220022",
    ".0222222",
    ".0211111",
    "..011111",
    "..0P1111",
    ".0PP1111",
    ".0PmP111",
    ".0PPmP11",
    ".0PPPmPP",
    "..000000",
  ]),
  // Bru is his brother's spit: the same drawing in a shopkeeper's colours.
  keeper: half(ZUB_FRONT, { U: "o", v: "Y", r: "G", R: "h" }),
};

// ---- What he fights --------------------------------------------------------------------------------

const two = (rows: string[], swap?: Record<string, string>): [Sprite, Sprite] => { const s = half(rows, swap); return [s, bobbed(s)]; };
const SLIME = [
  "........",
  "........",
  "........",
  "........",
  ".....000",
  "...00ggg",
  "..0gg1gg",
  ".0gGGGGG",
  ".0GG00GG",
  "0GGG01GG",
  "0GGGGGGG",
  "0GGGGG00",
  "0hGGGGGG",
  "0hhGGGGh",
  ".0hhhhhh",
  "..000000",
];
const CHARGER = [
  "........",
  "........",
  "..00....",
  ".0dd0000",
  ".0dccccc",
  "0dccccdc",
  "0dc0cccc",
  "0dc01ccc",
  "0dcccccb",
  "10dccbbb",
  "110dbb0b",
  ".00dbbbb",
  "..0dcccc",
  "..0dddcd",
  "..0e0.0e",
  "..00...0",
];
const WISP = [
  "........",
  ".......0",
  "......0t",
  ".....0tt",
  "....0ttu",
  "...0ttu1",
  "..0tTt11",
  "..0tt011",
  ".0tTt011",
  ".0tttt11",
  ".0tTttt0",
  ".0ttTttt",
  "..0ttTtt",
  "..0t0tt0",
  "...0.00.",
  "........",
];
export const FOES: Record<string, [Sprite, Sprite]> = {
  slime: two(SLIME),
  skitter: two([
    "........",
    "........",
    "........",
    "........",
    "...0..00",
    "..0.00oo",
    ".0..0ooy",
    "0..0ooo1",
    ".000oRo0",
    "0..0oRRo",
    ".0.0oRRR",
    "0.00oooo",
    "..0.0ooo",
    ".0...000",
    "0.......",
    "........",
  ]),
  bat: [
    half([
      "........",
      "........",
      ".0......",
      "0P0.....",
      "0PP0...0",
      "0PPP0.0P",
      ".0PPP0PP",
      ".0mPPPP1",
      "..0mPPP0",
      "...0mPPP",
      "....0mPk",
      ".....0PP",
      "......00",
      "........",
      "........",
      "........",
    ]),
    half([
      "........",
      "........",
      "........",
      "........",
      ".......0",
      "......0P",
      "..0000PP",
      ".0PPPPP1",
      "0PPmPPP0",
      "0Pm0mPPP",
      "0m0.0mPk",
      ".0...0PP",
      "......00",
      "........",
      "........",
      "........",
    ]),
  ],
  spitter: two([
    "........",
    "......0k",
    ".....0kk",
    "....0kpk",
    "....00kk",
    "...0GG00",
    "..0GgGGG",
    ".0GgGG0G",
    ".0GGGG0G",
    "0hGGGGGG",
    "0hGGG000",
    "0hGGGGGG",
    ".0hGGGGG",
    ".0hhGGGh",
    "..0hhhhh",
    "...00000",
  ]),
  charger: two(CHARGER),
  knight: two([
    ".....000",
    "....0222",
    "...02221",
    "...02333",
    "...03000",
    "...03r0r",
    "..003333",
    ".0U02333",
    "0Uu03333",
    "0Uu02223",
    "0Uv03333",
    "0Uv04334",
    ".0003443",
    "...04004",
    "...0500.",
    "...000..",
  ]),
  wisp: two(WISP),
};

const MAW = [
  "................",
  "..........000000",
  "........00hGGGGG",
  "......00hGGgggGG",
  ".....0hGGggggggG",
  "....0hGGgggGGGGg",
  "...0hGGggGGGGGGG",
  "..0hGGGgGGGGGGGG",
  "..0hGGGGGGG00GGG",
  ".0hGGGGGGG0yy0GG",
  ".0hGGGGGGG0y00GG",
  ".0hGGGGGGGG00GGG",
  "0hhGGGGGGGGGGGGG",
  "0hhGGGGGGGGGGGGG",
  "0hhGG00000000000",
  "0hhG0RkRkRkRkRkR",
  "0hhGG00000000000",
  "0hhhGGGGGGGGGGGG",
  "0HhhGGGGGGGGGGGG",
  ".0HhhGGGGGGGGGGG",
  ".0HhhhGGGGGGGGGG",
  ".0HHhhhGGGGGGGGG",
  "..0HHhhhhGGGGGGG",
  "..0HHHhhhhhhGGGG",
  "...0HHHhhhhhhhhh",
  "....00HHHHhhhhhh",
  "..0...00HHHHHHHH",
  ".0h0....00000000",
  "0hG0..0.....0hh0",
  "0hGh00h0...0hGGh",
  ".0hhhhGh000hGGhh",
  "..00000000000000",
];
const MAW_OPEN = [
  "0hhGG00000000000",
  "0hhG0kkkkkkkkkkk",
  "0hh0k1q1qqq1qqq1",
  "0hh0kqqqqqqqqqqq",
  "0hh0kqqqRRRRqqqq",
  "0hh0k1qqRrrRqq1q",
  "0hhG0kkkkkkkkkkk",
  ".0HhG00000000000",
];
export const BOSSES: Record<string, Sprite> = {
  maw: half(MAW),
  "maw:open": half([...MAW.slice(0, 13), ...MAW_OPEN, ...MAW.slice(21)]),
  tusker: half([
    "................",
    "................",
    "....000.........",
    "...0ddd00.......",
    "...0dccdd0000000",
    "..0dccccddddcccc",
    "..0dcccccccccccc",
    ".0dccccccccccccc",
    ".0dcccccccdddccc",
    "0ddcccccc0000dcc",
    "0dccccccc0r10dcc",
    "0dccccccc0000ccc",
    "0dcccccccccccccc",
    "0dccccccccccbbbb",
    "0dcccccccccbbbbb",
    "10dccccccccbbbbb",
    "110dcccccccbb00b",
    "1110dccccccbb00b",
    "01110ddccccbbbbb",
    ".01120dddccccbbb",
    "..0000eddddccccc",
    "....0edddddddddd",
    "...0eddccccccccc",
    "...0edccccccccdd",
    "...0edcccccccdde",
    "...0eddccccddde0",
    "...0eeddddddee0.",
    "...0e0eeeeee00..",
    "..0ee0.0000.....",
    "..0550..........",
    "..0000..........",
    "................",
  ]),
  gloom: half([
    "...........00000",
    ".........00ppppp",
    ".......00ppPPPPP",
    "......0ppPPPPPPP",
    ".....0pPPPPPPPPP",
    "....0pPPPPmmmmmm",
    "....0pPPPmm00000",
    "...0pPPPmm000000",
    "...0pPPPm00yy000",
    "...0pPPPm00y1000",
    "...0pPPPm0000000",
    "..0pPPPPmm000000",
    "..0pPPPPPmm00000",
    "..0pPPPPPPmmmmmm",
    ".0pPPPPPPPPPPPPP",
    ".0pPPmPPPPPPPPPP",
    "0pPPPmPPPPPPPPPP",
    "0pPPmmPPPPPPmPPP",
    "0PPPmPPPPPPPmPPP",
    "0PPmmPPPPPPmmPPP",
    "0PPm0PPPPPPm0PPP",
    ".0m0.0PPPPPm.0PP",
    "..0..0PPPPm0..0P",
    ".....0PPPm0....0",
    "......0Pm0......",
    "......0m0.......",
    ".......0........",
    "................",
    "................",
    "................",
    "................",
    "................",
  ]),
  quagg: half([
    "............0000",
    "...00......0yyyy",
    "..0dd0....0yYyYy",
    ".0dbbd0...0YYYYY",
    ".0dbbbd00000eeee",
    "..0dbbbccccccccc",
    "...0dbcccceecccc",
    "...0dccce0000ccc",
    "...0dccc0rr10ccc",
    "...0dccce0000ccc",
    "...0deccccccccee",
    "....0dcccccccccc",
    "....0dccbbbbbbbb",
    ".....0dbbbb00bbb",
    "....000dbbbbbbbb",
    "..00qRR0dddddddd",
    ".0qRRRRR00000000",
    "0qRRRRRqm0PPPPPP",
    "0qRRRRqmm0PPpPPP",
    "0qRRRRqm0PPPpPPP",
    "0qRRRRq0c0PPPPPP",
    "0qRRRRq0c0PPmmPP",
    "0qRRRRq0b0PPPPPP",
    "0qRRRRRq00mmmmmm",
    "0qRRRRRRq0PPPPPP",
    "0qqRRRRRq0PPm0PP",
    ".0qqRRRRq0Pm00PP",
    ".0qqqRRRq0dd0.0d",
    "..0qqqqqq0dd0.0d",
    "...000000eee0.0e",
    "........0000..00",
    "................",
  ]),
};

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

interface Land { base: string; light: string; dark: string; wall: [string, string, string, string]; water: [string, string, string]; inside: boolean; trees: boolean }
const LANDS: Record<string, Land> = {
  meadow: { base: "#4aa84a", light: "#74cc62", dark: "#2f8a3c", wall: ["#56b454", "#2f8a3c", "#1c5e2c", "#0f3a20"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: false, trees: true },
  dunes: { base: "#e6c67e", light: "#f6e0a6", dark: "#c69e5c", wall: ["#e0a868", "#b87a44", "#8a5630", "#5a3420"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: false, trees: false },
  marsh: { base: "#3e8468", light: "#5ca482", dark: "#2a644e", wall: ["#3c9070", "#226a54", "#144a40", "#0c2e2c"], water: ["#2e7e8c", "#62b4b4", "#1e5a6a"], inside: false, trees: true },
  crags: { base: "#a08c7c", light: "#b8a696", dark: "#7c6a5c", wall: ["#b0b4c0", "#80849a", "#565a70", "#30344a"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: false, trees: false },
  cave: { base: "#6e5646", light: "#846a58", dark: "#523e32", wall: ["#b89a78", "#8e7258", "#5a4638", "#2a1e1a"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: true, trees: false },
  bramble: { base: "#5e7a5a", light: "#70906a", dark: "#48624a", wall: ["#6c9a62", "#4a7448", "#30523a", "#162a22"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: true, trees: false },
  vault: { base: "#c8a868", light: "#dec284", dark: "#a8884c", wall: ["#e2b868", "#b88a44", "#8a6030", "#4a3018"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: true, trees: false },
  hollow: { base: "#6c6088", light: "#8276a2", dark: "#544a70", wall: ["#8a7ab8", "#62548e", "#40366a", "#1e1a3a"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: true, trees: false },
  keep: { base: "#80626a", light: "#987a82", dark: "#604a52", wall: ["#a8707a", "#7c4a56", "#54303e", "#281420"], water: ["#3a7ae0", "#7ab4ff", "#2a56b0"], inside: true, trees: false },
};
const landOf = (biome: string) => LANDS[biome] ?? LANDS.meadow!;
const OUTLINE: Rgb = [11, 11, 20];

function paint(w = 16, h = 16) {
  const s = blank(w, h);
  const dot = (x: number, y: number, c: Rgb) => { if (x >= 0 && y >= 0 && x < w && y < h) s.data.set([c[0], c[1], c[2], 255], (y * w + x) * 4); };
  const rect = (x: number, y: number, rw: number, rh: number, c: Rgb) => { for (let py = y; py < y + rh; py++) for (let px = x; px < x + rw; px++) dot(px, py, c); };
  const stamp = (p: Sprite, ox = 0, oy = 0) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.data[(y * p.w + x) * 4 + 3]) dot(x + ox, y + oy, [p.data[(y * p.w + x) * 4]!, p.data[(y * p.w + x) * 4 + 1]!, p.data[(y * p.w + x) * 4 + 2]!]); };
  return { s, dot, rect, stamp };
}

/** Open ground: grass with tufts, sand with ripples, or flagstones under a roof. */
function ground(land: Land, seed: number, path: boolean, shaded = false) {
  const p = paint();
  const [base, light, dark] = [rgb(land.base), rgb(land.light), rgb(land.dark)];
  p.rect(0, 0, 16, 16, path && !land.inside ? light : base);
  if (land.inside) {
    // Flagstones: four to a tile, lit from the top left, a crack here and there.
    for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) {
      p.rect(ox, oy, 8, 1, light);
      p.rect(ox, oy, 1, 8, light);
      p.rect(ox, oy + 7, 8, 1, dark);
      p.rect(ox + 7, oy, 1, 8, dark);
      if (speck(ox, oy, seed) < 0.22) { const cx = ox + 2 + Math.floor(speck(oy, ox, seed) * 3); p.dot(cx, oy + 3, dark); p.dot(cx + 1, oy + 4, dark); p.dot(cx + 1, oy + 5, dark); }
    }
    // Under a wall: its shadow.
    if (shaded) { p.rect(0, 0, 16, 3, dark); for (let x = 0; x < 16; x += 2) p.dot(x, 3, dark); }
    return p;
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = speck(x, y, seed);
    if (n < 0.035) { p.dot(x, y, path ? base : light); if (!path) p.dot(x + 1, y - 1, light); }
    else if (n > 0.965) { p.dot(x, y, path ? base : dark); if (!path) p.dot(x - 1, y - 1, dark); }
    else if (path && n > 0.9) p.dot(x, y, dark);
  }
  return p;
}

/** Something that blocks the way: a tree, a boulder, or a wall of brick. `face` when the tile below is open, so its front shows. */
function wall(land: Land, seed: number, face: boolean) {
  const [light, mid, dark, deep] = land.wall.map(rgb) as [Rgb, Rgb, Rgb, Rgb];
  if (land.inside) {
    const p = paint();
    p.rect(0, 0, 16, 16, mid);
    const top = face ? 6 : 16;
    // The top of the wall, seen from above: capstones, two courses to a tile, each lit along its top.
    p.rect(0, 0, 16, top, mid);
    for (const y of [0, 8]) if (y < top) { p.rect(0, y, 16, 1, light); p.rect(0, y + 7, 16, 1, dark); }
    for (const [x, y] of [[5, 0], [13, 8]] as const) if (y < top) p.rect(x, y, 1, Math.min(8, top - y), dark);
    for (let y = 0; y < top; y++) for (let x = 0; x < 16; x++) if (speck(x, y, seed) > 0.93) p.dot(x, y, light);
    if (!face) return p;
    p.rect(0, top, 16, 1, deep);
    // Its front: courses of brick, darker towards the floor.
    for (let row = 0; row < 3; row++) {
      const y = top + 1 + row * 3;
      p.rect(0, y, 16, 2, row === 2 ? dark : mid);
      p.rect(0, y + 2, 16, 1, deep);
      for (let x = row % 2 ? 3 : 7; x < 16; x += 8) p.rect(x, y, 1, 2, deep);
      p.rect(0, y, 16, 1, row === 0 ? light : row === 1 ? mid : dark);
      for (let x = row % 2 ? 3 : 7; x < 16; x += 8) p.dot(x, y, deep);
    }
    return p;
  }
  const p = ground(land, seed, false);
  if (land.trees) {
    // A round tree: a trunk, and a head lit from the top left.
    p.rect(6, 12, 4, 4, rgb("#4a2a1c"));
    p.rect(7, 12, 2, 3, rgb("#7a4a2c"));
    for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = (y - 6.5) * 1.08;
      const far = dx * dx + dy * dy;
      if (far > 58) continue;
      const lit = (x - 5) * (x - 5) + (y - 4) * (y - 4);
      p.dot(x, y, far > 46 ? deep : lit < 9 ? light : lit < 30 || speck(x, y, seed) < 0.12 ? mid : dark);
    }
    for (const [x, y] of [[4, 3], [9, 2], [11, 6], [5, 8], [8, 10]] as const) if (speck(x, y, seed) < 0.7) { p.dot(x, y, light); p.dot(x + 1, y, light); }
    return p;
  }
  // A boulder.
  for (let y = 1; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 8;
    const dy = (y - 8.5) / 7.5;
    const far = dx * dx * dx * dx + dy * dy * dy * dy;
    if (far > 1) continue;
    p.dot(x, y, far > 0.72 ? deep : y < 5 && x < 11 ? light : y > 11 || x > 12 ? dark : mid);
  }
  for (const [x, y] of [[5, 7], [6, 8], [6, 9], [10, 5], [10, 6], [9, 11]] as const) if (speck(x, y, seed) < 0.75) p.dot(x, y, dark);
  return p;
}

function water(land: Land, seed: number, frame: number, shore: boolean) {
  const p = paint();
  const [base, light, deep] = land.water.map(rgb) as [Rgb, Rgb, Rgb];
  p.rect(0, 0, 16, 16, base);
  for (let n = 0; n < 5; n++) {
    const x = (Math.floor(speck(n, 1, seed) * 16) + frame * 3) % 16;
    const y = 2 + Math.floor(speck(n, 2, seed) * 13);
    for (let i = 0; i < 4; i++) p.dot((x + i) % 16, y, light);
    p.dot((x + 1) % 16, y + 1, deep);
    p.dot((x + 2) % 16, y + 1, deep);
  }
  if (shore) { p.rect(0, 0, 16, 2, deep); for (let x = (frame * 2) % 4; x < 16; x += 4) p.dot(x, 2, light); }
  return p;
}

function pit(shore: boolean) {
  const p = paint();
  p.rect(0, 0, 16, 16, OUTLINE);
  if (shore) { p.rect(0, 0, 16, 2, rgb("#2e3248")); p.rect(0, 2, 16, 1, rgb("#1a1c30")); }
  return p;
}

const made = new Map<string, Sprite>();
/**
 * One tile of a room, as a picture. `seed` picks which of the many grasses or bricks it is, `frame`
 * moves what moves (water, a torch's flame), and `below` and `above` are the tiles under and over
 * it, which decide whether a wall shows its face and water its bank.
 */
export function tileArt(biome: string, tile: number, seed: number, frame: number, below: number, above: number): Sprite {
  const land = landOf(biome);
  const moving = tile === T.water || tile === T.torch;
  const face = tile === T.wall && below !== T.wall && below !== -1;
  const shore = (tile === T.water && above !== T.water) || (tile === T.pit && above !== T.pit);
  const shaded = land.inside && above === T.wall && tile !== T.wall;
  const key = `${biome}:${tile}:${seed % 8}:${moving ? frame % 4 : 0}:${face ? 1 : 0}${shore ? 1 : 0}${shaded ? 1 : 0}`;
  let got = made.get(key);
  if (got) return got;
  let p;
  if (tile === T.wall) p = wall(land, seed % 8, face);
  else if (tile === T.water) p = water(land, seed % 8, frame % 4, shore);
  else if (tile === T.pit) p = pit(shore);
  else {
    p = ground(land, seed % 8, tile === T.path, shaded);
    const name = tile === T.bush && biome === "dunes" ? "cactus" : tile === T.torch && frame % 4 >= 2 ? "torch:2" : PROP_OF[tile];
    if (name) p.stamp(PROPS[name]!);
  }
  got = p.s;
  made.set(key, got);
  return got;
}
