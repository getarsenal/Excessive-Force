#!/usr/bin/env python3
"""The aerial survey: what is actually at the place, before anything is built.

    python3 tools/survey.py <level> [--radius R] [--out DIR]

Reads the bake that already exists for the level — the surveyed buildings in
`public/assets/city/<id>.json`, the ground in `public/assets/terrain/<id>*` —
and the level's record in `src/game/levels.js`, and prints:

  * the terrain profile through the origin, north-south and east-west, and
    the extent of the flat top the landmark will actually stand on;
  * every surveyed building within the exclusion radius, largest first, with
    its footprint, height, bearing and name — the landmark's own outline is
    usually in here, and so are its outbuildings;
  * which of those buildings `cityExcludeRadius` is about to delete.

And it draws a plan, `<out>/<id>-survey.png`: contours, water, every footprint
coloured by height with the named ones numbered, the origin, the exclusion
circle, and the flat top.

Why it exists. The Potala was built twice. The first time, the ground under
it was a table five hundred and forty metres across that nobody had measured,
and the surveyed outbuildings at its foot — the Shol Lekhung, the printing
house, the prison, the old army headquarters, all named in the bake — were
deleted by the exclusion radius and then reinvented as boxes. Every one of
those facts was in files already on disk. This prints them.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent


def load_level_record(level_id):
    """The few fields of the level record the survey needs, by regex."""
    src = (ROOT / "src/game/levels.js").read_text(encoding="utf-8")
    # Up to the next level's record, or the end of the table: the last level
    # in `LEVELS` has nothing after it but `};`, and the first cut of this
    # read the Potala — the last level — as having no record at all.
    m = re.search(rf"^  {re.escape(level_id)}: \{{(.*?)(?=^  [a-z]+: \{{|^\}};)", src, re.S | re.M)
    block = m.group(1) if m else ""
    def num(key):
        mm = re.search(rf"\b{key}:\s*([-\d.]+)", block)
        return float(mm.group(1)) if mm else None
    def word(key):
        mm = re.search(rf"\b{key}:\s*'([^']*)'", block)
        return mm.group(1) if mm else None
    return {
        "cityExcludeRadius": num("cityExcludeRadius"),
        "contextExclude": num("contextExclude"),
        "padRadius": num("padRadius"),
        "groundLevel": word("groundLevel"),
    }


def load_terrain(level_id):
    meta = json.loads((ROOT / f"public/assets/terrain/{level_id}.json").read_text())
    img = np.asarray(Image.open(ROOT / f"public/assets/terrain/{level_id}_height.png").convert("RGB"), dtype=np.float64)
    rng = meta["maxElevation"] - meta["minElevation"]
    heights = meta["minElevation"] + ((img[..., 0] * 256 + img[..., 1]) / 65535.0) * rng
    mask_path = ROOT / f"public/assets/terrain/{level_id}_mask.png"
    water = None
    if mask_path.exists():
        water = np.asarray(Image.open(mask_path).convert("RGB"), dtype=np.float64)[..., 0] > 127
    return meta, heights, water


class Ground:
    def __init__(self, meta, heights, water):
        self.span = meta["spanMeters"]
        self.n = heights.shape[0]
        self.h = heights
        self.water = water

    def cell(self, x, z):
        n = self.n
        u = int(round((x + self.span) / (2 * self.span) * (n - 1)))
        v = int(round((self.span - z) / (2 * self.span) * (n - 1)))
        return min(max(u, 0), n - 1), min(max(v, 0), n - 1)

    def at(self, x, z):
        u, v = self.cell(x, z)
        return float(self.h[v, u])

    def wet(self, x, z):
        if self.water is None:
            return False
        u, v = self.cell(x, z)
        return bool(self.water[v, u])

    def flat_top(self, tol=1.5):
        """Bounding box of the connected near-level ground under the origin."""
        n = self.n
        u0, v0 = self.cell(0.0, 0.0)
        h0 = self.h[v0, u0]
        seen = np.zeros((n, n), dtype=bool)
        stack = [(v0, u0)]
        seen[v0, u0] = True
        vs, us = [], []
        while stack:
            v, u = stack.pop()
            vs.append(v); us.append(u)
            for dv, du in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                vv, uu = v + dv, u + du
                if 0 <= vv < n and 0 <= uu < n and not seen[vv, uu] and abs(self.h[vv, uu] - h0) <= tol:
                    seen[vv, uu] = True
                    stack.append((vv, uu))
        cell = 2 * self.span / (n - 1)
        x0 = -self.span + min(us) * cell; x1 = -self.span + max(us) * cell
        z1 = self.span - min(vs) * cell; z0 = self.span - max(vs) * cell
        return h0, (x0, x1, z0, z1), len(us) * cell * cell


def footprints(level_id, radius):
    city = json.loads((ROOT / f"public/assets/city/{level_id}.json").read_text())
    out = []
    for b in city.get("buildings", []):
        pts = b.get("pts") or []
        if len(pts) < 3:
            continue
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        cx = sum(xs) / len(xs); cz = sum(zs) / len(zs)
        r = math.hypot(cx, cz)
        if r > radius:
            continue
        # Shoelace area.
        a = 0.0
        for i in range(len(pts)):
            x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % len(pts)]
            a += x1 * z2 - x2 * z1
        out.append({
            "pts": pts, "cx": cx, "cz": cz, "r": r,
            "bearing": (math.degrees(math.atan2(cx, cz)) + 360) % 360,
            "w": max(xs) - min(xs), "d": max(zs) - min(zs),
            "area": abs(a) / 2, "h": b.get("h"), "real": bool(b.get("real")),
            "name": b.get("name") if b.get("name") not in (None, "yes") else None,
            "kind": b.get("kind"),
        })
    out.sort(key=lambda b: -b["area"])
    return city, out


def profile(g, along, fixed=0.0, step=50, reach=600):
    row = []
    for d in range(-reach, reach + 1, step):
        x, z = (fixed, d) if along == "z" else (d, fixed)
        row.append(f"{d:+d}:{g.at(x, z):.0f}{'~' if g.wet(x, z) else ''}")
    return " ".join(row)


def draw_plan(level_id, g, blds, rec, radius, flat, out_dir):
    half = max(500.0, radius * 1.6)
    W = 1000
    px = lambda x: (x + half) / (2 * half) * W
    py = lambda z: (half - z) / (2 * half) * W   # +z up, as the terrain PNG has it
    img = Image.new("RGB", (W, W), (232, 226, 210))
    d = ImageDraw.Draw(img)

    # Ground: shaded by height, water in blue, contours every five metres.
    n = g.n
    step = max(1, int(round((2 * half) / W / (2 * g.span / (n - 1)))))
    hs = []
    for yy in range(W):
        z = half - (yy + 0.5) / W * 2 * half
        row = []
        for xx in range(W):
            x = -half + (xx + 0.5) / W * 2 * half
            row.append(g.at(x, z))
        hs.append(row)
    hs = np.array(hs)
    lo, hi = np.percentile(hs, 2), np.percentile(hs, 98)
    shade = np.clip((hs - lo) / max(1e-6, hi - lo), 0, 1)
    base = np.stack([200 + 40 * shade, 190 + 36 * shade, 165 + 30 * shade], axis=-1)
    if g.water is not None:
        wet = np.zeros((W, W), dtype=bool)
        for yy in range(W):
            z = half - (yy + 0.5) / W * 2 * half
            for xx in range(W):
                x = -half + (xx + 0.5) / W * 2 * half
                wet[yy, xx] = g.wet(x, z)
        base[wet] = (120, 160, 200)
    band = np.floor(hs / 5.0)
    edge = np.zeros((W, W), dtype=bool)
    edge[1:, :] |= band[1:, :] != band[:-1, :]
    edge[:, 1:] |= band[:, 1:] != band[:, :-1]
    base[edge] = (120, 105, 80)
    img = Image.fromarray(base.astype(np.uint8))
    d = ImageDraw.Draw(img)

    # Footprints, coloured by height, named ones numbered.
    hmax = max([b["h"] or 0 for b in blds] + [10])
    named = [b for b in blds if b["name"]]
    for b in blds:
        k = min(1.0, (b["h"] or 0) / hmax)
        col = (int(190 - 90 * k), int(120 - 60 * k), int(70 - 30 * k))
        d.polygon([(px(x), py(z)) for x, z in b["pts"]], fill=col, outline=(60, 40, 25))
    font = ImageFont.load_default()
    for i, b in enumerate(named[:40]):
        d.text((px(b["cx"]) + 3, py(b["cz"]) - 6), str(i + 1), fill=(255, 255, 255), font=font)

    # The flat top, the exclusion circle, the origin.
    x0, x1, z0, z1 = flat
    d.rectangle([px(x0), py(z1), px(x1), py(z0)], outline=(30, 110, 30), width=2)
    for r, col in ((rec.get("cityExcludeRadius"), (200, 40, 40)), (rec.get("contextExclude"), (200, 120, 40))):
        if r:
            d.ellipse([px(-r), py(r), px(r), py(-r)], outline=col, width=2)
    d.line([px(-20), py(0), px(20), py(0)], fill=(0, 0, 0), width=2)
    d.line([px(0), py(-20), px(0), py(20)], fill=(0, 0, 0), width=2)
    # Scale bar and axis.
    d.line([20, W - 24, 20 + px(200) - px(0), W - 24], fill=(0, 0, 0), width=3)
    d.text((22, W - 42), "200 m", fill=(0, 0, 0), font=font)
    d.text((W - 60, 8), "+z up", fill=(0, 0, 0), font=font)
    d.text((W - 60, 20), "+x right", fill=(0, 0, 0), font=font)
    d.text((8, 8), f"{level_id}  red: cityExcludeRadius  orange: contextExclude  green: flat top", fill=(0, 0, 0), font=font)

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{level_id}-survey.png"
    img.save(path)
    return path, named


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("level")
    ap.add_argument("--radius", type=float, default=None, help="survey radius in metres; default the exclusion radius, or 350")
    ap.add_argument("--out", default="/tmp/out")
    a = ap.parse_args()

    rec = load_level_record(a.level)
    radius = a.radius or rec.get("cityExcludeRadius") or 350.0
    meta, heights, water = load_terrain(a.level)
    g = Ground(meta, heights, water)
    city, blds = footprints(a.level, radius)

    print(f"{meta['name']} — span {g.span:.0f} m, DEM {meta['minElevation']:.0f}..{meta['maxElevation']:.0f} m, "
          f"water at {meta.get('waterSurface', meta.get('seaLevel', 0)):.1f} m")
    print(f"level record: cityExcludeRadius={rec['cityExcludeRadius']} contextExclude={rec['contextExclude']} "
          f"padRadius={rec['padRadius']} groundLevel={rec['groundLevel']}")

    h0, flat, area = g.flat_top()
    x0, x1, z0, z1 = flat
    print(f"\nGROUND. origin at {h0:.1f} m. Level ground (±1.5 m) connected to the origin: "
          f"x {x0:.0f}..{x1:.0f} ({x1 - x0:.0f} m), z {z0:.0f}..{z1:.0f} ({z1 - z0:.0f} m), {area / 1e4:.1f} ha.")
    # A hilltop is a table when it is wide *both* ways and stands well above
    # the map's low ground. A ridge is long and narrow by nature; a river
    # city is level for a mile and is not a summit at all.
    rise = h0 - meta["minElevation"]
    if rise > 40 and min(x1 - x0, z1 - z0) > 300:
        print(f"  ! The origin stands {rise:.0f} m above the map's low ground and the level top is "
              f"{min(x1 - x0, z1 - z0):.0f} m across its narrow axis: that is a table, not a hilltop. "
              "The peak's `top` or the pad is too wide; set `padRadius: 0` and cut `top` to the real summit.")
    elif rise > 40:
        print(f"  a summit: {rise:.0f} m above the map's low ground, level top {x1 - x0:.0f} x {z1 - z0:.0f} m.")
    print(f"  N-S through x=0 (~ = water):  {profile(g, 'z')}")
    print(f"  E-W through z=0:             {profile(g, 'x')}")

    print(f"\nSURVEYED BUILDINGS within {radius:.0f} m: {len(blds)} "
          f"({sum(1 for b in blds if b['name'])} named, {sum(1 for b in blds if b['real'])} with surveyed heights, "
          f"{sum(b['area'] for b in blds) / 1e4:.1f} ha of footprint). Largest first:")
    for i, b in enumerate(blds[:24]):
        tag = "  <- the landmark?" if i == 0 else ""
        print(f"  {b['area']:7.0f} m2  {b['w']:4.0f}x{b['d']:4.0f}  h {b['h'] or 0:5.1f}{'*' if b['real'] else ' '}  "
              f"{b['r']:4.0f} m at {b['bearing']:3.0f} deg  {b['name'] or b['kind'] or ''}{tag}")
    if len(blds) > 24:
        print(f"  ... and {len(blds) - 24} more")
    ex = rec.get("cityExcludeRadius")
    if ex:
        gone = [b for b in blds if b["r"] < ex]
        names = [b["name"] for b in gone if b["name"]]
        print(f"\n  cityExcludeRadius {ex:.0f} deletes {len(gone)} of these"
              + (f", including: {', '.join(names[:8])}" if names else "")
              + ". If any of them is part of the place, build it or move the radius in.")

    path, named = draw_plan(a.level, g, blds, rec, radius, flat, Path(a.out))
    print(f"\nPLAN: {path}")
    if named:
        print("  numbered on the plan:")
        for i, b in enumerate(named[:40]):
            print(f"   {i + 1:2d}. {b['name']}  ({b['w']:.0f}x{b['d']:.0f} m, h {b['h'] or 0:.0f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
