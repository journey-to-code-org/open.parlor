"""The rats' voices, made here: squeaks, chitters, hisses and a growl, in place of the sounds of the
monsters the rats took the place of.

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
