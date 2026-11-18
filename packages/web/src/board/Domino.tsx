// A domino, drawn: two halves with their pips and the bar between. The engine says how a tile lies
// in its glyph ("3|5": the three towards the line's first end), and that is all this reads. Whether
// it lies along the line or stands upright (a double, or a tile in your hand) is the stylesheet's
// business: the halves are in order either way.

/** Which of the nine places on a half hold a pip, for none to six: row by row from the top left. */
const PIPS: readonly (readonly number[])[] = [[], [4], [2, 6], [2, 4, 6], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

/** The two numbers of a tile from its glyph, or null if it isn't one. */
export function dominoEnds(glyph: string): [number, number] | null {
  const match = /^([0-6])\|([0-6])$/.exec(glyph);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function Half({ pips }: { pips: number }) {
  const on = PIPS[pips] ?? [];
  return (
    <span className={`domino-half pips-${pips}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={on.includes(i) ? "pip" : "no-pip"} />
      ))}
    </span>
  );
}

export function DominoFace({ glyph }: { glyph: string }) {
  const ends = dominoEnds(glyph);
  // Not a tile this table knows how to draw: the engine's own text.
  if (!ends) return <>{glyph}</>;
  return (
    <span className={`domino${ends[0] === ends[1] ? " double" : ""}`}>
      <Half pips={ends[0]} />
      <span className="domino-bar" />
      <Half pips={ends[1]} />
    </span>
  );
}
