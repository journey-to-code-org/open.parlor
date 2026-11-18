// Tunables: the numbers a game lets its host change without a new release, kept on the server and
// read by the game when it starts.
//
//   settings/tunables   server only: one field for each game, { version, values, at }
//
// What is stored is an override: only what the host changed, never the whole table. The game merges
// it over its own defaults, so a game that gains a card or a foe is not broken by an old override.
// Every write bumps the version, and a game records the version it was played on, so a replay or a
// challenge link made on old numbers can say which numbers it needs.
//
// Each game has a schema of its own below. A schema is the range of every number it may take and the
// shape of the tables around them; it is not a list of the game's cards, which the server does not
// know (a card or foe the game doesn't have is simply never read).

/** What a value may be. */
export type Shape =
  | { type: "int"; min: number; max: number }
  | { type: "enum"; of: readonly string[] }
  /** Any number of entries, keyed by names that look like `key`. */
  | { type: "record"; key: RegExp; value: Shape; max: number }
  /** Named fields, each optional unless `required`. Anything else is refused. */
  | { type: "object"; fields: Readonly<Record<string, Shape>>; required?: readonly string[] }
  | { type: "list"; item: Shape; min: number; max: number };

const int = (min: number, max: number): Shape => ({ type: "int", min, max });
const name = /^[a-z][a-z0-9-]{0,23}$/;

/** The Back Room's tunables (packages/wasm/src/battler): the cards, the foes, and the pauses between floors. */
const BACK_ROOM: Shape = {
  type: "object",
  fields: {
    /** Hit points at the start of a run. */
    maxHp: int(10, 200),
    /** What is healed between floors. */
    rest: int(0, 60),
    cards: {
      type: "record",
      key: name,
      max: 64,
      value: {
        type: "object",
        fields: {
          cost: int(0, 5),
          damage: int(0, 99),
          hits: int(1, 8),
          block: int(0, 99),
          vulnerable: int(0, 5),
          draw: int(0, 5),
          energy: int(0, 5),
          heal: int(0, 40),
        },
      },
    },
    foes: {
      type: "record",
      key: name,
      max: 32,
      value: {
        type: "object",
        fields: {
          hp: int(1, 999),
          pattern: {
            type: "list",
            min: 1,
            max: 12,
            item: {
              type: "object",
              fields: { kind: { type: "enum", of: ["attack", "block"] }, amount: int(0, 99), hits: int(1, 8) },
              required: ["kind", "amount"],
            },
          },
        },
      },
    },
  },
};

/** The daily sudoku's clues for each weekday (Sunday first): packages/server/src/sudoku.ts. */
const SUDOKU: Shape = {
  type: "object",
  fields: { clues: { type: "list", min: 7, max: 7, item: int(22, 60) } },
};

/** Every game that can be tuned, and the shape of its tunables. */
export const TUNABLE_GAMES: Readonly<Record<string, { name: string; shape: Shape; /** The file in the repository that holds the numbers promoted into the code (see promote.ts). */ promoted: string }>> = {
  "back-room": { name: "Delbie's Back Room", shape: BACK_ROOM, promoted: "packages/wasm/src/battler/promoted.json" },
  sudoku: { name: "The daily sudoku", shape: SUDOKU, promoted: "packages/server/src/promoted/sudoku.json" },
};

/** What one game's overrides may weigh as JSON. A whole table of cards and foes is about 2,000. */
export const MAX_BYTES = 8_000;

