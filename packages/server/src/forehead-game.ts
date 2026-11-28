// Forehead: the rules. Everyone at the call has a card on their forehead that the others can read
// and they can't, and works out what it says from how the room treats them.
//
// A round: the host picks a game from the list (MODES), every player is dealt a card, the room
// plays up to each one by that game's rule, and each player guesses their own (a few tries). The
// round ends when everyone is done, when the time is up, or when the host turns the cards over.
// The host changes every round, and the new host picks the next game.
//
// The host holds the buzzer: a player who says somebody's card out loud is buzzed and loses a
// point, and the player whose card was given away can be dealt a new one.
//
// Nothing here knows about the call or the server: these are plain functions over a state, so the
// one rule that matters most can be tested on its own. A player is never shown their own card
// while they could still guess it (`view`).

export type Category = "animal" | "job" | "thing" | "food" | "place" | "story";

/** How a card's kind is put to the player wearing it: the one hint they are given. */
export const CATEGORY_HINT: Record<Category, string> = {
  animal: "An animal",
  job: "Somebody at work",
  thing: "A thing",
  food: "Something to eat",
  place: "A place",
  story: "Someone from a story",
};

export interface Card {
  name: string;
  category: Category;
  /** Other answers that count ("policeman" for a police officer). */
  also?: string[];
}

const cards = (category: Category, names: string): Card[] =>
  names.split(",").map((entry) => {
    const [name, ...also] = entry.split("|").map((s) => s.trim());
    return { name: name!, category, ...(also.length ? { also } : {}) };
  });

/**
 * The cards. Kinds of thing, never a real person and never somebody else's character: a wizard,
 * not a wizard with a name. Enough of them that seeing five others' cards rules little out.
 */
export const CARDS: Card[] = [
  ...cards(
    "animal",
    "Goose, Cat, Dog, Cow, Horse, Pig, Sheep, Goat, Chicken|hen, Rooster|cockerel, Duck, Owl, Eagle, Parrot, Penguin, Flamingo, Peacock, Pigeon, Crow|raven, Bat, Mouse, Rat, Squirrel, Rabbit|bunny, Skunk, Raccoon, Fox, Wolf, Bear, Deer, Moose, Lion, Tiger, Elephant, Giraffe, Zebra, Hippo|hippopotamus, Rhino|rhinoceros, Monkey, Gorilla, Kangaroo, Koala, Sloth, Camel, Snake, Crocodile|alligator|gator, Turtle|tortoise, Frog|toad, Shark, Whale, Dolphin, Octopus, Crab, Lobster, Jellyfish, Goldfish, Bee, Butterfly, Spider, Mosquito, Snail, Worm",
  ),
  ...cards(
    "job",
    "Firefighter|fireman, Police officer|policeman|cop|police, Doctor, Nurse, Dentist, Vet|veterinarian, Teacher, Librarian, Chef|cook, Waiter|waitress|server, Baker, Farmer, Mechanic, Plumber, Electrician, Carpenter, Painter, Bus driver, Truck driver|trucker, Taxi driver|cab driver, Pilot, Astronaut, Lifeguard, Referee|umpire, Mail carrier|mailman|postman|postal worker, Hairdresser|barber, Magician, Clown, Judge, Lawyer|attorney, Detective, Weather forecaster|weatherman|meteorologist, Dog walker, Babysitter|nanny, Zookeeper, Photographer, Tour guide, Flight attendant, Cashier, Janitor|custodian|caretaker, Lighthouse keeper, Auctioneer, Opera singer, Rock star, Ballerina|ballet dancer, Lumberjack, Beekeeper, Fortune teller|psychic, Crossing guard|lollipop lady, Tooth fairy",
  ),
  ...cards(
    "thing",
    "Umbrella, Alarm clock, Vacuum cleaner|hoover|vacuum, Toaster, Refrigerator|fridge, Washing machine|washer, Lawn mower|lawnmower, Traffic light|stoplight, Fire hydrant, Mailbox|postbox|letterbox, Balloon, Kite, Trampoline, Piano, Drum|drum kit, Trumpet, Bicycle|bike, Skateboard, Shopping cart|shopping trolley, Wheelbarrow, Ladder, Hammer, Flashlight|torch, Candle, Mirror, Pillow, Sock, Zipper|zip, Rubber duck, Snowman, Scarecrow, Disco ball, Pinata, Remote control|tv remote|remote, Smoke alarm|smoke detector, Doorbell, Stapler, Sponge, Toothbrush, Roll of toilet paper|toilet paper|toilet roll|loo roll",
  ),
  ...cards(
    "food",
    "Pizza, Hot dog, Hamburger|burger|cheeseburger, Taco, Sandwich, Pancake, Waffle, Doughnut|donut, Birthday cake|cake, Ice cream|ice cream cone, Popcorn, Spaghetti|pasta, Banana, Watermelon, Pineapple, Lemon, Onion, Carrot, Broccoli, Corn on the cob|corn|sweetcorn, Egg, Cheese, Pickle|gherkin, Hot sauce|chili sauce, Marshmallow, Cotton candy|candy floss, Lollipop, Chewing gum|bubble gum|gum, Brussels sprout|sprout, Leftovers",
  ),
  ...cards(
    "place",
    "Volcano, Desert island|island, Haunted house, Castle, Lighthouse, Igloo, Tree house|treehouse, Circus, Zoo, Library, Waiting room, Car wash, Laundromat|launderette, Bowling alley, Roller coaster|rollercoaster, Elevator|lift, Swamp, Iceberg, The moon, Bouncy castle|bounce house",
  ),
  ...cards(
    "story",
    "Wizard, Witch, Pirate, Knight, King, Queen, Princess, Prince, Dragon, Unicorn, Mermaid, Giant, Troll, Fairy, Elf, Ghost, Vampire, Werewolf, Zombie, Mummy, Robot, Alien|martian, Superhero, Villain|supervillain|baddie, Genie, Ninja, Cowboy|cowgirl, Caveman|cavewoman|cave person, Time traveller|time traveler, Mad scientist, Snow queen|ice queen, Sea monster, Talking tree, Wicked stepmother|evil stepmother, Court jester|jester|fool",
  ),
];

