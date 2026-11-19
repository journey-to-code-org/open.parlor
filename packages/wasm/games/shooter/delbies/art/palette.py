"""The game's own colours: the 256 the engine draws everything in, and what each becomes in
less light.

The engine wants two lumps. PLAYPAL is the 256 colours fourteen times over: as they are, eight
times redder (for being hurt), four times yellower (for picking something up) and once greener
(for the suit that keeps bad floor off). COLORMAP says, for each of 32 lights, which of the 256
each colour becomes, then the same for seeing in grey (the prize that makes you untouchable),
and a last one that is all black.

The colours are sixteen runs of sixteen, each from light to dark: greys, the browns and skin a
store is made of, the title picture's yellow, red and navy, and enough green for rats. A few
runs sit where the engine's map expects a colour to be (its reds from 176, blues from 200, a
yellow at 231, greys from 96, browns from 64, greens from 112, white at 209), so the map it
draws of a level is in the colours it means.

Run by hand (it needs numpy):

    python3 games/shooter/delbies/art/palette.py

It writes palette.bin: PLAYPAL, then COLORMAP. Every other script here reads its colours from
it, so run them again after it.
"""
import colorsys
from pathlib import Path
import numpy as np

here = Path(__file__).parent

def run(hue, saturation=1.0, light=1.0, dark=0.06, pale=0.0):
    """Sixteen shades of a colour, light to dark. pale: how far its lightest shades go toward white."""
    shades = []
    for i in range(16):
        t = i / 15
        value = light + (dark - light) * t ** 1.15
        wash = max(0.0, 1 - t * 3) * pale
        r, g, b = colorsys.hsv_to_rgb(hue / 360, saturation * (1 - wash), min(1.0, value + wash * (1 - value)))
        shades.append((round(r * 255), round(g * 255), round(b * 255)))
    return shades

def greys(top, bottom):
    return [(round(top + (bottom - top) * i / 15),) * 3 for i in range(16)]

RUNS = [
    run(232, 0.72, 0.42, 0.0),              #   0  navy to black: the dark of the place (15 is black)
    run(22, 0.42, 1.0, 0.24, pale=0.5),     #  16  skin
    run(34, 0.36, 0.96, 0.16, pale=0.6),    #  32  cream, tan, cardboard
    run(52, 0.5, 0.82, 0.1, pale=0.3),      #  48  khaki and olive
    run(26, 0.68, 0.74, 0.07),              #  64  brown: wood
    greys(118, 14),                         #  80  the darker greys
    greys(238, 124),                        #  96  the lighter greys
    run(118, 0.78, 0.86, 0.06, pale=0.2),   # 112  green
    run(88, 0.6, 0.84, 0.08, pale=0.3),     # 128  the sick green of brake fluid
    run(176, 0.62, 0.8, 0.07, pale=0.4),    # 144  teal
    run(24, 0.94, 1.0, 0.1, pale=0.25),     # 160  orange
    run(2, 0.9, 1.0, 0.08, pale=0.15),      # 176  red
    run(222, 0.82, 1.0, 0.1, pale=0.35),    # 192  blue
    run(214, 0.3, 1.0, 0.2, pale=1.0),      # 208  white going to steel blue (209 is white)
    run(48, 0.9, 1.0, 0.12, pale=0.45),     # 224  yellow
    run(330, 0.5, 0.96, 0.1, pale=0.4),     # 240  pink going to plum: the rats' ears and tails
]
colours = np.array([shade for one in RUNS for shade in one], float)
colours[15] = 0
colours[208] = colours[209] = 255

# Those sixteen runs are where the colours start. Most of the game is pictures (given/), and a run ruled by formula is seldom the
# shade a picture wants: a pale mint tank came out a speckle of bright green and grey. So each colour is moved to the middle of the
# picture colours nearest it, a few times over (k-means), which is what fits 256 colours to pictures. Each stays tied to where it
# started, so a run is still its colour, light to dark, where the engine's map expects it (reds at 176, greens at 112, greys at 96),
# near enough, and a colour no picture wants stays as it was for what is drawn by code.
def fitted(colours):
    from PIL import Image
    samples, weights = [], []
    for file in sorted((here / "given").glob("*.png")):
        rgba = np.array(Image.open(file).convert("RGBA")).reshape(-1, 4)
        rgb = rgba[rgba[:, 3] > 127][:, :3]
        rgb = rgb[:: max(1, len(rgb) // 5000)]
        samples.append(rgb)
        # A small picture (a hard hat) matters as much to look at as a wall does: each counts for nearer the same.
        weights.append(np.full(len(rgb), (5000 / len(rgb)) ** 0.6, np.float32))
    wanted, weight = np.concatenate(samples).astype(np.float32), np.concatenate(weights)
    start = colours.astype(np.float32)
    tie = weight.sum() / 256 * 0.06  # How many picture colours each starting colour counts as.
    now = start.copy()
    for _ in range(16):
        which = np.concatenate([((wanted[i:i + 20000, None, :] - now[None]) ** 2).sum(2).argmin(1) for i in range(0, len(wanted), 20000)])
        total = start * tie
        count = np.full(256, tie, np.float32)
        np.add.at(total, which, wanted * weight[:, None])
        np.add.at(count, which, weight)
        now = total / count[:, None]
    # Within a run, light to dark as before.
    for first in range(0, 256, 16):
        run = now[first:first + 16]
        now[first:first + 16] = run[np.argsort(-(run @ np.array([0.299, 0.587, 0.114], np.float32)), kind="stable")]
    return now.round().astype(float)
if (here / "given").is_dir():
    colours = fitted(colours)
    colours[15] = 0
    colours[208] = colours[209] = 255

def nearest_of(wanted):
    """For each colour wanted, which of the 256 is closest."""
    return ((wanted[:, None, :] - colours[None, :, :]) ** 2).sum(2).argmin(1).astype(np.uint8)

def toward(colour, share):
    return colours + (np.array(colour, float) - colours) * share

palettes = [colours]
palettes += [toward((255, 0, 0), i / 9) for i in range(1, 9)]
palettes += [toward((215, 186, 69), i / 8) for i in range(1, 5)]
palettes += [toward((0, 255, 0), 1 / 8)]
playpal = np.concatenate(palettes).round().clip(0, 255).astype(np.uint8).tobytes()

maps = [nearest_of(colours * (1 - light / 32)) for light in range(32)]
grey = 255 - colours @ np.array([0.299, 0.587, 0.114])
maps.append(nearest_of(np.repeat(grey[:, None], 3, 1)))
maps.append(np.full(256, 15, np.uint8))
(here / "palette.bin").write_bytes(playpal + np.concatenate(maps).tobytes())
print(f"palette.bin: {len(playpal)} bytes of colours, {34 * 256} of lights")
