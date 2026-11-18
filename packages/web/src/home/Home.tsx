// The open.parlor's start page: the Vue game chooser, mounted inside the React app.
import { ARCADE_GAMES, IDLE_GAMES, isArcadeGame, isBoardGame, isIdleGame, isSportGame, isWordGame, KIT_GAMES } from "@journey-to-code/games";
import { createApp, h, reactive } from "vue";
import { useEffect, useRef, useState } from "react";
import { bugs } from "../bugReport";
import { openGameRequest } from "../GameRequest";
import { arranged, refreshCatalogue } from "../catalogue";
import { categoryOf, GAME_CATEGORIES } from "../categories";
import { EVERY_GAME, type SoloGameId } from "../GamePicker";
import { lobby, whoIsThere, type OpenTable } from "../lobbyApi";
import { loadMyHouses, loadName, type GameId } from "../storage";
import GameChooser from "./GameChooser.vue";

const card = (rank: number, suit: string) => ({ kind: "pip" as const, rank, suit });

/** Each game's fan of cards on its tile: a hand that says what the game is about. */
const fruit = (fruit: string | null, face: number | string) => ({ kind: "fruit" as const, fruit, face });
const FANS: Record<string, object[]> = {
  spades: [card(12, "spades"), card(13, "spades"), card(14, "spades")],
  palace: [card(10, "clubs"), card(2, "hearts"), card(14, "diamonds")],
  hearts: [card(13, "hearts"), card(12, "spades"), card(14, "hearts")],
  ohhell: [card(7, "diamonds"), card(8, "diamonds"), card(9, "diamonds")],
  euchre: [card(11, "diamonds"), card(11, "hearts"), card(14, "hearts")],
  crazy8: [card(8, "spades"), card(8, "hearts"), card(8, "diamonds")],
  gin: [card(7, "clubs"), card(7, "diamonds"), card(7, "hearts")],
  pinochle: [card(12, "spades"), card(11, "diamonds"), card(14, "hearts")],
  canasta: [card(13, "hearts"), card(13, "clubs"), card(13, "spades")],
  gofish: [card(5, "hearts"), card(5, "spades"), card(5, "diamonds")],
  oldmaid: [card(9, "hearts"), card(9, "diamonds"), card(12, "spades")],
  war: [card(2, "clubs"), card(14, "spades"), card(10, "hearts")],
  whist: [card(14, "clubs"), card(13, "clubs"), card(12, "clubs")],
  golf: [card(13, "spades"), card(2, "hearts"), card(14, "diamonds")],
  rummy500: [card(5, "hearts"), card(6, "hearts"), card(7, "hearts")],
  president: [card(2, "spades"), card(2, "hearts"), card(3, "clubs")],
  klondike: [card(13, "spades"), card(12, "hearts"), card(11, "spades")],
  freecell: [card(14, "hearts"), card(14, "clubs"), card(14, "diamonds")],
  handfoot: [card(9, "spades"), card(9, "hearts"), card(9, "clubs")],
  cribbage: [card(5, "hearts"), card(5, "clubs"), card(11, "diamonds")],
  fivedraw: [card(14, "spades"), card(14, "hearts"), card(13, "clubs")],
  holdem: [card(14, "spades"), card(13, "spades"), card(10, "diamonds")],
  bluff: [card(7, "clubs"), card(7, "hearts"), card(2, "diamonds")],
  liarspoker: [card(13, "hearts"), card(13, "diamonds"), card(4, "spades")],
  switch: [card(2, "hearts"), card(8, "clubs"), card(14, "spades")],
  thirtyone: [card(14, "diamonds"), card(13, "diamonds"), card(10, "diamonds")],
  kingscorner: [card(13, "spades"), card(12, "hearts"), card(11, "clubs")],
  blackjack: [card(14, "spades"), card(13, "hearts")],
  spite: [card(14, "clubs"), card(2, "hearts"), card(13, "spades")],
  pitch: [card(14, "hearts"), card(11, "hearts"), card(2, "hearts")],
  fivehundred: [card(11, "hearts"), card(11, "diamonds"), card(14, "hearts")],
  durak: [card(6, "spades"), card(9, "spades"), card(7, "hearts")],
  bridge: [card(14, "spades"), card(13, "spades"), card(12, "spades")],
  fruitsalad: [fruit("cherry", 7), fruit("lemon", "plus2"), fruit(null, "salad")],
  slapjack: [card(4, "clubs"), card(9, "hearts"), card(11, "spades")],
  speed: [card(6, "hearts"), card(7, "clubs"), card(8, "diamonds")],
  memory: [card(7, "hearts"), card(7, "diamonds"), card(12, "spades")],
  sevens: [card(6, "hearts"), card(7, "hearts"), card(8, "hearts")],
  cuckoo: [card(13, "clubs"), card(14, "hearts")],
  contractrummy: [card(9, "spades"), card(9, "hearts"), card(9, "clubs")],
  spider: [card(13, "spades"), card(12, "spades"), card(11, "spades")],
  pyramid: [card(6, "hearts"), card(7, "clubs"), card(13, "diamonds")],
  ridethebus: [card(5, "hearts"), card(9, "spades"), card(12, "clubs")],
  kingscup: [card(13, "hearts"), card(13, "spades"), card(13, "diamonds")],
  horserace: [card(14, "hearts"), card(14, "spades"), card(14, "clubs")],
  drinkingpyramid: [card(9, "hearts"), card(9, "clubs"), card(4, "spades")],
};

