// The strip in three dimensions. This file is small: it is what Strip imports. The three.js half
// (strip3d-gl.ts) is only fetched, by `loadStrip3d`, once a race is on screen, and only where WebGL
// works. Anywhere else Strip keeps drawing the road as it always has, flat on a 2D canvas, and that
// canvas is still what the gauges and the start lights are drawn on, over this one.
import type { ArcadeRace } from "@journey-to-code/games";

/** Everything one frame of the scene needs. */
export interface Frame3d {
  race: ArcadeRace;
  /** Each lane's car, by its model's key, and its colour. */
  cars: string[];
  tones: string[];
  width: number;
  height: number;
  dpr: number;
  /** ms, for what moves by itself. */
  time: number;
  /** The person has asked for less motion: no smoke, no shake. */
  still: boolean;
  /** From behind the car, or from the driver's seat. */
  seat: "chase" | "cockpit";
}

export interface Strip3d {
  /** Draw the frame. Returns false when it could not be drawn (the caller draws it flat). */
  render(frame: Frame3d): boolean;
  dispose(): void;
}

function hasWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return !!(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The scene on this canvas, or null where it cannot be had. */
export async function loadStrip3d(canvas: HTMLCanvasElement): Promise<Strip3d | null> {
  if (!hasWebGL()) return null;
  try {
    const { makeStrip3d } = await import("./strip3d-gl");
    return makeStrip3d(canvas);
  } catch {
    return null;
  }
}