/** Checks `value` against `shape`. Returns what is wrong, each as a path and a reason; empty if it is fine. */
export function check(shape: Shape, value: unknown, path = ""): string[] {
  const at = path || "values";
  switch (shape.type) {
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value)) return [`${at} must be a whole number.`];
      return value < shape.min || value > shape.max ? [`${at} must be from ${shape.min} to ${shape.max}.`] : [];
    case "enum":
      return typeof value === "string" && shape.of.includes(value) ? [] : [`${at} must be one of ${shape.of.join(", ")}.`];
    case "list": {
      if (!Array.isArray(value)) return [`${at} must be a list.`];
      if (value.length < shape.min || value.length > shape.max) return [`${at} must have ${shape.min === shape.max ? shape.min : `${shape.min} to ${shape.max}`} entries.`];
      return value.flatMap((item, i) => check(shape.item, item, `${at}[${i}]`));
    }
    case "record": {
      if (!isPlain(value)) return [`${at} must be an object.`];
      const keys = Object.keys(value);
      if (keys.length > shape.max) return [`${at} has too many entries (at most ${shape.max}).`];
      return keys.flatMap((k) => (shape.key.test(k) ? check(shape.value, value[k], `${at}.${k}`) : [`${at}.${k} isn't a valid name.`]));
    }
    case "object": {
      if (!isPlain(value)) return [`${at} must be an object.`];
      const named = (k: string) => (path ? `${path}.${k}` : k);
      const missing = (shape.required ?? []).filter((k) => !(k in value)).map((k) => `${named(k)} is needed.`);
      return [...missing, ...Object.keys(value).flatMap((k) => (k in shape.fields ? check(shape.fields[k]!, value[k], named(k)) : [`${named(k)} isn't something this game lets you change.`]))];
    }
  }
}

/** A shape as plain JSON (a name pattern becomes its source), for the admin app to check forms against. */
export function plain(shape: Shape): unknown {
  switch (shape.type) {
    case "record": return { ...shape, key: shape.key.source, value: plain(shape.value) };
    case "list": return { ...shape, item: plain(shape.item) };
    case "object": return { type: "object", fields: Object.fromEntries(Object.entries(shape.fields).map(([k, v]) => [k, plain(v)])), ...(shape.required ? { required: shape.required } : {}) };
    default: return shape;
  }
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

interface Sync {
  write(collection: string, key: string, fields: Record<string, unknown>): Promise<unknown>;
  documents(): Promise<{ get(collection: string, key: string): Record<string, unknown> | undefined }>;
}

export interface Saved {
  version: number;
  values: Record<string, unknown>;
  /** When it was last changed, in milliseconds. */
  at: number;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-cache" } });
const NONE: Saved = { version: 0, values: {}, at: 0 };

export function createTunables(sync: Sync, { mount = "/tunables", now = () => Date.now() }: { mount?: string; now?: () => number } = {}) {
  const docs = sync.documents();

  async function get(game: string): Promise<Saved> {
    const raw = (await docs).get("settings", "tunables")?.[game] as Partial<Saved> | undefined;
    if (!raw || typeof raw.version !== "number" || !isPlain(raw.values)) return NONE;
    return { version: raw.version, values: raw.values, at: typeof raw.at === "number" ? raw.at : 0 };
  }

  return {
    games: () => Object.entries(TUNABLE_GAMES).map(([id, g]) => ({ id, name: g.name, shape: plain(g.shape) })),
    get,
    /** Replaces a game's overrides. Resolves to what is wrong with them (nothing changes), or to what is now saved. */
    async set(game: string, values: unknown): Promise<{ problems: string[] } | { saved: Saved }> {
      const spec = TUNABLE_GAMES[game];
      if (!spec) return { problems: ["That game has nothing to tune."] };
      if (JSON.stringify(values ?? null).length > MAX_BYTES) return { problems: ["That is too much to keep."] };
      const problems = check(spec.shape, values);
      if (problems.length) return { problems };
      const saved: Saved = { version: (await get(game)).version + 1, values: values as Record<string, unknown>, at: now() };
      await sync.write("settings", "tunables", { [game]: saved });
      return { saved };
    },
    /** Back to the game's own numbers. The version still goes up, so anything made on the old ones can tell. */
    async reset(game: string): Promise<Saved | null> {
      if (!TUNABLE_GAMES[game]) return null;
      const saved: Saved = { version: (await get(game)).version + 1, values: {}, at: now() };
      await sync.write("settings", "tunables", { [game]: saved });
      return saved;
    },
    /** Answers GET /tunables/<game> (what the game reads when it starts); null for anything else. */
    async fetch(request: Request): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith(`${mount}/`)) return null;
      if (request.method !== "GET") return json({ error: "Not found" }, 404);
      const game = pathname.slice(mount.length + 1);
      if (!TUNABLE_GAMES[game]) return json({ error: "Not found" }, 404);
      const { version, values } = await get(game);
      return json({ version, values });
    },
  };
}

export type Tunables = ReturnType<typeof createTunables>;
