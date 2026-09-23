#!/usr/bin/env python3
"""Bake a real-world DEM into the heightmap + water mask a level loads at runtime.

Elevation comes from the public AWS "Terrarium" terrain tiles (Mapzen/Tilezen
dataset, no API key). Each tile encodes metres above sea level as
    elevation = R * 256 + G + B / 256 - 32768

The game wants two 16-bit-ish PNGs per level:
  <level>_height.png  elevation, rescaled to the level's own min/max
  <level>_mask.png    R = water, G = road/hardstanding, B = parkland

Usage:  python3 tools/bake_terrain.py westminster
"""

from __future__ import annotations

import io
import os
import json
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "terrain"

# Each level names a real place. `span` is the half-width of the playfield in
# metres; the game's world units are metres, 1:1.
LEVELS = {
    "westminster": {
        "name": "Westminster, London",
        "lat": 51.50072,
        "lon": -0.12462,
        "span": 900.0,
        "zoom": 14,
        # The Thames as it runs past the Palace of Westminster, heading NNE.
        # Points are (metres east, metres north) from the Elizabeth Tower.
        # Closest approach is ~200 m, which keeps the carved channel clear of
        # the tower's foundations and the palace wing — the real tower sits
        # about that far back from the centre of the river.
        "river": {
            "width": 250.0,
            "points": [
                [60, -880], [110, -620], [150, -430], [180, -230],
                [200, -20], [210, 190], [205, 400], [180, 620], [140, 880],
            ],
        },
    },
    "agra": {
        "name": "Taj Mahal, Agra",
        "lat": 27.17510,
        "lon": 78.04214,
        "span": 900.0,
        "zoom": 14,
        # The Yamuna runs immediately behind the mausoleum. Held ~260 m north
        # so the carved channel clears the plinth's foundations; the real bank
        # is closer, but the game needs the ground under the monument intact.
        "river": {
            "width": 200.0,
            "points": [
                [-900, 215], [-520, 245], [-160, 275], [200, 285],
                [560, 255], [900, 205],
            ],
        },
        # The charbagh garden south of the mausoleum, and the forecourt.
        "parks": [[0, -340, 300], [-260, -300, 170], [260, -300, 170]],
    },
    "paris": {
        "name": "Eiffel Tower, Paris",
        "lat": 48.85826,
        "lon": 2.29450,
        "span": 900.0,
        "zoom": 14,
        # The Seine runs past the tower's north-east foot, curving away to the
        # south-west. Held ~200 m out so the carved channel clears the piers:
        # the real Pont d'Iena is right at the foot of the tower, which would
        # put the river through the north leg's foundations.
        "river": {
            "width": 190.0,
            "points": [
                [-900, 470], [-560, 360], [-300, 290], [-40, 235],
                [230, 215], [500, 250], [760, 350], [900, 430],
            ],
        },
        # The Champ de Mars running south-east from the tower, and the
        # Trocadero gardens across the water to the north.
        "parks": [
            [40, -300, 330], [20, -560, 260], [-90, 400, 170],
        ],
    },
    # ── Chichén Itzá: El Castillo on the flat limestone shelf of the northern
    # Yucatán. No river within forty kilometres and no relief worth the name —
    # the whole peninsula is a raised reef — so the ground here is jungle and
    # the pyramid is the only thing on the skyline.
    "chichen": {
        "name": "El Castillo, Chichén Itzá",
        "lat": 20.68285,
        "lon": -88.56867,
        "span": 800.0,
        "zoom": 14,
        "parks": [[0, 0, 900], [420, 300, 380], [-380, -260, 340]],
        # The DEM has the pyramid as a low bump; the game builds its own.
        "flatten": [[0, 0, 90, 46]],
    },
    # ── Sydney: Bennelong Point, with the harbour on three sides of it. The
    # first level whose water is not a river, and the reason `flood_sea`
    # exists — the shoreline here is a shape, not a line.
    "sydney": {
        "name": "Sydney Opera House, Sydney",
        "lat": -33.85681,
        "lon": 151.21526,
        "span": 850.0,
        # The DEM here is a surface model over a city: see `ceiling`.
        "ceiling": 42.0,
        # One zoom finer than everywhere else. Bennelong Point is a hundred
        # metres across and at z14 that is twelve DEM pixels, most of which the
        # smoothing pass hands to the harbour — the point simply is not there.
        "zoom": 15,
        # The waterline sits just under the quay, and the shore band is narrow:
        # widen it and the flood walks up the peninsula it is supposed to be
        # going round.
        "sea": {"level": 0.6, "depth": 10.0, "shore": 1.2},
        # The Royal Botanic Garden, which is the only ground east of the point
        # and therefore most of the map a battery can stand on.
        "parks": [[330, -150, 380], [180, -420, 260]],
        # The podium, at its real height above the harbour, and the shape of
        # the podium — the Opera House covers essentially the whole of
        # Bennelong Point, so the pad and the building are the same rectangle.
        "flatten": [[0, -6, [62, 90], 24, 4.2]],
    },
    # ── Pisa: the Field of Miracles, outside the north wall of the old city.
    # The Arno is a kilometre south, well off a map this size, so there is no
    # water here at all.
    "pisa": {
        "name": "Leaning Tower, Pisa",
        "lat": 43.72304,
        "lon": 10.39664,
        "span": 700.0,
        "zoom": 14,
        "parks": [[-40, 20, 180], [-260, 120, 130]],
        "flatten": [[0, 0, 95, 50]],
    },
    # ── Moscow: Red Square, with the Moskva running past the south end of it.
    "moscow": {
        "name": "Saint Basil's Cathedral, Moscow",
        "lat": 55.75250,
        "lon": 37.62310,
        "span": 850.0,
        "zoom": 14,
        # The river bends east-north-east past the Kremlin's south wall. Held
        # ~300 m clear of the cathedral's own footings.
        "river": {
            "width": 200.0,
            "points": [
                [-840, -470], [-560, -430], [-300, -370], [-60, -320],
                [200, -300], [460, -330], [700, -420], [840, -500],
            ],
        },
        "parks": [[-330, 120, 200], [-520, 380, 240]],
        "flatten": [[0, 0, 85, 48]],
    },
    # ── Rio: the summit of Corcovado, seven hundred metres up. The most relief
    # of any level by a factor of ten, and the whole problem of the map.
    "rio": {
        "name": "Christ the Redeemer, Rio de Janeiro",
        "lat": -22.95186,
        "lon": -43.21054,
        "span": 800.0,
        # One zoom finer, because the whole level is one peak and at z14 the
        # Corcovado arrives as a broad hill with its top rounded off.
        "zoom": 15,
        # Tijuca forest on every side, because that is what is down there.
        "parks": [[0, 0, 1000], [-400, -400, 400], [420, 380, 400]],
        # The summit, cut the way a summit of bedded rock actually weathers:
        # a platform for the statue and three benches of level ground below
        # it, each one a firing step. See `cut_peak` for why this is a
        # landform and a level design at the same time.
        "peak": {
            "height": 700.0,
            "top": 66.0,
            "slope": 1.6,
            # Wide benches, and wide on purpose. A shelf is a firing step and
            # a gun needs level ground under the trail, so each one has to be
            # deep enough that a battery placed anywhere on it stands square —
            # and deep enough that the wobble cannot drop a position into the
            # face between two of them.
            "shelves": [
                [96.0, 40.0],
                [152.0, 62.0],
                [246.0, 70.0],
            ],
            "fade": 70.0,
        },
    },
    # ── The third five. Each a new nation and a new structural problem; see
    # docs/NEW_MAP_PLAYBOOK.md §0.
    # Athens: the Parthenon on the Acropolis rock, a limestone table seventy
    # metres over the city. The pad is the plateau at its real height — the
    # ring round a hilltop is the slope, and a median-levelled pad would have
    # cut the rock down to it.
    "athens": {
        "name": "Parthenon, Athens",
        "lat": 37.97153,
        "lon": 23.72661,
        "span": 800.0,
        "zoom": 15,
        "parks": [[-260, -140, 250], [-40, 220, 160]],
        # Wide enough that the whole stylobate — two hundred and eight metres
        # long, built — stands on the flat: with the pad centred forty metres
        # west, the east end was on the feather and the ground there rose into
        # the paving.
        "flatten": [[-12, 6, [158, 72], 22, 156.0]],
    },
    # Istanbul: Hagia Sophia on the first hill of the old city, the Marmara
    # to the south and the Golden Horn to the north. A coast, so `sea`.
    "istanbul": {
        "name": "Hagia Sophia, Istanbul",
        "lat": 41.00858,
        "lon": 28.98006,
        "span": 900.0,
        "zoom": 15,
        "sea": {"level": 0.6, "depth": 10.0, "shore": 1.2},
        "parks": [[360, 260, 230], [-160, -60, 120]],
        "flatten": [[0, 0, [72, 62], 30]],
    },
    # Cologne: the cathedral two hundred and fifty metres from the left bank
    # of the Rhine, which runs north past it, three hundred and forty metres
    # wide. The polyline is a hint; the survey's water corrects it.
    "cologne": {
        "name": "Cologne Cathedral, Cologne",
        "lat": 50.94130,
        "lon": 6.95828,
        "span": 900.0,
        "zoom": 14,
        "river": {
            "width": 340.0,
            "points": [[520, -900], [470, -500], [435, -100], [425, 300], [445, 700], [485, 900]],
        },
        "parks": [[760, 420, 260]],
        # The level's origin is the south tower, not the plan's centre (see
        # the builder for why), so the pad is centred on the plan: sixty-four
        # metres east and twenty-one north of the origin, in the game's frame.
        "flatten": [[64, 21, [82, 52], 30]],
    },
    # Himeji: the keep on Himeyama, a forty-five metre hill in the plain, at
    # its real height so the stone base the builder lays has a hilltop to
    # stand on.
    "himeji": {
        "name": "Himeji Castle, Himeji",
        "lat": 34.83942,
        "lon": 134.69392,
        "span": 800.0,
        "zoom": 15,
        "parks": [[0, -80, 330]],
        "flatten": [[0, 0, 62, 26, 46.0]],
    },
    # Dubai: the Burj Khalifa in a city the DEM sees as roofs — `ceiling`
    # flattens the towers the surface model brought with it — with its lake
    # from the survey and the Gulf three kilometres off, in the far water.
    # Kuala Lumpur: the Petronas Towers in a city the DEM sees as roofs, with
    # KLCC park at their feet. No river on the map — the Klang is a kilometre
    # and a half west — and the Straits are far enough out to be skyline.
    "petronas": {
        "name": "Petronas Towers, Kuala Lumpur",
        "lat": 3.15785,
        "lon": 101.71165,
        "span": 900.0,
        # z15: a hundred-metre footprint is twelve pixels at z14, and most of
        # those get smoothed into the streets around it.
        "zoom": 15,
        # The surface model over the Golden Triangle is a forest of towers.
        "ceiling": 62.0,
        # KLCC park, which really is a twenty-hectare wood south-east of the
        # podium, and the lake in it.
        "parks": [[120, -210, 240], [180, -300, 90]],
        "flatten": [[0, 0, [130, 100], 44]],
    },
    # Lhasa: the Potala on Marpo Ri, which is the level. The hill is cut as a
    # landform with firing shelves, the way the Corcovado is, because a summit
    # at DEM resolution is a rounded lump and a palace on it has nowhere for a
    # gun to stand. Wider map than the rest: the palace alone is four hundred
    # metres end to end and the mountain it stands on has to have room around
    # it or the level is a plinth in a box.
    "potala": {
        "name": "Potala Palace, Lhasa",
        "lat": 29.65775,
        "lon": 91.11722,
        "span": 1150.0,
        "zoom": 14,
        # The Kyi Chu is a kilometre south of the hill and runs off the map;
        # the valley floor it braids across is the flat the batteries stand on.
        "parks": [[-520, 240, 260], [560, 180, 220]],
        "peak": {
            # Marpo Ri's summit, in metres above sea level. The valley floor
            # around Lhasa is about thirty-six fifty, so this is the hundred
            # and thirty metres of red rock the palace is famous for standing
            # on and not a metre more.
            "height": 3782.0,
            # A mesa, not a cone: the palace is four hundred metres end to end
            # and the top has to carry it with terraces to spare.
            "top": 250.0,
            "slope": 1.5,
            # Three benches, each one a firing step, and wide enough that a
            # battery put anywhere on one stands square. The last reaches out
            # past four hundred metres so the guns the suite spawns at two
            # hundred and twenty have level ground under the trail.
            "shelves": [
                [286.0, 62.0],
                [372.0, 78.0],
                [470.0, 86.0],
            ],
            "fade": 100.0,
        },
    },
    "dubai": {
        "name": "Burj Khalifa, Dubai",
        "lat": 25.19717,
        "lon": 55.27437,
        "span": 900.0,
        "zoom": 15,
        "ceiling": 14.0,
        "parks": [[-160, -110, 210]],
        "flatten": [[0, 0, [110, 110], 40]],
    },
    "giza": {
        "name": "Great Pyramids, Giza",
        "lat": 29.97918,
        "lon": 31.13417,
        "span": 900.0,
        "zoom": 14,
        # No river: the Nile is nine kilometres east of the plateau, well off
        # the map. Giza is desert, and a level with no water is a level whose
        # water sheet is simply never built.
        "parks": [],
        # The elevation data already contains the pyramids.
        #
        # At this zoom Khufu arrives as a fifty-four metre bump in the ground,
        # because a terrain tile does not distinguish a mountain from four
        # million tonnes of limestone stacked on a plateau. Building the game's
        # own pyramid on top of that would stand it on a pyramid-shaped hill.
        # Each pad is levelled to the median height of the ring just outside
        # it, so the monuments sit on flat ground and the plateau still falls
        # away to the Nile the way it really does.
        # [east, north, pad radius, feather]
        "flatten": [
            [0, 0, 150, 90],          # Khufu
            [-350, -350, 140, 90],    # Khafre
            [-540, -600, 95, 70],     # Menkaure
            [350, -350, 80, 60],      # the Sphinx enclosure
        ],
    },
}


