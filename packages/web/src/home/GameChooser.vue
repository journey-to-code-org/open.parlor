<!--
  The open.parlor's front door: every game as a tile, sorted onto shelves by category (or in the
  host's order, or by name), a search box and a "who's playing?" filter, your houses, and the tables
  that are waiting for players right now.
  A Vue island inside the React app. The cards and the select are Zubra components: in a .vue file a
  .zb import is a Vue component (Zubra's Vue adapter), with props, events and v-model.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import PlayingCard from "@open-parlor/ui/playing-card.zb";
import SelectField from "@open-parlor/ui/zubra-ui/select-field.zb";
import TextField from "@open-parlor/ui/zubra-ui/text-field.zb";
import { matchesSearch, searchWords } from "./search";

export interface ChooserGame {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  /** The shelf it sits on: "cards", "board", "dice", "sports", "arcade". */
  category: string;
  /** For a card game, the kind of card game it is (a sub-shelf of the cards shelf), if it is on one. */
  group?: string;
  seats: [number, number];
  teams: boolean;
  /** Three cards to fan out on the tile. */
  fan: Record<string, unknown>[];
  /** A board game shows a little board instead of cards. */
  board?: { cols: number; cells: ({ glyph: string; tone: string; shade?: string } | null)[]; shade?: string; /** A sheet of paper with a drawing on it, in place of a board (Draw & Guess). */ sketch?: boolean };
  /** An arcade game shows a little screen: a ship, what it is up against, and what is coming at it (in a 100 × 100 box). */
  screen?: { ship: [number, number]; foes: [number, number][]; bullets: [number, number][]; road?: string; towers?: [number, number][]; chip?: boolean; shop?: boolean; strip?: boolean; rink?: boolean; quest?: boolean };
  /** A dice game shows a few dice: the face each one shows. */
  dice?: number[];
  /** A table sport shows a little table from above: its surface, a hole, a ball or two (in a 100 × 100 box). */
  table?: { surface: string; cup?: [number, number]; balls: { x: number; y: number; tone: string }[] };
}

const props = defineProps<{
  /** In the host's order. */
  games: ChooserGame[];
  /** Every category, in the order the shelves are listed. */
  categories: { id: string; name: string; emoji: string }[];
  /** The kinds of card game, in the order the cards shelf lists them. */
  cardGroups?: { id: string; name: string; emoji: string }[];
  houses: { slug: string; name: string }[];
  /** The game played last on this device, if any. */
  last: string | null;
  name: string;
  /** Tables waiting for players, longest wait first. */
  open: { id: string; game: string; who: string; free: number }[];
  /** Whether this parlor takes requests for games it doesn't have. */
  canAsk?: boolean;
  /** Whether this parlor has the page its server draws itself, with every game on it (`games`). */
  canList?: boolean;
  canDaily?: boolean;
}>();
const emit = defineEmits<{ pick: [id: string]; house: [slug: string]; lobby: []; wifi: []; move: []; ask: [] }>();
// The page about how the parlor is made: one set of Zubra components, checked in every framework
// it uses. It is published with the GitHub Pages build, since its results come from a run there.
const BUILT = "https://journey-to-code-org.github.io/open.parlor/conformance/";
const gameOf = (id: string) => props.games.find((g) => g.id === id);
const waitingAt = computed(() => props.open.slice(0, 4));

// Who's playing: any number, or exactly this many people at the table.
const players = ref("any");
const sizes = [
  { value: "any", label: "Any number" },
  { value: "2", label: "Just two of us" },
  { value: "3", label: "Three" },
  { value: "4", label: "Four" },
  { value: "5", label: "Five or more" },
];
const fits = (g: ChooserGame) => {
  if (players.value === "any") return true;
  const n = Number(players.value);
  return n >= 5 ? g.seats[1] >= 5 : g.seats[0] <= n && n <= g.seats[1];
};

// Search: what's typed is looked for in each game's name, blurb and category.
const query = ref("");
const words = computed(() => searchWords(query.value));
const categoryName = (id: string) => props.categories.find((c) => c.id === id)?.name ?? id;
const shown = computed(() => props.games.filter((g) => fits(g) && matchesSearch(g, categoryName(g.category), words.value)));
/** Why nothing is showing, when nothing is. */
const noneLine = computed(() => (words.value.length ? `No games match “${query.value.trim()}”${players.value === "any" ? "" : " for that many players"}.` : "No games for that many players yet."));

// How the tiles are sorted: onto shelves by category, in the host's own order, or by name. Kept in this browser.
type Sort = "category" | "host" | "name";
const SORT_KEY = "cardroom.sort";
const sorts = [
  { value: "category", label: "By category" },
  { value: "host", label: "The parlor's picks first" },
  { value: "name", label: "A to Z" },
];
const savedSort = (): Sort => {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return saved === "host" || saved === "name" ? saved : "category";
  } catch {
    return "category";
  }
};
const sort = ref<string>(savedSort());
watch(sort, (value) => {
  try {
    localStorage.setItem(SORT_KEY, value);
  } catch {
    /* private mode: it still applies for now */
  }
});
interface Section {
  id: string;
  name: string;
  emoji: string;
  games: ChooserGame[];
}
interface Shelf extends Section {
  /** What the shelf is made of: one nameless section, or (the card games) one per kind of game. */
  sections: Section[];
}
/** The cards shelf in sections by kind of game; a card game on none of them is under "More card games". */
const sectionsOfCards = (games: ChooserGame[]): Section[] => {
  const kinds = props.cardGroups ?? [];
  const known = new Set(kinds.map((k) => k.id));
  const sections = [...kinds.map((k) => ({ ...k, games: games.filter((g) => g.group === k.id) })), { id: "more", name: "More card games", emoji: "🃏", games: games.filter((g) => !g.group || !known.has(g.group)) }];
  return sections.filter((s) => s.games.length);
};
/** The tiles in groups: one shelf per category that has a game (each in the host's order), or everything in one. */
const shelves = computed<Shelf[]>(() => {
  if (sort.value === "category") {
    const known = new Set(props.categories.map((c) => c.id));
    const stray = shown.value.filter((g) => !known.has(g.category));
    const all = [...props.categories.map((c) => ({ ...c, games: shown.value.filter((g) => g.category === c.id) })), { id: "other", name: "Other games", emoji: "🎮", games: stray }];
    return all.filter((s) => s.games.length).map((s) => ({ ...s, sections: s.id === "cards" && props.cardGroups?.length ? sectionsOfCards(s.games) : [{ id: "", name: "", emoji: "", games: s.games }] }));
  }
  const games = sort.value === "name" ? [...shown.value].sort((a, b) => a.name.localeCompare(b.name)) : shown.value;
  return games.length ? [{ id: "all", name: "", emoji: "", games, sections: [{ id: "", name: "", emoji: "", games }] }] : [];
});

