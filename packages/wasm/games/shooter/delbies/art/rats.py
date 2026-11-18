"""The rats, drawn: sprites for the three monsters they take the place of, and what one spits.

Each rat is a handful of rounded lumps (body, haunch, head, snout, ears, legs, tail) posed for a
moment of walking, biting, flinching or dying, and looked at from the eight sides the engine
wants. A pixel is the lump nearest the eye there, lit from above and to the left, in one of four
tones of that lump's colour, with a dark edge: the look of the engine's own sprites.

Run by hand when a rat changes (it needs numpy and Pillow, which the site's build doesn't):

    python3 games/shooter/delbies/art/rats.py

It writes sprites.bin.gz (zipped: for each picture, a palette colour a pixel and then a byte a pixel that is
1 where there is something) and sprites.json (each picture's lump name, size, where its feet are,
and where it starts in the unzipped file). scripts/build-delbies.mjs makes the engine's lumps of them.
"""
import gzip, json, math, struct, sys
from pathlib import Path
import numpy as np

here = Path(__file__).parent

# Four tones each, dark to light.
def ramp(r, g, b):
    return [(int(r * k), int(g * k), int(b * k)) for k in (0.38, 0.62, 0.84, 1.0)]

FUR = {"grease": ramp(120, 104, 92), "mutant": ramp(104, 124, 84), "king": ramp(84, 72, 70)}
BELLY = {"grease": ramp(170, 150, 132), "mutant": ramp(150, 176, 110), "king": ramp(128, 110, 104)}
PINK = ramp(236, 150, 150)
TOOTH = ramp(255, 250, 220)
MOUTH = ramp(90, 16, 16)
BLOOD = ramp(200, 20, 20)
GOLD = ramp(255, 214, 60)
GLOW = ramp(120, 255, 70)
EYE = {"grease": ramp(255, 60, 40), "mutant": ramp(170, 255, 90), "king": ramp(255, 40, 30)}
GREASE = ramp(46, 40, 40)

def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def rat(kind, phase=0.0, mouth=0.0, rear=0.0, flinch=0.0, dead=0.0, spit=0.0):
    """The lumps of a rat: (centre, radii, turn, colours). x is forward, y its left, z up."""
    parts = []
    add = lambda centre, radii, colours, turn=None: parts.append((np.array(centre, float), np.array(radii, float), np.eye(3) if turn is None else turn, colours))
    fur, belly, eye = FUR[kind], BELLY[kind], EYE[kind]
    swing = math.sin(phase * 2 * math.pi)
    bob = abs(math.cos(phase * 2 * math.pi)) * 1.2
    lift = 11 + bob
    add((-2, 0, lift), (17, 9, 9), fur)
    add((-9, 0, lift + 1), (11, 10.5, 10.5), fur)
    add((2, 0, lift - 3.5), (13, 7.5, 5), belly)
    # A greasy back.
    add((-6, 0, lift + 6.5), (10, 6, 3.5), GREASE if kind != "mutant" else GLOW)
    head = np.array([17 + 5 * mouth - 4 * flinch, 0, lift + 1 + 3 * mouth + 2 * flinch])
    add(head, (9, 6.5, 6.5), fur)
    add(head + (8, 0, -2 + 1.5 * mouth), (5.5, 3.8, 3.2), fur)
    add(head + (12.5, 0, -2 + 1.5 * mouth), (1.8, 1.8, 1.6), PINK)
    for side in (1, -1):
        add(head + (-3, side * 5.5, 6.5), (1.6, 3.8, 4.4), PINK)
        add(head + (5, side * 3.6, 2.2), (1.5, 1.4, 1.5), eye)
    if mouth > 0:
        add(head + (8, 0, -5 - 2.5 * mouth), (5, 3.2, 1.8 + 1.5 * mouth), MOUTH)
        for side in (1, -1):
            add(head + (11.5, side * 1.2, -3.2), (0.9, 0.9, 2.4), TOOTH)
            add(head + (11, side * 1.2, -7 - 2 * mouth), (0.8, 0.8, 1.6), TOOTH)
    if spit > 0:
        add(head + (14 + 6 * spit, 0, -4), (3 + 2 * spit,) * 3, GLOW)
    # Legs: the two of a corner pair move together.
    for (x, side, lead) in ((9, 1, 1), (9, -1, -1), (-12, 1, -1), (-12, -1, 1)):
        step = swing * lead * 4.5
        add((x + step, side * 6.5, 3 + max(0, -step * 0.3)), (3.2, 2.6, 4.2), fur)
        add((x + step + 2.5, side * 6.5, 1.2 + max(0, -step * 0.3)), (3.2, 2.2, 1.3), PINK)
    # The tail, in beads, swaying.
    for i in range(9):
        t = i / 8
        add((-19 - 15 * t, math.sin(phase * 2 * math.pi + t * 3) * 4 * t, lift - 2 + 7 * t * t), (2.6 - 1.4 * t,) * 3, PINK)
    if kind == "mutant":
        # Blisters of brake fluid.
        for (x, y, z) in ((4, 6, 5), (-10, -7, 6), (-14, 5, 9), (6, -6, 6)):
            add((x, y, lift + z - 4), (3, 3, 3), GLOW)
    if kind == "king":
        # A crown, and a scar across the snout.
        for i in range(6):
            a = i / 6 * 2 * math.pi
            add(head + (-1 + 3.4 * math.cos(a), 3.4 * math.sin(a), 7.2), (1.3, 1.3, 2.6), GOLD)
        add(head + (-1, 0, 6), (4, 4, 1.4), GOLD)
        add(head + (9, 1.5, 1), (2.6, 0.7, 0.7), PINK)

    # The whole rat: up on its hind legs, thrown back, or on its side.
    hip = np.array([-10.0, 0.0, 8.0])
    turn = rot_y(-rear * 1.0 - flinch * 0.25)
    roll = rot_x(dead * 1.45)
    posed = []
    for centre, radii, own, colours in parts:
        centre = turn @ (centre - hip) + hip
        own = turn @ own
        centre = roll @ centre
        own = roll @ own
        if dead > 0:
            # Slumping: lower and wider.
            centre = centre * (1, 1 + 0.2 * dead, 1 - 0.45 * dead)
            centre[2] = max(centre[2], 1.5)
        posed.append((centre, radii, own, colours))
    if rear > 0:
        low = min(c[2] - r.max() * 0.6 for c, r, _, _ in posed)
        posed = [(c - (0, 0, low), r, o, col) for c, r, o, col in posed]
    if dead > 0.5:
        posed.append((np.array([0.0, 0.0, 0.4]), np.array([20 * dead, 13 * dead, 0.8]), np.eye(3), BLOOD))
    return posed

