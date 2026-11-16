# Roadmap: the driving game

The garage-and-street-race games of around 1990, where the wrenching mattered as much as the
driving, but set now and with other people in it. Working name: **Pink Slips**.

You find a tired car on a marketplace app, wrench on it in your garage, cruise a town full of other
players, race for fun or for money, and try not to wreck it. The year builds to one weekend: the
Shootout.

**The garage is the game, and everything else is the test of what you built.**

## The loop

1. **The phone.** Marketplace apps for cars and parts, where the deals are. Performance sites for
   new parts at full price. A used-parts seller for what somebody else took off.
2. **The garage.** Fix what is worn, bolt on what you found, set it up.
3. **The town.** Cruise an open world that is also the lobby. Everyone you pass is a player.
4. **The challenge.** Pull up next to someone and race them for fun.
5. **The money.** Flashlight drags and roll races, for cash.
6. **The risk.** Crash and the car is hurt. Hurt enough and it is gone.
7. **The Shootout.** Once a year. Win an event there.

## The phone

Everything you buy comes through it, the way it does now.

| App | What is on it | The catch |
| --- | --- | --- |
| Marketplace | Cars and parts from sellers. Prices all over the place, and the occasional steal. | Listings go. Sellers lie. A car's real condition shows once it is in your garage. |
| Performance sites | New parts, every level, always in stock. | Full price. |
| The used-parts seller | Parts pulled off other cars, cheap. | What they have is what they have, and a used part is a worn part. |

Parts become things you own, with a condition of their own, so a part can be bought used, taken off
a car, sold on, or salvaged from a wreck.

## The garage

As it is in phase 1, and then:

- **Parts on and off.** What comes off goes on a shelf, to sell or to fit to the next car.
- **Cosmetics.** Paint, wheels, body kits, wings, tint, stickers. They do nothing for the timeslip
  and everything for the show.
- **Damage.** Bodywork, suspension and engine, each with a bill.

## The town

An open world that is the lobby: you drive it to get anywhere.

- Other players are other cars. Pull up to one and call them out, for fun, with nothing riding on it.
- Places to go: your garage, the parts counter, the spot where the flashlight drags are, the
  highway where the roll races are.
- Traffic, and somewhere to hit.

This is the biggest new piece: real-time driving with steering, on new netcode. It is also what
autocross needs, so the two are built on the same driving model.

## Racing

| Kind | What it is | For |
| --- | --- | --- |
| A challenge | Two players who met in town, from a stop | Fun |
| Flashlight drags | From a stop, on a back road. No tree: somebody drops a flashlight when they feel like it. | Money |
| Roll races | Side by side at an agreed speed, and go on the signal. No launch, so it is power and gearing. | Money |
| The strip | A prepared surface and a tree | Test and tune, and the Shootout |

The engine has the flashlight start already (the Back road preset's arm drop). Roll races need a
rolling start. Anything with money on it is run on the server.

## Crashing

Crashing costs you.

- **Damaged:** you lose the car until it is fixed, and fixing it is a bill.
- **Totaled:** it is not coming back. Take scrap price for the shell, or keep it long enough to
  pull the good parts off first.
- Which of those it is depends on how fast you were going and what you hit.

## The Shootout

Once a year, the one everybody builds for. It is a nod to the real import weekend in Ohio that
grew up around these cars, which has drag racing, an autocross and a car show. Three tournaments,
and you can enter any of them:

| Event | How it is won |
| --- | --- |
| Show car | Judged on the build: cosmetics, condition, and what the other players think of it. |
| Autocross | The quickest clean lap round the cones. Hit one and it costs time. |
| Index drag racing | You race to a set time for your class, not flat out. Closest without going quicker wins, so a slow car driven well beats a fast one driven badly. |

Still to settle: how often "a year" comes round in real time, and how you qualify.

## The cars

Our own makes and models. They are late-eighties and nineties cars, bought now, which is why they
are cheap and tired.

| Tier | What is in it | How you get one |
| --- | --- | --- |
| Shitboxes | An econobox hatch, a teacher's sedan, a wagon, a mini pickup, a minivan | The cash you start with |
| Sleepers | A hot hatch, a V8 pony car, a light roadster, a turbo sedan nobody suspects | Winnings, and watching the marketplace |
| Sought after | The Kagami Umbra AWD Turbo, a twin-rotor coupe, a twin-turbo grand tourer | Rare, and only ever as a project |

### Names

The cars are ours: a car can be a clear nod to a real one and still be its own car. The same goes
for businesses and events. A real parts seller or a real event would need their say-so to appear by
name, so until someone has asked them, they appear as nods with our own names. Asking is worth
doing: the real names would mean a lot to the people this is for.

## What open.parlor already has for it

| Already here | Becomes |
| --- | --- |
| Houses and their presets | Car clubs, with their own rules |
| The matchmaking lobby | The town |
| Tournaments | The Shootout's brackets |
| Watching | The fence at any race |
| Computer players | The locals, when nobody else is about |
| The card designer | Paint and stickers |
| The mini golf map editor | Autocross courses, and roads |
| 2D or 3D, the player's choice | The town flat and angled, or in three.js |

## Phases

One PR per piece, on a `staging/driving` branch until a phase is whole.

### Phase 1: the garage and the strip

- [ ] **The engine**: cars, parts, a drivetrain, a garage, and the drag race.
      [open.games#15](https://github.com/journey-to-code-org/open.games/pull/15).
- [ ] **The screens**: the garage, and the strip from behind the car, against the locals.
      [#179](https://github.com/journey-to-code-org/open.parlor/pull/179).
- [ ] **Garages on the server**, one a player.

### Phase 2: the phone

- [ ] **Parts as things**: owned, worn, taken off, sold on.
- [ ] **The marketplace**: sellers, deals, and condition you only learn afterwards.
- [ ] **The performance sites and the used-parts seller.**
- [ ] **Cosmetics**, and a car that looks like its build on the strip.

### Phase 3: money

- [ ] **Races on the server**, so nobody can see when the flashlight will drop.
- [ ] **Flashlight drags and roll races** between players, with the stake held and paid out.
- [ ] **Index racing**, ahead of the Shootout.

### Phase 4: the town

- [ ] **A driving model with steering**, in whole numbers like the rest.
- [ ] **The town** as the lobby: cruising, other players, places to go.
- [ ] **Challenges** between players who meet.
- [ ] **Crashes**: damage, repair bills, totaled cars, scrap and salvage.

### Phase 5: the Shootout

- [ ] **Autocross**: courses as data, cones, and an editor.
- [ ] **The show**: judging and votes.
- [ ] **The weekend itself**: entries, the three tournaments, and what winning one is worth.

## Decided

- Set now. The cars are old because they are cheap.
- It starts in a shitbox. The all-wheel-drive turbo coupe is one of the sought-after cars.
- Racing someone you meet in town is for fun. Money is at the flashlight drags and the roll races.
- Crashing costs you the car until it is fixed, and a totaled one is scrap or parts.
- The goal is to win an event at the Shootout: show car, autocross or index drag racing.

## Open questions

1. **The name.** Pink Slips is a working name, and with no pink-slip racing in this plan it may no
   longer fit.
2. **Are cars ever wagered,** or is it only ever cash?
3. **What the town looks like.** Flat and angled like mini golf, or three.js. It decides how much
   work phase 4 is.
4. **How long a year is.** A real year between Shootouts is a long wait. A month or a season is
   the proposal.
5. **The real names.** Whether to ask the parts seller and the event for theirs.
