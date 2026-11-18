"""The title picture, brought into the game's 256 colours at the sizes the engine draws.

Run by hand when title.webp changes (it needs Pillow, which the site's build doesn't):

    python3 games/shooter/delbies/art/convert.py public/data/freedoom1-0.13.0.wad.gz

It writes title.raw (320x200) and logo.raw (the lettering, for over the menu): one byte a pixel,
a colour of the game's palette, 255 where the logo is see-through... except that 255 is a colour
too, so logo.raw is followed by logo.mask, one byte a pixel, 1 where there is something.
scripts/build-delbies.mjs makes the engine's lumps of them.
"""
import gzip, struct, sys
from pathlib import Path
from PIL import Image

here = Path(__file__).parent
wad = gzip.open(sys.argv[1]).read()
count, table = struct.unpack_from("<ii", wad, 4)
palette = None
for i in range(count):
    at, size, name = struct.unpack_from("<ii8s", wad, table + i * 16)
    if name.rstrip(b"\0") == b"PLAYPAL":
        palette = wad[at:at + 768]
swatch = Image.new("P", (1, 1))
swatch.putpalette(palette)

art = Image.open(here / "title.webp").convert("RGBA")

# The title screen is 320x200 shown at 4:3, so its pixels are a fifth taller than wide: a square
# picture is 240 across to look square. The rest is the picture's own dark blue.
BACK = (10, 34, 46)
square = art.resize((240, 200), Image.LANCZOS)
screen = Image.new("RGBA", (320, 200), BACK + (255,))
screen.alpha_composite(square, (40, 0))
title = bytearray(screen.convert("RGB").quantize(palette=swatch, dither=Image.FLOYDSTEINBERG).tobytes())
# Round the picture, one flat colour: the palette's nearest to the dark blue, not a pattern of two.
back = Image.new("RGB", (1, 1), BACK).quantize(palette=swatch, dither=Image.NONE).tobytes()[0]
there = square.getchannel("A").tobytes()
for y in range(200):
    for x in range(320):
        if not (40 <= x < 280) or there[y * 240 + x - 40] < 128:
            title[y * 320 + x] = back
(here / "title.raw").write_bytes(bytes(title))

# The lettering at the top, for over the menu.
letters = art.crop((130, 15, 1010, 360)).resize((150, 49), Image.LANCZOS)
flat = Image.new("RGBA", letters.size, BACK + (255,))
flat.alpha_composite(letters)
(here / "logo.raw").write_bytes(flat.convert("RGB").quantize(palette=swatch, dither=Image.NONE).tobytes())
(here / "logo.mask").write_bytes(bytes(1 if a >= 128 else 0 for a in letters.getchannel("A").tobytes()))
print("title 320x200, logo", letters.size)
