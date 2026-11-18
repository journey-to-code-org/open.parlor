# Delbie's Doomsday

The shooter set in the store its crew call Delbie's Daycare & Geriatrics. (That is also the name
of the parlor's idle game, and what the title picture says.)

The whole game: its colours, the title picture, the menus, the status bar, the rats, the tools
and pick-ups, every wall, floor and sky, every sound, the words, and twelve levels, after which
the game ends. All of it is made in this folder, and `delbies.wad` is a game on its own: the
engine is given that file and no other. (It began laid over Freedoom, whose levels, pictures and
sounds filled in what wasn't drawn yet. None of that is left.)

What the engine can do that the game has nothing for is simply not there: the other monsters
have no pictures and are placed in no level.

- `attic.ts` and `basement.ts` are the second and third levels, written the same way: the attic's
  good side and bad side (holes in the floor, the attic key at the far end), and the basement's
  warehouse, hose room (the bay door key), bay door, yard and dump trailer, where the King Rat is.
- `generated.ts` makes the fourth level to the twelfth by rule, each from its number, the same
  floor every time: rooms on a grid joined by halls with a door in each, one door locked and its
  key on the near side of it, shelves, pillars and bad floor in the rooms, more and worse rats
  the further in, and a switch at the far end. They are built to be finishable, not laid out by
  anyone. The engine has nine levels to an episode, so the twelve are E1M1 to E1M9 and E2M1 to
  E2M3, and the game ends after the twelfth (`!levels` and `!ending` in `words.txt`).
- `main-floor.ts` is the first level, written as a floor plan (`wad/plan.ts`): rooms as
  rectangles, a wall wherever a gap is left between two, a door wherever a small rectangle
  crosses the gap. The front porch, the store front with its counter and shelves, the break
  room, George's returns desk, the bathroom (locked: its key is on George's desk), Jessica's
  office, and the stairs up at the back, where the level ends.
- `game.ts` builds the levels from their plans, runs the node builder on them, and puts them in
  a WAD with the art: the colours first, then the lists of walls (every wall is one picture of
  its own name), the screens, the sounds, the sprites, the walls and the floors between their
  markers, and the levels.
- `songs.ts` says which song plays where, and `music/` holds the songs: four MP3s of Mikey's
  (Brass and Heavy Iron for the title, the page between levels and the ending; Steel Teeth and
  Stripped To Bone by turns on the levels; Aisle Four Is A Trap on the King Rat's floors, 3, 8,
  10 and 12), brought down to 32 kHz and 112 kbit/s, 9 MB between them. They are not in the WAD:
  a song's lump there is one line naming it (`song:steel-teeth`), and the page fetches the file
  the first time the engine plays it and keeps it for playing with no connection. So a song
  never heard on a device isn't there offline.
- `art/palette.py` makes the game's 256 colours (sixteen runs of sixteen shades, chosen for a
  parts store: navy, steel, cream, cardboard, the yellow of a price gun, the green of old brake
  fluid), the same tinted for being hurt and for picking things up, and each colour at 32
  depths of shade. It writes `palette.bin`, which every other script reads its colours from.
- `art/title.webp` is the title picture, Mikey's. `art/convert.py` brings it into the game's
  256 colours as `title.raw` and, for the lettering over the menu, `logo.raw` and `logo.mask`.
  It needs Pillow and is run by hand when the picture changes.
- `art/rats.py` draws the rats: each is a handful of rounded lumps, posed and looked at from the
  eight sides the engine wants, lit and edged like the engine's own sprites. It writes
  `sprites.bin.gz` and `sprites.json`: 175 pictures. It needs numpy and Pillow and is run by hand.
- `art/hud.py` draws the status bar: Delbie's face (blond, blue-eyed, 42 moods), and the bar
  itself, a steel panel with a yellow and black edge and a dark window for each figure, with its
  big and small figures, the keys' lights and the rim round a view made smaller. It writes
  `hud.bin.gz` and `hud.json`: 108 pictures.
- `art/cutout.py` cuts the weapons out of the pictures Mikey gave (each a mock-up of a weapon in
  a scene: in gloved hands as the player sees it, or on a floor) into `art/given/`, with nothing
  behind them. It needs OpenCV and the pictures, which are not in the repository: some carry
  another game's status bar or a real brand's label, and nothing of those is in what is cut out
  but a label too small to read.
