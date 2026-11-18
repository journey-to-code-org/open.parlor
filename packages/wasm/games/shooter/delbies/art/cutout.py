"""Cuts the weapons out of the pictures Mikey gave, into given/: what tools.py turns into sprites.

Each picture is a mock-up of a weapon in a scene, 1024 by 765: the weapon in gloved hands as the
player would see it, or lying on a floor. What is cut out here is the weapon (and the hands) with
nothing behind it. A picture of the whole view is made the size of the engine's screen, 320 by
200, so a thing is where it was in the picture; a thing on a floor is made the size it should be
in the game.

Run by hand, with the pictures in a folder (it needs numpy, Pillow and OpenCV):

    python3 games/shooter/delbies/art/cutout.py <folder of pictures>

The pictures themselves are not in the repository: some carry things that can't be (another
game's status bar, a real brand on a label). Nothing of those is in what is cut out, bar a
label too small to read.
"""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

here = Path(__file__).parent
out = here / "given"
src = Path(sys.argv[1])

def load(name):
    return np.array(Image.open(src / name).convert("RGB"))

def biggest(mask, keep=1, least=40):
    """The largest pieces of a mask: specks are dropped."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    order = sorted(range(1, count), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:keep]
    return np.isin(labels, [i for i in order if stats[i, cv2.CC_STAT_AREA] >= least])

def filled(mask):
    """A mask with the holes in it closed."""
    # A margin round it, so what touches every edge isn't taken for a hole all the way round.
    flood = np.pad(mask.astype(np.uint8), 1)
    cv2.floodFill(flood, np.zeros((flood.shape[0] + 2, flood.shape[1] + 2), np.uint8), (0, 0), 1)
    return mask | (flood[1:-1, 1:-1] == 0)

def off(image, colour, by):
    """Where a picture isn't its plain background."""
    return np.abs(image.astype(int) - np.array(colour)).max(2) > by

def grab(image, rect, sure=(), never=()):
    """What is in a rectangle of a busy picture, by GrabCut. `sure` and `never` are boxes known to be the thing and not."""
    mask = np.zeros(image.shape[:2], np.uint8)
    x, y, w, h = rect
    mask[y:y + h, x:x + w] = cv2.GC_PR_FGD
    edge = 6
    mask[y:y + edge, x:x + w] = mask[y + h - edge:y + h, x:x + w] = cv2.GC_PR_BGD
    mask[y:y + h, x:x + edge] = mask[y:y + h, x + w - edge:x + w] = cv2.GC_PR_BGD
    for x0, y0, x1, y1 in sure:
        mask[y0:y1, x0:x1] = cv2.GC_FGD
    for x0, y0, x1, y1 in never:
        mask[y0:y1, x0:x1] = cv2.GC_BGD
    cv2.grabCut(cv2.cvtColor(image, cv2.COLOR_RGB2BGR), mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 8, cv2.GC_INIT_WITH_MASK)
    return filled(biggest((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)))

def smaller(image, mask, size):
    """A cut-out made smaller, without its background bleeding into its edge."""
    alpha = mask.astype(float)[..., None]
    both = Image.fromarray(np.dstack([(image * alpha).astype(np.uint8), (mask * 255).astype(np.uint8)]), "RGBA").resize(size, Image.BOX)
    both = np.array(both).astype(float)
    cover = both[..., 3:] / 255
    rgb = np.where(cover > 0, both[..., :3] / np.maximum(cover, 1e-6), 0).clip(0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, (both[..., 3] > 127).astype(np.uint8) * 255])
    rgba[rgba[..., 3] == 0] = 0
    return rgba

