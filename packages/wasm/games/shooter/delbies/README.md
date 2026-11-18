# Delbie's Doomsday

The shooter set in the store its crew call Delbie's Daycare & Geriatrics. (That is also the name
of the parlor's idle game, and what the title picture says.)

The game's own part: what is laid over Freedoom to make it ours. So far that is the title
picture, the name over the menu, the rats, and the first level. Everything else (the other 35
levels, the other monsters, the weapons, the sounds) is still Freedoom's.

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
- `art/rats.py` draws the rats: each is a handful of rounded lumps, posed and looked at from the
  eight sides the engine wants, lit and edged like the engine's own sprites. It writes
  `sprites.bin.gz` and `sprites.json`: 175 pictures. It needs numpy and Pillow and is run by hand.
- `words.txt` is what the game says: Delbie's lines for when a level starts, a rat notices you,
  one bites, you get one, and you die; and our words in place of the engine's for the first
  level's name, things picked up and the locked door. The engine reads them from the WAD
  (`engine/words.c`), and the editor's **Words** tab changes them.
- `delbies.wad` is the result, committed. A test checks it is what the plans and art now make.

To rebuild after changing a plan: `npm run delbies -w @open-parlor/wasm`.

The page lays `delbies.wad` over Freedoom when the game is fetched (`src/shooter/delbies.ts`),
for a game alone and for a game with others alike, and the editor shows the game that way too.

## The rats

Each takes the place of one of the engine's monsters, under that monster's sprite names, so the
engine needs telling nothing:

| Rat | In place of | Sprites |
| --- | --- | --- |
| Grease rat | the charging, biting one | `SARG` |
| Brake-fluid mutant | the one that throws; what it spits is `BAL1`, green | `TROO` |
| The King Rat | the boss | `BOSS` |

The grease rat is also given a rat's numbers in the engine (`engine/CHANGES.md`): less health,
faster, smaller, and a bite of 2 to 8, since they come in numbers. The other two behave as the
monsters they replace. The sounds are still those monsters'. Freedoom's other monsters are
unchanged, and are left out of our levels.