- `art/tools.py` makes the sprites of everything held and picked up. Eight weapons are Mikey's
  pictures, brought into the game's colours as they are (and the box of tag rolls is his too):

  | In the engine's place of | Here |
  | --- | --- |
  | the fist | the "hammer": a tape measure, swung with its blade out |
  | the pistol | a price gun |
  | the chainsaw | a torch and a can of brake cleaner |
  | the shotgun | Delbie's lever-action |
  | the rocket launcher | brake rotors, thrown |
  | the plasma gun | a jump starter, a clamp in each hand |
  | the biggest gun | a tank of R-134a |

  Each is one picture or two, so what moves is the whole weapon (the lever isn't worked, the
  rotor isn't seen leaving the hand). The impact wrench (the chaingun) is still drawn by the script, shape by
  shape, now in a gloved hand like the rest: there is no picture of it yet. It also draws cartridges loose and boxed; pasta, a pizza
  box and a coffee for health; a shop apron and a hard hat for armour; boxes of ammunition,
  batteries and the three keys; another player (work shirt, cap, price gun); dust and blood
  where a shot lands; the light things arrive in; what the King Rat throws; and a drum of waste
  oil and what it does when shot. It writes `tools.bin.gz` and `tools.json`: 146 pictures.
- `art/menu.py` draws what is around the game, in the colours of the title picture (yellow
  letters edged in navy, a chequered strip): every line of the menus and a hex nut where the
  skull was; the small letters the game speaks in; the page between levels, with each floor's
  name and the figures; "How to play", which is the menu's read-me page; the credits, which
  say whose engine this is; the sliders and the boxes saved games are named in; and the page
  after the ending. It writes `menu.bin.gz` and `menu.json`: 208 pictures. It needs numpy, Pillow and the DejaVu Sans fonts, and is run after `tools.py` and
  `rats.py`, whose pictures the pages show.
- `art/sounds.py` makes everything heard, from sliding tones and noise: the rats' squeaks,
  chitters, hisses and growl, and the price gun, the lever-action, doors, the breaker on the wall,
  things picked up, and you. It writes `sounds.bin.gz` and `sounds.json`: 47 sounds.
- `art/walls.py` draws the pieces three of the walls are put together from: the shop wall (cream
  over a navy wainscot), shelves of parts in orange and blue boxes, and the counter's front. It
  writes `walls.bin.gz` and `walls.json`: 10 pieces.
- `art/textures.py` draws every wall, sky, floor and ceiling the levels use, by rule (courses of
  brick, planks, cinder block, a bay door's slats, ceiling tiles) and from `walls.py`'s pieces.
  It writes `textures.bin.gz` and `textures.json`: 25 walls and 17 floors. Run it after `walls.py`.
- `words.txt` is what the game says: Delbie's lines for when a level starts, a rat notices you,
  one bites, you get one, and you die; and our words in place of the engine's for the first
  level's name, things picked up and the locked door. The engine reads them from the WAD
  (`engine/words.c`), and the editor's **Words** tab changes them.
- `delbies.wad` is the result, committed. A test checks it is what the plans and art now make.

To rebuild after changing a plan: `npm run delbies -w @open-parlor/wasm`.

The page fetches `delbies.wad` and gives it to the engine as the game (`src/shooter/delbies.ts`),
for a game alone and for a game with others alike, and it is what the editor opens.

The art scripts are run in this order after a change of colours: `palette.py`, `convert.py`,
`rats.py`, `cutout.py` (only if the pictures changed), `tools.py`, `walls.py`, `textures.py`, `hud.py`, `menu.py`, `sounds.py`.

## The rats

Each is one of the engine's monsters under that monster's sprite names, so the engine needs
telling nothing:

| Rat | To the engine | Sprites |
| --- | --- | --- |
| Grease rat | the charging, biting one | `SARG` |
| Brake-fluid mutant | the one that throws; what it spits is `BAL1`, green | `TROO` |
| The King Rat | the boss | `BOSS` |

The grease rat is also given a rat's numbers in the engine (`engine/CHANGES.md`): less health,
faster, smaller, and a bite of 2 to 8, since they come in numbers. The other two behave as the
engine's monsters do, with voices of their own. The engine's other monsters have no pictures
here and are in none of the levels.
