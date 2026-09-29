#!/usr/bin/env python3
"""The village and the ramparts of Mont-Saint-Michel, founded on the bake.

    python3 tools/montstmichel_plan.py

Writes src/structure/landmarks/montstmichel_plan.js: every surveyed house of
the village on the rock's south-east benches as a rectangle a gable can go on,
with the height of the ground under it; and the ramparts round the foot of the
rock through the surveyed towers, each stretch carried down to the ground the
bake has under it and up to a wall-walk above its own highest ground.

World metres, x east and z south, heights relative to the summit (the abbey's
floor), unscaled: the village and the walls are at the rock's own size, which
is the real one, because they stand on the real rock.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from survey import load_terrain, Ground  # noqa: E402
from shapely.geometry import Polygon, Point, LineString, MultiPoint  # noqa: E402

# The abbey's own buildings are laid by the builder: nothing inside this is a house.
ABBEY_R = 56.0
VILLAGE_R = 140.0
# The ramparts, through the surveyed towers, west to north-east round the south.
TOWERS = [
    ("Tour Gabriel", -114.0, 53.0, 7.5),
    ("Corps de Garde des Bourgeois", -2.0, 110.0, 5.0),
    ("Tour de l'Avancée", 7.0, 100.0, 4.5),
    ("Tour de l'Arcade", 61.0, 107.0, 5.0),
    ("Tour Boucle", 118.0, 60.0, 6.0),
    ("Tour Demi-Lune", 131.0, -23.0, 5.5),
    ("Tour du Nord", 72.0, -88.0, 6.5),
]
WALK = 7.0          # the wall-walk over the highest ground a stretch stands on


def main():
    meta, h, w = load_terrain("montstmichel")
    g = Ground(meta, h, w)
    g0 = g.at(0.0, 0.0)
    rel = lambda x, z: g.at(x, z) - g0
    towers = [Point(x, z).buffer(r + 3) for _, x, z, r in TOWERS]

    # The wall runs round the outside of the village: the hull of the houses
    # and the towers, pushed out, from Tour Gabriel round the south and east
    # to the Tour du Nord. Straight lines between the towers cut the Grande
    # Rue off outside its own walls.
    cityb = json.loads((ROOT / "public/assets/city/montstmichel.json").read_text())["buildings"]
    corners = [(x, z) for _, x, z, _ in TOWERS]
    for b in cityb:
        P = Polygon(b["pts"])
        c = P.centroid
        if ABBEY_R <= math.hypot(c.x, c.y) <= VILLAGE_R and P.area >= 30:
            corners += list(P.exterior.coords)
    ring = MultiPoint(corners).convex_hull.buffer(4.0, join_style=2).exterior
    def at_ring(x, z):
        return ring.project(Point(x, z))
    a0, a1 = at_ring(-114.0, 53.0), at_ring(72.0, -88.0)
    L = ring.length
    # The way round that passes the south (positive z): try both and keep it.
    def arc(u0, u1):
        n = 200
        span = (u1 - u0) % L
        return [ring.interpolate((u0 + span * k / n) % L) for k in range(n + 1)]
    fwd, back = arc(a0, a1), arc(a1, a0)[::-1]
    south = lambda pts: sum(p.y for p in pts) / len(pts)
    path = fwd if south(fwd) > south(back) else back
    line = LineString([(p.x, p.y) for p in path])
    wall_band = line.buffer(2.5)

    def outside_wall(x, z):
        # Past the wall on the ray from the summit through this point.
        r = math.hypot(x, z)
        ray = LineString([(0, 0), (x / r * 400, z / r * 400)])
        hit = ray.intersection(line)
        if hit.is_empty:
            return False
        d = min(math.hypot(p.x, p.y) for p in (getattr(hit, 'geoms', None) or [hit]))
        return r > d - 3.0

    city = json.loads((ROOT / "public/assets/city/montstmichel.json").read_text())
    houses = []
    for b in city["buildings"]:
        P = Polygon(b["pts"])
        if not P.is_valid:
            P = P.buffer(0)
        c = P.centroid
        r = math.hypot(c.x, c.y)
        if r < ABBEY_R or r > VILLAGE_R or P.area < 30:
            continue
        if any(t.intersects(P) for t in towers) or wall_band.intersects(P) or outside_wall(c.x, c.y):
            continue
        rect = P.minimum_rotated_rectangle
        xs = list(rect.exterior.coords)[:4]
        e1 = (xs[1][0] - xs[0][0], xs[1][1] - xs[0][1])
        e2 = (xs[2][0] - xs[1][0], xs[2][1] - xs[1][1])
        L1, L2 = math.hypot(*e1), math.hypot(*e2)
        (ex, ez), L, W = (e1, L1, L2) if L1 >= L2 else (e2, L2, L1)
        ux, uz = ex / L, ez / L
        lows, highs = [], []
        for i in range(7):
            for j in range(5):
                s = (i / 6 - 0.5) * (L + 4)
                t = (j / 4 - 0.5) * (W + 4)
                x, z = c.x + ux * s + (-uz) * t, c.y + uz * s + ux * t
                v = rel(x, z)
                lows.append(v)
                if abs(s) <= L / 2 and abs(t) <= W / 2:
                    highs.append(v)
        houses.append({
            "cx": round(c.x, 2), "cz": round(c.y, 2), "len": round(max(L, 5.0), 2), "wid": round(max(W, 4.5), 2),
            "ry": round(math.atan2(ux, uz), 4),
            "h": round(max(6.0, min(b["h"], 14.0)), 1),
            "found": math.floor(min(lows) - 2.0), "grade": round(max(highs or lows), 1),
            "name": b.get("name") or "",
        })
    # Not one house through another: keep the larger of any two that overlap.
    houses.sort(key=lambda o: -o["len"] * o["wid"])
    kept, polys = [], []
    for o in houses:
        ux, uz = math.sin(o["ry"]), math.cos(o["ry"])
        vx, vz = uz, -ux
        corners = [(o["cx"] + ux * s * o["len"] / 2 + vx * t * o["wid"] / 2, o["cz"] + uz * s * o["len"] / 2 + vz * t * o["wid"] / 2)
                   for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        P = Polygon(corners)
        if any(P.buffer(0.3).intersects(q) for q in polys):
            continue
        polys.append(P)
        kept.append(o)

    # The ramparts: stretches of about seven metres between the towers.
    n = max(2, int(line.length / 7.0))
    wall = []
    for i in range(n + 1):
        p = line.interpolate(i / n, normalized=True)
        wall.append({"x": round(p.x, 2), "z": round(p.y, 2), "ground": round(rel(p.x, p.y), 1)})
    stretches = []
    segs = []
    for a, b in zip(wall, wall[1:]):
        samples = [rel(a["x"] + (b["x"] - a["x"]) * k / 4, a["z"] + (b["z"] - a["z"]) * k / 4) for k in range(5)]
        stretches.append({"x0": a["x"], "z0": a["z"], "x1": b["x"], "z1": b["z"],
                          "found": math.floor(min(samples) - 2.5), "top": round(max(samples) + WALK, 1)})
        segs.append(LineString([(a["x"], a["z"]), (b["x"], b["z"])]))
    # A post: a stretch whose fan of fire outward, twenty metres of it, crosses
    # no other stretch, no tower and no house. At a bend a man posted on one
    # stretch looks straight into the next.
    house_polys = []
    for o in kept:
        ux, uz = math.sin(o["ry"]), math.cos(o["ry"])
        house_polys.append(Polygon([(o["cx"] + ux * s2 * o["len"] / 2 + uz * t2 * o["wid"] / 2, o["cz"] + uz * s2 * o["len"] / 2 - ux * t2 * o["wid"] / 2)
                                    for s2, t2 in ((-1, -1), (1, -1), (1, 1), (-1, 1))]))
    tower_discs = [Point(x, z).buffer(r + 1.0) for _, x, z, r in TOWERS]
    for i, st in enumerate(stretches):
        cx, cz = (st["x0"] + st["x1"]) / 2, (st["z0"] + st["z1"]) / 2
        dx, dz = st["x1"] - st["x0"], st["z1"] - st["z0"]
        L = math.hypot(dx, dz); ux, uz = dx / L, dz / L
        out = 1 if (uz * cx - ux * cz) > 0 else -1
        nx, nz = uz * out, -ux * out
        clear = True
        for off in (0.0, 0.4, -0.4, 0.9, -0.9):
            ca, sa = math.cos(off), math.sin(off)
            fx, fz = nx * ca - nz * sa, nx * sa + nz * ca
            ray = LineString([(cx + fx * 1.5, cz + fz * 1.5), (cx + fx * 20, cz + fz * 20)])
            if any(ray.intersects(sg) for j, sg in enumerate(segs) if abs(j - i) > 0) or any(ray.intersects(t) for t in tower_discs) or any(ray.intersects(hp) for hp in house_polys):
                clear = False
                break
        st["post"] = clear
    towers_out = []
    for name, x, z, r in TOWERS:
        ring = [rel(x + math.cos(k * math.pi / 4) * (r + 1), z + math.sin(k * math.pi / 4) * (r + 1)) for k in range(8)] + [rel(x, z)]
        towers_out.append({"name": name, "x": x, "z": z, "r": r, "found": math.floor(min(ring) - 2.5), "top": round(max(ring) + WALK + 5.0, 1)})

    # Where mortars can be dug in on the summit's own ground, west of the church.
    # Sampled the way the game samples, between cells, not at the nearest one.
    def bilinear(x, z):
        n = g.n
        fu = (x + g.span) / (2 * g.span) * (n - 1)
        fv = (g.span - z) / (2 * g.span) * (n - 1)
        u0, v0 = int(math.floor(fu)), int(math.floor(fv))
        du, dv = fu - u0, fv - v0
        hh = lambda u, v: float(g.h[min(max(v, 0), n - 1), min(max(u, 0), n - 1)])
        return (hh(u0, v0) * (1 - du) * (1 - dv) + hh(u0 + 1, v0) * du * (1 - dv)
                + hh(u0, v0 + 1) * (1 - du) * dv + hh(u0 + 1, v0 + 1) * du * dv) - g0
    points = {}
    cands = [(x, z) for x in range(-38, -32, 2) for z in range(-10, 2, 2)]
    flat = sorted(cands, key=lambda p: (-bilinear(*p), abs(p[1])))
    chosen = []
    for x, z in flat:
        if all(math.hypot(x - a, z - b) > 4.5 for a, b in chosen):
            chosen.append((x, z))
        if len(chosen) == 3:
            break
    for k, (x, z) in enumerate(chosen):
        points[f"west{k + 1}"] = {"x": float(x), "z": float(z), "y": round(bilinear(x, z), 2)}
    plan = {"houses": kept, "ramparts": stretches, "towers": towers_out, "points": points}
    out = ROOT / "src/structure/landmarks/montstmichel_plan.js"
    out.write_text("// Generated by tools/montstmichel_plan.py from the survey and the terrain bake.\n"
                   "// Do not edit: change the tool and run it again.\n"
                   "export const PLAN = " + json.dumps(plan, indent=1) + ";\n")
    print(f"{len(kept)} houses (of {len(houses)} surveyed), {len(stretches)} stretches of rampart, {len(towers_out)} towers")
    print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
