#!/usr/bin/env python3
"""Bake real building footprints from OpenStreetMap into a level's city file.

Why OSM rather than Google's Photorealistic 3D Tiles:

Google's tiles are a single fused photogrammetry mesh. They look superb and
they are the wrong shape for this game — there are no separate buildings in
there, no interiors, and no way to take one apart. They are the same problem we
already rejected for the Elizabeth Tower: a hollow surface that shatters like an
eggshell with nothing inside. They also need an API key, billing, and carry
attribution and derivative-work terms.

OSM gives the opposite: a polygon per building with height tags. A polygon can
be extruded, and an extrusion can be laid up out of stone by the same masonry
builder the tower uses — which means the city can be made destructible on
exactly the same terms as the landmark. It is also free, keyless, and bakes
offline so the game has no runtime dependency on anyone's servers.

Output: public/assets/city/<level>.json, with footprints in metres east/north
of the level origin so the game can consume them directly.

Usage:  python3 tools/bake_buildings.py westminster
Needs outbound access to an Overpass endpoint.
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake_terrain import LEVELS  # noqa: E402  (shares the level definitions)

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "city"

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

# Metres per storey when only building:levels is tagged. 3.2 m is a reasonable
# average across the mix of Victorian civic and modern office stock here.
METRES_PER_LEVEL = 3.2

# Fallback heights by building type, for the many footprints with no height
# information at all.
DEFAULT_HEIGHT = {
    "church": 18.0, "cathedral": 30.0, "chapel": 12.0,
    "office": 24.0, "commercial": 18.0, "retail": 10.0,
    "hotel": 24.0, "apartments": 20.0, "residential": 14.0,
    "house": 8.0, "terrace": 11.0, "civic": 20.0,
    "government": 24.0, "university": 20.0, "school": 12.0,
    "train_station": 16.0, "roof": 6.0, "garage": 4.0, "hut": 3.0,
}
FALLBACK_HEIGHT = 14.0


def parse_height(tags: dict) -> tuple[float, bool]:
    """Return (height in metres, whether it came from real data)."""
    h = tags.get("height") or tags.get("building:height")
    if h:
        try:
            # Values appear as "45", "45 m", and occasionally "150'".
            txt = h.strip().lower().replace("meter", "").replace("metres", "")
            txt = txt.replace("m", "").strip()
            if txt.endswith("'"):
                return float(txt[:-1]) * 0.3048, True
            return float(txt), True
        except ValueError:
            pass

    levels = tags.get("building:levels") or tags.get("levels")
    if levels:
        try:
            n = float(str(levels).split(";")[0])
            roof = tags.get("roof:levels")
            if roof:
                try:
                    n += float(str(roof).split(";")[0]) * 0.6
                except ValueError:
                    pass
            return max(3.0, n * METRES_PER_LEVEL), True
        except ValueError:
            pass

    kind = tags.get("building", "yes")
    if kind in DEFAULT_HEIGHT:
        return DEFAULT_HEIGHT[kind], False
    if tags.get("amenity") == "place_of_worship":
        return 18.0, False
    return FALLBACK_HEIGHT, False


def fetch(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for endpoint in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(
                    endpoint, data=body,
                    headers={"User-Agent": "tumble-town-baker/1.0"},
                )
                with urllib.request.urlopen(req, timeout=180) as r:
                    return json.loads(r.read())
            except Exception as e:  # noqa: BLE001 - any failure means try the next mirror
                last = e
                print(f"  {endpoint} attempt {attempt + 1} failed: {e}")
                time.sleep(3)
    raise SystemExit(f"all Overpass endpoints failed; last error: {last}")


def signed_area(pts: list[list[float]]) -> float:
    a = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        a += x1 * z2 - x2 * z1
    return a / 2.0


def simplify(pts: list[list[float]], tol: float = 0.8) -> list[list[float]]:
    """Ramer-Douglas-Peucker on a closed ring.

    OSM traces carry a lot of near-collinear detail that costs geometry and
    changes nothing at the scale the camera sits at.
    """
    if len(pts) < 4:
        return pts

    def rdp(seq):
        if len(seq) < 3:
            return seq
        ax, az = seq[0]
        bx, bz = seq[-1]
        dx, dz = bx - ax, bz - az
        norm = math.hypot(dx, dz)
        worst, idx = 0.0, 0
        for i in range(1, len(seq) - 1):
            px, pz = seq[i]
            if norm < 1e-9:
                d = math.hypot(px - ax, pz - az)
            else:
                d = abs(dz * px - dx * pz + bx * az - bz * ax) / norm
            if d > worst:
                worst, idx = d, i
        if worst <= tol:
            return [seq[0], seq[-1]]
        return rdp(seq[: idx + 1])[:-1] + rdp(seq[idx:])

    out = rdp(pts + [pts[0]])
    if len(out) > 1 and out[0] == out[-1]:
        out = out[:-1]
    return out if len(out) >= 3 else pts


def bake(level_id: str):
    cfg = LEVELS[level_id]
    lat0, lon0 = cfg["lat"], cfg["lon"]
    span = cfg["spanMeters"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Local equirectangular projection, which is accurate to well under a metre
    # over a couple of kilometres and keeps the maths trivial.
    m_per_deg_lat = 111132.92 - 559.82 * math.cos(2 * math.radians(lat0))
    m_per_deg_lon = 111412.84 * math.cos(math.radians(lat0))

    pad = span * 1.15
    dlat = pad / m_per_deg_lat
    dlon = pad / m_per_deg_lon
    bbox = f"{lat0 - dlat},{lon0 - dlon},{lat0 + dlat},{lon0 + dlon}"

    query = (
        f"[out:json][timeout:180];"
        f'(way["building"]({bbox});relation["building"]["type"="multipolygon"]({bbox}););'
        f"out body geom;"
    )
    print(f"Baking buildings for {level_id} ({cfg['name']})")
    print(f"  bbox {bbox}")
    data = fetch(query)

    buildings = []
    tagged = 0
    for el in data.get("elements", []):
        geom = el.get("geometry")
        if not geom and el.get("type") == "relation":
            # Take the outer ring of a multipolygon.
            for m in el.get("members", []):
                if m.get("role") == "outer" and m.get("geometry"):
                    geom = m["geometry"]
                    break
        if not geom or len(geom) < 4:
            continue

        pts = []
        for node in geom:
            if "lat" not in node:
                continue
            x = (node["lon"] - lon0) * m_per_deg_lon
            z = -(node["lat"] - lat0) * m_per_deg_lat  # +north is -z in world space
            pts.append([round(x, 2), round(z, 2)])
        if len(pts) < 4:
            continue
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue

        # Drop anything wholly outside the playfield.
        if all(abs(p[0]) > span or abs(p[1]) > span for p in pts):
            continue

        pts = simplify(pts)
        area = abs(signed_area(pts))
        if area < 25:          # sheds, bin stores, map noise
            continue
        if area > 120000:      # a mis-tagged district boundary
            continue
        # Wind consistently anticlockwise so the extruder can assume a normal.
        if signed_area(pts) < 0:
            pts.reverse()

        tags = el.get("tags", {})
        height, real = parse_height(tags)
        if real:
            tagged += 1

        buildings.append({
            "pts": pts,
            "h": round(height, 1),
            "real": real,
            "kind": tags.get("building", "yes"),
            "name": tags.get("name"),
        })

    buildings.sort(key=lambda b: -abs(signed_area(b["pts"])))
    meta = {
        "id": level_id,
        "name": cfg["name"],
        "lat": lat0,
        "lon": lon0,
        "spanMeters": span,
        "count": len(buildings),
        "withRealHeights": tagged,
        "source": "OpenStreetMap contributors, ODbL 1.0",
        "note": "Footprints in metres east (+x) / south (+z) of the level origin.",
        "buildings": buildings,
    }
    out = OUT_DIR / f"{level_id}.json"
    out.write_text(json.dumps(meta, separators=(",", ":")))
    size_kb = out.stat().st_size / 1024
    print(f"  {len(buildings)} buildings ({tagged} with tagged heights), {size_kb:.0f} KB")
    print(f"  wrote {out}")


if __name__ == "__main__":
    targets = sys.argv[1:] or ["westminster"]
    for t in targets:
        if t not in LEVELS:
            raise SystemExit(f"unknown level {t}; known: {', '.join(LEVELS)}")
        bake(t)
