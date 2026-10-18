"""Bring every frame in /tmp/out/store to the 6.9" set's 1320x2868."""
import glob
from PIL import Image
for p in sorted(glob.glob('/tmp/out/store/*.png')):
    im = Image.open(p)
    if im.size != (1320, 2868):
        im = im.convert('RGB').resize((1320, 2868), Image.LANCZOS)
        im.save(p, optimize=True)
    print(p, im.size)
