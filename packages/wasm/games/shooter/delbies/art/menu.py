"""The game's own lettering and pages, in place of Freedoom's: what is around the game, in the
colours of its title picture (yellow letters edged in navy, a chequered strip).

- The menus: every line of them, the title over each, and a hex nut where the skull was.
- The small letters the game speaks in: messages, the words between levels and at the end.
- The page between levels: its background, "finished" and "now entering", each floor's name,
  and the figures.
- "How to play" (the menu's read-me page) and the credits page that comes round behind the title.

The letters are DejaVu Sans, which this needs installed, drawn at the size wanted and cut to
hard pixels. Everything is made the size of what it replaces, or near it, and placed as that was.

Run by hand, after tools.py and rats.py, whose pictures the read-me page shows (it needs numpy
and Pillow):

    python3 games/shooter/delbies/art/menu.py public/data/freedoom1-0.13.0.wad.gz

It writes menu.bin.gz and menu.json, in the form rats.py writes the rats.
"""
import gzip, json, re, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

here = Path(__file__).parent
wad = gzip.open(sys.argv[1]).read()
count, table = struct.unpack_from("<ii", wad, 4)
lumps = {}
for i in range(count):
    at, size, name = struct.unpack_from("<ii8s", wad, table + i * 16)
    lumps[name.rstrip(b"\0").decode()] = (at, size)
at, size = lumps["PLAYPAL"]
palette = np.frombuffer(wad[at:at + 768], np.uint8).reshape(256, 3).astype(int)
cache = {}
def nearest(rgb):
    key = tuple(int(v) for v in rgb)
    if key not in cache:
        cache[key] = int(((palette - np.array(key)) ** 2).sum(1).argmin())
    return cache[key]

def was(name):
    """What Freedoom's picture of that name is: its size and where it is drawn from."""
    at, size = lumps[name]
    return struct.unpack_from("<hhhh", wad, at)

def patch(data):
    """An engine picture: its size, where it is drawn from, its colours as red, green and blue, and where it is solid."""
    width, height, left, top = struct.unpack_from("<hhhh", data, 0)
    pixels = np.zeros((height, width), np.uint8)
    solid = np.zeros((height, width), bool)
    for x in range(width):
        at = struct.unpack_from("<i", data, 8 + x * 4)[0]
        while data[at] != 255:
            row, length = data[at], data[at + 1]
            pixels[row:row + length, x] = np.frombuffer(data[at + 3:at + 3 + length], np.uint8)
            solid[row:row + length, x] = True
            at += length + 4
    return width, height, left, top, palette[pixels], solid

NAVY, NAVY_LIGHT, NAVY_DEEP = (16, 26, 76), (36, 56, 128), (8, 12, 40)
YELLOW, ORANGE = (255, 222, 56), (242, 148, 22)
CREAM, WHITE, RED, BLACK = (255, 240, 170), (250, 250, 246), (220, 44, 40), (12, 12, 16)
STEEL, STEEL_DARK = (150, 160, 178), (70, 78, 96)

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-BoldOblique.ttf"
PLAIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
fonts = {}
def font(path, size):
    if (path, size) not in fonts:
        fonts[path, size] = ImageFont.truetype(path, size)
    return fonts[path, size]

def letters(text, size=14, path=BOLD):
    """Where the letters of a line are, as hard pixels, with a pixel to spare all round and two below and to the right."""
    face = font(path, size)
    x0, y0, x1, y1 = face.getbbox(text)
    ascent, descent = face.getmetrics()
    image = Image.new("L", (x1 - x0 + 6, ascent + descent + 4), 0)
    ImageDraw.Draw(image).text((2 - x0, 1), text, 255, face)
    return np.array(image) > 110

def grown(there, by=1):
    out = there.copy()
    for dy in range(-by, by + 1):
        for dx in range(-by, by + 1):
            out |= np.roll(np.roll(there, dy, 0), dx, 1)
    return out

