#!/usr/bin/env python3
"""Bake the real place — buildings, water and land cover — from Overture Maps.

Why Overture rather than Overpass:

The obvious source is an Overpass API, and the baker that used one never ran
once: every Overpass endpoint is blocked by this environment's egress policy,
which is why every level in the game stood in a procedural approximation of its
own city and said so in the console on every load.

The Overture Maps Foundation publishes the same data — OSM's buildings and
water, with Microsoft and Google's ML-derived footprints filling the gaps, plus
heights — as GeoParquet on a public S3 bucket, and S3 *is* reachable. Parquet
carries per-row-group statistics on the bounding box column, so a query for one
square kilometre reads a few megabytes out of a quarter of a terabyte rather
than downloading the world.

It writes three things:

  public/assets/city/<level>.json    real footprints with real heights, which
                                     `buildCity` has always known how to read
                                     and has never been given
  public/assets/terrain/<level>_mask.png   R = water, G = road, B = green,
                                     rewritten from real coastlines, real
                                     river banks and real land cover
  (the height PNG is left alone: that is the DEM's job)

Usage:  python3 tools/bake_overture.py sydney
        python3 tools/bake_overture.py --all
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as fs
from PIL import Image
from shapely import wkb
from shapely.geometry import shape, box as shapely_box
from shapely.ops import transform as shapely_transform

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_terrain  # noqa: E402
from bake_terrain import LEVELS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CITY_DIR = ROOT / "public" / "assets" / "city"
TERRAIN_DIR = ROOT / "public" / "assets" / "terrain"

BUCKET = "overturemaps-us-west-2"
RELEASE = "2026-08-19.0"

# Metres per storey where only a floor count is given.
METRES_PER_LEVEL = 3.2

# What a building is, when nothing says how tall it is. Overture's `subtype`
# and `class` are a cleaner vocabulary than OSM's free-for-all `building` tag.
DEFAULT_HEIGHT = {
    "religious": 20.0, "civic": 18.0, "education": 12.0, "medical": 16.0,
    "commercial": 16.0, "industrial": 12.0, "transportation": 12.0,
    "residential": 11.0, "agricultural": 6.0, "service": 4.0,
    "entertainment": 14.0, "military": 10.0,
}
CLASS_HEIGHT = {
    "cathedral": 34.0, "church": 18.0, "chapel": 11.0, "mosque": 18.0,
    "temple": 16.0, "synagogue": 16.0, "tower": 40.0,
    "apartments": 20.0, "residential": 12.0, "house": 7.5, "detached": 7.5,
    "terrace": 10.0, "bungalow": 5.0, "dormitory": 18.0,
    "office": 26.0, "commercial": 16.0, "retail": 9.0, "supermarket": 9.0,
    "hotel": 26.0, "warehouse": 10.0, "industrial": 11.0, "factory": 12.0,
    "hospital": 20.0, "school": 11.0, "university": 20.0, "college": 16.0,
    "government": 20.0, "civic": 18.0, "museum": 18.0, "stadium": 24.0,
    "train_station": 15.0, "parking": 10.0, "garage": 3.2, "shed": 3.0,
    "hut": 2.8, "roof": 4.0, "carport": 2.8, "greenhouse": 4.0,
}

# Where the *land cover* layer is worth having.
#
# Overture carries two different things under similar names. `land_use` is
# parcels — this park, that cemetery, this school field — surveyed at the scale
# of a city block, and it is what makes a city's greenery real. `land_cover` is
# satellite classification generalised into a handful of enormous polygons: for
# Moscow the whole region comes back as three shapes reading "urban", one
# reading "grass" and one reading "forest", and burning those in paints eighty
# per cent of the city as parkland.
#
# So the cover layer is only taken where the level really is standing in it —
# the Corcovado is rainforest to the sea and Chichen Itza is jungle in every
# direction, and there the one enormous forest polygon is the literal truth.
WILD_COVER = {"rio", "chichen"}
COVER_KEEP = {"forest", "tree", "trees", "wood", "mangrove", "wetland", "shrub"}

# Land use that is built on rather than grown on. This goes into the mask's
# road channel, which the ground shader reads as hardstanding: it is the
# difference between a city standing in a meadow and a city standing on a
# city. Without it the ground between the buildings is the same grass as the
# fields beyond the map, and every level reads as a village.
BUILT = {
    "residential", "commercial", "retail", "industrial", "developed",
    "institutional", "education", "medical", "military", "transportation",
    "airport", "port", "construction", "pedestrian", "parking", "quarry",
}

# Overture land-cover and land classes that read as green from the air.
GREEN = {
    "forest", "tree", "trees", "wood", "grass", "grassland", "scrub",
    "shrub", "heath", "meadow", "wetland", "park", "garden", "golf_course",
    "pitch", "recreation_ground", "cemetery", "allotments", "orchard",
    "vineyard", "farmland", "farmyard", "village_green", "nature_reserve",
    "playground", "flowerbed", "horticulture", "greenhouse_horticulture",
    "winter_sports", "forest_management", "resource_extraction",
}


def s3fs():
    """Anonymous S3, through this environment's egress proxy."""
    os.environ.setdefault("AWS_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    return fs.S3FileSystem(anonymous=True, region="us-west-2",
                           proxy_options=os.environ.get("HTTPS_PROXY", ""))


# Where the pulled rows are kept between runs.
#
# A query against the bucket is fifteen to sixty seconds, a level makes five of
# them, and a nine-level bake therefore spends the better part of half an hour
# waiting on a release that is immutable — `2026-08-19.0` is the same data
# tomorrow. Every adjustment to the mask, the dredge, the road classes or the
# packing costs another one of those, and this session paid it eight times.
#
# The key is everything that decides the answer: release, theme, the square
# asked for, and the columns. Change any of them and it misses and re-fetches,
# which is the only correctness property a cache needs. `--fresh` bypasses it.
CACHE = Path(os.environ.get("TT_OVERTURE_CACHE", "/tmp/tt-overture"))
USE_CACHE = True


def read_theme(sink, theme, type_, lat0, lon0, pad_lat, pad_lon, columns):
    """Every row of one Overture layer whose bbox touches the level's square.

    The filter is on the `bbox` struct rather than on the geometry, because
    that is the column the row-group statistics are kept for: it is what turns
    a quarter-terabyte scan into a handful of range reads.
    """
    key = hashlib.sha1(json.dumps([
        RELEASE, theme, type_, round(lat0, 6), round(lon0, 6),
        round(pad_lat, 6), round(pad_lon, 6), sorted(columns),
    ], sort_keys=True).encode()).hexdigest()[:20]
    hit = CACHE / f"{theme}-{type_}-{key}.arrow"
    if USE_CACHE and hit.exists():
        try:
            with pa.OSFile(str(hit), "rb") as fh:
                return pa.ipc.open_file(fh).read_all()
        except Exception:
            hit.unlink(missing_ok=True)

    path = f"{BUCKET}/release/{RELEASE}/theme={theme}/type={type_}"
    dataset = ds.dataset(path, filesystem=sink, format="parquet")
    f = ((pc.field("bbox", "xmin") < lon0 + pad_lon)
         & (pc.field("bbox", "xmax") > lon0 - pad_lon)
         & (pc.field("bbox", "ymin") < lat0 + pad_lat)
         & (pc.field("bbox", "ymax") > lat0 - pad_lat))
    table = dataset.to_table(filter=f, columns=columns)
    if USE_CACHE:
        try:
            CACHE.mkdir(parents=True, exist_ok=True)
            tmp = hit.with_suffix(".part")
            with pa.OSFile(str(tmp), "wb") as fh:
                with pa.ipc.new_file(fh, table.schema) as w:
                    w.write_table(table)
            tmp.replace(hit)
        except Exception as exc:      # a cache that cannot write is still a bake
            print(f"  (could not cache {theme}/{type_}: {exc})")
    return table