/**
 * The games a host picks from, one for each round. All of them are the same cards and the same
 * guessing; what changes is how the room may play up to a card.
 */
export interface Mode {
  id: string;
  name: string;
  emoji: string;
  /** The rule of the round, as everyone is shown it. */
  rule: string;
  /** Nobody may talk: every microphone is off while the round is played. */
  silent?: boolean;
  /** The players take turns asking the room about themselves. */
  turns?: boolean;
  /** One player wears a card and everyone else is the room. */
  one?: boolean;
}
export const MODES: Mode[] = [
  { id: "classic", name: "Who am I?", emoji: "🏷️", rule: "Treat everyone the way you'd treat what's on their card. Never say what a card says." },
  { id: "questions", name: "Yes or no", emoji: "❓", rule: "Take turns asking the room one yes-or-no question about yourself. The room answers yes, no or sort of, and nothing more.", turns: true },
  { id: "silent", name: "Silent room", emoji: "🤫", rule: "No talking: faces and hands only. Everyone's microphone is off until the cards turn over.", silent: true },
  { id: "hotseat", name: "Hot seat", emoji: "🔥", rule: "One player wears a card this round. Everyone else is the room, and plays up to it.", one: true },
  { id: "opposites", name: "Opposite day", emoji: "🙃", rule: "Treat everyone the opposite of the way you'd treat what's on their card." },
  { id: "oneword", name: "One word", emoji: "☝️", rule: "Say only one word at a time. Never the word on a card." },
];
export const modeOf = (id: unknown): Mode | undefined => MODES.find((m) => m.id === id);

export interface Rules {
  /** How many rounds a game is. */
  rounds: number;
  /** How long a round lasts, in seconds. */
  seconds: number;
  /** How many guesses each player gets in a round. */
  guesses: number;
}
export const DEFAULT_RULES: Rules = { rounds: 3, seconds: 180, guesses: 3 };
export const RULE_LIMITS: Record<keyof Rules, [number, number]> = { rounds: [1, 10], seconds: [60, 600], guesses: [1, 5] };
/** Enough to have a room that isn't the wearer, and few enough for every browser to call every other. */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
/** What being buzzed costs. */
export const BUZZ_COST = 1;
const GUESS_LIMIT = 60;

/** Rules from what a page sent: whole numbers inside the limits, or the usual ones. */
export function cleanRules(given: unknown): Rules {
  const g = (given ?? {}) as Record<string, unknown>;
  const rules = { ...DEFAULT_RULES };
  for (const key of Object.keys(RULE_LIMITS) as (keyof Rules)[]) {
    const n = Number(g[key]);
    const [min, max] = RULE_LIMITS[key];
    if (Number.isInteger(n) && n >= min && n <= max) rules[key] = n;
  }
  return rules;
}

