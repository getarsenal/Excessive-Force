#!/usr/bin/env python3
"""The unit cards' icons at the size a card draws them.

`tools/icons.mjs` renders public/assets/icons/<id>.png at 512x320; a card
shows that in a slot forty pixels high, so on a phone each one was decoded
at four times the pixels it needed, nineteen of them, beside a battle using
every byte the GPU has. iOS gives decoded images back under that pressure
and redraws them half-decoded or not at all. These are the same pictures at
256x160, WebP with alpha: public/assets/icons/card/<id>.webp.

    python3 tools/iconcards.py
"""
import glob, os
from PIL import Image

root = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'icons')
out = os.path.join(root, 'card')
os.makedirs(out, exist_ok=True)
total = 0
for f in sorted(glob.glob(os.path.join(root, '*.png'))):
    im = Image.open(f).convert('RGBA').resize((256, 160), Image.LANCZOS)
    dst = os.path.join(out, os.path.basename(f)[:-4] + '.webp')
    im.save(dst, 'WEBP', quality=84, method=6)
    total += os.path.getsize(dst)
    print(f'{os.path.basename(dst)} {os.path.getsize(dst)} bytes')
print(f'{total} bytes in all')
