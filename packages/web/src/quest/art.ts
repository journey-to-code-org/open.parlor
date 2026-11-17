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

function paint(w = 16, h = 16) {
  const s = blank(w, h);
  const dot = (x: number, y: number, c: Rgb) => { if (x >= 0 && y >= 0 && x < w && y < h) s.data.set([c[0], c[1], c[2], 255], (y * w + x) * 4); };
  const rect = (x: number, y: number, rw: number, rh: number, c: Rgb) => { for (let py = y; py < y + rh; py++) for (let px = x; px < x + rw; px++) dot(px, py, c); };
  const stamp = (p: Sprite, ox = 0, oy = 0) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.data[(y * p.w + x) * 4 + 3]) dot(x + ox, y + oy, [p.data[(y * p.w + x) * 4]!, p.data[(y * p.w + x) * 4 + 1]!, p.data[(y * p.w + x) * 4 + 2]!]); };
  return { s, dot, rect, stamp };
}
type Paint = ReturnType<typeof paint>;

/** Open ground: grass in soft patches with blades in it, sand in ripples, dirt with pebbles, or flagstones under a roof. */
function ground(land: Land, biome: string, seed: number, path: boolean): Paint {
  const p = paint();
  const [base, light, dark] = [rgb(land.base), rgb(land.light), rgb(land.dark)];
  if (land.inside) {
    // Flagstones, four to a tile: each a shade of its own, bevelled, lit from the top left.
    for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) {
      const own = mix(base, speck(ox, oy, seed) < 0.5 ? light : dark, speck(oy, ox, seed + 3) * 0.3);
      p.rect(ox, oy, 8, 8, own);
      p.rect(ox, oy, 8, 1, mix(own, light, 0.7));
      p.rect(ox, oy, 1, 8, mix(own, light, 0.5));
      p.rect(ox, oy + 7, 8, 1, mix(own, dark, 0.9));
      p.rect(ox + 7, oy, 1, 8, mix(own, dark, 0.7));
      p.dot(ox + 7, oy + 7, mix(dark, [0, 0, 0], 0.3));
      if (speck(ox, oy, seed) < 0.25) { const cx = ox + 2 + Math.floor(speck(oy, ox, seed) * 3); p.dot(cx, oy + 2, dark); p.dot(cx, oy + 3, dark); p.dot(cx + 1, oy + 4, dark); p.dot(cx + 1, oy + 5, mix(own, dark, 0.5)); }
    }
    return p;
  }
  const floor = path ? mix(base, light, 0.55) : base;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    // Soft patches a few pixels across, so the ground is never one flat colour.
    const patch = speck(x >> 2, y >> 2, seed + 11) * 0.6 + speck((x + 2) >> 3, (y + 2) >> 3, seed + 5) * 0.4;
    p.dot(x, y, mix(floor, patch > 0.5 ? light : dark, Math.abs(patch - 0.5) * 0.26));
  }
  if (biome === "dunes") {
    for (let n = 0; n < 4; n++) { const x = Math.floor(speck(n, 1, seed) * 11); const y = 2 + Math.floor(speck(n, 2, seed) * 12); for (let i = 0; i < 5; i++) { p.dot(x + i, y + (i === 0 || i === 4 ? 1 : 0), dark); p.dot(x + i, y + 1 + (i === 0 || i === 4 ? 1 : 0), light); } }
  } else if (biome === "crags" || path) {
    for (let n = 0; n < 4; n++) { const x = Math.floor(speck(n, 3, seed) * 13); const y = Math.floor(speck(n, 4, seed) * 13); p.rect(x, y, 2, 2, mix(floor, dark, 0.8)); p.dot(x, y, light); p.dot(x + 1, y + 2, mix(dark, [0, 0, 0], 0.25)); p.dot(x + 2, y + 2, mix(dark, [0, 0, 0], 0.25)); }
  } else {
    // Blades of grass: a pale stroke with a dark one under it.
    for (let n = 0; n < 6; n++) { const x = 1 + Math.floor(speck(n, 5, seed) * 13); const y = 2 + Math.floor(speck(n, 6, seed) * 12); p.dot(x, y, light); p.dot(x + 1, y - 1, mix(light, [255, 255, 255], 0.25)); p.dot(x + 2, y, light); p.dot(x + 1, y + 1, dark); }
  }
  return p;
}