export interface Guess {
  text: string;
  right: boolean;
}
export interface Buzz {
  n: number;
  round: number;
  /** The host who pressed it. */
  by: number;
  /** The player who broke the round's rule: said a card out loud, or spoke in a silent room. */
  seat: number;
  /** The player whose card was given away and dealt again, if one was. */
  redealt: number | null;
}

export interface Game {
  rules: Rules;
  /** The seats playing, in the order the host goes round. */
  order: number[];
  /** "picking": the host is choosing this round's game, and nothing is dealt yet. */
  phase: "picking" | "playing" | "reveal" | "over";
  round: number;
  host: number;
  /** This round's game (an id in MODES), once the host has picked it. */
  mode: string | null;
  /** Whose turn it is to ask the room, in a game played in turns. */
  asker: number | null;
  /** How many times each seat has been the one in the hot seat, so it goes round. */
  worn: Record<number, number>;
  /** Each seat's card this round: an index into CARDS. A seat with none is the room. */
  cards: Record<number, number>;
  /** Every card dealt since the game began: none comes round twice. */
  used: number[];
  guesses: Record<number, Guess[]>;
  /** What a seat's right guess was worth this round, once it has made one. */
  won: Record<number, number>;
  scores: Record<number, number>;
  buzzes: Buzz[];
  /** When this round's time is up (ms). */
  endsAt: number;
  rng: number;
}

/** A move that isn't allowed. The message is shown to the player as it is. */
export class ForeheadError extends Error {}

/** A seeded random number in [0, 1), advancing the state's seed (mulberry32). */
function random(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A card nobody has been dealt in this game. Should the pile ever run out, it starts over without the cards on show. */
function draw(game: Game): number {
  let left = CARDS.map((_, i) => i).filter((i) => !game.used.includes(i));
  if (!left.length) {
    const showing = new Set(Object.values(game.cards));
    game.used = [...showing];
    left = CARDS.map((_, i) => i).filter((i) => !showing.has(i));
  }
  const card = left[Math.floor(random(game) * left.length)]!;
  game.used.push(card);
  return card;
}

/** The seats from the one after `seat`, round the table and back to it. */
const after = (game: Game, seat: number) => game.order.map((_, i) => game.order[(game.order.indexOf(seat) + 1 + i) % game.order.length]!);

function deal(game: Game, mode: Mode, now: number) {
  game.cards = {};
  game.guesses = {};
  game.won = {};
  game.mode = mode.id;
  // In the hot seat: whoever has sat in it least, the first of them after the host.
  const fewest = Math.min(...game.order.map((s) => game.worn[s] ?? 0));
  const one = mode.one ? after(game, game.host).find((s) => (game.worn[s] ?? 0) === fewest)! : null;
  if (one !== null) game.worn[one] = (game.worn[one] ?? 0) + 1;
  for (const seat of game.order) {
    if (one === null || seat === one) game.cards[seat] = draw(game);
    game.guesses[seat] = [];
  }
  // The first to ask is the player after the host.
  game.asker = mode.turns ? after(game, game.host)[0]! : null;
  game.phase = "playing";
  game.endsAt = now + game.rules.seconds * 1000;
}

/** A new game for these seats. Nothing is dealt until the host picks the first round's game. */
export function newGame(seats: number[], rules: Rules, seed: number, host = seats[0]!): Game {
  if (seats.length < MIN_PLAYERS) throw new ForeheadError(`It takes ${MIN_PLAYERS} to play: someone has to be the room.`);
  if (seats.length > MAX_PLAYERS) throw new ForeheadError(`No more than ${MAX_PLAYERS} can play.`);
  return { rules, order: [...seats], phase: "picking", round: 1, host: seats.includes(host) ? host : seats[0]!, mode: null, asker: null, worn: {}, cards: {}, used: [], guesses: {}, won: {}, scores: Object.fromEntries(seats.map((s) => [s, 0])), buzzes: [], endsAt: 0, rng: seed | 0 };
}

/** The host picks this round's game from the list, and the cards are dealt. */
export function pick(game: Game, by: number, mode: unknown, now: number) {
  if (by !== game.host) throw new ForeheadError("The host picks the game.");
  if (game.phase !== "picking") throw new ForeheadError("This round's game is already picked.");
  const picked = modeOf(mode);
  if (!picked) throw new ForeheadError("Pick one of the games on the list.");
  deal(game, picked, now);
}

/** A guess as it is compared: no capitals, accents, punctuation, "a" or "the", or plural s. */
export function plainGuess(text: string): string {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !["a", "an", "the", "some"].includes(w));
  return words.map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join(" ");
}
/** Whether a guess names the card. */
export const isRight = (card: Card, text: string): boolean => {
  const guess = plainGuess(text);
  return guess !== "" && [card.name, ...(card.also ?? [])].some((answer) => plainGuess(answer) === guess);
};

