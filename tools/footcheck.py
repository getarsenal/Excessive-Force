#!/usr/bin/env python3
"""Does the building stand on its ground?

The loose-stone check asks whether every stone is carried by another; it
cannot see a building whose base runs off a cliff or out over the water,
because the structure is founded at the origin's ground by definition and
the solver believes it. Stockholm's palace was built at 2.6 times life size,
313 x 394 m, on an island whose level ground is 363 x 187 m: the facades ran
over a 20 m drop into the harbour and stood there on nothing.

This rasterises the footprint (the lowest foot of any stone over each 2 m
cell, from tools/footprint.mjs) over the baked height and water, and reports
how much of it has air or water under it, and how far.

    python3 tools/footcheck.py [level ...]      (no levels: every level)
"""
import json, os, re, subprocess, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from survey import load_terrain, Ground  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
GAP = 2.5          # metres of air under a foot before it counts as hanging


def levels():
    out = subprocess.run(['node', '-e', "import('./src/game/levels.js').then(m=>console.log(Object.keys(m.LEVELS).join(' ')))"],
                         cwd=ROOT, capture_output=True, text=True).stdout.split()
    return [l for l in out if (ROOT / f'public/assets/terrain/{l}.json').exists()]


def check(lid, mul=1.0):
    env = dict(os.environ, FOOT_MUL=str(mul))
    fp = json.loads(subprocess.run(['node', 'tools/footprint.mjs', lid], cwd=ROOT, capture_output=True, text=True, env=env).stdout)
    meta, heights, water = load_terrain(lid)
    G = Ground(meta, heights, water)
    ox, oz = (fp['origin'] or {}).get('x', 0.0), (fp['origin'] or {}).get('z', 0.0)
    rows = []
    for st in fp['structures']:
        off = st['offset'] or {'x': 0.0, 'z': 0.0}
        sx, sz = ox + off['x'], oz + off['z']
        g0 = G.at(sx, sz)
        cell = 2.0
        foot = {}
        for x, z, hx, hz, f in st['rects']:
            for i in range(int(np.floor((x - hx) / cell)), int(np.ceil((x + hx) / cell))):
                for k in range(int(np.floor((z - hz) / cell)), int(np.ceil((z + hz) / cell))):
                    key = (i, k)
                    foot[key] = min(foot.get(key, 1e9), f)
        if not foot:
            continue
        hang = wet = 0
        worst = 0.0
        far = [0.0, 0.0]
        for (i, k), f in foot.items():
            x, z = sx + (i + 0.5) * cell, sz + (k + 0.5) * cell
            t = G.at(x, z) - g0
            is_wet = G.wet(x, z)
            gap = f - t
            if st['onSlope']:
                gap = 0 if not is_wet else gap
            if is_wet:
                wet += 1
            if gap > GAP or is_wet:
                hang += 1
                if gap > worst:
                    worst = gap; far = [x - sx, z - sz]
        n = len(foot)
        rows.append((st['label'] or st['key'], n * cell * cell, 100.0 * hang / n, 100.0 * wet / n, worst, far))
    return rows


def game_scale():
    src = (ROOT / 'src/game/atlas_specs.js').read_text()
    block = src[src.index('export const GAME_SCALE'):]
    block = block[:block.index('};')]
    return {m.group(1): float(m.group(2)) for m in re.finditer(r'^\s*(\w+):\s*([\d.]+)', block, re.M)}


def fit(ids):
    """The largest scale at which each catalogue building stands on its ground."""
    G = game_scale()
    for lid in ids:
        g = G.get(lid)
        if not g:
            print(f'{lid:16s} not in GAME_SCALE'); continue
        best = None
        m = 1.0
        while m >= 1.0 / g - 1e-6:
            rows = check(lid, m)
            hang = max(r[2] for r in rows if r[0])
            if hang <= float(os.environ.get("FIT_MAX", "3")):
                best = m; break
            m = round(m - 0.04, 3)
        if best is None:
            print(f'{lid:16s} {g:.2f} -> stands on nothing even at real size ({hang:.0f}% hanging)')
        else:
            print(f'{lid:16s} {g:.2f} -> {g * best:.2f}  (x{best:.2f})')


if __name__ == '__main__':
    if sys.argv[1:2] == ['--fit']:
        fit(sys.argv[2:]); sys.exit(0)
    ids = sys.argv[1:] or levels()
    bad = []
    for lid in ids:
        try:
            rows = check(lid)
        except Exception as e:  # a level without a bake, or a builder that throws
            print(f'{lid:16s} ERROR {e}')
            continue
        for label, area, hang, wet, worst, far in rows:
            flag = '  <-- HANGING' if hang > 2 else ''
            print(f'{lid:16s} {label[:28]:28s} {area:8.0f} m2  hanging {hang:5.1f}%  wet {wet:5.1f}%  worst gap {worst:5.1f} m at ({far[0]:.0f},{far[1]:.0f}){flag}')
            if hang > 2:
                bad.append(lid)
    print('HANGING:', ' '.join(sorted(set(bad))) or 'none')