/** A board game's tile shows a little board instead: a position that says what the game is about. */
type MiniBoard = { cols: number; cells: ({ glyph: string; tone: string; shade?: "dark" | "point-down" | "point-up" } | null)[]; shade?: "green" | "wood" | "points" | "words" | "pits"; sketch?: boolean };
const X = { glyph: "✕", tone: "red" };
const O = { glyph: "◯", tone: "blue" };
const DARK = { glyph: "●", tone: "dark" };
const LIGHT = { glyph: "●", tone: "light" };
const SHIP = { glyph: "■", tone: "dark" };
const HIT = { glyph: "✕", tone: "red" };
const MISS = { glyph: "•", tone: "blue" };
const RED = { glyph: "●", tone: "red" };
const YEL = { glyph: "●", tone: "gold" };
// Checkers: a corner of the board, played on the dark squares.
const SQUARE = { glyph: "", tone: "none", shade: "dark" as const };
const MAN_DARK = { ...SQUARE, glyph: "●", tone: "dark" };
const MAN_LIGHT = { ...SQUARE, glyph: "●", tone: "light" };
const KING_DARK = { ...SQUARE, glyph: "♛", tone: "dark" };
// Chess: the corner of a board with a king castled behind its pawns.
const LIGHT_SQUARE = { glyph: "", tone: "none" };
const on = (glyph: string, tone: string, dark: boolean) => (dark ? { ...SQUARE, glyph, tone } : { glyph, tone });
// Backgammon: a few points from each side of the board, with checkers standing on them.
const DOWN = { glyph: "", tone: "none", shade: "point-down" as const };
const UP = { glyph: "", tone: "none", shade: "point-up" as const };
const CHECKER_LIGHT = { glyph: "●", tone: "light" };
const CHECKER_DARK = { glyph: "●", tone: "dark" };
/** A word game's tile: letter tiles, coloured the way its table colours them. */
const tiles = (word: string, tones: string) => [...word].map((glyph, i) => (glyph === "_" ? { glyph: "", tone: "blank" } : { glyph: glyph.toUpperCase(), tone: { h: "hit", n: "near", m: "miss", p: "plain" }[tones[i] ?? "p"]! }));
const BOARDS: Record<string, MiniBoard> = {
  // Two guesses at the hidden word, the second nearly there.
  secretword: { cols: 5, shade: "words", cells: [...tiles("slate", "mnhmh"), ...tiles("crane", "hhhmh")] },
  // A rack of letters over the word they make.
  anagrams: { cols: 5, shade: "words", cells: [...tiles("tsnae", "ppppp"), ...tiles("_ant_", "phhhp")] },
  // The word as far as it is uncovered, and the letters that weren't in it.
  // A square of letters with a word traced in it.
  wordhunt: { cols: 4, shade: "words", cells: [...tiles("cats", "pphp"), ...tiles("orex", "hpmp"), ...tiles("ldnp", "pphp"), ...tiles("eigh", "pppp")] },
  // Two words crossing.
  crisscross: { cols: 5, shade: "words", cells: [...tiles("__w__", "ppp"), ...tiles("crane", "pppnp"), ...tiles("__d__", "ppp"), ...tiles("__e__", "ppp")] },
  // The word, hidden, and one guessed.
  // Draw & Guess is a drawing game: a sheet of paper with a house on it, not letter tiles.
  drawguess: { cols: 1, cells: [], sketch: true },
  hangman: { cols: 5, shade: "words", cells: [...tiles("_a__a", "phpph"), ...tiles("zqk__", "mmm")] },
  tictactoe: { cols: 3, cells: [X, O, null, null, X, O, O, null, X] },
  // Two rows of pits and the seeds in them: one empty, its neighbour full.
  mancala: { cols: 3, shade: "pits", cells: [on("4", "light", false), on("1", "light", false), on("6", "light", false), null, on("5", "gold", false), on("4", "gold", false)] },
  // The bottom of a rack: red about to make four on the slant.
  dropfour: { cols: 4, cells: [null, null, null, null, null, null, RED, YEL, null, RED, YEL, RED, RED, YEL, YEL, RED] },
  combat: { cols: 4, cells: [SHIP, SHIP, SHIP, null, null, null, MISS, null, MISS, null, HIT, null, null, null, HIT, null] },
  // Light to move: c1 traps the dark disc beside it.
  reversi: { cols: 4, shade: "green", cells: [null, null, null, null, null, DARK, LIGHT, null, DARK, DARK, DARK, null, null, null, LIGHT, null] },
  checkers: { cols: 4, cells: [null, MAN_LIGHT, null, MAN_LIGHT, SQUARE, null, KING_DARK, null, null, MAN_LIGHT, null, SQUARE, MAN_DARK, null, MAN_DARK, null] },
  chess: { cols: 4, cells: [LIGHT_SQUARE, on("♞\uFE0E", "dark", true), LIGHT_SQUARE, SQUARE, SQUARE, LIGHT_SQUARE, on("♝\uFE0E", "dark", true), LIGHT_SQUARE, on("♟\uFE0E", "light", false), on("♟\uFE0E", "light", true), on("♟\uFE0E", "light", false), SQUARE, SQUARE, on("♜\uFE0E", "light", false), on("♚\uFE0E", "light", true), LIGHT_SQUARE] },
  backgammon: { cols: 4, shade: "points", cells: [{ ...DOWN, ...CHECKER_DARK }, DOWN, { ...DOWN, ...CHECKER_LIGHT }, DOWN, CHECKER_DARK, null, CHECKER_LIGHT, null, null, CHECKER_LIGHT, null, CHECKER_DARK, UP, { ...UP, ...CHECKER_LIGHT }, UP, { ...UP, ...CHECKER_DARK }] },
};
// Go: a corner of the board with a ko on it. Black has just taken a stone, and White may not take straight back.
BOARDS.go = { cols: 5, shade: "wood", cells: [null, null, null, null, null, null, DARK, LIGHT, null, null, DARK, null, DARK, LIGHT, null, null, DARK, LIGHT, null, null, null, null, null, null, null] };
const EMPTY_BOARD: MiniBoard = { cols: 3, cells: Array(9).fill(null) };

