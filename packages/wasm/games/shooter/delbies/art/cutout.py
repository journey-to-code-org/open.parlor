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
    flood = mask.astype(np.uint8).copy()
    cv2.floodFill(flood, np.zeros((flood.shape[0] + 2, flood.shape[1] + 2), np.uint8), (0, 0), 1)
    return mask | (flood == 0)

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