def deg2tile(lat: float, lon: float, z: float) -> tuple[float, float]:
    n = 2.0**z
    rad = math.radians(lat)
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(rad) + 1.0 / math.cos(rad)) / math.pi) / 2.0 * n
    return x, y


# Where the fetched tiles are kept between runs.
#
# Terrarium's tiles are immutable — a z14 tile of Westminster is the same
# quarter of a megabyte every time — and a nine-level bake pulls about fifty of
# them. Re-fetching on every run is a minute per level of waiting for bytes
# that have not changed since 2016, and a bake gets re-run every time anything
# in the mask or the dredge is adjusted. Outside the repo, because it is a
# cache: deleting it costs one slow bake and nothing else.
TILE_CACHE = Path(os.environ.get("TT_TILE_CACHE", "/tmp/tt-tiles"))


def fetch_tile(z: int, x: int, y: int) -> np.ndarray:
    cached = TILE_CACHE / f"{z}_{x}_{y}.png"
    if cached.exists():
        try:
            return np.asarray(Image.open(cached).convert("RGB")).astype(np.float64)
        except Exception:
            cached.unlink(missing_ok=True)
    url = TILE_URL.format(z=z, x=x, y=y)
    for attempt in range(4):
        try:
            raw = urllib.request.urlopen(url, timeout=40).read()
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            TILE_CACHE.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(raw)
            return np.asarray(img).astype(np.float64)
        except Exception:
            if attempt == 3:
                print(f"  ! tile {z}/{x}/{y} unavailable, treating as sea level")
                return np.full((256, 256, 3), [128.0, 0.0, 0.0])
    raise AssertionError("unreachable")