def save(name, rgba, crop=False):
    if crop:
        rows, cols = np.where(rgba[..., 3] > 0)
        rgba = rgba[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    Image.fromarray(rgba, "RGBA").save(out / f"{name}.png", optimize=True)
    print(name, rgba.shape[1], "x", rgba.shape[0])

SCREEN = (320, 200)
def view(name, image, mask):
    """A picture of the whole view, made the size of the engine's screen."""
    save(name, smaller(image, mask, SCREEN))
def lying(name, image, mask, wide):
    """A thing on a floor, cut to itself and made `wide` across."""
    rows, cols = np.where(mask)
    image, mask = image[rows.min():rows.max() + 1, cols.min():cols.max() + 1], mask[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    save(name, smaller(image, mask, (wide, max(1, round(mask.shape[0] * wide / mask.shape[1])))), crop=True)

# The brake rotor (the rocket launcher): in the hand, on black; and on a floor, which is also what is thrown.
rotor = load("rotor-held.webp")
view("rotor-held", rotor, filled(biggest(off(rotor, (0, 0, 0), 26))))
floor = load("rotor-floor.webp")
lying("rotor-floor", floor, grab(floor, (270, 300, 490, 270), sure=[(350, 392, 680, 505), (420, 380, 610, 400)]), 44)

# The torch and the can of brake cleaner (the chainsaw), on black: the two hands with what they hold, and the ball of flame apart.
torch = load("torch-held.png")
there = biggest(off(torch, (0, 0, 0), 26), keep=3, least=400)
r, g, b = (torch[..., i].astype(int) for i in range(3))
flame = there & (r > 150) & (r > g + 25) & (g > b + 20)
flame[:150] = flame[445:] = False
flame[:, :335] = flame[:, 600:] = False
# The smoke that curls off it.
smoke = there & (r > g) & (g > b) & (r < 150)
smoke[:140] = smoke[270:] = False
smoke[:, :480] = smoke[:, 625:] = False
ball = cv2.morphologyEx((flame | smoke).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)).astype(bool) & there
ball = biggest(ball)
# And its dark edge, but not the torch's own blue flame or the can below it.
wider = cv2.dilate(ball.astype(np.uint8), np.ones((13, 13), np.uint8)).astype(bool) & there & ~((b > r + 30) & (b > 120))
wider[436:] = False
ball = filled(ball | wider)
view("torch-hands", torch, biggest(there & ~ball, keep=2, least=400))
view("torch-flame", torch, ball)
can = load("cleaner-floor.webp")
lying("cleaner-floor", can, grab(can, (370, 325, 320, 150)), 36)

# The jump starter (the plasma gun), on white: the hands with a clamp each and the box below, and the arc between the clamps apart.
jump = load("jump-held.webp")
there = off(jump, (255, 255, 255), 40)
# Below here the picture is under the status bar, and has a word on the box that isn't ours.
there[690:] = False
r, g, b = (jump[..., i].astype(int) for i in range(3))
blue = (b > r + 45) & (b > 150)
arc = np.zeros_like(there)
arc[120:420, 300:720] = True
sparks = np.zeros_like(there)
sparks[540:670, 380:660] = True
arc = cv2.dilate((blue & (arc | sparks)).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & (off(jump, (255, 255, 255), 12)) & (arc | sparks)
view("jump-hands", jump, biggest(there & ~arc, keep=3, least=600))
view("jump-arc", jump, arc)
box = load("jump-floor.webp")
lying("jump-floor", box, grab(box, (345, 240, 355, 300), sure=[(385, 285, 665, 500)]), 44)

# The tape measure (the "hammer", in the fist's place): three poses off a sheet of them, on a dark ground. Each is cut to itself.
sheet = load("tape-sheet.webp")
bright, coloured = sheet.astype(int).max(2), sheet.astype(int).max(2) - sheet.astype(int).min(2)
drawn = (bright > 34) | (coloured > 13)
def pose(name, rect):
    x, y, w, h = rect
    mask = np.zeros(drawn.shape, bool)
    mask[y:y + h, x:x + w] = drawn[y:y + h, x:x + w]
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = filled(biggest(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)))
    # The size it would be on the engine's screen: 3.2 to one across, 3.825 down.
    rows, cols = np.where(mask)
    y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    save(name, smaller(sheet[y0:y1, x0:x1], mask[y0:y1, x0:x1], (round((x1 - x0) / 3.2), round((y1 - y0) / 3.825))), crop=True)
pose("tape-ready", (690, 495, 334, 270))
pose("tape-up", (355, 110, 345, 275))
pose("tape-swing", (685, 85, 335, 255))

# Delbie's lever-action (the shotgun): on a floor, and in the hands, in a corridor with a status bar across the bottom of it.
rifle = load("rifle-floor.webp")
lying("rifle-floor", rifle, grab(rifle, (285, 350, 455, 120)), 66)
held = load("rifle-held.webp")
r, g, b = (held[..., i].astype(int) for i in range(3))
mask = np.full(held.shape[:2], cv2.GC_BGD, np.uint8)
mask[395:672, 300:660] = cv2.GC_PR_BGD
near = np.zeros(held.shape[:2], bool)
near[395:672, 300:660] = True
skin = (r > 150) & (g > 90) & (b < 140) & (r > g + 30)
glove = (g > r) & (g > b + 15) & (g > 70)
steel = (b > r + 8) & (b > 70)
wood = (r > 90) & (r > g + 35) & (g > b) & (b < 90)
mask[near & (skin | glove | steel | wood)] = cv2.GC_PR_FGD
mask[near & skin] = cv2.GC_FGD
cv2.line(mask, (513, 425), (513, 668), cv2.GC_FGD, 10)
cv2.fillPoly(mask, [np.array([(480, 620), (550, 620), (560, 668), (470, 668)])], cv2.GC_FGD)
mask[600:672, 300:380] = cv2.GC_BGD
cv2.grabCut(cv2.cvtColor(held, cv2.COLOR_RGB2BGR), mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 8, cv2.GC_INIT_WITH_MASK)
cut = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
cut[672:] = False
view("rifle-held", held, filled(biggest(cv2.morphologyEx(cut.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool))))

# A tank of refrigerant (the engine's biggest gun), on black: the tank in the hands with its hose and gauge, and the cloud it lets go apart.
tank = load("tank-held.webp")
there = off(tank, (0, 0, 0), 30)
r, g, b = (tank[..., i].astype(int) for i in range(3))
# The cloud is above the tank's shoulder. Its handles, valve and gauge stand up into it: there, what is the brightest green or nearly white is cloud.
solid = np.zeros_like(there)
solid[470:] = True
solid[352:470, 402:604] = solid[338:470, 652:760] = solid[420:470, 330:900] = True
glare = (g > r + 75) | (tank.min(2) > 205)
ys, xs = np.indices(there.shape)
glare[(xs - 700) ** 2 + (ys - 380) ** 2 < 34 ** 2] = False  # The gauge's white face is the gauge.
gear = there & solid & ~(glare & (np.arange(tank.shape[0])[:, None] < 470))
# Frost that drifts down beside the left hand is cloud too.
frost = (tank.min(2) > 140) & (g < r + 40)
frost[580:] = False
frost[:, 350:] = False
gear &= ~frost
gear = biggest(cv2.morphologyEx(gear.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool), keep=1)
view("tank-hands", tank, gear)
view("tank-cloud", tank, biggest(there & ~cv2.dilate(gear.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool), keep=4, least=300))
stood = load("tank-floor.webp")
lying("tank-floor", stood, grab(stood, (325, 185, 385, 440), sure=[(420, 290, 600, 560)]), 34)

# The price gun (the pistol), on black; and a box of rolls of tags for it, on a floor.
gun = load("pricegun-held.webp")
view("pricegun-held", gun, filled(biggest(off(gun, (0, 0, 0), 16))))
rolls = load("tags-floor.webp")
lying("tags-floor", rolls, grab(rolls, (285, 250, 450, 320), sure=[(380, 330, 650, 500)]), 30)

# A jug of washer fluid with a pump on it (the chaingun), on black: the jug in the hands, and the spray apart; and the jug on a floor.
jug = load("sprayer-held.webp")
there = off(jug, (0, 0, 0), 24)
# Below here the picture is under the status bar, and has a word on the battery that isn't ours.
there[700:] = False
r, g, b = (jug[..., i].astype(int) for i in range(3))
spray = there & (b > r + 50) & (b > 140)
spray[350:] = False
spray = cv2.dilate(spray.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & there
spray[352:] = False
view("sprayer-hands", jug, filled(biggest(there & ~spray)))
view("sprayer-spray", jug, spray)
sat = load("sprayer-floor.webp")
lying("sprayer-floor", sat, grab(sat, (310, 225, 375, 320), sure=[(440, 290, 640, 480)]), 36)

# Things that stand in a level, each alone on a plain ground.
def alone(image, ground, by, columns=None):
    """What is in a picture that isn't its ground, between two columns of it if there are several things side by side."""
    mask = off(image, ground, by)
    if columns:
        mask[:, :columns[0]] = mask[:, columns[1]:] = False
    return filled(biggest(mask, keep=2, least=300))
drum = load("drum.webp")
lying("drum", drum, alone(drum, (0, 0, 0), 22), 26)
wear = load("armour.webp")
lying("apron", wear, alone(wear, (255, 255, 255), 30, (0, 585)), 30)
lying("hard-hat", wear, alone(wear, (255, 255, 255), 30, (585, 1024)), 22)
food = load("food.webp")
lying("pasta", food, alone(food, (0, 0, 0), 22, (0, 365)), 22)
lying("pizza", food, alone(food, (0, 0, 0), 22, (365, 770)), 32)
lying("coffee", food, alone(food, (0, 0, 0), 22, (770, 1024)), 13)
spit = load("spit.webp")
lying("spit", spit, alone(spit, (0, 0, 0), 30), 34)

# Delbie's face, four ways as his day goes: the head only, without the shirt or its name tag, each made the size of a face on the status bar.
faces = load("faces.webp")
for index, (x0, x1) in enumerate(((20, 250), (275, 505), (525, 755), (780, 1010))):
    mask = off(faces, (0, 0, 0), 24)
    mask[:, :x0] = mask[:, x1:] = False
    mask[:190] = mask[418:] = False
    mask = filled(biggest(mask))
    rows, cols = np.where(mask)
    y0, y1, a, b = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    save(f"face-{index}", smaller(faces[y0:y1, a:b], mask[y0:y1, a:b], (24, 29)))

# The rats, off the sheets Mikey gave of them: each sheet a row or two of one rat, seen from the front round to the back, then
# attacking, hurt and dying, on a plain ground. Each figure is found as a patch that isn't the ground, taken in order from the left,
# and made the size it is in the game.
def figures(name, rows, scale, least=250):
    sheet = load(name)
    ground = np.median(sheet.reshape(-1, 3), 0)
    differs = np.abs(sheet.astype(int) - ground).max(2) > 14
    found = []
    for top, bottom in rows:
        band = np.zeros(differs.shape, np.uint8)
        band[top:bottom] = differs[top:bottom]
        joined = cv2.morphologyEx(band, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(joined)
        row = sorted((i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > least and stats[i, cv2.CC_STAT_HEIGHT] > 22), key=lambda i: stats[i, cv2.CC_STAT_LEFT])
        # A small thing beside a figure (what it spits) isn't a figure.
        tallest = max(stats[i, cv2.CC_STAT_HEIGHT] for i in row)
        for i in row:
            x, y, w, h = stats[i, :4]
            if h < 0.4 * tallest:
                continue
            mask = filled(labels[y:y + h, x:x + w] == i)
            found.append(smaller(sheet[y:y + h, x:x + w], mask, (max(1, round(w * scale)), max(1, round(h * scale)))))
    return found
for rat, sheet, rows, scale in (
    ("grease", "rats-sheet.png", [(18, 102)], 0.62),
    ("mutant", "rats-sheet.png", [(190, 292)], 0.62),
    ("king", "rats-sheet.png", [(418, 551)], 0.8),
    ("brute", "brute-sheet.webp", [(40, 280), (280, 572)], 0.42),
    ("coolant", "coolant-sheet.webp", [(30, 260), (300, 572)], 0.3),
    ("plugs", "plugs-sheet.webp", [(80, 270), (290, 572)], 0.27),
    ("fat", "fat-sheet.webp", [(15, 195), (195, 385), (385, 572)], 0.5),
    ("cyborg", "cyborg-sheet.webp", [(40, 280), (280, 572)], 0.5),
):
    for index, figure in enumerate(figures(sheet, rows, scale)):
        save(f"{rat}-{index}", figure, crop=True)

# Walls, floors and ceilings, off two sheets of six squares each: one grey and rusted, one in the store's blue and yellow.
def squares(name):
    sheet = load(name)
    ground = np.median(sheet[:12].reshape(-1, 3), 0)
    differs = cv2.morphologyEx((np.abs(sheet.astype(int) - ground).max(2) > 22).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(differs)
    boxes = sorted((tuple(int(v) for v in stats[i, :4]) for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > 40000), key=lambda box: (box[1] > 300, box[0]))
    return [sheet[y + 3:y + h - 3, x + 3:x + w - 3] for x, y, w, h in boxes]
def wall(name, square, size, part=(0, 0, 1, 1)):
    """A square, or a part of it given as fractions (left, top, right, bottom), made the size of a wall or floor."""
    h, w = square.shape[:2]
    cut = square[round(part[1] * h):round(part[3] * h), round(part[0] * w):round(part[2] * w)]
    Image.fromarray(cut).resize(size, Image.LANCZOS).save(out / f"wall-{name}.png", optimize=True)
grey, blue = squares("walls-sheet.webp"), squares("walls-blue-sheet.webp")
print(len(grey), "grey squares,", len(blue), "blue")
wall("GRAY1", blue[0], (128, 128))
wall("CRATWIDE", blue[1], (128, 128))
wall("CRATE1", blue[1], (64, 128), (0, 0, 0.5, 1))
wall("BIGDOOR1", blue[2], (128, 96))
wall("BIGDOOR2", blue[4], (128, 128))
wall("DOOR3", grey[4], (64, 72))
wall("BRICK1", grey[3], (128, 128))
wall("METAL1", grey[0], (128, 128))
wall("BROWNGRN", blue[3], (128, 128))
wall("FLOOR0_1", grey[2], (64, 64), (0, 0, 0.667, 0.667))
wall("FLOOR5_1", grey[2], (64, 64), (0.333, 0.333, 1, 1))
wall("CEIL1_1", blue[5], (64, 64), (0, 0, 0.5, 0.5))
wall("CEIL3_5", blue[5], (64, 64), (0.5, 0.25, 1, 0.75))

# And a third sheet, of the hydraulic shop in the basement: hoses on a block wall, a bench of tools, shelves of hose on reels, and oil on the floor.
# Its squares run to the sheet's edge, so they are taken by where they are.
sheet = load("walls-shop-sheet.webp")
shop = [sheet[top:bottom, left:right] for top, bottom in ((12, 370), (394, 738)) for left, right in ((12, 331), (352, 671), (694, 1012))]
print(len(shop), "shop squares")
wall("PIPE2", shop[0], (128, 128))
wall("STONE2", shop[4], (128, 128))
wall("CRATE2", shop[5], (64, 128), (0, 0, 0.5, 1))
wall("FLOOR0_3", shop[3], (64, 64))