def projector(lat0, lon0):
    """Local equirectangular: degrees to metres east (+x) and south (+z).

    Shared by every pass here — buildings, roads, water, land cover — so a
    level's four files agree with each other to the metre.
    """
    m_lat = 111132.92 - 559.82 * math.cos(2 * math.radians(lat0))
    m_lon = 111412.84 * math.cos(math.radians(lat0))

    def to_local(lon, lat, _=None):
        return ((lon - lon0) * m_lon, -(lat - lat0) * m_lat)

    return to_local, m_lat, m_lon


def height_of(row):
    h = row.get("height")
    if h and 1.5 < h < 500:
        return float(h), True
    n = row.get("num_floors")
    if n and 0 < n < 160:
        return float(n) * METRES_PER_LEVEL, True
    c = (row.get("class") or "").lower()
    if c in CLASS_HEIGHT:
        return CLASS_HEIGHT[c], False
    s = (row.get("subtype") or "").lower()
    return DEFAULT_HEIGHT.get(s, 9.0), False


def ring_points(geom, to_local, span):
    """A polygon's outer ring in local metres, wound anticlockwise."""
    if geom.geom_type == "MultiPolygon":
        geom = max(geom.geoms, key=lambda g: g.area)
    if geom.geom_type != "Polygon":
        return None
    ring = shapely_transform(to_local, geom.exterior)
    pts = [[round(x, 2), round(z, 2)] for x, z in ring.coords]
    if len(pts) > 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 3:
        return None
    if all(abs(p[0]) > span or abs(p[1]) > span for p in pts):
        return None
    area = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        area += x1 * z2 - x2 * z1
    if abs(area / 2) < 22:
        return None
    if area < 0:
        pts.reverse()
    return pts


def simplify(pts, tol=0.9):
    """Drop points that sit on the line between their neighbours."""
    if len(pts) < 5:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        ax, az = out[-1]
        bx, bz = pts[i]
        cx, cz = pts[i + 1]
        cross = abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax))
        base = math.hypot(cx - ax, cz - az) or 1
        if cross / base > tol:
            out.append(pts[i])
    out.append(pts[-1])
    return out if len(out) >= 3 else pts


