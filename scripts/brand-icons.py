#!/usr/bin/env python3
"""Build a brand pack's icon set from its mark.

    python3 scripts/brand-icons.py <slug> [--mark mark.png] [--bg '#1b1b1b']

Writes icon-192.png, icon-512.png, icon-maskable-512.png (mark inside the
centre 80% safe zone), apple-touch-icon.png (180) and favicon-32.png into
public/brands/<slug>/. The mark is a PNG with transparency; the background
defaults to the pack's dark background colour.
"""
import argparse, json, os, sys
from PIL import Image

root = os.path.join(os.path.dirname(__file__), "..", "public", "brands")
ap = argparse.ArgumentParser()
ap.add_argument("slug")
ap.add_argument("--mark")
ap.add_argument("--bg")
a = ap.parse_args()

d = os.path.join(root, a.slug)
brand = json.load(open(os.path.join(d, "brand.json")))
mark = a.mark or brand.get("mark")
bg = a.bg or brand["palette"]["dark"]["background"]
if not mark or not mark.lower().endswith(".png"):
    sys.exit("need a PNG mark (SVG marks: export a PNG first, then --mark it)")

src = Image.open(os.path.join(d, mark)).convert("RGBA")
rot = float(brand.get("mark_rotate") or 0)
if rot:
    src = src.rotate(-rot, resample=Image.BICUBIC, expand=True)  # PIL rotates counter-clockwise for positive angles
rgb = tuple(int(bg.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))

def icon(size, scale, name):
    canvas = Image.new("RGBA", (size, size), rgb + (255,))
    m = src.copy(); m.thumbnail((int(size * scale), int(size * scale)), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    canvas.convert("RGB").save(os.path.join(d, name), optimize=True)
    print("wrote", name)

icon(192, .72, "icon-192.png")
icon(512, .72, "icon-512.png")
icon(512, .56, "icon-maskable-512.png")
icon(180, .72, "apple-touch-icon.png")
icon(32, .84, "favicon-32.png")
