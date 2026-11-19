"""Tools from the store, in place of the engine's weapons and things to pick up.

In the hand: the "hammer" (a tape measure; the store's joke is that it is only ever called a
hammer), which is what you hit with when you have nothing else; a price gun, which is the pistol;
Delbie's lever-action, which is the shotgun; and an impact wrench, which is the chaingun. On the
floor: the lever-action, the impact wrench, cartridges loose and boxed, leftover pasta, a pizza
box and a coffee for health, a shop apron and a hard hat for armour, a box of ammunition, and
the three keys on their tags.

Each is drawn here with a few shapes and given a dark edge. What is held is drawn where it sits
on the 320 by 200 screen; what lies on the floor is drawn from its feet.

Run by hand (it needs numpy and Pillow):

    python3 games/shooter/delbies/art/tools.py

It writes tools.bin.gz and tools.json, in the form rats.py writes the rats.
"""
import gzip, json, struct, sys
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw

here = Path(__file__).parent
palette = np.frombuffer((here / "palette.bin").read_bytes()[:768], np.uint8).reshape(256, 3).astype(int)
cache = {}
def nearest(rgb):
    key = tuple(int(v) for v in rgb)
    if key not in cache:
        cache[key] = int(((palette - np.array(key)) ** 2).sum(1).argmin())
    return cache[key]

SKIN, SKIN_DARK = (226, 172, 136), (176, 120, 92)
YELLOW, YELLOW_DARK = (246, 200, 40), (190, 140, 20)
STEEL, STEEL_DARK, STEEL_LIGHT = (92, 98, 110), (48, 52, 62), (176, 184, 196)
WOOD, WOOD_DARK = (150, 92, 48), (100, 58, 28)
BLACK, WHITE, RED, EDGE = (20, 20, 22), (244, 244, 240), (200, 40, 32), (16, 14, 14)
# A work shirt, in a blue the game's palette has.
SLEEVE, SLEEVE_DARK = (52, 72, 152), (28, 40, 100)

pictures = []
def keep(name, image, left=None, top=None, held=False):
    """A drawing, cut to what is in it, with a dark edge. Held: placed on the screen where it was drawn."""
    rgba = np.array(image)
    there = rgba[..., 3] > 127
    rgba[..., :3] = rounded(rgba[..., :3], there)
    edge = there & ~(np.roll(there, 1, 0) & np.roll(there, -1, 0) & np.roll(there, 1, 1) & np.roll(there, -1, 1))
    rgba[edge, :3] = EDGE
    rows, cols = np.where(there)
    y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    rgba, there = rgba[y0:y1, x0:x1], there[y0:y1, x0:x1]
    height, width = there.shape
    if held:
        # The engine draws what is held 32 down from where its picture says.
        left, top = -int(x0), -(int(y0) - 32)
    else:
        left, top = width // 2, height
    pixels = bytes(nearest(rgba[y, x, :3]) if there[y, x] else 0 for y in range(height) for x in range(width))
    pictures.append((name, width, height, left, top, pixels, bytes(there.astype(np.uint8).tobytes())))

def rounded(rgb, there):
    """Flat shapes given some roundness: lighter toward the upper left of the whole thing, darker toward
    the lower right, with a little grit, as the engine's own pictures are painted."""
    def inward(dx, dy):
        # How many of the next four pixels that way are part of the picture.
        run, still = np.zeros(there.shape), there.copy()
        for step in range(1, 5):
            still = still & np.roll(np.roll(there, dy * step, 0), dx * step, 1)
            run += still
        return run
    lit, shaded = 4 - inward(1, 1), 4 - inward(-1, -1)
    ys, xs = np.indices(there.shape)
    grit = (((xs * 7 + ys * 13) % 5) - 2) * 0.014
    factor = 1 + 0.065 * lit - 0.085 * shaded + grit
    return np.clip(rgb.astype(float) * factor[..., None], 0, 255).astype(np.uint8)

def screen():
    image = Image.new("RGBA", (320, 200), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)