def infer_heights(buildings, cell=180.0, floor=6.0):
    """Give the untagged buildings the height of the ones around them.

    Roughly half of any city's footprints carry no height and no usable class,
    and a flat fallback lands every one of them on the same number: a thousand
    identical nine-metre boxes, which from the air is a car park with a roof on
    it and is the main reason a real city can come out looking worse than an
    invented one. A building with no height is far better described by its
    neighbours — Mayfair is five storeys because Mayfair is five storeys — so
    each untagged one takes the median of the surveyed heights in its own
    quarter, nudged by how big its own footprint is against theirs.
    """
    grid = {}
    for b in buildings:
        if not b["real"]:
            continue
        cx = sum(p[0] for p in b["pts"]) / len(b["pts"])
        cz = sum(p[1] for p in b["pts"]) / len(b["pts"])
        grid.setdefault((round(cx / cell), round(cz / cell)), []).append(b["h"])
    if not grid:
        return
    allh = sorted(h for v in grid.values() for h in v)
    overall = allh[len(allh) // 2]

    def near(cx, cz):
        key = (round(cx / cell), round(cz / cell))
        pool = []
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                pool += grid.get((key[0] + dx, key[1] + dz), [])
        if len(pool) < 3:
            return overall
        pool.sort()
        return pool[len(pool) // 2]

    for b in buildings:
        if b["real"]:
            continue
        pts = b["pts"]
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        a = 0.0
        for i in range(len(pts)):
            q, r = pts[i], pts[(i + 1) % len(pts)]
            a += q[0] * r[1] - r[0] * q[1]
        area = abs(a / 2)
        h = near(cx, cz)
        # A big footprint in a low quarter is a warehouse, not a tower; a small
        # one in a tall quarter is a mews house. Both belong nearer the middle
        # than the raw median, so the nudge is gentle and bounded.
        scale = min(1.5, max(0.55, (area / 320.0) ** 0.22))
        b["h"] = round(max(floor, min(h * scale, h * 1.6, 140.0)), 1)


# How far past the playfield the city is carried, and how it is carried.
#
# A map is 1.7 km across and the place it is cut out of is not. Stopping the
# buildings at the boundary leaves the town ending in a clean line with fields
# beyond it, which is the one thing every one of these levels is not: London
# does not stop at Lambeth Bridge. So the survey is read out to more than twice
# the playfield and everything past the edge is kept as well.
#
# Not as outlines, though. Out there nothing is shot at, nothing is stood on and
# nothing is closer than eight hundred metres, so a building is a box — and a
# box is six numbers against a polygon's twenty. Fifteen thousand outlines is
# four megabytes and fifteen thousand boxes is three hundred kilobytes, which is
# the difference between shipping the surround and not.
SURROUND = 2.25          # how far out to read, in playfield spans
SURROUND_MIN_AREA = 55   # a shed at nine hundred metres is not a building
SURROUND_CAP = 9000      # largest first, so a cap loses sheds and not towers


def bounding_rect(pts):
    """Smallest enclosing rectangle: (cx, cz, w, d, yaw).

    `yaw` in the game's convention, where a bearing of y turns the width axis
    to (cos y, -sin y) — the same one `block()` and `footprintPoints` use.
    """
    best = None
    n = len(pts)
    for i in range(n):
        ax, az = pts[i]
        bx, bz = pts[(i + 1) % n]
        ex, ez = bx - ax, bz - az
        L = math.hypot(ex, ez)
        if L < 0.4:
            continue
        ux, uz = ex / L, ez / L
        us = [q[0] * ux + q[1] * uz for q in pts]
        vs = [-q[0] * uz + q[1] * ux for q in pts]
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            best = (area, ux, uz, min(us), max(us), min(vs), max(vs))
    if best is None:
        return None
    _, ux, uz, u0, u1, v0, v1 = best
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    return (cu * ux - cv * uz, cu * uz + cv * ux,
            u1 - u0, v1 - v0, math.atan2(-uz, ux))


def bake_buildings(sink, level_id, cfg, lat0, lon0, span, roads=None):
    to_local, m_lat, m_lon = projector(lat0, lon0)
    pad = span * SURROUND
    tab = read_theme(sink, "buildings", "building", lat0, lon0,
                     pad / m_lat, pad / m_lon,
                     ["geometry", "height", "num_floors", "class", "subtype",
                      "names"])
    rows = tab.to_pylist()
    out, far, tagged = [], [], 0
    for row in rows:
        try:
            geom = wkb.loads(bytes(row["geometry"]))
        except Exception:
            continue
        pts = ring_points(geom, to_local, span * SURROUND)
        if pts is None:
            continue
        h, real = height_of(row)
        inside = any(abs(q[0]) <= span * 1.05 and abs(q[1]) <= span * 1.05 for q in pts)
        rec = {"pts": simplify(pts), "h": round(h, 1), "real": real,
               "kind": row.get("class") or row.get("subtype") or "yes"}
        if inside:
            if real:
                tagged += 1
            names = row.get("names") or {}
            rec["name"] = names.get("primary") if isinstance(names, dict) else None
            out.append(rec)
        else:
            far.append(rec)

    # Heights are inferred from the neighbourhood, so the two sets have to be
    # measured together: the surround is mostly untagged and the quarters it
    # borrows from are inside the map.
    infer_heights(out + far)

    # The surround, as boxes.
    boxes = []
    for rec in far:
        pts = rec["pts"]
        a = 0.0
        for i in range(len(pts)):
            q, r = pts[i], pts[(i + 1) % len(pts)]
            a += q[0] * r[1] - r[0] * q[1]
        area = abs(a / 2)
        if area < SURROUND_MIN_AREA:
            continue
        rect = bounding_rect(pts)
        if rect is None:
            continue
        cx, cz, w, d, yaw = rect
        if min(w, d) < 3.0:
            continue
        boxes.append((area, [round(cx), round(cz), round(w, 1), round(d, 1),
                             round(math.degrees(yaw)), round(rec["h"], 1)]))
    boxes.sort(key=lambda t: -t[0])
    flat = []
    for _, b in boxes[:SURROUND_CAP]:
        flat.extend(b)

    out.sort(key=lambda b: -len(b["pts"]))
    CITY_DIR.mkdir(parents=True, exist_ok=True)
    meta = {
        "id": level_id, "name": cfg["name"], "lat": lat0, "lon": lon0,
        "spanMeters": span, "count": len(out), "withRealHeights": tagged,
        "source": "Overture Maps Foundation (OpenStreetMap contributors, ODbL "
                  "1.0; Microsoft and Google building footprints)",
        "note": "Footprints in metres east (+x) / south (+z) of the level origin. "
                "`outer` is the city beyond the playfield, flat-packed as "
                "x, z, w, d, yaw in degrees, height.",
        "buildings": out,
        "outerReach": round(span * SURROUND),
        "outer": flat,
    }
    if roads:
        meta["roads"] = roads
    path = CITY_DIR / f"{level_id}.json"
    path.write_text(json.dumps(meta, separators=(",", ":")))
    print(f"  buildings: {len(out)} ({tagged} with real heights) "
          f"+ {len(flat) // 6} beyond the map, {path.stat().st_size / 1024:.0f} KB")
    return len(out)



# ── Roads ───────────────────────────────────────────────────────────────────
#
# The streets are the part that decides whether a place is recognisable.
# Terrain gives you the shape of the ground and buildings give you the massing,
# but what the eye actually reads a city by is its plan: the Etoile's twelve
# radiating avenues, the bend of the Arno, the wedge of Circular Quay, the ring
# roads round the Kremlin. A procedural grid lays none of those down, and no
# amount of correct massing rescues a street plan that is somebody's lattice.
#
# Overture carries the topology as well as the geometry: every segment lists
# the `connectors` it shares with its neighbours, with the fraction along the
# line where each one sits. That is a graph, already noded, already consistent
# — which means the junctions do not have to be recovered by intersecting a
# few thousand line segments and hoping the tolerances hold.
#
# What comes out of here is the same shape `buildStreetNetwork` produces, so
# everything the game already draws from a network — carriageways, junction
# pads, kerbs, markings, lamps, block ground, street furniture — draws from
# the real one without knowing the difference.

# Overture's road classes, mapped onto the three the game builds. Anything not
# named here is not a street: footways, steps, cycle tracks and driveways are
# real and would triple the size of the graph to draw lines the width of a
# pavement, which the pavement generator is already drawing.
ROAD_KIND = {
    "motorway": "avenue", "trunk": "avenue", "primary": "avenue",
    "secondary": "avenue",
    "tertiary": "street", "residential": "street", "unclassified": "street",
    "living_street": "street", "pedestrian": "street",
    "service": "mews", "track": "mews",
}
# Half the width of each class's kerb-to-kerb reservation, for deciding which
# street a block's side is bounded by.
KIND_RANK = {"avenue": 3, "street": 2, "mews": 1}


def road_flags(row):
    out = set()
    for entry in row.get("road_flags") or []:
        for v in (entry.get("values") or []):
            out.add(v)
    return out


def _clip_box(pts, lim):
    """Split a polyline into the runs of it that lie inside the square.

    A road that leaves the map and comes back is two roads, not one with a
    detour through the void: joining them would draw a carriageway straight
    across the corner of the playfield.
    """
    runs, cur = [], []
    inside = lambda p: abs(p[0]) <= lim and abs(p[1]) <= lim  # noqa: E731
    for i, p in enumerate(pts):
        if inside(p):
            cur.append(p)
        else:
            if cur:
                # Carry the crossing point so the road stops at the edge of the
                # map rather than a whole segment short of it.
                cur.append(_edge_cross(cur[-1], p, lim))
                runs.append(cur)
                cur = []
            if i + 1 < len(pts) and inside(pts[i + 1]):
                cur = [_edge_cross(pts[i + 1], p, lim)]
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def _edge_cross(inside_pt, outside_pt, lim):
    """Where the line from an inside point to an outside one leaves the square."""
    ax, az = inside_pt
    bx, bz = outside_pt
    lo, hi = 0.0, 1.0
    for _ in range(24):
        mid = (lo + hi) / 2
        x, z = ax + (bx - ax) * mid, az + (bz - az) * mid
        if abs(x) <= lim and abs(z) <= lim:
            lo = mid
        else:
            hi = mid
    return [round(ax + (bx - ax) * lo, 2), round(az + (bz - az) * lo, 2)]


class Graph:
    """Junctions and the polylines between them.

    Nodes come from Overture's own `connectors` where a segment has them —
    that is the authoritative topology, shared by every segment meeting at a
    junction, and it is why this does not have to recover intersections by
    crossing a few thousand lines and praying about the tolerance. Where a
    segment's end is not a connector (the map's own edge, mostly) it falls back
    to welding on a 3 m grid.
    """

    def __init__(self, weld=3.0):
        self.weld = weld
        self.pos = []
        self.index = {}
        self.edges = []

    def node(self, p, key=None):
        if key is None:
            key = ("@", round(p[0] / self.weld), round(p[1] / self.weld))
        n = self.index.get(key)
        if n is None:
            n = len(self.pos)
            self.index[key] = n
            self.pos.append([round(p[0], 2), round(p[1], 2)])
        return n

    def add(self, pts, cls, bridge=False, keys=(None, None)):
        if len(pts) < 2:
            return
        a = self.node(pts[0], keys[0])
        b = self.node(pts[-1], keys[1])
        if a == b:
            return
        pts = [self.pos[a]] + [list(p) for p in pts[1:-1]] + [self.pos[b]]
        if _length(pts) < self.weld * 1.5:
            return
        self.edges.append({"a": a, "b": b, "cls": cls, "pts": pts,
                           "bridge": bridge})


def cut_at(pts, fractions):
    """Split a polyline at fractions of its own length.

    Overture linear-references a connector as a number between 0 and 1 along
    the segment, so this is how a segment becomes the two or five streets that
    actually meet at its junctions.
    """
    steps = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(steps)
    if total < 1e-6:
        return []
    cum, acc = [0.0], 0.0
    for d in steps:
        acc += d
        cum.append(acc / total)

    def point_at(t):
        if t <= 0:
            return list(pts[0]), 0
        if t >= 1:
            return list(pts[-1]), len(pts) - 1
        for i in range(len(cum) - 1):
            if cum[i] <= t <= cum[i + 1]:
                span = cum[i + 1] - cum[i]
                k = 0.0 if span < 1e-9 else (t - cum[i]) / span
                return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k,
                        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k], i
        return list(pts[-1]), len(pts) - 1

    marks = sorted(set([0.0] + [min(1.0, max(0.0, f)) for f in fractions] + [1.0]))
    out = []
    for i in range(len(marks) - 1):
        t0, t1 = marks[i], marks[i + 1]
        if t1 - t0 < 1e-6:
            continue
        p0, i0 = point_at(t0)
        p1, i1 = point_at(t1)
        mid = [list(q) for q in pts[i0 + 1:i1 + 1]]
        run = [p0] + mid + [p1]
        # Drop a duplicated vertex where a cut landed exactly on one.
        run = [q for j, q in enumerate(run) if j == 0 or math.dist(q, run[j - 1]) > 1e-6]
        if len(run) >= 2:
            out.append((t0, t1, run))
    return out


def _length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def _dedupe(graph):
    """One street between any two junctions; keep the biggest class."""
    best = {}
    for e in graph.edges:
        key = (min(e["a"], e["b"]), max(e["a"], e["b"]))
        cur = best.get(key)
        if cur is None or KIND_RANK[e["cls"]] > KIND_RANK[cur["cls"]]:
            best[key] = e
    graph.edges = list(best.values())


def _prune_stubs(graph, keep_len=95.0):
    """Drop dead ends, repeatedly.

    A driveway that ends in a car park is a real road and reads as a mistake:
    a carriageway with kerbs and markings that stops in the middle of a block.
    Long ones are kept, because a real cul-de-sac two hundred metres deep is a
    street and looks like one.
    """
    for _ in range(8):
        deg = {}
        for e in graph.edges:
            deg[e["a"]] = deg.get(e["a"], 0) + 1
            deg[e["b"]] = deg.get(e["b"], 0) + 1
        drop = [e for e in graph.edges
                if (deg.get(e["a"], 0) == 1 or deg.get(e["b"], 0) == 1)
                and _length(e["pts"]) < keep_len]
        if not drop:
            break
        dropped = set(id(e) for e in drop)
        graph.edges = [e for e in graph.edges if id(e) not in dropped]


def _faces(graph):
    """The holes in the network: every bounded face of the planar graph.

    Standard half-edge walk. At each node the arriving half-edge picks the next
    one clockwise from its own reverse, which traces each bounded face once,
    anticlockwise, and the unbounded face once, clockwise — so the outer
    boundary falls out by the sign of its area and needs no special case.
    """
    fan = {}
    for e in graph.edges:
        for (n, other, fwd) in ((e["a"], e["b"], True), (e["b"], e["a"], False)):
            pts = e["pts"] if fwd else e["pts"][::-1]
            ang = math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])
            fan.setdefault(n, []).append({"to": other, "edge": e, "fwd": fwd,
                                          "ang": ang})
    for n in fan:
        fan[n].sort(key=lambda h: h["ang"])

    def twin(half):
        for h in fan[half["to"]]:
            if h["edge"] is half["edge"] and h["fwd"] != half["fwd"]:
                return h
        return None

    seen, faces = set(), []
    for start_node, arms in fan.items():
        for start in arms:
            if id(start) in seen:
                continue
            walk, cur, node = [], start, start_node
            for _ in range(4000):
                if id(cur) in seen:
                    break
                seen.add(id(cur))
                walk.append(cur)
                back = twin(cur)
                if back is None:
                    walk = []
                    break
                ring = fan[cur["to"]]
                i = ring.index(back)
                cur = ring[(i - 1) % len(ring)]
                node = cur
                if cur is start:
                    break
            else:
                walk = []
            if len(walk) < 3:
                continue
            poly, sides = [], []
            for h in walk:
                pts = h["edge"]["pts"] if h["fwd"] else h["edge"]["pts"][::-1]
                for p in pts[:-1]:
                    poly.append(p)
                    sides.append(h["edge"]["cls"])
            if len(poly) < 3:
                continue
            faces.append({"poly": poly, "sides": sides})
    return faces