/** A table sport's tile shows a little table from above: its surface, a hole, a ball or two (in a 100 × 100 box). */
type MiniTable = { surface: "green" | "felt" | "lane" | "wood"; cup?: [x: number, y: number]; balls: { x: number; y: number; tone: string }[] };
/** A bowling lane: six pins in a triangle at the far end, and a ball on its way. */
const PINS = [[50, 14], [43, 22], [57, 22], [36, 30], [50, 30], [64, 30]].map(([x, y]) => ({ x: x!, y: y!, tone: "white" }));
const TABLES: Record<string, MiniTable> = {
  // Two balls out on the green: they knock into each other.
  bowling: { surface: "lane", balls: [...PINS, { x: 50, y: 80, tone: "red" }] },
  minigolf: { surface: "green", cup: [66, 32], balls: [{ x: 36, y: 72, tone: "white" }, { x: 70, y: 62, tone: "red" }] },
  // A cue ball lined up on a little rack.
  // A long board seen from the near end: pucks lying in the far zones, and one on its way.
  shuffleboard: { surface: "lane", balls: [{ x: 40, y: 20, tone: "red" }, { x: 60, y: 28, tone: "blue" }, { x: 46, y: 40, tone: "blue" }, { x: 54, y: 74, tone: "red" }] },
  // The hole in the middle of the board, and discs of both colours round it.
  crokinole: { surface: "wood", cup: [50, 48], balls: [{ x: 38, y: 36, tone: "black" }, { x: 64, y: 44, tone: "gold" }, { x: 46, y: 66, tone: "gold" }, { x: 60, y: 74, tone: "black" }] },
  // The football on its way up the table.
  flickfootball: { surface: "wood", balls: [{ x: 50, y: 26, tone: "orange" }] },
  // The queen in the middle of a ring of pieces, and the striker on its line.
  carrom: { surface: "wood", balls: [{ x: 50, y: 46, tone: "red" }, ...[0, 1, 2, 3, 4, 5].map((i) => ({ x: Math.round(50 + 13 * Math.cos((i * Math.PI) / 3)), y: Math.round(46 + 13 * Math.sin((i * Math.PI) / 3)), tone: i % 2 ? "black" : "cream" })), { x: 38, y: 80, tone: "gold" }] },
  billiards: { surface: "felt", balls: [{ x: 28, y: 74, tone: "white" }, { x: 62, y: 30, tone: "red" }, { x: 72, y: 36, tone: "red" }, { x: 52, y: 38, tone: "red" }] },
};
const EMPTY_TABLE: MiniTable = { surface: "green", balls: [] };

