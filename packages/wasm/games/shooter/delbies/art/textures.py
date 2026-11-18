"""Every wall, floor, ceiling and sky the game has, drawn here: an auto parts store's, and nobody else's.

A wall is one picture, the size the levels expect of its name. A floor or ceiling is 64 by 64
and repeats. Each is painted with a few rules (courses of brick, planks, blocks, a panel and its
trim) and a little grit, then brought into the game's own colours (palette.py).

The shelves of parts, the shop wall and the counter's front are put together from the pieces
walls.py draws, so run that first.

Run by hand (it needs numpy and Pillow):

    python3 games/shooter/delbies/art/textures.py

It writes textures.bin.gz and textures.json: for each, its name, its kind ("wall" or "floor"),
its size, and where its pixels start.
"""
import gzip, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

here = Path(__file__).parent
palette = np.frombuffer((here / "palette.bin").read_bytes()[:768], np.uint8).reshape(256, 3).astype(int)
rng = np.random.default_rng(1993)

def to_palette(rgb):
    flat = rgb.reshape(-1, 3).astype(int)
    return ((flat[:, None, :] - palette[None, :, :]) ** 2).sum(2).argmin(1).astype(np.uint8).reshape(rgb.shape[:2])

def canvas(width, height, colour):
    rgb = np.zeros((height, width, 3), float)
    rgb[:] = colour
    return rgb

def grit(rgb, amount=8, streak=0):
    """Wear: every pixel a little lighter or darker; `streak` runs some of it down the wall."""
    noise = rng.normal(0, amount, rgb.shape[:2])
    if streak:
        noise += np.repeat(rng.normal(0, streak, (1, rgb.shape[1])), rgb.shape[0], 0)
    return rgb + noise[..., None]

def lines(rgb, every, colour, across=True, at=0, thick=1):
    for start in range(at, rgb.shape[0] if across else rgb.shape[1], every):
        if across:
            rgb[start:start + thick] = colour
        else:
            rgb[:, start:start + thick] = colour
    return rgb