def _area(poly):
    a = 0.0
    for i in range(len(poly)):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % len(poly)]
        a += x1 * z2 - x2 * z1
    return a / 2.0


def _hull(pts):
    pts = sorted(set((round(p[0], 2), round(p[1], 2)) for p in pts))
    if len(pts) < 3:
        return [list(p) for p in pts]
    def half(seq):
        out = []
        for p in seq:
            while len(out) >= 2:
                ox, oz = out[-2]
                bx, bz = out[-1]
                if (bx - ox) * (p[1] - oz) - (bz - oz) * (p[0] - ox) > 0:
                    break
                out.pop()
            out.append(p)
        return out
    lower, upper = half(pts), half(reversed(pts))
    return [list(p) for p in lower[:-1] + upper[:-1]]


def _ombb(poly):
    """The block as a rectangle: the smallest one that contains it.

    The game's block is a quad — the pavement inset, the frame a terrace is set
    back from, the ground slab are all built off four corners — and a real city
    block is an n-gon. The minimum-area rectangle is the honest reduction: for
    the overwhelming majority of blocks, which really are rectangles with a
    clipped corner, it lands on the block itself.
    """
    hull = _hull(poly)
    if len(hull) < 3:
        return None
    best = None
    for i in range(len(hull)):
        ax, az = hull[i]
        bx, bz = hull[(i + 1) % len(hull)]
        ex, ez = bx - ax, bz - az
        L = math.hypot(ex, ez)
        if L < 1e-6:
            continue
        ux, uz = ex / L, ez / L
        us = [p[0] * ux + p[1] * uz for p in hull]
        vs = [-p[0] * uz + p[1] * ux for p in hull]
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            best = (area, ux, uz, min(us), max(us), min(vs), max(vs))
    if best is None:
        return None
    _, ux, uz, u0, u1, v0, v1 = best
    def world(u, v):
        return [round(u * ux - v * uz, 2), round(u * uz + v * ux, 2)]
    return [world(u0, v0), world(u1, v0), world(u1, v1), world(u0, v1)]


