// A pile of chips: an amount as stacks, each chip a little cylinder drawn in CSS (".chip-pile" in
// styles.css), in the set this browser plays with (made in the chip designer, /designer/#chips).
// It is a picture only: the amount is always in words beside it ("480 chips", "Bet 20", "Pot 60"),
// so a screen reader is told once and the pile is hidden from it. Where the table can draw in 3-D,
// these hold the places the solid chips are drawn at (useChips3d.tsx).

import { CHIPS_KEY, normalizeChips, PARLOR_CHIPS, watchChips, type ChipDesign } from "@open-parlor/ui/chip-design";
import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { chipStacks } from "./chips";

const rawChips = () => {
  try {
    return localStorage.getItem(CHIPS_KEY);
  } catch {
    return null;
  }
};

/** The chips this browser plays with, kept up to date when they're changed here or in the designer. */
export function useChipDesign(): ChipDesign {
  const raw = useSyncExternalStore(watchChips, rawChips, () => null);
  return useMemo(() => {
    if (!raw) return PARLOR_CHIPS;
    try {
      return normalizeChips(JSON.parse(raw));
    } catch {
      return PARLOR_CHIPS;
    }
  }, [raw]);
}

export function ChipPile({ amount, kind, columns, tall }: { amount: number; kind: "stack" | "bet" | "pot"; columns?: number; tall?: number }) {
  const design = useChipDesign();
  const stacks = chipStacks(amount, columns, tall, design);
  if (!stacks.length) return null;
  return (
    <span className={`chip-pile ${kind}`} aria-hidden="true" data-amount={amount} data-edge={design.edge} data-mark={design.mark} data-finish={design.finish}>
      {stacks.map((stack) => (
        <span key={stack.value} className="chip-col" data-value={stack.value} style={{ "--n": stack.count, "--c": stack.colour, "--inset": stack.inset } as CSSProperties}>
          {Array.from({ length: stack.count }, (_, k) => (
            <i key={k} className="chip" style={{ "--k": k } as CSSProperties} />
          ))}
        </span>
      ))}
    </span>
  );
}
