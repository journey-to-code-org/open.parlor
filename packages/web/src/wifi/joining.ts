// Joining a table on this wifi, with no framework: the steps from the host's code to a seat, the
// channel to the host, and the moves sent over it. The steps are Solid (solid/wifi/JoinSteps.tsx);
// the game itself is the React table (kit/GameTable.tsx). WifiJoin.tsx puts the two together.
import type { BoardView, KitView, SportView } from "@journey-to-code/games";
import { loadName, saveName } from "../storage";
import { canLink, takeSeat, type PeerLink } from "./link";
import { codeIn } from "./signal";

export type JoinStep =
  | { at: "scan" }
  | { at: "answer"; code: string }
  | { at: "seated"; names: string[] }
  | { at: "playing"; view: KitView | BoardView | SportView; names: string[]; since: number }
  | { at: "gone" };

export interface JoinState {
  step: JoinStep;
  problem: string | null;
  /** Who to be at the table: asked while the host is scanning, and said the moment the channel opens. */
  name: string;
}

export interface Joining {
  get(): JoinState;
  subscribe(changed: () => void): () => void;
  /** The host's code, from the address, the camera or the box. Whether it was one. */
  join(text: string): Promise<boolean>;
  setName(name: string): void;
  /** A move, sent to the host; their answer (a refusal, in words, or null). */
  act(move: Record<string, unknown>): Promise<string | null>;
  /** After the table closed: back to scanning for the host's new code. */
  again(): void;
  close(): void;
}

/** The offer in the address, if this screen was opened from a host's QR code. */
export const offerInUrl = () => (location.hash.length > 1 ? codeIn(location.hash) : "");

export function createJoining(): Joining {
  let state: JoinState = { step: { at: "scan" }, problem: canLink() ? null : "This browser can't connect to other devices directly.", name: loadName() };
  let link: PeerLink | null = null;
  let seat: { cancel(): void } | null = null;
  const waiting = new Map<number, (error: string | null) => void>();
  let nextId = 1;
  const listeners = new Set<() => void>();
  const set = (change: Partial<JoinState>) => {
    state = { ...state, ...change };
    for (const changed of listeners) changed();
  };

  return {
    get: () => state,
    subscribe(changed) {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    setName: (name) => set({ name }),
    async join(text) {
      set({ problem: null });
      try {
        const taken = await takeSeat(codeIn(text));
        seat = taken;
        set({ step: { at: "answer", code: taken.code } });
        taken.joined.then(
          (joined) => {
            link = joined;
            saveName(state.name);
            joined.send({ t: "hello", name: state.name.trim() });
            if (state.step.at === "answer") set({ step: { at: "seated", names: [] } });
            joined.listen((message) => {
              if (message.t === "seated") {
                if (state.step.at !== "playing") set({ step: { at: "seated", names: message.names } });
              } else if (message.t === "view") set({ step: { at: "playing", view: message.view as KitView, names: message.names, since: Date.now() } });
              else if (message.t === "ack") {
                waiting.get(message.id)?.(message.error);
                waiting.delete(message.id);
              }
            });
            joined.closed(() => {
              for (const answer of waiting.values()) answer("The host has gone.");
              waiting.clear();
              set({ step: { at: "gone" } });
            });
          },
          (e) => set({ problem: e instanceof Error ? e.message : "Couldn't connect.", step: { at: "scan" } }),
        );
        return true;
      } catch (e) {
        set({ problem: e instanceof Error ? e.message : "That code didn't work." });
        return false;
      }
    },
    act(move) {
      const joined = link;
      if (!joined?.open) return Promise.resolve("The host has gone.");
      const id = nextId++;
      return new Promise<string | null>((done) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          done("The host didn't answer. Try again.");
        }, 10_000);
        waiting.set(id, (error) => {
          clearTimeout(timer);
          done(error);
        });
        joined.send({ t: "move", id, move });
      });
    },
    again() {
      link = null;
      seat = null;
      set({ problem: null, step: { at: "scan" } });
    },
    close() {
      link?.close();
      seat?.cancel();
    },
  };
}
