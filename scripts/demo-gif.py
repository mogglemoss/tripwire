#!/usr/bin/env python3
"""Assemble demo frames into a GIF.

    python3 scripts/demo-gif.py <frames-dir> docs/demo.gif [--width 960]

Frames are PNGs named NNN-<hold-ms>.png (from scripts/demo-gif.js). Each is
held for its own duration, with a short crossfade into the next.
"""
import argparse, glob, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("frames"); ap.add_argument("out"); ap.add_argument("--width", type=int, default=960)
a = ap.parse_args()

files = sorted(glob.glob(os.path.join(a.frames, "*.png")))
if not files: raise SystemExit("no frames")

def load(f):
    im = Image.open(f).convert("RGB")
    h = round(im.height * a.width / im.width)
    return im.resize((a.width, h), Image.LANCZOS)

frames, durations = [], []
imgs = [load(f) for f in files]
holds = [int(os.path.basename(f).split("-")[1].split(".")[0]) for f in files]
STEPS = 4
for i, im in enumerate(imgs):
    frames.append(im); durations.append(holds[i])
    nxt = imgs[(i + 1) % len(imgs)]
    for s in range(1, STEPS):
        frames.append(Image.blend(im, nxt, s / STEPS)); durations.append(60)

pal = [f.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG) for f in frames]
os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
pal[0].save(a.out, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True)
print("wrote", a.out, len(frames), "frames", os.path.getsize(a.out) // 1024, "KB")
