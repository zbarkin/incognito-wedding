"""Measures each cut-out suit photo so a styled mannequin can be drawn around it.

For every docs/shop/img/*-cut.webp it records, in the photo's own pixels:
  w, h     picture size
  top      first row of the suit (collar tips)
  cx       horizontal center of the shoulders
  sw       shoulder width
  hem      last row of the suit (jacket or trouser hem)
  hx       horizontal center at the hem
Writes docs/shop/anchors.json, which scripts/catalog.mjs merges into the catalog.

Run: python scripts/anchors.py
"""
import glob
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
IMG = os.path.join(ROOT, 'docs', 'shop', 'img')

out = {}
for path in sorted(glob.glob(os.path.join(IMG, '*-cut.webp'))):
    a = np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 128
    h, w = a.shape
    rows = np.where(a.any(axis=1))[0]
    top, hem = int(rows[0]), int(rows[-1])
    r = min(hem, top + int(0.15 * (hem - top)))
    xs = np.where(a[r])[0]
    xb = np.where(a[max(top, hem - 3)])[0]
    out[os.path.basename(path).replace('-cut.webp', '')] = {
        'w': w, 'h': h, 'top': top, 'hem': hem,
        'cx': int((xs[0] + xs[-1]) / 2), 'sw': int(xs[-1] - xs[0]),
        'hx': int((xb[0] + xb[-1]) / 2)
    }
json.dump(out, open(os.path.join(ROOT, 'docs', 'shop', 'anchors.json'), 'w'), indent=1)
print(len(out), 'measured')
for k, v in list(out.items())[:4]:
    print(k, v)
