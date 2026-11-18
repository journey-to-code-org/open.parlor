"""Everything that is heard, made here: the rats' squeaks, chitters, hisses and growl, and after them
the tools, the doors, the breaker on the wall and you.

Each is built from a few sliding tones and some hiss, shaped to rise and die away: a rat's squeak
is a short whistle that slides up or down. The grease rat is high and quick, the brake-fluid
mutant lower and wet, the King Rat lowest, with a growl under it. They are made at the engine's
own rate, 11,025 samples a second, a byte a sample.

Run by hand (it needs numpy):

    python3 games/shooter/delbies/art/sounds.py

It writes sounds.bin.gz (the samples, one sound after another) and sounds.json (each sound's lump
name, where it starts and how long it is). scripts/build-delbies.mjs makes the engine's lumps.
"""
import gzip, json
from pathlib import Path
import numpy as np

here = Path(__file__).parent
RATE = 11025
rng = np.random.default_rng(1993)

def tone(seconds, start, end, bend=1.0, rough=0.0):
    """A whistle sliding from one pitch to another; `rough` shakes its loudness, for a growl."""
    t = np.linspace(0, 1, int(seconds * RATE), endpoint=False)
    pitch = start + (end - start) * t ** bend
    wave = np.sin(2 * np.pi * np.cumsum(pitch) / RATE)
    # A little of the octave above, so it is a voice and not a beep.
    wave += 0.35 * np.sin(4 * np.pi * np.cumsum(pitch) / RATE)
    if rough:
        wave *= 1 - rough * (0.5 + 0.5 * np.sin(2 * np.pi * 38 * t * seconds))
    return wave * np.sin(np.pi * t) ** 0.6

def hiss(seconds, dark=0.0):
    """Breath: noise, made duller by `dark`, dying away."""
    noise = rng.standard_normal(int(seconds * RATE))
    if dark:
        kernel = np.ones(int(1 + dark * 12)) / int(1 + dark * 12)
        noise = np.convolve(noise, kernel, mode="same") * (1 + dark * 2)
    return noise * np.linspace(1, 0, len(noise)) ** 1.5 * 0.5

def quiet(seconds):
    return np.zeros(int(seconds * RATE))

def join(*parts):
    return np.concatenate(parts)

def over(a, b):
    long, short = (a, b) if len(a) >= len(b) else (b, a)
    out = long.copy()
    out[: len(short)] += short
    return out

