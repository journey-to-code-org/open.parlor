// Forehead's words: the round's clock, the line that goes with a buzz, and the final placings.
import type { Buzz } from "./room";

/** Time left as m:ss. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** What a buzz says, to the player reading it. It never says what the card was. */
export function buzzLine(buzz: Buzz, me: number, name: (seat: number) => string): string {
  const who = buzz.seat === me ? "You've been buzzed: you lose a point." : `${name(buzz.seat)} has been buzzed, and loses a point.`;
  if (buzz.redealt === null) return who;
  return `${who} ${buzz.redealt === me ? "It was your card that was given away, so you have a new one." : `${name(buzz.redealt)}'s card was given away, so they have a new one.`}`;
}

/** The players from the top score down, with their places: equal scores share one. */
export function placed<P extends { seat: number; score: number }>(players: P[]): (P & { place: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return sorted.map((p) => ({ ...p, place: sorted.findIndex((q) => q.score === p.score) + 1 }));
}
