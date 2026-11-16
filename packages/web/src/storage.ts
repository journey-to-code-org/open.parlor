import { familyTable, renamedPreset, builtInPresets, cleanSettings, DEFAULT_SETTINGS, type RulePreset, type TableSettings } from "@journey-to-code/rules";
import { familyPalace, normalizePalaceRules, type PalaceRules } from "@journey-to-code/palace";
import { arcadeGame, isKitGame, kitGame, type ArcadeGameId, type IdleGameId, type KitGameId } from "@journey-to-code/games";

const NAME_KEY = "spades:name";
const PRESETS_KEY = "spades:presets";
const LAST_PRESET_KEY = "spades:lastPreset";

// Browser storage can be missing or throw (private mode, embeds); treat it as a nice-to-have.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** The name this player has used before; empty for someone new (tables call them "You"). */
export const loadName = () => read(NAME_KEY, "");
/** The name this browser has used before, or "" for someone arriving by an invite link. */
export const loadSavedName = () => read(NAME_KEY, "");
/** Remember a name the player typed; a blank one isn't saved (so "You" never becomes their name). */
export const saveName = (name: string) => {
  if (name.trim()) write(NAME_KEY, name.trim());
};

export const loadSavedPresets = () => read<RulePreset[]>(PRESETS_KEY, []).map(renamedPreset);
export function savePreset(preset: RulePreset) {
  const others = loadSavedPresets().filter((p) => p.id !== preset.id);
  write(PRESETS_KEY, [...others, preset]);
}
export function deleteSavedPreset(id: string) {
  write(PRESETS_KEY, loadSavedPresets().filter((p) => p.id !== id));
}

export const loadLastPreset = () => renamedPreset(read<RulePreset>(LAST_PRESET_KEY, familyTable));
export const saveLastPreset = (preset: RulePreset) => write(LAST_PRESET_KEY, preset);

export const starterPresets: RulePreset[] = [familyTable, ...builtInPresets];

const HOUSES_KEY = "spades:houses";
/** The houses this browser belongs to, for the setup screen. The server is the source of truth. */
export const loadMyHouses = () => read<{ slug: string; name: string }[]>(HOUSES_KEY, []);
export function rememberHouse(house: { slug: string; name: string }) {
  write(HOUSES_KEY, [house, ...loadMyHouses().filter((h) => h.slug !== house.slug)].slice(0, 10));
}
export function forgetHouse(slug: string) {
  write(HOUSES_KEY, loadMyHouses().filter((h) => h.slug !== slug));
}

// ---- More than one game ----------------------------------------------------------------------

export type GameId = "spades" | "palace" | KitGameId;
const GAME_KEY = "cardroom:game";
export const loadGame = (): GameId => {
  const g = read<string>(GAME_KEY, "spades");
  return g === "palace" || isKitGame(g) ? g : "spades";
};
export const saveGame = (game: GameId) => write(GAME_KEY, game);
/** The game played last on this device, or null for someone new. */
export const loadLastGame = (): GameId | null => {
  const g = read<string | null>(GAME_KEY, null);
  return g === "spades" || g === "palace" || isKitGame(g) ? (g as GameId) : null;
};

const PALACE_LAST_KEY = "cardroom:palace:last";
const PALACE_SAVED_KEY = "cardroom:palace:presets";
const PALACE_SEATS_KEY = "cardroom:palace:seats";
export const loadPalaceRules = () => normalizePalaceRules(read<PalaceRules>(PALACE_LAST_KEY, familyPalace));
export const savePalaceRules = (rules: PalaceRules) => write(PALACE_LAST_KEY, rules);
export const loadPalaceSeats = () => read<number>(PALACE_SEATS_KEY, 4);
export const savePalaceSeats = (n: number) => write(PALACE_SEATS_KEY, n);
export const loadSavedPalace = () => read<PalaceRules[]>(PALACE_SAVED_KEY, []).map(normalizePalaceRules);
export function savePalacePreset(rules: PalaceRules) {
  write(PALACE_SAVED_KEY, [...loadSavedPalace().filter((p) => p.id !== rules.id), rules]);
}
export function deletePalacePreset(id: string) {
  write(PALACE_SAVED_KEY, loadSavedPalace().filter((p) => p.id !== id));
}

// ---- Table settings: how well and how fast the computer players play --------------------------
const SETTINGS_KEY = "cardroom:tableSettings";
export const loadTableSettings = () => cleanSettings(read<unknown>(SETTINGS_KEY, DEFAULT_SETTINGS));
export const saveTableSettings = (settings: TableSettings) => write(SETTINGS_KEY, settings);

// ---- The kit games: the last rules, saved rules and table size, per game ------------------------

type KitRules = { id: string; name: string } & Record<string, unknown>;
export const loadKitRules = (game: KitGameId): KitRules => kitGame(game)!.normalize(read<unknown>(`cardroom:${game}:last`, kitGame(game)!.presets[0]));
export const saveKitRules = (game: KitGameId, rules: KitRules) => write(`cardroom:${game}:last`, rules);
export const loadSavedKit = (game: KitGameId): KitRules[] => read<unknown[]>(`cardroom:${game}:presets`, []).map((r) => kitGame(game)!.normalize(r));
export function saveKitPreset(game: KitGameId, rules: KitRules) {
  write(`cardroom:${game}:presets`, [...loadSavedKit(game).filter((p) => p.id !== rules.id), rules]);
}
export function deleteKitPreset(game: KitGameId, id: string) {
  write(`cardroom:${game}:presets`, loadSavedKit(game).filter((p) => p.id !== id));
}
export const loadKitSeats = (game: KitGameId): number => {
  const g = kitGame(game)!;
  const n = read<number>(`cardroom:${game}:seats`, g.seats.default);
  return n >= g.seats.min && n <= g.seats.max ? n : g.seats.default;
};
export const saveKitSeats = (game: KitGameId, n: number) => write(`cardroom:${game}:seats`, n);

