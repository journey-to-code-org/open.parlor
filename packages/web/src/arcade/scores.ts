// A house's best runs at an arcade game: fetched for the setup screen, and added to when a run ends.
// The house plays every run again itself before keeping it, so what is sent is the run, not a score.
import { arcadeGame, type ArcadeGameId, type ArcadeLog } from "@journey-to-code/games";
import type { ArcadeRules } from "../storage";

export interface HouseRun {
  name: string;
  me: boolean;
  score: number;
  /** The rules and crew it was played with: runs are only compared within one. */
  board: string;
  rules: ArcadeRules;
  seats: number;
  seed: number;
  stage: string;
  ticks: number;
  at: number;
}

/** The board a game with these rules and this crew is on: the same text the house works out. */
export const boardOf = (game: ArcadeGameId, rules: ArcadeRules, seats: number) => `${seats}:${JSON.stringify(arcadeGame(game)!.normalize(rules))}`;

export async function fetchRuns(slug: string, game: ArcadeGameId): Promise<HouseRun[]> {
  try {
    const response = await fetch(`/houses/${encodeURIComponent(slug)}/scores?game=${game}`, { credentials: "same-origin" });
    const body = await response.json();
    return response.ok && Array.isArray(body.runs) ? body.runs : [];
  } catch {
    return [];
  }
}

/** A log packed for sending (gzip, then base64), or null where the browser can't. A long run is megabytes written out, and the house only reads so much. */
async function pack(log: ArcadeLog<unknown>): Promise<string | null> {
  try {
    if (typeof CompressionStream === "undefined") return null;
    const packed = new Uint8Array(await new Response(new Blob([JSON.stringify(log)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    let text = "";
    for (let i = 0; i < packed.length; i += 0x8000) text += String.fromCharCode(...packed.subarray(i, i + 0x8000));
    return btoa(text);
  } catch {
    return null;
  }
}

/** Send a finished run in. Null when the house could not be reached or would not keep it. */
export async function sendRun(slug: string, run: { game: ArcadeGameId; rules: ArcadeRules; seats: number; seed: number; log: ArcadeLog<unknown>; score: number }): Promise<{ kept: boolean; best: number; runs: HouseRun[] } | null> {
  try {
    const { log, ...rest } = run;
    const logz = await pack(log);
    const sending = logz ? { ...rest, logz } : run;
    const response = await fetch(`/houses/${encodeURIComponent(slug)}/scores`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(sending) });
    const body = await response.json();
    return response.ok && Array.isArray(body.runs) ? { kept: body.kept === true, best: Number(body.best) || 0, runs: body.runs } : null;
  } catch {
    return null;
  }
}