// Shelves (and the card games' sections) fold away: a heading is a button, and what is folded is kept in this browser.
// A search shows every match, folded or not, so nothing it finds is hidden.
const FOLD_KEY = "parlor.folded";
const savedFolds = (): Set<string> => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
};
const folded = ref<Set<string>>(savedFolds());
watch(folded, (ids) => {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode: they stay folded for now */
  }
});
const sectionKey = (shelf: Shelf, section: Section) => `${shelf.id}:${section.id}`;
const isOpen = (key: string) => words.value.length > 0 || !folded.value.has(key);
function setFolded(key: string, fold: boolean) {
  const next = new Set(folded.value);
  if (fold) next.add(key);
  else next.delete(key);
  folded.value = next;
}
/** Every heading that can fold: each shelf, and each section of the card games. */
const foldable = computed(() => shelves.value.filter((s) => s.name).flatMap((s) => [s.id, ...s.sections.filter((x) => x.name).map((x) => sectionKey(s, x))]));
const anyOpen = computed(() => foldable.value.some((key) => !folded.value.has(key)));
const toggleAll = () => (folded.value = anyOpen.value ? new Set(foldable.value) : new Set());
/** "Surprise me": any game that fits who's playing, other than the one played last when there's a choice. */
function surprise() {
  const fresh = shown.value.filter((g) => g.id !== props.last);
  const from = fresh.length ? fresh : shown.value;
  const game = from[Math.floor(Math.random() * from.length)];
  if (game) pick(game.id);
}
/** Where each face's pips sit in a die's three-by-three (0 is the top left). */
const PIPS: Record<number, number[]> = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const seatsLabel = (g: ChooserGame) => (g.screen ? (g.seats[1] === 1 ? "1 player" : `1–${g.seats[1]} players`) : g.teams ? "4 players · partners" : g.seats[0] === g.seats[1] ? `${g.seats[0]} players` : `${g.seats[0]}–${g.seats[1]} players`);
const hello = computed(() => (props.name ? `Welcome back, ${props.name}.` : `${props.games.length} games to play with family and friends: cards, board games, words, table sports and arcade.`));
/** Someone who has never played here: no name, no last game. They get the line about what it costs and a few games to start with. */
const STARTED_KEY = "parlor.started";
const startedBefore = (() => {
  try {
    return localStorage.getItem(STARTED_KEY) === "1";
  } catch {
    return false;
  }
})();
const firstVisit = computed(() => !props.name && !props.last && !startedBefore);
/** Open a game, and remember that this device has been in one: the next visit isn't a first one. */
function pick(id: string) {
  try {
    localStorage.setItem(STARTED_KEY, "1");
  } catch {
    /* private mode: they'll see "Start here" again, which is harmless */
  }
  emit("pick", id);
}
/** A few to start with, one from each kind of game, in the order a newcomer might like them. */
const STARTERS = ["spades", "chess", "secretword", "minigolf", "billiards", "hearts", "drawguess", "yacht"];
const starters = computed(() => STARTERS.map(gameOf).filter((g): g is ChooserGame => !!g).slice(0, 6));
/** Jump to a shelf, opening it first if it was folded. */
async function toShelf(id: string) {
  if (folded.value.has(id)) {
    setFolded(id, false);
    await nextTick();
  }
  document.getElementById(`shelf-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <div class="chooser">
    <header class="hero">
      <div class="suits" aria-hidden="true">♠&#xFE0E; ♥&#xFE0E; ♣&#xFE0E; ♦&#xFE0E;</div>
      <h1>open.parlor</h1>
      <p>{{ hello }}</p>
      <p v-if="firstVisit" class="free">Free, no sign-up, and it works offline.</p>
    </header>

    <section v-if="firstVisit && starters.length" class="starters" aria-label="Start here">
      <h2>Start here</h2>
      <ul>
        <li v-for="g in starters" :key="g.id">
          <button type="button" class="starter" @click="pick(g.id)">
            <span class="starter-emoji" aria-hidden="true">{{ g.emoji }}</span>
            <span class="starter-text"><strong>{{ g.name }}</strong><span>{{ g.blurb }}</span></span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="houses.length" class="houses" aria-label="Your houses">
      <h2>Your houses</h2>
      <ul>
        <li v-for="h in houses" :key="h.slug">
          <button type="button" class="house" @click="emit('house', h.slug)">
            <span aria-hidden="true">🏠</span> {{ h.name }}
          </button>
        </li>
      </ul>
    </section>

    <section class="open" aria-label="Open tables">
      <div class="games-head">
        <h2>Open tables</h2>
        <span class="open-ways">
          <button type="button" class="house" @click="emit('lobby')">{{ open.length ? `See all ${open.length}` : "See open tables" }}</button>
        </span>
      </div>
      <ul v-if="open.length">
        <li v-for="t in waitingAt" :key="t.id">
          <button type="button" class="waiting" @click="emit('lobby')">
            <span class="waiting-emoji" aria-hidden="true">{{ gameOf(t.game)?.emoji }}</span>
            <span class="waiting-text">
              <strong>{{ gameOf(t.game)?.name ?? "A game" }}</strong>
              <span>{{ t.who }} · {{ t.free === 1 ? "1 seat open" : `${t.free} seats open` }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="quiet">Nobody's waiting right now. Pick a game and choose “Find players” to be first at the table.</p>
    </section>

    <section class="games" aria-label="Games">
      <div class="games-head">
        <h2>Pick a game</h2>
        <div class="choosing">
          <div class="filter search">
            <TextField v-model="query" type="search" label="Search" placeholder="Chess, dice, words…" autocomplete="off" inputmode="search" />
          </div>
          <div class="filter">
            <SelectField v-model="players" label="Who's playing?" :options="sizes" />
          </div>
          <div class="filter">
            <SelectField v-model="sort" label="Sort" :options="sorts" />
          </div>
          <button type="button" class="house surprise" :disabled="!shown.length" @click="surprise"><span aria-hidden="true">🎲</span> Surprise me</button>
        </div>
      </div>
      <nav v-if="shelves.length > 1" class="jump" aria-label="Kinds of game">
        <button v-for="shelf in shelves" :key="shelf.id" type="button" class="jump-chip" @click="toShelf(shelf.id)">
          <span aria-hidden="true">{{ shelf.emoji }}</span> {{ shelf.name }} <small>{{ shelf.games.length }}</small>
        </button>
      </nav>
      <div v-if="shelves.length > 1 && shelves[0]?.name && !words.length" class="shelf-tools">
        <button type="button" class="tool-link" @click="toggleAll">{{ anyOpen ? "Fold all" : "Open all" }}</button>
      </div>
      <template v-for="shelf in shelves" :key="shelf.id">
      <h3 v-if="shelf.name" :id="`shelf-${shelf.id}`" class="shelf">
        <button type="button" class="shelf-toggle" :aria-expanded="isOpen(shelf.id)" :aria-controls="`games-${shelf.id}`" @click="setFolded(shelf.id, isOpen(shelf.id))">
          <span class="chev" aria-hidden="true">▾</span><span aria-hidden="true">{{ shelf.emoji }}</span> {{ shelf.name }} <small>{{ shelf.games.length }}</small>
        </button>
      </h3>
      <div v-if="isOpen(shelf.id)" :id="`games-${shelf.id}`" class="shelf-body">
      <template v-for="section in shelf.sections" :key="section.id">
      <h4 v-if="section.name" class="subshelf">
        <button type="button" class="shelf-toggle" :aria-expanded="isOpen(sectionKey(shelf, section))" :aria-controls="`games-${shelf.id}-${section.id}`" @click="setFolded(sectionKey(shelf, section), isOpen(sectionKey(shelf, section)))">
          <span class="chev" aria-hidden="true">▾</span><span aria-hidden="true">{{ section.emoji }}</span> {{ section.name }} <small>{{ section.games.length }}</small>
        </button>
      </h4>
      <ul v-if="!section.name || isOpen(sectionKey(shelf, section))" :id="`games-${shelf.id}-${section.id}`" class="grid" :aria-label="section.name || shelf.name || 'Games'">
        <li v-for="g in section.games" :key="g.id">
          <button type="button" class="tile" :class="{ last: g.id === last, words: g.board?.shade === 'words' }" :aria-label="`${g.name}: ${g.blurb}, ${seatsLabel(g)}`" @click="pick(g.id)">
            <span v-if="g.screen" class="mini-screen" aria-hidden="true">
              <svg v-if="g.screen.road" viewBox="0 0 100 100">
                <rect class="lawn" x="3" y="3" width="94" height="94" rx="14" />
                <path class="road" :d="g.screen.road" />
                <circle v-for="(b, i) in g.screen.bullets" :key="`c${i}`" class="creep" :cx="b[0]" :cy="b[1]" r="4.2" />
                <g v-for="(t, i) in g.screen.towers" :key="`t${i}`">
                  <rect class="plinth" :x="t[0] - 7" :y="t[1] - 7" width="14" height="14" rx="3" />
                  <circle class="turret" :class="`n${i}`" :cx="t[0]" :cy="t[1]" r="4" />
                </g>
              </svg>
              <svg v-else-if="g.screen.shop" viewBox="0 0 100 100">
                <rect class="wall" x="3" y="3" width="94" height="94" rx="14" />
                <rect class="sign" x="14" y="14" width="72" height="20" rx="4" />
                <path class="awning" d="M10 40 H90 L84 54 H16 Z" />
                <path class="stripe" d="M26 40 L23 54 M42 40 L41 54 M58 40 L59 54 M74 40 L77 54" />
                <rect class="door" x="42" y="60" width="16" height="32" rx="2" />
                <rect class="pane" x="16" y="62" width="20" height="18" rx="2" />
                <rect class="pane" x="64" y="62" width="20" height="18" rx="2" />
                <path class="wrench" d="M30 24 h30 M60 24 l6 -5 M60 24 l6 5" />
              </svg>
              <svg v-else-if="g.screen.strip" viewBox="0 0 100 100">
                <rect class="night" x="3" y="3" width="94" height="94" rx="14" />
                <path class="tarmac" d="M40 30 H60 L88 97 H12 Z" />
                <path class="lane" d="M50 34 V44 M50 52 V64 M50 74 V90" />
                <rect class="treepost" x="48.5" y="10" width="3" height="24" rx="1" />
                <circle class="lamp amber" cx="50" cy="13" r="3" />
                <circle class="lamp amber" cx="50" cy="20" r="3" />
                <circle class="lamp go" cx="50" cy="27" r="3" />
                <rect class="racer a" x="24" y="66" width="20" height="13" rx="3" />
                <rect class="racer b" x="57" y="50" width="15" height="10" rx="2.5" />
                <path class="tail" d="M27 75 h4 M37 75 h4 M59.5 57 h3 M66.5 57 h3" />
              </svg>
              <svg v-else-if="g.screen.quest" viewBox="0 0 100 100" shape-rendering="crispEdges">
                <rect fill="#4aa84a" x="3" y="3" width="94" height="94" rx="14" />
                <path fill="#74cc62" d="M14 20h4v2h-4z M70 16h4v2h-4z M80 60h4v2h-4z M12 70h4v2h-4z M30 84h4v2h-4z M62 86h4v2h-4z" />
                <path fill="#2f8a3c" d="M22 40h4v2h-4z M84 34h4v2h-4z M18 56h4v2h-4z M76 78h4v2h-4z" />
                <g transform="translate(18 16) scale(4)"><path fill="#0b0b14" d="M6 0h4v1h-4zM1 1h2v1h-2zM5 1h1v1h-1zM10 1h1v1h-1zM13 1h2v1h-2zM0 2h1v1h-1zM3 2h1v1h-1zM5 2h1v1h-1zM7 2h2v1h-2zM10 2h1v1h-1zM12 2h1v1h-1zM15 2h1v1h-1zM0 3h1v1h-1zM3 3h2v1h-2zM11 3h2v1h-2zM15 3h1v1h-1zM1 4h2v1h-2zM13 4h2v1h-2zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM4 6h2v1h-2zM10 6h2v1h-2zM14 6h1v1h-1zM1 7h1v1h-1zM4 7h2v1h-2zM10 7h2v1h-2zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM2 9h1v1h-1zM13 9h1v1h-1zM2 10h1v1h-1zM6 10h1v1h-1zM9 10h1v1h-1zM13 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM3 13h1v1h-1zM12 13h1v1h-1zM14 13h1v1h-1zM2 14h2v1h-2zM12 14h2v1h-2zM3 15h1v1h-1zM6 15h1v1h-1zM9 15h1v1h-1zM12 15h1v1h-1z" /><path fill="#2e3248" d="M6 1h4v1h-4zM6 2h1v1h-1zM9 2h1v1h-1zM5 3h1v1h-1zM7 3h2v1h-2zM10 3h1v1h-1zM3 5h1v1h-1zM12 5h1v1h-1zM4 15h2v1h-2zM10 15h2v1h-2z" /><path fill="#c8ccd8" d="M1 2h1v1h-1zM14 2h1v1h-1zM1 3h1v1h-1zM14 3h1v1h-1zM2 8h1v1h-1zM13 8h1v1h-1zM3 9h1v1h-1zM12 9h1v1h-1z" /><path fill="#ffffff" d="M2 2h1v1h-1zM13 2h1v1h-1zM2 3h1v1h-1zM6 3h1v1h-1zM9 3h1v1h-1zM13 3h1v1h-1zM3 4h10v1h-10zM2 5h1v1h-1zM4 5h8v1h-8zM13 5h1v1h-1zM2 6h2v1h-2zM6 6h4v1h-4zM12 6h2v1h-2zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h2v1h-2zM3 8h10v1h-10zM2 12h1v1h-1zM13 12h1v1h-1zM2 13h1v1h-1zM13 13h1v1h-1z" /><path fill="#8a90a4" d="M4 9h8v1h-8zM4 10h1v1h-1zM7 10h2v1h-2zM11 10h1v1h-1z" /><path fill="#ff5a5a" d="M3 10h1v1h-1zM12 10h1v1h-1zM2 11h1v1h-1zM4 11h8v1h-8zM13 11h1v1h-1z" /><path fill="#545a70" d="M5 10h1v1h-1zM10 10h1v1h-1z" /><path fill="#c8283c" d="M3 11h1v1h-1zM12 11h1v1h-1z" /><path fill="#3c90e8" d="M3 12h2v1h-2zM6 12h4v1h-4zM11 12h2v1h-2zM4 13h2v1h-2zM7 13h2v1h-2zM10 13h2v1h-2zM4 14h3v1h-3zM9 14h3v1h-3z" /><path fill="#2850b0" d="M5 12h1v1h-1zM10 12h1v1h-1zM6 13h1v1h-1zM9 13h1v1h-1zM7 14h2v1h-2z" /></g>
              </svg>
              <svg v-else-if="g.screen.rink" viewBox="0 0 100 100">
                <rect class="ice" x="3" y="3" width="94" height="94" rx="14" />
                <path class="rinkline" d="M3 50 H97 M38 50 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0" />
                <rect class="goal far" x="34" y="3" width="32" height="4" rx="2" />
                <rect class="goal near" x="34" y="93" width="32" height="4" rx="2" />
                <circle class="mallet far" cx="56" cy="24" r="10" />
                <circle class="mallet near" cx="40" cy="78" r="10" />
                <path class="streak" d="M47 68 L62 46" />
                <circle class="puck" cx="62" cy="46" r="6" />
              </svg>
              <svg v-else-if="g.screen.chip" viewBox="0 0 100 100">
                <rect class="felt" x="3" y="3" width="94" height="94" rx="14" />
                <circle v-for="(b, i) in g.screen.bullets" :key="`s${i}`" class="coin" :cx="b[0]" :cy="b[1]" r="7" />
                <circle class="bigchip" cx="50" cy="44" r="27" />
                <circle class="bigchip-edge" cx="50" cy="44" r="23.5" />
                <text class="bigchip-mark" x="50" y="53" text-anchor="middle">♠&#xFE0E;</text>
              </svg>
              <svg v-else viewBox="0 0 100 100">
                <rect class="glass" x="3" y="3" width="94" height="94" rx="14" />
                <path v-for="(f, i) in g.screen.foes" :key="`f${i}`" class="foe" :d="`M${f[0]} ${f[1] + 8} l8 -9 l-4 -6 h-8 l-4 6 z`" />
                <circle v-for="(b, i) in g.screen.bullets" :key="`b${i}`" class="shell" :cx="b[0]" :cy="b[1]" r="3.4" />
                <path class="beam" :d="`M${g.screen.ship[0] - 3} ${g.screen.ship[1] - 26} v-14 M${g.screen.ship[0] + 3} ${g.screen.ship[1] - 26} v-14`" />
                <path class="craft" :d="`M${g.screen.ship[0]} ${g.screen.ship[1] - 13} l4 9 l9 9 l-8 0 l-2 4 h-6 l-2 -4 l-8 0 l9 -9 z`" />
              </svg>
            </span>
            <span v-else-if="g.dice" class="mini-dice" :class="{ 'as-domino': g.id === 'dominoes' }" aria-hidden="true">
              <span v-for="(face, i) in g.dice" :key="i" class="mini-die" :style="{ '--i': i }">
                <i v-for="n in 9" :key="n" :class="{ pip: PIPS[face]?.includes(n - 1) }" />
              </span>
            </span>
            <span v-else-if="g.board?.sketch" class="mini-table mini-sketch" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <rect class="paper" x="6" y="8" width="88" height="84" rx="7" />
                <circle class="sun" cx="76" cy="28" r="9" />
                <path class="rays" d="M76 13 v-5 M89 18 l4 -4 M91 28 h5 M63 18 l-4 -4" />
                <path class="ink" d="M20 82 V52 L40 34 L60 52 V82 Z M34 82 V66 H46 V82 M14 82 H70" />
                <path class="pencil" d="M58 74 L84 48 L92 56 L66 82 L56 84 Z" />
                <path class="pencil-tip" d="M58 74 L66 82 L56 84 Z" />
              </svg>
            </span>
            <span v-else-if="g.board" class="mini-board" :class="g.board.shade ? `shade-${g.board.shade}` : ''" aria-hidden="true" :style="{ '--cols': g.board.cols, '--rows': Math.ceil(g.board.cells.length / g.board.cols) }">
              <span v-for="(c, i) in g.board.cells" :key="i" class="mini-cell" :class="c ? [`tone-${c.tone}`, c.shade ? `shade-${c.shade}` : ''] : ''">{{ c?.glyph }}</span>
            </span>
            <span v-else-if="g.table" class="mini-table" :class="`surface-${g.table.surface}`" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <rect class="rail" x="4" y="4" width="92" height="92" rx="17" />
                <rect class="cloth" x="10" y="10" width="80" height="80" rx="12" />
                <line v-if="g.table.cup && g.table.balls[0]" class="aim" :x1="g.table.balls[0].x" :y1="g.table.balls[0].y" :x2="g.table.cup[0]" :y2="g.table.cup[1]" />
                <g v-if="g.table.cup">
                  <circle class="cup" :cx="g.table.cup[0]" :cy="g.table.cup[1]" r="7.5" />
                  <line class="pole" :x1="g.table.cup[0]" :y1="g.table.cup[1]" :x2="g.table.cup[0]" :y2="g.table.cup[1] - 30" />
                  <path class="flag" :d="`M${g.table.cup[0]} ${g.table.cup[1] - 30} l14 5 l-14 6 z`" />
                </g>
                <circle v-for="(b, i) in g.table.balls" :key="i" class="ball" :class="`tone-${b.tone}`" :cx="b.x" :cy="b.y" r="6.5" />
              </svg>
            </span>
            <span v-else class="fan" aria-hidden="true">
              <PlayingCard v-for="(c, i) in g.fan" :key="i" class="fan-card" :style="{ '--i': i }" :card="c" size="table" />
            </span>
            <span class="emoji" aria-hidden="true">{{ g.emoji }}</span>
            <strong>{{ g.name }}</strong>
            <span class="blurb">{{ g.blurb }}</span>
            <span class="chips">
              <span class="chip">{{ seatsLabel(g) }}</span>
              <span v-if="sort !== 'category'" class="chip">{{ categoryName(g.category) }}</span>
              <span v-if="g.id === last" class="chip gold">Last played</span>
            </span>
          </button>
        </li>
      </ul>
      </template>
      </div>
      </template>
      <p v-if="!shown.length" class="none" role="status">
        {{ noneLine }}
        <button v-if="words.length" type="button" class="house" @click="query = ''">Clear search</button>
      </p>
    </section>

    <p class="fine">Pick a game to practice against the computer, start a family table, find players, or take on a challenger.</p>
    <p class="fine links">
      <a class="design" href="watch/">👀 Watch a game</a>
      <a class="design" href="designer/">🎨 Design your own deck of cards</a>
      <a class="design" href="wasm/">👾 Play Delbie's Doomsday, a first-person shooter</a>
      <a class="design" href="wasm/market/">📦 Run Delbie's Stockroom, a parts-market sim</a>
      <a class="design" href="wasm/battler/">🃏 Fight through Delbie's Back Room, a deck-building battler</a>
      <a v-if="canList" class="design" href="games">📋 Every game on one page</a>
      <a v-if="canDaily" class="design" href="daily">🔢 The daily sudoku</a>
      <a class="design" :href="BUILT">🧪 How the parlor is built</a>
      <button type="button" class="design" @click="emit('move')">📱 Use the parlor on another device</button>
      <button v-if="canAsk" type="button" class="design" @click="emit('ask')">💡 Don't see your game? Ask for it</button>
    </p>
  </div>
</template>

<style scoped>
.chooser {
  --tile-card: clamp(46px, 7vw, 66px);
  max-width: 1120px;
  margin: 0 auto;
  padding: max(28px, env(safe-area-inset-top)) clamp(16px, 4vw, 48px) 48px;
  display: flex;
  flex-direction: column;
  gap: clamp(20px, 3vw, 36px);
  color: var(--cream);
}
.hero { text-align: center; padding-top: clamp(8px, 4vh, 48px); }
.hero h1 { margin: 6px 0 0; font-size: clamp(2.8rem, 7vw, 5.2rem); letter-spacing: -0.02em; text-shadow: 0 4px 24px rgba(0, 0, 0, 0.35); }
.hero p { margin: 8px 0 0; font-size: clamp(1.05rem, 1.6vw, 1.3rem); font-style: italic; color: #d6e6dc; }
.hero p.free { margin-top: 6px; font-style: normal; font-weight: 600; font-size: 0.98rem; color: var(--gold, #e8c46a); }
.starters h2 { margin: 0; }
.starters ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); }
@media (min-width: 760px) {
  .starters ul { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 559px) {
  .starters ul { grid-template-columns: 1fr 1fr; gap: 8px; }
  .starter { padding: 10px 12px; gap: 10px; }
  .starter-emoji { font-size: 1.4rem; width: 1.7rem; }
  .starter-text span { display: none; }
}
.starter { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; text-align: left; border-radius: 14px; border: 1px solid rgba(232, 196, 106, 0.45); background: rgba(10, 30, 20, 0.45); color: var(--cream, #fbf6ec); cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
.starter:hover, .starter:focus-visible { border-color: var(--gold, #e8c46a); transform: translateY(-1px); }
.starter-emoji { font-size: 1.8rem; line-height: 1; width: 2.2rem; text-align: center; flex: none; }
.starter-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.starter-text strong { font-family: Georgia, "Times New Roman", serif; font-size: 1.1rem; }
.starter-text span { font-size: 0.86rem; color: #b9d0c2; }
.jump { position: sticky; top: 0; z-index: 3; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 14px -4px 0; padding: 10px 4px; background: linear-gradient(rgba(20, 54, 40, 0.96), rgba(20, 54, 40, 0.88)); backdrop-filter: blur(6px); border-radius: 0 0 12px 12px; }
.jump::-webkit-scrollbar { display: none; }
.jump-chip { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; border: 1px solid rgba(232, 196, 106, 0.5); background: rgba(10, 30, 20, 0.5); color: var(--cream, #fbf6ec); font-weight: 600; font-size: 0.9rem; cursor: pointer; white-space: nowrap; }
.jump-chip small { font-weight: 400; color: #b9d0c2; }
.jump-chip:hover { border-color: var(--gold, #e8c46a); }
.shelf { scroll-margin-top: 64px; }
.suits { letter-spacing: 0.5em; color: var(--gold); font-size: clamp(1rem, 1.6vw, 1.3rem); }
h2 { margin: 0; font-size: clamp(1.3rem, 2vw, 1.7rem); color: var(--gold); }

.houses ul { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.house {
  border: 2px solid rgba(232, 196, 106, 0.6); border-radius: 999px; background: rgba(0, 0, 0, 0.25);
  color: var(--cream); font: inherit; font-weight: 600; padding: 10px 18px; cursor: pointer;
}
.house:hover, .house:focus-visible { border-color: var(--gold); background: rgba(232, 196, 106, 0.14); }

.open ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); }
.waiting {
  width: 100%; height: 100%; display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer;
  padding: 12px 16px; border: 2px solid rgba(255, 255, 255, 0.12); border-radius: 14px;
  background: rgba(0, 0, 0, 0.24); color: var(--cream); font: inherit;
}
.waiting:hover, .waiting:focus-visible { border-color: var(--gold); outline: none; }
.waiting-emoji { font-size: 1.6rem; line-height: 1; }
.waiting-text { display: flex; flex-direction: column; min-width: 0; }
.waiting-text span { color: #d6e6dc; font-size: 0.9rem; }
.quiet { margin: 10px 0 0; color: #b9d0c2; }

.games-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.open-ways { display: flex; gap: 8px; flex-wrap: wrap; }
.shelf { margin: clamp(20px, 2.6vw, 30px) 0 0; font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.15rem, 1.7vw, 1.4rem); color: var(--cream); border-bottom: 1px solid rgba(232, 196, 106, 0.35); }
.shelf small, .subshelf small { font-family: inherit; font-size: 0.8rem; font-weight: 400; color: #b9d0c2; }
/* A heading is the button that folds its shelf away; the arrow turns sideways when it is folded. */
.shelf-toggle { width: 100%; display: flex; align-items: baseline; gap: 10px; padding: 0 0 6px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.shelf-toggle:hover .chev { color: #ffe7a6; }
.shelf-toggle:focus-visible { outline: 3px solid #ffd76a; outline-offset: 3px; border-radius: 6px; }
.chev { display: inline-block; width: 1em; flex: none; color: var(--gold, #e8c46a); font-size: 0.9em; transition: rotate 160ms var(--ease-out, ease-out); }
.shelf-toggle[aria-expanded="false"] .chev { rotate: -90deg; }
.shelf-body > .grid:first-child, .subshelf + .grid { margin-top: 12px; }
/* The kinds of card game, under the card games' shelf. */
.subshelf { margin: 20px 0 0; font-family: Georgia, "Times New Roman", serif; font-size: clamp(1rem, 1.4vw, 1.15rem); font-weight: 600; color: #e3efe7; }
.subshelf .shelf-toggle { width: auto; padding-bottom: 0; }
.shelf-tools { display: flex; justify-content: flex-end; margin-top: 10px; }
.tool-link { border: 0; background: none; padding: 2px 0; color: var(--gold, #e8c46a); font: inherit; font-size: 0.9rem; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.tool-link:focus-visible { outline: 3px solid #ffd76a; outline-offset: 3px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
.filter { min-width: 220px; --background: var(--cream); --foreground: var(--ink); --border: rgba(255, 255, 255, 0.18); --muted-foreground: #cfe2d6; --ring: var(--gold); }
.choosing { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; }
.search { flex: 1 1 220px; }
.none .house { margin-left: 8px; }
.surprise { white-space: nowrap; }
.surprise:disabled { opacity: 0.45; cursor: default; }
.grid { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: clamp(12px, 1.6vw, 20px); grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr 1fr; } }

.tile {
  position: relative; width: 100%; height: 100%; min-height: clamp(150px, 18vw, 200px);
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
  padding: clamp(14px, 1.8vw, 22px); padding-right: calc(var(--tile-card) * 1.9);
  border: 2px solid rgba(255, 255, 255, 0.12); border-radius: 18px; cursor: pointer;
  background: radial-gradient(ellipse at 85% 20%, rgba(255, 255, 255, 0.08), transparent 60%), rgba(0, 0, 0, 0.24);
  color: var(--cream); font: inherit; overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: transform 160ms var(--ease-out, ease-out), box-shadow 160ms, border-color 160ms;
}
.tile.last { border-color: rgba(232, 196, 106, 0.55); }
/* A row of letter tiles is wider than a fan or a board (two card-widths, not one and a half), so its tile keeps that much clear of the words. */
.tile.words { padding-right: calc(var(--tile-card) * 2.5); }
.tile:hover, .tile:focus-visible { transform: translateY(-4px); box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35); border-color: var(--gold); outline: none; }
.emoji { font-size: clamp(1.6rem, 2.6vw, 2.2rem); line-height: 1; }
.tile strong { font-family: Georgia, "Times New Roman", serif; font-size: clamp(1.25rem, 1.9vw, 1.6rem); margin-top: 6px; }
.blurb { color: #d6e6dc; font-size: clamp(0.85rem, 1.1vw, 1rem); line-height: 1.3; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 10px; }
.chip { font-size: 0.78rem; padding: 2px 10px; border-radius: 999px; background: rgba(0, 0, 0, 0.3); color: #e3efe7; white-space: nowrap; }
.chip.gold { background: rgba(232, 196, 106, 0.2); color: #ffe7a6; }

/* A little fan of cards in the corner; it opens up when you point at the tile. */
.fan { position: absolute; right: calc(var(--tile-card) * 0.35); top: 50%; translate: 0 -50%; width: calc(var(--tile-card) * 1.3); height: calc(var(--tile-card) * 1.5); --trick-w: var(--tile-card); --trick-h: calc(var(--tile-card) * 1.4); }
.fan-card { position: absolute; left: 0; top: 0; transform-origin: 50% 120%; rotate: calc((var(--i) - 1) * 9deg); translate: calc(var(--i) * var(--tile-card) * 0.16) 0; transition: rotate 220ms var(--ease-back, ease-out), translate 220ms var(--ease-back, ease-out); }
.tile:hover .fan-card, .tile:focus-visible .fan-card { rotate: calc((var(--i) - 1) * 16deg); translate: calc(var(--i) * var(--tile-card) * 0.22) -4px; }
/* A board game's tile: a little board where the fan would be; it straightens up when you point at the tile. */
.mini-board {
  position: absolute; right: calc(var(--tile-card) * 0.3); top: 50%; translate: 0 -50%; rotate: 5deg;
  width: calc(var(--tile-card) * 1.5); aspect-ratio: 1; display: grid; grid-template: repeat(var(--cols), minmax(0, 1fr)) / repeat(var(--cols), minmax(0, 1fr)); gap: 2px;
  background: #6b6257; border-radius: 10%; overflow: hidden; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
  transition: rotate 220ms var(--ease-back, ease-out), scale 220ms var(--ease-back, ease-out);
}
/* Mancala: a wooden board of round pits, two rows of them, with the seeds counted in each. */
.mini-board.shade-pits { aspect-ratio: 3 / 2; grid-template: repeat(2, minmax(0, 1fr)) / repeat(3, minmax(0, 1fr)); gap: calc(var(--tile-card) * 0.09); padding: calc(var(--tile-card) * 0.1); box-sizing: border-box; background: linear-gradient(#9a6a3a, #7d5229); border-radius: calc(var(--tile-card) * 0.2); }
.mini-board.shade-pits .mini-cell { border-radius: 50%; background: radial-gradient(circle at 50% 35%, #5b3817, #3f2610); color: #f3d77f; font-size: calc(var(--tile-card) * 0.26); box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.5); }
.mini-board.shade-pits .mini-cell.tone-light { color: #b9d6f7; text-shadow: none; }
/* The gaps between the cells are the board's lines. */
.mini-cell {
  display: grid; place-items: center; font-weight: 800; line-height: 1; font-size: calc(var(--tile-card) * 1.5 / var(--cols) * 0.6);
  background: var(--cream); color: var(--ink);
}
.mini-cell.tone-red { color: #b3261e; }
.mini-cell.tone-blue { color: #1f5fbf; }
.mini-cell.tone-gold { color: #d9a400; }
.mini-cell.tone-dark { color: #1d1a16; }
.mini-cell.tone-light { color: #fffdf8; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5); }
/* The dark squares of a checkered board. */
.mini-cell.shade-dark { background: #a9794d; }
/* A green board (Reversi): discs fill their squares. */
.mini-board.shade-green { background: #17402c; }
.mini-board.shade-green .mini-cell { background: #2f8a5b; font-size: calc(var(--tile-card) * 1.5 / var(--cols) * 0.95); }
/* A wooden board (Go): no squares, only lines, and the stones sit where they cross. */
.mini-board.shade-wood { gap: 0; background: #dcb264; }
.mini-board.shade-wood .mini-cell {
  background: linear-gradient(#4a3716, #4a3716) center / 100% 1px no-repeat, linear-gradient(#4a3716, #4a3716) center / 1px 100% no-repeat;
  font-size: calc(var(--tile-card) * 1.5 / var(--cols) * 1.15);
}
.mini-board.shade-wood .mini-cell.tone-light { text-shadow: 0 0 1px #1d1a16, 0 1px 1px rgba(0, 0, 0, 0.5); }
/* A board of points (Backgammon): long triangles from both edges, and no lines between the cells. */
/* A word game: letter tiles, green in place, gold elsewhere, grey not in the word. */
/* Letter tiles. A tile is as big as fits: across for a row or two of letters, and down for a square of them (Word Hunt, Criss-Crosswords), so the picture is never taller than a board and stays clear of the name under it. */
.mini-board.shade-words { --cell: min(calc((var(--tile-card) * 2 - 3px * (var(--cols) - 1)) / var(--cols)), calc((var(--tile-card) * 1.5 - 3px * (var(--rows) - 1)) / var(--rows))); width: calc(var(--cell) * var(--cols) + 3px * (var(--cols) - 1)); gap: 3px; rotate: -4deg; background: none; box-shadow: none; border-radius: 0; overflow: visible; aspect-ratio: 5 / 2; grid-template-rows: none; grid-auto-rows: auto; aspect-ratio: auto; }
.mini-board.shade-words .mini-cell { aspect-ratio: 1; border-radius: 4px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3); font-size: calc(var(--cell) * 0.55); font-weight: 800; color: #1d1a16; background: #fbf6ec; }
.mini-board.shade-words .mini-cell.tone-hit { background: #3f9a52; color: #fff; }
.mini-board.shade-words .mini-cell.tone-near { background: #d2a52a; color: #241a00; }
.mini-board.shade-words .mini-cell.tone-miss { background: #5b5650; color: #f1ece4; }
.mini-board.shade-words .mini-cell.tone-blank { background: rgba(0, 0, 0, 0.25); }
.mini-board.shade-points { background: #c9a36b; gap: 0; border: 2px solid #5b3a22; box-sizing: border-box; }
.mini-board.shade-points .mini-cell { background: none; font-size: calc(var(--tile-card) * 1.5 / var(--cols) * 0.98); }
.mini-board.shade-points .mini-cell.shade-point-down, .mini-board.shade-points .mini-cell.shade-point-up { position: relative; isolation: isolate; }
.mini-board.shade-points .mini-cell.shade-point-down::before, .mini-board.shade-points .mini-cell.shade-point-up::before { content: ""; position: absolute; inset: 0; z-index: -1; background: #7a2e23; clip-path: polygon(8% 0, 92% 0, 50% 100%); }
.mini-board.shade-points .mini-cell.shade-point-up::before { clip-path: polygon(8% 100%, 92% 100%, 50% 0); }
.mini-board.shade-points .mini-cell:nth-child(even).shade-point-down::before, .mini-board.shade-points .mini-cell:nth-child(odd).shade-point-up::before { background: #efe0bb; }
.mini-board.shade-points .mini-cell.tone-light { color: #fffaf0; text-shadow: 0 0 1px #3d2717, 0 1px 1px rgba(0, 0, 0, 0.6); }
.tile:hover .mini-board, .tile:focus-visible .mini-board { rotate: 0deg; scale: 1.06; }
/* A dice game's tile: a few dice thrown where the fan would be; they square up when you point at the tile. */
.mini-dice { position: absolute; right: calc(var(--tile-card) * 0.3); top: 50%; translate: 0 -50%; width: calc(var(--tile-card) * 1.5); aspect-ratio: 1; }
.mini-die {
  position: absolute; width: 46%; aspect-ratio: 1; padding: 6%; box-sizing: border-box; border-radius: 18%;
  display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); place-items: center;
  background: linear-gradient(145deg, #fffdf6, #eadfc8); box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.14), 0 4px 8px rgba(0, 0, 0, 0.35);
  transition: rotate 220ms var(--ease-back, ease-out), translate 220ms var(--ease-back, ease-out);
}
.mini-die:nth-child(1) { left: 2%; top: 8%; rotate: -12deg; }
.mini-die:nth-child(2) { right: 0; top: 20%; rotate: 9deg; }
.mini-die:nth-child(3) { left: 24%; bottom: 0; rotate: -4deg; }
.mini-die:nth-child(n + 4) { display: none; }
.mini-die i.pip { width: 74%; aspect-ratio: 1; border-radius: 50%; background: #1d1a16; }
.tile:hover .mini-die, .tile:focus-visible .mini-die { rotate: 0deg; translate: 0 -3px; }
/* Dominoes: the two faces end to end are one tile, lying at a slant. */
.mini-dice.as-domino { rotate: -12deg; transition: rotate 220ms var(--ease-back, ease-out); }
.mini-dice.as-domino .mini-die { top: 25%; width: 50%; rotate: 0deg; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.14), 0 4px 8px rgba(0, 0, 0, 0.35); }
.mini-dice.as-domino .mini-die:nth-child(1) { left: 0; border-radius: 16% 0 0 16%; border-right: 1px solid rgba(29, 26, 22, 0.4); }
.mini-dice.as-domino .mini-die:nth-child(2) { left: 50%; right: auto; border-radius: 0 16% 16% 0; }
.tile:hover .mini-dice.as-domino, .tile:focus-visible .mini-dice.as-domino { rotate: 0deg; }
.tile:hover .mini-dice.as-domino .mini-die, .tile:focus-visible .mini-dice.as-domino .mini-die { translate: none; }
/* A table sport's tile: a little table seen from above, where the fan would be. */
.mini-table {
  position: absolute; right: calc(var(--tile-card) * 0.3); top: 50%; translate: 0 -50%; rotate: 5deg;
  width: calc(var(--tile-card) * 1.5); aspect-ratio: 1; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.35));
  transition: rotate 220ms var(--ease-back, ease-out), scale 220ms var(--ease-back, ease-out);
}
.mini-table svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* A sheet of paper with a house drawn on it, and the pencil that drew it. */
.mini-sketch .paper { fill: #fdfaf2; stroke: #d9cdb4; stroke-width: 2; }
.mini-sketch .ink { fill: none; stroke: #2a2620; stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; }
.mini-sketch .sun { fill: #f2b632; }
.mini-sketch .rays { fill: none; stroke: #f2b632; stroke-width: 3.5; stroke-linecap: round; }
.mini-sketch .pencil { fill: #e2574c; stroke: #7f231a; stroke-width: 1.5; stroke-linejoin: round; }
.mini-sketch .pencil-tip { fill: #f3dcb5; stroke: #7f231a; stroke-width: 1.5; stroke-linejoin: round; }
.mini-table .rail { fill: #e9dcc3; stroke: #5b3d22; stroke-width: 2; }
.mini-table .cloth { fill: #3f9c58; }
/* A green has timber rails, like the holes themselves. */
.mini-table.surface-green .rail { fill: #c08a52; stroke: #4a2c12; stroke-width: 2.5; }
.mini-table.surface-green .cloth { fill: #3aa15a; stroke: rgba(8, 40, 16, 0.5); stroke-width: 2; }
.mini-table.surface-felt .cloth { fill: #2f8a5b; }
.mini-table.surface-lane .cloth { fill: #e0b877; }
.mini-table.surface-wood .rail { fill: #6b3f1e; stroke: #3a210d; stroke-width: 2; }
.mini-table.surface-wood .cloth { fill: #ecd09c; rx: 4px; }
.mini-table .ball.tone-cream { fill: #fbf3df; stroke: #8c6a3c; stroke-width: 1; }
.mini-table .aim { stroke: rgba(255, 255, 255, 0.8); stroke-width: 2.5; stroke-dasharray: 1 6; stroke-linecap: round; }
.mini-table .cup { fill: #1d1a16; stroke: rgba(255, 255, 255, 0.7); stroke-width: 1.5; }
.mini-table .pole { stroke: #fbf6ec; stroke-width: 2.5; stroke-linecap: round; }
.mini-table .flag { fill: #e0453a; }
.mini-table .ball { fill: #fdfdf8; stroke: rgba(0, 0, 0, 0.45); stroke-width: 1.2; }
.mini-table .ball.tone-red { fill: #e0453a; } .mini-table .ball.tone-blue { fill: #3d7fe6; } .mini-table .ball.tone-gold { fill: #f2c230; } .mini-table .ball.tone-black { fill: #2a2622; } .mini-table .ball.tone-orange { fill: #c8792b; }
.tile:hover .mini-table, .tile:focus-visible .mini-table { rotate: 0deg; scale: 1.06; }
/* An arcade game's tile: a little screen, dark against the felt, where the fan would be. */
.mini-screen {
  position: absolute; right: calc(var(--tile-card) * 0.3); top: 50%; translate: 0 -50%; rotate: 5deg;
  width: calc(var(--tile-card) * 1.5); aspect-ratio: 1; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.4));
  transition: rotate 220ms var(--ease-back, ease-out), scale 220ms var(--ease-back, ease-out);
}
.mini-screen svg { display: block; width: 100%; height: 100%; }
.mini-screen .glass { fill: #0a1024; stroke: #4cc9ff; stroke-width: 2; }
.mini-screen .foe { fill: rgba(255, 90, 110, 0.3); stroke: #ff5a6e; stroke-width: 1.6; stroke-linejoin: round; }
.mini-screen .shell { fill: #fff; stroke: #ff6ad5; stroke-width: 2.4; }
.mini-screen .beam { stroke: #9fe3ff; stroke-width: 2; stroke-linecap: round; }
.mini-screen .craft { fill: rgba(76, 201, 255, 0.35); stroke: #4cc9ff; stroke-width: 1.8; stroke-linejoin: round; }
.mini-screen .lawn { fill: #214330; stroke: #5b4a33; stroke-width: 2; }
.mini-screen .road { fill: none; stroke: #cdb48a; stroke-width: 10; stroke-linejoin: round; }
.mini-screen .creep { fill: #ff5a6e; stroke: #5b1420; stroke-width: 1.4; }
.mini-screen .plinth { fill: #2a3140; stroke: #0e131c; stroke-width: 1.4; }
.mini-screen .turret { fill: #5ee6a0; }
.mini-screen .turret.n1 { fill: #3fe0d0; }
.mini-screen .turret.n2 { fill: #ffd166; }
.mini-screen .wall { fill: #2a3140; stroke: #ffd166; stroke-width: 2; }
.mini-screen .sign { fill: #ffd166; }
.mini-screen .wrench { fill: none; stroke: #1d1a16; stroke-width: 3.4; stroke-linecap: round; }
.mini-screen .awning { fill: #c8323c; stroke: #5b1420; stroke-width: 1.4; stroke-linejoin: round; }
.mini-screen .stripe { stroke: #fbf6ec; stroke-width: 5; }
.mini-screen .door { fill: #0e131c; stroke: #8b97b8; stroke-width: 1.4; }
.mini-screen .pane { fill: #4cc9ff; opacity: 0.75; }
.mini-screen .night { fill: #14101f; stroke: #ff5a8a; stroke-width: 2; }
.mini-screen .tarmac { fill: #2b2a33; }
.mini-screen .lane { stroke: #e8e2d0; stroke-width: 1.6; fill: none; }
.mini-screen .treepost { fill: #8b97b8; }
.mini-screen .lamp.amber { fill: #ffb627; }
.mini-screen .lamp.go { fill: #55d68a; }
.mini-screen .racer.a { fill: #4cc9ff; stroke: #0e131c; stroke-width: 1.4; }
.mini-screen .racer.b { fill: #ff5a6e; stroke: #0e131c; stroke-width: 1.2; }
.mini-screen .tail { stroke: #ff2d2d; stroke-width: 2; stroke-linecap: round; }
.mini-screen .ice { fill: #0d1f3f; stroke: #9fb4dd; stroke-width: 2; }
.mini-screen .rinkline { fill: none; stroke: rgba(125, 211, 252, 0.5); stroke-width: 1.6; }
.mini-screen .goal.near, .mini-screen .mallet.near { fill: #5aa9ff; }
.mini-screen .goal.far, .mini-screen .mallet.far { fill: #ff6b6b; }
.mini-screen .mallet { stroke: #0e131c; stroke-width: 1.6; }
.mini-screen .streak { stroke: #ffd166; stroke-width: 5; stroke-linecap: round; opacity: 0.35; }
.mini-screen .puck { fill: #ffd166; stroke: #8a6a1a; stroke-width: 1.6; }
.mini-screen .felt { fill: #1f4d3a; stroke: #e8c46a; stroke-width: 2; }
.mini-screen .coin { fill: #ffd166; stroke: #8a6a14; stroke-width: 1.6; }
.mini-screen .bigchip { fill: #c8323c; stroke: #5b1420; stroke-width: 1.6; }
.mini-screen .bigchip-edge { fill: none; stroke: #fbf6ec; stroke-width: 4; stroke-dasharray: 8 10.45; }
.mini-screen .bigchip-mark { fill: #fbf6ec; font-size: 26px; font-family: Georgia, serif; }
.tile:hover .mini-screen, .tile:focus-visible .mini-screen { rotate: 0deg; scale: 1.06; }
@media (max-width: 560px) {
  .tile { padding-right: clamp(14px, 1.8vw, 22px); padding-top: calc(var(--tile-card) * 1.2); }
  .tile.words { padding-right: clamp(14px, 1.8vw, 22px); padding-top: calc(var(--tile-card) * 1.9); }
  .fan { top: 14px; right: 14px; translate: none; --tile-card: 34px; }
  .mini-board { top: 12px; right: 14px; translate: none; --tile-card: 32px; }
  .mini-board.shade-words { --tile-card: 44px; }
  .mini-table { top: 12px; right: 14px; translate: none; --tile-card: 32px; }
  .mini-dice { top: 12px; right: 14px; translate: none; --tile-card: 32px; }
  .mini-screen { top: 12px; right: 14px; translate: none; --tile-card: 32px; }
  .emoji { display: none; }
}
@media (prefers-reduced-motion: reduce) { .tile, .fan-card, .mini-board, .mini-table, .mini-screen, .mini-die { transition: none; } }
.none, .fine { text-align: center; color: #b9d0c2; margin: 0; }
.links { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem 1.5rem; }
.design { color: var(--gold); font-weight: 600; text-underline-offset: 3px; }
button.design { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.design:focus-visible { outline: 3px solid #ffd76a; outline-offset: 3px; border-radius: 4px; }
</style>
