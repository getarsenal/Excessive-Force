# EXCESSIVE FORCE

Bring down the world's landmarks, one stone at a time.

A 3D artillery-demolition game. You command the guns from a bird's-eye view,
buy units as money comes in, designate where to hit, and try to put a 96-metre
tower on the ground while its garrison shoots back.

Two levels so far, each on the real terrain of its site:

| | Level | The problem |
|---|---|---|
| `?level=westminster` | **Elizabeth Tower** | A cantilever. Undercut one face and 81 m of tower goes over that way. |
| `?level=agra` | **Taj Mahal** | A compression shell. Shelling the dome makes holes; it comes down when you take the chamber wall underneath it. |

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

### Two landmarks, two different problems

This is why the structural model had to be real rather than scripted. A tower
and a dome fail in completely different ways, and nothing in the engine knows
which is which — the same three rules produce both.

The Elizabeth Tower is a cantilever. Cut one face and both corner buttresses and
the overturning check fires: 81 m of masonry releases as one section and rotates
over in the direction you cut.

The Taj is a compression shell. Its weight runs from the dome, through the drum,
into the octagonal chamber wall around the cenotaph, and down to the plinth.
Pouring fire into the dome itself mostly makes holes. Cutting the chamber wall
drops the whole drum and dome — measured, 89 m to 60.7 m in one second, with
1,800 stones in the air at once.

Getting there surfaced four real bugs in the engine, all of which had been
silently wrong on the tower too:

- **Adjacency ignored rotation.** Curved walls are laid as yawed blocks, whose
  world AABB is wider than their own half-extents. Testing with the unrotated
  ones under-connected every drum and dome.
- **The bond dropped stones.** Alternate courses shift half a stone so joints
  don't stack — but when an edge holds exactly one stone, that shift pushed it
  past the end of the edge and it was skipped. A finely-approximated circle has
  one stone per edge, so *every odd course of every curved wall was empty*.
- **The joint gap was a percentage.** Stones shrink slightly so they don't start
  interpenetrating. At 3 % a 1 m stone still touches its neighbour; a 4 m core
  block loses 12 cm and silently stops connecting to anything.
- **Support came from any direction.** Flooding through all adjacency counts
  sideways and overhead contact as support, so a wall cut clean through stayed
  up because it still brushed a roof slab. Support now comes from below, and
  spreads sideways only a few stones — far enough for a lintel, nowhere near
  far enough to hold up a wall.

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

### The real city

`tools/bake_overture.py` bakes the actual place. It reads the Overture Maps
Foundation's GeoParquet — OpenStreetMap's buildings, water and roads, with
Microsoft's and Google's ML-derived footprints filling the gaps — straight off
its public S3 bucket, and writes four things per level:

- **the buildings**, to `public/assets/city/<level>.json`: outlines in metres
  from the level origin, with the heights the survey carries, and neighbours'
  heights inferred for the roughly half that carry none;
- **the street plan**, into the same file: Overture's own junction topology
  welded back into a graph, with the blocks its streets enclose cut out of it
  by a planar face walk. This is what the game builds its city *on* — the
  twelve avenues off the Étoile, the wedge of Circular Quay, the ring roads
  round the Kremlin;
- **the coastline**, into `<level>_mask.png`, with `<level>_height.png`
  dredged underneath it so the ground and the water agree about where the bank
  is;
- **the land cover**, so the parks are the parks and the built-up quarters
  read as built-up rather than as a village standing in a meadow.

```bash
python3 tools/bake_overture.py westminster     # or --all
```

Without a bake the level still builds: the generator invents a city, says so
in the console, and everything else works the same way. There is one world
builder either way — the real footprints and the real streets go *into* it, so
a baked level gets the real place with all of the roads, parks, trees, street
furniture and railways built around it.

**Why not Google's Photorealistic 3D Tiles?** They are gorgeous and they are the
wrong shape for this game. A photogrammetry tileset is one fused mesh: there are
no separable buildings in it, no interiors, and no way to take a piece off. It is
the same problem we rejected for the tower itself — a hollow surface that
shatters like an eggshell with nothing inside. They also need a Google Cloud key,
billing, and carry attribution and derivative-work terms.

A footprint is a polygon, and a polygon can be laid up out of stone by the same
masonry builder the tower uses. Keeping the city as geometry we generate is what
leaves the door open to making it destructible on the same terms as the landmark.

Google's tiles would still make a superb *backdrop* beyond the playfield, where
nothing is ever shot at. That's a real option, just a separate one from this.

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

## Sound

Two things matter more than the samples.

**Sound is slow.** It covers 343 m per second, so a HIMARS firing 2.5 km away is
heard seven seconds after the flash, and a shell landing across the river cracks
noticeably after you watch the stone leave. Artillery is the one genre where that
delay *is* the character of the thing, so guns and impacts are scheduled by real
travel time rather than played on the frame they happen — capped at 3 s, beyond
which late audio reads as a bug rather than as distance.

**Repetition is what makes game audio sound cheap.** Six MLRS rockets on a 0.35 s
interval from one buffer is a machine gun, not a ripple. Every voice gets its own
pitch and gain jitter, and a per-sound cooldown collapses stacked triggers, so
twenty stones landing at once is one rockfall instead of twenty clipped
transients. A limiter on the master bus keeps a barrage from distorting, and
there is a hard 24-voice cap.

Collapse has no sample — it's a long, low, structureless roar, so it's
synthesised from integrated (brown) noise through a lowpass, scaled by how much
building is actually coming down. Cheaper than shipping a big loop and it scales
with the event.

Positioning is distance gain plus a stereo pan taken from the camera, not
PannerNodes: at bird's-eye range the HRTF work is inaudible and this costs a
couple of multiplies per voice.

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