def build_mosaic(lat: float, lon: float, span: float, zoom: int):
    """Stitch enough tiles to cover +/-span metres, return (elevation, extent)."""
    # Metres per pixel at this latitude/zoom for a 256px tile.
    mpp = 156543.03392 * math.cos(math.radians(lat)) / (2**zoom)
    px_needed = span / mpp
    cx, cy = deg2tile(lat, lon, zoom)

    tx0, tx1 = math.floor(cx - px_needed / 256), math.floor(cx + px_needed / 256)
    ty0, ty1 = math.floor(cy - px_needed / 256), math.floor(cy + px_needed / 256)
    coords = [(x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    print(f"  fetching {len(coords)} tiles at z{zoom} ({mpp:.2f} m/px)")

    with ThreadPoolExecutor(max_workers=8) as pool:
        tiles = list(pool.map(lambda c: fetch_tile(zoom, c[0], c[1]), coords))

    w, h = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    mosaic = np.zeros((h, w, 3))
    for (x, y), tile in zip(coords, tiles):
        px, py = (x - tx0) * 256, (y - ty0) * 256
        mosaic[py:py + 256, px:px + 256] = tile

    elev = mosaic[:, :, 0] * 256.0 + mosaic[:, :, 1] + mosaic[:, :, 2] / 256.0 - 32768.0

    # Crop to exactly the square we want, centred on the landmark.
    ccx, ccy = (cx - tx0) * 256.0, (cy - ty0) * 256.0
    half = px_needed
    x0, x1 = int(round(ccx - half)), int(round(ccx + half))
    y0, y1 = int(round(ccy - half)), int(round(ccy + half))
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    return elev[y0:y1, x0:x1], mpp


def resample(arr: np.ndarray, size: int) -> np.ndarray:
    """Bilinear resample to size x size without pulling in scipy."""
    src_h, src_w = arr.shape
    ys = np.linspace(0, src_h - 1, size)
    xs = np.linspace(0, src_w - 1, size)
    y0 = np.floor(ys).astype(int); y1 = np.minimum(y0 + 1, src_h - 1)
    x0 = np.floor(xs).astype(int); x1 = np.minimum(x0 + 1, src_w - 1)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    top = arr[np.ix_(y0, x0)] * (1 - fx) + arr[np.ix_(y0, x1)] * fx
    bot = arr[np.ix_(y1, x0)] * (1 - fx) + arr[np.ix_(y1, x1)] * fx
    return top * (1 - fy) + bot * fy


def smooth(arr: np.ndarray, passes: int = 2) -> np.ndarray:
    """Cheap separable box blur — the DEM is stair-stepped at this resolution."""
    out = arr.copy()
    for _ in range(passes):
        p = np.pad(out, 1, mode="edge")
        out = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * out) / 8.0
    return out


def flood_sea(height: np.ndarray, mask: np.ndarray, sea: dict):
    """Mark open water from the DEM itself, for coastal maps.

    A river is a line and is carved from a polyline. A harbour is not a line —
    Bennelong Point has water on three sides of it and the shore is a shape
    nobody is going to type in as a list of points. The DEM already knows where
    it is: Tilezen fills water flat at its own surface level, so everything at
    or below the waterline is sea and everything above it is land, and the
    coastline comes out of the tiles at the resolution the tiles have.

    The channel is then dredged the same way a river is, because a harbour that
    is flat at the shoreline is a car park: shells that fall in have to splash,
    and the water shader wants something under it.
    """
    level = float(sea.get("level", 1.5))
    depth = float(sea.get("depth", 9.0))
    shore = float(sea.get("shore", 2.5))
    wet = np.clip((level + shore - height) / max(0.5, shore * 2.0), 0.0, 1.0)
    mask[:, :, 0] = np.maximum(mask[:, :, 0], wet)
    # Down to a bed, deepest where the water is widest.
    return height - wet * depth


def cut_peak(height: np.ndarray, peak: dict, span: float) -> np.ndarray:
    """Carve a real mountain with ledges you can stand a gun on.

    The problem this solves is not scenery, it is that a landmark on a summit
    is unplayable on the summit's real shape. Cut the Corcovado to its true
    platform and the nearest ground a battery can stand on is a hundred and
    seventy metres below the statue with a sixty-degree face between the two;
    flatten enough of it for the guns and the most famous mountain in Brazil
    is a lawn. Neither is the building.

    So the mountain keeps its height and its slope, and has terraces cut into
    it: a flat summit platform, and rings of level shelf below it, each one a
    firing step. That is a real landform — a peak of bedded rock weathers into
    exactly these benches — and it is the level's structure as well, because
    the fight is up the shelves and every one is closer than the last.

    The profile is built as a descent budget. `g` is how far a point has come
    down the slope; a shelf freezes it for the width of the shelf and then
    hands it back, so the ground falls at `slope` between shelves and is dead
    level on them. The radii are wobbled by bearing so the benches wander in
    and out the way weathered rock does rather than reading as a wedding cake.
    """
    size = height.shape[0]
    gx = np.linspace(-span, span, size)[None, :]
    gy = np.linspace(span, -span, size)[:, None]
    px = np.broadcast_to(gx, (size, size))
    py = np.broadcast_to(gy, (size, size))

    ox, oy = peak.get("at", (0.0, 0.0))
    dx, dy = px - ox, py - oy
    d = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)

    wob = 1.0
    for amp, freq, phase in peak.get("wobble", [(0.10, 3, 1.1), (0.055, 7, 0.4)]):
        wob = wob + amp * np.sin(freq * th + phase)
    dd = d * wob

    summit = float(peak["height"])
    top = float(peak["top"])
    slope = float(peak.get("slope", 1.2))

    g = np.maximum(0.0, dd - top)
    last = top
    for shelf in peak.get("shelves", []):
        r_in, width = float(shelf[0]), float(shelf[1])
        arc = shelf[2] if len(shelf) > 2 else None
        r_out = r_in + width
        inarc = np.ones_like(d, dtype=bool)
        if arc is not None:
            a0, a1 = [math.radians(v) for v in arc]
            rel = np.mod(th - a0, 2 * math.pi)
            inarc = rel <= np.mod(a1 - a0, 2 * math.pi)
        on = (dd >= r_in) & (dd < r_out) & inarc
        past = (dd >= r_out) & inarc
        g = np.where(on, g - (dd - r_in), g)
        g = np.where(past, g - width, g)
        last = r_out

    peaked = summit - slope * np.maximum(g, 0.0)

    # Back to the real ground beyond the last bench.
    fade = float(peak.get("fade", 60.0))
    t = np.clip((last + fade - dd) / max(fade, 1e-3), 0.0, 1.0)
    k = t * t * (3.0 - 2.0 * t)
    out = peaked * k + height * (1.0 - k)
    print(f"  cut a peak at ({ox}, {oy}) to {summit:.0f} m "
          f"with {len(peak.get('shelves', []))} shelves out to {last:.0f} m")
    return out


