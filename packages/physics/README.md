# @cardroom/physics

A small, deterministic 2D physics core for turn-based ball games: mini golf first, then billiards,
Carrom and bowling. Discs roll on a flat table, bounce off walls, bumpers and each other, slow
down, drop into holes, roll off ledges and go through pipes. No dependencies.

The games stay turn-based. A move is a shot (`{ body, angle, power }`, all whole numbers). The
server's engine plays the shot to rest and stores the resting table; every browser runs the same
shot from the same table to animate it; practice games run it locally; a restarted room replays
its shots. All of that only works if **the same world and shot give bit-identical results on every
JavaScript engine**, and that is what this package is built around.

## The determinism rules

| | |
| --- | --- |
| **May be used** | `+ - * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.round`. IEEE-754 and the language specify these exactly, so every engine gives the same bits. |
| **May not be used** | `Math.sin`, `cos`, `tan`, `atan2`, `pow`, `exp`, `log`, `hypot` and the rest, and the `**` operator. The language lets engines approximate them, and they do differ in the last digit. Also `Math.random`, `Date`, `performance`. |

- **Numbers** are ordinary doubles while a shot is moving and **whole numbers at rest**. Doubles
  restricted to the exact operations are as reproducible as integers and need no overflow care or
  hand-written fixed-point square roots; rounding at rest keeps stored tables small and exact and
  starts every shot from the same integers.
- **Angles** are whole hundredths of a degree (0 to 35999). `direction(angle)` turns one into a
  unit vector with a fixed polynomial (a Taylor series on the first eighth of the circle, Horner
  form, coefficients as exact divisions) after folding the angle with integer arithmetic. The
  compass points come out exact and the result is within a few last-place digits of the true sine
  and cosine. An aiming screen is free to use `Math.atan2` on a pointer position: what it sends
  is the rounded whole-number angle.
- **The step is fixed** and belongs to the world (`tickRate`), not to a clock or a frame rate.
- **Order is fixed**: bodies, walls, pockets, tunnels and regions are visited in the order the world
  lists them, and when two contacts fall at the same instant the first one found is taken. Nothing
  depends on object key order.
- Keep numeric literals short (17 significant digits at most); longer ones may be parsed
  differently between engines.

The tests hold the line: recorded shots are compared exactly (`test/fixtures.json`), a spy fails
the suite if a forbidden function is called during a shot, and the source is scanned for them.
Six hundred seeded shots were also run under both V8 (Node) and JavaScriptCore (Bun) and hashed to
the same digest.

**`PHYSICS_VERSION`** must be bumped by any change that could move where something comes to rest
(the fixtures will fail when that happens). A room restored by replaying shots lands on the same
table only under the same physics, so a game that replays its log should either keep the resting
tables in its state or refuse to replay across versions.

| Version | What changed |
| --- | --- |
| 1 | Discs, walls, pockets, regions. |
| 2 | Tunnels, one-way walls (ledges) and bumpers that kick. Nothing a version 1 world could say plays differently (the version 1 fixtures are unchanged), but a world can now say things version 1 would not understand, so a recorded shot names the version that played it. |

## The world

A table is plain JSON-serialisable data (`World` in `src/types.ts`); `validateWorld` lists what is
wrong with one in plain words. Lengths are whole numbers in a unit the game picks (the examples use
0.1 mm), speeds are units/s, accelerations units/s².

```ts
{
  bounds: { x, y, w, h },      // a ball whose centre leaves this is out ("bounds")
  tickRate: 120,               // steps per second
  maxTicks: 3600,              // a shot is stopped after this many steps
  friction: 5000,              // how fast a ball slows on open ground
  restSpeed: 100,              // slower than this, on ground that can hold it, a ball stops
  restitution: 0.9,            // ball on ball (a body may carry its own; the lower one wins)
  wallRestitution: 0.6,        // ball on wall, for walls that don't say
  maxShotSpeed: 40000,         // what power 1000 means
  bodies:  [{ id, x, y, r, mass?, fixed?, restitution?, kick? }],
  walls:   [{ id, points: [[x, y], ...], closed?, restitution?, oneWay? }],
  pockets: [{ id, x, y, r, maxSpeed? }],
  regions: [{ id, shape: { points } | { x, y, r }, friction?, slope?: [ax, ay], out? }],
  tunnels: [{ id, x, y, r, maxSpeed?, to: [x, y], angle, speed, ticks? }],   // may be left out
}
```

- **Bodies** are discs. Different masses and radii collide correctly (a Carrom striker, a bowling
  ball); `fixed` ones never move (bumpers, pegs). A body with `kick` is a bumper that pushes back:
  whatever touches it leaves at no less than that speed along the line between the two centres,
  however softly it arrived, so nothing ever comes to rest against one. After a shot a body may carry `pocketed: <pocket
  id>` or `out: <region id | "bounds">`; such a body takes no part until the game puts it back by
  clearing the field and setting `x`, `y`.
