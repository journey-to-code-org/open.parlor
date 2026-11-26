// Peekaboo's pictures and the rules for which comes next. Everything here is plain data and pure
// functions, so it is the same on both ends of a call and can be tested without a screen.

export type Category = "animals" | "vehicles" | "things" | "shapes" | "colors" | "family";
export type Mode = "tap" | "peek" | "find";

export interface Thing {
  id: string;
  /** What it's called: the word a baby is learning. */
  word: string;
  /** What the voice says when it shows up: the word, and the sound it makes. */
  say: string;
  /** The picture: a big emoji (the device's own colour font), or a family member's photo. */
  emoji: string;
  photo?: string;
  /** Shapes and colours are drawn, not emoji: a shape in its colour, or a splash of the colour. */
  draw?: { shape: Shape | "splash"; fill: string };
  category: Category;
}

export type Shape = "circle" | "square" | "triangle" | "star" | "heart" | "diamond" | "oval" | "rectangle";

/** Colours as a baby sees them named: bright, and far enough apart to tell. */
export const COLORS = {
  red: "#e53935",
  orange: "#fb8c00",
  yellow: "#fdd835",
  green: "#43a047",
  blue: "#1e88e5",
  purple: "#8e24aa",
  pink: "#f06292",
  brown: "#8d6e63",
  black: "#262626",
  white: "#ffffff",
} as const;
export type ColorName = keyof typeof COLORS;