def glob(size, splash=0.0):
    parts = [(np.array([0.0, 0.0, 8.0]), np.array([size, size, size * (1 - 0.6 * splash)]), np.eye(3), GLOW)]
    for i in range(int(splash * 9)):
        a = i * 2.4
        d = size * (0.9 + splash * 1.6)
        parts.append((np.array([0.0, math.cos(a) * d, 8 + math.sin(a) * d * 0.7]), np.array([size * 0.3] * 3), np.eye(3), GLOW))
    return parts

def render(parts, side, scale=1.0):
    """A picture of the lumps from one of the engine's eight sides (1: its front). None, if nothing shows."""
    a = (side - 1) * math.pi / 4
    right = np.array([-math.sin(a), math.cos(a), 0.0])
    up = np.array([0.0, 0.0, 1.0])
    eye = np.array([math.cos(a), math.sin(a), 0.0])
    light = -0.5 * right + 0.62 * up + 0.6 * eye
    light /= np.linalg.norm(light)
    reach = int(75 * scale)
    us, vs = np.meshgrid(np.arange(-reach, reach) + 0.5, np.arange(int(100 * scale), -8, -1) - 0.5)
    points = us[..., None] * right * (1 / scale) + vs[..., None] * up * (1 / scale)
    depth = np.full(us.shape, -1e9)
    tone = np.zeros(us.shape, int)
    which = np.full(us.shape, -1)
    for index, (centre, radii, turn, _) in enumerate(parts):
        start = ((points - centre) @ turn) / radii
        ray = (eye @ turn) / radii
        aa = ray @ ray
        bb = 2 * (start @ ray)
        cc = (start * start).sum(-1) - 1
        disc = bb * bb - 4 * aa * cc
        hit = disc > 0
        t = np.where(hit, (-bb + np.sqrt(np.where(hit, disc, 0))) / (2 * aa), -1e9)
        nearer = hit & (t > depth)
        normal = ((start + t[..., None] * ray) / radii) @ turn.T
        normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-9)
        lit = normal @ light
        depth = np.where(nearer, t, depth)
        # A little grit, the same every time, so fur isn't smooth.
        grit = ((np.floor(us) * 7 + np.floor(vs) * 13 + index * 5) % 11) / 11 * 0.22 - 0.11
        tone = np.where(nearer, np.clip(((lit + grit) * 0.5 + 0.5) * 4, 0, 3).astype(int), tone)
        which = np.where(nearer, index, which)
    there = which >= 0
    if not there.any():
        return None
    # A dark edge where the rat meets nothing.
    edge = there & ~(np.roll(there, 1, 0) & np.roll(there, -1, 0) & np.roll(there, 1, 1) & np.roll(there, -1, 1))
    tone = np.where(edge, 0, tone)
    rgb = np.zeros(us.shape + (3,), np.uint8)
    for index, (_, _, _, colours) in enumerate(parts):
        for level in range(4):
            rgb[(which == index) & (tone == level)] = colours[level]
    rows, cols = np.where(there)
    top, bottom, left, rightmost = rows.min(), rows.max(), cols.min(), cols.max()
    ground = int(100 * scale)  # the row of z = 0
    return {"rgb": rgb[top:bottom + 1, left:rightmost + 1], "there": there[top:bottom + 1, left:rightmost + 1], "left": int(reach - left), "top": int(ground - top)}

