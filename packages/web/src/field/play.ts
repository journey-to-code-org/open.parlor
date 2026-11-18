// Playing a shot on the screen. The server has already decided how the field is left; what a
// browser does is fly the very same shot over the very same field (`flightOf`, in the games
// package) and show it a tick at a time. The flight uses only arithmetic every engine does alike,
// so it ends on the field the view shows, and the animation is a replay and never a guess.
//
// A browser on another version of the flight doesn't fly it: the result is shown at once.
import { FIELD_VERSION, flightOf, type FieldEvent, type FieldFlight, type FieldPiece, type FieldShell, type FieldView } from "@journey-to-code/games";

/** How long the picture is held after the last thing has landed, in ticks, so the hole can be looked at. */
export const HOLD = 45;
/** How long a burst is drawn for, and a number floating up from whoever it hit. */
export const BURST_FOR = 26;
export const NUMBER_FOR = 70;
const TRAIL = 16;

/** What a thing in the air is drawn as. */
export type ShellLook = "shell" | "bomblet" | "fire" | "dirt" | "orb" | "beam";
/** How a shell, or (`small`) a piece of one that split, should look. */
export function shellLook(shell: FieldShell | undefined, small: boolean): ShellLook {
  if (!shell) return small ? "bomblet" : "shell";
  if (small) return shell.split?.scorch || (shell.scorch && !shell.split) ? "fire" : shell.split?.dirt ? "dirt" : "bomblet";
  return shell.carry ? "orb" : shell.weight === 0 ? "beam" : shell.scorch ? "fire" : shell.dirt ? "dirt" : "shell";
}

export interface Playback {
  /** The view this shot leads to: shown once the flight is over. */
  target: FieldView;
  flight: FieldFlight;
  /** Ticks played so far (a fraction carries between frames). */
  tick: number;
  /** How many of the flight's events have had their sound. */
  heard: number;
  /** The shell that was fired. */
  shell: FieldShell | undefined;
}

/** A flight to play for a view's last shot, or null when this browser can't (or there isn't one). */
export function beginPlayback(target: FieldView): Playback | null {
  if (!target.last || target.last.version !== FIELD_VERSION) return null;
  const flight = flightOf(target);
  return flight && flight.tracks.length ? { target, flight, tick: 0, heard: 0, shell: target.shells.find((s) => s.id === target.last!.shell) } : null;
}

export const playbackOver = (p: Playback) => p.tick >= p.flight.ticks + HOLD;

/** What the field looks like part of the way through a flight. */
export interface Frame {
  land: number[];
  pieces: FieldPiece[];
  /** Each thing in the air: where it is, and where it has just been (oldest first). */
  shells: { id: string; x: number; y: number; small: boolean; look: ShellLook; trail: [number, number][] }[];
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
    // Between two ticks, a thing is between its two points: flights are smooth on any screen.
    const [ax, ay] = track.points[i]!;
    const [bx, by] = track.points[i + 1]!;
    const part = tick - Math.floor(tick);
    const look = shellLook(p.shell, track.small);
    shells.push({ id: track.id, x: ax + (bx - ax) * part, y: ay + (by - ay) * part, small: track.small, look, trail: track.points.slice(Math.max(0, i - (look === "beam" ? 60 : TRAIL)), i + 1) });
  }
  return { land, pieces, shells, bursts, numbers };
}

/** The events between two moments of a flight, for their sounds. */
export function eventsBetween(p: Playback, from: number, to: number): FieldEvent[] {
  return p.flight.events.filter((e) => e.tick > from && e.tick <= to);
}
