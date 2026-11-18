"""The title picture and the game's name, brought into the game's 256 colours at the sizes the engine draws.

Both are Mikey's (given/title.png and given/logo.png, cut off his sheet by cutout.py). On his sheet the name lies half
across the title's corner, so it is laid whole into that corner here.

Run by hand when they change (it needs Pillow, which the site's build doesn't):

    python3 games/shooter/delbies/art/convert.py

It writes title.raw (320x200), logo.raw (the name, for over the menu) and logo.mask (one byte a pixel, 1 where there is
something), and title.webp, the same title four times the size, which the page shows behind its start card.
scripts/build-delbies.mjs makes the engine's lumps of them.
"""
from pathlib import Path
from PIL import Image

here = Path(__file__).parent
swatch = Image.new("P", (1, 1))
swatch.putpalette((here / "palette.bin").read_bytes()[:768])

logo = Image.open(here / "given" / "logo.png").convert("RGBA")
title = Image.open(here / "given" / "title.png").convert("RGBA")
title.alpha_composite(logo, (320 - logo.width - 2, 200 - logo.height - 2))
(here / "title.raw").write_bytes(title.convert("RGB").quantize(palette=swatch, dither=Image.NONE).tobytes())
title.convert("RGB").resize((1280, 800), Image.NEAREST).save(here / "title.webp", lossless=True)

# Over the menu it is a little smaller, so the menu's first line clears it, on a strip 150 across as the build expects.
small = logo.resize((125, 60), Image.LANCZOS)
logo = Image.new("RGBA", (150, 60), (0, 0, 0, 0))
logo.alpha_composite(small, (12, 0))
flat = Image.new("RGBA", logo.size, (10, 20, 60, 255))
flat.alpha_composite(logo)
(here / "logo.raw").write_bytes(flat.convert("RGB").quantize(palette=swatch, dither=Image.NONE).tobytes())
(here / "logo.mask").write_bytes(bytes(1 if a >= 128 else 0 for a in logo.getchannel("A").tobytes()))
print("title 320x200, logo", logo.size)
