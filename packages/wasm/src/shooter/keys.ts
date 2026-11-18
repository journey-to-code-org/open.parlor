// The engine's key numbers (engine/doomkeys.h), and which of them a keyboard key is.
//
// While a level is being played the keys are a modern layout (W A S D, with the arrows turning);
// with a menu up, letters are sent as themselves, so a saved game can be given a name.

export const KEY = {
  right: 0xae,
  left: 0xac,
  up: 0xad,
  down: 0xaf,
  strafeLeft: 0xa0,
  strafeRight: 0xa1,
  use: 0xa2,
  fire: 0xa3,
  escape: 27,
  enter: 13,
  tab: 9,
  backspace: 0x7f,
  pause: 0xff,
  shift: 0x80 + 0x36,
  alt: 0x80 + 0x38,
  f1: 0x80 + 0x3b,
  f11: 0x80 + 0x57,
  f12: 0x80 + 0x58,
  previousWeapon: "[".charCodeAt(0),
  nextWeapon: "]".charCodeAt(0),
  yes: "y".charCodeAt(0),
} as const;

const ALWAYS: Record<string, number> = {
  ArrowRight: KEY.right,
  ArrowLeft: KEY.left,
  ArrowUp: KEY.up,
  ArrowDown: KEY.down,
  Escape: KEY.escape,
  Enter: KEY.enter,
  NumpadEnter: KEY.enter,
  Tab: KEY.tab,
  Backspace: KEY.backspace,
  Pause: KEY.pause,
  ShiftLeft: KEY.shift,
  ShiftRight: KEY.shift,
  AltLeft: KEY.alt,
  AltRight: KEY.alt,
  ControlLeft: KEY.fire,
  ControlRight: KEY.fire,
  Minus: "-".charCodeAt(0),
  Equal: "=".charCodeAt(0),
  BracketLeft: KEY.previousWeapon,
  BracketRight: KEY.nextWeapon,
};

const PLAYING: Record<string, number> = {
  KeyW: KEY.up,
  KeyS: KEY.down,
  KeyA: KEY.strafeLeft,
  KeyD: KEY.strafeRight,
  KeyE: KEY.use,
  Space: KEY.use,
  KeyQ: KEY.previousWeapon,
  KeyR: KEY.nextWeapon,
};

/** The engine's key for a keyboard event's `code`, or 0 if it has none. */
export function engineKey(code: string, playing: boolean): number {
  const fixed = ALWAYS[code] ?? (playing ? PLAYING[code] : undefined);
  if (fixed !== undefined) return fixed;
  if (code === "Space") return " ".charCodeAt(0);
  // F1 to F10 run on from 0x80 + 0x3b; F11 and F12 sit apart.
  const f = /^F(\d+)$/.exec(code);
  if (f) return Number(f[1]) <= 10 ? KEY.f1 + Number(f[1]) - 1 : Number(f[1]) === 11 ? KEY.f11 : Number(f[1]) === 12 ? KEY.f12 : 0;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!.toLowerCase().charCodeAt(0);
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return digit[1]!.charCodeAt(0);
  return 0;
}
