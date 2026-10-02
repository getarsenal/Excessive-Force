#!/usr/bin/env python3
"""The plan of Hohensalzburg, founded on the bake.

    python3 tools/hohensalzburg_plan.py

Writes src/structure/landmarks/hohensalzburg_plan.js: every building of the
fortress as the surveyed outline in public/assets/city/hohensalzburg.json
fitted with the smallest rectangle that holds it, at its real place and its
real size; what kind of thing it is and how tall, which is not in the survey
(its heights are a storey or two everywhere); the depth its walls have to be
carried down to meet the ground the bake has under them; the curtain round
the rim of the Festungsberg; and the open courtyards the garrison's mortars
are dug into.

The ground is the bake's crag (see "hohensalzburg" in tools/bake_terrain.py):
the summit cut level at the courtyards' height, the shape of the fortress,
falling away on every side. Re-run after a re-bake of the ground.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from survey import load_terrain, Ground  # noqa: E402

# Surveyed name (or "@x,z" for an unnamed outline near that point), section,
# kind, eaves over the summit (m), roof pitch (degrees; 0 for a flat deck).
#
#   hall     a range: rendered walls, windows on every storey, a tiled roof
#   tower    square, a tall tiled pyramid on it
#   round    round, a cone on it
#   chapel   a hall with a steeper roof and no floors inside
#   gate     a range with a passage through it at ground level
#   bastion  a gun platform on its walls, a breastwork round it
#   wall     a thick wall the survey drew as a building, a walk on top
BUILDINGS = [
    # The Hoher Stock: the prince-archbishops' palace, the tallest block on
    # the rock, and the Kaplanstoeckl and the kitchen ranges against it.
    ("Hoher Stock", "hoherstock", "hall", 25.2, 34),
    ("Kaplanstöckl", "hoherstock", "hall", 16.8, 45),
    ("Pfisterei", "hoherstock", "hall", 12.6, 45),
    ("Schulhaus", "hoherstock", "hall", 12.6, 45),
    ("Kuchlturm", "hoherstock", "tower", 21.0, 0),
    ("Innere Schloßbastei", "hoherstock", "bastion", 8.0, 0),
    ("@7,-34", "hoherstock", "hall", 12.6, 45),
    # The Reckturm, the watchtower on the south rim, and the bell tower.
    ("Reckturm", "reckturm", "tower", 33.0, 0),
    ("Glockenturm", "reckturm", "tower", 25.0, 0),
    # The Hasengraben end, west toward the Scharte: the armoury, the salt
    # store and the dining range on the rim, the towers between them.
    ("Hasengrabenzeughaus", "hasengraben", "hall", 14.0, 45),
    ("Salzmagazin", "hasengraben", "hall", 10.0, 45),
    ("Speisehaus", "hasengraben", "hall", 9.0, 45),
    ("Hasenturm", "hasengraben", "tower", 16.0, 0),
    ("Schwefelturm", "hasengraben", "round", 13.0, 0),
    ("Inneres Schartentor", "hasengraben", "gate", 10.0, 45),
    # The north range over the town: the workhouse, the tent and armour
    # stores, the granary, the gunsmith and the towers on that side.
    ("Arbeitshaus", "arbeitshaus", "hall", 12.6, 45),
    ("Zelt- und Rüstkammer", "arbeitshaus", "hall", 8.4, 45),
    ("Schüttkasten", "arbeitshaus", "hall", 12.6, 45),
    ("Büchsenmacherstöckl", "arbeitshaus", "hall", 10.0, 45),
    ("Geyerturm", "arbeitshaus", "tower", 17.0, 0),
    ("Schmiedturm", "arbeitshaus", "round", 14.0, 0),
    ("Pulverturm", "arbeitshaus", "round", 12.0, 0),
    # The east end over the Nonnberg: the great armoury, the haulage house
    # of the Reisszug, the old armoury wall and the towers on the south-east
    # rim, the Buergermeister tower and its gate down the slope.
    ("Großes Zeughaus", "zeughaus", "hall", 14.0, 45),
    ("Reißzuggebäude", "zeughaus", "hall", 12.6, 45),
    ("Reißturm", "zeughaus", "tower", 18.0, 0),
    ("Mesner- und Schmiedstöckl", "zeughaus", "hall", 10.0, 45),
    ("Altes Zeughaus", "zeughaus", "wall", 9.0, 0),
    ("Trompeterturm", "zeughaus", "tower", 15.0, 0),
    ("Bürgermeisterturm", "zeughaus", "tower", 17.0, 0),
    ("Bürgermeistertor", "zeughaus", "gate", 9.0, 45),
    ("@120,-36", "zeughaus", "hall", 10.0, 45),
    ("@90,-43", "zeughaus", "hall", 9.0, 45),
    # St George's church on the south rim, the Kuenburg bastion's watch
    # turret, the Krautturm and the Keutschach arch.
    ("Georgskirche", "georg", "chapel", 10.0, 55),
    ("Krautturm", "georg", "round", 14.0, 0),
    ("Wachtürmchen der Kuenburgbastei", "georg", "round", 10.0, 0),
    ("Keutschachbogen", "georg", "gate", 9.0, 45),
]

# Where men and mortars stand on the summit's own ground, found rather than
# written: open courtyard this far from every wall and the rim.
YARD_CLEAR = 9.0


def pts_of(b):
    p = b["pts"]
    if p and isinstance(p[0], (list, tuple)):
        return [tuple(q) for q in p]
    return [(p[i], p[i + 1]) for i in range(0, len(p), 2)]


def fit(P):
    """The smallest rectangle round the points: centre, long side, short side, and the long side's bearing."""
    best = None
    for a10 in range(0, 1800, 5):
        t = math.radians(a10 / 10)
        c, s = math.cos(t), math.sin(t)
        u = [x * c + z * s for x, z in P]
        v = [-x * s + z * c for x, z in P]
        A = (max(u) - min(u)) * (max(v) - min(v))
        if best is None or A < best[0]:
            uc, vc = (max(u) + min(u)) / 2, (max(v) + min(v)) / 2
            best = (A, t, max(u) - min(u), max(v) - min(v), uc * c - vc * s, uc * s + vc * c)
    _, t, du, dv, cx, cz = best
    if dv > du:
        du, dv, t = dv, du, t + math.pi / 2
    return cx, cz, du, dv, t