def sign(text, size=14, top=YELLOW, bottom=ORANGE, edge=NAVY, tall=15, path=BOLD):
    """A line of the big lettering: yellow going to orange down the letters, edged in navy, with a shadow below and to the right."""
    fill = letters(text, size, path)
    rows = np.where(fill.any(1))[0]
    # Every line is cut to the same rows, whatever letters it has, so lines of a menu sit level.
    face = font(path, size)
    ascent, _ = face.getmetrics()
    cap = face.getbbox("H")
    y0 = 1 + cap[1] - 1
    fill = fill[y0:y0 + tall]
    if fill.shape[0] < tall:
        fill = np.vstack([fill, np.zeros((tall - fill.shape[0], fill.shape[1]), bool)])
    cols = np.where(fill.any(0))[0]
    fill = fill[:, max(0, cols.min() - 1):cols.max() + 3]
    edged = grown(fill) | np.roll(np.roll(grown(fill), 1, 0), 1, 1)
    edged[0, :] &= grown(fill)[0, :]
    height, width = fill.shape
    rgb = np.zeros((height, width, 3), np.uint8)
    lit = np.where(fill.any(1))[0]
    for y in range(height):
        t = 0 if len(lit) < 2 else min(1, max(0, (y - lit.min()) / (lit.max() - lit.min())))
        rgb[y, :] = [round(a + (b - a) * t) for a, b in zip(top, bottom)]
    rgb[edged & ~fill] = edge
    # A line of light along the top of each letter.
    crest = fill & ~np.roll(fill, 1, 0)
    rgb[crest] = [min(255, v + 30) for v in top]
    return rgb, edged

pictures = []
def keep(name, rgb, there, left=0, top=0):
    height, width = there.shape
    pixels = bytes(nearest(rgb[y, x]) if there[y, x] else 0 for y in range(height) for x in range(width))
    pictures.append((name, width, height, left, top, pixels, there.astype(np.uint8).tobytes()))

def line(name, text, **how):
    """A line of lettering in the place of one of Freedoom's, drawn from where that was."""
    _, _, left, top = was(name)
    rgb, there = sign(text, **how)
    keep(name, rgb, there, left, top)

# The menus.
for name, text in {
    "M_NGAME": "New Game", "M_OPTION": "Options", "M_LOADG": "Load Game", "M_SAVEG": "Save Game", "M_RDTHIS": "How to Play", "M_QUITG": "Quit Game",
    "M_NEWG": "NEW GAME", "M_SKILL": "How bad is it today?",
    "M_JKILL": "Slow Tuesday", "M_ROUGH": "A regular day", "M_HURT": "Busy Saturday", "M_ULTRA": "Inventory week", "M_NMARE": "Black Friday!",
    "M_EPISOD": "Where to start?", "M_EPI1": "The front porch", "M_EPI2": "The boiler room",
    "M_OPTTTL": "OPTIONS", "M_ENDGAM": "End Game", "M_MESSG": "Messages:", "M_MSGON": "on", "M_MSGOFF": "off",
    "M_DETAIL": "Graphic Detail:", "M_GDHIGH": "high", "M_GDLOW": "low", "M_SCRNSZ": "Screen Size", "M_MSENS": "Mouse Sensitivity",
    "M_SVOL": "Sound Volume", "M_SFXVOL": "Sound Effects", "M_MUSVOL": "Music", "M_LGTTL": "LOAD GAME", "M_SGTTL": "SAVE GAME", "M_PAUSE": "PAUSED",
}.items():
    line(name, text, **({"top": WHITE, "bottom": CREAM} if name in ("M_MSGON", "M_MSGOFF", "M_GDHIGH", "M_GDLOW") else {"top": (255, 120, 90), "bottom": RED} if name == "M_NMARE" else {}))

# Where the skull was: a hex nut, turning.
for name, turn in (("M_SKULL1", 0), ("M_SKULL2", 30)):
    image = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    corners = lambda r: [(40 + r * np.cos(np.radians(a + turn)), 40 + r * np.sin(np.radians(a + turn))) for a in range(0, 360, 60)]
    draw.polygon(corners(38), fill=NAVY + (255,))
    draw.polygon(corners(32), fill=STEEL + (255,))
    draw.polygon(corners(32)[:4], fill=(196, 204, 218, 255))
    draw.ellipse((24, 24, 56, 56), fill=NAVY + (255,))
    draw.ellipse((29, 29, 51, 51), fill=(0, 0, 0, 0))
    small = np.array(image.resize((20, 20), Image.BOX))
    _, _, left, top = was(name)
    keep(name, small[..., :3], small[..., 3] > 120, left, top)

