// Hosting a table on this wifi, with no framework: the guests who have joined, the seat on offer to
// the next one (a code to show, and what to do with the code shown back), and the game starting.
// The screen before the game is Solid (solid/wifi/HostSteps.tsx); the game itself is the React
// table (kit/LocalKit.tsx). WifiHost.tsx puts the two together.
import { personName } from "../kit/sameDevice";
import { canLink, offerSeat, type PeerLink } from "./link";
import { codeIn } from "./signal";

export interface Guest {
  name: string;
  link: PeerLink;
}

type Seat = Awaited<ReturnType<typeof offerSeat>>;

export interface HostState {
  /** The people at this device, by name, the host first. Guests take the seats after them. */
  here: string[];
  seats: number;
  guests: Guest[];
  /** The seat on offer, once it's ready: its code. */
  code: string | null;
  busy: boolean;
  problem: string | null;
  playing: boolean;
}

export interface Hosting {
  get(): HostState;
  /** Told of every change; returns what stops it. */
  subscribe(changed: () => void): () => void;
  /** Their code, scanned or typed: the channel opens, and they say who they are. Whether it worked. */
  accept(text: string): Promise<boolean>;
  start(): void;
  /** Let everyone go: leaving the screen, however it happens. */
  close(): void;
}

export const isFull = (state: HostState) => state.guests.length >= state.seats - state.here.length;

export function createHosting(here: string[], seats: number): Hosting {
  let state: HostState = { here, seats, guests: [], code: null, busy: false, problem: canLink() ? null : "This browser can't connect to other devices directly.", playing: false };
  let seat: Seat | null = null;
  let offering = false;
  let closed = false;
  const listeners = new Set<() => void>();
  const set = (change: Partial<HostState>) => {
    state = { ...state, ...change };
    for (const changed of listeners) changed();
    offer();
  };

  /** One seat on offer at a time, until the table is full or the game starts. */
  function offer() {
    if (closed || offering || seat || state.playing || isFull(state) || !canLink()) return;
    offering = true;
    offerSeat().then(
      (made) => {
        offering = false;
        if (closed || state.playing) return made.cancel();
        seat = made;
        set({ code: made.code });
      },
      () => {
        offering = false;
        set({ problem: "Couldn't get a seat ready. Is this device on the wifi?" });
      },
    );
  }

  const hosting: Hosting = {
    get: () => state,
    subscribe(changed) {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    async accept(text) {
      if (!seat || state.busy) return false;
      const offered = seat;
      set({ busy: true, problem: null });
      try {
        const link = await offered.answered(codeIn(text));
        const said = await new Promise<string>((done) => {
          const timer = setTimeout(() => done(""), 3000);
          const stop = link.listen((message) => {
            if (message.t !== "hello") return;
            clearTimeout(timer);
            stop();
            done(String(message.name ?? ""));
          });
        });
        const guests = [...state.guests, { name: personName(said, state.guests.length + state.here.length), link }];
        // Before the game, a guest who goes is taken off the list; during it, the table keeps their seat.
        link.closed(() => !state.playing && set({ guests: state.guests.filter((g) => g.link !== link) }));
        for (const guest of guests) guest.link.send({ t: "seated", names: [...state.here, ...guests.map((g) => g.name)] });
        seat = null;
        set({ guests, code: null, busy: false });
        return true;
      } catch (e) {
        // A seat that failed to connect can't be offered twice: make a fresh one.
        const fresh = e instanceof Error && !/isn't a code|isn't on a network/.test(e.message);
        if (fresh) {
          offered.cancel();
          seat = null;
        }
        set({ busy: false, problem: e instanceof Error ? e.message : "That didn't work. Try the code again.", ...(fresh ? { code: null } : {}) });
        return false;
      }
    },
    start() {
      seat?.cancel();
      seat = null;
      set({ playing: true, code: null });
    },
    close() {
      closed = true;
      seat?.cancel();
      for (const guest of state.guests) guest.link.close();
    },
  };
  offer();
  return hosting;
}
