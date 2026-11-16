# Roadmap: the driving game

A driving game in the spirit of the garage-and-street-race games of around 1990, where the
wrenching mattered as much as the driving, but with other people in it. Working name: **Pink
Slips**.

**The garage is the game, and the race is the test of what you built.**

## The loop

1. **Classifieds.** Buy something tired with the cash you start with.
2. **Garage.** Fix what is worn, bolt on what you can afford, set the gearing.
3. **The hangout.** A lot where people park, show what they built and call each other out.
4. **The wager.** Race for nothing, for cash, or for pink slips.
5. **The race.** A drag strip first; later a run down a road through traffic.
6. **The King.** Every house has one. Beat them and it is you.

## The cars

Our own makes and models, from the late eighties and early nineties. No licensed names or badges:
a car can be a clear nod to a real one and still be its own car, with its own name and its own
shape. A player can call their car whatever they like.

| Tier | What is in it | How you get one |
| --- | --- | --- |
| Shitboxes | An econobox hatch, a teacher's sedan, a wagon, a mini pickup, a minivan | The cash you start with |
| Sleepers | A hot hatch, a V8 pony car, a light roadster, a turbo sedan nobody suspects | Winnings, and watching the classifieds |
| Sought after | The Kagami Umbra AWD Turbo, a twin-rotor coupe, a twin-turbo grand tourer | Mostly pink slips, and the King |

What keeps the top tier sought after:

- They are rare in the classifieds, and only ever turn up as basket cases.
- A clean one changes hands on the strip.
- Everyone in a house can see who owns the few there are.
- A fully built shitbox that beats one pays more, so the first car is worth keeping.

## What open.parlor already has for it

| Already here | Becomes |
| --- | --- |
| Houses and their presets | Car clubs with their own King and rules: pinks allowed or not, class limits |
| The matchmaking lobby and open tables | The hangout |
| Tournaments | Bracket nights, raced over days |
| Watching, and all-bot games | The fence. Watch a race, or put two computer drivers on the line to learn from |
| Computer players at every skill | The locals, on the way up to the King |
| The card designer | Paint |
| The mini golf map editor | Roads, in phase 3 |
| 2D or 3D, the player's choice | A road drawn flat and angled, or a cockpit in three.js |

## Phases

One PR per piece, as ever, on a `staging/driving` branch until a phase is whole.

### Phase 1: the garage and the drag strip

- [ ] **The engine.** In open.games: the cars, the parts, a whole-number drivetrain, the garage,
      and the race as an arcade game (`pinkslips`). Open as
      [open.games#15](https://github.com/journey-to-code-org/open.games/pull/15).
- [ ] **The strip.** A screen for the race: the tree, the lanes, and a tachometer you can shift by.
      Throttle and shifting that work on a phone. Sounds for the revs, the tyres and the turbo.
- [ ] **The garage.** A screen for one car at a time: its spec sheet, the timeslip it would run,
      parts with what each costs, repairs, and the classifieds. Garages saved on the server, one a
      player.
- [ ] **Test and tune.** A pass alone against the clock, and practice against a computer driver,
      with wear going back to the car.
- [ ] **A tile on the front page**, in the arcade section.

### Phase 2: the hangout and the wager

- [ ] **Races on the server.** A room that steps the race itself and sends out views, so nobody can
      look at when an arm will drop. Needed before anything rides on a race.
- [ ] **Call-outs.** Challenge someone in the lot, agree the terms, line up.
- [ ] **Cash and pink slips.** The wager held by the server and paid out on the result. A house
      preset decides whether pinks are allowed. Losing your only car leaves you enough for a
      shitbox.
- [ ] **The locals.** Computer drivers with cars and names, to race when nobody else is about.
- [ ] **Bracket racing.** Each car dials in the time it expects to run and the slower one leaves
      first, so a shitbox and a top car can have a fair race.

### Phase 3: the road

The hard one, and the one that needs new netcode, so it comes after the rest is fun.

- [ ] **A point-to-point run**: a road, traffic, and the law.
- [ ] **Damage**, and what it costs to put right.
- [ ] **The cockpit view** in three.js, and the flat view for everyone else.
- [ ] **Roads as data**, and an editor for them.

### Phase 4: the town

- [ ] **The King**, by house, with seasons.
- [ ] **A classifieds between players**: sell what you built to someone who wants it.
- [ ] **Club garages**, and bracket nights between houses.
- [ ] **Paint and liveries.**

## Decided

- It starts in the late eighties and nineties, in a shitbox. No hot rod era.
- The all-wheel-drive turbo coupe is one of the sought-after cars, not a starter.
- Our own car names. A car won on a pink slip arrives exactly as it left: parts, wear and all.

## Open questions

1. **The name.** Pink Slips is a working name.
2. **Pink slips by default?** On, with a house preset to turn them off, is the proposal.
3. **Does a garage belong to a player or to a player in a house?** One garage a player is simpler.
   One a house keeps each house's ladder its own.
