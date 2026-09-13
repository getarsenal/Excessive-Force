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
}


def deg2tile(lat: float, lon: float, z: float) -> tuple[float, float]:
    n = 2.0**z
    rad = math.radians(lat)
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(rad) + 1.0 / math.cos(rad)) / math.pi) / 2.0 * n
    return x, y


def fetch_tile(z: int, x: int, y: int) -> np.ndarray:
    url = TILE_URL.format(z=z, x=x, y=y)
    for attempt in range(4):
        try:
            raw = urllib.request.urlopen(url, timeout=40).read()
            img = Image.open(io.BytesIO(raw)).convert("RGB")
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


def bake(level_id: str):
    cfg = LEVELS[level_id]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Baking {level_id}: {cfg['name']}")

    elev, mpp = build_mosaic(cfg["lat"], cfg["lon"], cfg["span"], cfg["zoom"])
    print(f"  raw DEM {elev.shape}, {elev.min():.1f}..{elev.max():.1f} m")

    size = 512
    height = resample(elev, size)
    height = smooth(height, passes=3)

    sea = float(np.percentile(height, 5))
    mask = np.zeros((size, size, 3))

    if "river" in cfg:
        height = carve_river(height, mask, cfg["river"], cfg["span"], sea)

    # Parkland (St James's / Victoria Tower Gardens) — a soft blob west and
    # south of the tower so the ground shader has something to vary on.
    gx = np.linspace(-cfg["span"], cfg["span"], size)[None, :]
    gy = np.linspace(cfg["span"], -cfg["span"], size)[:, None]
    for ox, oy, r in [(-620, 260, 330), (-120, -330, 150)]:
        d = np.hypot(np.broadcast_to(gx, (size, size)) - ox,
                     np.broadcast_to(gy, (size, size)) - oy)
        mask[:, :, 2] = np.maximum(mask[:, :, 2], np.clip(1.0 - d / r, 0.0, 1.0))
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
