// A game flown live at a table (Shitstorm), as one page plays it.
//
// The server plays the one real game and tells every page what each seat's controls did on each
// tick. A page that only ever drew that would see its own ship answer a network round trip late.
// So what is drawn is the server's game played a little further on, to the tick the server will
// be on by the time it hears what this page's controls are doing now: this page's own controls
// are played ahead of the server saying so, and everyone else's are held as last heard.
//
// Two things keep that from being jumpy. The trip is timed in ticks, and the lead is the middle one
// of the last few trips, so one slow message does not move it. And the ship that is drawn only ever moves the way it is being steered,
// no further than steering moves it; whatever it is out by, because a guess was a tick or two off,
// is worked off a little each frame instead of all at once.
//
// Nothing here draws, reads a clock or touches a socket: it is told what arrived and how long it
// has been, and gives back the game to draw.
import type { ArcadeGame } from "@journey-to-code/games";

/** The seats whose controls changed on one tick, and what they changed to. */
export type Frame = [seat: number, input: unknown][];

/** The most ticks the page plays ahead: a third of a second. Past that the ship simply lags by the rest. */
export const LONGEST_LEAD = 20;

export function createPredictor(game: ArcadeGame<any, any, any>, seat: number | null) {
  const flying = seat !== null;
  const me = seat ?? 0;
  let real: unknown = null;
  let realTick = 0;
  /** What every seat's controls are doing, as the server last said. */
  let flown: unknown[] = [];
  let waiting: Frame[] = [];
  let lead = 0;
  /** How many ticks my last few changes of the controls took to come back. */
  let trips: number[] = [];
  /** My controls as sent and not yet heard back, and all of them lately, each with the tick this page was on. */
  let unheard: { text: string; tick: number }[] = [];
  let mine: { input: unknown; tick: number }[] = [];
  let lastSent = "";
  /** Where my ship is drawn, and where the game last had it. */
  let drawn: { x: number; y: number; rawX: number; rawY: number } | null = null;
  let heard: unknown[] = [];

  /** One axis of the drawn ship: it `was` there, the game moved it from `before` to `now`, and I am steering `intent` a tick. */
  const eased = (was: number, before: number, now: number, intent: number, far: number) => {
    const moved = now - before;
    // With the steering, and no further than it goes; never against it.
    const step = intent > 0 ? Math.max(0, Math.min(moved, intent * 2)) : intent < 0 ? Math.min(0, Math.max(moved, intent * 2)) : 0;
    const next = was + step;
    const out = now - next;
    if (Math.abs(out) > far) return now;
    // Worked off a little a frame; while I am steering, never by so much that the ship goes back the way it came.
    let fix = out * 0.18;
    if (intent && Math.sign(fix) !== Math.sign(intent)) fix = Math.sign(fix) * Math.min(Math.abs(fix), Math.abs(step) * 0.6);
    return next + fix;
  };

  return {
    /** The game as the server sent it whole: on joining, and again after a reconnection. */
    reset(snap: unknown, tick: number, inputs: unknown[]) {
      real = snap;
      realTick = tick;
      flown = inputs.slice();
      waiting = [];
      unheard = [];
      mine = [];
      lastSent = "";
      drawn = null;
    },
    /** Ticks the server has told of. */
    told(frames: Frame[]) {
      waiting.push(...frames);
    },
    /**
     * One frame of the page. `input` is what this page's controls are doing now. Gives the game to
     * draw, the text to send the server if the controls changed (else null), and the events of the
     * server's own ticks played this frame (for sounds).
     */
    frame(input: unknown): { state: unknown; send: string | null; events: unknown[]; played: number } {
      let send: string | null = null;
      const text = JSON.stringify(input);
      if (flying && text !== lastSent) {
        lastSent = text;
        send = text;
        unheard.push({ text, tick: realTick });
        mine.push({ input, tick: realTick });
        if (mine.length > 240) mine = mine.slice(-120);
      }
      // The server's game: a tick a frame, and faster when this page has fallen behind.
      let n = waiting.length > 20 ? waiting.length - 2 : waiting.length > 4 ? 2 : Math.min(1, waiting.length);
      const played = n;
      heard = [];
      while (n-- > 0) {
        for (const [who, said] of waiting.shift()!) {
          flown[who] = said;
          if (who !== me || !flying) continue;
          // My own controls, heard back: how many ticks that took is how far ahead to play them.
          const back = JSON.stringify(said);
          const at = unheard.findIndex((u) => u.text === back);
          if (at < 0) continue;
          const took = realTick - unheard[at]!.tick;
          unheard = unheard.slice(at + 1);
          // The middle one of the last few trips: right within a few presses on a steady line, and
          // not thrown by one slow message on a wandering one.
          trips.push(took);
          if (trips.length > 7) trips.shift();
          const middle = [...trips].sort((a, b) => a - b)[Math.floor(trips.length / 2)]!;
          lead = Math.max(0, Math.min(LONGEST_LEAD, middle));
        }
        game.step(real, flown);
        realTick++;
        heard.push(...game.view(real).events);
      }
      if (!flying || !lead || game.view(real).over) {
        drawn = null;
        return { state: real, send, events: heard, played };
      }
      const ahead = structuredClone(real);
      const inputs = flown.slice();
      let from = 0;
      for (let i = 0; i < lead; i++) {
        // The controls the server will have from me on that tick: the ones I sent `lead` ticks before it.
        const when = realTick + i - lead;
        while (from < mine.length && mine[from]!.tick <= when) from++;
        if (from > 0) inputs[me] = mine[from - 1]!.input;
        game.step(ahead, inputs);
      }
      // Shitstorm keeps each ship as pilots[seat] with an x and a y, and its controls as dx and dy a tick.
      const ship = (ahead as { pilots?: { x: number; y: number }[] }).pilots?.[me];
      const steer = input as { dx?: number; dy?: number };
      if (ship && typeof ship.x === "number" && typeof steer.dx === "number" && typeof steer.dy === "number") {
        const far = game.view(ahead).field.width * 0.12;
        if (!drawn) drawn = { x: ship.x, y: ship.y, rawX: ship.x, rawY: ship.y };
        drawn = { x: eased(drawn.x, drawn.rawX, ship.x, steer.dx, far), y: eased(drawn.y, drawn.rawY, ship.y, steer.dy, far), rawX: ship.x, rawY: ship.y };
        ship.x = Math.round(drawn.x);
        ship.y = Math.round(drawn.y);
      }
      return { state: ahead, send, events: heard, played };
    },
    /** The server's own game, as far as this page has been told. */
    get real() {
      return real;
    },
    get tick() {
      return realTick;
    },
    get lead() {
      return lead;
    },
    /** Ticks told of and not yet played. */
    get behind() {
      return waiting.length;
    },
  };
}
