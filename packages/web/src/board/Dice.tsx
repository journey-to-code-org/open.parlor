// The dice of any board game that has them (the view's `dice`): Yacht's five, backgammon's two.
// The server throws them; this only shows what each die came to. When the view's `roll` goes up the
// dice that were thrown (the ones not held) tumble for a moment, showing any old faces, and land on
// the values they were given, with a rattle and a buzz. With less motion asked for they simply
// change.
//
// A die you can tap is a button that says what it is ("die 3: a five, held"), and the arrow keys
// walk along the row. Dice you can't tap are still read out.
import type { BoardDice, BoardDie } from "@journey-to-code/games";
import { useEffect, useRef, useState } from "react";
import { play } from "../feedback/sounds";
import { reducedMotion } from "../motion";
import { DARK, LIGHT, loadDice3d, type Dice3d, type Die3d } from "./dice3d";
import { thrownDice } from "./thrown";

/** Where each face's pips sit in a die's three-by-three (0 is the top left, 8 the bottom right). */
const PIPS: Record<number, number[]> = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "a five", "an eight", "a 20". */
const spoken = (value: number) => {
  const word = WORDS[value] ?? String(value);
  return `${/^(8|11|18|8\d)$/.test(String(value)) ? "an" : "a"} ${word}`;
};
/** How long the dice tumble, in ms. */
const TUMBLE_MS = 640;

/** What a screen reader says for a die. */
export function dieLabel(die: BoardDie, place: number): string {
  if (die.value === null) return `die ${place}: not rolled`;
  return `die ${place}: ${spoken(die.value)}${die.held ? ", held" : ""}${die.used ? ", used" : ""}`;
}

/** One die's face: pips for an ordinary die, the number for anything bigger. */
function Face({ value }: { value: number | null }) {
  const pips = value === null ? null : PIPS[value];
  return (
    <span className={`die-face${value === null ? " blank" : ""}`} aria-hidden>
      {pips ? Array.from({ length: 9 }, (_, i) => <i key={i} className={pips.includes(i) ? "pip" : ""} />) : value !== null ? <b>{value}</b> : null}
    </span>
  );
}

/** The three-dimensional dice, once they've loaded (null on the way, and wherever WebGL doesn't work). */
function useDice3d(sides: number): Dice3d | null {
  const [three, setThree] = useState<Dice3d | null>(null);
  useEffect(() => {
    if (sides !== 6) return;
    let live = true;
    void loadDice3d().then((d) => live && setThree(d));
    return () => {
      live = false;
    };
  }, [sides]);
  return sides === 6 ? three : null;
}

