// The chips on a table that is played for them: Hold'em, Five Card Draw and Blackjack. The games
// say what everyone has in words ("480 chips", "Bet 20", "Pot 60"), which is what the page reads
// out; this works the amounts back out of those words so the table can show them as stacks, and
// says which chips make up an amount.

import type { KitView } from "@journey-to-code/games";
import { CHIP_VALUES, PARLOR_CHIPS, type ChipDesign } from "@open-parlor/ui/chip-design";

const CHIP_GAMES: ReadonlySet<string> = new Set(["holdem", "fivedraw", "blackjack"]);
/** Whether this game is played for chips, and so has stacks to show. */
export const playsForChips = (game: string) => CHIP_GAMES.has(game);

/** What each chip is worth, smallest first. Its colours come from the set this browser plays with. */
export const DENOMINATIONS = CHIP_VALUES;

export interface ChipColumn {
  value: number;
  count: number;
  colour: string;
  inset: string;
}

/**
 * The stacks that show an amount: at most `columns` of them, biggest chips first, none taller than
 * `tall`. One chip's worth is held back from each stack for the smaller chips beside it, so 500 is
 * four blacks, three greens and five reds and not one purple chip on its own. It is a picture: a
 * very big amount, or one that needs more kinds of chip than there are columns, is shown near
 * enough, and the words beside it say exactly.
 */
export function chipStacks(amount: number, columns = 3, tall = 10, design: ChipDesign = PARLOR_CHIPS): ChipColumn[] {
  amount = Math.floor(amount);
  if (!(amount > 0)) return [];
  let top = 0;
  for (let i = 0; i < DENOMINATIONS.length; i++) if (DENOMINATIONS[i]! * 2 <= amount) top = i;
  const chip = (i: number) => ({ value: DENOMINATIONS[i]!, colour: design.chips[i]!.colour, inset: design.chips[i]!.inset });
  const low = Math.max(0, top - columns + 1);
  const out: ChipColumn[] = [];
  let left = amount;
  for (let i = top; i >= low; i--) {
    const d = chip(i);
    const whole = Math.floor(left / d.value);
    const count = Math.min(tall, i === low ? whole : whole - 1);
    if (count <= 0) continue;
    left -= count * d.value;
    out.push({ ...d, count });
  }
  // An amount smaller than the smallest chip in reach (3 at a table of fives) still gets a chip.
  if (!out.length) out.push({ ...chip(low), count: 1 });
  return out;
}

export interface TableChips {
  /** What each seat has behind: not bet. */
  stacks: number[];
  /** What each seat has out in front of them now: this round's bet, or a Blackjack stake. */
  bets: number[];
  /** What is in the middle, without the bets still in front of people. Null where there is no pot (Blackjack). */
  pot: number | null;
}

const number = (text: string | undefined, pattern: RegExp) => {
  const found = text ? pattern.exec(text) : null;
  return found ? Number(found[1]) : 0;
};

/** The chips on this table, or null when the game isn't played for them. */
export function chipsAtTable(view: KitView): TableChips | null {
  if (!playsForChips(view.game)) return null;
  const held = view.players.map((_, i) => Math.max(0, view.scores.find((s) => s.seats.includes(i))?.value ?? 0));
  if (view.game === "blackjack") {
    // A Blackjack stake stays in the player's count until the round is settled.
    const bets = view.players.map((p) => number(p.line, /bet (\d+)/));
    return { stacks: held.map((n, i) => Math.max(0, n - bets[i]!)), bets, pot: null };
  }
  const blinds = /^Blinds (\d+)\/(\d+)/.exec(view.info.find((line) => line.startsWith("Blinds ")) ?? "");
  const bets = view.players.map((p) =>
    p.badge === "Small blind" ? Number(blinds?.[1] ?? 0) : p.badge === "Big blind" ? Number(blinds?.[2] ?? 0) : number(p.badge, /^Bet (\d+)/),
  );
  // "Pot was 60" is a pot already paid out: the middle is empty.
  const pot = number(view.info.find((line) => line.startsWith("Pot ")), /^Pot (\d+)/);
  return { stacks: held, bets, pot: Math.max(0, pot - bets.reduce((a, n) => a + n, 0)) };
}