GLOVE, GLOVE_DARK = (78, 100, 60), (46, 62, 38)
def hand(draw, x, y, w=44, h=30):
    """A fist in a work glove, knuckles up, with a bare forearm below it: as the hands are in the pictures Mikey gave."""
    draw.rounded_rectangle((x, y, x + w, y + h), 7, fill=GLOVE)
    for i in range(1, 4):
        draw.line((x + i * w // 4, y + 2, x + i * w // 4, y + h // 2), fill=GLOVE_DARK, width=1)
    draw.rectangle((x, y + h - 6, x + w, y + h), fill=GLOVE_DARK)
    draw.polygon([(x + 2, y + h), (x + w - 2, y + h), (x + w + 18, 205), (x - 6, 205)], fill=SKIN)
    draw.line((x + w - 2, y + h, x + w + 18, 205), fill=SKIN_DARK, width=3)

def tape(draw, x, y, size=40, out=0):
    """A tape measure: a yellow case, a black button, and its blade, `out` long."""
    if out:
        draw.polygon([(x + size // 2 - 5, y + 6), (x + size // 2 + 5, y + 6), (x + size // 2 + 3, y - out), (x + size // 2 - 3, y - out)], fill=STEEL_LIGHT)
        for mark in range(y - out + 4, y, 6):
            draw.line((x + size // 2 - 3, mark, x + size // 2, mark), fill=BLACK)
        draw.rectangle((x + size // 2 - 5, y - out - 3, x + size // 2 + 5, y - out), fill=STEEL)
    draw.rounded_rectangle((x, y, x + size, y + size), 9, fill=YELLOW)
    draw.rounded_rectangle((x + 3, y + size - 9, x + size - 3, y + size - 2), 4, fill=YELLOW_DARK)
    draw.ellipse((x + size // 2 - 9, y + size // 2 - 9, x + size // 2 + 9, y + size // 2 + 9), fill=BLACK)
    draw.ellipse((x + size // 2 - 4, y + size // 2 - 4, x + size // 2 + 4, y + size // 2 + 4), fill=STEEL_LIGHT)
    draw.rectangle((x + size - 8, y + 4, x + size - 3, y + 14), fill=RED)

def given(name, rgba, held=False, dx=0, dy=0, middle=False):
    """A picture someone made, as it is: brought into the game's colours, with no shading or edge added.
    Held: placed on the screen where it sits on its 320 by 200 picture, moved by dx and dy."""
    there = rgba[..., 3] > 127
    rows, cols = np.where(there)
    y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    rgba, there = rgba[y0:y1, x0:x1], there[y0:y1, x0:x1]
    height, width = there.shape
    # One of his takes the place of one drawn here under the same name.
    pictures[:] = [one for one in pictures if one[0] != name]
    # The engine draws what is held 32 down from where its picture says.
    left, top = (-(int(x0) + dx), -(int(y0) + dy - 32)) if held else (width // 2, height // 2 if middle else height)
    pixels = bytes(nearest(rgba[y, x, :3]) if there[y, x] else 0 for y in range(height) for x in range(width))
    pictures.append((name, width, height, left, top, pixels, bytes(there.astype(np.uint8).tobytes())))

# Delbie's lever-action, in gloved hands, looking down the barrel. The picture is Mikey's (given/rifle-held.png: cut out by cutout.py
# of the one he gave, and made the size of the screen). It is one picture, so working the lever is the rifle
# coming back and down and up again.
RIFLE = np.array(Image.open(here / "given" / "rifle-held.png").convert("RGBA"))
# The engine draws what is held 16 higher than its place on a full screen once the status bar is on, so each is set lower by enough
# for its bottom edge to be behind the bar and not in the air above it.
for name, (dx, dy) in {"SHTGA0": (0, 12), "SHTGB0": (2, 19), "SHTGC0": (5, 27), "SHTGD0": (7, 32)}.items():
    given(name, RIFLE, held=True, dx=dx, dy=dy)

# The flash at its muzzle, small and then large.
for name, size in (("SHTFA0", 9), ("SHTFB0", 15)):
    image, draw = screen()
    cx, cy = 160, 112
    draw.polygon([(cx, cy - size * 2), (cx + size // 2, cy - size // 2), (cx + size * 2, cy), (cx + size // 2, cy + size // 2), (cx, cy + size), (cx - size // 2, cy + size // 2), (cx - size * 2, cy), (cx - size // 2, cy - size // 2)], fill=(255, 190, 40))
    draw.ellipse((cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2), fill=(255, 250, 210))
    keep(name, image, held=True)

# The price gun, in the pistol's place: Mikey's picture (given/pricegun-held.png), kicking up as a tag leaves it.
PRICE_GUN = np.array(Image.open(here / "given" / "pricegun-held.png").convert("RGBA"))
for name, dy in {"PISGA0": 0, "PISGB0": -7, "PISGC0": -3, "PISGD0": 2, "PISGE0": 0}.items():
    given(name, PRICE_GUN, held=True, dy=dy)

# A label leaving it, with a snap.
image, draw = screen()
draw.polygon([(171, 82), (177, 98), (193, 102), (177, 106), (171, 120), (165, 106), (149, 102), (165, 98)], fill=(255, 210, 60))
draw.rectangle((164, 95, 178, 107), fill=(240, 110, 40))
draw.line((167, 99, 175, 99), fill=BLACK)
draw.line((167, 103, 173, 103), fill=BLACK)
keep("PISFA0", image, held=True)

# A jug of washer fluid with a pump on it, in the chaingun's place: Mikey's pictures (given/sprayer-*.png). It shakes as it
# runs, and the spray is its flash.
SPRAYER, SPRAY = (np.array(Image.open(here / "given" / f"sprayer-{part}.png").convert("RGBA")) for part in ("hands", "spray"))
given("CHGGA0", SPRAYER, held=True, dy=5)
given("CHGGB0", SPRAYER, held=True, dx=1, dy=7)
given("CHGFA0", SPRAY, held=True, dy=5)
given("CHGFB0", SPRAY[:, ::-1], held=True, dx=1, dy=7)

def small(width, height):
    image = Image.new("RGBA", (width + 2, height + 2), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)

# On the floor. The lever-action, side on: Mikey's picture too (given/rifle-floor.png).
given("SHOTA0", np.array(Image.open(here / "given" / "rifle-floor.png").convert("RGBA")))

# The sprayer on the floor.
given("MGUNA0", np.array(Image.open(here / "given" / "sprayer-floor.png").convert("RGBA")))

# Cartridges for the lever-action: a handful stood up, and a box of them.
BRASS, BRASS_DARK, COPPER = (214, 170, 62), (150, 112, 34), (196, 112, 62)
image, draw = small(22, 14)
for x in (1, 6, 11, 16):
    draw.rectangle((x, 5, x + 3, 13), fill=BRASS)
    draw.rectangle((x, 12, x + 3, 13), fill=BRASS_DARK)
    draw.polygon([(x, 5), (x + 3, 5), (x + 2, 1), (x + 1, 1)], fill=COPPER)
keep("SHELA0", image)

image, draw = small(34, 20)
draw.polygon([(2, 5), (31, 5), (33, 19), (0, 19)], fill=(150, 36, 30))
draw.polygon([(5, 1), (28, 1), (31, 5), (2, 5)], fill=(190, 60, 48))
draw.rectangle((6, 8, 27, 16), fill=WHITE)
for x in (9, 14, 19, 24):
    draw.rectangle((x, 10, x + 1, 14), fill=BRASS)
    draw.point((x, 9), fill=COPPER)
    draw.point((x + 1, 9), fill=COPPER)
keep("SBOXA0", image)

# A coffee, for a little health: the steam is what moves.
for frame, steam in zip("ABCD", (((5, 3), (9, 1)), ((6, 2), (10, 3)), ((5, 1), (9, 3)), ((4, 3), (8, 2)))):
    image, draw = small(16, 18)
    draw.polygon([(2, 7), (13, 7), (11, 17), (4, 17)], fill=WHITE)
    draw.rectangle((2, 6, 13, 8), fill=(120, 72, 40))
    draw.rectangle((4, 11, 11, 13), fill=RED)
    draw.arc((11, 9, 16, 15), 270, 90, fill=WHITE)
    for x, y in steam:
        draw.line((x, y + 2, x + 1, y), fill=(210, 214, 222))
    keep(f"BON1{frame}0", image)

# A hard hat, for a little armour: the light moves across it.
for frame, glint in zip("ABCD", (4, 7, 10, 7)):
    image, draw = small(22, 14)
    draw.pieslice((2, 1, 19, 22), 180, 360, fill=YELLOW)
    draw.rectangle((0, 11, 21, 13), fill=YELLOW_DARK)
    draw.rectangle((10, 1, 11, 10), fill=YELLOW_DARK)
    draw.line((glint, 5, glint + 2, 3), fill=WHITE)
    keep(f"BON2{frame}0", image)

# Leftover pasta, in its tub.
image, draw = small(20, 12)
draw.polygon([(1, 5), (19, 5), (17, 12), (3, 12)], fill=WHITE)
draw.ellipse((1, 1, 19, 8), fill=(236, 190, 110))
for x, y in ((5, 3), (10, 2), (14, 4), (8, 5)):
    draw.point((x, y), fill=RED)
    draw.point((x + 1, y), fill=RED)
keep("STIMA0", image)

# A whole pizza, in its box, the lid up.
image, draw = small(30, 20)
draw.polygon([(2, 9), (28, 9), (30, 18), (0, 18)], fill=(206, 170, 120))
draw.rectangle((0, 18, 30, 20), fill=(160, 126, 84))
draw.polygon([(3, 1), (27, 1), (28, 9), (2, 9)], fill=(226, 196, 150))
draw.ellipse((6, 10, 24, 17), fill=(236, 186, 80))
draw.ellipse((8, 11, 22, 16), fill=RED)
for x, y in ((11, 12), (16, 14), (19, 12)):
    draw.point((x, y), fill=(250, 230, 150))
draw.ellipse((11, 3, 19, 7), outline=RED)
keep("MEDIA0", image)

# A shop apron, on a stand; the second is the first catching the light.
for name, lift in (("ARM1A0", 0), ("ARM1B0", 26)):
    blue = tuple(min(255, v + lift) for v in SLEEVE)
    image, draw = small(28, 28)
    draw.line((9, 1, 14, 7), fill=STEEL_LIGHT, width=2)
    draw.line((19, 1, 14, 7), fill=STEEL_LIGHT, width=2)
    draw.polygon([(9, 6), (19, 6), (21, 12), (26, 14), (25, 28), (3, 28), (2, 14), (7, 12)], fill=blue)
    draw.rectangle((9, 17, 19, 23), fill=tuple(max(0, v - 14) for v in blue))
    draw.line((9, 17, 19, 17), fill=YELLOW)
    keep(name, image)

# A box of ammunition.
image, draw = small(10, 12)
draw.rectangle((0, 2, 10, 12), fill=(70, 96, 60))
draw.rectangle((0, 2, 10, 4), fill=(100, 130, 86))
draw.rectangle((2, 6, 8, 9), fill=YELLOW)
keep("CLIPA0", image)

# The keys: steel, each on a tag of its colour; the second of each is the first catching the light.
for prefix, colour in (("BKEY", (40, 90, 220)), ("YKEY", (240, 200, 40)), ("RKEY", (210, 40, 36))):
    for letter, lift in (("A", 0), ("B", 50)):
        tag = tuple(min(255, v + lift) for v in colour)
        image, draw = small(14, 21)
        draw.ellipse((3, 0, 11, 8), outline=STEEL_LIGHT, width=2)
        draw.rectangle((6, 8, 8, 20), fill=STEEL_LIGHT)
        draw.rectangle((8, 15, 11, 16), fill=STEEL_LIGHT)
        draw.rectangle((8, 18, 10, 19), fill=STEEL_LIGHT)
        draw.polygon([(0, 6), (6, 4), (7, 13), (1, 15)], fill=tag)
        keep(prefix + letter + "0", image)

# A box of rolls of tags for the price gun: Mikey's picture (given/tags-floor.png).
given("AMMOA0", np.array(Image.open(here / "given" / "tags-floor.png").convert("RGBA")))

# Someone else playing, as you see them: work shirt, cap, dark trousers, a price gun in hand. One picture a moment, the same from every side.
def worker(step=0, arm=0, lean=0, flash=False, down=0.0):
    image, draw = small(40, 58)
    if down >= 1:
        # On the floor.
        draw.rounded_rectangle((2, 48, 38, 56), 3, fill=SLEEVE)
        draw.ellipse((0, 46, 10, 56), fill=SKIN)
        draw.rectangle((26, 50, 39, 56), fill=(40, 44, 60))
        return image
    drop = int(down * 16)
    lx, rx = (-3, 3) if step == 1 else (3, -3) if step == 3 else (0, 0)
    draw.rectangle((13 + lx, 38 + drop, 18 + lx, 55), fill=(40, 44, 60))
    draw.rectangle((21 + rx, 38 + drop, 26 + rx, 55), fill=(40, 44, 60))
    draw.rectangle((12 + lx, 54, 19 + lx, 57), fill=BLACK)
    draw.rectangle((20 + rx, 54, 27 + rx, 57), fill=BLACK)
    draw.rounded_rectangle((11 + lean, 18 + drop, 28 + lean, 40 + drop), 3, fill=SLEEVE)
    draw.rectangle((11 + lean, 36 + drop, 28 + lean, 38 + drop), fill=BLACK)
    draw.rectangle((7 + lean, 20 + drop, 11 + lean, 34 + drop), fill=SLEEVE_DARK)
    draw.rectangle((28 + lean, 20 + drop, 32 + lean, 30 + drop - arm * 6), fill=SLEEVE_DARK)
    draw.ellipse((13 + lean, 6 + drop, 26 + lean, 19 + drop), fill=SKIN)
    draw.rectangle((13 + lean, 5 + drop, 26 + lean, 9 + drop), fill=(22, 34, 92))
    draw.rectangle((13 + lean, 9 + drop, 29 + lean, 10 + drop), fill=(22, 34, 92))
    if arm:
        draw.rectangle((30 + lean, 22 + drop, 38 + lean, 26 + drop), fill=YELLOW)
        if flash:
            draw.ellipse((36 + lean, 20 + drop, 41 + lean, 28 + drop), fill=(255, 240, 160))
    return image
for letter, how in zip("ABCDEFG", (dict(step=0), dict(step=1), dict(step=2), dict(step=3), dict(arm=1), dict(arm=1, flash=True), dict(lean=-3))):
    keep(f"PLAY{letter}0", worker(**how))
for index, letter in enumerate("HIJKLMN"):
    keep(f"PLAY{letter}0", worker(down=min(1, (index + 1) / 5)))
for index, letter in enumerate("OPQRSTUVW"):
    keep(f"PLAY{letter}0", worker(down=min(1, (index + 1) / 4)))

# What a shot does to a wall (dust), and to a rat.
def burst(size, colours, radius, spokes=0, name=None):
    image, draw = small(size, size)
    c = size // 2 + 1
    for r, colour in zip(radius, colours):
        if r > 0:
            draw.ellipse((c - r, c - r, c + r, c + r), fill=colour)
    for k in range(spokes):
        import math
        a = k * 2 * math.pi / spokes + 0.3
        draw.line((c, c, c + math.cos(a) * size / 2, c + math.sin(a) * size / 2), fill=colours[0], width=1)
    return image
def flat(name, image, left=None, top=None):
    """Kept as drawn: no rounding, no dark edge, for light and dust."""
    rgba = np.array(image)
    there = rgba[..., 3] > 127
    rows, cols = np.where(there)
    y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    rgba, there = rgba[y0:y1, x0:x1], there[y0:y1, x0:x1]
    height, width = there.shape
    pixels = bytes(nearest(rgba[y, x, :3]) if there[y, x] else 0 for y in range(height) for x in range(width))
    pictures.append((name, width, height, width // 2 if left is None else left, height if top is None else top, pixels, bytes(there.astype(np.uint8).tobytes())))
for letter, r in zip("ABCD", (1, 2, 3, 2)):
    flat(f"PUFF{letter}0", burst(14, ((132, 132, 128), (176, 176, 170)), (r, r - 2)), top=r + 8)
for letter, r in zip("ABC", (5, 4, 2)):
    flat(f"BLUD{letter}0", burst(14, ((150, 20, 20), (210, 44, 40)), (r, r - 2)), top=r + 6)
# Arriving (a player, or a thing coming back): a ring of light that opens and goes.
for letter, r in zip("ABCDEFGHIJ", (6, 12, 18, 24, 28, 28, 24, 18, 12, 6)):
    image, draw = small(60, 60)
    draw.ellipse((30 - r, 30 - r, 30 + r, 30 + r), outline=(90, 200, 240), width=3)
    draw.ellipse((30 - r // 2, 30 - r // 2, 30 + r // 2, 30 + r // 2), outline=(240, 250, 255), width=2)
    flat(f"TFOG{letter}0", image, top=30 + r + 14)
for letter, r in zip("ABCDE", (4, 8, 11, 8, 4)):
    image, draw = small(26, 26)
    draw.ellipse((13 - r, 13 - r, 13 + r, 13 + r), outline=(250, 220, 90), width=2)
    flat(f"IFOG{letter}0", image, top=13 + r + 10)
# What the King Rat throws: a ball of old grease, turning, and what it leaves where it lands.
for letter, turn in (("A", 0), ("B", 1)):
    image, draw = small(18, 18)
    draw.ellipse((1, 1, 17, 17), fill=(52, 44, 30))
    draw.ellipse((4 + turn * 5, 4, 8 + turn * 5, 8), fill=(120, 150, 60))
    draw.ellipse((9 - turn * 4, 11, 12 - turn * 4, 14), fill=(90, 110, 40))
    keep(f"BAL7{letter}0", image, top=14)
for letter, r in zip("CDE", (9, 13, 16)):
    flat(f"BAL7{letter}0", burst(36, ((52, 44, 30), (120, 150, 60), (190, 210, 110)), (r, r - 4, r - 9), spokes=7), top=r + 10)
# A drum of something that shouldn't be near a flame: a waste-oil drum, its label catching the light; and what it does.
for letter, lit in (("A", 0), ("B", 40)):
    image, draw = small(24, 34)
    draw.rounded_rectangle((1, 2, 23, 33), 3, fill=(40, 60, 130))
    for y in (11, 22):
        draw.rectangle((1, y, 23, y + 1), fill=(22, 34, 92))
    draw.ellipse((1, 0, 23, 6), fill=(24, 22, 20))
    draw.rectangle((5, 13, 19, 21), fill=(246, 200 + lit // 2, 40 + lit))
    draw.polygon([(12, 14), (16, 20), (8, 20)], fill=BLACK)
    keep(f"BAR1{letter}0", image)
for letter, r in zip("ABCDE", (10, 18, 26, 30, 22)):
    colours = ((200, 60, 20), (246, 150, 30), (255, 240, 160)) if letter < "D" else ((70, 66, 62), (120, 116, 110), (170, 166, 160))
    flat(f"BEXP{letter}0", burst(64, colours, (r, r - 6, r - 13), spokes=9 if letter < "D" else 0), top=r + 6)

# The rest of the weapons are Mikey's pictures too, cut out by cutout.py into given/.
def picture(name):
    return np.array(Image.open(here / "given" / f"{name}.png").convert("RGBA"))
def placed(piece, right, bottom):
    """A cut-out put on an empty screen, its right edge and its foot where they are wanted."""
    canvas = np.zeros((240, 320, 4), np.uint8)
    h, w = piece.shape[:2]
    canvas[bottom - h:bottom, right - w:right] = piece
    return canvas
def over(under, top):
    both = under.copy()
    there = top[..., 3] > 127
    both[there] = top[there]
    return both
def moved(rgba, dx, dy):
    return np.roll(np.roll(rgba, dy, 0), dx, 1)

# The "hammer", in the fist's place: a tape measure. Held ready, brought up, swung with its blade out, and back.
READY, UP, SWING = picture("tape-ready"), picture("tape-up"), picture("tape-swing")
given("PUNGA0", placed(READY, 268, 190), held=True)
given("PUNGB0", placed(UP, 262, 176), held=True)
given("PUNGC0", placed(SWING, 236, 180), held=True)
given("PUNGD0", placed(UP, 266, 184), held=True)

# A torch and a can of brake cleaner, in the chainsaw's place: lit and waiting (it flickers), and the can let go into the flame.
HANDS, FLAME = picture("torch-hands"), picture("torch-flame")
given("SAWGC0", HANDS, held=True)
given("SAWGD0", HANDS, held=True, dy=1)
given("SAWGA0", over(HANDS, FLAME), held=True)
given("SAWGB0", over(HANDS, moved(FLAME, 3, -3)), held=True, dy=1)
given("CSAWA0", picture("cleaner-floor"))

# A brake rotor, in the rocket launcher's place: in the hand, and the hand come down having thrown it. On the floor; flying; and one to pick up, and a stack.
ROTOR, DISC = picture("rotor-held"), picture("rotor-floor")
given("MISGA0", ROTOR, held=True)
given("MISGB0", ROTOR, held=True, dx=6, dy=14)
given("LAUNA0", DISC)
def scaled(rgba, wide):
    image = Image.fromarray(rgba, "RGBA")
    out = np.array(image.resize((wide, max(1, round(image.height * wide / image.width))), Image.BOX))
    out[..., 3] = (out[..., 3] > 127) * 255
    return out
given("MISLA0", scaled(DISC, 30), middle=True)
given("ROCKA0", scaled(DISC, 26))
stack = np.zeros((36, 34, 4), np.uint8)
for lift in (0, 7, 14):
    one = scaled(DISC, 34)
    there = one[..., 3] > 127
    stack[36 - one.shape[0] - lift:36 - lift][there] = one[there]
given("BROKA0", stack)
# Where it lands: rust, sparks and dust.
for letter, r in zip("BCD", (12, 20, 26)):
    flat(f"MISL{letter}0", burst(60, ((120, 70, 40), (236, 150, 50), (255, 236, 170)) if letter < "D" else ((90, 80, 72), (140, 130, 120), (180, 172, 160)), (r, r - 6, r - 13), spokes=11 if letter < "D" else 0), top=r + 4)

# A jump starter, in the plasma gun's place: a clamp in each hand, and the arc between them. Its box on the floor; what it throws; charge to pick up.
CLAMPS, ARC = picture("jump-hands"), picture("jump-arc")
given("PLSGA0", CLAMPS, held=True, dy=8)
given("PLSGB0", CLAMPS, held=True, dy=12)
given("PLSFA0", ARC, held=True, dy=8)
given("PLSFB0", ARC[:, ::-1], held=True, dy=8)
given("PLASA0", picture("jump-floor"))
for letter, turn in (("A", 0), ("B", 1)):
    image, draw = small(16, 16)
    for k in range(4):
        a = k * math.pi / 2 + turn * math.pi / 4
        draw.line((8, 8, 8 + math.cos(a) * 8, 8 + math.sin(a) * 8), fill=(120, 190, 255), width=1)
    draw.ellipse((4, 4, 12, 12), fill=(90, 160, 250))
    draw.ellipse((6, 6, 10, 10), fill=(235, 246, 255))
    flat(f"PLSS{letter}0", image, top=14)
for letter, r in zip("ABCDE", (5, 9, 12, 9, 5)):
    flat(f"PLSE{letter}0", burst(30, ((70, 130, 240), (140, 200, 255), (240, 248, 255)), (r, r - 3, r - 6), spokes=6), top=r + 8)
# A battery, and a case of them.
image, draw = small(10, 14)
draw.rectangle((1, 3, 9, 13), fill=(40, 44, 52))
draw.rectangle((1, 3, 9, 6), fill=YELLOW)
draw.rectangle((2, 1, 4, 3), fill=STEEL_LIGHT)
draw.rectangle((6, 1, 8, 3), fill=STEEL_LIGHT)
keep("CELLA0", image)
image, draw = small(26, 18)
draw.rectangle((0, 5, 25, 17), fill=(40, 44, 52))
draw.rectangle((0, 5, 25, 9), fill=YELLOW)
for x in (3, 10, 17):
    draw.rectangle((x, 2, x + 2, 5), fill=RED if x == 3 else STEEL_LIGHT)
draw.polygon([(12, 11), (15, 11), (13, 14), (16, 14), (11, 17), (12, 14), (10, 14)], fill=YELLOW)
keep("CELPA0", image)

# A tank of refrigerant, in the place of the engine's biggest gun: held, and tipped forward as it goes off; the cloud it lets go; the cloud
# crossing the room, and where it lands; and the tank on the floor.
TANK, CLOUD = picture("tank-hands"), picture("tank-cloud")
given("BFGGA0", TANK, held=True)
given("BFGGB0", TANK, held=True, dy=5)
given("BFGFA0", scaled(CLOUD, 320)[::2, ::2].repeat(2, 0).repeat(2, 1), held=True)
given("BFGFB0", CLOUD, held=True)
given("BFUGA0", picture("tank-floor"))
rows, cols = np.where(CLOUD[..., 3] > 127)
PUFF = CLOUD[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
given("BFS1A0", scaled(PUFF, 44), middle=True)
given("BFS1B0", scaled(PUFF, 44)[:, ::-1], middle=True)
for letter, wide in zip("ABCDEF", (50, 80, 110, 130, 110, 70)):
    given(f"BFE1{letter}0", scaled(PUFF, wide)[:, ::(1 if letter in "ACE" else -1)], middle=True)
for letter, wide in zip("ABCD", (16, 26, 34, 22)):
    given(f"BFE2{letter}0", scaled(PUFF, wide), middle=True)

# What is picked up, and the drum, are Mikey's pictures too: each takes the place of the one drawn above under its name.
def lit(rgba, by):
    """The same picture catching the light."""
    out = rgba.copy()
    out[..., :3] = np.clip(out[..., :3].astype(int) + by, 0, 255)
    return out
given("STIMA0", picture("pasta"))
given("MEDIA0", scaled(picture("pizza"), 28))
for letter, by in zip("ABCD", (0, 14, 28, 14)):
    given(f"BON1{letter}0", lit(scaled(picture("coffee"), 10), by))
    given(f"BON2{letter}0", lit(picture("hard-hat"), by))
given("ARM1A0", picture("apron"))
given("ARM1B0", lit(picture("apron"), 26))
given("BAR1A0", picture("drum"))
given("BAR1B0", lit(picture("drum"), 14))
# What the brake-fluid mutant spits, crossing the room: where it lands is still rats.py's.
BALL = scaled(picture("spit"), 22)
given("BAL1A0", BALL, middle=True)
given("BAL1B0", BALL[::-1], middle=True)
GREENS, TEALS = ((40, 120, 20), (110, 230, 50), (220, 255, 170)), ((20, 110, 120), (70, 220, 220), (220, 255, 250))
for letter, r in zip("CDE", (8, 12, 15)):
    flat(f"BAL1{letter}0", burst(34, GREENS, (r, r - 4, r - 9), spokes=7), top=r + 8)
# What the coolant rat spits, and where it lands: the same in teal.
for letter, turn in (("A", 0), ("B", 1)):
    image, draw = small(14, 14)
    draw.ellipse((1, 1, 13, 13), fill=TEALS[0])
    draw.ellipse((3, 3, 11, 11), fill=TEALS[1])
    draw.ellipse((4 + turn * 3, 4, 7 + turn * 3, 7), fill=TEALS[2])
    flat(f"BAL2{letter}0", image, top=12)
for letter, r in zip("CDE", (8, 12, 15)):
    flat(f"BAL2{letter}0", burst(34, TEALS, (r, r - 4, r - 9), spokes=7), top=r + 8)
# What the fat rat's cannons throw: a bigger gout of the green, and where that lands.
for letter, r in (("A", 7), ("B", 8)):
    flat(f"FATB{letter}0", burst(22, GREENS, (r, r - 3, r - 6), spokes=5), top=r + 6)
for letter, r in zip("ABC", (12, 18, 24)):
    flat(f"FBXP{letter}0", burst(54, GREENS, (r, r - 5, r - 11), spokes=9), top=r + 6)

# More of Mikey's: the three keys (the bathroom's on a hubcap, the attic's a wooden spoon, the bay door's a fob), each catching the light;
# the drum going up; one rotor, a crate of them, a can of cleaner with a battery, and a car battery with a tank; and things that help.
for key, prefix in (("blue", "BKEY"), ("yellow", "YKEY"), ("red", "RKEY")):
    given(prefix + "A0", picture(f"key-{key}"))
    given(prefix + "B0", lit(picture(f"key-{key}"), 50))
for letter, blast in zip("ABCDE", (0, 1, 2, 2, 3)):
    pictures[:] = [one for one in pictures if one[0] != f"BEXP{letter}0"]
    given(f"BEXP{letter}0", lit(picture(f"blast-{blast}"), 20 if letter == "D" else 0))
given("ROCKA0", picture("rotor-one"))
given("BROKA0", picture("rotor-crate"))
given("CELLA0", picture("cleaner-cell"))
given("CELPA0", picture("battery-pack"))
# An energy drink (the engine's berserk pack), a turbo that glows (its soulsphere), a yellow suit against what burns (its radiation
# suit), and a clipboard with the floor's plan on it (its map). And a floor jack and a trouble light, to stand about.
given("PSTRA0", picture("energy-drink"))
for letter, by in zip("ABCD", (0, 16, 32, 16)):
    given(f"SOUL{letter}0", lit(picture("turbo"), by))
    given(f"PMAP{letter}0", lit(picture("clipboard"), by // 2))
    given(f"TLMP{letter}0", lit(picture("trouble-light"), by))
given("SUITA0", picture("suit"))
given("COLUA0", picture("jack"))

blob = bytearray()
manifest = []
for name, width, height, left, top, pixels, solid in pictures:
    manifest.append({"name": name, "width": width, "height": height, "left": left, "top": top, "at": len(blob)})
    blob += pixels + solid
(here / "tools.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "tools.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "pictures,", len(blob), "bytes")

if len(sys.argv) > 1:
    # A sheet to look at.
    sheet = Image.new("RGB", (640, 330), (58, 62, 84))
    x = y = 4
    tall = 0
    for name, width, height, left, top, pixels, solid in pictures:
        if x + width > 636:
            x, y, tall = 4, y + tall + 4, 0
        im = Image.fromarray(np.dstack([palette[np.frombuffer(pixels, np.uint8).reshape(height, width)].astype(np.uint8), np.frombuffer(solid, np.uint8).reshape(height, width) * 255]), "RGBA")
        sheet.paste(im, (x, y), im)
        x, tall = x + width + 4, max(tall, height)
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(sys.argv[1])