const playing = (game: Game, seat: number) => game.order.includes(seat);
/** Whether a seat has a card on this round (in the hot seat, only one does). */
const wearing = (game: Game, seat: number) => game.cards[seat] !== undefined;
const guessesLeft = (game: Game, seat: number) => game.rules.guesses - (game.guesses[seat]?.length ?? 0);
/** Whether a seat has nothing left to do this round: it has no card, guessed right, or is out of guesses. */
const done = (game: Game, seat: number) => !wearing(game, seat) || game.won[seat] !== undefined || guessesLeft(game, seat) <= 0;
/** The turn to ask goes to the next player who still has a card to work out. */
function passOn(game: Game) {
  if (game.asker === null) return;
  game.asker = after(game, game.asker).find((s) => !done(game, s)) ?? null;
}

/** The asker has had their question (or the host moves a slow one along). */
export function pass(game: Game, by: number, now: number) {
  tick(game, now);
  if (game.phase !== "playing" || game.asker === null) throw new ForeheadError("Nobody is taking turns just now.");
  if (by !== game.asker && by !== game.host) throw new ForeheadError("It isn't your turn to pass on.");
  passOn(game);
}

/** The round ends on the clock, whoever is or isn't looking. Returns whether anything changed. */
export function tick(game: Game, now: number): boolean {
  if (game.phase !== "playing" || now < game.endsAt) return false;
  game.phase = "reveal";
  return true;
}

/** A player's guess at their own card. A right one is worth the guesses they had left. */
export function guess(game: Game, seat: number, text: unknown, now: number): { right: boolean } {
  tick(game, now);
  if (!playing(game, seat)) throw new ForeheadError("You aren't in this game.");
  if (game.phase !== "playing") throw new ForeheadError(game.phase === "picking" ? "The cards aren't dealt yet." : "The round is over.");
  if (!wearing(game, seat)) throw new ForeheadError("You aren't wearing a card this round: you're the room.");
  if (game.won[seat] !== undefined) throw new ForeheadError("You've already got it.");
  if (guessesLeft(game, seat) <= 0) throw new ForeheadError("You're out of guesses for this round.");
  const said = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, GUESS_LIMIT);
  if (!plainGuess(said)) throw new ForeheadError("Type who or what you think you are.");
  const right = isRight(CARDS[game.cards[seat]!]!, said);
  if (right) {
    game.won[seat] = guessesLeft(game, seat);
    game.scores[seat] = (game.scores[seat] ?? 0) + game.won[seat]!;
  }
  game.guesses[seat]!.push({ text: said, right });
  if (game.order.every((s) => done(game, s))) game.phase = "reveal";
  // A guess is the asker's turn; and nobody who is done is left holding it.
  else if (game.asker !== null && (seat === game.asker || done(game, game.asker))) passOn(game);
  return { right };
}

/**
 * The host's buzzer, for a player who broke the round's rule: said a card out loud, or talked in
 * a silent room. It costs them a point. If the host says whose card was given away, that player
 * is dealt a new one (unless they had already guessed it).
 */
export function buzz(game: Game, by: number, seat: unknown, spoiled: unknown, now: number): Buzz {
  tick(game, now);
  if (by !== game.host) throw new ForeheadError("Only the host has the buzzer.");
  if (game.phase !== "playing") throw new ForeheadError("The buzzer is for while a round is being played.");
  if (typeof seat !== "number" || !playing(game, seat)) throw new ForeheadError("Buzz one of the players.");
  if (seat === by) throw new ForeheadError("You can't buzz yourself.");
  let redealt: number | null = null;
  if (spoiled !== undefined && spoiled !== null) {
    if (typeof spoiled !== "number" || !wearing(game, spoiled)) throw new ForeheadError("That player isn't wearing a card.");
    if (spoiled === seat) throw new ForeheadError("Nobody can give away their own card: they can't see it.");
    if (game.won[spoiled] === undefined) {
      game.cards[spoiled] = draw(game);
      redealt = spoiled;
    }
  }
  game.scores[seat] = (game.scores[seat] ?? 0) - BUZZ_COST;
  const entry: Buzz = { n: (game.buzzes[game.buzzes.length - 1]?.n ?? 0) + 1, round: game.round, by, seat, redealt };
  game.buzzes.push(entry);
  return entry;
}

