// Who is in Zubra Quest, modelled from solid shapes (retro/clay.ts) at the screen's fine size: Zub
// is 32 pixels by 48, twice as tall as wide the way a sixteen-bit hero is, and walks in four frames;
// what he fights is 32 square; a boss is 64. Each is a small function of a frame number, so the
// pieces that move (legs, wings, a jaw) are moved and the picture made again.
import { Clay, mat } from "../retro/clay";
import { flipped, rgb, type Rgb, type Sprite } from "../retro/pixels";

const BLACK: Rgb = [16, 14, 30];
const WHITE: Rgb = [255, 255, 255];
const M = {
  coat: mat("#f4f4fa"), stripe: mat("#34344e"), muzzle: mat("#9aa0b8"), hoof: mat("#3a3c58"),
  blue: mat("#3c8ce4"), red: mat("#e8434c"), orange: mat("#f09a30"), green: mat("#4cb848"), leaf: mat("#2e8a3c"),
  lime: mat("#8cd850"), purple: mat("#8a4cc8"), violet: mat("#5a3aa0"), teal: mat("#4cd8c0"), pink: mat("#f88cc8"),
  brown: mat("#a06c40"), tan: mat("#d8a870"), hide: mat("#7a4c2c"), steel: mat("#a8b0c8"), iron: mat("#6c7490"),
  gold: mat("#f4c838"), robe: mat("#7a4cb0"), beard: mat("#eceef8"), grey: mat("#b8bcd0"), crimson: mat("#c02838"),
  bone: mat("#f4ecd8"), ember: mat("#f07828"), night: mat("#2a1e48"),
};
const STRIPE = M.stripe.tones[1];

interface Look { tunic: typeof M.blue; scarf: typeof M.red; coat: typeof M.coat }
const ZUB_LOOK: Look = { tunic: M.blue, scarf: M.red, coat: M.coat };

/** A zebra seen from the front or the back. `step` is 0 standing, or 1 to 4 through a walk. */
function zebra(look: Look, back: boolean, step: number): Sprite {
  const c = new Clay(32, 48);
  const lift = [0, 3, 0, 0, 0][step]!;
  const lift2 = [0, 0, 0, 3, 0][step]!;
  const bob = step === 2 || step === 4 ? 1 : 0;
  const swing = [0, 2, 0, -2, 0][step]!;
  if (back) { c.limb(16, 36 + bob, 16, 41 + bob, 1.5, M.stripe); c.ball(16, 43 + bob, 2, 2, M.stripe); }
  // Legs and hooves.
  c.limb(12, 37, 12, 43 - lift, 3, look.coat);
  c.limb(20, 37, 20, 43 - lift2, 3, look.coat);
  c.ball(12, 45 - lift, 3.6, 2.2, M.hoof);
  c.ball(20, 45 - lift2, 3.6, 2.2, M.hoof);
  // Arms behind the body, then the tunic over them.
  c.limb(7.5, 30 + bob, 6.5, 36 + bob + swing, 2.6, look.coat);
  c.limb(24.5, 30 + bob, 25.5, 36 + bob - swing, 2.6, look.coat);
  const body = c.ball(16, 33 + bob, 8.6, 7.6, look.tunic);
  c.mark(9, 36 + bob, 23, 36 + bob, look.tunic.tones[3], body);
  c.ball(16, 26.5 + bob, 8.4, 3.2, look.scarf);
  if (!back) c.limb(21, 28 + bob, 23, 32 + bob, 1.6, look.scarf);
  // Ears, then the head over them.
  for (const x of [6.5, 25.5]) { c.ball(x, 6 + bob, 3, 5, look.coat); c.spot(x, 7 + bob, 1.2, 2.6, back ? STRIPE : rgb("#f8a8c0")); }
  const head = c.ball(16, 15.5 + bob, 11.5, 10.5, look.coat);
  if (back) {
    // The mane down the back of the head, and the stripes that run off it.
    for (const y of [10, 14, 18, 22]) { c.mark(6, y + bob + 1, 12, y + bob, STRIPE, head, 2); c.mark(20, y + bob, 26, y + bob + 1, STRIPE, head, 2); }
    c.ball(16, 13 + bob, 3, 10, M.stripe);
  } else {
    for (const s of [-1, 1]) {
      c.mark(16 + s * 10, 13 + bob, 16 + s * 7, 14 + bob, STRIPE, head, 2);
      c.mark(16 + s * 11, 17 + bob, 16 + s * 8, 18 + bob, STRIPE, head, 2);
      c.mark(16 + s * 4, 6 + bob, 16 + s * 5, 10 + bob, STRIPE, head, 2);
    }
    c.ball(16, 21.5 + bob, 7.2, 4.4, M.muzzle);
    c.spot(13, 22 + bob, 1, 1.2, BLACK);
    c.spot(19, 22 + bob, 1, 1.2, BLACK);
    for (const x of [11, 21]) { c.spot(x, 14.5 + bob, 2, 3, BLACK); c.spot(x - 0.6, 13.2 + bob, 0.8, 1, WHITE); }
    c.ball(16, 5.5 + bob, 3.2, 4, M.stripe);
  }
  return c.done();
}