def carve_river(height: np.ndarray, mask: np.ndarray, river: dict, span: float, sea: float):
    """Cut the river channel into the DEM and write the water mask.

    Tilezen's DEM fills water bodies to their shoreline level, so the Thames
    arrives as a flat ribbon at the same height as the embankment. We carve it
    back out so the river reads as a river and shells that fall in splash.
    """
    size = height.shape[0]
    pts = np.array(river["points"], dtype=np.float64)
    half_w = river["width"] / 2.0

    # World metres -> pixel space. +north is -row.
    gx = np.linspace(-span, span, size)[None, :]
    gy = np.linspace(span, -span, size)[:, None]
    px = np.broadcast_to(gx, (size, size))
    py = np.broadcast_to(gy, (size, size))

    dist = np.full((size, size), 1e9)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        seg_len2 = float(ab @ ab)
        if seg_len2 < 1e-6:
            continue
        t = ((px - a[0]) * ab[0] + (py - a[1]) * ab[1]) / seg_len2
        t = np.clip(t, 0.0, 1.0)
        cx = a[0] + t * ab[0]
        cy = a[1] + t * ab[1]
        dist = np.minimum(dist, np.hypot(px - cx, py - cy))

    # Channel profile: flat bed in the middle, banks sloping up over 40 m.
    bank = 40.0
    channel = np.clip((half_w - dist) / bank, 0.0, 1.0)
    depth = 7.0 * channel ** 0.7
    height -= depth

    water = np.clip((half_w + 6.0 - dist) / 12.0, 0.0, 1.0)
    mask[:, :, 0] = np.maximum(mask[:, :, 0], water)
    return height


