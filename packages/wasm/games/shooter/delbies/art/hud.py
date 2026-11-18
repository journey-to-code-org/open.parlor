"""The status bar: Delbie's face, and the bar itself, its figures and its lights, in the shop's steel blue.

The face is drawn here, a pixel at a time: dirty blond hair, a goatee, a full face, blue eyes, a smile that goes as his health
does. There are 42 of them: five states of health, each looking ahead, left and right, turned to
either side, shocked, grinning and furious; and one each for unhurtable and dead.

The bar is a steel panel with a yellow and black edge along its top, as on a shop floor, and a
dark window for each thing the engine writes into it: what is loaded, health, which tools are
carried, the face, armour, the keys, and how much of each kind of ammunition. Its big figures
are the menus' lettering; its small ones, and its labels, are a three-by-five letter made here.

Run by hand (it needs numpy and Pillow):

    python3 games/shooter/delbies/art/hud.py

It writes hud.bin.gz and hud.json, in the form rats.py writes the sprites.
"""
import gzip, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

here = Path(__file__).parent
palette = np.frombuffer((here / "palette.bin").read_bytes()[:768], np.uint8).reshape(256, 3).astype(int)

def nearest(rgb):
    return int(((palette - np.array(rgb)) ** 2).sum(1).argmin())

SKIN, SHADE, DEEP = (236, 184, 150), (204, 148, 116), (160, 108, 84)
# Dirty blond, and a goatee a shade darker.
HAIR, HAIR_DARK = (186, 152, 96), (136, 106, 62)
BEARD, BEARD_DARK = (158, 124, 76), (112, 86, 50)
WHITE, BLUE, PUPIL = (250, 250, 250), (60, 130, 235), (16, 28, 60)
LIP, TOOTH, DARK = (170, 70, 60), (252, 248, 232), (60, 24, 20)
BLOOD, BRUISE = (190, 16, 16), (150, 96, 120)
GOLD = (255, 220, 70)