const t = (category: Category, emoji: string, word: string, sound?: string): Thing => ({
  id: `${category}:${word.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  word,
  say: sound ? `${word}! ${sound}` : `${word}!`,
  emoji,
  category,
});

/** The built-in pictures: everyday things a one-year-old meets, with the sounds they make. */
export const THINGS: Thing[] = [
  t("animals", "🐶", "Dog", "Woof woof!"),
  t("animals", "🐱", "Cat", "Meow!"),
  t("animals", "🐮", "Cow", "Moo!"),
  t("animals", "🦆", "Duck", "Quack quack!"),
  t("animals", "🐷", "Pig", "Oink oink!"),
  t("animals", "🐑", "Sheep", "Baa!"),
  t("animals", "🐴", "Horse", "Neigh!"),
  t("animals", "🐔", "Chicken", "Cluck cluck!"),
  t("animals", "🐸", "Frog", "Ribbit!"),
  t("animals", "🦉", "Owl", "Hoo hoo!"),
  t("animals", "🦁", "Lion", "Roar!"),
  t("animals", "🐝", "Bee", "Buzz!"),
  t("vehicles", "🚗", "Car", "Beep beep!"),
  t("vehicles", "🚚", "Truck", "Vroom!"),
  t("vehicles", "🚌", "Bus", "Beep beep!"),
  t("vehicles", "🚂", "Train", "Choo choo!"),
  t("vehicles", "✈️", "Airplane", "Zoom!"),
  t("vehicles", "🚜", "Tractor", "Putt putt!"),
  t("vehicles", "🚒", "Fire truck", "Wee-oo!"),
  t("vehicles", "⛵", "Boat"),
  t("things", "⚽", "Ball", "Bounce!"),
  t("things", "🍎", "Apple", "Crunch!"),
  t("things", "🍌", "Banana", "Yum!"),
  t("things", "🍪", "Cookie", "Yum yum!"),
  t("things", "👟", "Shoe"),
  t("things", "🧢", "Hat"),
  t("things", "📖", "Book"),
  t("things", "🥤", "Cup"),
  t("things", "🧸", "Teddy bear", "Hug!"),
  t("things", "🌙", "Moon", "Night night!"),
  t("things", "☀️", "Sun"),
  // Shapes, each always in the same colour so it is the shape that's new, not the colour.
  ...(
    [
      ["circle", "Circle", "Round and round!", "red", "🔴"],
      ["square", "Square", "Like a box!", "blue", "🟦"],
      ["triangle", "Triangle", "Pointy!", "green", "🔺"],
      ["star", "Star", "Twinkle twinkle!", "yellow", "⭐"],
      ["heart", "Heart", "I love you!", "pink", "💗"],
      ["diamond", "Diamond", "Sparkle!", "purple", "🔷"],
      ["oval", "Oval", "Like an egg!", "orange", "🥚"],
      ["rectangle", "Rectangle", "Like a door!", "brown", "▬"],
    ] as const
  ).map(([shape, word, sound, color, emoji]) => ({ ...t("shapes", emoji, word, sound), draw: { shape, fill: COLORS[color] } })),
  // Colours, each with something a baby knows that is that colour.
  ...(
    [
      ["red", "Like an apple!", "🔴"],
      ["orange", "Like an orange!", "🟠"],
      ["yellow", "Like a banana!", "🟡"],
      ["green", "Like a frog!", "🟢"],
      ["blue", "Like the sky!", "🔵"],
      ["purple", "Like grapes!", "🟣"],
      ["pink", "Like a piggy!", "🩷"],
      ["brown", "Like a teddy bear!", "🟤"],
      ["black", "Like the night!", "⚫"],
      ["white", "Like snow!", "⚪"],
    ] as const
  ).map(([color, sound, emoji]) => ({ ...t("colors", emoji, color[0]!.toUpperCase() + color.slice(1), sound), draw: { shape: "splash" as const, fill: COLORS[color] } })),
];

export const CATEGORIES: { id: Category; name: string; emoji: string }[] = [
  { id: "animals", name: "Animals", emoji: "🐮" },
  { id: "vehicles", name: "Things that go", emoji: "🚗" },
  { id: "things", name: "Everyday things", emoji: "⚽" },
  { id: "shapes", name: "Shapes", emoji: "🔺" },
  { id: "colors", name: "Colors", emoji: "🎨" },
  { id: "family", name: "Family", emoji: "👪" },
];

/** A family member, set up by the grown-ups on this device: a name and, if they like, a photo. */
export interface Person {
  name: string;
  emoji: string;
  /** A small JPEG as a data URL: small enough to send across a call. */
  photo?: string;
}

export const DEFAULT_FAMILY: Person[] = [
  { name: "Mama", emoji: "👩" },
  { name: "Dada", emoji: "👨" },
  // The baby himself: babies love their own name and their own face. The grown-ups put his name in.
  { name: "Baby", emoji: "👶" },
];

export const familyThings = (family: Person[]): Thing[] =>
  family
    .filter((p) => p.name.trim())
    .map((p, i) => ({ id: `family:${i}`, word: p.name.trim(), say: `${p.name.trim()}!`, emoji: p.emoji || "🙂", photo: p.photo, category: "family" as const }));

export interface Settings {
  mode: Mode;
  categories: Category[];
  /** A few pictures, seen again and again (how words are learned), or every picture in the chosen kinds. */
  few: boolean;
  /** How many pictures "Where's the…?" offers to choose between. */
  choices: 2 | 3;
  /** Say each picture's sound as well as its name. */
  sounds: boolean;
}

export const DEFAULT_SETTINGS: Settings = { mode: "tap", categories: ["animals"], few: true, choices: 2, sounds: true };
export const FEW = 6;

/** Settings as saved, made safe: anything missing or odd falls back to the default. */
export function tidySettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const kinds = Array.isArray(r.categories) ? r.categories.filter((c): c is Category => CATEGORIES.some((k) => k.id === c)) : [];
  return {
    mode: r.mode === "peek" || r.mode === "find" || r.mode === "tap" ? r.mode : DEFAULT_SETTINGS.mode,
    categories: kinds.length ? [...new Set(kinds)] : DEFAULT_SETTINGS.categories,
    few: typeof r.few === "boolean" ? r.few : DEFAULT_SETTINGS.few,
    choices: r.choices === 3 ? 3 : 2,
    sounds: typeof r.sounds === "boolean" ? r.sounds : DEFAULT_SETTINGS.sounds,
  };
}

/** A small, seedable random number source, so tests (and a replay) come out the same. */
export function randomFrom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The pictures in play: the chosen kinds, and only the first few of them when "a few" is on. Family always counts in full. */
export function inPlay(settings: Settings, family: Person[], random: () => number): Thing[] {
  const all = [...THINGS, ...familyThings(family)].filter((th) => settings.categories.includes(th.category));
  if (!settings.few) return all;
  const people = all.filter((th) => th.category === "family");
  const rest = shuffle(
    all.filter((th) => th.category !== "family"),
    random,
  ).slice(0, Math.max(0, FEW - Math.min(people.length, 2)));
  return [...people, ...rest];
}

/**
 * Which picture comes next: every picture once, in a shuffled order, before any comes again (a
 * shuffle bag), and never the same one twice in a row across the end of one round and the start of
 * the next.
 */
export function createBag(things: readonly Thing[], random: () => number) {
  let order: Thing[] = [];
  let last: Thing | null = null;
  return {
    next(): Thing {
      if (!things.length) throw new Error("No pictures to show");
      if (!order.length) {
        order = shuffle(things, random);
        if (order.length > 1 && order[0]!.id === last?.id) order.push(order.shift()!);
      }
      last = order.shift()!;
      return last;
    },
  };
}

/** A "Where's the…?" round: the picture asked for, and the others it's shown beside (of its own kind first), in a shuffled order. */
export function findRound(things: readonly Thing[], choices: number, random: () => number, avoid?: string): { target: string; choices: string[] } {
  const pool = things.length > 1 && avoid ? things.filter((th) => th.id !== avoid) : [...things];
  const target = pool[Math.floor(random() * pool.length)]!;
  // The others are of the same kind where there are enough of them: "Where's red?" among colours,
  // not beside a green triangle, which is green too.
  const rest = things.filter((th) => th.id !== target.id);
  const alike = rest.filter((th) => th.category === target.category);
  const others = [...shuffle(alike, random), ...shuffle(rest.filter((th) => th.category !== target.category), random)].slice(0, Math.max(0, choices - 1));
  return { target: target.id, choices: shuffle([target.id, ...others.map((o) => o.id)], random) };
}

/** What the voice says for a "Where's the…?" question (a family member's name has no "the"). */
/** A name ("Mama") or a colour ("red") is said without "the"; everything else with it. */
const bare = (thing: Thing) => thing.category === "family" || thing.category === "colors";
export const whereIs = (thing: Thing) => (bare(thing) ? `Where's ${thing.category === "colors" ? thing.word.toLowerCase() : thing.word}?` : `Where's the ${thing.word.toLowerCase()}?`);
export const thatsThe = (thing: Thing) => (bare(thing) ? `That's ${thing.category === "colors" ? thing.word.toLowerCase() : thing.word}!` : `That's the ${thing.word.toLowerCase()}!`);

/**
 * Where a picture lands when tapped: where the finger was, pulled in from the edges so the whole
 * picture shows (positions are fractions of the board, 0 to 1).
 */
export function placeAt(x: number, y: number, margin = 0.16): { x: number; y: number } {
  const clamp = (v: number) => Math.min(1 - margin, Math.max(margin, Number.isFinite(v) ? v : 0.5));
  return { x: clamp(x), y: clamp(y) };
}