/** A zebra seen from his right side. */
function zebraSide(look: Look, step: number): Sprite {
  const c = new Clay(32, 48);
  const stride = [0, 4, 0, -4, 0][step]!;
  const bob = step === 2 || step === 4 ? 1 : 0;
  c.limb(14, 37, 14 - stride, 43, 3, look.coat);
  c.ball(14 - stride + 0.6, 45, 3.6, 2.2, M.hoof);
  c.limb(18, 37, 18 + stride, 43, 3, look.coat);
  c.ball(18 + stride + 0.6, 45, 3.6, 2.2, M.hoof);
  c.limb(11, 36 + bob, 9, 41 + bob, 1.4, M.stripe);
  const body = c.ball(16, 33 + bob, 7.4, 7.6, look.tunic);
  c.mark(10, 36 + bob, 22, 36 + bob, look.tunic.tones[3], body);
  c.limb(16, 30 + bob, 16 + stride * 0.8, 36.5 + bob, 2.6, look.coat);
  c.ball(16, 26.5 + bob, 7.6, 3.2, look.scarf);
  c.limb(10, 27 + bob, 7, 31 + bob, 1.6, look.scarf);
  // The mane stands along the back of the head; the ear in front of it; the muzzle out ahead.
  c.ball(6.5, 13 + bob, 3, 8.5, M.stripe);
  c.ball(11, 5.5 + bob, 4.5, 3.4, M.stripe);
  c.ball(12.5, 6.5 + bob, 2.8, 4.8, look.coat);
  const head = c.ball(15, 15.5 + bob, 10.5, 10.5, look.coat);
  c.mark(7, 13 + bob, 11, 14 + bob, STRIPE, head, 2);
  c.mark(7, 18 + bob, 11, 19 + bob, STRIPE, head, 2);
  c.mark(13, 6 + bob, 14, 10 + bob, STRIPE, head, 2);
  c.ball(24, 20.5 + bob, 6, 4.6, M.muzzle);
  c.spot(27.5, 20 + bob, 1, 1.2, BLACK);
  c.spot(19.5, 14 + bob, 2, 3, BLACK);
  c.spot(19, 12.8 + bob, 0.8, 1, WHITE);
  return c.done();
}

const walk = (make: (step: number) => Sprite): Sprite[] => [0, 1, 2, 3, 4].map(make);
const side = walk((step) => zebraSide(ZUB_LOOK, step));
/** Zub by the way he faces (right, down, left, up): standing, then the four frames of a walk. */
export const ZUB: Sprite[][] = [side, walk((step) => zebra(ZUB_LOOK, false, step)), side.map(flipped), walk((step) => zebra(ZUB_LOOK, true, step))];