def face(hurt=0, look=0, turn=0, mood="smile", gold=False, dead=False):
    """Delbie, 24 by 29. hurt: 0 (fine) to 4; look and turn: -1 (his right), 0, 1."""
    w, h = 24, 29
    img = np.zeros((h, w, 3), np.uint8)
    there = np.zeros((h, w), bool)
    def put(x, y, colour):
        if 0 <= x < w and 0 <= y < h:
            img[y, x] = colour
            there[y, x] = True
    cx = 12 + turn * 2
    # The head: an egg, lit from the left.
    # A full face: wide at the cheeks, and not much narrower at the jaw.
    def half_at(y):
        wide = 10.4 * (1 - ((y - 15) / 16.5) ** 2) ** 0.5
        return wide if y < 22 else wide - (y - 22) * 0.3
    for y in range(3, 28):
        half = half_at(y)
        for x in range(w):
            d = (x + 0.5 - cx)
            if abs(d) <= half:
                put(x, y, SHADE if d > half - 2.2 else DEEP if abs(d) > half - 0.9 else SKIN)
    # A goatee: over the lip, down either side of the mouth, and the chin. The cheeks and jaw are bare.
    for y in range(19, 28):
        for x in range(w):
            if not there[y, x]:
                continue
            d = abs(x + 0.5 - cx - turn)
            if d <= 5.5 and (y <= 20 or y >= 24 or d >= 3.5):
                put(x, y, BEARD_DARK if (x * 3 + y * 5) % 7 < 2 else BEARD)
    # Hair: short on top, swept to one side, a little down the temples.
    for y in range(1, 9):
        half = 9.6 * (1 - ((y - 9) / 9.0) ** 2) ** 0.5
        if y >= 6:
            half = min(half, 8.4)
        for x in range(w):
            d = x + 0.5 - cx
            if abs(d) <= half and (y < 6 or abs(d) > 6.2 or (y == 6 and d < 2)):
                put(x, y, HAIR_DARK if (x + y) % 4 == 0 or abs(d) > half - 1 else HAIR)
    ex = cx + turn  # features slide a little with the head
    brow = 10 + (1 if mood == "kill" else 0) - (1 if mood == "ouch" else 0)
    for side in (-1, 1):
        x0 = ex + side * 4
        for dx in (-2, -1, 0, 1):
            put(x0 + dx, brow + (dx * side < 0 and mood == "kill"), HAIR_DARK)
        if dead:
            for d in (-1, 0, 1):
                put(x0 + d - (side < 0), 13 + d, DARK); put(x0 + d - (side < 0), 13 - d, DARK)
            continue
        tall = 3 if mood == "ouch" else 2
        for dy in range(tall):
            for dx in (-2, -1, 0, 1):
                put(x0 + dx, 12 + dy, WHITE)
        px = x0 - 1 + look + (0 if side < 0 else 0)
        for dy in range(tall):
            put(px, 12 + dy, GOLD if gold else BLUE); put(px + 1, 12 + dy, GOLD if gold else BLUE)
        put(px + (1 if look >= 0 else 0), 12 + tall - 1, PUPIL if not gold else GOLD)
    # Nose, and the line of the cheek.
    for y in (15, 16, 17):
        put(ex + 1, y, SHADE)
    put(ex, 18, DEEP); put(ex + 1, 18, DEEP)
    # Mouth.
    my = 21
    if mood == "smile" and not dead:
        wide = 4 - min(hurt, 3)
        for dx in range(-wide, wide + 1):
            put(ex + dx, my + (0 if abs(dx) < wide else -1), LIP)
        if hurt < 2:
            for dx in range(-wide + 1, wide):
                put(ex + dx, my - 0, TOOTH); put(ex + dx, my + 1, LIP)
    elif mood == "grin":
        for dx in range(-5, 6):
            put(ex + dx, my - 1 - (abs(dx) > 3), LIP); put(ex + dx, my, TOOTH); put(ex + dx, my + 1, TOOTH if abs(dx) < 4 else LIP); put(ex + dx, my + 2, LIP)
    elif mood == "ouch":
        for dy in range(-1, 4):
            for dx in range(-2, 3):
                put(ex + dx, my + dy, DARK if abs(dx) < 2 and 0 <= dy < 3 else LIP)
    elif mood == "kill":
        for dx in range(-4, 5):
            put(ex + dx, my - 1, LIP); put(ex + dx, my, TOOTH if dx % 2 else SHADE); put(ex + dx, my + 1, LIP)
    else:
        for dx in range(-3, 4):
            put(ex + dx, my, LIP)
    # The worse for wear.
    marks = [(cx - 6, 16, BRUISE), (cx + 5, 9, BLOOD), (cx + 5, 10, BLOOD), (cx - 3, 19, BLOOD), (cx - 3, 20, BLOOD), (cx - 3, 21, BLOOD), (cx + 6, 17, BLOOD), (cx + 6, 18, BLOOD), (cx - 7, 12, BLOOD), (cx - 7, 13, BLOOD), (cx + 2, 23, BLOOD), (cx + 2, 24, BLOOD), (cx - 5, 8, BLOOD), (cx - 6, 17, BRUISE), (cx + 4, 20, BLOOD), (cx + 4, 21, BLOOD), (cx, 25, BLOOD)]
    for x, y, colour in marks[: [0, 3, 7, 12, 17][hurt]]:
        if there[min(max(y, 0), h - 1), min(max(x, 0), w - 1)]:
            put(x, y, colour)
    if dead:
        img[there] = (img[there] * 0.7 + np.array((40, 40, 60)) * 0.3).astype(np.uint8)
    return img, there

pictures = []
def add(name, rgb, there, left, top):
    height, width = there.shape
    pixels = bytes(nearest(rgb[y, x]) if there[y, x] else 0 for y in range(height) for x in range(width))
    pictures.append((name, width, height, left, top, pixels, bytes(there.astype(np.uint8).tobytes())))

