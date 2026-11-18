# Games compiled to WebAssembly

Games written in C, compiled to WebAssembly and played in the browser, at `/wasm/` in the parlor.
There is one so far: a first-person shooter on the open-source Doom engine.

This package is meant to move to a repository of its own (open.wasm) and takes nothing from the
rest of the parlor: no shared components, no server. What the parlor has of it is listed under
[Moving it out](#moving-it-out).

## Road to the Shootout

At `/wasm/shootout/`, and behind the parlor's own tile for it. It is not built here: it is a Rust
engine compiled to WebAssembly and the pack of content it plays, from
[journey-to-code-org/wasm-toolkit](https://github.com/journey-to-code-org/wasm-toolkit), copied
into `public/shootout/` (the game) and `packages/admin/public/workshop/` (the workshop) and
committed. `VERSION` in each says which commit it is. To bring over a
newer one:

    (in wasm-toolkit)  make engine
    (here)             npm run shootout -w @open-parlor/wasm -- ../wasm-toolkit

Its races with other people go through a meet, `/wasm/meet/shootout` on the parlor's server
(`net/meet.ts`): a room that says who is here and passes on what each says to the rest, and
knows nothing of the game. Each device runs its own car and tells the other where it is and what
it ran. A parlor served as plain files (the GitHub Pages build) has no meet, and the game says
nobody can be reached.

The workshop, where a pack's cars, rooms, parts, rivals and maps are edited in the browser, is
in the admin app: its Road to the Shootout section opens it, at `/admin/workshop/`. From there
the parlor's host publishes a pack, and that is what everyone plays from then on, in place of
the one the game came with. The published pack is kept beside the parlor's database
(`shootout.pack`; see `packages/server/src/packs.ts`). A season is saved in each player's
browser; nothing of it is kept on the server.

## The shooter

The engine is [doomgeneric](https://github.com/ozkl/doomgeneric), a port of the Doom engine made
to be carried to new platforms, with the changes a web page needs
([`games/shooter/engine/CHANGES.md`](games/shooter/engine/CHANGES.md)). The game it plays is
Delbie's Doomsday ([`games/shooter/delbies`](games/shooter/delbies/README.md)): a title, rats,
words and twelve levels of its own, laid over [Freedoom: Phase 1](https://freedoom.github.io/),
free levels, pictures and sounds for the engine, which is everything of the game that isn't yet
its own.

| | |
| --- | --- |
| Keyboard | W A S D to move, the arrows or the mouse to turn (click the picture first), Ctrl or the mouse button to fire, E or Space to use, Shift to run, Q and R for the previous and next weapon, 1 to 7 to pick one, Tab for the map, Esc for the menu |
| Touch | The left thumb is a stick, wherever it lands. A swipe on the right turns. Fire, Use, Menu, Map and the weapon arrows are buttons. In a menu the stick steps, Fire chooses and Use goes back |
| Controller | Left stick to move, right stick to turn, right trigger or X to fire, A to use, the bumpers for weapons, Start for the menu |
| Together | Up to four, each on a device of their own, against the monsters or each other. One starts a game and sends the others its link or its four-letter code |
| Watching | Anyone with the link can watch, through any player's eyes, and is run through the game so far if they come late. A game its host lists also shows on the parlor's watch page |
| Changing it | An editor at `/wasm/editor/` swaps any of the game's pictures and sounds for a file of your own, adds walls, floors, sprites and sounds it never had, changes its words and its rules (what each thing is, and the numbers it plays by), its levels, what is placed in them and what they are built of, and puts a file in place of any other lump of its data; the game is played with the changes, alone |
| Sound | Effects, through Web Audio. A song is played if someone has put an MP3, an Ogg or a WAV in its place; the game's own songs (MUS data) are not, yet |
| Saved games and settings | Kept in the browser (IndexedDB), under the engine's own menus |
| Offline | After the first visit the page, the engine and the game's data are kept on the device |

Not there yet: the game's own music (the songs are MUS data, which wants an OPL or MIDI synthesiser), joining a
game that has started as a player, and replays of games that are over.

## The editor

`/wasm/editor/` lists everything the game is drawn and heard with, by kind: about 1,300 sprites,
the pieces walls are built from, floors, the other pictures (title, menus, status bar, scores,
letters) and the sound effects. Any of them can be swapped for a file:

- **Open one and choose a file, or drop it.** A picture in any format the browser opens is
  brought into the game's 256 colours; where it is less than half there, it is see-through. It is
  made the size of what it replaces, or, for a sprite, kept at its own size if asked. A sound in
  any format the browser plays is made one channel at the game's rate.
- **Drop a folder's worth on the page** and each file goes to the thing it is named after:
  `TROOA1.png` to the sprite `TROOA1`.
- **Save as a PNG** gives a picture to change in a paint program and drop back.
- **Try it** runs the game on the page with the changes as they stand.
- **Save my changes as a file** writes them as a small WAD of the kind other Doom engines load on
  top of a game; **Load changes from a file** reads one back.
- **Add a new wall** and **Add a new floor** take a picture under a name the game never had. A
  floor is made 64 by 64. A wall keeps its shape, no taller than 128 and 8 to 256 wide (the
  widths the engine repeats properly), and a wall picture of its name is made for it, on the end
  of `PNAMES` and `TEXTURE1`. Both are then there to choose in the Levels tab. A file dropped on
  the Walls or Floors tab that is named for nothing the game has is added the same way.
- **Everything else** is every lump that is none of the above: the colours (`PLAYPAL`,
  `COLORMAP`), the lists of wall pictures, the songs, the recordings played behind the title.
  Each can be saved as a file and have a file put in its place, byte for byte: it has to be in
  the engine's own form already, and nothing checks that it is. **Add a new lump** puts any file
  in under a name of your own, for a WAD meant for use elsewhere: this engine reads only the
  names it knows.

- **Add a new sprite** and **Add a new sound** take a picture or a sound under a name the game
  never had (`RATXA0`: four letters for the thing, a letter for the moment, a figure for the
  side; `DSRAT1`). The engine draws and plays its own by name, so a new one is seen or heard
  once the Rules tab gives it to a thing.
- **Songs** are among Everything else (`D_E1M1` and the rest). An MP3, an Ogg or a WAV put in a
  song's place is played, round and round, at the menu's music volume. The game's own songs are
  MUS data, which wants an OPL or MIDI synthesiser: they are still silence.

The **Rules** tab changes what was fixed in the engine's code. For each of the engine's 137
kinds of thing: its health, speed, size, weight, damage, how easily it flinches, how long before
it acts, the sprite it is drawn with and its five sounds. How much of each ammunition is carried
and picked up. And numbers by name: the health and bullets you start with, the most health and
armour, the damage of the fist, the saw and a bullet, a shotgun's pellets and how wide they go.
It also changes what a thing does. A thing is always in one moment or another: a picture of its
sprite, for so long, running one of the engine's 74 actions (look for a player, go after its
target, bite, throw, scream, fall), then on to the next. The tab lists a thing's moments for
each thing that can happen to it (standing about, once it has noticed you, flinching, attacking
up close and from afar, dying, blown apart, brought back) and changes any of them. And **Make a
new thing like this one** makes a kind of thing of your own: a copy, with moments of its own so
that changing them leaves the original alone, and a number of its own, under which the Levels
tab offers it to place. There is room for 32 kinds of thing and 512 moments of your own.

They are kept as one change, a lump called `RULES`, which the engine reads when it starts
(`games/shooter/engine/rules.c`); only what differs from the engine's own is written. A game
with other devices is played without them, as it is without every other change.

So everything in the game's data can be changed, and a WAD made elsewhere is taken whole but for
levels beyond the 36 the game has places for. Pictures under names the engine doesn't know are
carried along as lumps. What still can't be changed here is what the engine's actions
themselves do (a bite is always the engine's bite), and the weapons' own moments.

### Levels

The **Words** tab changes what the game says: the lines for when a level starts, a rat notices
you, one bites, you get one and you die (a line each; the game picks one), the engine's own
words for level names, things picked up and locked doors, any other words of the engine's given
exactly, how many levels the game has, and what it says when they are done. They are kept as one
change, a lump called `WORDS`, which the engine reads (`games/shooter/engine/words.c`).

The **Levels** tab draws a level from above and changes it: what is placed in it (where the
players start, the monsters, what can be picked up, the scenery) and what it is built of (its
corners, walls and rooms). Drag the map to move about; pinch, or the wheel, to come closer.

What is placed in it:

- **Things**: tap a thing to choose it, drag it to move it.
- **Add a thing**: pick what, and tap where.
- **A chosen thing** can be made something else, turned to face any of eight ways, left out of
  easy, medium or hard games, made to wait in ambush (a monster), kept for games with other
  players, or taken away. A level keeps a place for the first player to start.
- **From the keyboard**, with the map in focus: arrows move the chosen thing (Shift for bigger
  steps), `[` and `]` choose the one before or after, Delete takes it away.
- **Play this level** starts the game in it, with the changes.

What can be placed, and what each thing looks like and how wide it is, comes from the engine's own
table (`engine/info.c`), read by `scripts/gen-things.mjs` into `wad/things.ts`.

What it is built of, under **Walls**. Tap a corner, a wall or the floor of a room:

- **A corner** is dragged, or moved with the arrows, on a grid of 8. The walls that meet at it go
  with it. It won't go where walls would cross. Where only two walls meet, it can be **taken
  away**, which makes them one wall: what undoes a split. Corners are chosen from close to; from
  far off they are too near each other to tell apart, and a tap is for a wall or a room.
- **A wall** has a picture, or, where it is an opening between two rooms, one above and one below
  the opening on each side. It can be made to do something (a door, a switch, a lift, the way
  out), to the rooms that have its number; made to block players, monsters or sound; split in
  two; and, if nothing is behind it, given **a room behind it**, which makes it an opening, or
  **a door and a room behind it**. Each picture is shown beside its name, put together from its
  patches as they now are (`wad/texture.ts`).
- **A room** has a floor and a ceiling (a height and a picture each), a light, something it does
  (hurts, flickers, counts as a secret) and a number for switches to find it by. **Add a room
  inside it** puts a square room where it was tapped: a platform once its floor is raised, a pit
  once lowered, a pillar with the ceiling brought down to the floor. **Take this room away**
  closes the room round it over a room that was inside it; any other room leaves a hole, its
  openings becoming its neighbours' walls, and can't go while something is placed in it.
- **Undo** takes back the last change to the walls, up to thirty of them; Ctrl+Z with the map in
  focus does the same.

**Start it again, empty** makes the level one square room with the four players' starts in it,
in the wall and floor pictures the level mostly used: somewhere to build a level of your own.
The game has 36 levels, and one of your own takes the place of one of them. "Put this level
back" brings the game's back.

A room is added as a square, or as a box behind a wall, not drawn freehand: move its corners and
split its walls to shape it. Two rooms that are both there can't be joined by a new opening, so
a level grows outward like a tree, without loops. A single wall can't be taken away, only a room.

A level's walls are stored with a tree the engine draws and collides by (the "nodes"), which has
to be rebuilt whenever a wall moves. That is done by a node builder,
[BSP 5.2](https://github.com/cph6/bsp), a C program compiled to WebAssembly as the engine is
(`games/shooter/nodes`, 60 KB, fetched the first time a wall is changed). It is run a moment after
each change (a few hundredths of a second for the game's first level), and what it makes is
what is kept: a changed level is always one that can be played. If it can't build the level it
says why, and the change isn't kept until it can.

Saved as a file, a changed level goes in whole, since other engines can only replace a level
whole. A level in a file is taken in as walls of its own if it is built, as other editors save
them.

The changes are kept in the browser (IndexedDB) and laid over the game's WAD each time it is
played alone. A game with other devices is played on the data as it came. Pictures and sounds
don't change what happens in a game, so each player seeing their own would be safe; it isn't done.

The page is Svelte, and its controls are Zubra components: the parlor's copies of zubra-ui
(`packages/ui/src/zubra-ui`). Reading and writing the data is `wad/`, plain TypeScript with no
browser in it, which is where the tests are.

## Playing together

Every device runs the same game. Each sends only its own player's command for each tic (a
thirty-fifth of a second); a tic is run once every player's command for it has arrived. Nothing
else travels: no positions, no state.

A **room** (`net/room.ts`) is where the commands come in. It waits for all of a tic's commands and
sends the tic to everyone, in order. It never looks inside a command and knows nothing of the
game, so it is a few hundred lines with no dependencies, and runs wherever it is put: today in the
parlor's server, behind a WebSocket at `/wasm/play/<code>`.

- **Someone watching** is a device that is sent the tics and sends none. The engine calls that a
  drone. Whose eyes it looks through is the device's own business and changes nothing in the game.
- **The room keeps every tic.** Someone who comes late is sent the game from the start and runs
  through it to catch up, a hundred times faster than it was played.
- **A player who stops sending** holds the game up. After a second and a half the others are told
  who they are waiting for; after ten the player is dropped and the game goes on.
- **The games coming apart** is caught by the engine itself: each command carries a check on
  where its player stood, and a device that disagrees stops with "consistency failure".

### On the same wifi, with no server

A site with no server behind it (GitHub Pages), or a parlor whose internet is out, has no rooms.
There one of the devices is the room: **Play on this wifi**, then **Host a game**. The same
`Room` runs in the host's page, and the others reach it over WebRTC data channels with no server
of any kind between them.

A channel is opened by two scans, the parlor's own way (`packages/web/src/wifi`, brought here as
`src/wifi/` so this package stands alone). The host's screen shows a QR code that is a link to
this page with an offer after the `#`; a phone's camera opens it, from what the device kept. The
guest's screen then shows a code back, which the host reads with **Use the camera**, or pastes.
The host can add people while the game is on; they come to watch.

- The game is the host's page: when the host leaves, it ends for everyone.
- Devices have to be able to reach each other: a guest network, or a hotspot with "client
  isolation", keeps them apart, and the screen says so.
- Each device needs to have opened the game once with a connection, to have it kept.

## How it is put together

```
host/                 for any game: nothing here knows about Doom
  wasi.ts             the disk and terminal a C program expects, in memory
  assets.ts           big files, fetched once with a progress count and kept (Cache Storage)
  store.ts            the files a game writes, kept between visits (IndexedDB)
wad/                  the Doom engine's data, read and written. No browser, no Svelte
  wad.ts              a WAD file: its lumps, in and out
  picture.ts          the engine's pictures (columns of posts; 64 by 64 floors) and its palette
  sound.ts            its sound effects
  catalogue.ts        which lumps are sprites, walls, floors, other pictures, sounds and levels
  level.ts            a level: what is placed in it, and its shape (corners, walls, sides, rooms), in and out
  shape.ts            changes to a shape: move or remove a corner, split a wall, add or remove a room, add a door; an empty level
  texture.ts          the pictures on walls, put together from their patches
  words.ts            what the game says: the WORDS lump, read and written
  rules.ts            what each thing is and the numbers the game plays by: the RULES lump, read and written
  rule-things.ts      every kind of thing the engine has, as it was written; from the engine's table by scripts/gen-rules.mjs
  rule-states.ts      every moment a thing can be in, and what a moment can run; written the same way
  plan.ts             a level from a floor plan: rooms as rectangles, for levels built by a script
  nodes.ts            the node builder, run on a shape to make a level the engine can play
  does.ts             what a wall or a room can be made to do
  things.ts           what can be placed in a level; written from the engine's table by scripts/gen-things.mjs
  mod.ts              someone's changes: laid over a game, or as a WAD of their own
net/                  for any lockstep game, and for a server: nothing here knows about Doom either
  protocol.ts         what a device and a room say to each other
  room.ts             a room, and the rooms of one server
games/shooter/
  engine/             the Doom engine's C (GPL-2.0), changed where marked [open.wasm]
  platform/           the engine's platform layer for a web page: web.c, sound.c
  build.json          what to compile
  shooter.wasm        the engine, compiled. Committed, so building the site needs no C compiler
  shooter.wasm.json   a hash of the C it was compiled from
  data.json           which Freedoom release is the game's data
  delbies/            the game's own title and levels, laid over Freedoom: see its README
  nodes/              the node builder: BSP 5.2's C (GPL-2.0) in bsp/, what calls it in glue/, and nodes.wasm, committed
src/
  shooter/engine.ts   starts the engine and calls into it. No DOM: the tests run it in Node
  shooter/player.ts   the game on a page: mountShooter(element, options)
  shooter/session.ts  a device's side of a room. No DOM, and no WebSocket: the tests join it to a room directly
  shooter/together.ts asking the server for a room, the connection to it, and the lobby
  shooter/nearby.ts   a room in the host's own page, and the screens that pair devices by QR code
  wifi/               the pairing itself: the code (signal.ts), the channel (link.ts), QR codes (qr.ts)
  shooter/keys.ts, touch.ts, gamepad.ts, audio.ts
  main.ts             this package's own page
  editor/             the editor: App.svelte, Levels.svelte (the map), Thumb.svelte and Shown.svelte (pictures), and convert.ts (a dropped file to a lump)
  market/             the stockroom: sim.ts (the module and its tables, read in place), catalog.ts (names and words), ui/ (the Solid page)
editor/index.html     the editor's page
market/index.html     the stockroom's page
games/market/         the stockroom's sim: freestanding C, integers only (market.wasm, 10 KB, no imports)
public/sw.js          keeps the page for playing offline
scripts/              build-engine.mjs, toolchain.mjs, fetch-data.mjs, sources.mjs, gen-things.mjs, gen-rules.mjs
lib/                  net/ compiled for a server to import (npm run build:net); git ignores it
```

The engine is a WASI "reactor": a module with no `main`, whose functions the page calls. The page
calls `web_start` once and then `web_frame` for every frame it draws; the engine calls back with
the picture (`host.draw_frame`), the clock and each sound. Nothing in the engine may wait, because
a browser only draws once the call has returned: that is what most of the changes to it are for.

## Working on it

```sh
npm run dev -w @open-parlor/wasm      # http://localhost:5177/wasm/
npm test -w @open-parlor/wasm         # boots the engine in Node on the real data, alone and in games of several
npm run engine -w @open-parlor/wasm   # recompile the engine's C
npm run nodes -w @open-parlor/wasm    # recompile the node builder's
npm run delbies -w @open-parlor/wasm  # rebuild the game's own WAD from its plans
npm run typecheck -w @open-parlor/wasm   # after a build: Zubra writes its components' typings then
```

`dev` and `build` fetch Freedoom from its release on GitHub the first time (28 MB, stored gzipped
as 10 MB in `public/data/`, which git ignores) and check it against the hashes in `data.json`.

Recompiling the C needs `clang` and `wasm-ld` (on Debian or Ubuntu: `apt install clang lld`;
clang 18 is what `shooter.wasm` was built with). The script fetches the WASI C library from the
[wasi-sdk](https://github.com/WebAssembly/wasi-sdk) release into `.toolchain/`. Commit
`shooter.wasm` and `shooter.wasm.json` along with the C: a test fails when the hash in the second
doesn't match the sources. The same goes for `nodes/nodes.wasm`.

## Licences

- `games/shooter/engine/` and `games/shooter/platform/` are under the GNU General Public License,
  version 2 or later, and so is `shooter.wasm`, which is compiled from them. The source of the
  `.wasm` on the site is this folder.
- `games/shooter/nodes/` is BSP 5.2, by Colin Reed, Lee Killough, Simon Howard and Colin Phipps,
  under the same licence (`bsp/COPYING`, `bsp/AUTHORS`); so is `nodes.wasm`.
- Freedoom is under a BSD 3-clause licence. Its licence and credits are served beside it and
  linked from the foot of the page.
- "Doom" is a trademark of id Software. This is not Doom, and the game needs a name of its own.

## Moving it out

To make this folder a repository: copy it, and take from the parlor

- the `/wasm/` entry in `packages/server/src/index.ts` (and its `.wasm` and `.txt` file types),
- the rooms in the same file: `/wasm/play` and the socket at `/wasm/play/<code>`, about twenty
  lines over `Rooms` from this package's `net/`. open.wasm will want a small server of its own
  for them, or to publish `net/` for the parlor's to go on importing,
- the Zubra components the editor uses, which are the parlor's copies (`packages/ui/src/zubra-ui`,
  through the `@open-parlor/ui` alias in `vite.config.ts` and `tsconfig.json`): open.wasm takes
  its own copies, or zubra-ui itself,
- the few lines in the server that serve a folder's own `index.html` (the editor's page),
- the "Freedoom, playing now" list on the watch page (`packages/watch/src/App.tsx`),
- the step in `.github/workflows/pages.yml` and the lines in `ci.yml`,
- `-w @open-parlor/wasm` and `build:net` in the root `package.json`'s scripts, and the server's
  dependency on this package,
- the link in `packages/web/src/home/GameChooser.vue`, which then points at the new site.

The page's link back to the parlor (`../`) and its icon (`../icons/icon.svg`) are the only two
things in `index.html` that assume the parlor is one folder up.

## Delbie's Stockroom (`/wasm/market/`)

A second game, and not a shooter: run the store's stockroom for 28 days. Forty-eight invented parts
on eight shelves, wholesale prices that drift (and jump on supplier news and weather), customers who
buy at the shelf price, rats that chew the stock, traps, standing orders, rent every seventh day.

- **The sim** is `games/market/engine/market.c`: freestanding C with no libc and no floating point,
  compiled for plain `wasm32` (`npm run market`; `"freestanding": true` in its `build.json`, so
  there is no toolchain to fetch). It is 10 KB and imports nothing. Money is cents; a game is a seed
  and its commands, so `state_hash` is the same on any machine (a test pins one).
- **The page reads its tables in place** (`src/market/sim.ts`): the store, the parts and the
  wholesale prices sit at fixed addresses in the module's memory, seen through typed arrays, so
  reading 48 prices is 48 array reads and not 48 calls.
- **The screen is Solid** on Zubra components (data-table, line-chart, spark-line, bar-chart,
  number-ticker, stat-card, progress-bar, tab-list, steppers, sliders, switches, dialogs, toasts).
  It exists to test Zubra under live numbers: 48 rows whose cells change many times a second. The
  *Under the hood* tab measures it, and lets you cut how often the screen is given new numbers.
- **The numbers are kept honest by bots** (`test/market.test.ts`): doing nothing earns nothing,
  stocking at a fair mark-up beats that, traps beat no traps, 250% prices go broke by week three.
- **Same month, two devices** (`src/market/replay.ts`, `challenge.ts`): a game is a seed plus the
  commands given, so the page logs every command that did something. *Challenge a friend* at the end
  of a month makes a link (`#c=...`, base64url, a few hundred bytes) with the seed, a name, the score and
  that log. Whoever opens it plays the same market, and the page first replays the commands on a second
  copy of the module and only believes the score if it comes out the same. This proves the score is
  *achievable* by those commands, not that a human played them (a bot's log verifies too). A month too
  long for a link goes without its log and shows as unchecked.
- The typecheck is two projects: `tsconfig.json` (Svelte and plain TypeScript) and
  `tsconfig.market.json` (the Solid page, with Zubra's typings for Solid).