sounds = {
    # The grease rat: it sees you, bites, is hurt, dies, and mutters to itself.
    "DSSGTSIT": join(tone(0.09, 2600, 3900), quiet(0.03), tone(0.12, 3000, 4400)),
    "DSSGTATK": join(*[join(tone(0.035, 3400, 2600), quiet(0.02)) for _ in range(4)], tone(0.08, 3800, 4600)),
    "DSDMPAIN": tone(0.22, 4400, 2400, 0.6),
    "DSSGTDTH": join(tone(0.18, 4200, 3000), tone(0.4, 3000, 900, 1.6)),
    "DSDMACT": join(tone(0.04, 3000, 3300), quiet(0.05), tone(0.04, 2800, 3100)),
    # The brake-fluid mutant: lower, wetter. It spits, and what it spits lands.
    "DSBGSIT1": over(hiss(0.3, 0.2), tone(0.25, 1500, 2300)),
    "DSBGSIT2": over(hiss(0.35, 0.3), join(tone(0.12, 1800, 1400), tone(0.18, 1400, 2200))),
    "DSBGACT": over(hiss(0.2, 0.4), tone(0.1, 1300, 1500) * 0.6),
    "DSPOPAIN": tone(0.25, 2600, 1300, 0.7),
    "DSBGDTH1": over(hiss(0.5, 0.5), join(tone(0.2, 2200, 1500), tone(0.45, 1500, 500, 1.5, 0.6))),
    "DSBGDTH2": over(hiss(0.6, 0.6), tone(0.6, 2000, 420, 1.3, 0.7)),
    "DSFIRSHT": over(hiss(0.22, 0.15), tone(0.12, 900, 400) * 0.5),
    "DSFIRXPL": over(hiss(0.4, 0.8) * 1.6, tone(0.15, 300, 120) * 0.6),
    # The King Rat: a squeal with a growl under it, and a long way down when he goes.
    "DSBRSSIT": over(tone(0.9, 260, 180, 1.0, 0.8), join(quiet(0.1), tone(0.6, 1100, 1700, 0.8, 0.3))),
    "DSBRSDTH": over(tone(1.5, 300, 90, 1.2, 0.9), join(tone(0.5, 1600, 1100, 1.0, 0.3), tone(0.8, 1100, 300, 1.4, 0.5))),
    # The rest of what is heard. The price gun: a click and a snap. The lever-action: a crack, and its lever worked.
    "DSPISTOL": join(hiss(0.03) * 2, over(hiss(0.09, 0.1), tone(0.06, 1800, 600) * 0.7)),
    "DSSHOTGN": over(hiss(0.45, 0.25) * 2, tone(0.2, 220, 70) * 1.2),
    "DSSGCOCK": join(hiss(0.05, 0.1), quiet(0.06), hiss(0.07, 0.3) * 1.3),
    # The tape measure's blade going out and back, and its hitting something.
    "DSPUNCH": over(hiss(0.1, 0.6) * 1.5, tone(0.07, 240, 120)),
    "DSCLAW": over(hiss(0.16, 0.2), tone(0.12, 2600, 1200) * 0.5),
    # You: hurt, gone, and landing from a height or leaning on a wall that isn't a door.
    "DSPLPAIN": tone(0.22, 420, 300, 0.8, 0.3),
    "DSPLDETH": join(tone(0.3, 420, 260, 1.0, 0.4), tone(0.5, 260, 110, 1.4, 0.6)),
    "DSPDIEHI": join(tone(0.2, 620, 420, 1.0, 0.3), tone(0.6, 420, 120, 1.4, 0.6)),
    "DSOOF": tone(0.12, 300, 190, 1.0, 0.2),
    "DSNOWAY": join(tone(0.08, 260, 220, 1.0, 0.2), quiet(0.03), tone(0.1, 220, 170, 1.0, 0.2)),
    # Picking things up: a chirp, a longer one for a tool, and a rising one for something good.
    "DSITEMUP": tone(0.1, 900, 1500),
    "DSWPNUP": join(hiss(0.05, 0.2), tone(0.14, 500, 1100)),
    "DSGETPOW": join(tone(0.12, 700, 1100), tone(0.12, 1100, 1700), tone(0.2, 1700, 2400)),
    # The building: a breaker thrown and thrown back, doors, a floor that moves, and its stopping.
    "DSSWTCHN": join(hiss(0.03) * 2, tone(0.05, 500, 300)),
    "DSSWTCHX": join(hiss(0.03) * 2, tone(0.05, 300, 500)),
    "DSDOROPN": over(hiss(0.5, 0.7), tone(0.5, 120, 220, 1.0, 0.5) * 0.8),
    "DSDORCLS": join(over(hiss(0.4, 0.7), tone(0.4, 220, 110, 1.0, 0.5) * 0.8), over(hiss(0.08, 0.9) * 2, tone(0.08, 90, 60))),
    "DSPSTART": over(hiss(0.3, 0.8), tone(0.3, 80, 140, 1.0, 0.6)),
    "DSPSTOP": over(hiss(0.12, 0.9) * 2, tone(0.12, 110, 60)),
    "DSSTNMOV": over(hiss(0.25, 0.9), tone(0.25, 70, 70, 1.0, 0.8)),
    "DSTELEPT": join(tone(0.25, 300, 2400, 2.0), tone(0.35, 2400, 500, 0.6)),
    # What is left of a rat underfoot; the waste-oil drum going up; and a tag off a wall.
    "DSSLOP": over(hiss(0.3, 0.9) * 1.5, tone(0.2, 200, 90, 1.0, 0.5)),
    "DSBAREXP": over(hiss(0.8, 0.6) * 2, tone(0.5, 140, 40, 1.0, 0.5) * 1.4),
    "DSTINK": tone(0.05, 2400, 2000),
}

blob = bytearray()
manifest = []
for name, wave in sounds.items():
    wave = wave / max(1e-9, np.abs(wave).max()) * 0.9
    # A moment's fade at each end, so it doesn't click.
    fade = min(60, len(wave) // 2)
    wave[:fade] *= np.linspace(0, 1, fade)
    wave[-fade:] *= np.linspace(1, 0, fade)
    samples = np.clip(np.round(128 + wave * 127), 0, 255).astype(np.uint8).tobytes()
    manifest.append({"name": name, "at": len(blob), "length": len(samples)})
    blob += samples
(here / "sounds.bin.gz").write_bytes(gzip.compress(bytes(blob), 9, mtime=0))
(here / "sounds.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(len(manifest), "sounds,", len(blob), "bytes,", round(len(blob) / RATE, 1), "seconds in all")