function elder(): Sprite {
  const c = new Clay(32, 48);
  c.ball(16, 39, 10, 8, M.robe);
  c.shape([[7, 30], [25, 30], [27, 46], [5, 46]], M.robe);
  c.limb(7, 31, 6, 38, 2.4, M.robe);
  c.limb(25, 31, 26, 38, 2.4, M.robe);
  for (const x of [6.5, 25.5]) c.ball(x, 7, 3, 5, M.grey);
  const head = c.ball(16, 15.5, 11.5, 10.5, M.grey);
  for (const s of [-1, 1]) { c.mark(16 + s * 10, 13, 16 + s * 7, 14, M.iron.tones[1], head, 2); c.mark(16 + s * 4, 6, 16 + s * 5, 10, M.iron.tones[1], head, 2); c.mark(16 + s * 7, 12, 16 + s * 3, 13, BLACK, head); }
  c.ball(16, 6, 3.2, 3.6, M.beard);
  c.ball(16, 21.5, 7.2, 4.4, M.muzzle);
  c.ball(16, 27, 6.5, 7.5, M.beard);
  c.shape([[10, 28], [22, 28], [16, 38]], M.beard);
  for (const x of [11.5, 20.5]) c.spot(x, 15.5, 1.8, 1, BLACK);
  // A staff.
  c.limb(27, 22, 27, 45, 1.3, M.brown);
  c.ball(27, 20, 2.6, 2.6, M.gold);
  return c.done();
}
export const FOLK: Record<string, Sprite> = { elder: elder(), keeper: zebra({ tunic: M.orange, scarf: M.green, coat: M.coat }, false, 0) };

// ---- What he fights: 32 pixels square, two frames each -------------------------------------------

const eyes = (c: Clay, x1: number, x2: number, y: number, r = 1.6, glint = true) => { for (const x of [x1, x2]) { c.spot(x, y, r, r * 1.4, BLACK); if (glint) c.spot(x - 0.5, y - 1, 0.7, 0.7, WHITE); } };

