"""Tools from the store, in place of the engine's weapons and things to pick up.

In the hand: the "hammer" (a tape measure; the store's joke is that it is only ever called a
hammer), which is what you hit with when you have nothing else; a price gun, which is the pistol;
Delbie's lever-action, which is the shotgun; and an impact wrench, which is the chaingun. On the
floor: the lever-action, the impact wrench, leftover pasta and a pizza box for health, a shop
apron for armour, a box of ammunition, and the three keys on their tags.

Each is drawn here with a few shapes and given a dark edge. What is held is drawn where it sits
on the 320 by 200 screen; what lies on the floor is drawn from its feet.

Run by hand (it needs numpy and Pillow):

    python3 games/shooter/delbies/art/tools.py public/data/freedoom1-0.13.0.wad.gz

It writes tools.bin.gz and tools.json, in the form rats.py writes the rats.
"""
import gzip, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

here = Path(__file__).parent
wad = gzip.open(sys.argv[1]).read()
count, table = struct.unpack_from("<ii", wad, 4)
for i in range(count):
    at, size, name = struct.unpack_from("<ii8s", wad, table + i * 16)
    if name.rstrip(b"\0") == b"PLAYPAL":
        palette = np.frombuffer(wad[at:at + 768], np.uint8).reshape(256, 3).astype(int)
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

BRASS, BRASS_DARK = (196, 160, 72), (140, 108, 40)

def rifle(draw, dx=0, dy=0, lever=0):
    """Delbie's lever-action from behind and a little above: the barrel away up the screen with its
    magazine tube under it, a wooden forend in the left hand, a brass receiver with its hammer, and
    the right hand in the lever, which swings down and forward when it is worked."""
    cx, top = 166 + dx, 78 + dy
    # The magazine tube, seen past the barrel's right side, and the barrel over it.
    draw.polygon([(cx + 2, top + 8), (cx + 7, top + 8), (cx + 15, top + 62), (cx + 4, top + 62)], fill=STEEL_DARK)
    draw.polygon([(cx - 4, top), (cx + 4, top), (cx + 9, top + 62), (cx - 9, top + 62)], fill=STEEL)
    draw.line((cx - 2, top + 3, cx - 5, top + 60), fill=STEEL_LIGHT, width=2)
    draw.line((cx + 3, top + 3, cx + 8, top + 60), fill=STEEL_DARK, width=2)
    # The front sight, and the mouth of the barrel.
    draw.rectangle((cx - 1, top - 6, cx + 1, top), fill=BRASS)
    draw.ellipse((cx - 3, top - 1, cx + 3, top + 4), fill=BLACK)
    # The band that holds barrel and tube together, and the forend: wood, with its grain.
    draw.rectangle((cx - 9, top + 40, cx + 15, top + 45), fill=STEEL_LIGHT)
    draw.polygon([(cx - 13, top + 46), (cx + 16, top + 46), (cx + 21, top + 84), (cx - 18, top + 84)], fill=WOOD)
    for i, grain in enumerate((-9, -3, 4, 10)):
        draw.line((cx + grain, top + 49 + (i % 2) * 3, cx + grain * 1.3, top + 82), fill=WOOD_DARK)
    draw.line((cx + 15, top + 47, cx + 20, top + 84), fill=WOOD_DARK, width=3)
    # The left hand under the forend: fingers come up round its side.
    draw.rounded_rectangle((cx - 30, top + 56, cx - 10, top + 82), 6, fill=SKIN)
    for i in range(4):
        draw.rounded_rectangle((cx - 20, top + 55 + i * 7, cx - 6, top + 60 + i * 7), 2, fill=SKIN)
        draw.line((cx - 20, top + 61 + i * 7, cx - 8, top + 61 + i * 7), fill=SKIN_DARK)
    draw.polygon([(cx - 30, top + 80), (cx - 12, top + 82), (cx - 30, 205), (cx - 62, 205)], fill=SLEEVE)
    # The receiver: brass, a loading gate in its side, the hammer on top.
    draw.polygon([(cx - 18, top + 84), (cx + 21, top + 84), (cx + 25, 205), (cx - 22, 205)], fill=BRASS)
    draw.line((cx + 21, top + 84, cx + 25, 205), fill=BRASS_DARK, width=4)
    draw.rounded_rectangle((cx - 12, top + 96, cx - 2, top + 104), 3, fill=BRASS_DARK)
    draw.rectangle((cx - 3, top + 80, cx + 5, top + 90), fill=STEEL_DARK)
    draw.rectangle((cx - 2, top + 76, cx + 4, top + 82), fill=STEEL_LIGHT)
    # The lever, a loop of steel, and the right hand through it.
    lx, ly = cx + 22 + lever * 12, top + 92 + lever * 14
    draw.ellipse((lx - 4, ly - 2, lx + 34, ly + 30), outline=STEEL_LIGHT, width=4)
    draw.rounded_rectangle((lx + 2, ly + 4, lx + 38, ly + 30), 8, fill=SKIN)
    for i in range(1, 4):
        draw.line((lx + 2 + i * 9, ly + 6, lx + 2 + i * 9, ly + 18), fill=SKIN_DARK)
    draw.rectangle((lx + 2, ly + 24, lx + 38, ly + 30), fill=SKIN_DARK)
    draw.polygon([(lx + 6, ly + 30), (lx + 38, ly + 30), (lx + 64, 205), (lx + 16, 205)], fill=SLEEVE)

for name, how in {"SHTGA0": dict(), "SHTGB0": dict(dx=3, dy=9), "SHTGC0": dict(dx=5, dy=12, lever=1), "SHTGD0": dict(dx=2, dy=6, lever=0.5)}.items():
    image, draw = screen()
    rifle(draw, **how)
    keep(name, image, held=True)

# The flash at its muzzle, small and then large.
for name, size in (("SHTFA0", 9), ("SHTFB0", 15)):
    image, draw = screen()
    cx, cy = 166, 70
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

# On the floor. The lever-action, side on.
image, draw = small(44, 13)
draw.rectangle((14, 4, 43, 6), fill=STEEL)
draw.rectangle((16, 7, 36, 8), fill=STEEL_DARK)
draw.polygon([(0, 3), (13, 4), (14, 9), (0, 12)], fill=WOOD)
draw.rectangle((13, 4, 21, 9), fill=STEEL_LIGHT)
draw.ellipse((14, 8, 21, 13), outline=STEEL_DARK)
draw.rectangle((22, 7, 30, 9), fill=WOOD_DARK)
keep("SHOTA0", image)

# The impact wrench, side on: its socket to the right, its grip and battery below.
image, draw = small(40, 24)
draw.rectangle((30, 6, 39, 10), fill=STEEL_LIGHT)
draw.rounded_rectangle((4, 2, 31, 14), 4, fill=YELLOW)
draw.rectangle((14, 2, 18, 14), fill=BLACK)
draw.polygon([(10, 13), (20, 13), (18, 21), (8, 21)], fill=BLACK)
draw.rectangle((4, 20, 22, 24), fill=YELLOW_DARK)
keep("MGUNA0", image)

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

blob = bytearray()
manifest = []
for name, width, height, left, top, pixels, solid in pictures:
    manifest.append({"name": name, "width": width, "height": height, "left": left, "top": top, "at": len(blob)})
    blob += pixels + solid
(here / "tools.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "tools.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "pictures,", len(blob), "bytes")

if len(sys.argv) > 2:
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
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(sys.argv[2])