def _side_classes(quad, poly, sides):
    """Which street bounds each side of the rectangle.

    The face's own edges carry their class; the rectangle's do not, so each of
    its four sides takes the class of the face edge that lies nearest to it,
    and the widest one wins a tie. A block's pavement is set out from this, so
    a side that fronts an avenue has to know it does.
    """
    out = []
    for i in range(4):
        ax, az = quad[i]
        bx, bz = quad[(i + 1) % 4]
        mx, mz = (ax + bx) / 2, (az + bz) / 2
        best, pick = 1e18, "street"
        for j, p in enumerate(poly):
            q = poly[(j + 1) % len(poly)]
            d = math.dist(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), (mx, mz))
            cls = sides[j]
            score = d - KIND_RANK[cls] * 4.0
            if score < best:
                best, pick = score, cls
        out.append(pick)
    return out


def bake_roads(sink, level_id, lat0, lon0, span):
    to_local, m_lat, m_lon = projector(lat0, lon0)
    pad = span * 1.35
    tab = read_theme(sink, "transportation", "segment", lat0, lon0,
                     pad / m_lat, pad / m_lon,
                     ["geometry", "class", "subtype", "road_flags", "connectors"])
    lim = span * 1.02
    graph = Graph()
    for row in tab.to_pylist():
        if (row.get("subtype") or "") != "road":
            continue
        cls = ROAD_KIND.get((row.get("class") or "").lower())
        if cls is None:
            continue
        try:
            geom = wkb.loads(bytes(row["geometry"]))
        except Exception:
            continue
        if geom.geom_type != "LineString":
            continue
        flags = road_flags(row)
        if "is_tunnel" in flags:
            continue                      # nothing to draw; it is under the map
        bridge = "is_bridge" in flags
        line = [list(to_local(x, y)) for x, y in geom.coords]
        if len(line) < 2:
            continue

        # Where the junctions are, by Overture's own reckoning.
        conns = {}
        for c in (row.get("connectors") or []):
            cid, at = c.get("connector_id"), c.get("at")
            if cid is None or at is None:
                continue
            conns[round(float(at), 6)] = cid

        for t0, t1, run in cut_at(line, conns.keys()):
            key0 = conns.get(round(t0, 6))
            key1 = conns.get(round(t1, 6))
            for part in _clip_box(run, lim):
                # A run that was trimmed at the map edge no longer ends where
                # its connector does, so it may not claim that connector's node.
                k0 = key0 if math.dist(part[0], run[0]) < 0.5 else None
                k1 = key1 if math.dist(part[-1], run[-1]) < 0.5 else None
                graph.add(part, cls, bridge, (k0, k1))

    _dedupe(graph)
    _prune_stubs(graph)

    faces = _faces(graph)
    blocks = []
    for f in faces:
        a = _area(f["poly"])
        if a <= 0:
            continue                      # the outer boundary winds the other way
        if a < 260 or a > 130000:
            continue                      # a junction island; a whole district
        quad = _ombb(f["poly"])
        if quad is None:
            continue
        w = math.dist(quad[0], quad[1])
        d = math.dist(quad[1], quad[2])
        if min(w, d) < 12 or max(w, d) > 460:
            continue
        # A rectangle that bears no relation to the face it came from is a
        # dog-leg block, and squaring it up would pave over a street.
        if a < w * d * 0.52:
            continue
        cx = sum(p[0] for p in quad) / 4
        cz = sum(p[1] for p in quad) / 4
        blocks.append({"poly": quad,
                       "sides": _side_classes(quad, f["poly"], f["sides"]),
                       "x": round(cx, 2), "z": round(cz, 2),
                       "area": round(a)})

    # Renumber to the nodes that survived, so the file carries no orphans.
    used = sorted({n for e in graph.edges for n in (e["a"], e["b"])})
    remap = {n: i for i, n in enumerate(used)}
    nodes = [graph.pos[n] for n in used]
    edges = [{"a": remap[e["a"]], "b": remap[e["b"]], "cls": e["cls"],
              "pts": [[round(p[0], 2), round(p[1], 2)] for p in e["pts"]],
              **({"bridge": 1} if e["bridge"] else {})}
             for e in graph.edges]
    metres = round(sum(_length(e["pts"]) for e in edges))
    print(f"  roads: {len(edges)} streets, {len(nodes)} junctions, "
          f"{metres / 1000:.1f} km, {len(blocks)} blocks")
    return {"nodes": nodes, "edges": edges, "blocks": blocks}


def to_pixel(x, z, size, span):
    """World metres to mask pixel.

    Row zero is z = +span, matching `bake_terrain.py`'s own grid and the
    loader's `(span - z)` lookup. Getting this upside down is silent and
    catastrophic: the mask still looks like a plausible coastline, it is just
    somebody else's, and it is checked against a heightmap that is the right
    way up — so the harbour is dredged out of the hillside, the city is
    declared to be standing in the water, and every diagnostic agrees with
    every other one because they are all reading the same flipped array.
    """
    k = (size - 1) / (span * 2)
    return ((x + span) * k, (span - z) * k)


def rasterise(polys, size, span, value=1.0):
    """Burn local-metre polygons into a size x size mask at world scale.

    A polygon is a ring of (x, z), or a `(ring, holes)` pair. A polygon with
    holes is drawn on its own layer — the ring filled, the holes cleared — and
    the layer is folded into the mask with a max, so a hole never erases a
    neighbour that happens to lie inside it.
    """
    from PIL import ImageDraw
    img = Image.new("F", (size, size), 0.0)
    draw = ImageDraw.Draw(img)
    layers = []
    for poly in polys:
        ring, holes = (poly if isinstance(poly, tuple) else (poly, ()))
        px = [to_pixel(x, z, size, span) for x, z in ring]
        if len(px) < 3:
            continue
        if not holes:
            draw.polygon(px, fill=value)
            continue
        layer = Image.new("F", (size, size), 0.0)
        ld = ImageDraw.Draw(layer)
        ld.polygon(px, fill=value)
        for hole in holes:
            hp = [to_pixel(x, z, size, span) for x, z in hole]
            if len(hp) >= 3:
                ld.polygon(hp, fill=0.0)
        layers.append(np.asarray(layer, dtype=np.float64))
    out = np.asarray(img, dtype=np.float64)
    for layer in layers:
        out = np.maximum(out, layer)
    return out


def rasterise_lines(lines, size, span, widths):
    """Burn polylines into a mask at their real width."""
    from PIL import ImageDraw
    img = Image.new("F", (size, size), 0.0)
    draw = ImageDraw.Draw(img)
    k = (size - 1) / (span * 2)
    for pts, w in zip(lines, widths):
        px = [to_pixel(x, z, size, span) for x, z in pts]
        if len(px) >= 2:
            draw.line(px, fill=1.0, width=max(1, int(round(w * k))), joint="curve")
    return np.asarray(img, dtype=np.float64)