def brick(width, height, face=(150, 72, 52), mortar=(176, 168, 150), long=16, tall=8):
    rgb = canvas(width, height, face)
    for row in range(0, height, tall):
        shift = (row // tall % 2) * (long // 2)
        for x in range(-shift, width, long):
            rgb[row:row + tall - 1, max(0, x):x + long - 1] += rng.normal(0, 9)
        rgb[row + tall - 1:row + tall] = mortar
        for x in range(-shift, width, long):
            if 0 <= x + long - 1 < width:
                rgb[row:row + tall, x + long - 1] = mortar
    return grit(rgb, 6)

def blocks(width, height, face=(128, 130, 136)):
    """Painted cinder block: big courses, a shadow under each."""
    rgb = brick(width, height, face, tuple(v - 46 for v in face), 32, 16)
    return rgb

def planks(width, height, wood=(150, 96, 52), across=False, wide=16):
    rgb = canvas(width, height, wood)
    length = width if across else height
    for start in range(0, height if across else width, wide):
        tone = rng.normal(0, 12)
        grain = rng.normal(0, 5, (length,))
        if across:
            rgb[start:start + wide] += tone + grain[None, :, None]
            rgb[start + wide - 1:start + wide] = tuple(v * 0.45 for v in wood)
        else:
            rgb[:, start:start + wide] += tone + grain[:, None, None]
            rgb[:, start + wide - 1:start + wide] = tuple(v * 0.45 for v in wood)
    return grit(rgb, 5)

def plaster(width, height, colour, base=None, rail=None):
    """A painted wall: perhaps a darker band along its foot, and a rail between."""
    rgb = canvas(width, height, colour)
    if base:
        rgb[height - 40:] = base
    if rail:
        rgb[height - 43:height - 40] = rail
    rgb[height - 5:] *= 0.6
    return grit(rgb, 5, 3)

def door(width, height, colour, panels=True, steel=False):
    rgb = canvas(width, height, colour)
    rgb[:, :2] = rgb[:, -2:] = tuple(v * 0.5 for v in colour)
    rgb[:2] = tuple(v * 0.5 for v in colour)
    if panels:
        for x0, y0, x1, y1 in ((8, 8, 28, 34), (36, 8, 56, 34), (8, 40, 28, 66), (36, 40, 56, 66)):
            rgb[y0:y1, x0:x1] *= 0.86
            rgb[y0:y0 + 1, x0:x1] *= 0.6
            rgb[y0:y1, x0:x0 + 1] *= 0.6
    if steel:
        rgb = lines(rgb, 12, tuple(v * 0.8 for v in colour), at=6)
        for y in range(4, height, 16):
            rgb[y:y + 2, 4:6] = rgb[y:y + 2, width - 6:width - 4] = (40, 44, 52)
    # A handle.
    rgb[height // 2 - 2:height // 2 + 3, width - 12:width - 7] = (214, 190, 90) if not steel else (190, 196, 206)
    return grit(rgb, 4)

def switch(width, height, on):
    """The office wall with a breaker box on it: a handle down and a red light, or up and a green one."""
    rgb = plaster(width, height, (198, 176, 134), (64, 80, 116), (40, 50, 80))
    rgb[44:84, 18:46] = (92, 98, 110)
    rgb[44:46, 18:46] = (150, 158, 172)
    rgb[82:84, 18:46] = (50, 54, 64)
    rgb[52:76, 29:35] = (30, 32, 38)
    handle = slice(52, 62) if on else slice(66, 76)
    rgb[handle, 27:37] = (236, 200, 60)
    rgb[47:51, 38:42] = (60, 220, 80) if on else (220, 50, 40)
    return rgb

def roll_door(width, height):
    """A bay door: steel slats across, a handle, a yellow and black foot."""
    rgb = canvas(width, height, (150, 156, 166))
    for y in range(0, height, 8):
        rgb[y:y + 1] = (196, 202, 212)
        rgb[y + 6:y + 8] = (92, 98, 110)
    for x in range(width):
        rgb[height - 8:, x] = (236, 196, 40) if (x // 8) % 2 == 0 else (24, 24, 28)
    rgb[height - 30:height - 26, width // 2 - 12:width // 2 + 12] = (60, 64, 74)
    return grit(rgb, 4, 2)

def front_door(width, height):
    """The store's front doors: two, glass in steel, with a push bar each."""
    rgb = canvas(width, height, (70, 78, 96))
    for x0 in (4, width // 2 + 2):
        x1 = x0 + width // 2 - 6
        sky = np.linspace(0, 1, height - 16)[:, None, None]
        rgb[8:height - 8, x0:x1] = np.array((150, 190, 226)) * (1 - sky * 0.35)
        # What the light does on glass.
        for i in range(0, 40, 3):
            rgb[20 + i:22 + i, x0 + 6 + i // 2:x0 + 10 + i // 2] += 34
        rgb[height // 2:height // 2 + 4, x0:x1] = (196, 202, 212)
    rgb[:, width // 2 - 1:width // 2 + 1] = (30, 34, 44)
    return grit(rgb, 3)

def pipes(width, height):
    rgb = blocks(width, height, (110, 112, 118))
    for y, thick, colour in ((18, 12, (150, 90, 50)), (46, 8, (160, 166, 176)), (70, 16, (60, 110, 80)), (104, 6, (170, 60, 50))):
        shade = np.sin(np.linspace(0.15, np.pi - 0.15, thick))[:, None, None]
        rgb[y:y + thick] = np.array(colour) * (0.45 + 0.75 * shade)
        for x in range(30, width, 64):
            rgb[y - 2:y + thick + 2, x:x + 5] = (60, 64, 74)
    return grit(rgb, 4)

def corrugated(width, height, colour=(140, 148, 160)):
    rgb = canvas(width, height, colour)
    wave = (np.sin(np.arange(width) / 8 * 2 * np.pi) * 0.22 + 0.9)[None, :, None]
    rgb = rgb * wave
    rgb[::32] *= 0.7
    return grit(rgb, 4, 6)

def panelling(width, height):
    rgb = planks(width, height, (132, 84, 48), wide=16)
    rgb[:6] = (88, 54, 30)
    rgb[height - 10:] = (70, 44, 26)
    return rgb

def sky(width, height, dusk=False):
    rgb = np.zeros((height, width, 3), float)
    top, low = ((40, 60, 130), (236, 150, 90)) if dusk else ((92, 140, 222), (206, 226, 246))
    t = np.linspace(0, 1, height)[:, None, None] ** 1.4
    rgb[:] = np.array(top) * (1 - t) + np.array(low) * t
    image = Image.fromarray(rgb.clip(0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(image)
    cloud = (250, 226, 200) if dusk else (252, 252, 252)
    for cx, cy, size in ((40, 30, 22), (120, 52, 30), (200, 24, 18), (236, 70, 26), (78, 84, 20)):
        for dx, dy, r in ((0, 0, 1.0), (-0.9, 0.2, 0.7), (0.9, 0.25, 0.75), (0.3, -0.4, 0.7)):
            for wrap in (-width, 0, width):
                x, y, rad = cx + dx * size + wrap, cy + dy * size, r * size * 0.6
                draw.ellipse((x - rad * 1.5, y - rad * 0.7, x + rad * 1.5, y + rad * 0.7), fill=cloud)
    return np.array(image).astype(float)

def pieces():
    """What walls.py drew, by name, as colours."""
    blob = gzip.decompress((here / "walls.bin.gz").read_bytes())
    found = {}
    for one in json.loads((here / "walls.json").read_text()):
        w, h = one["width"], one["height"]
        found[one["name"]] = palette[np.frombuffer(blob[one["at"]:one["at"] + w * h], np.uint8).reshape(h, w)].astype(float)
    return found
piece = pieces()
def put_together(width, height, parts):
    rgb = np.zeros((height, width, 3), float)
    for name, x, y in parts:
        part = piece[name]
        rgb[y:y + part.shape[0], x:x + part.shape[1]] = part[: height - y, : width - x]
    return rgb
def shelves(top, bottom, width):
    """Boxes of parts on shelves: a row of one colour above a row of another, as wide as wanted."""
    parts = []
    for y, kind in ((0, top), (64, bottom)):
        parts += [(f"{kind}CRATEL1", 0, y), (f"{kind}CRATER1", width - 32, y)] + [(f"{kind}CRATEM1", x, y) for x in range(32, width - 32, 8)]
    return put_together(width, 128, parts)

walls = {
    "BIGDOOR1": roll_door(128, 96),
    "BIGDOOR2": front_door(128, 128),
    "BRICK1": brick(64, 128),
    "BROWN1": plaster(128, 128, (198, 176, 134), (64, 80, 116), (40, 50, 80)),
    "BROWNGRN": plaster(64, 128, (150, 168, 132), (72, 96, 70), (44, 60, 44)),
    "CRATE1": shelves("B", "B", 64),
    "CRATE2": shelves("G", "G", 64),
    "CRATWIDE": shelves("G", "B", 128),
    "DOOR1": door(64, 72, (150, 100, 60)),
    "DOOR3": door(64, 72, (120, 128, 142), panels=False, steel=True),
    "DOORBLU2": grit(lines(canvas(16, 128, (64, 80, 116)), 16, (40, 50, 80), across=False, at=7, thick=2), 4),
    "DOORTRAK": grit(lines(canvas(8, 128, (70, 74, 84)), 8, (36, 38, 46), at=3), 4),
    "GRAY1": put_together(64, 128, [("W33_7", 0, 0), ("W33_9", 0, 64)]),
    "GRAY4": plaster(64, 128, (226, 214, 180), (150, 156, 166), (92, 98, 110)),
    "METAL1": corrugated(64, 128),
    "PANEL1": panelling(64, 128),
    "PIPE2": pipes(256, 128),
    "STEP4": grit(lines(canvas(32, 16, (120, 122, 130)), 16, (236, 196, 40), at=0, thick=2), 4),
    "STONE2": blocks(128, 128),
    "SW1BRN2": switch(64, 128, False),
    "SW2BRN2": switch(64, 128, True),
    "WOOD1": put_together(256, 128, [("WALL40_2", 0, 0), ("WALL40_1", 128, 0)]),
    "WOOD5": planks(256, 128, (140, 92, 54), wide=32),
    "SKY1": sky(256, 128),
    "SKY2": sky(256, 128, dusk=True),
}

def tiles(colour, other=None, size=32, seam=(60, 62, 70)):
    rgb = canvas(64, 64, colour)
    if other:
        for y in range(0, 64, size):
            for x in range(0, 64, size):
                if (x // size + y // size) % 2:
                    rgb[y:y + size, x:x + size] = other
    rgb = lines(lines(rgb, size, seam, at=size - 1), size, seam, across=False, at=size - 1)
    return grit(rgb, 4)

def concrete(colour, cracks=3):
    rgb = grit(canvas(64, 64, colour), 9)
    for _ in range(cracks):
        x, y = rng.integers(0, 64, 2)
        for _ in range(rng.integers(8, 24)):
            rgb[y % 64, x % 64] *= 0.6
            x, y = x + rng.integers(-1, 2), y + rng.integers(0, 2)
    return rgb

def ceiling_tiles(light=False):
    rgb = tiles((214, 212, 204), size=32, seam=(150, 150, 148))
    rgb += rng.normal(0, 3, (64, 64, 1))
    if light:
        rgb[6:26, 6:58] = (252, 250, 232)
        rgb[6:26, 31:33] = (190, 190, 180)
    return rgb

def joists():
    rgb = canvas(64, 64, (56, 44, 34))
    for x in range(0, 64, 16):
        rgb[:, x:x + 5] = (104, 74, 46)
        rgb[:, x + 4:x + 5] = (40, 30, 22)
    return grit(rgb, 6)

def box_top(colour):
    rgb = canvas(64, 64, colour)
    rgb[:, 30:34] = (214, 196, 150)
    rgb[:2] = rgb[-2:] = tuple(v * 0.6 for v in colour)
    rgb[:, :2] = rgb[:, -2:] = tuple(v * 0.6 for v in colour)
    rgb[24:40, 8:24] = (240, 238, 228)
    return grit(rgb, 5)

def gravel():
    rgb = grit(canvas(64, 64, (120, 108, 92)), 16)
    for _ in range(60):
        x, y = rng.integers(0, 63, 2)
        rgb[y:y + 2, x:x + 2] = rng.choice([(150, 142, 128), (90, 84, 74), (170, 160, 140)])
    return rgb

floors = {
    "CEIL1_1": ceiling_tiles(light=True),
    "CEIL3_5": ceiling_tiles(),
    "CEIL5_1": joists(),
    "CRATOP1": box_top((70, 110, 200)),
    "CRATOP2": box_top((230, 130, 40)),
    "FLAT14": tiles((64, 80, 116), (52, 66, 100), 16),
    "FLAT23": grit(lines(lines(canvas(64, 64, (128, 134, 146)), 32, (80, 84, 96), at=31), 32, (80, 84, 96), across=False, at=31), 5),
    "FLAT5_2": planks(64, 64, (150, 104, 62), across=True, wide=8),
    "FLOOR0_1": concrete((150, 150, 146)),
    "FLOOR0_3": concrete((112, 112, 112), 5),
    "FLOOR4_8": tiles((226, 222, 208), (60, 64, 76), 32),
    "FLOOR5_1": concrete((122, 116, 104), 6),
    "FLOOR7_1": gravel(),
    # Around the view when it is made smaller than the screen.
    "FLOOR7_2": tiles((52, 66, 100), (44, 56, 88), 16, (30, 40, 70)),
    "F_SKY1": canvas(64, 64, (92, 140, 222)),
    "STEP1": grit(lines(canvas(64, 64, (120, 122, 130)), 16, (80, 82, 90), at=15), 5),
    # What the words at the end are written over.
    "SFLR6_1": tiles((22, 34, 92), (16, 26, 76), 32, (10, 14, 44)),
}

# Mikey's own walls, floors and ceilings (given/wall-*.png, cut off his two sheets by cutout.py) take the place of the ones painted
# above under the same names: the store's blue block wall with its yellow band, shelves of jugs and boxes, the blue bay door, the
# shop front, a pegboard of tools, brick over a hazard stripe, cracked concrete, and a ceiling of tiles and strip lights.
for given in sorted((here / "given").glob("wall-*.png")):
    name = given.stem[5:]
    picture = np.array(Image.open(given).convert("RGB")).astype(float)
    (floors if name in floors else walls)[name] = picture

blob, manifest = bytearray(), []
for kind, set_ in (("wall", walls), ("floor", floors)):
    for name, rgb in set_.items():
        pixels = to_palette(rgb.clip(0, 255))
        manifest.append({"name": name, "kind": kind, "width": pixels.shape[1], "height": pixels.shape[0], "at": len(blob)})
        blob += pixels.tobytes()
(here / "textures.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "textures.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(f"{len(walls)} walls and {len(floors)} floors, {len(blob)} bytes")

if len(sys.argv) > 1:
    sheet = Image.new("RGB", (1300, 560), (40, 40, 48))
    x = y = 4
    tall = 0
    for one in manifest:
        w, h = one["width"], one["height"]
        im = Image.fromarray(palette[np.frombuffer(blob[one["at"]:one["at"] + w * h], np.uint8).reshape(h, w)].astype(np.uint8))
        if x + w > 1296:
            x, y, tall = 4, y + tall + 4, 0
        sheet.paste(im, (x, y))
        x, tall = x + w + 4, max(tall, h)
    sheet.save(sys.argv[1])