/** A dice game's tile shows a few dice instead of a board: the faces they landed on. */
const DICE: Record<string, number[]> = {
  // Three fives up and two to come: most of the way to a Yacht.
  yacht: [5, 5, 5],
  // A six, and the one that takes it all away.
  pig: [6, 1],
  // A one and a five to set aside, and a die still to throw.
  tenthousand: [1, 5, 3],
  // The ship, the captain and the crew.
  shipcaptaincrew: [6, 5, 4],
  // A five and a four: the 9, or which tiles?
  shutthebox: [5, 4],
  // Three sixes, if you believe it.
  liarsdice: [6, 6, 6],
  // The two halves of a tile: the six and four. (Pips are pips; a tile is two dice faces end to end.)
  dominoes: [6, 4],
};

/** An arcade game's tile shows a little screen: a ship at the bottom, what it is up against, and what is coming at it. */
type MiniScreen = { ship: [x: number, y: number]; foes: [x: number, y: number][]; bullets: [x: number, y: number][]; /** A game that builds: a road (an SVG path), and where towers stand beside it. */ road?: string; towers?: [x: number, y: number][]; /** A clicker: one big chip, and a few it has earned. */ chip?: boolean; /** A store: a shopfront with its sign. */ shop?: boolean; /** A drag strip: two lanes, the tree, and two cars leaving. */ strip?: boolean; /** An air hockey table from above: a mallet at each end and the puck between. */ rink?: boolean; /** An adventure: its hero, in his own pixels, on the grass. */ quest?: boolean };
const SCREENS: Record<string, MiniScreen> = {
  // A row of drones, a fan of bullets on its way down, and a gap to fly through.
  skyfire: { ship: [50, 82], foes: [[22, 18], [50, 12], [78, 18]], bullets: [[30, 44], [44, 52], [62, 40], [72, 58], [18, 64]] },
};
// A road winding down the field, three towers beside it, and a few on their way along it.
SCREENS.bulwark = { ship: [0, 0], foes: [], road: "M34 3 V26 H74 V54 H24 V78 H62 V97", towers: [[54, 40], [44, 66], [78, 68]], bullets: [[34, 14], [50, 26], [74, 40]] };
SCREENS.chipstack = { ship: [0, 0], foes: [], bullets: [[20, 80], [34, 86], [70, 84], [82, 76]], chip: true };
SCREENS.delbies = { ship: [0, 0], foes: [], bullets: [], shop: true };
SCREENS.pinkslips = { ship: [0, 0], foes: [], bullets: [], strip: true };
SCREENS.airhockey = { ship: [0, 0], foes: [], bullets: [], rink: true };
SCREENS.zubraquest = { ship: [0, 0], foes: [], bullets: [], quest: true };
// The counter is in Delbie's shop, so it has the shop's picture.
SCREENS.counter = { ship: [0, 0], foes: [], bullets: [], shop: true };
const EMPTY_SCREEN: MiniScreen = { ship: [50, 82], foes: [], bullets: [] };