// ---- Find players: any table for the game, or only one with exactly your rules -----------------
const SAME_RULES_KEY = "cardroom:lobby:sameRules";
export const loadSameRules = () => read<boolean>(SAME_RULES_KEY, false) === true;
export const saveSameRules = (only: boolean) => write(SAME_RULES_KEY, only);

// ---- Where this player has dragged things on the table (the chat button, the chat itself) --------
/** A spot on the screen, as shares (0 to 1) of the room there is to move in, so it survives a resize or a turn of the phone. */
export interface Place {
  x: number;
  y: number;
}
export const loadPlace = (what: string): Place | null => {
  const p = read<Partial<Place> | null>(`cardroom:place:${what}`, null);
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.min(Math.max(p.x!, 0), 1), y: Math.min(Math.max(p.y!, 0), 1) } : null;
};
export function savePlace(what: string, place: Place | null) {
  if (place) write(`cardroom:place:${what}`, place);
  else
    try {
      localStorage.removeItem(`cardroom:place:${what}`);
    } catch {
      /* ignore */
    }
}

// ---- Arcade games ----------------------------------------------------------------------------
// Played in this browser against the game itself, so what's kept is small: the rules last flown,
// how many computer wingmen, whether the guns fire by themselves, and the best score for each
// set of rules and crew.

export type ArcadeRules = { id: string; name: string } & Record<string, unknown>;
export const loadArcadeRules = (game: ArcadeGameId): ArcadeRules => arcadeGame(game)!.normalize(read<unknown>(`cardroom:${game}:last`, arcadeGame(game)!.presets[0]));
export const saveArcadeRules = (game: ArcadeGameId, rules: ArcadeRules) => write(`cardroom:${game}:last`, rules);
export const loadArcadeCrew = (game: ArcadeGameId): number => {
  const { min, max } = arcadeGame(game)!.seats;
  const n = read<number>(`cardroom:${game}:crew`, min);
  return Number.isInteger(n) && n >= min && n <= max ? n : min;
};
export const saveArcadeCrew = (game: ArcadeGameId, crew: number) => write(`cardroom:${game}:crew`, crew);
export const loadAutofire = () => read<boolean>("cardroom:arcade:autofire", true) !== false;
export const saveAutofire = (on: boolean) => write("cardroom:arcade:autofire", on);
/** The rules a score was made under, as far as they change the game: two presets with the same numbers share a best. */
const bestKey = (game: ArcadeGameId, rules: ArcadeRules, crew: number) => {
  const { id: _id, name: _name, ...numbers } = rules;
  return `cardroom:${game}:best:${crew}:${JSON.stringify(Object.entries(numbers).sort(([a], [b]) => a.localeCompare(b)))}`;
};
export const loadArcadeBest = (game: ArcadeGameId, rules: ArcadeRules, crew: number): number => {
  const n = read<number>(bestKey(game, rules, crew), 0);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
};
/** Keep a score if it beats the best. Resolves to whether it did. */
export function saveArcadeBest(game: ArcadeGameId, rules: ArcadeRules, crew: number, score: number): boolean {
  if (score <= loadArcadeBest(game, rules, crew)) return false;
  write(bestKey(game, rules, crew), score);
  return true;
}

// ---- Idle games ----------------------------------------------------------------------------------
// The whole game is kept here, in this browser: it is brought up to date from the clock when the
// page is opened again. The game's own `load` checks what comes back.
export const loadIdle = (game: IdleGameId): unknown => read<unknown>(`cardroom:${game}:save`, null);
export const saveIdle = (game: IdleGameId, state: unknown) => write(`cardroom:${game}:save`, state);
/** The house an idle game's store is kept in (and the save of it this browser last agreed with the house on), or null while it is only here. */
export const loadIdleHouse = (game: IdleGameId): { slug: string; name: string; rev: number } | null => {
  const kept = read<{ slug?: unknown; name?: unknown; rev?: unknown } | null>(`cardroom:${game}:house`, null);
  return kept && typeof kept.slug === "string" && typeof kept.name === "string" ? { slug: kept.slug, name: kept.name, rev: typeof kept.rev === "number" ? kept.rev : 0 } : null;
};
export const saveIdleHouse = (game: IdleGameId, house: { slug: string; name: string; rev: number } | null) => write(`cardroom:${game}:house`, house);

/** The house this browser's arcade runs are sent to, or null when they stay here. */
export const loadArcadeHouse = (): { slug: string; name: string } | null => {
  const slug = read<string | null>("cardroom:arcade:house", null);
  return loadMyHouses().find((h) => h.slug === slug) ?? null;
};
export const saveArcadeHouse = (slug: string | null) => write("cardroom:arcade:house", slug);

// ---- Pink Slips ----------------------------------------------------------------------------------

/** The garage, as the game saved it: it checks it over itself when it is opened. */
export const loadDrive = (): unknown => read<unknown>("cardroom:pinkslips:garage", null);
export const saveDrive = (garage: unknown) => write("cardroom:pinkslips:garage", garage);
/** The strip the player last raced on. */
export const loadDriveStrip = (): string => read<string>("cardroom:pinkslips:strip", "strip");
export const saveDriveStrip = (id: string) => write("cardroom:pinkslips:strip", id);
/** Where the player watches a race from: behind the car, or the driver's seat. */
export const loadDriveSeat = (): "chase" | "cockpit" => (read<string>("cardroom:pinkslips:seat", "chase") === "cockpit" ? "cockpit" : "chase");
export const saveDriveSeat = (seat: "chase" | "cockpit") => write("cardroom:pinkslips:seat", seat);