# The sliders and the box a saved game's name is in: Freedoom's shapes, in navy and steel, and a yellow knob.
def tinted(name, low, high):
    width, height, left, top, rgb, there = patch(wad[lumps[name][0]:lumps[name][0] + lumps[name][1]])
    light = (rgb * np.array([0.3, 0.59, 0.11])).sum(2, keepdims=True) / 255
    light = np.clip((light - light[there].min()) / max(0.01, light[there].max() - light[there].min()), 0, 1)
    keep(name, (np.array(low) + (np.array(high) - np.array(low)) * light).astype(np.uint8), there, left, top)
for name in ("M_THERML", "M_THERMM", "M_THERMR", "M_LSLEFT", "M_LSCNTR", "M_LSRGHT"):
    tinted(name, NAVY_DEEP, STEEL)
tinted("M_THERMO", ORANGE, YELLOW)

# The small letters the game speaks in: capitals, figures and marks, each the same height so a line of them sits level.
SMALL, SMALL_TALL = font(PLAIN, 9), 10
def glyph(char):
    x0, y0, x1, y1 = SMALL.getbbox(char)
    image = Image.new("1", (max(1, x1) + 4, 14), 0)
    draw = ImageDraw.Draw(image)
    draw.fontmode = "1"
    draw.text((1, 1), char, 1, SMALL)
    fill = np.array(image, bool)
    cap = SMALL.getbbox("H")
    fill = fill[1 + cap[1] - 1:1 + cap[1] - 1 + SMALL_TALL]
    cols = np.where(fill.any(0))[0]
    if not len(cols):
        return None
    return fill[:, max(0, cols.min() - 1):cols.max() + 2]
for name in sorted(lumps):
    code = re.fullmatch(r"STCFN(\d{3})", name)
    if not code or not 33 <= int(code[1]) <= 95:
        continue
    fill = glyph(chr(int(code[1])))
    if fill is None:
        continue
    edged = grown(fill)
    rgb = np.zeros(fill.shape + (3,), np.uint8)
    rgb[:] = NAVY_DEEP
    rgb[fill] = CREAM
    rgb[fill & (np.arange(fill.shape[0])[:, None] < 4)] = WHITE
    keep(name, rgb, edged)

