# Delbie's Doomsday

The shooter set in the store its crew call Delbie's Daycare & Geriatrics. (That is also the name
of the parlor's idle game, and what the title picture says.)

The game's own part: what is laid over Freedoom to make it ours. So far that is the title
picture, the name over the menu, the rats, the status bar, the words, and three levels, after
which the game ends. Everything else (the other monsters, the weapons' pictures, the sounds, and
33 levels that are no longer reached) is still Freedoom's.

- `attic.ts` and `basement.ts` are the second and third levels, written the same way: the attic's
  good side and bad side (holes in the floor, the attic key at the far end), and the basement's
  warehouse, hose room (the bay door key), bay door, yard and dump trailer, where the King Rat is.
  The game ends after the third (`!levels` and `!ending` in `words.txt`).
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
- `art/hud.py` draws the status bar: Delbie's face (blond, blue-eyed, 42 moods) in place of the
  engine's, and Freedoom's bar tinted steel blue with a yellow and black edge. It writes
  `hud.bin.gz` and `hud.json`.
- `art/tools.py` draws tools from the store in place of four weapons and what is picked up: the
  "hammer" (a tape measure, in place of the fist), a price gun (the pistol), Delbie's lever-action
  (the shotgun) and an impact wrench (the chaingun), each in the hand with its flash, the last two
  on the floor as well; pasta and a pizza box for health, a shop apron for armour, a box of
  ammunition and the three keys. It writes `tools.bin.gz` and `tools.json`: 33 pictures.
- `art/sounds.py` makes the rats' voices: squeaks, chitters, hisses and a growl, built from sliding
  tones and noise, in place of the sounds of the monsters the rats replaced. It writes
  `sounds.bin.gz` and `sounds.json`: 15 sounds.
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
monsters they replace, with voices of their own. Freedoom's other monsters are
unchanged, and are left out of our levels.