def collect_polys(sink, theme, type_, lat0, lon0, span, to_local, m_lat, m_lon,
                  keep=None, columns=("geometry", "subtype", "class")):
    pad = span * 1.6
    try:
        tab = read_theme(sink, theme, type_, lat0, lon0, pad / m_lat,
                         pad / m_lon, list(columns))
    except Exception as exc:                      # a theme a release may lack
        print(f"  ({theme}/{type_} unavailable: {exc})")
        return []
    # Clipped to the square, and with their holes. Overture draws a sea as one
    # polygon: the Arabian Sea is a single feature with five hundred and
    # ninety-five interior rings, and the Persian Gulf another with thirteen
    # hundred, and every one of those rings is a piece of coast — the land is
    # the *hole*. Burning the exterior alone put the whole of Dubai under the
    # Gulf. So each part is cut down to the square first, which turns a sea
    # into the strip of it that is actually in view, and its holes come with
    # it for the rasteriser to clear.
    clip = shapely_box(-pad, -pad, pad, pad)
    polys = []
    for row in tab.to_pylist():
        if keep and not keep(row):
            continue
        try:
            geom = wkb.loads(bytes(row["geometry"]))
        except Exception:
            continue
        parts = geom.geoms if geom.geom_type.startswith("Multi") else [geom]
        for part in parts:
            if part.geom_type != "Polygon":
                continue
            local = shapely_transform(to_local, part)
            try:
                local = local.intersection(clip)
            except Exception:
                local = local.buffer(0).intersection(clip)
            pieces = local.geoms if hasattr(local, "geoms") else [local]
            for piece in pieces:
                if piece.geom_type != "Polygon" or piece.is_empty:
                    continue
                ring = list(piece.exterior.coords)
                holes = [list(h.coords) for h in piece.interiors if len(h.coords) >= 4]
                polys.append((ring, holes) if holes else ring)
    return polys


def close(a, passes=2):
    """Dilate then erode: fills pinholes and seams without moving the outline."""
    def step(x, f):
        return f(f(f(f(x, np.roll(x, 1, 0)), np.roll(x, -1, 0)),
                   np.roll(x, 1, 1)), np.roll(x, -1, 1))
    for _ in range(passes):
        a = step(a, np.maximum)
    for _ in range(passes):
        a = step(a, np.minimum)
    return a


