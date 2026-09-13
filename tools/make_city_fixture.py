#!/usr/bin/env python3
"""Generate a synthetic city file so the runtime extrusion path can be tested
without network access to Overpass.

This is NOT real data and must never be committed to public/assets/city/ —
`bake_buildings.py` is the only thing that should write there. It exists so the
loader, the extruder and the facade UVs can be exercised in CI-like conditions.

Usage:  python3 tools/make_city_fixture.py > /tmp/westminster.json
"""
import json, math, random, sys

random.seed(7)
buildings = []


def rect(cx, cz, w, d, h, rot=0.0):
    pts = []
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, z = sx * w / 2, sz * d / 2
        pts.append([round(cx + x * math.cos(rot) - z * math.sin(rot), 2),
                    round(cz + x * math.sin(rot) + z * math.cos(rot), 2)])
    buildings.append({"pts": pts, "h": h, "real": True, "kind": "office", "name": None})


def lshape(cx, cz, w, d, h):
    pts = [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz],
           [cx, cz], [cx, cz + d / 2], [cx - w / 2, cz + d / 2]]
    buildings.append({"pts": [[round(x, 2), round(z, 2)] for x, z in pts],
                      "h": h, "real": True, "kind": "civic", "name": None})


lshape(-150, 40, 70, 60, 28)
for _ in range(160):
    a = random.uniform(0, math.tau)
    r = 90 + abs(random.gauss(0, 1)) * 420
    cx, cz = math.cos(a) * r, math.sin(a) * r
    if cx > 150 and abs(cz) < 700:
        continue
    rect(cx, cz, random.uniform(16, 46), random.uniform(14, 40),
         random.uniform(9, 42), random.uniform(0, 1.2))

json.dump({"id": "westminster", "name": "SYNTHETIC FIXTURE", "lat": 51.50072,
           "lon": -0.12462, "spanMeters": 900.0, "count": len(buildings),
           "withRealHeights": len(buildings),
           "source": "SYNTHETIC TEST FIXTURE - not OpenStreetMap data",
           "buildings": buildings}, sys.stdout, separators=(",", ":"))
