#!/usr/bin/env python3
"""
Cut a piece of nose art out of its backdrop.

The paintings arrive as finished posters: the figure and the lettering on
a dark, vignetted ground with a glow behind them. Painted on an aircraft
that ground is a black card stuck to the skin. Real nose art is the figure
and the name on the bare metal, so the ground has to go.

The ground is found by flooding in from the edges of the picture through
pixels that are dark and smooth — the backdrop is a soft gradient, and
every figure and every letter is fenced by a hard black keyline, which is
a sharp edge the flood will not cross. Enclosed pockets of the same dark,
smooth ground (the counter of an o, the gap under an arm) go too, if they
match the ground the flood found. What is left keeps its keyline, so the
art sits on the skin outlined the way a sign-writer would have done it.

    python3 tools/noseart_cut.py SRC.png OUT.webp [--check OUT_check.png]

writes a 768x512 WebP with alpha; --check also writes it composited over
fuselage grey and over olive, which is how to judge it.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

W, H = 768, 512
TEX = 0.013
GLOW_TEX = 0.024


def cut(src):
    im = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    soft = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32) / 255
    gx = ndi.sobel(soft, 1); gy = ndi.sobel(soft, 0)
    grad = np.hypot(gx, gy)
    # Texture: the spread of brightness over a few pixels. The ground and
    # the glow behind a figure are airbrushed and have almost none; painted
    # metal, cloth and the distressed lettering all carry grain.
    m1 = ndi.uniform_filter(lum, 7); m2 = ndi.uniform_filter(lum * lum, 7)
    tex = np.sqrt(np.maximum(m2 - m1 * m1, 0))
    # Ground: dark or glowing, and smooth. The glow reaches a lum of about
    # 0.35 and a good deal of colour, so neither is held against it.
    ground = (soft < 0.42) & (tex < TEX) & (grad < 0.11)
    lab, n = ndi.label(ground)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # The ground's own colour, to judge the enclosed pockets against.
    ref = a[bg].mean(0) if bg.any() else np.array([0.06, 0.05, 0.05])
    sizes = ndi.sum(np.ones_like(lum), lab, index=np.arange(1, n + 1))
    for i in range(1, n + 1):
        if i in edge or sizes[i - 1] < 60:
            continue
        m = lab == i
        col = a[m].mean(0)
        if np.abs(col - ref).max() < 0.07 and soft[m].mean() < 0.22:
            bg |= m
    # The glow: brighter than the ground, but airbrushed smoother still.
    # Grown out of the ground found so far, so it can only be reached across
    # smooth paint, never across the keyline that fences the art.
    warm = (a[..., 0] - a[..., 1]) > 0.10
    glow = (soft < 0.72) & (tex < GLOW_TEX) & (grad < 0.10) & warm
    for _ in range(4):
        lab3, n3 = ndi.label(glow | bg)
        keep = np.unique(lab3[bg]); keep = keep[keep > 0]
        grown = np.isin(lab3, keep)
        if (grown & ~bg).sum() == 0:
            break
        bg = bg | grown
    # Close the ground over the specks of grain inside it, and keep the art
    # in one piece: art islands smaller than a fingertip are noise.
    bg = ndi.binary_closing(bg, iterations=2) | bg
    art = ~bg
    lab2, n2 = ndi.label(art)
    if n2:
        s2 = ndi.sum(np.ones_like(lum), lab2, index=np.arange(1, n2 + 1))
        art = np.isin(lab2, [i + 1 for i, s in enumerate(s2) if s >= 220])
    # A pixel's worth of keyline outside the cut, and a soft edge.
    art = ndi.binary_dilation(art, iterations=1)
    alpha = np.asarray(Image.fromarray((art * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    rgba = np.dstack([a, alpha])
    return Image.fromarray((rgba * 255).clip(0, 255).astype(np.uint8), 'RGBA')


def check(cutim, path):
    out = Image.new('RGB', (W * 2, H))
    for k, col in enumerate([(98, 104, 110), (74, 84, 67)]):
        base = Image.new('RGBA', (W, H), col + (255,))
        base.alpha_composite(cutim)
        out.paste(base.convert('RGB'), (k * W, 0))
    out.save(path)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    c = cut(src)
    c.save(dst, 'WEBP', quality=82, method=6)
    if '--check' in sys.argv:
        check(c, sys.argv[sys.argv.index('--check') + 1])
    print(dst, 'art %.0f%%' % (np.asarray(c)[..., 3].astype(float).mean() / 2.55))
