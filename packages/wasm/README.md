# Games compiled to WebAssembly

Games written in C, compiled to WebAssembly and played in the browser, at `/wasm/` in the parlor.
There is one so far: a first-person shooter on the open-source Doom engine.

This package is meant to move to a repository of its own (open.wasm) and takes nothing from the
rest of the parlor: no shared components, no server. What the parlor has of it is listed under
[Moving it out](#moving-it-out).

## The shooter

The engine is [doomgeneric](https://github.com/ozkl/doomgeneric), a port of the Doom engine made
to be carried to new platforms, with the changes a web page needs
([`games/shooter/engine/CHANGES.md`](games/shooter/engine/CHANGES.md)). The game it plays for now
is [Freedoom: Phase 1](https://freedoom.github.io/): free levels, pictures and sounds for the
engine, standing in until the game has its own.

| | |
| --- | --- |
| Keyboard | W A S D to move, the arrows or the mouse to turn (click the picture first), Ctrl or the mouse button to fire, E or Space to use, Shift to run, Q and R for the previous and next weapon, 1 to 7 to pick one, Tab for the map, Esc for the menu |
| Touch | The left thumb is a stick, wherever it lands. A swipe on the right turns. Fire, Use, Menu, Map and the weapon arrows are buttons. In a menu the stick steps, Fire chooses and Use goes back |
| Controller | Left stick to move, right stick to turn, right trigger or X to fire, A to use, the bumpers for weapons, Start for the menu |
| Together | Up to four, each on a device of their own, against the monsters or each other. One starts a game and sends the others its link or its four-letter code |
| Watching | Anyone with the link can watch, through any player's eyes, and is run through the game so far if they come late. A game its host lists also shows on the parlor's watch page |
| Sound | Effects, through Web Audio. No music yet |
| Saved games and settings | Kept in the browser (IndexedDB), under the engine's own menus |
| Offline | After the first visit the page, the engine and the game's data are kept on the device |

Not there yet: music (the songs are MUS data, which wants an OPL or MIDI synthesiser), playing
together with the internet out (over the parlor's same-wifi pairing), joining a game that has
started as a player, replays of games that are over, and the editor for the game's data.

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

A site with no server behind it (GitHub Pages) has no rooms; there the game is played alone.

## How it is put together

```
host/                 for any game: nothing here knows about Doom
  wasi.ts             the disk and terminal a C program expects, in memory
  assets.ts           big files, fetched once with a progress count and kept (Cache Storage)
  store.ts            the files a game writes, kept between visits (IndexedDB)
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
src/
  shooter/engine.ts   starts the engine and calls into it. No DOM: the tests run it in Node
  shooter/player.ts   the game on a page: mountShooter(element, options)
  shooter/session.ts  a device's side of a room. No DOM, and no WebSocket: the tests join it to a room directly
  shooter/together.ts asking the server for a room, the connection to it, and the lobby
  shooter/keys.ts, touch.ts, gamepad.ts, audio.ts
  main.ts             this package's own page
public/sw.js          keeps the page for playing offline
scripts/              build-engine.mjs, toolchain.mjs, fetch-data.mjs, sources.mjs
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
npm run engine -w @open-parlor/wasm   # recompile the C
```

`dev` and `build` fetch Freedoom from its release on GitHub the first time (28 MB, stored gzipped
as 10 MB in `public/data/`, which git ignores) and check it against the hashes in `data.json`.

Recompiling the C needs `clang` and `wasm-ld` (on Debian or Ubuntu: `apt install clang lld`;
clang 18 is what `shooter.wasm` was built with). The script fetches the WASI C library from the
[wasi-sdk](https://github.com/WebAssembly/wasi-sdk) release into `.toolchain/`. Commit
`shooter.wasm` and `shooter.wasm.json` along with the C: a test fails when the hash in the second
doesn't match the sources.

## Licences

- `games/shooter/engine/` and `games/shooter/platform/` are under the GNU General Public License,
  version 2 or later, and so is `shooter.wasm`, which is compiled from them. The source of the
  `.wasm` on the site is this folder.
- Freedoom is under a BSD 3-clause licence. Its licence and credits are served beside it and
  linked from the foot of the page.
- "Doom" is a trademark of id Software. This is not Doom, and the game needs a name of its own.

## Moving it out

To make this folder a repository: copy it, and take from the parlor

- the `/wasm/` entry in `packages/server/src/index.ts` (and its `.wasm` and `.txt` file types),
- the rooms in the same file: `/wasm/play` and the socket at `/wasm/play/<code>`, about twenty
  lines over `Rooms` from this package's `net/`. open.wasm will want a small server of its own
  for them, or to publish `net/` for the parlor's to go on importing,
- the "Freedoom, playing now" list on the watch page (`packages/watch/src/App.tsx`),
- the step in `.github/workflows/pages.yml` and the lines in `ci.yml`,
- `-w @open-parlor/wasm` and `build:net` in the root `package.json`'s scripts, and the server's
  dependency on this package,
- the link in `packages/web/src/home/GameChooser.vue`, which then points at the new site.

The page's link back to the parlor (`../`) and its icon (`../icons/icon.svg`) are the only two
things in `index.html` that assume the parlor is one folder up.
