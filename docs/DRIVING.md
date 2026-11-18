# Roadmap: Road to the Shootout

> **Where the game is now.** The game the parlor serves is no longer the one this roadmap was
> written for. It was rebuilt as an engine in Rust, compiled to WebAssembly, that plays a pack of
> content (cars, rooms, parts, rivals, maps), with a workshop page for making packs. It is built
> in [journey-to-code-org/wasm-toolkit](https://github.com/journey-to-code-org/wasm-toolkit) and
> kept here as files: see [packages/wasm](../packages/wasm/README.md#road-to-the-shootout). What
> follows is the plan for the game as it was first meant, kept for what has yet to be carried
> over: playing with other people, the phone, and the Shootout itself.

The garage-and-street-race games of around 1990, where the wrenching mattered as much as the
driving, but set now and with other people in it. It is called **Road to the Shootout**.

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
5. **The money.** Flashlight drags and roll races, for cash or for the car.
6. **The risk.** Crash and the car is hurt. Hurt enough and it is gone.
7. **The Shootout.** Once a year. Win an event there.

### The garage is a place

The garage screen is a drawn room, not a list. You pick the thing you mean: the paper on the bench
(classifieds), the laptop (parts sites), the tool wall, the shelf, the board (the house), the hood,
the body, underneath, and the door. A part goes on or comes off by undoing its bolts on the car.
Out the door is a junction: the strip, where the locals pull up one at a time, the mountain road,
and Morgantown. The pictures are in `packages/web/src/drive/Scenes.tsx`.

## The phone

Everything you buy comes through it, the way it does now.

| App | What is on it | The catch |
| --- | --- | --- |
| Marketplace | Cars and parts from sellers. Prices all over the place, and the occasional steal. | Listings go. Sellers lie. A car's real condition shows once it is in your garage. |
| Performance sites | New parts, every level, always in stock. | Full price. |
| Rix Racing | Used parts, pulled off other cars, cheap. | What they have is what they have, and a used part is a worn part. |

Parts become things you own, with a condition of their own, so a part can be bought used, taken off
a car, sold on, or salvaged from a wreck.

### The marketplace is other players

What is for sale is what players are selling: parts they took off, cars they are done with, and
whole parts cars. That makes parting out a way to play:

- **Buy a parts car, tear it down, sell the pieces.** A car nobody would drive can be worth more in
  boxes than it cost on a trailer, if you have the tools and the patience.
- **You are not the only one who knows that.** Ricky at Rix Racing is in the same market, and so
  are a handful of other scrappers, all of them computer players. They see a cheap parts car as
  soon as you do, they know what every piece is worth, and they undercut. Beating them means being
  quicker to a listing, knowing what they miss, or selling what they do not have.
- The scrappers also keep the market alive when few players are on: there is always something for
  sale, and always somebody who will buy a part at a price.

## The garage

A garage belongs to a player. As it is in phase 1, and then:

- **Tools.** The garage starts empty, and a job needs its tool: a jack to change tyres, wrenches
  to swap parts, a hammer to beat out damage. Buy each once and it is yours. It is a small thing,
  there to make the first hour feel like starting from nothing.
- **Parts on and off.** What comes off goes on a shelf, to sell or to fit to the next car.
- **Cosmetics.** Paint, wheels, body kits, wings, tint, stickers. They do nothing for the timeslip
  and everything for the show.
- **Damage.** Bodywork, suspension and engine, each with a bill.

## Keeping it alive

An engine is something you watch, not a number that goes down.

- **Oil pressure.** A gauge on the dash. It sags when the oil is old or low, when the engine is
  worn, and when it is revved hard and hot. Drive on with it low and the engine goes.
- **Tuning.** Fuel and boost are yours to set, and the air-fuel ratio says whether you got it
  right. Lean makes power until it melts something. Rich is safe, slow, and fouls the plugs. Every
  part that changes how the engine breathes moves the tune, so a new part means tuning again.
- **Plugs, oil and the rest.** Small things that wear, cost little, and end a night when ignored.

### Getting it tuned

Setting the fuel yourself is guesswork with a gauge. There are two ways to have it done properly.

- **The dyno, in Morgantown.** Drive out there, pay, and it comes back right. It is a drive, and
  it is not cheap.
- **A remote tune.** A tuner logs in to a laptop on the passenger seat, and you do the pulls for
  him on the road: foot flat, through the gears, while he changes things. It costs less. It is
  also a public road at night, and there are deer on it. Lift, and the pull is wasted. Hit one,
  and you have a different problem.

## From the driver's seat

The other half of what this is after: the road games of the same years, played from behind the
wheel on a real road with other cars on it.

- **The cockpit.** The view from the driver's seat: the dash with its gauges, the wheel, the hood,
  and a shifter that moves through the gate. The chase view stays for whoever prefers it.
- **A road with steering.** A run from one end of a mountain road to the other, with a rock face
  on one side and a drop on the other.
- **Traffic.** Slow cars in your lane and oncoming ones in the other, and the choice of when to
  pull out.
- **The law.** A radar detector on the dash that chirps before you see them. Then it is yours to
  decide: slow down, pull over and take the ticket, or run.
- **Stages and gas.** The run is in legs, each ending at a gas station with your time and average
  speed. The tank is not bottomless.
- **A rival on the same road.** One other car out there with you, trading places, rather than a
  lane each.
- **Damage you feel.** A hit cracks the glass and takes something off the car before it ends the
  run.
- **Your own way across town.** A race from one place to another by any streets you like, with a
  map. This one waits for the town.
- **Spec sheets.** A car for sale laid out like a magazine page.

The mountain road is also where the steering model is first built, and the town and the autocross
are built on that.

## The town

An open world that is the lobby: you drive it to get anywhere.

- Other players are other cars. Pull up to one and call them out, for fun, with nothing riding on it.
- Places to go: your garage, the parts counter, the spot where the flashlight drags are, the
  highway where the roll races are.
- Traffic, and somewhere to hit.
- **The poker run.** A route round the town with stops. Draw a card at each, and the best hand at
  the last stop wins. It is a cruise with a reason, and the card games are already here.

This is the biggest new piece: real-time driving with steering, on new netcode. It is also what
autocross needs, so the two are built on the same driving model.

## Racing

| Kind | What it is | For |
| --- | --- | --- |
| A challenge | Two players who met in town, from a stop | Fun |
| Flashlight drags | From a stop, on a back road. No tree: somebody drops a flashlight when they feel like it. | Money, or the car |
| Roll races | Side by side at an agreed speed, and go on the signal. No launch, so it is power and gearing. | Money, or the car |
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

The cars are ours: a car can be a clear nod to a real one and still be its own car.

Real businesses and events appear by name only with their say-so. **Rix Racing** has given it, so
the used-parts seller is Rix Racing. The event the game builds to is called the Shootout here; the
real weekend's organisers are a separate party, and using their name or branding beyond that word
is theirs to agree to.

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

- [x] **The engine**: cars, parts, a drivetrain, a garage, and the drag race.
      [open.games#15](https://github.com/journey-to-code-org/open.games/pull/15).
- [x] **The screens**: the garage, and the strip from behind the car, against the locals.
      [#179](https://github.com/journey-to-code-org/open.parlor/pull/179).
- [x] **Garages kept by a house**, one a member, the same on every device. A garage outside a house stays in its browser.
- [x] **The strip in 3D**, with the flat view kept for whoever wants it.
- [x] **The cockpit view** on the strip.

### Phase 2: the phone

- [x] **Tools**: a jack, wrenches, a hammer, and jobs that need them.
- [x] **Oil pressure and the tune**: gauges to watch, an air-fuel ratio to get right, plugs to foul.
- [x] **The marketplace**: sellers, and condition you only learn afterwards.
- [x] **Rix Racing**: used parts for less than new, when they have the one you need.
- [x] **Spec sheets**: a listing laid out like a magazine page.
- [x] **Bodywork and write-offs**: a bent car stays home, and a wrecked one is scrap or parts.
- [x] **Parts as things**: taken off, kept on a shelf, fitted to another car, sold on.
- [x] **Tearing a car down**: a parts car into the parts it is made of.
- [x] **A marketplace of players**, in each house: pieces and whole cars listed, bought and taken back, with the scrappers selling into it and buying what is priced low.
- [x] **The scrappers**: Ricky at Rix Racing and the rest, flooding the market and beating you to parts cars. Against other players too, once listings are on the server.
- [x] **The dyno in Morgantown, and the remote tune** with its deer. The drive to Morgantown waits for the town.
- [ ] **The performance sites** as places of their own.
- [ ] **Cosmetics**, and a car that looks like its build on the strip.

### Phase 3: the road

- [x] **A driving model with steering**, in whole numbers like the rest.
- [x] **The mountain road**: one run, end to end, alone against the clock.
- [x] **Traffic**, both ways.
- [x] **The law**: the radar detector, pulling over, running.
- [x] **Stages and gas stations**, with a time and an average speed for each leg.
- [x] **Damage you feel**: less power, a car that pulls, cracked glass, and the end of the run.
- [x] **A rival** on the road with you: a computer driver. Another player waits for races on the server.
- [x] **The road from the cockpit**, with a mirror.
- [x] **Tuning by hand**: computer drivers that pass more readily, traffic that reacts, a patrol car you can hit. In the engine and on the screen.

### Phase 4: money

- [x] **Flashlight drags, roll races and index racing**, in the engine.
- [x] **Screens for them**: a roll start, and a slip that shows the index and a breakout.
- [ ] **Races on the server**, so nobody can see when the flashlight will drop.
- [ ] **Between players**, with the stake held and paid out: cash, or the cars themselves.

### Phase 5: the town

- [ ] **The town** as the lobby: cruising, other players, places to go.
- [ ] **Challenges** between players who meet.
- [ ] **Races across town** by any route, with a map.
- [ ] **The poker run.**
- [ ] **Crashes**: damage, repair bills, totaled cars, scrap and salvage.

### Phase 6: the Shootout

- [ ] **Autocross**: courses as data, cones, and an editor.
- [ ] **The show**: judging and votes.
- [ ] **The weekend itself**: entries, the three tournaments, and what winning one is worth.

## Decided

- It is called Road to the Shootout.
- Set now. The cars are old because they are cheap.
- A garage belongs to a player, and starts with no tools in it.
- Cars can be wagered.
- The used-parts seller is Rix Racing, with their say-so, and Ricky is one of the scrappers you compete with.
- The marketplace is other players, with computer scrappers in it.
- A proper tune is the dyno in Morgantown, or a remote tune on the road.
- It starts in a shitbox. The all-wheel-drive turbo coupe is one of the sought-after cars.
- Racing someone you meet in town is for fun. Money is at the flashlight drags and the roll races.
- Crashing costs you the car until it is fixed, and a totaled one is scrap or parts.
- The goal is to win an event at the Shootout: show car, autocross or index drag racing.

## Open questions

1. **What the town looks like.** Flat and angled like mini golf, or three.js. It decides how much
   work phase 4 is.
2. **How long a year is.** A real year between Shootouts is a long wait. A month or a season is
   the proposal.
3. **The event's name.** Whether the real weekend's organisers are happy with more than a nod.