def flatten_pads(height: np.ndarray, pads: list, span: float) -> np.ndarray:
    """Level a disc of ground to the median height of the ring around it.

    Used where the DEM already contains the thing the game is about to build.
    Levelling to the surrounding median rather than to a hand-picked number
    means the pad matches whatever the real ground does there, and the feather
    blends it back out so the result is a terrace rather than a plug.
    """
    size = height.shape[0]
    gx = np.linspace(-span, span, size)[None, :]
    gy = np.linspace(span, -span, size)[:, None]
    px = np.broadcast_to(gx, (size, size))
    py = np.broadcast_to(gy, (size, size))
    for pad in pads:
        ox, oy, r, feather = pad[:4]
        fixed = pad[4] if len(pad) > 4 else None
        if isinstance(r, (list, tuple)):
            # A rounded rectangle, for a pad that has to match a rectangular
            # building on a peninsula. A disc big enough to reach the corners
            # of the Opera House's podium reclaims fifty metres of harbour down
            # both sides of Bennelong Point; a disc small enough not to leaves
            # the corners under water.
            rx, ry = float(r[0]), float(r[1])
            d = np.hypot(np.maximum(np.abs(px - ox) - rx, 0.0),
                         np.maximum(np.abs(py - oy) - ry, 0.0))
            r = 0.0
        else:
            d = np.hypot(px - ox, py - oy)
        ring = (d > r) & (d < r + feather * 1.4)
        if not ring.any():
            continue
        # The ring's median is the right target on dry sites and the wrong one
        # on a peninsula: at Bennelong Point the ring is nine tenths harbour,
        # so levelling to it dropped the whole of the Opera House's ground to
        # eight metres under water. A pad with water round it states its own
        # height instead.
        target = float(fixed) if fixed is not None else float(np.median(height[ring]))
        t = np.clip((r + feather - d) / max(feather, 1e-3), 0.0, 1.0)
        k = t * t * (3.0 - 2.0 * t)
        height = height * (1.0 - k) + target * k
        print(f"  levelled a {r:.0f} m pad at ({ox}, {oy}) to {target:.1f} m")
    return height