def main():
    city = json.loads((ROOT / "public/assets/city/hohensalzburg.json").read_text())
    surveyed = []
    for b in city["buildings"]:
        P = pts_of(b)
        cx = sum(x for x, _ in P) / len(P)
        cz = sum(z for _, z in P) / len(P)
        surveyed.append((b.get("name"), cx, cz, P))

    def find(key):
        if key.startswith("@"):
            x, z = (float(v) for v in key[1:].split(","))
            return min(surveyed, key=lambda s: math.hypot(s[1] - x, s[2] - z))
        hits = [s for s in surveyed if s[0] == key]
        if not hits:
            raise SystemExit(f"not in the survey: {key}")
        # The town below has a Schuettkasten and a Kaplanstoeckl of its own:
        # the fortress's is the one on the rock.
        return min(hits, key=lambda s: math.hypot(s[1], s[2]))

    meta, h, w = load_terrain("hohensalzburg")
    g = Ground(meta, h, w)
    g0 = g.at(0.0, 0.0)
    rel = lambda x, z: g.at(x, z) - g0

    wings = []
    for key, tag, kind, eaves, pitch in BUILDINGS:
        name, _, _, P = find(key)
        cx, cz, L, W, t = fit(P)
        # A tower is square or round in the game whatever the survey's
        # rectangle: its larger side, so it is not smaller than it is.
        if kind in ("tower", "round"):
            L = W = max(L, W, 6.0)
        L, W = max(L, 4.0), max(W, 3.4)
        # Local +z along the ridge (the builder's yaw convention): the long
        # side, at bearing t from +x toward +z.
        ux, uz = math.cos(t), math.sin(t)
        vx, vz = -uz, ux

        def grid(m):
            n1, n2 = int((L + 2 * m) / 1.5) + 2, int((W + 2 * m) / 1.5) + 2
            for i in range(n1):
                for j in range(n2):
                    s = -L / 2 - m + (L + 2 * m) * i / (n1 - 1)
                    q = -W / 2 - m + (W + 2 * m) * j / (n2 - 1)
                    yield cx + ux * s + vx * q, cz + uz * s + vz * q
        low = min(rel(x, z) for x, z in grid(3.0))
        high = max(rel(x, z) for x, z in grid(0.0))
        # Wholly off the summit: an outwork down the slope (the
        # Buergermeister tower and its gate, the inner Scharte gate). On the
        # bake's crag that is a cliff face, and a building there stands on a
        # pillar of its own footing; the real ones are lower down a gentler
        # slope than a game crag can have.
        if high < -6.0:
            print(f"  (off the summit, left out: {name or key}, ground {high:.1f})")
            continue
        wings.append({
            "name": name or key, "tag": tag, "kind": kind,
            "cx": round(cx, 2), "cz": round(cz, 2), "len": round(L, 2), "wid": round(W, 2),
            "ry": round(math.atan2(ux, uz), 4),
            "eaves": eaves, "pitch": pitch,
            "found": math.floor(min(low, 0.0) - 3.0), "grade": round(high, 1),
            # An outwork down the slope stands on its own ground and rises
            # from there; it is not a summit building on a pillar.
            "base": 0 if high > -6.0 else math.floor(high),
        })

    # The rim: from the middle of the summit, for each bearing, how far out
    # the summit holds within 3 m. The curtain stands 2 m inside it.
    ox, oz = 6.0, -1.5

    def rim(bearing):
        ca, sa = math.cos(math.radians(bearing)), math.sin(math.radians(bearing))
        r = 0.0
        while r < 400 and rel(ox + r * ca, oz + r * sa) > -3.0:
            r += 0.5
        return r, ca, sa

    curtain = []
    for bearing in range(0, 360, 4):
        r, ca, sa = rim(bearing)
        r -= 2.0
        x, z = ox + r * ca, oz + r * sa
        low = min(rel(x + ca * k + (-sa) * side, z + sa * k + ca * side)
                  for k in range(0, 9) for side in (-1.5, 0.0, 1.5))
        curtain.append({"x": round(x, 2), "z": round(z, 2), "found": math.floor(low - 2.0)})

    # The yards: points on the level summit clear of every building and of the rim.
    def clear(x, z):
        for wg in wings:
            ux, uz = math.sin(wg["ry"]), math.cos(wg["ry"])
            u = (x - wg["cx"]) * ux + (z - wg["cz"]) * uz
            v = (x - wg["cx"]) * uz - (z - wg["cz"]) * ux
            du = max(0.0, abs(u) - wg["len"] / 2)
            dv = max(0.0, abs(v) - wg["wid"] / 2)
            if math.hypot(du, dv) < YARD_CLEAR:
                return False
        for p in curtain:
            if math.hypot(x - p["x"], z - p["z"]) < YARD_CLEAR + 4:
                return False
        return abs(rel(x, z)) < 0.5
    yards = []
    for x in range(-110, 121, 3):
        for z in range(-70, 71, 3):
            if clear(x, z):
                yards.append((x, z))
    # Four, spread: the farthest-point pick from the one nearest the middle.
    picks = []
    if yards:
        picks.append(min(yards, key=lambda p: math.hypot(p[0] - 30, p[1])))
        while len(picks) < 4:
            nxt = max(yards, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in picks))
            if min(math.hypot(nxt[0] - q[0], nxt[1] - q[1]) for q in picks) < 20:
                break
            picks.append(nxt)
    points = {f"yard{i + 1}": {"x": float(x), "z": float(z), "y": round(rel(x, z), 2)} for i, (x, z) in enumerate(picks)}

    plan = {"wings": wings, "curtain": curtain, "centre": {"x": ox, "z": oz}, "points": points}
    out = ROOT / "src/structure/landmarks/hohensalzburg_plan.js"
    out.write_text(
        "// Generated by tools/hohensalzburg_plan.py from the survey and the terrain bake.\n"
        "// Do not edit: change the buildings in the tool and run it again.\n"
        "export const PLAN = " + json.dumps(plan, indent=1, ensure_ascii=False) + ";\n")
    for wg in wings:
        print(f"  {wg['name'][:30]:30} {wg['kind']:8} {wg['len']:5.1f} x {wg['wid']:4.1f}  eaves {wg['eaves']:4.1f}  ground {wg['grade']:6.1f} .. found {wg['found']}")
    print(f"  curtain: {len(curtain)} points, found {min(p['found'] for p in curtain)}..{max(p['found'] for p in curtain)}")
    print(f"  yards: {points}")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
