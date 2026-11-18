// A game controller, read once a frame: the left stick moves, the right stick turns, and the
// buttons are the ones a shooter usually has. In a menu the d-pad steps, A chooses and B goes back.
import { screenOf } from "./engine.ts";
import { KEY } from "./keys.ts";

export interface GamepadTarget {
  key(pressed: boolean, key: number): void;
  state(): number;
}

/** Stick movement smaller than this is the stick resting. */
const DEAD = 0.18;
/** The right stick held over turns as fast as the keyboard does when running. */
const TURN = 1280;

const axis = (value: number | undefined) => (value === undefined || Math.abs(value) < DEAD ? 0 : (value - Math.sign(value) * DEAD) / (1 - DEAD));

/** Button numbers of the "standard" controller layout, and the key each is while playing and in a menu. */
const BUTTONS: [button: number, playing: number, menu: number][] = [
  [0, KEY.use, KEY.enter], // A
  [1, KEY.use, KEY.backspace], // B
  [2, KEY.fire, KEY.enter], // X
  [7, KEY.fire, KEY.enter], // right trigger
  [4, KEY.previousWeapon, 0], // left bumper
  [5, KEY.nextWeapon, 0], // right bumper
  [8, KEY.tab, 0], // back / select
  [9, KEY.escape, KEY.escape], // start
  [12, KEY.up, KEY.up],
  [13, KEY.down, KEY.down],
  [14, KEY.left, KEY.left],
  [15, KEY.right, KEY.right],
];

export function createGamepad(target: GamepadTarget) {
  /** The key each held button sent down, so the same one is sent up whatever the screen is by then. */
  const down = new Map<number, number>();
  return {
    /** Sends the buttons' keys and returns what the sticks ask for. */
    poll(): { forward: number; side: number; turn: number } {
      const pad = navigator.getGamepads?.().find((candidate) => candidate && candidate.mapping === "standard");
      if (!pad) return { forward: 0, side: 0, turn: 0 };
      const screen = screenOf(target.state());
      const playing = screen === "level";
      for (const [button, play, menu] of BUTTONS) {
        const pressed = pad.buttons[button]?.pressed ?? false;
        const sent = down.get(button);
        if (pressed && sent === undefined) {
          // A question wants a letter: A is yes, B is no.
          const key = screen === "question" && button <= 1 ? (button === 0 ? KEY.yes : "n".charCodeAt(0)) : playing ? play : menu;
          if (!key) continue;
          down.set(button, key);
          target.key(true, key);
        } else if (!pressed && sent !== undefined) {
          down.delete(button);
          target.key(false, sent);
        }
      }
      if (!playing) return { forward: 0, side: 0, turn: 0 };
      return {
        forward: Math.round(-axis(pad.axes[1]) * 50),
        side: Math.round(axis(pad.axes[0]) * 40),
        // The engine's angle grows to the left.
        turn: Math.round(-axis(pad.axes[2]) * TURN),
      };
    },
  };
}
