import { useEffect, useMemo, useState } from "react";
import { motionSetting } from "./display";

const SUITS = ["♠︎", "♥︎", "♦︎", "♣︎"];

/** A shower of suits for the winner, once, then gone. Hidden for reduced motion (in the CSS). `pieces`: something else to shower (autumn leaves). */
export function Confetti({ count = 24, pieces }: { count?: number; pieces?: string[] }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 2200);
    return () => clearTimeout(t);
  }, []);
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const suit = pieces ? pieces[i % pieces.length]! : SUITS[i % 4]!;
        const tone = pieces ? "plain" : i % 6 === 5 ? "gold" : suit.startsWith("♥") || suit.startsWith("♦") ? "red" : "black";
        return {
          suit,
          tone,
          style: {
            "--x": `${Math.random() * 100}vw`,
            "--d": `${Math.round(Math.random() * 400)}ms`,
            "--r": `${Math.round(Math.random() * 1080 - 540)}deg`,
            "--s": (0.8 + Math.random() * 0.6).toFixed(2),
          } as React.CSSProperties,
        };
      }),
    [count, pieces?.join("")],
  );
  if (!on || motionSetting() !== "on") return null;
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} className={b.tone} style={b.style}>
          {b.suit}
        </span>
      ))}
    </div>
  );
}
