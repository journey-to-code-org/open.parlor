// Narration comes with seats as {0}, {1}…; this puts names in, and turns "{0} sinks" into
// "You sink" when the seat is yours.

/** After "You", the verb agrees: "You win", not "You wins". */
const YOU_VERBS: Record<string, string> = {
  wins: "win",
  takes: "take",
  has: "have",
  is: "are",
  gets: "get",
  pegs: "peg",
  leads: "lead",
  bids: "bid",
  loses: "lose",
  flips: "flip",
  draws: "draw",
  melds: "meld",
  discards: "discard",
  throws: "throw",
  puts: "put",
  keeps: "keep",
  gives: "give",
  swaps: "swap",
  checks: "check",
  calls: "call",
  raises: "raise",
  bets: "bet",
  folds: "fold",
  stands: "stand",
  plays: "play",
  passes: "pass",
  goes: "go",
  makes: "make",
  picks: "pick",
  drinks: "drink",
  says: "say",
  was: "were",
  fires: "fire",
  sinks: "sink",
  shoots: "shoot",
  putts: "putt",
  holes: "hole",
  finds: "find",
  runs: "run",
  offers: "offer",
  asks: "ask",
  turns: "turn",
  lets: "let",
  resigns: "resign",
  moves: "move",
  jumps: "jump",
  rolls: "roll",
  scores: "score",
  scratches: "scratch",
  names: "name",
  starts: "start",
  hunts: "hunt",
  pockets: "pocket",
  covers: "cover",
  // "doesn't": a word stops at the apostrophe, so this turns "doesn" into "don" and the "'t" follows.
  doesn: "don",
  bowls: "bowl",
  knocks: "knock",
  misses: "miss",
};

/** Engines name seats as {0}, {1}…: put the players' names in. */
export const named = (text: string, names: string[]) =>
  youAnd(text.replace(
    /\{(\d+)\}('s)?( (\w+))?/g,
    (
      _,
      n: string,
      owns: string | undefined,
      gap: string | undefined,
      word: string | undefined,
      at: number,
    ) => {
      const name = names[Number(n)] ?? `Seat ${Number(n) + 1}`;
      const rest = gap ?? "";
      // "You" mid-sentence reads as "you" ("two cards to you"), and "You's" as "Your" ("your crib").
      const before = text.slice(0, at).trimEnd();
      const start = !before || /[.!?:]$/.test(before);
      if (name !== "You") return `${owns ? `${name}'s` : name}${rest}`;
      if (owns) return `${start ? "Your" : "your"}${rest}`;
      const verb = word && YOU_VERBS[word] ? ` ${YOU_VERBS[word]}` : rest;
      return `${start ? "You" : "you"}${verb}`;
    },
  ));

/** The second verb of a sentence about you: "You sink the 3 and shoot again", not "and shoots". */
const youAnd = (text: string) =>
  text.replace(/(^|[.!?:]\s+)(You [^.!?:]*?)(?=[.!?:]|$)/g, (_, lead: string, sentence: string) =>
    lead + sentence.replace(/ and (\w+)/g, (all, verb: string) => (YOU_VERBS[verb] ? ` and ${YOU_VERBS[verb]}` : all)),
  );
