"""The store's own walls that are built from pieces: textures.py puts these together into whole walls.

Three sets:

- the shop wall (the pieces of GRAY1): cream paint over a navy wainscot, a rail between;
- shelves of parts in boxes (the pieces of CRATWIDE, CRATE1 and CRATE2): orange boxes above, blue
  below, each row on a steel shelf, white labels on their faces;
- the counter's front (the pieces of WOOD1): a top edge, a laminate panel, a kick plate.

Run by hand (it needs numpy and Pillow):

    python3 games/shooter/delbies/art/walls.py

It writes walls.bin.gz and walls.json, in the form rats.py writes the sprites.
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

pictures = []
def keep(name, image, grit=7):
    """A piece, with a little unevenness so paint and card don't look like flat colour."""
    rgb = np.array(image.convert("RGB")).astype(int)
    height, width, _ = rgb.shape
    ys, xs = np.indices((height, width))
    rgb += ((((xs * 13 + ys * 7) % 11) - 5) * grit // 5)[..., None]
    rgb = np.clip(rgb, 0, 255)
    pixels = bytes(nearest(rgb[y, x]) for y in range(height) for x in range(width))
    pictures.append((name, width, height, 0, 0, pixels, bytes([1]) * (width * height)))

CREAM, CREAM_DARK = (214, 204, 182), (176, 166, 146)
NAVY, NAVY_DARK, NAVY_LIGHT = (44, 62, 120), (26, 36, 76), (72, 94, 160)
STEEL, STEEL_DARK = (120, 126, 134), (62, 66, 74)
WHITE, BLACK = (240, 238, 230), (22, 22, 24)

# The shop wall. Above: paint, a seam down the middle, a shadow under the ceiling.
image = Image.new("RGB", (64, 64), CREAM)
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 63, 3), fill=CREAM_DARK)
draw.line((31, 4, 31, 63), fill=CREAM_DARK)
draw.line((32, 4, 32, 63), fill=(228, 220, 200))
keep("W33_7", image)
# Below: a rail, the wainscot in two panels, a skirting board.
image = Image.new("RGB", (64, 64), NAVY)
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 63, 5), fill=NAVY_DARK)
draw.line((0, 1, 63, 1), fill=NAVY_LIGHT)
for x in (3, 35):
    draw.rectangle((x, 11, x + 25, 51), outline=NAVY_DARK)
    draw.line((x + 1, 12, x + 24, 12), fill=NAVY_LIGHT)
draw.rectangle((0, 57, 63, 63), fill=BLACK)
keep("W33_9", image)

def boxes(name, width, card, card_dark, stripe, ends):
    """A piece of shelving 64 high: two rows of boxes, each on a steel shelf. `ends` draws the boxes'
    own edges and labels; the narrow middle piece has none, so it repeats as one long box."""
    image = Image.new("RGB", (width, 64), card)
    draw = ImageDraw.Draw(image)
    for top in (0, 32):
        draw.rectangle((0, top + 27, width - 1, top + 31), fill=STEEL)
        draw.line((0, top + 27, width - 1, top + 27), fill=(170, 176, 184))
        draw.line((0, top + 31, width - 1, top + 31), fill=STEEL_DARK)
        draw.rectangle((0, top, width - 1, top + 2), fill=BLACK)
        draw.rectangle((0, top + 17, width - 1, top + 20), fill=stripe)
        if ends:
            # Two boxes side by side, a gap between, a label on each.
            for x0 in (1, width // 2 + 1):
                x1 = x0 + width // 2 - 3
                draw.rectangle((x0 - 1, top + 3, x0 - 1, top + 26), fill=BLACK)
                draw.rectangle((x1 + 1, top + 3, x1 + 1, top + 26), fill=card_dark)
                draw.rectangle((x0 + 2, top + 6, x0 + 9, top + 14), fill=WHITE)
                draw.line((x0 + 3, top + 8, x0 + 8, top + 8), fill=BLACK)
                draw.line((x0 + 3, top + 11, x0 + 6, top + 11), fill=BLACK)
    keep(name, image)

ORANGE, ORANGE_DARK = (226, 122, 36), (160, 78, 16)
BLUE, BLUE_DARK = (58, 92, 176), (30, 50, 110)
for prefix, colours in (("G", (ORANGE, ORANGE_DARK, WHITE)), ("B", (BLUE, BLUE_DARK, (240, 200, 50)))):
    boxes(prefix + "CRATEL1", 32, *colours, True)
    boxes(prefix + "CRATER1", 32, *colours, True)
    boxes(prefix + "CRATEM1", 8, *colours, False)

# The counter's front. Its top 40 rows are what shows: an edge, a panel, a kick plate; the rest is more panel.
for name in ("WALL40_1", "WALL40_2"):
    image = Image.new("RGB", (128, 128), (168, 162, 148))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 127, 5), fill=(70, 72, 78))
    draw.line((0, 1, 127, 1), fill=(150, 154, 162))
    draw.line((0, 6, 127, 6), fill=(110, 104, 92))
    for x in (0, 64):
        draw.rectangle((x + 3, 10, x + 60, 30), outline=(128, 122, 108))
    draw.rectangle((0, 34, 127, 39), fill=BLACK)
    draw.rectangle((0, 40, 127, 127), fill=(150, 144, 130))
    keep(name, image)

blob = bytearray()
manifest = []
for name, width, height, left, top, pixels, solid in pictures:
    manifest.append({"name": name, "width": width, "height": height, "left": left, "top": top, "at": len(blob)})
    blob += pixels + solid
(here / "walls.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "walls.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "pieces,", len(blob), "bytes")