/** A die drawn as a cube: shows its face, and spins to it when it's thrown. */
function Face3d({ three, value, dark, tumbling, index }: { three: Dice3d; value: number; dark: boolean; tumbling: boolean; index: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const die = useRef<Die3d | null>(null);
  const was = useRef(false);
  useEffect(() => {
    die.current = three.create(canvas.current!, dark ? DARK : LIGHT);
    die.current.show(value);
    return () => die.current?.dispose();
  }, [three]);
  useEffect(() => {
    die.current?.setPalette(dark ? DARK : LIGHT);
  }, [dark]);
  useEffect(() => {
    if (tumbling && !was.current) die.current?.tumble(value, TUMBLE_MS, index * 40);
    else if (!tumbling) die.current?.show(value);
    was.current = tumbling;
  }, [value, tumbling]);
  return <canvas ref={canvas} className="die-3d" aria-hidden />;
}

export interface DiceProps {
  dice: BoardDice;
  /** A tap (or Enter) on a die the view lists as tappable. */
  onTap: (die: number) => void;
  /** No tumbling: the table is set to move at once. */
  still?: boolean;
  /** Told when the dice start tumbling and when they have landed, so nothing gives the roll away early. */
  onTumble?: (tumbling: boolean) => void;
  /**
   * Two players' dice on one table (backgammon): the row is in two halves, this seat's dice in the
   * second and everyone else's in the first, so each player's dice lie on their own side.
   */
  split?: number;
}

export function Dice({ dice, onTap, still, onTumble, split }: DiceProps) {
  const sides = dice.sides ?? 6;
  const three = useDice3d(sides);
  const row = useRef<HTMLDivElement>(null);
  // While dice tumble they show faces of their own choosing; `faces` is what each shows this instant.
  const [faces, setFaces] = useState<Map<number, number> | null>(null);
  const [said, setSaid] = useState("");
  const seen = useRef(dice.roll);
  // The dice as they lay at the last render: what a throw picked up.
  const before = useRef(dice.dice);
  useEffect(() => {
    const isThrow = dice.roll > seen.current;
    seen.current = dice.roll;
    // A count that went down is another table's dice, not a throw.
    if (!isThrow) return;
    play("dice");
    // The dice that lay loose before this throw are the ones that were thrown, whatever they are
    // now: a die kept the moment it lands, or spent by a roll that couldn't be played, still tumbles.
    const thrown = new Set(thrownDice(before.current, dice.dice));
    const rolled = dice.dice.filter((d) => thrown.has(d.id));
    setSaid(`Rolled: ${dice.dice.filter((d) => d.value !== null).map((d) => WORDS[d.value!] ?? d.value).join(", ")}`);
    if (still || reducedMotion() || !rolled.length) return;
    const any = () => new Map(rolled.map((d) => [d.id, 1 + Math.floor(Math.random() * sides)]));
    const landed = () => {
      clearInterval(flicker);
      setFaces(null);
      onTumble?.(false);
    };
    setFaces(any());
    onTumble?.(true);
    const flicker = setInterval(() => setFaces(any()), 80);
    const land = setTimeout(landed, TUMBLE_MS);
    return () => {
      clearTimeout(land);
      landed();
    };
  }, [dice.roll]);
  useEffect(() => {
    before.current = dice.dice;
  });

  const tappable = new Set(dice.tap?.dice ?? []);
  function onKey(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const buttons = [...(row.current?.querySelectorAll<HTMLElement>("button.die") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, at + step))]?.focus();
  }

  const one = (die: BoardDie, i: number) => {
    const tumbling = faces?.has(die.id);
    const flat = !three || die.value === null;
    const cls = ["die", flat ? "" : "d3", die.held ? "held" : "", die.used ? "used" : "", tumbling ? "tumbling" : "", die.value === null ? "unrolled" : "", typeof die.owner === "number" ? `owner-${die.owner % 2}` : ""].filter(Boolean).join(" ");
    const style = { "--i": i } as React.CSSProperties;
    const body = (
      <>
        {flat ? <Face value={tumbling ? faces!.get(die.id)! : die.value} /> : <Face3d three={three} value={die.value!} dark={typeof die.owner === "number" && die.owner % 2 === 1} tumbling={!!tumbling} index={i} />}
        {/* Set aside: a held die sits up out of the row with a tag under it. */}
        {die.held && (
          <span className="die-tag" aria-hidden>
            Kept
          </span>
        )}
      </>
    );
    return tappable.has(die.id) ? (
      <button key={die.id} type="button" className={cls} style={style} data-die={die.id} aria-pressed={!!die.held} aria-label={dieLabel(die, i + 1)} onClick={() => onTap(die.id)}>
        {body}
      </button>
    ) : (
      <span key={die.id} className={cls} style={style} data-die={die.id} role="img" aria-label={dieLabel(die, i + 1)}>
        {body}
      </span>
    );
  };
  const halves = split === undefined ? null : [dice.dice.filter((d) => d.owner !== split), dice.dice.filter((d) => d.owner === split)];

  return (
    <div className={`dice${tappable.size ? " can" : ""}${halves ? " split" : ""}`} role="group" aria-label={tappable.size ? "Dice. Tap one to keep it, or to let it go." : "Dice"} ref={row} onKeyDown={onKey}>
      {halves
        ? halves.map((half, h) => (
            <div key={h} className="dice-half">
              {half.map((die) => one(die, dice.dice.indexOf(die)))}
            </div>
          ))
        : dice.dice.map(one)}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
