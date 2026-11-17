// Which dice a throw threw. A view says what each die shows and never which were thrown, so the
// table works it out from the dice as they lay before: the ones that were neither kept back nor
// already spent are the ones that were picked up. A die that scores the moment it lands is kept
// in the same view (Ten Thousand keeps every scoring die for you; Ship, Captain, Crew takes the
// six aboard), so "not held now" isn't the test: it was thrown all the same, and should tumble.
//
// When no die lay loose before, the whole lot was picked up: the first roll of a turn (the dice of
// the turn before are all spent), hot dice, a roll that is spent as soon as it lands.
import type { BoardDie } from "@journey-to-code/games";

/** The ids of the dice thrown to get from `before` to `now`. */
export function thrownDice(before: readonly BoardDie[], now: readonly BoardDie[]): number[] {
  const shown = now.filter((d) => d.value !== null);
  const was = new Map(before.map((d) => [d.id, d]));
  const loose = shown.filter((d) => {
    const old = was.get(d.id);
    return !old || (!old.held && !old.used);
  });
  return (loose.length ? loose : shown).map((d) => d.id);
}
