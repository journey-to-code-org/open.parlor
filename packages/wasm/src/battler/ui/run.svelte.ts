// The page's run: the engine, the commands given so far, and the view Svelte draws. Every command goes
// through `act`, which says why a refused one was refused and does nothing else.
import { Battle, type Command, type Refusal, type View } from "../engine.ts";

const WORDS: Record<Refusal, string> = {
  "not now": "Not now.",
  "no such card": "That card isn't there.",
  "no energy": "Not enough energy.",
  "pick a foe": "Pick who to use it on.",
  "no such foe": "That one's gone.",
  "already done": "Already done.",
  "no such offer": "That isn't on offer.",
  "hand full": "Your hand is full.",
};

export function toast(message: string, variant: "danger" | "info" | "success" = "info") {
  document.dispatchEvent(new CustomEvent("toast", { detail: { message, variant } }));
}

const KEY = "open.parlor.backroom.best";
/** The furthest floor reached (1 to 5, 6 for a win) in this browser. */
export const best = {
  read(): number {
    try {
      return Number(localStorage.getItem(KEY)) || 0;
    } catch {
      return 0;
    }
  },
  write(floor: number) {
    try {
      if (floor > best.read()) localStorage.setItem(KEY, String(floor));
    } catch {
      /* not kept */
    }
  },
};

export function createRun(firstSeed: number) {
  let battle = new Battle(firstSeed);
  let view = $state.raw<View>(battle.view());
  let seed = $state(firstSeed);
  /** The lines of the story so far, newest last. */
  let story = $state.raw<readonly string[]>(battle.view().news);
  let commands: Command[] = [];

  function act(command: Command): boolean {
    const result = battle.command(command);
    if (!result.ok) {
      toast(WORDS[result.why], "danger");
      return false;
    }
    commands.push(command);
    view = battle.view();
    // A move in the hand is not news.
    if (command.t !== "move") story = [...story, ...view.news].slice(-40);
    best.write(view.phase === "won" ? view.floors + 1 : view.floor + 1);
    return true;
  }

  return {
    get view() {
      return view;
    },
    get seed() {
      return seed;
    },
    get story() {
      return story;
    },
    get commands() {
      return commands as readonly Command[];
    },
    act,
    restart(next: number) {
      battle = new Battle(next);
      seed = next;
      commands = [];
      view = battle.view();
      story = view.news;
    },
  };
}

export type Run = ReturnType<typeof createRun>;
