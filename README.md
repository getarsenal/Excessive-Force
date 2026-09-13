# TUMBLE TOWN

Bring down the world's landmarks, one stone at a time.

A 3D artillery-demolition game. You command the guns from a bird's-eye view,
buy units as money comes in, designate where to hit, and try to put a 96-metre
tower on the ground while its garrison shoots back.

The first level is the **Elizabeth Tower** at Westminster, standing on the real
terrain of the site.

---

## What makes it work

### The tower is actually built out of stone

Nothing here is a hollow model with a "destroyed" version. The Elizabeth Tower
is generated in code from its real dimensions — 96.3 m to the finial, a 12.2 m
square shaft, walls tapering from 2.3 m thick at the base to 0.9 m at the
belfry, clock dials 7 m across at 55 m — and assembled out of individual stones
laid in a running bond, brick core inside a limestone skin.

Depending on your hardware that is between 2,800 and 10,000 separate stones in
the tower alone, plus a palace wing of similar size. Because the building was
never a shell, cutting into it exposes a real interior and the rubble is made
of the same stones the wall was.

### Three things decide whether it stands up

**Support.** Stones know which stones they touch. Every solver tick floods out
from the foundations through intact joints; anything the flood can't reach has
nothing holding it up and falls.

**Load.** Weight is pushed down that same graph — each stone carries its own
mass plus everything resting on it, shared among whatever is underneath. A
stone's bearing capacity scales with its damage, so a column shelled to a
quarter strength drops below the load it used to carry, sheds it onto its
neighbours, and starts a cascade. That cascade is the progressive collapse; it
isn't scripted anywhere.

**Overturning.** Connectivity alone would say a tower with one wall shot away
is fine — the other walls still reach the ground. Real towers don't behave like
that. So each damaged slice is checked: if the centre of mass above it has
moved outside what's left bearing underneath, everything above is released and
goes over. This is why undercutting one face works, and why the tower falls in
the direction you cut rather than a direction someone chose in advance.

### It runs on a phone

The trick is that an intact stone costs nothing. Every standing stone is a
collider on a single fixed rigid body — Rapier keeps it in the broad phase but
integrates none of it, so 20,000 stones standing still cost about a millisecond.

Stones only become dynamic when they're blasted or lose support, and there is a
hard ceiling on how many may be moving at once (420 on a phone, 5,000 on a
strong desktop). When debris has been asleep long enough it is frozen back into
scenery, returning its slot to the pool.

When a **large** section detaches, simulating three thousand loose stones is
neither affordable nor accurate — real masonry sections topple as a slab. So
the section becomes one dynamic body carrying all of its colliders, and
fragments progressively each time it lands hard. A phone gets the same toppling
spire as a desktop; it just breaks into fewer pieces on the way down.

A frame-time governor lowers the active budget if frames start slipping, so a
weak device degrades during the collapse instead of stuttering through the best
moment in the game.

### Real ground

Elevation is real. `tools/bake_terrain.py` pulls the public AWS terrain tiles
for the level's actual coordinates and bakes a 16-bit heightmap (Westminster
spans only ~28 m of relief, which quantises visibly in 8-bit). The same grid
feeds Rapier as a heightfield, so a round that falls short hits the ground you
are looking at, and one that falls very short goes in the Thames.

---

## The arsenal

Progression runs light anti-armour through to rocket artillery. What separates
the tiers isn't damage so much as the *shape of the hole* each one makes, which
the stability solver turns into genuinely different collapses.

