// The mountain road in three dimensions. Like strip3d.ts, this is the small half: the three.js one
// (road3d-gl.ts) is fetched by `loadRoad3d` once a run is on screen, and only where WebGL works.
// Anywhere else Road draws the road flat, from above.
import type { ArcadeRoad } from "@journey-to-code/games";

export interface RoadFrame3d {
  road: ArcadeRoad;
  /** Each driver's car, by its model's key, and its colour. */
  cars: string[];
  tones: string[];
  width: number;
  height: number;
  dpr: number;
  time: number;
  still: boolean;
  seat: "chase" | "cockpit";
  /** How far the wheel is turned, -1 to 1. */
  steer: number;
  /** A hit just now, fading from 1 to 0: it shakes the camera. */
  jolt: number;
}

export interface Road3d {
  render(frame: RoadFrame3d): boolean;
  dispose(): void;
}

export async function loadRoad3d(canvas: HTMLCanvasElement): Promise<Road3d | null> {
  try {
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") ?? probe.getContext("webgl"))) return null;
    const { makeRoad3d } = await import("./road3d-gl");
    return makeRoad3d(canvas);
  } catch {
    return null;
  }
}
