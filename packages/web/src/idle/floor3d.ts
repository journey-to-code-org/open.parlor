// Delbie's floor plan as a room, in three dimensions. This file is small: it is what the idle
// screen imports. The three.js half (floor3d-gl.ts) is only fetched, by `loadFloor3d`, once the
// floor plan is on screen, and only where WebGL works; anywhere else the plan is the grid of
// labelled squares it has always been.
//
// The squares are still buttons in 3-D, and still what is tapped and read out: they are made
// see-through and laid over the picture with the board camera's transform (board/board3d.ts).
import type { DelbiesPieceId } from "@journey-to-code/games";

/** What the room shows, taken from the game's view. */
export interface FloorLook {
  cols: number;
  rows: number;
  pieces: { id: DelbiesPieceId; square: number; fixed: boolean; empty: boolean }[];
  /** The piece that has been picked up, waiting to be put down. */
  holding: DelbiesPieceId | null;
  /** Rules in effect: the two squares each joins, and whether it helps. */
  links: { a: number; b: number; good: boolean }[];
  /** How many drivers have been taken on: they sit on the bench. */
  drivers: number;
  /** A number for whoever sits at each piece, always the same for the same person. */
  who: Partial<Record<DelbiesPieceId, number>>;
}

export interface Floor3d {
  /** Draw the frame (`time` in ms; `board` is the grid's width on the page). False when it can't be drawn here. */
  render(look: FloorLook, time: number, width: number, height: number, board: number, dpr: number, still: boolean): boolean;
  dispose(): void;
}

let loading: Promise<typeof import("./floor3d-gl") | null> | null = null;

export function loadFloor3d(canvas: HTMLCanvasElement): Promise<Floor3d | null> {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  loading ??= import("./floor3d-gl").catch(() => null);
  return loading.then((m) => m?.build(canvas) ?? null).catch(() => null);
}