/** The host turns the cards over before the time is up. */
export function reveal(game: Game, by: number, now: number) {
  tick(game, now);
  if (by !== game.host) throw new ForeheadError("Only the host can end the round.");
  if (game.phase !== "playing") throw new ForeheadError(game.phase === "picking" ? "The cards aren't dealt yet." : "The cards are already turned over.");
  game.phase = "reveal";
}

/** Who hosts after this seat: the next in the order, skipping anyone `away`. */
export function hostAfter(game: Game, seat: number, away: (seat: number) => boolean = () => false): number {
  const at = game.order.indexOf(seat);
  for (let step = 1; step <= game.order.length; step++) {
    const next = game.order[(at + step) % game.order.length]!;
    if (!away(next)) return next;
  }
  return seat;
}

/** On to the next round, with the next host, who picks its game; or, after the last round, the end. */
export function next(game: Game, by: number, away?: (seat: number) => boolean) {
  if (by !== game.host) throw new ForeheadError("Only the host can move the game on.");
  if (game.phase !== "reveal") throw new ForeheadError(game.phase === "over" ? "The game is over." : "This round isn't over yet.");
  if (game.round >= game.rules.rounds) {
    game.phase = "over";
    return;
  }
  game.round++;
  game.host = hostAfter(game, game.host, away);
  game.phase = "picking";
  game.mode = null;
  game.asker = null;
  game.cards = {};
  game.guesses = {};
  game.won = {};
}

/** The buzzer and the game pass to someone else (the host has dropped off the call). */
export function passHost(game: Game, to: number) {
  if (playing(game, to)) game.host = to;
}

export interface SeatView {
  seat: number;
  score: number;
  /** Whether they have a card on this round. */
  wearing: boolean;
  /** What the card says: null on your own forehead until you guess it or the cards are turned over. */
  card: string | null;
  /** The kind of card, as a hint. Yours is the only thing you're told about your own. */
  hint: string;
  /** Whether they've guessed theirs this round, and what it was worth. */
  won: number | null;
  guessesLeft: number;
  guesses: Guess[];
}
export interface GameView {
  phase: Game["phase"];
  round: number;
  rounds: number;
  host: number;
  /** This round's game, once it is picked. */
  mode: Mode | null;
  /** The games the host picks from. */
  modes: Mode[];
  /** Whose turn it is to ask, in a game played in turns. */
  asker: number | null;
  /** Whether every microphone is off just now (a silent room, while it is played). */
  silent: boolean;
  you: number | null;
  endsAt: number;
  players: SeatView[];
  /** The latest buzzes, oldest first. */
  buzzes: Buzz[];
  /** The seats ahead when the game is over (more than one for a tie). */
  winners: number[];
}

/**
 * The game as one seat sees it. Everyone else's card, never their own while it can still be
 * guessed. `seat` null is somebody looking on who isn't playing: they see no cards at all until
 * the round is over, since a watcher may be sitting beside a player.
 */
export function view(game: Game, seat: number | null): GameView {
  const open = game.phase !== "playing";
  const mode = modeOf(game.mode) ?? null;
  const top = Math.max(...game.order.map((s) => game.scores[s] ?? 0));
  return {
    phase: game.phase,
    round: game.round,
    rounds: game.rules.rounds,
    host: game.host,
    mode,
    modes: MODES,
    asker: game.phase === "playing" ? game.asker : null,
    silent: game.phase === "playing" && !!mode?.silent,
    you: seat !== null && playing(game, seat) ? seat : null,
    endsAt: game.endsAt,
    players: game.order.map((s) => {
      const card = wearing(game, s) ? CARDS[game.cards[s]!]! : null;
      const shown = open || (seat !== null && playing(game, seat) && (s !== seat || game.won[s] !== undefined));
      return { seat: s, score: game.scores[s] ?? 0, wearing: !!card, card: card && shown ? card.name : null, hint: card ? CATEGORY_HINT[card.category] : "", won: game.won[s] ?? null, guessesLeft: card ? Math.max(0, guessesLeft(game, s)) : 0, guesses: game.guesses[s] ?? [] };
    }),
    buzzes: game.buzzes.slice(-20),
    winners: game.phase === "over" ? game.order.filter((s) => (game.scores[s] ?? 0) === top) : [],
  };
}