- **Walls** are chains of straight pieces with no thickness, solid from both sides; `closed` makes
  a polygon. Corners and ends behave as points a ball rolls round, so there are no seams to snag on.
  A `oneWay` wall is a **ledge**: walking along its points in the order listed (with y down the
  screen), a ball on the left rolls straight through and a ball on the right is stopped. A ball
  that has dropped off cannot get back up, even if a slope pushes it against the riser. End a
  ledge on ordinary walls: its own end points stop only what the ledge itself would stop.
- **Pockets** take a ball whose centre is over them. With `maxSpeed`, a faster ball skips across
  (a `skip` event) and drops only if it is slow enough while still over the hole: a golf cup.
  Without it the hole takes anything: a pool pocket.
- **Tunnels** are pipes. A ball whose centre comes over the mouth (a circle) goes in, at any speed
  or, with `maxSpeed`, only at that speed or slower (a faster ball carries on over it, and goes in
  after all if it is turned back and slows down while still over the mouth). It is off the table
  for `ticks` steps, then comes out at `to` rolling at `speed` in the direction `angle` (hundredths
  of a degree, like a shot), whatever it went in at. A mouth is found on the way like a wall is, so
  it cannot be jumped. A shot is not over while a ball is inside; if `maxTicks` runs out first the
  ball is set down at `to`. Keep `to` a ball's radius clear of walls and outside the mouth.
- **Regions** act on a ball whose centre is inside. The last listed one with `friction` sets the
  friction (sand, rough); every `slope` adds a steady pull; `out` (water) removes the ball. Regions
  and the bounds are checked at the end of each step, so make water wider than a ball travels in
  one step at full power.

`POOL_TABLE`, `GOLF_HOLE` and `GARDEN_HOLE` (a ledge, a pipe and a bumper) are worked examples,
used by the tests.

## Using it

```ts
simulate(world: World, shot?: Shot): SimResult         // play to rest in one call
frames(world: World, shot?: Shot): Generator<Frame, SimResult, void>   // one step at a time
start(world: World, shot?: Shot): Run                  // the same by hand:
step(run: Run): Frame                                  //   one step
result(run: Run): SimResult                            //   once run.done
validateWorld(world: unknown): string[]
validateShot(world: World, shot: unknown): string[]
direction(angle: number): [x: number, y: number]
```

**A game engine** applies a move with `simulate`. It is pure: the world passed in is never
changed. `start` (and so `simulate`) throws a `PhysicsError` on a bad world or shot, so a shot from
a browser can be passed straight in.

```ts
const { world, events, firstContact, capped } = simulate(state.table, { body: "cue", angle, power });
// Pool: no firstContact, or the wrong ball first, or the cue ball in events as "pocket": a foul.
// Golf: a stroke; an "out" event is a penalty and the ball goes back; "pocket" finishes the hole.
```

Events are `hit` (two bodies), `wall`, `pocket`, `skip`, `out`, `tunnel` (a ball went in), `emerge`
(it came out) and `capped`, each with the `tick` it happened in and the ids of what was involved;
`hit` and `wall` carry the closing `speed` for choosing a sound. Things that stay touching report
once. They say what happened and when, never how to show it: a canvas and a 3D scene can both be
driven from them.

**A canvas** draws the same shot with `frames` (or `start`/`step` from an animation loop), taking
`world.tickRate / 60` steps per screen frame and playing each frame's `events` as they come. The
stepped run is the same code taking the same steps, so its last frame is exactly the table the
server stored. A frame's body that is inside a tunnel is not `live` and carries `in: <tunnel id>`.

**Bounded.** Each step finds the earliest moment anything touches anything and moves no further,
so nothing passes through a wall or another ball at any speed. A shot ends when everything has been
still for a few steps, or at `maxTicks`: then everything is stopped where it is, `capped` is true
and a `capped` event is the last one.

## Not here yet

- **Spin.** `Shot.spin` and `Body.spin` are reserved and must be absent or zero; the validator
  refuses anything else, so no recorded shot can change meaning when spin arrives. Collisions have
  no friction along the line of contact (no throw, no english off a cushion).
- **Contacts at the same instant are settled one after another**, in the world's order. A dead
  straight break into a tight rack is therefore not mirror-symmetric: the lower-numbered side
  takes more of it. Billiards will want this looked at (a joint solve for simultaneous contacts,
  and a version bump) before it ships.
- A ball skimming over a cup is not pulled towards it; it either drops or doesn't.
- **Height.** The table is flat. A ledge is a wall that works one way and a slope is a steady pull;
  neither knows how high anything is, and a ball never leaves the ground. A game that wants to
  draw heights keeps them beside the world, as mini golf's holes do.
- Rolling and sliding are one friction number; there is no separate sliding phase.
