// Forehead's words: the round's clock, the line that goes with a buzz, the final placings, and what
// a tile says while its call is connecting.
import type { Buzz, Link } from "./room";

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

/** After this long trying, a connection is called stuck and the player is told why it might be. */
export const STUCK_MS = 15_000;

const ADDRESS: Record<string, string> = { host: "on this network", srflx: "through the internet", prflx: "through the internet", relay: "through a relay" };
const kinds = (list: string[]) => (list.length ? [...new Set(list.map((k) => ADDRESS[k] ?? k))].join(", ") : "nothing yet");

/**
 * What a tile says about the call to its player, if anything: nothing once it's up. A connection
 * trying for STUCK_MS, or one that failed, is stuck: the likeliest reason is a network that won't
 * let two devices reach each other, which only a relay server (TURN) gets round.
 */
export function linkWords(link: Link, name: string, relay: boolean, now: number): { title: string; why: string | null; stuck: boolean; details: string } | null {
  if (link.state === "connected") return null;
  const details = `Ways this device found: ${kinds(link.mine)}. Ways ${name}'s found: ${kinds(link.theirs)}. ${relay ? "This parlor has a relay server." : "This parlor has no relay server (TURN)."}`;
  const stuck = link.state === "failed" || now - link.since >= STUCK_MS;
  if (!stuck) return { title: `Connecting to ${name}…`, why: null, stuck, details };
  const why = !link.theirs.length
    ? `Nothing has come back from ${name}'s device yet. If they're on the game, try again.`
    : relay
      ? "Your devices can't reach each other, even through the parlor's relay. A guest or work network can block calls."
      : "Your network may be keeping your devices from reaching each other directly, and this parlor has no relay server for that. On one wifi, try a phone on mobile data.";
  return { title: `Can't connect to ${name}`, why, stuck, details };
}