def bake(level_id: str, natural_water: bool = False):
    """Cut the level's heightmap and mask out of the DEM.

    `natural_water` says a real coastline is coming: the hand-typed river or
    sea in the level's config is then left out entirely rather than unioned
    with the surveyed one. Two channels for the same river — one drawn from a
    pair of typed coordinates, one traced off the real bank — make a Thames
    twice as wide as the Thames, with a strip of dry ditch beside it where the
    hand-drawn channel was dug and no water put in it.
    """
    cfg = LEVELS[level_id]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Baking {level_id}: {cfg['name']}")

    elev, mpp = build_mosaic(cfg["lat"], cfg["lon"], cfg["span"], cfg["zoom"])
    print(f"  raw DEM {elev.shape}, {elev.min():.1f}..{elev.max():.1f} m")

    # Throw out the corrupt pixels before anything is measured off them.
    #
    # Terrarium carries occasional junk in water tiles: Sydney Harbour comes
    # back with a handful of samples at -1929 m in water that is three metres
    # deep, and since the height PNG is rescaled to the DEM's own min and max,
    # those few pixels squash the entire level into the top five per cent of
    # the range. A robust window around the 0.2nd and 99.8th percentiles keeps
    # every real feature — Corcovado's own 620 m of relief is untouched by it —
    # and clips anything that could only be a decode error.
    lo = float(np.percentile(elev, 0.2))
    hi = float(np.percentile(elev, 99.8))
    pad = max(20.0, (hi - lo) * 0.25)
    bad = int(np.count_nonzero((elev < lo - pad) | (elev > hi + pad)))
    if bad:
        elev = np.clip(elev, lo - pad, hi + pad)
        print(f"  clipped {bad} outlying samples to {lo - pad:.1f}..{hi + pad:.1f} m")

    size = 512
    height = resample(elev, size)

    # A ceiling on the DEM, for a level whose city is in it.
    #
    # Terrarium is a surface model, not a bare-earth one, and at z15 over a
    # central business district it is mostly office blocks: Sydney comes back
    # with ninety-eight metres of "terrain" where the tallest real ground
    # within a kilometre of Bennelong Point is about forty. The game then
    # builds its own city on top of that, which puts roofs level with the
    # hillside they are standing in and makes half of them undeployable.
    # Compressed rather than clipped, so the high ground is still high and is
    # no longer a tower.
    ceiling = cfg.get("ceiling")
    if ceiling is not None:
        over = height > ceiling
        if over.any():
            height = np.where(over, ceiling + (height - ceiling) * 0.12, height)
            print(f"  compressed {int(over.sum())} samples above {ceiling:.0f} m")

    height = smooth(height, passes=3)

    sea = float(np.percentile(height, 5))
    mask = np.zeros((size, size, 3))

    if cfg.get("flatten"):
        height = flatten_pads(height, cfg["flatten"], cfg["span"])

    if "peak" in cfg:
        height = cut_peak(height, cfg["peak"], cfg["span"])

    if "river" in cfg and not natural_water:
        height = carve_river(height, mask, cfg["river"], cfg["span"], sea)

    if "sea" in cfg and not natural_water:
        height = flood_sea(height, mask, cfg["sea"])

    # Parkland (St James's / Victoria Tower Gardens) — a soft blob west and
    # south of the tower so the ground shader has something to vary on.
    gx = np.linspace(-cfg["span"], cfg["span"], size)[None, :]
    gy = np.linspace(cfg["span"], -cfg["span"], size)[:, None]
    for ox, oy, r in cfg.get("parks", [(-620, 260, 330), (-120, -330, 150)]):
        d = np.hypot(np.broadcast_to(gx, (size, size)) - ox,
                     np.broadcast_to(gy, (size, size)) - oy)
        mask[:, :, 2] = np.maximum(mask[:, :, 2], np.clip(1.0 - d / r, 0.0, 1.0))
    # (A green floor under the whole map belongs in the level's palette and not
    # here: the park channel is what tells the city generator a block is a
    # park, so painting it everywhere is not "this ground is green", it is
    # "this town is entirely parkland", and Chichen Itza came back with no
    # buildings in it at all.)
    mask[:, :, 2] *= (1.0 - mask[:, :, 0])

    hmin, hmax = float(height.min()), float(height.max())
    span_m = max(hmax - hmin, 1.0)
    norm = (height - hmin) / span_m

    # 16-bit elevation split across R (high byte) and G (low byte); a flat site
    # like Westminster quantises visibly in 8-bit.
    q = np.clip(np.round(norm * 65535.0), 0, 65535).astype(np.uint32)
    rgb = np.zeros((size, size, 3), dtype=np.uint8)
    rgb[:, :, 0] = (q >> 8).astype(np.uint8)
    rgb[:, :, 1] = (q & 0xFF).astype(np.uint8)
    Image.fromarray(rgb).save(OUT_DIR / f"{level_id}_height.png")
    Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8)).save(
        OUT_DIR / f"{level_id}_mask.png")

    meta = {
        "id": level_id,
        "name": cfg["name"],
        "lat": cfg["lat"],
        "lon": cfg["lon"],
        "spanMeters": cfg["span"],
        "size": size,
        "minElevation": round(hmin, 3),
        "maxElevation": round(hmax, 3),
        "metersPerDemPixel": round(mpp, 4),
        "seaLevel": round(sea, 3),
        "source": "AWS Terrain Tiles (Tilezen/Mapzen terrarium), public domain",
    }
    (OUT_DIR / f"{level_id}.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"  wrote {size}x{size} height ({hmin:.1f}..{hmax:.1f} m) + mask + meta")


if __name__ == "__main__":
    targets = sys.argv[1:] or list(LEVELS)
    for t in targets:
        bake(t)