# The faces are Mikey's pictures of Delbie (given/face-0.png to face-3.png, cut out by cutout.py): smiling, cross, bruised, and bloodied.
# There are four, and the engine wants 42: five states of health, each looking ahead and to either side, turned, hurt, grinning and
# furious. So each state of health is one of the four, moved a pixel or two for where he looks, and the next worse one for being hurt.
FACES = [np.array(Image.open(here / "given" / f"face-{index}.png").convert("RGBA")) for index in range(4)]
def as_face(name, hurt=0, look=0, turn=0, mood="smile", gold=False, dead=False):
    """A face in its box: where the engine expects a face to be drawn from."""
    width, height, left, top = 24, 29, -5, -2
    which = (0, 1, 2, 3, 3)[hurt]
    if mood in ("ouch", "kill"):
        which = min(3, which + 1)
    if mood == "grin":
        which = max(0, which - 1)
    shown = FACES[which]
    shift = -(look + turn)
    moved = np.zeros_like(shown)
    if shift > 0:
        moved[:, shift:] = shown[:, :-shift]
    elif shift < 0:
        moved[:, :shift] = shown[:, -shift:]
    else:
        moved = shown.copy()
    rgb = moved[..., :3].astype(int)
    if gold:
        rgb = np.clip(rgb * np.array([1.15, 1.08, 0.7]) + (30, 24, 0), 0, 255)
    if dead:
        grey = rgb.mean(2, keepdims=True)
        rgb = (rgb * 0.35 + grey * 0.4)
    add(name, rgb.astype(np.uint8), moved[..., 3] > 127, left, top)

for hurt in range(5):
    for i, look in enumerate((0, 1, -1)):
        as_face(f"STFST{hurt}{i}", hurt=hurt, look=look)
    as_face(f"STFTL{hurt}0", hurt=hurt, turn=1, look=1)
    as_face(f"STFTR{hurt}0", hurt=hurt, turn=-1, look=-1)
    as_face(f"STFOUCH{hurt}", hurt=hurt, mood="ouch")
    as_face(f"STFEVL{hurt}", hurt=hurt, mood="grin")
    as_face(f"STFKILL{hurt}", hurt=hurt, mood="kill")
as_face("STFGOD0", gold=True, mood="grin")
as_face("STFDEAD0", hurt=4, dead=True, mood="flat")

# A letter three wide and five tall, for what is too small for any other: a row of each is a string of 1s and 0s.
TINY = {
    "0": "111 101 101 101 111", "1": "010 110 010 010 111", "2": "111 001 111 100 111", "3": "111 001 111 001 111", "4": "101 101 111 001 001",
    "5": "111 100 111 001 111", "6": "111 100 111 101 111", "7": "111 001 001 001 001", "8": "111 101 111 101 111", "9": "111 101 111 001 111",
    "A": "010 101 111 101 101", "B": "110 101 110 101 110", "C": "011 100 100 100 011", "D": "110 101 101 101 110", "E": "111 100 110 100 111",
    "G": "011 100 101 101 011", "H": "101 101 111 101 101", "K": "101 101 110 101 101", "L": "100 100 100 100 111", "M": "10001 11011 10101 10001 10001",
    "N": "110 101 101 101 101", "O": "111 101 101 101 111", "R": "110 101 110 101 101", "S": "011 100 010 001 110", "T": "111 010 010 010 010",
    "U": "101 101 101 101 111", "Y": "101 101 010 010 010", "/": "001 001 010 100 100", " ": "00 00 00 00 00",
}
def tiny(text):
    """A line of the tiny letter, as where it is."""
    rows = [np.array([[c == "1" for c in row] for row in TINY[char].split()]) for char in text]
    wide = sum(r.shape[1] + 1 for r in rows) - 1
    there = np.zeros((5, wide), bool)
    x = 0
    for r in rows:
        there[:, x:x + r.shape[1]] = r
        x += r.shape[1] + 1
    return there