const SEATS: Record<string, { seats: [number, number]; teams: boolean }> = {
  spades: { seats: [4, 4], teams: true },
  palace: { seats: [2, 6], teams: false },
  ...Object.fromEntries([...KIT_GAMES, ...ARCADE_GAMES, ...IDLE_GAMES].map((g) => [g.id, { seats: [g.seats.min, g.seats.max] as [number, number], teams: g.teams }])),
};

/** An open table as the front page shows it: one line. */
const brief = (t: OpenTable) => ({ id: t.id, game: t.game, who: whoIsThere(t), free: t.free });

export function Home({ last, onPick, onOpenHouse, onLobby, onWifi, onMove }: { last: GameId | null; onPick: (game: GameId | SoloGameId) => void; onOpenHouse: (slug: string) => void; onLobby: () => void; /** Join a table someone is hosting on this wifi. */ onWifi: () => void; /** Be the same player on another device. */ onMove: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [catalogue, setCatalogue] = useState(0);
  const handlers = useRef({ onPick, onOpenHouse, onLobby, onWifi, onMove });
  handlers.current = { onPick, onOpenHouse, onLobby, onWifi, onMove };

  useEffect(() => {
    // The games the parlor's host offers, in their order (every game, where there's no server).
    const games = () => arranged(EVERY_GAME).map((g) => ({ ...g, category: categoryOf(g.id), screen: isArcadeGame(g.id) || isIdleGame(g.id) ? (SCREENS[g.id] ?? EMPTY_SCREEN) : undefined, ...(SEATS[g.id] ?? { seats: [2, 6], teams: false }), fan: FANS[g.id] ?? FANS.spades!, dice: DICE[g.id], board: (isBoardGame(g.id) && !DICE[g.id]) || isWordGame(g.id) ? (BOARDS[g.id] ?? EMPTY_BOARD) : undefined, table: isSportGame(g.id) ? (TABLES[g.id] ?? EMPTY_TABLE) : undefined }));
    const props = reactive({
      games: games(),
      categories: GAME_CATEGORIES,
      houses: loadMyHouses(),
      last,
      name: loadName(),
      onPick: (id: string) => handlers.current.onPick(id as GameId | SoloGameId),
      onHouse: (slug: string) => handlers.current.onOpenHouse(slug),
      // Tables waiting for players, kept fresh while the page is in front.
      open: [] as ReturnType<typeof brief>[],
      onLobby: () => handlers.current.onLobby(),
      onWifi: () => handlers.current.onWifi(),
      onMove: () => handlers.current.onMove(),
      // "Ask for a game" in the footer, where the parlor takes requests.
      canAsk: false,
      onAsk: openGameRequest,
      // "Every game on one page": the page the parlor's server draws itself (the server's pages.ts).
      // A parlor published as plain files has no server to draw it.
      canList: false,
    });
    void bugs.enabled().then((yes) => (props.canAsk = yes));
    void fetch("games", { method: "HEAD" })
      .then((reply) => (props.canList = reply.ok && (reply.headers.get("x-parlor-page") ?? "") === "games"))
      .catch(() => {});
    // Rendered from the reactive props, so the chooser follows them when the open tables change.
    const app = createApp({ render: () => h(GameChooser, { ...props }) });
    app.mount(el.current!);
    const load = () => {
      if (document.visibilityState === "hidden") return;
      lobby.list().then((tables) => (props.open = tables.map(brief)), () => undefined);
    };
    load();
    const timer = setInterval(load, 8000);
    document.addEventListener("visibilitychange", load);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      app.unmount();
    };
  }, [catalogue]);

  // Ask the server for the host's catalogue; if it differs from what this browser remembered, draw the chooser again.
  useEffect(() => {
    void refreshCatalogue().then((changed) => changed && setCatalogue((n) => n + 1));
  }, []);

  return <main className="home" ref={el} />;
}
