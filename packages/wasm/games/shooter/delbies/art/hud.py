"""The status bar: Delbie's face in place of the engine's, and the bar itself in the shop's steel blue.

The face is drawn here, a pixel at a time: dirty blond hair, a beard, a full face, blue eyes, a smile that goes as his health
does. There are 42 of them: five states of health, each looking ahead, left and right, turned to
either side, shocked, grinning and furious; and one each for unhurtable and dead. Each is made
the size of the face it takes the place of, so the engine puts it where it put that one.

The bar, its weapon panel and the squares behind the face are Freedoom's own, tinted: the layout
and the labels the engine draws its numbers into are kept.

Run by hand (it needs numpy and Pillow):

    python3 games/shooter/delbies/art/hud.py public/data/freedoom1-0.13.0.wad.gz

It writes hud.bin.gz and hud.json, in the form rats.py writes the sprites.
"""
import gzip, json, struct, sys
from pathlib import Path
import numpy as np

here = Path(__file__).parent
wad = gzip.open(sys.argv[1]).read()
count, table = struct.unpack_from("<ii", wad, 4)
lumps = {}
for i in range(count):
    at, size, name = struct.unpack_from("<ii8s", wad, table + i * 16)
    lumps[name.rstrip(b"\0").decode()] = wad[at:at + size]
palette = np.frombuffer(lumps["PLAYPAL"][:768], np.uint8).reshape(256, 3).astype(int)

def nearest(rgb):
    return int(((palette - np.array(rgb)) ** 2).sum(1).argmin())

def patch(data):
    """An engine picture: its size, where it is drawn from, its pixels as colours and where it is solid."""
    width, height, left, top = struct.unpack_from("<hhhh", data, 0)
    pixels = np.zeros((height, width), np.uint8)
    solid = np.zeros((height, width), np.uint8)
    for x in range(width):
        at = struct.unpack_from("<i", data, 8 + x * 4)[0]
        while data[at] != 255:
            row, length = data[at], data[at + 1]
            pixels[row:row + length, x] = np.frombuffer(data[at + 3:at + 3 + length], np.uint8)
            solid[row:row + length, x] = 1
            at += length + 4
    return width, height, left, top, pixels, solid

SKIN, SHADE, DEEP = (236, 184, 150), (204, 148, 116), (160, 108, 84)
# Dirty blond, and a beard a shade darker.
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
    # A beard: along the jaw, over the lip, and all of the chin.
    for y in range(16, 28):
        for x in range(w):
            if not there[y, x]:
                continue
            d = abs(x + 0.5 - cx)
            if y >= 23 or d > half_at(y) - (1.2 + (y - 16) * 0.45) or (y in (19, 20) and d <= 5.5):
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

def as_face(name, **how):
    """A face in the box of the one it replaces: the same size, drawn from the same point."""
    width, height, left, top, _, _ = patch(lumps[name])
    drawn, there = face(**how)
    rgb = np.zeros((height, width, 3), np.uint8)
    solid = np.zeros((height, width), bool)
    ox, oy = (width - 24) // 2, max(0, height - 29)
    rgb[oy:oy + 29, ox:ox + 24] = drawn[: height - oy, : width - ox]
    solid[oy:oy + 29, ox:ox + 24] = there[: height - oy, : width - ox]
    add(name, rgb, solid, left, top)

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

def tinted(name):
    """One of the game's own pictures, its greys turned steel blue; what has colour of its own is left."""
    width, height, left, top, pixels, solid = patch(lumps[name])
    rgb = palette[pixels].astype(float)
    spread = rgb.max(-1) - rgb.min(-1)
    grey = (spread < 28)[..., None]
    rgb = np.where(grey, rgb * (0.62, 0.8, 1.08) + (0, 2, 10), rgb)
    if name in ("STBAR", "STARMS"):
        # A yellow and black edge along the top, as on a shop floor. The weapon panel is laid over the bar 104 along, and carries the edge on.
        along = 104 if name == "STARMS" else 0
        for x in range(width):
            rgb[0:2, x] = (236, 190, 40) if ((x + along) // 6) % 2 == 0 else (24, 24, 24)
    add(name, np.clip(rgb, 0, 255).astype(np.uint8), solid.astype(bool), left, top)

for name in ["STBAR", "STARMS", "STFB0", "STFB1", "STFB2", "STFB3"]:
    tinted(name)

blob = bytearray()
manifest = []
for name, width, height, left, top, pixels, solid in pictures:
    manifest.append({"name": name, "width": width, "height": height, "left": left, "top": top, "at": len(blob)})
    blob += pixels + solid
(here / "hud.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "hud.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "pictures,", len(blob), "bytes")

if len(sys.argv) > 2:
    from PIL import Image
    sheet = Image.new("RGB", (330, 150), (40, 44, 60))
    x = y = 4
    for name, width, height, left, top, pixels, solid in pictures:
        if x + width > 326:
            x, y = 4, y + 36
        im = Image.fromarray(np.dstack([palette[np.frombuffer(pixels, np.uint8).reshape(height, width)].astype(np.uint8), np.frombuffer(solid, np.uint8).reshape(height, width) * 255]), "RGBA")
        sheet.paste(im, (x, y), im)
        x += width + 3
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(sys.argv[2])
