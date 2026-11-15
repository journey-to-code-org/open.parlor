// Which of two things is nearer the camera.
//
// The camera looks straight up the screen, so one thing can only hide another that is directly
// behind it: at the same place across the screen and further away. Comparing how far away two
// footprints are along a line they both cross settles it, however long and slanted they are.
import type { Point } from "@journey-to-code/physics";
import type { Prop } from "./things";

/** How far towards the camera the middle of a footprint is, along the line across the screen at `x`. */
export function nearnessAt(foot: Point[], x: number): number {
  let low = Infinity;
  let high = -Infinity;
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 0; i < foot.length; i++) {
    const [x1, y1] = foot[i]!;
    const [x2, y2] = foot[(i + 1) % foot.length]!;
    lowest = Math.min(lowest, y1);
    highest = Math.max(highest, y1);
    if (x1 === x2 || x < Math.min(x1, x2) || x > Math.max(x1, x2)) continue;
    const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  return low === Infinity ? (lowest + highest) / 2 : (low + high) / 2;
}

/** Whether a thing is in front of a point on the ground: nearer the camera, where they line up. */
export function inFront(p: Prop, x: number, y: number): boolean {
  let left = Infinity;
  let right = -Infinity;
  for (const [fx] of p.foot) {
    left = Math.min(left, fx);
    right = Math.max(right, fx);
  }
  return nearnessAt(p.foot, Math.min(right, Math.max(left, x))) > y;
}

/** Puts things in the order to draw them: anything behind another comes before it. */
export function farthestFirst(props: Prop[]): Prop[] {
  const n = props.length;
  const span = props.map((p) => {
    const xs = p.foot.map((q) => q[0]);
    const ys = p.foot.map((q) => q[1]);
    return { left: Math.min(...xs), right: Math.max(...xs), mid: (Math.min(...ys) + Math.max(...ys)) / 2 };
  });
  const after: number[][] = props.map(() => []);
  const waits = props.map(() => 0);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const [pa, pb] = [props[a]!, props[b]!];
      // Only things that overlap on the screen need putting in order.
      if (pa.box[0] > pb.box[2] || pb.box[0] > pa.box[2] || pa.box[1] > pb.box[3] || pb.box[1] > pa.box[3]) continue;
      const left = Math.max(span[a]!.left, span[b]!.left);
      const right = Math.min(span[a]!.right, span[b]!.right);
      if (right - left < 1) continue;
      const x = (left + right) / 2;
      const ya = nearnessAt(pa.foot, x);
      const yb = nearnessAt(pb.foot, x);
      if (Math.abs(ya - yb) < 1) continue;
      const [first, second] = ya < yb ? [a, b] : [b, a];
      after[first]!.push(second);
      waits[second]!++;
    }
  }
  const out: Prop[] = [];
  const left = new Set(props.map((_, i) => i));
  while (left.size) {
    // The furthest of those that nothing still to come is behind; if they go round in a ring, the furthest of all.
    let pick = -1;
    let stuck = -1;
    for (const i of left) {
      if (stuck < 0 || span[i]!.mid < span[stuck]!.mid) stuck = i;
      if (waits[i] === 0 && (pick < 0 || span[i]!.mid < span[pick]!.mid)) pick = i;
    }
    if (pick < 0) pick = stuck;
    left.delete(pick);
    out.push(props[pick]!);
    for (const j of after[pick]!) waits[j]!--;
  }
  return out;
}