STEEL, STEEL_LIGHT, STEEL_DARK, WINDOW = (64, 80, 116), (112, 130, 170), (34, 44, 72), (10, 14, 30)
YELLOW, BLACK, CREAM, GREY, RED, BLUE = (246, 204, 44), (16, 16, 20), (255, 240, 170), (120, 128, 144), (220, 44, 40), (70, 120, 235)

def panel(width, height, along=0):
    """A stretch of the bar: steel, lighter along its top and darker along its bottom, with the yellow and black edge."""
    rgb = np.zeros((height, width, 3), np.uint8)
    rgb[:] = STEEL
    rgb[2:3] = STEEL_LIGHT
    rgb[-1:] = STEEL_DARK
    for x in range(width):
        rgb[0:2, x] = YELLOW if ((x + along) // 6) % 2 == 0 else BLACK
    return rgb

def window(rgb, x0, y0, x1, y1):
    """A dark window in the bar, sunk: a shadow along its top and left, a light along its bottom and right."""
    rgb[y0:y1, x0:x1] = WINDOW
    rgb[y0 - 1, x0 - 1:x1] = STEEL_DARK
    rgb[y0 - 1:y1, x0 - 1] = STEEL_DARK
    rgb[y1, x0:x1 + 1] = STEEL_LIGHT
    rgb[y0:y1 + 1, x1] = STEEL_LIGHT

def label(rgb, text, x, y, colour=CREAM):
    there = tiny(text)
    rgb[y:y + 5, x:x + there.shape[1]][there] = colour

# The bar. The engine writes: what is loaded, ending at 44; health, ending at 90 with its % after; the face from 143; armour, ending at 221;
# the keys at 239; and the four kinds of ammunition, how much ending at 288 and the most ending at 314, 6 apart from 5 down.
# The bar is Mikey's (given/bar.png, off his sheet): blue and gold, its windows labelled. His has figures and a face painted in its
# windows to show what goes there; those are emptied here, since the engine writes its own into them.
bar = np.array(Image.open(here / "given" / "bar.png").convert("RGB"))
for x0, y0, x1, y1 in ((12, 6, 53, 21), (59, 6, 108, 21), (111, 5, 141, 21), (146, 3, 178, 30), (188, 6, 237, 21), (239, 2, 249, 30), (275, 3, 316, 29)):
    bar[y0:y1, x0:x1] = WINDOW
add("STBAR", bar, np.ones((32, 320), bool), 0, 0)
# The panel of tools carried, which the engine lays over the bar from 104 when the game isn't a fight between players.
add("STARMS", bar[:, 104:144].copy(), np.ones((32, 40), bool), 0, 0)

# The big figures, in the menus' lettering: every one the same width, so a number doesn't shift as it changes.
BIG = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf", 16)
def big(char):
    image = Image.new("L", (24, 24), 0)
    ImageDraw.Draw(image).text((4, 0), char, 255, BIG)
    fill = np.array(image) > 110
    rows, cols = np.where(fill)
    fill = fill[:, cols.min():cols.max() + 1]
    cap = BIG.getbbox("0")
    fill = fill[cap[1]:cap[1] + 14]
    out = np.zeros((16, 13), bool)
    at = max(0, (13 - fill.shape[1]) // 2)
    out[1:15, at:at + min(13 - at, fill.shape[1])] = fill[:, :13 - at]
    rgb = np.zeros((16, 13, 3), np.uint8)
    for y in range(16):
        t = min(1, max(0, (y - 1) / 13))
        rgb[y] = [round(a + (b - a) * t) for a, b in zip((255, 238, 120), (242, 160, 30))]
    edge = out.copy()
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0), (1, 1)):
        edge |= np.roll(np.roll(out, dy, 0), dx, 1)
    rgb[edge & ~out] = (12, 16, 44)
    return rgb, edge
