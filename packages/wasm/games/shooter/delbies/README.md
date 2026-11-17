# Delbie's Daycare & Geriatrics

The game's own part: what is laid over Freedoom to make it ours. So far that is the title
picture, the name over the menu, and the first level. Everything else (the other 35 levels, the
monsters, the weapons, the sounds) is still Freedoom's.

- `main-floor.ts` is the first level, written as a floor plan (`wad/plan.ts`): rooms as
  rectangles, a wall wherever a gap is left between two, a door wherever a small rectangle
  crosses the gap. The front porch, the store front with its counter and shelves, the break
  room, George's returns desk, the bathroom (locked: its key is on George's desk), Jessica's
  office, and the stairs up at the back, where the level ends.
- `game.ts` builds the levels from their plans, runs the node builder on them, and puts them in
  a WAD with the art.
- `art/title.webp` is the title picture, Mikey's. `art/convert.py` brings it into the game's
  256 colours as `title.raw` and, for the lettering over the menu, `logo.raw` and `logo.mask`.
  It needs Pillow and is run by hand when the picture changes.
- `delbies.wad` is the result, committed. A test checks it is what the plans and art now make.

To rebuild after changing a plan: `npm run delbies -w @open-parlor/wasm`.

The page lays `delbies.wad` over Freedoom when the game is fetched (`src/shooter/delbies.ts`),
for a game alone and for a game with others alike, and the editor shows the game that way too.

The monsters are Freedoom's until there are rats to put in their place.
