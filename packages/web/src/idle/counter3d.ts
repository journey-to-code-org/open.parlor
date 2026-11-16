// The counter at Delbie's, in three dimensions. This file is small: it is what the idle screen
// imports. The three.js half (counter3d-gl.ts) is only fetched, by `loadCounter3d`, once the game
// is on screen, and only where WebGL works; anywhere else the big button keeps the face it had.
//
// The scene is only a picture of what the numbers under it already say: how long the line is, who
// has been taken on, whether Delbie is in. Nothing in it is pressed; it is drawn inside the button
// that has always been the thing to press.

/** What the scene shows, taken from the game's view: nothing here is the game's to decide. */
export interface CounterLook {
  /** Counter chaos and how wound up Delbie is, 0 to 1. */
  chaos: number;
  stress: number;
  /** Living that dream. */
  dream: boolean;
  /** Delbie has the afternoon off. */
  away: boolean;
  /** The books are full. */
  panic: boolean;
  /** How full the back room is, 0 to 1. */
  clutter: number;
  /** A customer is asking for something on account, or Ears is on the radio. */
  asking: boolean;
  radio: boolean;
  /**
   * Who is on the counter just now, by their id in the game (anybody who has stepped away isn't),
   * and which place along it is theirs: 0 at the far left, as the floor plan has them seated.
   */
  counter: { who: string; seat: number }[];
  /** How many trucks are in the yard: a driver taken on and not out on a run. */
  trucks: number;
  /** Somebody is at the billing desk. */
  desk: boolean;
  /** Seconds until the wages are due. */
  payroll: number;
  /** How many times the store has moved, and what the newest building brought with it. */
  moves: number;
  department: string | null;
  /** The inspector: a minute out (the car is in the yard), on the floor with the clipboard, or nowhere about. */
  inspector: "coming" | "here" | null;
  /** A clean sheet, still fresh: the sticker is up on the front of the counter. */
  sticker: boolean;
  /** The time of day where the player is, in minutes since midnight: it is dark out after closing. */
  minute: number;
}

export interface Counter3d {
  /** Draw the frame (`time` in ms). Returns false when it can't be drawn here. */
  render(look: CounterLook, time: number, width: number, height: number, dpr: number, still: boolean): boolean;
  /** A sale rung up: the drawer goes and Delbie's hand comes down. */
  ring(): void;
  dispose(): void;
}

let loading: Promise<typeof import("./counter3d-gl") | null> | null = null;

/** The scene on `canvas`, or null where it can't be (no WebGL, or no document at all). */
export function loadCounter3d(canvas: HTMLCanvasElement): Promise<Counter3d | null> {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  loading ??= import("./counter3d-gl").catch(() => null);
  return loading.then((m) => m?.build(canvas) ?? null).catch(() => null);
}
