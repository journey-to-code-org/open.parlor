// The screen and the thumb must agree about where the ground is. These check the projection the
// table sports are drawn with against plain geometry: a point goes to the screen and comes back,
// and a pull across the screen sends the ball exactly the opposite way along the ground, whatever
// the size of the screen, however the table is turned and however far the camera is tipped.
import { describe, expect, it } from "vitest";
import { fitFrame, project, projectVector, TILT, unproject, unprojectVector, type Projection } from "../src/sport/projection";

const PORTRAIT = { x: 0, y: 0, w: 10400, h: 14000 };
const LANDSCAPE = { x: 0, y: 0, w: 14000, h: 10400 };
const views: [string, Projection][] = [
  ["a phone, upright", fitFrame(PORTRAIT, 374, 540, { top: 44 })],
  ["a phone, the wide hole on its side", fitFrame(LANDSCAPE, 374, 540, { top: 44 })],
  ["a desktop", fitFrame(PORTRAIT, 980, 640)],
  ["a desktop, the wide hole", fitFrame(LANDSCAPE, 980, 640)],
  ["a tall hole turned on a very wide screen", fitFrame(PORTRAIT, 1600, 400)],
  ["from straight above", fitFrame(PORTRAIT, 374, 540, { tilt: 0 })],
  ["tipped right back", fitFrame(PORTRAIT, 374, 540, { tilt: 1.1 })],
];

/** The whole-number angle the table sends for a pull of `(dx, dy)` CSS pixels: as SportTable works it out. */
function sent(p: Projection, dx: number, dy: number): number {
  const [wx, wy] = unprojectVector(p, dx, dy);
  const a = Math.round((Math.atan2(-wy, -wx) * 18000) / Math.PI);
  return ((a % 36000) + 36000) % 36000;
}
const apart = (a: number, b: number) => Math.abs(((a - b + 54000) % 36000) - 18000);

describe("the projection", () => {
  it("turns the tables it should, and no others", () => {
    expect(views.map(([, p]) => p.turn)).toEqual([0, 3, 0, 0, 1, 0, 0]);
    expect(fitFrame(PORTRAIT, 374, 540).tilt).toBe(TILT);
  });

  for (const [name, p] of views) {
    describe(name, () => {
      it("takes a point on the ground to the screen and back", () => {
        for (const [x, y] of [[0, 0], [5200, 11700], [9200, 1800], [1234, 13999]] as const) {
          for (const z of [0, 300, -170]) {
            const [sx, sy] = project(p, x, y, z);
            const [bx, by] = unproject(p, sx, sy, z);
            expect(bx).toBeCloseTo(x, 6);
            expect(by).toBeCloseTo(y, 6);
          }
        }
      });

      it("draws height straight up the screen, and nothing else", () => {
        const [x0, y0] = project(p, 4000, 6000, 0);
        const [x1, y1] = project(p, 4000, 6000, 500);
        expect(x1).toBeCloseTo(x0, 9);
        expect(y0 - y1).toBeCloseTo(500 * Math.sin(p.tilt) * p.scale, 9);
      });

      it("keeps the camera looking up the screen: further away is higher up", () => {
        // "Away" is whichever way of the world the turn has put at the top.
        const [ax, ay] = unprojectVector(p, 0, -10);
        const [, near] = project(p, 5000, 5000);
        const [, far] = project(p, 5000 + ax, 5000 + ay);
        expect(far).toBeLessThan(near);
        const [sx] = projectVector(p, ax, ay);
        expect(sx).toBeCloseTo(0, 9);
      });

      it("sends the ball exactly opposite the pull, along the ground", () => {
        const ball: [number, number] = [5200, 9000];
        const [bx, by] = project(p, ...ball);
        let worst = 0;
        // Every 1.5° round the clock, short pulls and long ones.
        for (let step = 0; step < 240; step++) {
          for (const far of [17, 60, 133.7, 230]) {
            const pull = (step * 1.5 * Math.PI) / 180;
            const dx = Math.cos(pull) * far;
            const dy = Math.sin(pull) * far;
            const angle = sent(p, dx, dy);
            // What the ground itself says: undo the foreshortening and the turn by hand.
            const gx = dx;
            const gy = dy / Math.cos(p.tilt);
            const [ux, uy] = p.turn === 1 ? [gy, -gx] : p.turn === 3 ? [-gy, gx] : [gx, gy];
            const byHand = (((Math.round((Math.atan2(-uy, -ux) * 18000) / Math.PI) % 36000) + 36000) % 36000);
            worst = Math.max(worst, apart(angle, byHand));
            // And the aim line, drawn on the turf from the ball at that angle, runs across the
            // screen dead opposite the pull: the cross product of the two is nothing.
            const a = (angle * Math.PI) / 18000;
            const [tx, ty] = project(p, ball[0] + Math.cos(a) * 1000, ball[1] + Math.sin(a) * 1000);
            const [lx, ly] = [tx - bx, ty - by];
            const len = Math.hypot(lx, ly);
            // The sent angle is a whole hundredth of a degree, so the line can be off by half of one.
            expect(Math.abs((lx * dy - ly * dx) / (len * far))).toBeLessThan(0.0002);
            expect(lx * dx + ly * dy).toBeLessThan(0);
          }
        }
        expect(worst).toBe(0);
      });
    });
  }
});
