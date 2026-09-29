#!/usr/bin/env python3
"""The plan of Edinburgh Castle, founded on the bake.

    python3 tools/edinburgh_plan.py

Writes src/structure/landmarks/edinburgh_plan.js: every building of the castle
as the wings it is made of, the curtain along the rim of the rock and the
Half Moon Battery, each with the depth its walls have to be carried down to
meet the ground the terrain bake actually has under it.

The wings are the surveyed outlines in public/assets/city/edinburgh.json taken
apart by hand into rectangles a gable roof can go on: each is its ridge line
(two points, game metres, x east and z south, the summit origin at 0) and its
width. The depths are measured, not written: the old builder carried each
building down to a hand-picked depth, scaled the plan half as big again about
the origin, and a corner that the scaling pushed out over the edge of the crag
stood on nothing.

Re-run after a re-bake of the ground.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from survey import load_terrain, Ground  # noqa: E402

# name, tag, ridge A, ridge B, width, surveyed height (m), kind
WINGS = [
    ("Royal Palace", "palace", (30.9, 37.6), (30.3, 76.1), 19.5, 15.3, "hall"),
    ("Great Hall", "greathall", (-6.1, 70.6), (19.9, 69.2), 12.6, 13.0, "hall"),
    ("Queen Anne Building", "greathall", (-18.8, 39.9), (-13.9, 77.3), 16.3, 15.0, "hall"),
    ("War Memorial", "memorial", (-13.0, 31.5), (23.2, 26.3), 13.0, 14.5, "hall"),
    ("War Memorial apse", "memorial", (3.3, 22.0), (2.7, 13.0), 8.0, 11.0, "hall"),
    ("New Barracks", "barracks", (-104.0, 12.2), (-65.8, 64.3), 17.0, 13.0, "hall"),
    ("Military Prison", "barracks", (-45.6, 49.5), (-45.5, 63.2), 14.0, 14.4, "hall"),
    ("Royal Scots, west", "barracks", (-46.4, 37.6), (-27.6, 35.4), 9.5, 12.4, "hall"),
    ("Royal Scots, north", "barracks", (-30.6, 42.0), (-30.0, 53.0), 8.6, 12.4, "hall"),
    ("Hospital, north", "hospital", (-137.0, -48.3), (-102.0, -51.3), 12.0, 14.7, "hall"),
    ("Hospital, east", "hospital", (-105.0, -44.0), (-104.4, -26.0), 9.0, 14.7, "hall"),
    ("Hospital, west", "hospital", (-132.4, -40.0), (-130.4, -9.0), 7.0, 14.1, "hall"),
    ("War Museum", "hospital", (-130.0, -8.2), (-97.8, -12.5), 10.2, 14.1, "hall"),
    ("Governor's House", "governor", (-87.5, -16.0), (-73.6, 15.0), 11.0, 10.1, "hall"),
    ("Cartsheds", "governor", (-88.3, -35.3), (-72.8, -51.6), 14.4, 13.1, "hall"),
    ("Cartsheds, west", "governor", (-92.7, -47.1), (-80.8, -59.3), 8.0, 12.0, "hall"),
    ("Ordnance store", "governor", (-38.0, -16.0), (-39.0, 2.6), 9.0, 11.1, "hall"),
    ("Mills Mount range", "governor", (-46.0, 10.0), (-35.6, 12.2), 11.0, 6.0, "hall"),
    ("St Margaret's Chapel", "chapel", (-22.6, -8.0), (-13.4, -8.4), 5.0, 8.0, "chapel"),
    ("Argyle Tower", "argyle", (9.7, -31.5), (0.1, -20.8), 8.4, 13.0, "tower"),
    ("Argyle Battery", "argyle", (17.0, -26.0), (53.5, -12.4), 9.0, 5.0, "battery"),
    ("Gatehouse", "gatehouse", (68.5, -5.0), (73.4, 28.0), 9.4, 12.7, "gate"),
]

# The Half Moon: a D against the Palace's east end, its arc over the Esplanade.
HALFMOON = {"cx": 55.0, "cz": 45.0, "r": 26.0, "a0": -20.0, "a1": 100.0, "back": 45.0}
# The curtain runs round the rim from the Half Moon, through south, west and north,
# to the head of the Esplanade: bearings measured from +x toward +z, degrees.
CURTAIN = (22, 330)
# Where men and mortars stand on the summit's own ground.
POINTS = {
    "crown1": (5.0, 46.0), "crown2": (12.0, 55.0), "crown3": (-2.0, 55.0),
    "gun": (-52.0, -44.0), "square": (-60.0, 22.0), "yard": (40.0, 5.0),
}


def main():
    meta, h, w = load_terrain("edinburgh")
    g = Ground(meta, h, w)
    g0 = g.at(0.0, 0.0)
    rel = lambda x, z: g.at(x, z) - g0

    def lowest(points_fn, margin):
        mn = 1e9
        for x, z in points_fn(margin):
            mn = min(mn, rel(x, z))
        return mn

    wings = []
    for name, tag, a, b, width, hgt, kind in WINGS:
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz)
        ux, uz = dx / L, dz / L
        vx, vz = -uz, ux
        cx, cz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2

        def grid(m, cx=cx, cz=cz, L=L, width=width, ux=ux, uz=uz, vx=vx, vz=vz):
            n1, n2 = int((L + 2 * m) / 1.5) + 2, int((width + 2 * m) / 1.5) + 2
            for i in range(n1):
                for j in range(n2):
                    s = -L / 2 - m + (L + 2 * m) * i / (n1 - 1)
                    t = -width / 2 - m + (width + 2 * m) * j / (n2 - 1)
                    yield cx + ux * s + vx * t, cz + uz * s + vz * t
        low = lowest(grid, 4.0)
        high = max(rel(x, z) for x, z in grid(0.0))
        wings.append({
            "name": name, "tag": tag, "kind": kind,
            "cx": round(cx, 2), "cz": round(cz, 2), "len": round(L, 2), "wid": width,
            # Local +z along the ridge: the builder's yaw convention.
            "ry": round(math.atan2(ux, uz), 4),
            "h": hgt, "found": math.floor(low - 3.0), "grade": round(high, 1),
        })

    # The rim: for each bearing, how far out the summit holds within 3 m.
    def rim(bearing):
        ca, sa = math.cos(math.radians(bearing)), math.sin(math.radians(bearing))
        r = 0.0
        while r < 300 and rel(r * ca, r * sa) > -3.0:
            r += 0.5
        return r, ca, sa

    curtain = []
    for bearing in range(CURTAIN[0], CURTAIN[1] + 1, 4):
        r, ca, sa = rim(bearing)
        r -= 3.0
        x, z = r * ca, r * sa

        def disc(m, x=x, z=z, ca=ca, sa=sa):
            for k in range(0, 9):
                for side in (-1.5, 0.0, 1.5):
                    yield x + ca * k + (-sa) * side, z + sa * k + ca * side
        curtain.append({"x": round(x, 2), "z": round(z, 2),
                        "found": math.floor(lowest(disc, 0) - 2.0),
                        "grade": round(rel(x, z), 1)})

    H = HALFMOON
    arc = []
    n = 16
    for i in range(n + 1):
        a = math.radians(H["a0"] + (H["a1"] - H["a0"]) * i / n)
        x, z = H["cx"] + math.cos(a) * H["r"], H["cz"] + math.sin(a) * H["r"]

        def around(m, x=x, z=z, a=a):
            for k in range(-2, 8):
                for side in (-1.5, 0.0, 1.5):
                    yield x + math.cos(a) * k - math.sin(a) * side, z + math.sin(a) * k + math.cos(a) * side
        arc.append({"x": round(x, 2), "z": round(z, 2), "found": math.floor(lowest(around, 0) - 2.0)})
    hm = dict(H, arc=arc, found=min(p["found"] for p in arc))

    points = {k: {"x": x, "z": z, "y": round(rel(x, z), 2)} for k, (x, z) in POINTS.items()}

    plan = {"wings": wings, "curtain": curtain, "halfmoon": hm, "points": points}
    out = ROOT / "src/structure/landmarks/edinburgh_plan.js"
    out.write_text(
        "// Generated by tools/edinburgh_plan.py from the survey and the terrain bake.\n"
        "// Do not edit: change the wings in the tool and run it again.\n"
        "export const PLAN = " + json.dumps(plan, indent=1) + ";\n")
    for wg in wings:
        print(f"  {wg['name']:24} {wg['len']:5.1f} x {wg['wid']:4.1f}  ground {wg['grade']:6.1f} .. found {wg['found']}")
    print(f"  curtain: {len(curtain)} points, found {min(p['found'] for p in curtain)}..{max(p['found'] for p in curtain)}")
    print(f"  half moon: found {hm['found']}")
    print(f"  points: {points}")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