# A background for the pages: navy, a little lighter toward the middle, a chequered strip top and bottom as the title has.
def page(strip=8, top=True):
    rgb = np.zeros((200, 320, 3), np.uint8)
    for y in range(200):
        t = 1 - abs(y - 100) / 100
        rgb[y, :] = [round(a + (b - a) * t * 0.55) for a, b in zip(NAVY_DEEP, NAVY_LIGHT)]
    # Faint slanted lines, like the title's speed lines.
    ys, xs = np.mgrid[0:200, 0:320]
    rgb[((xs + ys * 2) % 24) < 2] = (rgb[((xs + ys * 2) % 24) < 2] * 1.18).clip(0, 255).astype(np.uint8)
    for y0 in ((0, 200 - strip) if top else (200 - strip,)):
        for y in range(y0, y0 + strip):
            for x in range(320):
                rgb[y, x] = WHITE if ((x // (strip // 2)) + ((y - y0) // (strip // 2))) % 2 == 0 else BLACK
    if top:
        rgb[strip:strip + 1, :] = YELLOW
    rgb[200 - strip - 1:200 - strip, :] = YELLOW
    return rgb

def stamp(onto, rgb, there, x, y):
    h, w = there.shape
    onto[y:y + h, x:x + w][there] = rgb[there]

def title(onto, text, y, size=14, **how):
    rgb, there = sign(text, size=size, **how)
    stamp(onto, rgb, there, (320 - there.shape[1]) // 2, y)

def write(onto, text, x, y, colour=CREAM, size=9, centre=False):
    """A line of small plain letters on a page. Returns how wide it came out."""
    face = font(PLAIN, size)
    image = Image.new("1", (330, size + 6), 0)
    draw = ImageDraw.Draw(image)
    draw.fontmode = "1"
    draw.text((1, 1), text, 1, face)
    fill = np.array(image, bool)
    cols = np.where(fill.any(0))[0]
    if not len(cols):
        return 0
    fill = fill[:, :cols.max() + 2]
    if centre:
        x = (320 - fill.shape[1]) // 2
    h, w = fill.shape
    h, w = min(h, 200 - y), min(w, 320 - x)
    shade = np.roll(np.roll(fill, 1, 0), 1, 1)
    onto[y:y + h, x:x + w][shade[:h, :w]] = NAVY_DEEP
    onto[y:y + h, x:x + w][fill[:h, :w]] = colour
    return fill.shape[1]

def drawn(set_name):
    """The pictures another of these scripts drew, by name."""
    blob = gzip.decompress((here / f"{set_name}.bin.gz").read_bytes())
    found = {}
    for one in json.loads((here / f"{set_name}.json").read_text()):
        w, h = one["width"], one["height"]
        found[one["name"]] = (palette[np.frombuffer(blob[one["at"]:one["at"] + w * h], np.uint8).reshape(h, w)].astype(np.uint8), np.frombuffer(blob[one["at"] + w * h:one["at"] + 2 * w * h], np.uint8).reshape(h, w) > 0)
    return found
tools, rats = drawn("tools"), drawn("sprites")

def show(onto, picture, x, y, most=22):
    """One of the game's pictures on a page, its middle at x, standing on y, made smaller if it is tall."""
    rgb, there = picture
    h, w = there.shape
    step = max(1, -(-h // most))
    rgb, there = rgb[::step, ::step], there[::step, ::step]
    h, w = there.shape
    stamp(onto, rgb, there, x - w // 2, y - h)

# The between-levels page, for both of the game's episodes, and nothing marked on it: the engine marks Freedoom's map.
for name in ("WIMAP0", "WIMAP1"):
    # The floor's name is written across the top of it, so the strip is along the bottom only.
    keep(name, page(top=False), np.ones((200, 320), bool))
for name in lumps:
    if re.fullmatch(r"WIA[01]\d{4}", name):
        keep(name, np.zeros((1, 1, 3), np.uint8), np.zeros((1, 1), bool))
# Its words, each floor's name, and its figures, which are all one width so a count doesn't shift as it runs up.
FLOORS = ["The main floor", "The attic", "The basement", "The stock room", "Receiving", "The overflow racks", "The battery room", "The tire loft", "The paint room", "The boiler room", "The crawl space", "The nest"]
for index, floor in enumerate(FLOORS):
    line(f"WILV{index // 9}{index % 9}", floor)
for name, text in {"WIF": "is clear", "WIENTER": "Next:", "WIOSTK": "Rats", "WIOSTI": "Items", "WISCRT2": "Secrets", "WIOSTS": "Scrt", "WITIME": "Time", "WIPAR": "Par", "WISUCKS": "ages", "WIMSTT": "Total", "WIFRGS": "Frags", "WIPCNT": "%", "WICOLON": ":", "WIMINUS": "-"}.items():
    line(name, text, top=WHITE, bottom=CREAM)
for digit in range(10):
    rgb, there = sign(str(digit), top=WHITE, bottom=CREAM)
    wide = np.zeros((15, 12, 3), np.uint8), np.zeros((15, 12), bool)
    at = (12 - there.shape[1]) // 2
    wide[0][:, at:at + there.shape[1]], wide[1][:, at:at + there.shape[1]] = rgb[:, :12 - at], there[:, :12 - at]
    keep(f"WINUM{digit}", *wide)

# How to play: the menu's read-me page.
help = page()
title(help, "HOW TO PLAY", 12)
write(help, "The store is overrun. Clear each floor of rats, then find", 10, 30)
write(help, "the switch at the far end. A locked door wants its key.", 10, 40)
write(help, "TOOLS", 10, 54, YELLOW)
for x, picture, words, at in ((38, tools["SHOTA0"], "Delbie's lever-action", 6), (150, tools["MGUNA0"], "Impact wrench", 116), (262, tools["SBOXA0"], "Cartridges", 236)):
    show(help, picture, x, 80, 30)
    write(help, words, at, 81)
write(help, 'You start with a price gun, and the "hammer".', 10, 93)
write(help, "PICK UP", 10, 107, YELLOW)
for x, picture, words in ((26, tools["STIMA0"], "Pasta"), (78, tools["MEDIA0"], "Pizza"), (130, tools["BON1A0"], "Coffee"), (184, tools["ARM1A0"], "Apron"), (238, tools["BON2A0"], "Hard hat"), (294, tools["BKEYA0"], "Keys")):
    show(help, picture, x, 133, 18)
    write(help, words, x - 16 - 2 * (len(words) > 6), 134)
write(help, "CONTROLS", 10, 148, YELLOW)
write(help, "W A S D: move.  Mouse or arrows: turn.  Click or Ctrl: fire.", 10, 157)
write(help, "E or Space: doors.  Q, R or 1 to 4: tools.  Tab: the map.", 10, 167)
write(help, "On a phone: left thumb moves, right thumb turns.", 10, 177, WHITE)
keep("HELP1", help, np.ones((200, 320), bool))
keep("HELP2", help, np.ones((200, 320), bool))

# The credits, which come round behind the title: whose game this is laid over, and whose engine runs it.
credit = page()
title(credit, "DELBIE'S DOOMSDAY", 14)
write(credit, "A shooter set in an auto parts store, with rats.", 0, 36, centre=True)
for x, picture in ((70, rats["SARGA1"]), (160, rats["BOSSA1"]), (250, rats["TROOA1"])):
    show(credit, picture, x, 96, 44)
write(credit, "MADE WITH", 0, 106, YELLOW, centre=True)
write(credit, "The Doom engine, from id Software's source,", 0, 118, centre=True)
write(credit, "by way of Chocolate Doom and doomgeneric (GPL).", 0, 128, centre=True)
write(credit, "Freedoom: Phase 1, whose levels, pictures and sounds", 0, 142, centre=True)
write(credit, "are everything here that isn't the store's own.", 0, 152, centre=True)
write(credit, "(c) the Freedoom project, freedoom.github.io", 0, 162, centre=True)
write(credit, "No rats were consulted.", 0, 177, WHITE, centre=True)
keep("CREDIT", credit, np.ones((200, 320), bool))

blob, manifest = bytearray(), []
for name, width, height, left, top, pixels, solid in pictures:
    manifest.append({"name": name, "width": width, "height": height, "left": left, "top": top, "at": len(blob)})
    blob += pixels + solid
(here / "menu.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "menu.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(f"{len(pictures)} pictures, {len(blob)} bytes")

if len(sys.argv) > 2:
    # A sheet to look at.
    def seen(name):
        for n, width, height, left, top, pixels, solid in pictures:
            if n == name:
                rgb = palette[np.frombuffer(pixels, np.uint8).reshape(height, width)].astype(np.uint8)
                return Image.fromarray(np.dstack([rgb, np.frombuffer(solid, np.uint8).reshape(height, width) * 255]).astype(np.uint8), "RGBA")
    sheet = Image.new("RGB", (640, 700), (90, 60, 50))
    sheet.paste(seen("HELP1"), (0, 0)); sheet.paste(seen("CREDIT"), (320, 0)); sheet.paste(seen("WIMAP0"), (0, 200))
    x, y = 324, 204
    for name, *_ in pictures:
        im = seen(name)
        if im.width > 300 or im.width < 2:
            continue
        if x + im.width > 636:
            x, y = 4 if y > 400 else 324, y + 17
        sheet.paste(im, (x, y), im)
        x += im.width + 3
    sheet.resize((1280, 1400), Image.NEAREST).save(sys.argv[2])