/** How far a pixel is inside a patch of tiles that join: 0 on an open edge, growing inwards. Corners where two open sides meet are rounded off. */
function inset(x: number, y: number, mask: number): number {
  const r = mask & 1 ? 99 : 15 - x;
  const d = mask & 2 ? 99 : 15 - y;
  const l = mask & 4 ? 99 : x;
  const u = mask & 8 ? 99 : y;
  let far = Math.min(r, d, l, u);
  for (const [a, b] of [[l, u], [r, u], [l, d], [r, d]]) if (a! < 4 && b! < 4) far = Math.min(far, Math.round(4 - Math.sqrt((4 - a!) * (4 - a!) + (4 - b!) * (4 - b!))));
  return far;
}

/** Something that blocks the way. Out of doors, a wood or a cliff; under a roof, a wall of stone. Each shows a face where the tile below it is open. */
function wall(land: Land, biome: string, seed: number, mask: number): Paint {
  const [light, mid, dark, deep] = land.wall.map(rgb) as [Rgb, Rgb, Rgb, Rgb];
  const face = !(mask & 2);
  if (land.inside) {
    const p = paint();
    const top = face ? 7 : 16;
    // The top, seen from above: capstones with a lit rim along every open side.
    for (let y = 0; y < top; y++) for (let x = 0; x < 16; x++) {
      const joint = y % 8 === 7 || x === (y < 8 ? 5 : 13);
      const tone = speck(x >> 1, y >> 1, seed) * 0.25;
      p.dot(x, y, joint ? mix(mid, dark, 0.8) : y % 8 === 0 ? mix(mid, light, 0.6) : mix(mid, speck(x, y, seed + 1) > 0.5 ? light : dark, tone));
    }
    if (!(mask & 8)) p.rect(0, 0, 16, 1, light);
    if (!(mask & 4)) p.rect(0, 0, 1, top, mix(mid, light, 0.7));
    if (!(mask & 1)) p.rect(15, 0, 1, top, dark);
    if (!face) return p;
    p.rect(0, top - 1, 16, 1, light);
    // Its front: courses of brick, each lit along its top, darker towards the floor.
    for (let row = 0; row < 3; row++) {
      const y = top + row * 3;
      const body = mix(mid, dark, row * 0.4);
      p.rect(0, y, 16, 3, body);
      p.rect(0, y, 16, 1, mix(body, light, 0.35));
      p.rect(0, y + 2, 16, 1, mix(dark, deep, 0.6));
      for (let x = row % 2 ? 3 : 7; x < 16; x += 8) { p.rect(x, y, 1, 2, mix(dark, deep, 0.6)); p.dot(x + 1, y, mix(body, light, 0.6)); }
    }
    return p;
  }
  const p = ground(land, biome, seed, false);
  if (land.trees) {
    // A wood: leaves in clumps, each lit on its top left, with a scalloped edge wherever it is open, and trunks along the bottom.
    if (face) for (const tx of [3, 11]) { p.rect(tx - 1, 11, 3, 5, rgb("#3a2218")); p.rect(tx, 11, 1, 4, rgb("#8a5a34")); p.dot(tx + 1, 12, rgb("#5e3a22")); }
    for (let y = 0; y < (face ? 13 : 16); y++) for (let x = 0; x < 16; x++) {
      const wave = Math.round(Math.sin((x + y * 0.7 + seed) * 1.3) * 0.9);
      const far = inset(x, face ? y + 3 : y, face ? mask | 2 : mask) + (face && y > 9 ? 0 : 0);
      const edge = far + wave;
      const bottom = face ? 12 - y + Math.round(Math.sin((x + seed) * 1.6) * 1.2) : 99;
      const depth = Math.min(edge, bottom);
      if (depth < 1) continue;
      // The nearest clump, on a lattice five pixels across that wraps at the tile's edge.
      const gx = ((x + (y >> 2) * 2 + seed) % 5) - 2;
      const gy = ((y + (x >> 3) + seed * 3) % 5) - 2;
      const lit = gx + gy;
      const c = depth < 2 ? deep : lit < -1 ? light : lit < 1 ? mid : lit < 3 ? dark : mix(dark, deep, 0.6);
      p.dot(x, y, depth < 3 && lit > 0 ? mix(c, deep, 0.4) : !(mask & 8) && y < 4 && lit < 1 ? mix(c, light, 0.4) : c);
    }
    return p;
  }
  // A cliff: a flat top with a pale rim, and a face of rock where it drops to the ground below.
  const top = face ? 9 : 16;
  for (let y = 0; y < top; y++) for (let x = 0; x < 16; x++) {
    const far = inset(x, y, mask | 2);
    if (far < 1) continue;
    const grain = speck(x >> 1, y, seed) * 0.3;
    p.dot(x, y, far < 2 ? (!(mask & 8) && y < 3) || (!(mask & 4) && x < 3) ? light : dark : mix(mid, speck(x, y >> 1, seed + 2) > 0.5 ? light : dark, grain));
  }
  for (const [x, y] of [[4, 4], [5, 5], [10, 3], [11, 4], [11, 5], [7, 7]] as const) if (y < top - 1 && speck(x, y, seed) < 0.6 && inset(x, y, mask | 2) > 2) p.dot(x, y, dark);
  if (face) {
    for (let y = top; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (inset(x, 4, mask | 2 | 8) < 1) continue;
      const strata = speck(x >> 1, 9, seed) > 0.6 || x % 5 === (seed % 5);
      p.dot(x, y, y === top ? light : y === 15 ? deep : mix(mix(dark, deep, (y - top) / 8), deep, strata ? 0.5 : 0));
    }
  }
  return p;
}