| | Unit | Cost | Range | Effect |
|---|---|---|---|---|
| INF | M136 AT4 | $60 | 255 m | Narrow HEAT. Barely marks stone — but it kills defenders. |
| INF | Carl Gustaf M3 | $115 | 300 m | Reusable, real bite on masonry. |
| INF | RPG-32 thermobaric | $195 | 290 m | Wide overpressure, clears rooms. |
| INF | FGM-148 Javelin | $330 | 420 m | Top-attack, pinpoint. Cut a named pier with it. |
| GUN | M119A3 105 mm | $700 | 900 m | Towed. Fast to lay, cheap to feed. |
| GUN | M777A2 155 mm | $1,300 | 1.4 km | Stone starts leaving in lorry-loads. |
| SPH | M109A7 Paladin | $2,200 | 1.6 km | Armoured, sets up in seconds. |
| MRL | M270A2 MLRS | $3,600 | 2.0 km | Six-rocket ripple, saturates a whole face. |
| MRL | M142 HIMARS | $5,200 | 2.6 km | GPS-guided 227 mm. Ends arguments. |

The artillery models are the accurate pieces from the earlier **FIREBASE**
project, recompressed here (Draco geometry + WebP textures) from 38 MB down to
about 3 MB so the whole game loads over a phone connection.

Guns solve a real firing solution rather than following a path: minimum-energy
launch velocity for the range, high arc for plunging fire, dropping to a flat
trajectory at long range when the lofted shot would hang too long. Dispersion is
applied to the solution, so misses scatter along the line of fire the way gun
dispersion actually does.

## The garrison

Roughly sixty defenders hold the tower — sandbagged positions at the foot,
riflemen and MG nests up the window lines, snipers at the clock stage, AT teams
in the belfry arcade with the best field of fire on the map.

Each one is pinned to a specific stone. Destroy that stone, or knock it loose,
and the defender goes with it. Suppressing a face of the tower isn't a separate
mechanic bolted onto the destruction — it *is* the destruction. Dropping the
belfry to bring down the spire kills the AT teams firing from it.

They have firing arcs, which is both what really happens and the reason
approach direction matters.

## The economy

Money comes from masonry you actually bring down — measured as mass that has
left the *standing* structure, so you're paid for collapse, not for chipping.
Units you lose are money you don't get back. You fail by running out of funds
with the tower still up.

That loop is the whole design: the only way to afford the next tier is to do
real damage with the one you have, and parking an M777 inside sniper range is
not a small mistake.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
```

Re-baking terrain (needs `numpy` and `Pillow`, and network access):

```bash
python3 tools/bake_terrain.py westminster
```

Driving the game in a real browser and taking screenshots:

```bash
node tools/shot.mjs /tmp/shot            # just load it
TT_TIER=high node tools/shot.mjs /tmp/shot scenario.js
```

`window.__fastForward(seconds)` steps the simulation without rendering — tests
run under a software rasteriser at a couple of frames a second, where waiting on
the wall clock advances almost no game time and nothing with a setup timer ever
fires.

## Controls

| | |
|---|---|
| One finger / drag | Aim the view (orbit) |
| Two fingers | Move the camera's location |
| Pinch / wheel | Zoom |
| Right-drag, middle-drag or Shift-drag | Move the camera's location (mouse) |
| WASD, arrows, Q/E | Move and rotate |
| Tap the tower | Designate a target — every gun in range fires at it |
| Tap a unit card, then the ground | Deploy |
| 1–9 | Pick a unit |
| Esc | Cancel |

Walk your aim point around as the building changes. Chewing a hole in one place
stops paying once there's nothing left there to hit.

## Layout

```
src/
  core/      quality tiering, Rapier wrapper + body budget, renderer, camera rig
  world/     terrain from real DEM, sky and water, surrounding London
  structure/ masonry primitives, the stability solver, per-landmark builders
  fx/        billboard particles, layered explosions
  game/      units, ballistics, the garrison, the battle loop
  ui/        HUD
tools/       terrain baker, browser screenshot harness
```

Adding a landmark means writing one file in `structure/landmarks/` that emits
stones, plus a `LEVELS` entry in the terrain baker for its real coordinates.
Everything else — destruction, stability, garrison, economy — is generic.

## Built with

[three.js](https://threejs.org) · [Rapier](https://rapier.rs) (WASM, with a
SIMD build loaded when the browser supports it) ·
[AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) for elevation
(Tilezen/Mapzen, public domain).
