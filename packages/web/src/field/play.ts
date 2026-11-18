// Playing a shot on the screen. The server has already decided how the field is left; what a
// browser does is fly the very same shot over the very same field (`flightOf`, in the games
// package) and show it a tick at a time. The flight uses only arithmetic every engine does alike,
// so it ends on the field the view shows, and the animation is a replay and never a guess.
//
// A browser on another version of the flight doesn't fly it: the result is shown at once.
import { FIELD_VERSION, flightOf, type FieldEvent, type FieldFlight, type FieldPiece, type FieldView } from "@journey-to-code/games";

/** How long the picture is held after the last thing has landed, in ticks, so the hole can be looked at. */
export const HOLD = 45;
/** How long a burst is drawn for, and a number floating up from whoever it hit. */
export const BURST_FOR = 26;
export const NUMBER_FOR = 70;
const TRAIL = 16;

export interface Playback {
  /** The view this shot leads to: shown once the flight is over. */
  target: FieldView;
  flight: FieldFlight;
  /** Ticks played so far (a fraction carries between frames). */
  tick: number;
  /** How many of the flight's events have had their sound. */
  heard: number;
}

/** A flight to play for a view's last shot, or null when this browser can't (or there isn't one). */
export function beginPlayback(target: FieldView): Playback | null {
  if (!target.last || target.last.version !== FIELD_VERSION) return null;
  const flight = flightOf(target);
  return flight && flight.tracks.length ? { target, flight, tick: 0, heard: 0 } : null;
}

export const playbackOver = (p: Playback) => p.tick >= p.flight.ticks + HOLD;

/** What the field looks like part of the way through a flight. */
export interface Frame {
  land: number[];
  pieces: FieldPiece[];
  /** Each thing in the air: where it is, and where it has just been (oldest first). */
  shells: { x: number; y: number; small: boolean; trail: [number, number][] }[];
  /** Bursts still on show, with how far through each is (0 to 1). */
  bursts: { x: number; y: number; r: number; kind: FieldEvent["kind"]; age: number }[];
  /** Numbers floating up from pieces that were hit, with how far through each is (0 to 1). */
  numbers: { piece: string; damage: number; age: number }[];
}

/** The field at `tick` of a flight: the land and pieces as the last thing to change them left them. */
export function frameAt(p: Playback, tick = p.tick): Frame {
  const from = p.target.last!.from;
  let land = from.land;
  let pieces = from.pieces;
  const bursts: Frame["bursts"] = [];
  const numbers: Frame["numbers"] = [];
  for (const e of p.flight.events) {
    if (e.tick > tick) break;
    if (e.land) land = e.land;
    if (e.pieces) pieces = e.pieces;
    const age = tick - e.tick;
    if (e.kind !== "bore" && age < BURST_FOR) bursts.push({ x: e.x, y: e.y, r: e.r, kind: e.kind, age: age / BURST_FOR });
    if (age < NUMBER_FOR) for (const hit of e.hits) numbers.push({ piece: hit.piece, damage: hit.damage, age: age / NUMBER_FOR });
  }
  const shells: Frame["shells"] = [];
  for (const track of p.flight.tracks) {
    const i = Math.floor(tick) - track.from;
    // A track's last point is where it ended: it is in the air up to the one before.
    if (i < 0 || i >= track.points.length - 1) continue;
    const [x, y] = track.points[i]!;
    shells.push({ x, y, small: track.small, trail: track.points.slice(Math.max(0, i - TRAIL), i + 1) });
  }
  return { land, pieces, shells, bursts, numbers };
}

/** The events between two moments of a flight, for their sounds. */
export function eventsBetween(p: Playback, from: number, to: number): FieldEvent[] {
  return p.flight.events.filter((e) => e.tick > from && e.tick <= to);
}
