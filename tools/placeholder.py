"""Placeholder portraits for officers not yet drawn.

    python3 tools/placeholder.py            every CAST entry whose file is missing

A silhouette in dress uniform, tinted in the officer's three flag colours:
cap band and collar in the first, badge and shoulder boards in the second,
the sash in the third. The same figure the first placeholders used, so the
stand-off reads the same until the art arrives. Also adds each level's
officer to characters/manifest.json with the look still to be drawn.
"""
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CHAR = ROOT / "public/assets/characters"

# The cast and who defends what, straight out of the game's own tables.
js = r"""
import { CAST, DEFENDER_OF } from './src/game/cast.js';
import { LEVELS } from './src/game/levels.js';
console.log(JSON.stringify({ cast: CAST, of: DEFENDER_OF, where: Object.fromEntries(Object.entries(LEVELS).map(([k, v]) => [k, v.subtitle])) }));
"""
data = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", js], cwd=ROOT))


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def figure(colours):
    W, H = 1024, 1536
    c0, c1, c2 = (rgb(c) for c in colours)
    # A white or near-white stripe reads as a hole in the dark figure: tone it.
    if lum(c2) > 200:
        c2 = tuple(int(v * 0.72) for v in c2)
    if lum(c0) > 200:
        c0 = tuple(int(v * 0.72) for v in c0)
    halo = Image.new("L", (W, H), 0)
    ImageDraw.Draw(halo).rounded_rectangle((150, 200, 874, 1600), radius=320, fill=190)
    halo = halo.filter(ImageFilter.GaussianBlur(90))
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.putalpha(halo)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((180, 760, 844, 1700), radius=150, fill=(28, 33, 41, 255))      # body
    d.rectangle((442, 700, 582, 800), fill=(38, 43, 51, 255))                           # neck
    d.ellipse((342, 360, 682, 730), fill=(43, 49, 57, 255))                              # head
    d.rounded_rectangle((302, 250, 722, 420), radius=85, fill=(28, 33, 41, 255))         # cap
    d.rectangle((312, 400, 712, 440), fill=c0 + (255,))                                  # band
    d.ellipse((262, 420, 762, 500), fill=(14, 18, 25, 255))                              # peak
    d.ellipse((466, 300, 558, 392), fill=c1 + (255,))                                    # badge
    d.rounded_rectangle((190, 790, 420, 850), radius=16, fill=c1 + (255,))               # boards
    d.rounded_rectangle((604, 790, 834, 850), radius=16, fill=c1 + (255,))
    d.polygon([(470, 800), (453, 940), (362, 900)], fill=c0 + (255,))                    # collar
    d.polygon([(554, 800), (571, 900), (662, 900)], fill=c0 + (255,))
    d.polygon([(572, 900), (672, 900), (330, 1536), (230, 1536)], fill=c2 + (255,))      # sash
    return img


manifest_path = CHAR / "manifest.json"
manifest = json.loads(manifest_path.read_text())
made = 0
for code, c in data["cast"].items():
    out = ROOT / "public" / c["file"]
    if out.exists() or code == "us":
        continue
    figure(c["colours"]).save(out, optimize=True)
    made += 1
for level, code in data["of"].items():
    if level in manifest["enemies"]:
        continue
    c = data["cast"][code]
    manifest["enemies"][level] = {
        "id": Path(c["file"]).stem,
        "file": Path(c["file"]).name,
        "nation": c["nation"],
        "defends": data["where"].get(level, level),
        "look": f"{c['rank']} of {c['nation']} in dress uniform; placeholder silhouette in the flag's colours until drawn.",
    }
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print(f"placeholder: {made} portraits drawn, manifest has {len(manifest['enemies'])} levels")