/** Water: bands of light moving across it, and a bank wherever it meets the land. */
function water(land: Land, seed: number, frame: number, mask: number): Paint {
  const p = paint();
  const [base, light, deep] = land.water.map(rgb) as [Rgb, Rgb, Rgb];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const wave = Math.sin((x + frame * 4) * 0.39 + y * 0.9 + seed);
    const far = inset(x, y, mask);
    const c = wave > 0.86 ? light : wave > 0.55 ? mix(base, light, 0.35) : wave < -0.7 ? mix(base, deep, 0.5) : base;
    // The bank: its shadow under the top edge, and foam that comes and goes on the others.
    p.dot(x, y, far < 2 && !(mask & 8) && y < 2 ? deep : far === 0 ? ((x + y + frame) % 4 < 2 ? [240, 248, 255] : light) : far === 1 ? mix(c, light, 0.5) : far < 4 ? mix(c, deep, 0.25) : c);
  }
  return p;
}

function pit(mask: number): Paint {
  const p = paint();
  p.rect(0, 0, 16, 16, [6, 6, 14]);
  if (!(mask & 8)) { p.rect(0, 0, 16, 1, rgb("#545a70")); p.rect(0, 1, 16, 2, rgb("#2e3248")); p.rect(0, 3, 16, 2, rgb("#1a1c30")); for (let x = 0; x < 16; x += 2) p.dot(x, 5, rgb("#1a1c30")); }
  if (!(mask & 4)) p.rect(0, 0, 1, 16, rgb("#1a1c30"));
  if (!(mask & 1)) p.rect(15, 0, 1, 16, rgb("#1a1c30"));
  return p;
}

const made = new Map<string, Sprite>();
/**
 * One tile of a room, as a picture. `seed` picks which of the many grasses or bricks it is, `frame`
 * moves what moves (water, a torch's flame), and `mask` says which neighbours are the same kind of
 * tile (1 right, 2 below, 4 left, 8 above), so that woods, cliffs, walls and water join up.
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
