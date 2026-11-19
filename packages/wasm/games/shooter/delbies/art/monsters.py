"""The rats: every picture of every one, from the figures cutout.py cut off the sheets Mikey gave.

A sheet has a rat seen from five sides (its front, round to its back), then attacking, hurt and
dying. The engine wants each from eight sides, so the three it hasn't are the ones between,
turned over; and it wants several steps of a walk, an attack and a death, so each step is one of
the figures, lifted a pixel on every other step of a walk so it isn't still.

Each rat is one of the engine's monsters, under that monster's names:

    SARG  the grease rat           (the one that charges and bites)
    TROO  the brake-fluid mutant   (the one that throws)
    BOSS  the King Rat of Aisle 4  (the boss)
    BOS2  the tire brute           (the boss's lesser brother: here it only swings its iron)
    HEAD  the coolant rat          (the one that floats and spits)
    SKUL  the spark-plug swarm     (the one that flies at you)
    FATT  the fat rat in coveralls (the one with a cannon on each arm)
    CYBR  the cyborg rat           (the biggest, which fires brake rotors)

Run by hand, after cutout.py (it needs numpy and Pillow):

    python3 games/shooter/delbies/art/monsters.py

It writes sprites.bin.gz and sprites.json: for each picture its name, its size, where it is
drawn from, and where its pixels start; after the pixels, the same size again, where it is solid.
"""
import gzip, json
from pathlib import Path
import numpy as np
from PIL import Image

here = Path(__file__).parent
palette = np.frombuffer((here / "palette.bin").read_bytes()[:768], np.uint8).reshape(256, 3).astype(int)
cache = {}
def nearest(rgb):
    key = (int(rgb[0]), int(rgb[1]), int(rgb[2]))
    if key not in cache:
        cache[key] = int(((palette - np.array(key)) ** 2).sum(1).argmin())
    return cache[key]

def figure(rat, index, turned=False):
    rgba = np.array(Image.open(here / "given" / f"{rat}-{index}.png").convert("RGBA"))
    return rgba[:, ::-1] if turned else rgba

pictures = []
def add(name, rgba, lift=0):
    there = rgba[..., 3] > 127
    height, width = there.shape
    pixels = bytes(nearest(rgba[y, x]) if there[y, x] else 0 for y in range(height) for x in range(width))
    pictures.append((name, width, height, width // 2, height + lift, pixels, there.astype(np.uint8).tobytes()))

def spread(letters, figures):
    """Each step given one of the figures, in order, the last one for whatever is left."""
    return {letter: figures[min(len(figures) - 1, i * len(figures) // len(letters))] for i, letter in enumerate(letters)}

def monster(prefix, rat, views, walk, attack, pain, death, attacks, hurt, deaths):
    """`views` is the figure for each of five sides, front to back: a number, or a number and True for one that faces the other way on its sheet."""
    sides = [figure(rat, *((view,) if isinstance(view, int) else view)) for view in views]
    for step, letter in enumerate(walk):
        for side, name in zip(sides, ("1", f"2{letter}8", f"3{letter}7", f"4{letter}6", "5")):
            add(prefix + letter + name, side, lift=step % 2)
    for letter, index in spread(attack, attacks).items():
        add(prefix + letter + "0", figure(rat, index))
    for letter in pain:
        add(prefix + letter + "0", figure(rat, hurt))
    for letter, index in spread(death, deaths).items():
        add(prefix + letter + "0", figure(rat, index))

T = True
monster("SARG", "grease", [1, 2, (3, T), 4, 5], "ABCD", "EFG", "H", "IJKLMN", [7], 8, [9, 10])
monster("TROO", "mutant", [0, 1, (2, T), 3, 4], "ABCD", "EFG", "H", "IJKLMNOPQRSTU", [5, 5, 6], 7, [8, 9])
monster("BOSS", "king", [0, 1, 2, 4, 3], "ABCD", "EFG", "H", "IJKLMNO", [5, 5, 6], 7, [8])
monster("BOS2", "brute", [0, (1, T), (2, T), (3, T), 4], "ABCD", "EFG", "H", "IJKLMNO", [5, 6, 6], 7, [8, 9])
monster("HEAD", "coolant", [0, (1, T), (2, T), (3, T), 4], "A", "BCD", "EF", "GHIJKL", [5, 5, 6], 7, [8, 9])
monster("SKUL", "plugs", [0, (1, T), (2, T), (3, T), 4], "AB", "CD", "E", "FGHIJK", [5, 6], 7, [8, 9])
monster("FATT", "fat", [0, (1, T), (2, T), 3, 4], "ABCDEF", "GHI", "J", "KLMNOPQRST", [5, 6, 8], 7, [9, 10, 11])
monster("CYBR", "cyborg", [0, (1, T), (2, T), (3, T), 4], "ABCD", "EF", "G", "HIJKLMNOP", [5, 6], 7, [8, 9])

blob, manifest = bytearray(), []
for name, width, height, left, top, pixels, solid in sorted(pictures):
    manifest.append({"name": name, "width": width, "height": height, "left": left, "top": top, "at": len(blob)})
    blob += pixels + solid
# Zipped: mtime=0 so the same pictures make the same file.
(here / "sprites.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "sprites.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "pictures,", len(blob), "bytes")