for digit in "0123456789":
    add(f"STTNUM{digit}", *big(digit), 0, 0)
add("STTPRCNT", *big("%"), 0, 0)
add("STTMINUS", *big("-"), 0, 0)

# The small figures: yellow for what you have, grey for what you haven't, and plain ones for the map's marks.
def small(digit, colour, pad=True):
    there = tiny(digit)
    out = np.zeros((6, 4), bool) if pad else there
    if pad:
        out[0:5, 0:3] = there
    rgb = np.zeros(out.shape + (3,), np.uint8)
    rgb[:] = colour
    return rgb, out
for digit in "0123456789":
    add(f"STYSNUM{digit}", *small(digit, YELLOW), 0, 0)
    add(f"STGNUM{digit}", *small(digit, GREY), 0, 0)
    add(f"AMMNUM{digit}", *small(digit, CREAM, pad=False), -1, 0)

# The keys' lights: a tag of each colour, and the same three again for the engine's other kind of key.
for index, colour in enumerate((BLUE, YELLOW, RED) * 2):
    rgb = np.zeros((5, 7, 3), np.uint8)
    rgb[:] = colour
    rgb[0, :] = [min(255, v + 50) for v in colour]
    rgb[2, 1:2] = BLACK
    there = np.ones((5, 7), bool)
    there[0, 0] = there[4, 0] = False
    add(f"STKEYS{index}", rgb, there, 0, 0)

# What is behind the face, a colour for each of four players; and the same, a little taller, for the page between levels.
for index, colour in enumerate(((40, 110, 60), (70, 76, 110), (120, 80, 44), (150, 40, 40))):
    for name, tall in ((f"STFB{index}", 31), (f"STPB{index}", 33)):
        rgb = np.zeros((tall, 35, 3), np.uint8)
        rgb[:] = colour
        rgb[0] = rgb[-1] = [v // 2 for v in colour]
        add(name, rgb, np.ones((tall, 35), bool), 0, 0)

# The edge around the view when it is made smaller than the screen: a steel rim, in eight pieces; what is outside it is a floor (textures.py).
def rim(name, width, height, where):
    rgb = np.zeros((height, width, 3), np.uint8)
    rgb[:] = STEEL
    there = np.zeros((height, width), bool)
    there[where] = True
    add(name, rgb, there, 0, 0)
rim("BRDR_T", 8, 8, np.s_[5:, :]); rim("BRDR_B", 8, 8, np.s_[:3, :]); rim("BRDR_L", 8, 8, np.s_[:, 5:]); rim("BRDR_R", 8, 8, np.s_[:, :3])
rim("BRDR_TL", 8, 8, np.s_[5:, 5:]); rim("BRDR_TR", 8, 8, np.s_[5:, :3]); rim("BRDR_BL", 8, 8, np.s_[:3, 5:]); rim("BRDR_BR", 8, 8, np.s_[:3, :3])

blob = bytearray()
manifest = []
for name, width, height, left, top, pixels, solid in pictures:
    manifest.append({"name": name, "width": width, "height": height, "left": left, "top": top, "at": len(blob)})
    blob += pixels + solid
(here / "hud.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "hud.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "pictures,", len(blob), "bytes")

if len(sys.argv) > 1:
    from PIL import Image
    sheet = Image.new("RGB", (330, 150), (40, 44, 60))
    x = y = 4
    for name, width, height, left, top, pixels, solid in pictures:
        if x + width > 326:
            x, y = 4, y + 36
        im = Image.fromarray(np.dstack([palette[np.frombuffer(pixels, np.uint8).reshape(height, width)].astype(np.uint8), np.frombuffer(solid, np.uint8).reshape(height, width) * 255]), "RGBA")
        sheet.paste(im, (x, y), im)
        x += width + 3
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(sys.argv[1])