function slime(f: number): Sprite {
  const c = new Clay(32, 32);
  c.ball(16, 21 + f, 12 + f, 9 - f, M.green);
  c.ball(16, 16 + f, 8.5, 7, M.green);
  c.spot(11, 13 + f, 2.6, 1.6, M.lime.tones[0]);
  eyes(c, 12, 20, 20 + f);
  c.spot(16, 25 + f, 2.5, 1, BLACK);
  return c.done();
}
function skitter(f: number): Sprite {
  const c = new Clay(32, 32);
  for (const s of [-1, 1]) for (let n = 0; n < 3; n++) { const reach = n === 1 ? f * 2 : -f * 2; c.limb(16 + s * 5, 18 + n * 2, 16 + s * 11, 12 + n * 5 + reach, 1, M.night); c.limb(16 + s * 11, 12 + n * 5 + reach, 16 + s * 13, 20 + n * 4 + reach, 1, M.night); }
  c.ball(16, 23, 7, 6, M.crimson);
  c.spot(16, 24, 2, 2.6, M.gold.tones[1]);
  c.ball(16, 16, 6, 5, M.orange);
  for (const x of [13, 19]) c.spot(x, 15, 1.4, 1.4, M.gold.tones[0]);
  for (const x of [13.4, 19.4]) c.spot(x, 15.4, 0.7, 0.7, BLACK);
  return c.done();
}
function bat(f: number): Sprite {
  const c = new Clay(32, 32);
  const tip = f ? 22 : 6;
  for (const s of [-1, 1]) {
    c.shape([[16 + s * 3, 14], [16 + s * 14, tip], [16 + s * 12, tip + (f ? -6 : 7)], [16 + s * 9, 15], [16 + s * 6, f ? 14 : 20], [16 + s * 3, 19]], M.violet);
    c.shape([[16 + s * 3, 8], [16 + s * 6, 3], [16 + s * 6, 10]], M.purple, 1);
  }
  c.ball(16, 15, 5.6, 6.4, M.purple);
  for (const x of [13.5, 18.5]) c.spot(x, 13.5, 1.6, 1.6, WHITE);
  for (const x of [13.8, 18.2]) c.spot(x, 13.8, 0.8, 0.9, BLACK);
  for (const x of [14.5, 17.5]) c.spot(x, 18.5, 0.6, 1.2, WHITE);
  return c.done();
}
function spitter(f: number): Sprite {
  const c = new Clay(32, 32);
  for (const s of [-1, 1]) c.shape([[16, 28], [16 + s * 12, 24 + f], [16 + s * 8, 30]], M.leaf);
  c.limb(16, 24, 16, 29, 2.4, M.leaf);
  for (const [x, y] of [[16, 6], [8, 10], [24, 10], [11, 5], [21, 5]] as const) c.ball(x, y + f, 4, 3.4, M.pink);
  c.ball(16, 16 + f, 9.4, 9, M.green);
  c.spot(11, 11 + f, 2.4, 1.4, M.lime.tones[0]);
  eyes(c, 12, 20, 15 + f, 1.4);
  c.spot(16, 21 + f, 3.4, 2 + f, rgb("#5a1030"));
  return c.done();
}
function charger(f: number, big = false): Sprite {
  const z = big ? 2 : 1;
  const c = new Clay(32 * z, 32 * z);
  const p = (n: number) => n * z;
  for (const [x, lift] of [[9, f], [23, 1 - f]] as const) { c.limb(p(x), p(22), p(x), p(27 - lift), p(2.6), M.hide); c.ball(p(x), p(28.5 - lift), p(3), p(1.8), M.hoof); }
  c.ball(p(16), p(16), p(13), p(10), M.brown);
  // A ridge of bristles down the back.
  for (let n = 0; n < 5; n++) c.shape([[p(8 + n * 4), p(8)], [p(10 + n * 4), p(3 - (n % 2))], [p(12 + n * 4), p(8)]], M.hide, 2);
  for (const s of [-1, 1]) c.shape([[p(16 + s * 9), p(9)], [p(16 + s * 13), p(4)], [p(16 + s * 12), p(12)]], M.hide, 1);
  c.ball(p(16), p(19), p(9), p(8), M.brown);
  c.ball(p(16), p(23.5), p(5.2), p(3.6), M.tan);
  for (const x of [14, 18]) c.spot(p(x), p(23.5), p(0.8), p(1.1), BLACK);
  for (const s of [-1, 1]) c.shape([[p(16 + s * 5), p(24)], [p(16 + s * 9), p(18)], [p(16 + s * 7.6), p(25.5)]], M.bone, 0);
  for (const s of [-1, 1]) { c.spot(p(16 + s * 4.5), p(17), p(1.5), p(1.7), big ? rgb("#ff4040") : BLACK); c.mark(p(16 + s * 7), p(13.5), p(16 + s * 3), p(15), BLACK, 0); }
  for (const s of [-1, 1]) for (let n = 0; n < (big ? 4 : 2); n++) c.spot(p(16 + s * 6) - n * s, p(14) + n, 1, 1, BLACK);
  return c.done();
}
function knight(f: number): Sprite {
  const c = new Clay(32, 32);
  for (const [x, lift] of [[12, f], [20, 1 - f]] as const) { c.limb(x, 23, x, 27 - lift, 2.6, M.iron); c.ball(x, 28.5 - lift, 3.2, 1.8, M.iron); }
  c.limb(24, 18, 27, 24, 1.2, M.steel);
  c.shape([[26, 12], [28, 12], [28, 24], [26, 24]], M.steel, 0);
  const body = c.ball(16, 20, 8, 7, M.steel);
  c.mark(9, 22, 23, 22, M.iron.tones[2], body);
  c.shape([[3, 14], [12, 14], [12, 23], [7.5, 28], [3, 23]], M.blue);
  c.spot(7.5, 19, 1.6, 2.4, M.gold.tones[1]);
  c.shape([[14, 3], [18, 3], [20, 0], [12, 0]], M.crimson, 1);
  c.ball(16, 10, 7.4, 7.4, M.steel);
  c.spot(16, 10.5, 5.2, 1.7, BLACK);
  for (const x of [13.6, 18.4]) c.spot(x, 10.5, 0.9, 0.9, rgb("#ff5050"));
  return c.done();
}
function wisp(f: number, big = false): Sprite {
  const z = big ? 2 : 1;
  const c = new Clay(32 * z, 32 * z);
  const p = (n: number) => n * z;
  const lean = f ? 2 : -2;
  const body = big ? M.purple : M.teal;
  c.shape([[p(16 + lean), p(1)], [p(8), p(16)], [p(24), p(16)]], body, 1);
  c.shape([[p(10 - lean), p(6)], [p(7), p(18)], [p(14), p(16)]], body, 1);
  c.ball(p(16), p(19), p(10), p(10), body);
  c.ball(p(16), p(21), p(6), p(6), big ? M.pink : mat("#d8fff4"));
  eyes(c, p(13), p(19), p(19), p(1.4), false);
  c.spot(p(16), p(24), p(1.6), p(1.2 + f * 0.6), BLACK);
  return c.done();
}
const pair = (make: (f: number) => Sprite): [Sprite, Sprite] => [make(0), make(1)];
export const FOES: Record<string, [Sprite, Sprite]> = { slime: pair(slime), skitter: pair(skitter), bat: pair(bat), spitter: pair(spitter), charger: pair((f) => charger(f)), knight: pair(knight), wisp: pair((f) => wisp(f)) };

