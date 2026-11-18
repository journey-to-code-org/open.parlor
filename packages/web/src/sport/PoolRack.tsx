// The pool balls, big enough to read. On a phone the table is a few hundred pixels wide and a
// ball on it is nine across: too small for a number, and barely big enough for a stripe. So the
// balls are shown again in a row over the table, each with its number, in their two groups with
// the name of whoever has them, and the ones already sunk faded out. In nine-ball it is the balls
// in order, with the one that has to be hit first marked.
import type { SportTone, SportView } from "@journey-to-code/games";
import { TONES } from "./paint/things";

export interface RackBall {
  id: string;
  /** The number on it. */
  mark: string;
  tone: SportTone;
  striped: boolean;
  /** Sunk. */
  down: boolean;
  /** Nine-ball: the one to hit first. */
  next?: boolean;
}
export interface RackGroup {
  /** "Solids", "Stripes", "8", or "" for nine-ball's one row. */
  label: string;
  /** Who has this group, by name, once the table is no longer open. */
  owner: string | null;
  /** Whether it is the group of whoever this screen is for. */
  mine: boolean;
  balls: RackBall[];
}

/** The numbered balls of a pool table in the groups they are played in, or null for a table that has none. */
export function poolRack(view: SportView, names: string[]): RackGroup[] | null {
  if (view.game !== "billiards") return null;
  const at = new Map(view.table.world.bodies.map((b) => [b.id, b]));
  const balls: RackBall[] = view.table.bodies
    .filter((b) => /^\d+$/.test(b.mark ?? ""))
    .map((b) => ({ id: b.id, mark: b.mark!, tone: b.tone, striped: !!b.striped, down: !at.get(b.id) || !!at.get(b.id)!.pocketed }))
    .sort((a, b) => Number(a.mark) - Number(b.mark));
  if (!balls.length) return null;
  // Nine-ball: one row, lowest first.
  if (!balls.some((b) => b.striped && Number(b.mark) > 9)) {
    const first = balls.find((b) => !b.down);
    return [{ label: "", owner: null, mine: false, balls: balls.map((b) => ({ ...b, next: b === first })) }];
  }
  // Eight-ball. A seat's line starts with its group once it has one ("Solids · 5 left").
  const has = (group: string) => view.players.flatMap((p, seat) => (p.line.startsWith(group) ? [seat] : []));
  const owner = (group: string) => {
    const seats = has(group);
    return seats.length ? seats.map((seat) => names[seat] ?? `Seat ${seat + 1}`).join(" & ") : null;
  };
  const group = (label: string, list: RackBall[]): RackGroup => ({ label, owner: owner(label), mine: has(label).includes(view.me), balls: list });
  return [
    group("Solids", balls.filter((b) => !b.striped && b.mark !== "8")),
    { label: "8", owner: null, mine: false, balls: balls.filter((b) => b.mark === "8") },
    group("Stripes", balls.filter((b) => b.striped)),
  ];
}

/** One ball, as it looks: its colour all over, or a band of it on white for a stripe, with the number on a white spot. */
export function PoolBall({ ball }: { ball: RackBall }) {
  const [fill, shade] = TONES[ball.tone];
  const kind = ball.mark === "8" ? "" : ball.striped ? ", a stripe" : ", a solid";
  return (
    <span
      className={`pool-ball${ball.striped ? " is-striped" : ""}${ball.down ? " is-down" : ""}${ball.next ? " is-next" : ""}`}
      style={{ ["--ball" as string]: fill, ["--ball-shade" as string]: shade }}
      role="img"
      aria-label={`The ${ball.mark} ball${kind}${ball.down ? ", sunk" : ""}${ball.next ? ", to hit first" : ""}`}
    >
      <b aria-hidden>{ball.mark}</b>
    </span>
  );
}

export function PoolRack({ view, names }: { view: SportView; names: string[] }) {
  const rack = poolRack(view, names);
  if (!rack) return null;
  return (
    <div className="pool-rack" aria-label="The balls">
      {rack.map((group) => (
        <div key={group.label} className={`pool-group${group.mine ? " is-mine" : ""}`}>
          {group.label && group.label !== "8" && (
            <span className="pool-group-name">
              {group.label}
              {group.owner && <em>{group.owner}</em>}
            </span>
          )}
          <span className="pool-balls">
            {group.balls.map((ball) => (
              <PoolBall key={ball.id} ball={ball} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The numbered ball an aim would reach first, going straight from where the cue ball is: the one a
 * player means when they line up a shot. Cushions are not followed. `angle` is in hundredths of a
 * degree, 0 along +x and 9000 down the screen.
 */
export function firstBall(view: SportView, from: { x: number; y: number; r: number }, angle: number): { mark: string; striped: boolean } | null {
  const ux = Math.cos((angle / 18000) * Math.PI);
  const uy = Math.sin((angle / 18000) * Math.PI);
  const looks = new Map(view.table.bodies.map((b) => [b.id, b]));
  let best: { mark: string; striped: boolean; far: number } | null = null;
  for (const body of view.table.world.bodies) {
    const look = looks.get(body.id);
    if (body.pocketed || !look?.mark || !/^\d+$/.test(look.mark)) continue;
    const dx = body.x - from.x;
    const dy = body.y - from.y;
    const along = dx * ux + dy * uy;
    if (along <= 0) continue;
    const reach = body.r + from.r;
    const off = dx * dx + dy * dy - along * along;
    if (off >= reach * reach) continue;
    const far = along - Math.sqrt(reach * reach - off);
    if (!best || far < best.far) best = { mark: look.mark, striped: !!look.striped, far };
  }
  return best && { mark: best.mark, striped: best.striped };
}
