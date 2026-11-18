"""Converts the Blender mannequin renders (docs/shop/render/<theme>/*.png) to WebP for the site.

The PNGs come from the Blender session at full quality; the shop pages load the .webp copies
(about a tenth of the size, transparency kept). Run after each render pass:
    python scripts/render_webp.py
"""
import glob
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'shop', 'render')
before = after = 0
for png in sorted(glob.glob(os.path.join(ROOT, '*', '*.png'))):
    webp = png[:-4] + '.webp'
    Image.open(png).save(webp, 'WEBP', quality=88, method=6)
    before += os.path.getsize(png); after += os.path.getsize(webp)
print(f'{before / 1e6:.1f} MB of PNG -> {after / 1e6:.1f} MB of WebP')
