// What is on Peekaboo's board, and how it changes. Every change is an event; both ends of a call
// apply the same events in the same way, so their boards stay alike. `apply` also says what should
// be heard for each event, and the screen plays it (only on the device with the baby, in a call:
// the other parent hears it through the call).
import { thatsThe, whereIs, type Mode, type Person, type Settings, type Thing } from "./things";

export type BoardEvent =
  /** A picture pops up where a finger touched (x and y are fractions of the board). */
  | { t: "pop"; id: string; x: number; y: number; key: number }
  /** Peekaboo: a new picture goes under the blanket. */
  | { t: "hide"; id: string }
  /** Peekaboo: the blanket comes off. */
  | { t: "peek" }
  /** Where's the…?: a new question. */
  | { t: "ask"; target: string; choices: string[] }
  /** Where's the…?: a picture was tapped. */
  | { t: "pick"; id: string }
  /** Where's the…?: tapped somewhere else; ask again. */
  | { t: "again" }
  /** The grown-ups changed what is played. */
  | { t: "settings"; settings: Settings }
  /** The family, from the device with the baby. */
  | { t: "family"; family: Person[] }
  /** In a call: the other parent hides behind a blanket, then "Peekaboo!". */
  | { t: "face" };

export interface Popped {
  id: string;
  x: number;
  y: number;
  key: number;
}

export interface BoardState {
  mode: Mode;
  popped: Popped[];
  hidden: { id: string; open: boolean } | null;
  round: { target: string; choices: string[]; misses: number; found: boolean; wrong: string | null } | null;
}

export interface Heard {
  text: string;
  /** The picture whose recording, if there is one, says it instead. */
  key?: string;
  sound?: "pop" | "cheer" | "boop" | "swish";
}

export const MAX_POPPED = 4;
export const emptyBoard = (mode: Mode): BoardState => ({ mode, popped: [], hidden: null, round: null });

export function apply(state: BoardState, event: BoardEvent, thing: (id: string) => Thing | undefined, settings: Settings): { state: BoardState; heard: Heard | null } {
  const spoken = (th: Thing): Heard => ({ text: settings.sounds ? th.say : `${th.word}!`, key: th.id });
  switch (event.t) {
    case "pop": {
      const th = thing(event.id);
      if (!th) return { state, heard: null };
      const popped = [...state.popped, { id: event.id, x: event.x, y: event.y, key: event.key }].slice(-MAX_POPPED);
      return { state: { ...state, popped }, heard: { ...spoken(th), sound: "pop" } };
    }
    case "hide":
      return thing(event.id) ? { state: { ...state, hidden: { id: event.id, open: false } }, heard: null } : { state, heard: null };
    case "peek": {
      if (!state.hidden || state.hidden.open) return { state, heard: null };
      const th = thing(state.hidden.id);
      return { state: { ...state, hidden: { ...state.hidden, open: true } }, heard: th ? { text: `Peekaboo! ${spoken(th).text}`, key: th.id, sound: "swish" } : null };
    }
    case "ask": {
      const th = thing(event.target);
      if (!th || !event.choices.includes(event.target) || event.choices.some((id) => !thing(id))) return { state, heard: null };
      return { state: { ...state, round: { target: event.target, choices: event.choices, misses: 0, found: false, wrong: null } }, heard: { text: whereIs(th) } };
    }
    case "again": {
      const round = state.round;
      const th = round && !round.found ? thing(round.target) : undefined;
      return { state, heard: th ? { text: whereIs(th) } : null };
    }
    case "pick": {
      const round = state.round;
      if (!round || round.found || !round.choices.includes(event.id)) return { state, heard: null };
      const target = thing(round.target);
      const picked = thing(event.id);
      if (!target || !picked) return { state, heard: null };
      if (event.id === round.target) {
        return { state: { ...state, round: { ...round, found: true, wrong: null } }, heard: { text: `Yay! ${spoken(target).text}`, key: target.id, sound: "cheer" } };
      }
      // Not it: name what was tapped (that's learning too), and ask again. No buzzer.
      return { state: { ...state, round: { ...round, misses: round.misses + 1, wrong: event.id } }, heard: { text: `${thatsThe(picked)} ${whereIs(target)}`, sound: "boop" } };
    }
    case "settings":
      return { state: event.settings.mode === state.mode ? state : emptyBoard(event.settings.mode), heard: null };
    case "family":
      return { state, heard: null };
    case "face":
      return { state, heard: { text: "Peekaboo!", sound: "swish" } };
  }
}

/** Whether a picture in a "Where's the…?" round should glow, as a hint, after two tries that weren't it. */
export const hint = (state: BoardState) => !!state.round && !state.round.found && state.round.misses >= 2;