def blur(a, passes=2):
    for _ in range(passes):
        a = (a
             + np.roll(a, 1, 0) + np.roll(a, -1, 0)
             + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5.0
    return a


def water_polys(sink, lat0, lon0, span):
    to_local, m_lat, m_lon = projector(lat0, lon0)
    return collect_polys(sink, "base", "water", lat0, lon0, span * 1.6,
                         to_local, m_lat, m_lon)


# How far past the map the world is still drawn. The surround apron and the
# skyline ring both run to seven spans, so that is how far the sea has to be
# known: anything nearer is a coastline that stops in mid-air.
FAR = 7.0
FAR_SIZE = 320


def bake_far_water(sink, level_id, lat0, lon0, span):
    """The coastline of everything you can see, not just everything you can
    shoot at.

    The playfield mask stops at the boundary, and past it the world falls back
    to guesswork: a map whose *edge* is wet is treated as open sea to the
    horizon, and a map whose edge is dry is dry country to the horizon. That is
    right for Sydney and right for London and completely wrong for Rio, where
    the level is the summit of the Corcovado and the nearest water — the Lagoa,
    Botafogo, the Atlantic — is two to four kilometres out. Every one of them is
    in plain view from the statue's feet and none of them was on the map, so the
    most recognisable harbour in the world was rendered as farmland.

    So the real water is burned a second time over a square seven spans wide, at
    forty-odd metres to the pixel, which is plenty for scenery you are never
    closer than a kilometre to. The loader lays the distant sheet on it and
    sinks the apron under it.
    """
    to_local, m_lat, m_lon = projector(lat0, lon0)
    reach = span * FAR
    polys = collect_polys(sink, "base", "water", lat0, lon0, reach,
                          to_local, m_lat, m_lon)
    w = np.clip(rasterise(polys, FAR_SIZE, reach), 0, 1)
    w = close(w, 1)
    img = Image.fromarray((w * 255).astype(np.uint8), mode="L")
    img.save(TERRAIN_DIR / f"{level_id}_far.png")
    frac = float((w > 0.5).mean())
    print(f"  far water: {len(polys)} polygons, {frac * 100:.1f}% of "
          f"{reach * 2 / 1000:.1f} km square")
    return frac


def _water_surface(w: np.ndarray, height: np.ndarray, size: int) -> float:
    """Where the surface of the water is.

    The DEM already knows, and it is the only thing here that does. Terrarium
    fills every water body flat at its own shoreline, so the elevation under a
    real coastline is a plateau at the water's true level — take its median and
    that is the surface, to within the sampling error.

    The two obvious alternatives are both wrong, and were both tried. The
    deepest point on the map plus a constant is what the loader falls back to,
    and Sydney's deepest sample is nine metres down in the middle of the
    harbour: five metres above that is three below the quay, so the tide goes
    out across the whole map. The shoreline's own height is worse, because a
    surface model's shoreline includes the buildings standing on it — the
    thirtieth percentile of Sydney's came to 5.3 m, which is a metre over the
    Opera House's own ground, and Bennelong Point went under the harbour.

    The middle of the plateau. Three quarters of the way up it was tried, to
    keep the Thames from sitting two metres under its own embankment, and it is
    the wrong trade: the Thames is tidal and has a real foreshore, while Sydney
    Harbour does not, and a surface pushed up to 2.5 m there is above the quay —
    which took four hundred of the city's seven hundred buildings out as
    standing in the water.
    """
    wet = w > 0.5
    if wet.sum() > size * size * 0.004:
        surface = float(np.median(height[wet]))
    else:
        surface = float(np.percentile(height, 4))
    # And never above the land: whatever the DEM says, a water plane over the
    # dry fifth of the map is a flood, not a coastline.
    dry = height[~wet] if (~wet).any() else height
    return min(surface, float(np.percentile(dry, 12)))


def bake_mask(sink, level_id, lat0, lon0, span, meta, water, roads=None,
              cut_peak=False):
    """Rewrite the water and green channels of the level's mask from real data,
    and cut the bed the new water needs.

    The mask and the heightmap have to agree or neither is any use: water drawn
    where the DEM has dry ground is a sheet lying on a field, and Tilezen fills
    every water body flat at its own shoreline, so the ground under a real
    coastline is exactly level with the bank beside it. So the real shoreline
    goes in and then the ground under it is dredged to a bed, feathered back to
    the shore — the same thing `carve_river` does for a hand-typed polyline,
    done instead from the coastline the water actually has.
    """
    mpath = TERRAIN_DIR / f"{level_id}_mask.png"
    hpath = TERRAIN_DIR / f"{level_id}_height.png"
    if not mpath.exists() or not hpath.exists():
        print("  (no terrain to rewrite — run bake_terrain.py first)")
        return
    mask = np.asarray(Image.open(mpath).convert("RGB"), dtype=np.float64) / 255.0
    size = mask.shape[0]
    to_local, m_lat, m_lon = projector(lat0, lon0)

    hi_img = np.asarray(Image.open(hpath).convert("RGB"), dtype=np.float64)
    lo, hi = meta["minElevation"], meta["maxElevation"]
    height = (hi_img[:, :, 0] * 256 + hi_img[:, :, 1]) / 65535.0 * (hi - lo) + lo

    if water:
        w = np.clip(rasterise(water, size, span), 0, 1)
        # Close the seams. A harbour comes back as a few hundred polygons that
        # share edges, and a scanline fill leaves a pixel of dry land along
        # every shared edge: from above that is a chain of sandbanks down the
        # middle of Sydney Harbour. Dilating and then eroding by the same
        # amount closes the seams and leaves the real coastline where it was.
        w = close(w, 2)
        # Drop the water the landform swallowed — on a cut hill, and only
        # there.
        #
        # A level with a `peak` has its hill carved in after the DEM is fetched
        # and before this runs, and the cut takes no notice of what the survey
        # says is wet. Lhasa has ponds at the foot of Marpo Ri and a couple on
        # its flank; the cut lifted the ground under them by a hundred metres,
        # and the clamp at the bottom of this function then drove every one of
        # those pixels back down to the waterline — with no feather, because
        # the feather is on the bed cut and not on the clamp. The result was a
        # vertical-sided canyon a hundred metres deep across the face of the
        # hill with a pond lying in the bottom of it, which is what the Potala
        # was standing behind.
        #
        # There is one water plane per map, so water that ends up well above it
        # is not representable whatever is done with the ground: it stops being
        # water. But only where a cut put it there. Run over a real coastline
        # the same test throws away a fifth of Sydney Harbour, because a
        # surveyed polygon laps a metre or two of headland everywhere it meets
        # one and a surface model's headland is a cliff.
        if cut_peak:
            surf0 = _water_surface(w, height, size)
            swallowed = (w > 0.5) & (height > surf0 + 14.0)
            if swallowed.any():
                drowned = float(swallowed.mean() * 100)
                w = np.where(swallowed, 0.0, w)
                print(f"  dropped water the cut swallowed: {drowned:.2f}% of the map")
        # Replaced, not unioned: where a real shoreline exists it is the
        # shoreline, and the level's own typed river was skipped upstream.
        mask[:, :, 0] = w
        # Dredge the bed, and only the bed.
        #
        # The shelf has to feather *into* the water, never out of it. Blurring
        # the wet mask on its own pulls the ground down for ten metres inland
        # of every bank as well — which puts the whole waterfront below the
        # waterline, and a waterfront below the waterline is a city with no
        # quay: three hundred and eighty of Sydney's buildings were refused for
        # standing in a harbour that had been dug out from under them.
        # Multiplying the blur back by the mask pins it to zero at the bank.
        # A shelf, not a step. Three passes of blur is a bank four metres
        # wide and four metres deep, which draws every coastline on the map as
        # a vertical wall; seven puts the same drop over twenty-odd metres,
        # which is a beach at one end of the scale and a harbour wall at the
        # other and reads as ground either way.
        soft = blur(w, 7) * w

        # Where the surface of the water is.
        #
        # The DEM already knows, and it is the only thing here that does.
        # Terrarium fills every water body flat at its own shoreline, so the
        # elevation under a real coastline is a plateau at the water's true
        # level — take its median and that is the surface, to within the
        # sampling error.
        #
        # The two obvious alternatives are both wrong, and were both tried.
        # The deepest point on the map plus a constant is what the loader falls
        # back to, and Sydney's deepest sample is nine metres down in the middle
        # of the harbour: five metres above that is three below the quay, so the
        # tide goes out across the whole map. The shoreline's own height is
        # worse, because a surface model's shoreline includes the buildings
        # standing on it — the thirtieth percentile of Sydney's came to 5.3 m,
        # which is a metre over the Opera House's own ground, and Bennelong
        # Point went under the harbour.
        # The middle of the plateau. Three quarters of the way up it was tried,
        # to keep the Thames from sitting two metres under its own embankment,
        # and it is the wrong trade: the Thames is tidal and has a real
        # foreshore, while Sydney Harbour does not, and a surface pushed up to
        # 2.5 m there is above the quay — which took four hundred of the city's
        # seven hundred buildings out as standing in the water.
        wet = w > 0.5
        surface = _water_surface(w, height, size)
        bed = surface - 4.5
        cut = np.minimum(height, bed)
        height = height * (1 - soft) + cut * soft
        # Nothing wet may stand above its own water. A levelled pad or a
        # building-height artefact inside the mask draws as an island.
        height = np.where(wet, np.minimum(height, surface - 0.5), height)
        meta["waterSurface"] = round(surface, 3)
        print(f"  water surface at {surface:.2f} m, bed at {bed:.2f} m")
        print(f"  dredged the bed under {float(w.mean() * 100):.1f}% of the map")

    green = []
    if level_id in WILD_COVER:
        green += collect_polys(
            sink, "base", "land_cover", lat0, lon0, span * 1.6, to_local, m_lat,
            m_lon, keep=lambda r: (r.get("subtype") or "") in COVER_KEEP,
            columns=("geometry", "subtype"))
    green += collect_polys(
        sink, "base", "land_use", lat0, lon0, span * 1.6, to_local, m_lat,
        m_lon, keep=lambda r: ((r.get("class") or "") in GREEN
                               or (r.get("subtype") or "") in GREEN))
    if green:
        g = rasterise(green, size, span)
        mask[:, :, 2] = np.maximum(mask[:, :, 2], np.clip(g, 0, 1))
        print(f"  green: {len(green)} polygons")

    # ── The road channel: hardstanding, as the ground shader reads it.
    #
    # Two things go in it and they are the same thing at two scales. The street
    # network is burned in at each road's real width, which puts the actual plan
    # of the place on the ground — and it keeps going out past where the 3D
    # carriageways stop, so the map does not end in a ring of bare field. Under
    # that, at a third of the strength, goes every parcel that is built on
    # rather than grown on, which is what stops a city reading as a scattering
    # of houses in a meadow.
    if roads and roads.get("edges"):
        widths = {"avenue": 22.0, "street": 15.0, "mews": 9.0}
        lines = [[(p[0], p[1]) for p in e["pts"]] for e in roads["edges"]]
        w = rasterise_lines(lines, size, span,
                            [widths.get(e["cls"], 12.0) for e in roads["edges"]])
        mask[:, :, 1] = np.maximum(mask[:, :, 1], blur(w, 1))

    built = collect_polys(
        sink, "base", "land_use", lat0, lon0, span * 1.6, to_local, m_lat, m_lon,
        keep=lambda r: ((r.get("class") or "") in BUILT
                        or (r.get("subtype") or "") in BUILT))
    if built:
        b = np.clip(rasterise(built, size, span), 0, 1) * 0.34
        mask[:, :, 1] = np.maximum(mask[:, :, 1], b)
        print(f"  built-up: {len(built)} parcels")

    # Nothing is paved out in the water, and greenery under tarmac is tarmac.
    mask[:, :, 1] *= (1.0 - mask[:, :, 0])
    mask[:, :, 2] *= (1.0 - mask[:, :, 0])
    mask[:, :, 2] *= (1.0 - np.clip(mask[:, :, 1] * 1.6, 0, 1))
    Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8)).save(mpath)

    # Rewrite the heightmap on its own scale, and tell the level's meta about
    # it: the PNG is normalised to the level's own min and max, so moving the
    # floor moves every other number in the file.
    nlo, nhi = float(height.min()), float(height.max())
    norm = (height - nlo) / max(nhi - nlo, 1.0)
    q = np.clip(np.round(norm * 65535.0), 0, 65535).astype(np.uint32)
    rgb = np.zeros((size, size, 3), dtype=np.uint8)
    rgb[:, :, 0] = (q >> 8).astype(np.uint8)
    rgb[:, :, 1] = (q & 0xFF).astype(np.uint8)
    Image.fromarray(rgb).save(hpath)
    meta["minElevation"] = round(nlo, 3)
    meta["maxElevation"] = round(nhi, 3)
    # Tell the loader the shoreline is surveyed. It has a repair pass for a
    # hand-drawn river that disagrees with the DEM — which is every river that
    # was typed in as two coordinates and a width — and that pass re-derives
    # the water from the elevation range and closes it over a hundred and
    # twenty metres. Run against a real coastline it does not repair anything:
    # it floods the map back up, and at Sydney it swallowed Bennelong Point and
    # put the Opera House three metres under the harbour.
    meta["coastline"] = "surveyed" if water else "typed"
    meta["source"] = (meta.get("source", "") + "; water and land cover from "
                      "Overture Maps Foundation").lstrip("; ")
    (TERRAIN_DIR / f"{level_id}.json").write_text(json.dumps(meta, indent=2))
    print(f"  wrote {mpath.name}, {hpath.name} ({nlo:.0f}..{nhi:.0f} m)")