// ---- The bosses: 64 pixels square -----------------------------------------------------------------

function maw(open: boolean): Sprite {
  const c = new Clay(64, 64);
  for (const s of [-1, 1]) { c.shape([[32, 60], [32 + s * 30, 50], [32 + s * 22, 62]], M.leaf); c.shape([[32, 58], [32 + s * 24, 40], [32 + s * 12, 60]], M.leaf); }
  c.limb(32, 50, 32, 60, 5, M.leaf);
  const bulb = c.ball(32, 30, 26, 24, M.green);
  for (const [x, y, r] of [[16, 18, 4], [24, 12, 2.4], [46, 14, 3], [50, 24, 2], [14, 30, 2]] as const) c.spot(x, y, r, r * 0.8, M.lime.tones[1]);
  // Thorns round its crown.
  for (let n = 0; n < 7; n++) { const x = 11 + n * 7; c.shape([[x - 3, 11 + Math.abs(n - 3) * 2.6], [x, 2 + Math.abs(n - 3) * 2.4], [x + 3, 11 + Math.abs(n - 3) * 2.6]], M.bone, n % 2); }
  for (const s of [-1, 1]) { c.spot(32 + s * 10, 22, 4.4, 3.4, M.gold.tones[0]); c.spot(32 + s * 10, 22.4, 1.6, 3, BLACK); c.mark(32 + s * 16, 16, 32 + s * 5, 19, BLACK, bulb, 2); }
  if (open) {
    c.spot(32, 38, 19, 11, rgb("#4a0c24"));
    c.spot(32, 43, 10, 5, rgb("#e84868"));
    for (let n = 0; n < 7; n++) { const x = 16 + n * 5.4; c.spot(x, 29.6 + Math.abs(n - 3) * 1.2, 1.8, 3, WHITE); c.spot(x, 46.6 - Math.abs(n - 3) * 1.4, 1.6, 2.6, WHITE); }
  } else {
    c.mark(13, 36, 51, 36, BLACK, bulb, 2);
    for (let n = 0; n < 9; n++) c.spot(15 + n * 4.3, 36 + (n % 2 ? 2.4 : -1.6), 1.6, 2.2, WHITE);
  }
  return c.done();
}
function gloom(): Sprite {
  const c = new Clay(64, 64);
  c.shape([[10, 30], [54, 30], [56, 58], [48, 50], [42, 61], [36, 51], [32, 62], [28, 51], [22, 61], [16, 50], [8, 58]], M.violet);
  for (const s of [-1, 1]) { c.limb(32 + s * 20, 34, 32 + s * 27, 42, 3.4, M.violet); c.ball(32 + s * 28, 44, 3.6, 3, mat("#c8b8f0")); }
  c.ball(32, 26, 22, 23, M.purple);
  c.shape([[26, 4], [32, 0], [38, 4]], M.purple, 0);
  c.spot(32, 28, 13.5, 14, rgb("#120a28"));
  for (const s of [-1, 1]) { c.spot(32 + s * 6, 26, 3.6, 2.4, M.gold.tones[0]); c.spot(32 + s * 6, 26, 1.4, 1.4, WHITE); }
  return c.done();
}
function quagg(): Sprite {
  const c = new Clay(64, 64);
  c.shape([[14, 28], [50, 28], [60, 61], [4, 61]], M.crimson);
  for (const [x, s] of [[26, -1], [38, 1]] as const) { c.limb(x, 50, x + s, 58, 3.6, M.night); c.ball(x + s, 60.5, 4.6, 2.4, M.hoof); }
  for (const s of [-1, 1]) { c.limb(32 + s * 12, 36, 32 + s * 16, 47, 3.2, M.tan); c.ball(32 + s * 16.5, 49, 3.4, 3, M.hide); }
  const chest = c.ball(32, 42, 12, 12, M.violet);
  c.mark(22, 46, 42, 46, M.gold.tones[1], chest, 2);
  c.spot(32, 40, 3, 3.6, M.gold.tones[0]);
  c.ball(32, 31, 12, 4, M.gold);
  for (const s of [-1, 1]) { c.ball(32 + s * 14, 9, 4, 6.4, M.tan); c.spot(32 + s * 14, 10, 1.6, 3.4, M.hide.tones[2]); }
  const head = c.ball(32, 19, 15, 13, M.tan);
  for (const s of [-1, 1]) {
    c.mark(32 + s * 14, 15, 32 + s * 9, 17, M.hide.tones[2], head, 2);
    c.mark(32 + s * 14, 21, 32 + s * 10, 22, M.hide.tones[2], head, 2);
    c.mark(32 + s * 5, 7, 32 + s * 6, 12, M.hide.tones[2], head, 2);
    c.mark(32 + s * 10, 12.5, 32 + s * 3, 15.5, BLACK, head, 2);
    c.spot(32 + s * 6, 18, 2.6, 2.4, rgb("#ff3838"));
    c.spot(32 + s * 6, 18, 1, 1.6, BLACK);
  }
  c.ball(32, 26, 9, 5.6, mat("#f0d0a0"));
  for (const x of [28.5, 35.5]) c.spot(x, 26, 1.2, 1.5, BLACK);
  c.mark(27, 29.5, 37, 29.5, M.hide.tones[3], 0);
  c.shape([[20, 9], [22, 0], [27, 6], [32, -1], [37, 6], [42, 0], [44, 9]], M.gold, 0);
  c.shape([[20, 9], [44, 9], [44, 12], [20, 12]], M.gold, 1);
  for (const x of [26, 32, 38]) c.spot(x, 10.5, 1.2, 1.2, rgb("#e83858"));
  return c.done();
}
export const BOSSES: Record<string, Sprite> = { maw: maw(false), "maw:open": maw(true), tusker: charger(0, true), gloom: gloom(), quagg: quagg() };
