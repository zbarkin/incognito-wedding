# Stitched jacket

A tailor's dress form on a walnut stand. A dinner jacket comes together on it in about 9 seconds, then holds for a second:

1. The jacket's pieces arrive: back, side bodies, fronts, then sleeves.
2. The form turns once, and each seam is sewn in gold thread while it faces the viewer. The thread then fades into the black cloth.
3. The satin notch lapels and the wool collar go on, and their edges are stitched.
4. The button, pockets, studs, cuff buttons and bow tie go on last.

It's a rendered video, one per style, each on that style's background colour:

| Style | Video | Poster | Background |
|---|---|---|---|
| Kodak | `jacket-kodak.mp4` | `jacket-kodak.jpg` | `#0F0E0D` |
| Silver Birch | `jacket-silver-birch.mp4` | `jacket-silver-birch.jpg` | `#111112` |
| Tuxedo Park, green | `jacket-tuxedo-park.mp4` | `jacket-tuxedo-park.jpg` | `#0E1B16` |
| Tuxedo Park, burgundy | `jacket-tuxedo-park-burgundy.mp4` | `jacket-tuxedo-park-burgundy.jpg` | `#270A12` |

Each video is 720 × 960 (3:4), 30 fps, 10 seconds, H.264, with no sound. The poster shows the finished jacket.

The test page is `index.html`: http://localhost:4174/mannequin/ (after `node scripts/serve.mjs`), or `/mannequin/` on the GitHub Pages preview. Add `?style=tuxedo-park` to open it on a style.

## Add it to a screen

In the design file (`designs/<Screen>.dc.html`), put the video where the animation should go. Use the style that matches the screen:

```html
<video src="../mannequin/jacket-kodak.mp4" poster="../mannequin/jacket-kodak.jpg"
       muted playsinline autoplay loop preload="metadata"
       style="display:block; width:100%; aspect-ratio:3/4; background:#0F0E0D;"></video>
```

Then run `node scripts/build.mjs`. The `../mannequin/` path works because built screens live in `docs/screens/`.

- `muted` and `playsinline` are needed for autoplay on phones.
- Leave out `loop` to play it once and stop on the finished jacket.
- Leave out `autoplay` to show only the poster until the visitor presses play (add `controls`).
- Put it on a panel of the same colour as its background so the edges don't show. To match a different colour, re-encode it (below).
- For visitors who have turned on reduced motion, show the poster instead. Add this once, after the video:

```html
<script>
  if (matchMedia('(prefers-reduced-motion: reduce)').matches)
    document.querySelectorAll('video[src*="mannequin/jacket-"]').forEach(v => { v.removeAttribute('autoplay'); v.pause(); });
</script>
```

## Changing it

Everything is built by `blender/stitched_jacket.py` (Blender 5.2) in stages, from the repo's `blender/` folder:

```bash
blender -b -P stitched_jacket.py -- --stage model
```

```bash
blender -b build/jacket.blend -P stitched_jacket.py -- --stage anim
```

```bash
blender -b build/jacket_anim.blend -P stitched_jacket.py -- --stage frames --framing torso
```

```bash
blender -b -P stitched_jacket.py -- --stage encode --framing torso --bg 0F0E0D --out jacket-kodak
```

- `model` builds the form, the jacket's pattern pieces and the details, and drapes the cloth (about a minute).
- `anim` keys the pieces arriving, the stitching, the needle and the turntable.
- `frames` renders transparent PNG frames to `build/frames/torso/` (about an hour on an RTX 5070 Ti).
- `encode` lays the frames on a background colour (`--bg`, hex) and writes the MP4 and the poster to `blender/build/`. It takes a minute, so a new background colour doesn't need a new render.
- `still --t 9.5 --framing lapel` renders a single frame, for checking changes.

`blender/build/` is not committed; copy the finished MP4s and posters here.

Near the top of the script:

- **The jacket's cut:** `JACKET` (the body's shape), `BREAK` (button height), and `NOTCH_*`, `POINT_*` and `GORGE_Z` for the lapel.
- **Collar:** `COLLAR_W` and `collar_point`.
- **Timing:** `ARRIVE` and `SEAMS` (in seconds), and `END`.