def verify(level_id, span, meta):
    """Check the bake against itself before anyone looks at it.

    Two of the worst hours of this project went on faults that every diagnostic
    agreed with, because every diagnostic read the same wrong array. The mask
    rasteriser had its vertical axis flipped against the heightmap's: the
    coastline still looked like a coastline, the water was still the right
    shape, the Opera House's own pixel was still dry — it was simply somebody
    else's coastline, checked against a heightmap that was the right way up. It
    took a re-bake, a render and a suite to see it, several times over.

    These are the questions that would have answered it in twenty seconds, and
    they are all about the *relationship* between files rather than about any
    one of them. The last is the one that actually catches a flip, and the
    reason is worth keeping: the dredge follows the mask, so a flipped mask
    produces a heightmap dredged in the same flipped places, and the two agree
    with each other perfectly. Only a third source settles it, and that is the
    buildings — which come from the survey and know nothing about either. Put
    the bug back and it reports two hundred and eighty-eight of five hundred and
    ninety-four buildings standing in the harbour.
    """
    mpath = TERRAIN_DIR / f"{level_id}_mask.png"
    hpath = TERRAIN_DIR / f"{level_id}_height.png"
    if not mpath.exists() or not hpath.exists():
        return
    mask = np.asarray(Image.open(mpath).convert("RGB"), dtype=np.float64) / 255.0
    hi = np.asarray(Image.open(hpath).convert("RGB"), dtype=np.float64)
    lo, up = meta["minElevation"], meta["maxElevation"]
    height = (hi[:, :, 0] * 256 + hi[:, :, 1]) / 65535.0 * (up - lo) + lo
    wet = mask[:, :, 0] > 0.5
    size = mask.shape[0]
    bad = []

    # 1. The monument is not in the water. It is the one pixel every level
    #    depends on, and it is invariant under a vertical flip, so it is the
    #    weakest of these and still worth asking.
    if wet[size // 2, size // 2]:
        bad.append("the level's own origin is under water")

    if wet.any() and (~wet).any():
        # 2. The mask and the heightmap agree about which way up they are.
        #    Water is low ground; a flip makes the wet half of the map the high
        #    half, and this is the check that catches it.
        wet_mean = float(height[wet].mean())
        dry_mean = float(height[~wet].mean())
        if wet_mean >= dry_mean:
            bad.append(f"water averages {wet_mean:.1f} m and land {dry_mean:.1f} m "
                       "— the mask and the heightmap disagree about which way up "
                       "they are")
        # 3. And nothing wet stands above its own water surface.
        surf = meta.get("waterSurface")
        if surf is not None:
            above = float((height[wet] > surf + 1.0).mean())
            if above > 0.02:
                bad.append(f"{above * 100:.0f}% of the water is above its own "
                           "surface")

    # 4. Where the survey says buildings are is where the mask says land is.
    #    A flip puts nine tenths of the city in the river.
    path = CITY_DIR / f"{level_id}.json"
    if path.exists():
        city = json.loads(path.read_text())
        k = (size - 1) / (span * 2)
        drowned = tried = 0
        for b in city.get("buildings", []):
            pts = b["pts"]
            cx = sum(q[0] for q in pts) / len(pts)
            cz = sum(q[1] for q in pts) / len(pts)
            if abs(cx) > span or abs(cz) > span:
                continue
            tried += 1
            if wet[int((span - cz) * k), int((cx + span) * k)]:
                drowned += 1
        if tried > 50 and drowned / tried > 0.25:
            bad.append(f"{drowned} of {tried} surveyed buildings stand in the "
                       "water")

    for line in bad:
        print(f"  !! {line}")
    return not bad


def bake(level_id):
    cfg = LEVELS[level_id]
    lat0, lon0, span = cfg["lat"], cfg["lon"], cfg["span"]
    sink = s3fs()

    # The water first, because whether there is a real shoreline decides how
    # the ground under it is cut.
    water = water_polys(sink, lat0, lon0, span)
    cover = float(np.clip(rasterise(water, 512, span), 0, 1).mean()) if water else 0.0
    natural = cover > 0.012
    print(f"  water: {len(water)} polygons, {cover * 100:.1f}% of the map"
          + ("" if natural else " — too little to trust; keeping the typed channel"))

    # Re-cut the DEM. The mask pass dredges the heightmap under real water, and
    # dredging an already-dredged map digs the same channel twice; starting
    # from the raw terrain every time keeps this re-runnable.
    bake_terrain.bake(level_id, natural_water=natural)
    roads = bake_roads(sink, level_id, lat0, lon0, span)
    bake_buildings(sink, level_id, cfg, lat0, lon0, span, roads)
    far = bake_far_water(sink, level_id, lat0, lon0, span)
    mpath = TERRAIN_DIR / f"{level_id}.json"
    if mpath.exists():
        bake_mask(sink, level_id, lat0, lon0, span,
                  json.loads(mpath.read_text()), water if natural else [], roads,
                  cut_peak="peak" in cfg)
        meta = json.loads(mpath.read_text())
        meta["farSpan"] = span * FAR
        meta["farWater"] = round(far, 4)
        mpath.write_text(json.dumps(meta, indent=2))
        verify(level_id, span, meta)
    else:
        print("  (no terrain meta — run bake_terrain.py first)")


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--fresh" in args:
        USE_CACHE = False
    targets = list(LEVELS) if "--all" in args else [a for a in args if a in LEVELS]
    if not targets:
        print("usage: bake_overture.py <level>... | --all  [--fresh]")
        raise SystemExit(2)
    for t in targets:
        bake(t)