def mirrored(picture):
    width = picture["there"].shape[1]
    return {"rgb": picture["rgb"][:, ::-1], "there": picture["there"][:, ::-1], "left": width - picture["left"], "top": picture["top"]}

def monster(prefix, kind, scale, rear, deaths, pairs):
    """Every picture of one monster: walking (A to D), biting (E to G), flinching (H), dying."""
    out = {}
    poses = {"A": dict(phase=0), "B": dict(phase=0.25), "C": dict(phase=0.5), "D": dict(phase=0.75), "E": dict(rear=0.35, mouth=0.3), "F": dict(rear=0.2, mouth=1, spit=1 if kind != "grease" else 0), "G": dict(mouth=0.6), "H": dict(flinch=1, mouth=0.5)}
    for letter, pose in poses.items():
        pose = {"rear": rear, **pose}
        pose["rear"] = min(1.0, rear + pose["rear"]) if letter in "EF" else pose["rear"]
        parts = rat(kind, **pose)
        if pairs:
            for name, side in (("1", 1), ("2%s8" % letter, 2), ("3%s7" % letter, 3), ("4%s6" % letter, 4), ("5", 5)):
                out[prefix + letter + name] = render(parts, side, scale)
        else:
            for side in range(1, 9):
                out[prefix + letter + str(side)] = render(parts, side, scale) if side <= 5 else mirrored(out[prefix + letter + str(10 - side)])
    for i, letter in enumerate(deaths):
        progress = min(1.0, (i + 1) / min(len(deaths), 6))
        out[prefix + letter + "0"] = render(rat(kind, dead=progress, mouth=0.4, rear=rear * (1 - progress)), 2, scale)
    return out

pictures = {}
pictures.update(monster("SARG", "grease", 1.5, 0.0, "IJKLMN", True))
pictures.update(monster("TROO", "mutant", 1.7, 0.55, "IJKLMNOPQRSTU", True))
pictures.update(monster("BOSS", "king", 2.3, 0.6, "IJKLMNO", False))
for letter, splash in (("A", 0), ("B", 0.08), ("C", 0.4), ("D", 0.7), ("E", 1.0)):
    pictures["BAL1" + letter + "0"] = render(glob(5 if splash < 0.2 else 6, splash), 1)

# Into the game's colours.
palette = np.frombuffer((here / "palette.bin").read_bytes()[:768], np.uint8).reshape(256, 3).astype(int)
nearest = {}
def colour(rgb):
    key = tuple(int(v) for v in rgb)
    if key not in nearest:
        nearest[key] = int(((palette - np.array(key)) ** 2).sum(1).argmin())
    return nearest[key]

blob = bytearray()
manifest = []
for name in sorted(pictures):
    picture = pictures[name]
    height, width = picture["there"].shape
    pixels = bytes(colour(picture["rgb"][y, x]) if picture["there"][y, x] else 0 for y in range(height) for x in range(width))
    manifest.append({"name": name, "width": width, "height": height, "left": picture["left"], "top": picture["top"], "at": len(blob)})
    blob += pixels + bytes(picture["there"].astype(np.uint8).tobytes())
# Zipped: it is mostly flat colour. mtime=0 so the same pictures make the same file.
(here / "sprites.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "sprites.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "pictures,", len(blob), "bytes")

if len(sys.argv) > 1:
    # A sheet to look at.
    from PIL import Image
    show = ["SARGA1", "SARGA2A8", "SARGA3A7", "SARGA4A6", "SARGA5", "SARGB3B7", "SARGF3F7", "SARGF1", "SARGH3H7", "SARGK0", "SARGN0", "TROOA1", "TROOA2A8", "TROOA3A7", "TROOA5", "TROOF3F7", "TROOF1", "TROOM0", "BAL1A0", "BAL1D0", "BOSSA1", "BOSSA2", "BOSSA3", "BOSSA5", "BOSSF3", "BOSSF1", "BOSSO0"]
    sheet = Image.new("RGB", (9 * 150, 3 * 170), (58, 62, 84))
    for i, name in enumerate(show):
        p = pictures[name]
        im = Image.fromarray(np.dstack([p["rgb"], p["there"].astype(np.uint8) * 255]), "RGBA")
        sheet.paste(im, ((i % 9) * 150 + 75 - p["left"], (i // 9) * 170 + 160 - p["top"]), im)
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(sys.argv[1])
