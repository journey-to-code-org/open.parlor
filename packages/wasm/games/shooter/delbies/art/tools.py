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

def hand(draw, x, y, w=44, h=30):
    """A fist, knuckles up, with a sleeve below it."""
    draw.rounded_rectangle((x, y, x + w, y + h), 7, fill=SKIN)
    for i in range(1, 4):
        draw.line((x + i * w // 4, y + 2, x + i * w // 4, y + h // 2), fill=SKIN_DARK, width=1)
    draw.rectangle((x, y + h - 6, x + w, y + h), fill=SKIN_DARK)
    draw.polygon([(x + 2, y + h), (x + w - 2, y + h), (x + w + 18, 205), (x - 6, 205)], fill=SLEEVE)
    draw.line((x + w - 2, y + h, x + w + 18, 205), fill=SLEEVE_DARK, width=3)

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

# The "hammer": held ready, then swung up and out with its blade, and back.
for name, (hx, hy, out) in {"PUNGA0": (150, 126, 0), "PUNGB0": (140, 108, 18), "PUNGC0": (128, 88, 46), "PUNGD0": (142, 112, 12)}.items():
    image, draw = screen()
    hand(draw, hx - 4, hy + 26)
    tape(draw, hx, hy - 6, 40, out)
    keep(name, image, held=True)

def given(name, rgba, held=False, dx=0, dy=0):
    """A picture someone made, as it is: brought into the game's colours, with no shading or edge added.
    Held: placed on the screen where it sits on its 320 by 200 picture, moved by dx and dy."""
    there = rgba[..., 3] > 127
    rows, cols = np.where(there)
    y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    rgba, there = rgba[y0:y1, x0:x1], there[y0:y1, x0:x1]
    height, width = there.shape
    # The engine draws what is held 32 down from where its picture says.
    left, top = (-(int(x0) + dx), -(int(y0) + dy - 32)) if held else (width // 2, height)
    pixels = bytes(nearest(rgba[y, x, :3]) if there[y, x] else 0 for y in range(height) for x in range(width))
    pictures.append((name, width, height, left, top, pixels, bytes(there.astype(np.uint8).tobytes())))

# Delbie's lever-action, in gloved hands, looking down the barrel. The picture is Mikey's (rifle-held.png: cut out
# of the one he gave, and made the size of the screen). It is one picture, so working the lever is the rifle
# coming back and down and up again.
RIFLE = np.array(Image.open(here / "rifle-held.png").convert("RGBA"))
for name, (dx, dy) in {"SHTGA0": (0, 0), "SHTGB0": (2, 7), "SHTGC0": (5, 15), "SHTGD0": (7, 20)}.items():
    given(name, RIFLE, held=True, dx=dx, dy=dy)

# The flash at its muzzle, small and then large.
for name, size in (("SHTFA0", 9), ("SHTFB0", 15)):
    image, draw = screen()
    cx, cy = 160, 100
    draw.polygon([(cx, cy - size * 2), (cx + size // 2, cy - size // 2), (cx + size * 2, cy), (cx + size // 2, cy + size // 2), (cx, cy + size), (cx - size // 2, cy + size // 2), (cx - size * 2, cy), (cx - size // 2, cy - size // 2)], fill=(255, 190, 40))
    draw.ellipse((cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2), fill=(255, 250, 210))
    keep(name, image, held=True)

def price_gun(draw, dy=0):
    """A price gun, in the pistol's place: red, a roll of labels on top, and a hand round its grip."""
    cx, top = 160, 114 + dy
    draw.ellipse((cx - 11, top, cx + 11, top + 18), fill=WHITE)
    draw.ellipse((cx - 4, top + 5, cx + 4, top + 13), fill=STEEL)
    draw.rounded_rectangle((cx - 17, top + 12, cx + 17, top + 54), 6, fill=RED)
    draw.rectangle((cx + 11, top + 16, cx + 17, top + 52), fill=(140, 24, 20))
    # Where the label comes out, and one on its way.
    draw.rectangle((cx - 9, top + 8, cx + 9, top + 14), fill=BLACK)
    draw.rectangle((cx - 7, top + 4, cx + 7, top + 10), fill=WHITE)
    draw.line((cx - 4, top + 7, cx + 4, top + 7), fill=BLACK)
    hand(draw, cx - 23, top + 46, 46, 30)

for name, dy in {"PISGA0": 0, "PISGB0": -8, "PISGC0": -4, "PISGD0": 2, "PISGE0": 0}.items():
    image, draw = screen()
    price_gun(draw, dy)
    keep(name, image, held=True)

# A label leaving it, with a snap.
image, draw = screen()
draw.polygon([(160, 84), (166, 100), (182, 104), (166, 108), (160, 122), (154, 108), (138, 104), (154, 100)], fill=(255, 210, 60))
draw.rectangle((153, 97, 167, 109), fill=WHITE)
draw.line((156, 101, 164, 101), fill=BLACK)
draw.line((156, 105, 162, 105), fill=BLACK)
keep("PISFA0", image, held=True)

def impact_wrench(draw, turned=False):
    """An impact wrench, in the chaingun's place: yellow and black, its socket away up the screen."""
    cx, top = 160, 106
    draw.rectangle((cx - 8, top - 6, cx + 8, top + 4), fill=STEEL_DARK)
    draw.rectangle((cx - 5, top + 2, cx + 5, top + 12), fill=STEEL_LIGHT)
    # The socket's flats, which is all that shows it turning.
    for x in ((-6, 0, 5) if turned else (-3, 3)):
        draw.line((cx + x, top - 5, cx + x, top + 3), fill=STEEL_LIGHT)
    draw.rounded_rectangle((cx - 20, top + 10, cx + 20, top + 56), 8, fill=YELLOW)
    draw.rectangle((cx - 20, top + 24, cx + 20, top + 31), fill=BLACK)
    draw.rectangle((cx + 13, top + 14, cx + 20, top + 52), fill=YELLOW_DARK)
    draw.rounded_rectangle((cx - 14, top + 48, cx + 14, top + 62), 4, fill=BLACK)
    hand(draw, cx - 24, top + 56, 48, 30)

for name, turned in (("CHGGA0", False), ("CHGGB0", True)):
    image, draw = screen()
    impact_wrench(draw, turned)
    keep(name, image, held=True)

# Sparks off the socket, two ways.
for name, spin in (("CHGFA0", 0), ("CHGFB0", 1)):
    image, draw = screen()
    for i in range(8):
        dx, dy = [(0, -18), (13, -13), (18, 0), (13, 11), (0, 14), (-13, 11), (-18, 0), (-13, -13)][(i + spin) % 8] if i % 2 == spin else [(0, -9), (7, -7), (9, 0), (7, 6), (0, 8), (-7, 6), (-9, 0), (-7, -7)][i]
        draw.line((160, 100, 160 + dx, 100 + dy), fill=(255, 200, 60), width=2)
    draw.ellipse((154, 94, 166, 106), fill=(255, 250, 210))
    keep(name, image, held=True)

def small(width, height):
    image = Image.new("RGBA", (width + 2, height + 2), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)

# On the floor. The lever-action, side on: Mikey's picture too (rifle-floor.png).
given("SHOTA0", np.array(Image.open(here / "rifle-floor.png").convert("RGBA")))

# The impact wrench, side on: its anvil and socket to the right, its grip and battery below.
image, draw = small(46, 30)
draw.rectangle((36, 7, 45, 12), fill=STEEL_LIGHT)
draw.rectangle((42, 6, 45, 13), fill=STEEL)
draw.rounded_rectangle((3, 2, 34, 17), 5, fill=YELLOW)
draw.rounded_rectangle((29, 3, 37, 16), 3, fill=BLACK)
draw.rectangle((3, 6, 6, 13), fill=BLACK)
draw.rectangle((10, 5, 24, 7), fill=YELLOW_DARK)
draw.polygon([(12, 16), (23, 16), (21, 25), (10, 25)], fill=BLACK)
draw.rectangle((23, 17, 25, 21), fill=STEEL_DARK)
draw.rounded_rectangle((5, 24, 27, 30), 2, fill=YELLOW)
draw.rectangle((5, 27, 27, 30), fill=BLACK)
keep("MGUNA0", image)

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

# A box of tags for the price gun.
image, draw = small(24, 16)
draw.rectangle((0, 3, 23, 15), fill=(226, 222, 208))
draw.rectangle((0, 3, 23, 6), fill=YELLOW)
draw.rectangle((4, 9, 19, 12), fill=RED)
draw.polygon([(0, 3), (4, 0), (27, 0), (23, 3)], fill=(190, 186, 172))
keep("AMMOA0", image)

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
    flat(f"PUFF{letter}0", burst(14, ((200, 200, 196), (240, 240, 232)), (r, r - 2)), top=r + 8)
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
