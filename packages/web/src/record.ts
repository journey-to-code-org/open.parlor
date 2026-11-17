// Your record at each game on this device: games played and won against the computer, the run of
// wins you're on and your best. Kept in this browser only, like your name and house rules. It
// counts a game played alone against computer players, or alone at a solitaire; a game shared on
// one device or on the wifi isn't yours alone to count.
import type { TableSettings } from "@journey-to-code/rules";
import { createContext } from "react";

export interface GameRecord {
  played: number;
  won: number;
  /** Wins in a row, now. */
  streak: number;
  /** The longest run of wins. */
  best: number;
  /** How hard the computer players were for the run you're on, if they were the same throughout. */
  streakSkill?: TableSettings["skill"];
}

const KEY = (game: string) => `parlor.record.${game}`;
const EMPTY: GameRecord = { played: 0, won: 0, streak: 0, best: 0 };

export function loadRecord(game: string): GameRecord {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY(game)) ?? "null") as Partial<GameRecord> | null;
    if (!kept || typeof kept.played !== "number") return { ...EMPTY };
    return { ...EMPTY, ...kept };
  } catch {
    return { ...EMPTY };
  }
}

/** Add a finished game to the record, and keep it. Returns the record as it now stands. */
export function addGame(game: string, won: boolean, skill: TableSettings["skill"]): GameRecord {
  const was = loadRecord(game);
  const streak = won ? was.streak + 1 : 0;
  const next: GameRecord = {
    played: was.played + 1,
    won: was.won + (won ? 1 : 0),
    streak,
    best: Math.max(was.best, streak),
  };
  // The run counts as one skill only if every win in it was against the same.
  if (won && (was.streak === 0 || was.streakSkill === skill)) next.streakSkill = skill;
  try {
    localStorage.setItem(KEY(game), JSON.stringify(next));
  } catch {
    /* private mode: the record lasts as long as the page */
  }
  return next;
}

/** "Won 7 of 12 · 3 in a row · best run 4". */
export function recordLine(r: GameRecord): string {
  const parts = [`Won ${r.won} of ${r.played}`];
  if (r.streak > 1) parts.push(`${r.streak} in a row`);
  if (r.best > 1 && r.best > r.streak) parts.push(`best run ${r.best}`);
  return parts.join(" · ");
}

/** Three wins in a row against the same computer players: the next step up, if there is one. */
export function harder(r: GameRecord): TableSettings["skill"] | null {
  if (r.streak < 3 || !r.streakSkill) return null;
  return r.streakSkill === "easy" ? "medium" : r.streakSkill === "medium" || r.streakSkill === "mixed" ? "hard" : null;
}

export const SKILL_NAME: Record<TableSettings["skill"], string> = { mixed: "their own way", easy: "Easy", medium: "Medium", hard: "Hard" };

/** What the end of a game shows of your record: given by a practice table, read by its end sheet. */
export const RecordShown = createContext<{ record: GameRecord; harder: TableSettings["skill"] | null; raise: () => void } | null>(null);
