// Things drawn across a board from one cell to another (`links` on a grid): a ladder, a snake.
// Everything is measured in cells, in one picture over the whole grid. A kind this file doesn't
// know is not drawn, and the game's own marker pieces stand in for it.
import type { BoardGrid } from "@journey-to-code/games";

type Link = NonNullable<BoardGrid["links"]>[number];
const KNOWN: ReadonlySet<string> = new Set(["ladder", "snake"]);
/** Whether a link of this kind is drawn here, so the piece that marks its start needn't be. */
export const drawsLink = (kind: string) => KNOWN.has(kind);

interface Props {
  grid: BoardGrid;
  shown: (cell: number) => number;
}

export function Links({ grid, shown }: Props) {
  const links = (grid.links ?? []).filter((l) => drawsLink(l.kind));
  if (!links.length) return null;
  const centre = (cell: number) => {
    const at = shown(cell);
    return { x: (at % grid.cols) + 0.5, y: Math.floor(at / grid.cols) + 0.5 };
  };
  return (
    <svg className="board-links" viewBox={`0 0 ${grid.cols} ${grid.rows}`} preserveAspectRatio="none" aria-hidden>
      {links.map((link, i) => {
        const a = centre(link.from);
        const b = centre(link.to);
        return link.kind === "ladder" ? <Ladder key={i} a={a} b={b} /> : <Snake key={i} a={a} b={b} n={i} />;
      })}
    </svg>
  );
}

interface Point {
  x: number;
  y: number;
}

/** Two rails from the foot to the top, and a rung every third of a cell. */
function Ladder({ a, b }: { a: Point; b: Point }) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  // Across the ladder.
  const px = -uy * 0.14;
  const py = ux * 0.14;
  const rungs = Math.max(2, Math.round(length / 0.34));
  return (
    <g className="link-ladder">
      <line x1={a.x + px} y1={a.y + py} x2={b.x + px} y2={b.y + py} />
      <line x1={a.x - px} y1={a.y - py} x2={b.x - px} y2={b.y - py} />
      {Array.from({ length: rungs }, (_, k) => {
        const t = (k + 0.5) / rungs;
        const x = a.x + ux * length * t;
        const y = a.y + uy * length * t;
        return <line key={k} className="rung" x1={x + px} y1={y + py} x2={x - px} y2={y - py} />;
      })}
    </g>
  );
}

/** A body that waves from the head down to the tail, thinner as it goes, with two eyes on the head. */
function Snake({ a, b, n }: { a: Point; b: Point; n: number }) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const waves = Math.max(2, Math.round(length / 0.9));
  const steps = waves * 12;
  const points = Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    // Still at both ends, so the head and the tail sit on their squares.
    const sway = Math.sin(t * waves * Math.PI) * 0.2 * Math.sin(t * Math.PI) ** 0.5;
    return `${(a.x + ux * length * t - uy * sway).toFixed(3)},${(a.y + uy * length * t + ux * sway).toFixed(3)}`;
  });
  return (
    <g className={`link-snake skin-${n % 2}`}>
      <polyline className="belly" points={points.join(" ")} />
      <polyline className="back" points={points.join(" ")} />
      <circle className="head" cx={a.x} cy={a.y} r={0.17} />
      <circle className="eye" cx={a.x - uy * 0.07 + ux * 0.04} cy={a.y + ux * 0.07 + uy * 0.04} r={0.035} />
      <circle className="eye" cx={a.x + uy * 0.07 + ux * 0.04} cy={a.y - ux * 0.07 + uy * 0.04} r={0.035} />
    </g>
  );
}
