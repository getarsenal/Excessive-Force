# New map playbook

How to add a landmark to Excessive Force, written after nine of them:
the Elizabeth Tower, the Eiffel Tower, the Taj Mahal, the Giza plateau,
El Castillo, the Leaning Tower, the Opera House, Saint Basil's and the
Redeemer. Everything below is what the code actually does today, not what
it was meant to do. When the two drift, fix the code or fix this file.

A map is: a real place baked into a heightmap and a city file, a masonry
model of the landmark laid up stone by stone, a garrison posted on it, a
level record that ties them together, a contract on the campaign map, and
the trimmings that make it read as *that* place rather than as a monument
on a plate. The engine is generic. Adding a map touches these files and
nothing else; `node tools/mapcheck.mjs <id>` asserts that every one of
them has its entry, and is the first thing to run when a level is "done":

| File | What goes in it |
|---|---|
| `tools/bake_terrain.py` | The place: lat/lon, span, zoom, and the ground's corrections — river polyline, parks, flatten pads, `sea`, `ceiling`, `peak`. |
| `tools/survey.py` | The aerial survey, read from the bakes: the ground under the origin, the level extent, every surveyed building within the exclusion radius with its name, and a plan. Run before writing a constant (§0b). |
| `tools/newmap.mjs` | The scaffold: one command writes a marked stub into all eleven places a level touches and runs `mapcheck`, so the list that remains is the real work. |
| `tools/blocks.mjs` | The builder, dry, in Node: stones, the box above ground, taller-than-wide, sections, and the share of visible volume per material with its colour. A second, not a browser load. |
| `tools/postcard.mjs` | The level from the level's own camera (or an override), HUD cleared, `--survey` for the load painter. The picture that goes beside the photograph. |
| `tools/bake_overture.py` | Nothing per level, unless the ground is wild (forest, jungle, desert scrub): then the id goes in `WILD_COVER` so the survey's land cover is kept instead of the town's. |
| `public/assets/terrain/<id>_{height,mask,far}.png`, `<id>.json` | Written by the bakes. Committed. |
| `public/assets/city/<id>.json` | Written by the Overture bake: the surveyed buildings, streets and the surround. Committed. Never a synthetic fixture. |
| `src/structure/landmarks/<name>.js` | The masonry. One exported builder per structure, returning a `BlockList`; the constants in one exported object. |
| `src/game/defenders.js` | `populate<Name>(origin, groundY)`: where the garrison stands, read from the builder's constants. |
| `src/game/levels.js` | The level record: camera, structures, garrison, precinct, palette, setting, traits, win rules, blurbs. Add the id to `LEVEL_ORDER` and `LEVEL_BLURB`. |
| `src/game/campaign.js` | The contract in `THEATRES`: number, ISO code, city, lon/lat, title, brief, what closing it releases. **Without this the level is not on the campaign map and cannot be reached in order.** |
| `src/world/flags.js` | `FLAG_SITES[id]`: where the flag flies, and a `PATTERNS` function for the nation if it is a new one. |
| `src/game/cast.js` | `CAST.<nation>`, `DEFENDER_OF[id]`, `STANDOFF[id]`: the defending officer and the three-line stand-off. |
| `public/assets/characters/<nation>-<rank>.png` | The officer's cutout, RGBA, roughly 1024×1536, and a line in `manifest.json`. Wire the file name before the art exists; `mapcheck` notes a missing portrait rather than failing on it. |
| `public/assets/recon/<id>.jpg` | The dossier photograph on the campaign map, rendered by `node tools/recon.mjs <id>`. |
| `docs/SCRIPTS.md` | The stand-off lines by country, for the writer. |
| `src/ui/levelselect.js`, `src/ui/worldmap.js` | Nothing. Both read the records. |

The rest of this file is the order to do them in, the traps at each step,
and how to know when you are done.

---

## 0. Before writing anything: decide what kind of problem it is

The levels are not a difficulty curve, they are four different structural
problems, and the whole design of a map follows from which one it is.

| Kind | Example | How it fails | What that means for the map |
|---|---|---|---|
| Cantilever | Elizabeth Tower | Undercut one face, it goes over that way | Height rule wins it. Real windows to post men in. |
| Lattice | Eiffel Tower | Cut a leg, it falls towards it | Lightest structure, tallest; stiffness comes from cross-lacing, not mass. |
| Shell | Taj Mahal | Never topples; must be broken | Score on the monument, not its plinth. |
| Mountain | Great Pyramid | Nothing falls; must be quarried | Scale the unlock curve; give it interiors so there is a trick to find. |

Pick the kind first. Then decide the twist: what does the player have to
*find out* about this building? The Taj's dome stands on four piers; the
pyramid has chambers with relieving stones over them; the tower is hollow.
That sentence becomes the level's `brief`, and it is what the garrison and
the win rule should reward.

Also decide the scale. Every landmark so far is built above life size —
the tower at 2×, the Taj at 2.2× — because at 1:1 a 96 m tower is a
matchstick from the camera distance the game plays at. Pick the scale
before the builder is written; the constants in the builder should all
derive from one `scale` number, and the garrison must read them from the
builder (see §4).

---

## 0b. Survey the place before you lay a stone

The Potala was built twice, and the second time was not more talent, it was
two things that were on disk the whole time and nobody had looked at.

Start with the scaffold, so that every table has its stub and `mapcheck`
tells you only what is genuinely left:

```
node tools/newmap.mjs <id> "<Landmark>, <City>" <lat> <lon> \
     --iso XXX --city CITY --nation "Nation" --code xx [--wild]
```

It writes a `TODO(<id>)`-marked entry into the terrain table, a landmark
module of the standard shape (constants object, `courses`, `wAt`, a
placeholder body that loads), the level record, the contract, the officer,
the stand-off, the flag, the blurb, the running order, the fleet and the
portrait slot, plus `docs/maps/<id>.md` with the proportion table below
empty. Then bake (§1), and then:

```
python3 tools/survey.py <id>            # after the bakes in §1 have run
```

It prints the ground under the origin — the profile through it both ways,
and the extent of the *level* ground connected to it — and every surveyed
building within the exclusion radius, largest first, with its footprint,
height, bearing and name, and then draws the lot as a plan at
`/tmp/out/<id>-survey.png`. Read it before writing a constant. Three things
it exists to tell you:

- **The landmark's own outline is in the bake.** Overture had the Potala
  as a seventy-one-point polygon named `布达拉宫 ཕོ་བྲང་པོ་ཏ་ལ།`, 360 m end
  to end. The first builder was written from a remembered photograph at 460.
  The survey gives the plan; the photographs give the elevation; neither
  gives the other.
- **The outbuildings are in the bake too, and the exclusion deletes them.**
  Within 320 m of the Potala's origin the survey had the Shöl Lekhung, the
  printing house, the prison and the old army headquarters, all *named*.
  `cityExcludeRadius: 430` removed every one, and the level then invented
  "Shöl" as twenty-six boxes scattered on the terraces, which from the
  valley read as packing crates. The tool lists what the radius is about to
  delete. If any of it is part of the place, either build it or pull the
  radius in until the survey keeps it.

  This is what the survey actually prints for the Potala, and it is the
  whole of Shöl by name:

  ```
  19023 m2  373x123  h 14.4   40 m at 127 deg  布达拉宫 ཕོ་བྲང་པོ་ཏ་ལ།  <- the landmark?
   3722 m2   68x 73  h 14.4  134 m at 358 deg  雪奇惹
   2343 m2   67x 64  h 14.4  131 m at 323 deg  印经院            (printing house)
   1895 m2   75x 39  h 14.2  113 m at  75 deg  旧藏军司令部       (old army HQ)
   1252 m2   50x 42  h 13.0   82 m at 341 deg  雪巴列空          (Shöl Lekhung)
   1041 m2   45x 33  h 12.4   91 m at  12 deg  监狱              (the prison)
    868 m2   26x 58  h 12.0  192 m at  58 deg  宝藏局造币厂       (the mint)
    673 m2   37x 25  h 11.3  218 m at  21 deg  宫门              (the palace gate)
    ...      29x 22          西南角楼 / 东南角楼                 (SW and SE corner towers)
    ...      20x 26          东边楼 / 西边楼                     (east and west side buildings)
  ```

  Twenty-three named buildings, the gate and both corner towers of the
  Shöl wall among them. Note the landmark's own plan: 373 by 123. The first
  builder was 460 wide; the second, written from photographs, came out at
  345 by 130 — right, but by luck. The number was on disk.
- **The ground is measured, not assumed.** On the first Potala the terrain
  did not vary by one metre from x −300 to +250 and z −200 to +300: a table
  540 m across, with the famous 130 m of rock reduced to a cliff round its
  rim. Nobody had sampled it. The survey prints the level extent and says,
  in so many words, when a hilltop is a table.

Then, still before code, write the **proportion table** — the real thing
against what you are about to build, from the photographs everyone knows:

| | The real Potala | First build | Second |
|---|---|---|---|
| Width, end to end | 360 m | 460 m | 345 m |
| Height, valley floor to roofline | ~250 m | 185 m | 336 m |
| Taller than wide? | yes | no | yes |
| The bottom third | blank white battered wall | windows, tan decks | blank white wall |
| Dominant surface colour | lime white | `LIMESTONE` 0xdcc99e, tan | `MARBLE` |
| Where the eye goes | the stair up the white face | nowhere | the stair |

A monument only reads as tall against its own width, and the eye reads one
colour and one line before it reads any detail. Four of the six rows above
were wrong on the first build and none of them was about detail. If the
table says the shape is wrong, no amount of windows will fix it.

---

## 1. Bake the ground

`tools/bake_terrain.py` has a `LEVELS` dict. Add an entry:

```python
"<id>": {
    "name": "<Landmark>, <City>",
    "lat": ..., "lon": ...,      # the landmark itself; it becomes (0, 0)
    "span": 900.0,               # half-width in metres; 1800 m square map
    "zoom": 14,
    "river": {                   # omit entirely if there is no river
        "width": 200.0,
        "points": [[east, north], ...],   # metres from the landmark
    },
    "parks": [[east, north, radius], ...],
    "sea": {"level": 0.6, "depth": 10.0, "shore": 1.2},   # a coast, not a river
    "ceiling": 42.0,             # cap the DEM where it is really a city's roofs
    # pad: [east, north, radius | [rx, rz], feather, height?]
    "flatten": [[east, north, 44, 30, 690.0], ...],
    # a summit, cut as a landform with firing steps (Rio) — see below
    "peak": {
        "height": 700.0,         # the summit's elevation
        "top": 66.0,             # radius of the level platform the landmark stands on
        "slope": 1.6,            # metres of fall per metre between shelves
        "shelves": [[96.0, 40.0], [152.0, 62.0], [246.0, 70.0]],   # [inner radius, width]
        "fade": 70.0,            # blend back into the DEM past the last shelf
    },
},
```

Use `river` *or* `sea`, not both; `peak` replaces `flatten` for the summit
it cuts. Omit every key the place does not need — a plain city on a river
is `lat, lon, span, zoom, river, parks`.

Then `python3 tools/bake_terrain.py <id>`. It fetches AWS Terrarium
tiles (no key), writes the three files, and prints the elevation range.

Then `python3 tools/bake_overture.py <id>`, which is the one that matters. It
re-cuts the DEM, pulls the buildings, the street graph and the real coastline,
and writes `<id>_far.png` — the water for seven spans in every direction, which
is what the surround and the skyline are drawn over. Read the line it prints:
`far water: N polygons, X% of the K km square`. A coastal or riverside place
that comes back at nought per cent has a bake that did not reach its own water,
and the level will render as a field with a monument in it.

Every bake ends by checking itself against its own other half: the origin is
not under water, the wet half of the map is the low half, nothing wet stands
above its own surface, and the surveyed buildings are on the surveyed land.
A bake that fails one of those prints why; the last one is the only check
that catches a flipped mask, because the dredge follows the mask and the two
agree with each other however wrong they are.

Both bakes are cached outside the repo — the DEM tiles in `/tmp/tt-tiles`,
the Overture queries in `/tmp/tt-overture` — so a re-bake after a change to
the config is seconds, not a minute a level. `--fresh` bypasses the cache.
Egress: `s3.amazonaws.com` is open; Overpass and the tile servers are 403 at
the proxy, by policy — report it, do not retry.

If the place is wild — rainforest, jungle, desert scrub, anything where the
survey's land cover is the truth and a town's parcels are not — add the id
to `WILD_COVER` in `bake_overture.py` before baking. Rio and Chichén are in
it. Without it the bake paints the built-parcel tint and the game lays a
town's ground under the trees.

The street plan then goes through `src/world/realstreets.js`, and everything
below is true of a new map without anyone having to build it. These are the
things that took longest to get right on the first nine; do not reimplement
any of them, and if one is wrong on a new map it is wrong on all nine:

  - **streets are cut, not deleted.** A carriageway that runs into the water or
    into the landmark's own precinct stops there and keeps the rest of itself.
    Deleting the whole edge takes an arm off the junction at each end, and the
    dissolve pass then straightens the junction out of existence.
  - **one junction, one road.** A survey draws a dual carriageway as two roads
    and their crossing as a cluster of four to nine junctions. Junctions whose
    paving overlaps are welded into one (`weldJunctions`); a junction that
    stands on another road is put onto it (`snapNodesToRoads`); two roads
    between the same two junctions become one down the middle (`dedupeEdges`).
    Parliament Square went from nine junctions to three that way.
  - **bridges come ashore, and are bridges.** `landBridges` walks a dangling
    wet end on to dry ground and welds it to the junction there; `layDecks`
    cuts a welded run into chains at its junctions (the Cahill Expressway and
    the Harbour Bridge share one and are not one bridge), straightens each
    chain onto its chord, lifts it three metres over the bank — or on its
    length past six hundred metres of water — ramps the roads at each landing
    and hands the line to `buildBridge`: masonry arches, piers, balustrade and
    lamps, or past six hundred metres a steel through-arch on granite pylons.
  - **a viaduct over land follows the land.** A chain flagged as a bridge that
    crosses almost no water — the Corcovado's rack railway, Agra's rail line —
    is laid three metres over the ground under each point, smoothed, not at
    one flat height; one flat deck at its highest ground was a wall across
    the mountainside.
  - **the exclusion radius is not the precinct.** `cityExcludeRadius` is what
    is left after the landmark's own footprint and the precinct margin have
    kept the city off: on Pisa three hundred and thirty metres threw away
    three hundred and four of the town's buildings and every street round the
    Campo. Start from the precinct and add only what the real place has open.
  - **the paving is the precinct's outline,** the landmarks' footprint with the
    railings' margin and cut corners, on the building's axes — not a disc.
  - **the waterfront is on the water.** On a harbour level, dry land the DEM
    puts under the waterline is a quay and is lifted just over it
    (`_liftQuays`); a surveyed footprint over the water but tied to the shore
    is built as a wharf founded below the surface; the street test is on the
    outline and on the roads on the ground, so a building can stand under an
    elevated deck.
  - **no dead ends.** Every bend that is not a junction is dissolved into one
    road first, so a road is judged whole; then a loose end is carried on to
    the road it was heading for if one is within seventy metres over clear
    ground, and removed if not. Only a road that leaves the map keeps an open
    end (`resolveDeadEnds`).
  - **bends are curves.** `smoothRoads` rounds every vertex with two rounds of
    corner-cutting, ends held fixed; a sharp two-arm corner is paved like a
    junction so the outer kerb is not notched (`padRadius`).
  - **crossings are rationed.** A zebra goes where a main road is involved, on
    two arms at most and fifty degrees apart. Painting every arm of every
    three-way junction is what turned London into a lattice of white ladders.
  - **the bank is one line.** The shoreline is sampled by four sweeps, pooled,
    thinned and chained into a single ordered run, and the embankment is laid
    along it with a walk behind the parapet.
  - **the precinct is square to the building,** not to the street plan; its
    walks run on its axes and its beds and statues mirror. No invented railway
    on a surveyed map, and the bake's built-parcel tint is cleared under the
    precinct lawn.
It needs outbound network and **it does run in-session** — the tile host is
reachable through the proxy and `pillow`/`numpy` are installed. (An earlier
version of this page said it could not; it can, and five maps were baked
that way.)

**What we learned:**

- **The DEM knows where the water is better than the polyline does.**
  Tilezen fills rivers flat at their shoreline, so a river is a plateau at
  the bottom of the elevation range. The polyline is a *hint*; at load
  `Terrain._repairRiver` re-derives the channel from the DEM whenever the
  baked mask is mostly dry ground (Paris's polyline ran sixty metres up the
  Trocadéro hillside). Draw the polyline where the river is, but expect
  the DEM to win, and check the result in the game, not in the PNG.
- **Keep the channel clear of the foundations.** Every river polyline is
  held ~200 m from the landmark. The real Pont d'Iéna is at the foot of
  the Eiffel Tower; putting the Seine there put the north leg in the water.
- **Flatten pads only where the DEM already contains the building.** At
  z14 Khufu is a 54 m bump in the tiles; building the game's pyramid on it
  stood a pyramid on a pyramid-shaped hill. `flatten` levels a disc to the
  median of the ring around it. For a tower or a palace the DEM has nothing
  to flatten, and the game levels one pad per group of structures at load
  (`terrain.levelPad`, one pad per shared origin — the Taj, its mosque and
  jawab got three pads at three heights until that was made one).
- **The river must leave the map cleanly.** `riverExits` finds wet runs at
  the map edge, merges runs closer than 80 m (Agra's east run was split by
  a notch and left as two creeks), merges runs that meet at a corner
  (Paris's Seine was drawn as two tails with a wedge of ground between),
  dredges the mouth, and starts the channel inside the map so the tail's
  angled cross-section never leaves a bar of raised ground. If a new map's
  river looks wrong at the edge, the fix is almost always in that function
  and never in the polyline.
- **Low tier halves the grid before anything is built** (`coarsen`). The
  roads, lawn, physics and picker all follow the same coarse ground, so
  never sample the fine grid for one thing and the coarse for another.
- **A pad on a peninsula has to state its own height.** `flatten` levels to
  the median of the ring around the pad, which is right on dry land and
  wrong where the ring is nine tenths water: Bennelong Point came out eight
  metres under the harbour. A fifth element in the pad is an explicit height
  in metres. A pad's `radius` may also be `[rx, rz]`, a rounded rectangle,
  because a disc big enough to reach the corners of the Opera House's podium
  reclaims fifty metres of harbour down both sides of the point.
- **A pad's second coordinate is northing and the game's +z is south**, so
  the sign of it is the opposite of the direction it puts the ground.
- **`sea` is for a coast.** A river is a line and is carved from a polyline;
  a harbour is a shape nobody is going to type in, so `flood_sea` takes it
  from the DEM — everything at or below the waterline is sea — and dredges
  it. Keep `shore` narrow: widen it and the flood walks up the headland it
  is supposed to be going round.
- **The DEM is a surface model, and over a city it is the roofs.** Sydney at
  z15 comes back with ninety-eight metres of "terrain" where the highest real
  ground near Bennelong Point is about forty; the game then builds its own
  city on that and half the roofs are level with the hillside they stand in.
  `ceiling` compresses everything above a height rather than clipping it.
- **z15 where the subject is small.** Bennelong Point is a hundred metres
  across, which at z14 is twelve DEM pixels, most of which the smoothing
  hands to the harbour — the point is simply not there. Corcovado at z14 is
  a hill with its top rounded off.
- **`groundLevel: 'bake'` on a hilltop.** The game levels its own pad under
  each structure group at load, to the median of a ring round the footprint
  (`terrain.levelPad`). Round a two-hundred-metre building on the Acropolis
  that ring runs down the slopes on every side, and the median dug the
  plateau down twenty-eight metres. A level whose bake already cut the
  ground says so in its record, and the pad is levelled to the origin's
  height instead. Athens and Himeji set it; any summit map should.
- **`peak` is a landform and a level design at once.** A real summit at
  DEM resolution is a hill with its top rounded off, and a statue on it has
  nowhere for a gun to stand. `cut_peak` carves the summit to a level
  platform of radius `top` and rings of level shelf below it, each one a
  firing step, the ground falling at `slope` between them, the radii
  wobbled by bearing so the benches wander like weathered rock. Anything
  the level puts on the mountain — the Rio turret is on `shelves[0]` — is
  placed by reading those numbers, not by guessing; probe
  `terrain.heightAt` around the ring before choosing the spot.
- **A battery under a cliff lofts.** The trajectory check used to skip its
  first sample as "the muzzle's own ground", which on a slope is a fifth of a
  low arc's flight: the suite's guns under the Acropolis fired half their
  rounds into the rock face with the check looking away. It skips eight
  metres from the gun now, measured, and the solver takes the high arc.
- **The guns have to have somewhere to stand.** This is the constraint that
  decides the shape of a summit. A howitzer below a rise puts its shell into
  the rise: on the Corcovado cut to its true platform, ten rounds went out
  and ten landed at the guns' own feet. The suite spawns its battery at 220 m
  and the ring test at 170 m, so the ground has to be level out to about
  250 m in the direction the guns come from. Offset the pad — a ridge rather
  than a cone — and the rim can still be close on the side the camera looks.
- **`top` is the summit, so it must be the size of the summit.** It was 270
  at the Potala because "the pad has to fit the footprint", and a 270 m
  radius is a level table 540 m across on a hill 350 m long. Measure the
  real hilltop (the survey prints it) and cut `top` to that. Marpo Ri is a
  whaleback, 350 m along and 150 across: a `[0.28, 2, -1.5708]` term in
  `wobble` — sin(2θ − π/2) is −cos 2θ — pulls the radius in along one axis
  and pushes it out along the other, and the summit comes out long and
  narrow instead of round.
- **The shelves have to fit on the hill.** Drop is `slope × run`. The old
  Potala shelves were 180 m of run at slope 1.5 below a 132 m hill: a 270 m
  fall that ended below the valley floor and was blended away by `fade`.
  With `top` pulled in, pull the shelves in with it and check the sum.
- **A landmark on a hill may not flatten the hill.** `padRadius` on the
  level record overrides the disc a structure levels under itself (which is
  otherwise half its longest side plus eight). `padRadius: 0` levels
  nothing: the bake's summit is the floor, and the builder carries its own
  foundations down to meet the rock wherever the rock has fallen away
  (§2b). Any summit map should set it; the pad is the reason a hill turns
  into a car park with a monument parked on it.
- **Pull the exclusion in with the hill.** Marpo Ri's base came in from
  570 m to 280 m; `cityExcludeRadius` at 430 left a ring of bare gravel
  round the foot of it. The town comes right up to the rock.
- **A sea is one polygon and the land is its holes.** Overture draws the
  Arabian Sea as a single feature with five hundred and ninety-five interior
  rings and the Persian Gulf with thirteen hundred, and every ring is a
  piece of coast. Burning exterior rings alone put the whole of Dubai under
  the Gulf — origin wet, six hundred and ten of six hundred and ten
  buildings in the water, which is the flipped-mask signature with nothing
  flipped. `collect_polys` now clips every part to the square and hands the
  rasteriser its holes to clear. Any new coastal bake whose self-check
  reports the origin under water: look at the water polygons' interiors
  before anything else.
- **A map with no water has no flood line.** The builders keep buildings a
  freeboard above `waterLevel`, and on a map whose water is all off the edge
  (Pisa: the Arno is a kilometre south) that level is the bake's sea level,
  which sat a metre and a half above the plain's low streets — a sixth of
  the town refused as "in the water". `terrain.hasWater` is false when the
  playfield mask has no wet cell, and the freeboard test is skipped.
- **Parcels come patchy.** The bake paints built parcels at a third of a
  road, and where the survey has parcelled a town completely that is one
  tone under the buildings. Where it has not (Pisa) the ground came out as a
  leopard skin of grey patches on tan, and the grey read as bits of street.
  `_closeParcels` closes gaps under twenty-two metres at load; the colour
  pass paints parcels as the town's own duller ground, not as asphalt.
- **Look at flat ground from straight above at low tier before shipping.**
  The grain texture's value noise had one dominant octave two metres apart,
  and on a flat pale plain that is a lattice. It is domain-warped now; any
  new ground texture wants the same check.

---

## 2. Lay up the landmark

`src/structure/landmarks/<name>.js` exports one builder per structure:

```js
import { BlockList, MATERIALS as M } from '../builder.js';
export const THING = { scale: 2.0, width: ..., ... };   // shared constants
export function buildThing(quality) {
  const B = new BlockList();
  const stone = ...;            // block size from quality; see below
  B.section('shaft', () => { B.ring(...); });
  ...
  return B;
}
```

`BlockList` is the whole vocabulary: `add`, `ring` (walls with bonded
corners and optional `relief`), `polyRing`, `slab`, `tower`, `spire`,
`pinnacle`, `arch`, `archVoid`, `drum`, `dome`, `mirrored`, `section(tag)`
(tags blocks for `scoreTags` and for the garrison), `openings(pred)` (an
opening is masonry never laid). Materials in `MATERIALS`; the structural
ones carry load, `GLASS`/`GILT`/`RAILING` carry only themselves.

Block size comes from the quality tier. Fewer, bigger stones on a phone;
the builders take `quality` and derive `stone` from it. The rules that
bit us:

- **Set `B.joint = JOINT / scale` in a builder that scales.** The block
  list lays every stone with a 3 cm joint and scales it with the building,
  and the solver's contact tolerance is 7.5 cm: at two and a half times
  life every course joint sits exactly on the tolerance and stands or falls
  on floating-point noise — the Himeji keep's first storey came apart at one
  tier and held at another on nothing else. The property keeps the joint
  3 cm in the world. The nine before it do not set it and are left alone.
- **Equal courses, never a sliver.** `while (y < top) { h = min(course, top -
  y) }` leaves a remainder course a few centimetres tall under every roof
  slab, and that sliver's joints are the fragile ones. Divide the height
  into `round(h / course)` equal courses instead; every new builder has a
  `courses()` helper for it.
- **Openings stay a stone and a half off a corner.** A loophole that cut the
  corner stone out left the corner pier above it standing on nothing, and
  the eave over that went with it.
- **A stone the guns cannot bite is not a stone.** One stone per column drum
  at three times life was ninety cubic metres of marble, three times any
  stone on the Taj; the suite put fourteen rounds into the colonnade and
  destroyed nothing. Health goes as volume to the 0.62: keep a stone's world
  volume within about twice the Taj's facing stones (about 25 m³), and
  quarter anything bigger.
- **Count the stones before the first load.** `node -e` can import a
  builder and build it with `{ blockScale: 1.55 }` in a second; the Cologne
  draft was forty thousand at the Taj's grain and fifteen at its own. Ten to
  fifteen thousand at low is the range the nine live in.
- **A man's floor is one stone.** The footing test removes the stones under
  a man and expects him to fall; a man standing on three layers of slab has
  two more under him, and a slab ten metres across has no centre within
  reach of anyone. Pave a platform in one course of stones a man's width.

- **The hole a shell makes must be the same size at every tier.** The
  blast weights each stone by the fraction of it enclosed, so a coarse
  tower is not tougher than a fine one. But a tier can still be too coarse
  to *bite*: Khufu's low-tier stones were capped (`stone = 4.6·min(s, 1.25)`)
  because at 6.2 m a 155 mm shell could not take one out.
- **Every block must rest on something.** The support solver only knows
  "underneath". Things that stand in real masonry by arch action or
  friction do not stand here. Specifically:
  - A **ring-and-core pyramid** does not stand: each casing ring lands
    inboard of the one below and bears on core. Build solid courses.
  - **Voussoir rings over big openings** go loose. Lay the arch as
    *relief* on the wall's own stones (`ring(..., relief)`), and cut the
    doorway with `archVoid` / a pointed cut instead of real voussoirs.
  - **Ornament is relief, not applied blocks.** Cornices, string courses,
    hoods, jambs: pass a `relief(x, z)` to `ring`/`polyRing`/`spire` and the
    course is laid thicker and shifted outward there. Ornament laid as
    separate stones on top of a wall either z-fights or falls off.
  - **Lintels and sills go in the course grid**, proud by ~0.3 m, with the
    mullion between them. A lintel laid flush with the wall face is a
    coplanar face that flashes.
  - **Lattice members must be sized to their spacing.** The Eiffel cage
    caps each bar at 40% of the gap between bars and corners at 58%, and
    its decks are solid plates ≥ 5 m; otherwise the inner corner posts are
    crushed and the load routes through the balustrade (which is why
    `RAILING` exists as a non-structural material).
- **Faces must not share a plane.** Double-laid ring corners, a core slab
  passing through a casing ring, an arch buried in an uncut wall — all
  flash in the sun. Alternate voussoirs are inset 0.07 m for the same
  reason. The near plane is 3.5 m, so anything closer than that to the
  camera is cut off, and depth is logarithmic on devices with < 24 bits.
- **Colour is undersaturated on purpose.** Per-stone jitter multiplies
  saturation by up to 1.4 and the ACES grade pushes it again; the first
  red Palace of Westminster came out as a traffic cone. `REDSTONE` is
  `0xa87b6c` for that reason.

Verify the model before anything else is built on it. From the test
menu (TEST button) or the harness, the checks that matter:
- **Loose stones at load = 0 at every tier.** The offline detector
  `node tools/zfight.mjs <landmark> <tier>` finds overlapping and coplanar faces;
  the in-game "no stones start loose" test finds unsupported ones.
- **Undercutting a face actually drops it** (the "shelled structure goes
  over" test, scaled to the monument's mass).
- **Screenshots at the level camera at low and high.** Giza at high and
  the Eiffel Tower at ultra time out in the harness; use low for those.

**What five more landmarks taught the builder:**

- **Size an arch's ring off its bay, not off the course height.** A
  voussoir as thick as a course is most of a two-metre bay on a coarse
  tier, and the springing stones then land past the column they are
  supposed to stand on — thirty of them, hanging in the air, on every
  loggia of the campanile at Pisa.
- **A ring is laid either side of its own outline.** `polyRing` puts the
  stone *on* the line, so a course meant to span radius a to b goes on the
  outline `(a+b)/2` with thickness `b-a`. Put it on `b` and it leaves a
  hand's width of daylight at `a`, which the solver reads as detached; and
  a single ring on the outer edge of a plinth leaves the tower's inner skin
  over a hole.
- **Check a wall thickness that varies.** Pisa's rubble core is `face −
  core − 2·shell`, and `face` steps inward by the loggia depth above the
  first stage. Measured off the outer face instead, the core went to four
  centimetres and then negative, and the builder laid rings of four-
  centimetre stones nothing could bear on.
- **A flat slab does not span.** Twenty-six metres of roof between two
  walls is seventy stones with nothing under them. A corbelled gable —
  courses stepping in by less than their own width — carries itself, and is
  also what the roof actually is.
- **Resolution beats fidelity on a coarse tier.** Twelve openings through a
  bell chamber leaves no pier between them once the stone is 2.6 m; the
  answer was to build that stage the way it really is, as columns and
  arches rather than a wall with holes in it. An onion dome resolved into
  three rings is a cylinder with a cone on it — lay a dome in half courses.
- **One structure, not two, when one stands on the other.** Structures are
  each placed on the terrain at their own ground level and never learn
  about each other, so the Opera House's shells had to be built in the same
  `BlockList` as its podium. Two structures is for two buildings with
  ground between them.
- **A cantilever is the one thing the solver has no rule for.** The bearing
  walk looks downward, on purpose. `_groutBearing` has a last pass that
  lets a stone about to be culled take a bearing edge *sideways* to a
  touching neighbour that is already standing — bounded to a twentieth of
  the structure, so it can never rescue a floating plate. If a new landmark
  has something held out horizontally, that is what keeps it on.
- **A stone's local +z runs along its course; local +x is its thickness.**
  That is the convention `polyRing` lays to and the one every yawed stone
  has to follow, so a wall running in the direction `(ux, uz)` is yawed
  `Math.atan2(ux, uz)` — not by the angle of the thing it belongs to. The
  Burj's wing walls were yawed by the wing's own bearing, which is a quarter
  turn off, and came out as rows of separate planks lying across the wing
  with the running bond overlapping nothing.
- **Bond the parts to each other, not merely near each other.** A wing wall
  that starts at the face of the core it braces never touches it: the core
  falls away to either side of the wing's centre line, so both long walls
  pass it at arm's length. Run them *into* the core until they cross its
  inner face. The support walk is a graph of stones that overlap, and
  "obviously attached" is not one of its rules.
- **A weaker course is a fuse.** Anything drawn as a band — a floor line, a
  string course, a plinth — must not be a *weaker* stone in the load path,
  or the whole wall stands at that band's capacity and sheds it with nobody
  firing. Draw the band as ornament standing proud of the wall, a fraction
  of a course deep, so the course above lands on the wall and not on it.
- **Ordinary concrete does not reach five hundred metres, here or anywhere.**
  `CONCRETE` is set against a 96 m tower that puts 2.3 MPa on its lowest
  course. A supertall puts eleven, and its floors and setbacks concentrate
  that. `CURTAIN` is the high-strength mix for exactly this, and the walls
  should still thicken toward the foot. The collapse a tall building is
  supposed to have is loss of support at a cut, never crushing at rest.
- **How tall it is decides whether it can fall.** Breaking up happens on the
  ground, and the suite gives a collapse a few seconds after the tower is
  down. A half-kilometre is ten seconds of free fall on its own, so the
  wreck was still in the air when the biggest landed piece was measured and
  the whole thing scored as one welded column. If the undercut test reports
  a slab of thousands, the building is too tall for the time, not too
  strong — scale it.
- **A man's floor is one stone, and nothing may be level with his boots.**
  The footing check removes the stones whose centres are 0.2 to 3.2 m under
  a defender and then asks a 2 m occupancy grid whether anything is left.
  A surface of thin courses that overlap each other vertically leaves stone
  0.13 m under his feet — too high to be removed, quite enough to keep the
  cell full — and the floor goes while the man stands on the hole. Give him
  one thick course to stand on, air under it, and no masonry within about
  two metres at his own level. The Parthenon's krepis and the Burj's terrace
  are both this lesson.

### 2b. Building on a hill: what the Potala taught

Everything in this subsection was learned on one map in one day, from a
screenshot beside three photographs. It is written down because every rule
in it is general.

- **Found the walls below the ground, and let the ground decide what shows.**
  A structure founded at y 0 needs a flat top the width of its footprint,
  which is how the hill became a table. The second Potala founds its
  retaining walls at `FOUND = −126` — a hundred and twenty-six metres
  *under* the summit — and runs them up. At the back and along the ridge
  that masonry is buried and costs a few coarse courses; across the front,
  where the rock falls away, it is exposed, and what it is exposed as is the
  eighty metres of blank white wall every photograph of the place is of. The
  building meets the hill instead of the hill being flattened to meet the
  building.
- **Buried masonry is coarse and bare.** Foundations at the face's own
  fineness cost eighteen thousand stones the software rasteriser could not
  even screenshot. Below the deepest point the rock can have fallen to,
  lay blocks at about three times the size (`rough = stone × 3.2`) in the
  footing stone; above it, the face's own fineness in the face's own
  material. Nobody dresses ashlar for the part that goes in the ground. The
  boundary between the two was moved three times; put it at the lowest
  ground the survey shows under the footprint, minus a few metres.
- **One material for the whole visible envelope.** The terraces were laid
  in `LIMESTONE`, 0xdcc99e, a warm tan, under a `MARBLE` palace. That one
  constant was most of why the level read as scenery: the Potala's loudest
  single fact is that it is white from across the valley. Pick the dominant
  colour from the photograph before picking a material, and use it for
  everything the photograph shows in that colour.
- **A continuous face, not a shelf at every level.** The palace blocks sat
  twenty metres back on the terrace deck, and the tiers below stepped the
  same way, so the eye met a horizontal shelf every forty metres: a wedding
  cake. On the real building the White Palace's wall is the retaining wall
  carried on upward. The blocks' south faces now land a metre inside the
  terrace front, so rock-to-roofline is one battered surface. Set every face
  on the hill to one batter (`BATTER`, metres in per metre up) and write the
  width of a wall at height y as `wTop + 2·BATTER·(top − y)`, not as a
  fraction of its own height: a fourteen-metre tier given the main terrace's
  fraction comes out nearly vertical beside it and the pile reads as boxes.
- **The lowest terrace runs to the road.** With the masonry stopping forty
  metres above the foot, the bottom third of every view was bare slope with
  a palace balanced on it. Carry the outermost terrace down until about
  twenty metres of it stand clear of the ground where it lands.
- **Between two terraces there is a walk, or there is a void.** A terrace
  is a hollow ring, so the band between one tier's inner edge and the next
  tier's wall is nothing, all the way to the foundation — and the stair was
  switchbacking across it and the garrison posted on it. Every tier lays a
  one-course walk across its front from its own face back to the face of
  the one above: three thousand stones for four tiers against twenty
  thousand for full plates, and what the photographs show anyway. Ten blind
  defenders became none.
- **A stair meets itself, leans on something, and is a stair.** Three rules
  the first one broke. Consecutive flights end and begin at the same point
  (they were twenty-one metres apart in plan at every junction: rungs of a
  ladder left on the hill). Each flight sits a few metres in front of the
  wall it climbs, on the walk of the tier below. And the pitch is a stair's:
  seventy metres of run for twenty-odd of rise is twenty degrees; a hundred
  and forty-four for the same rise is nine, which is a ribbon lying on a
  wall. Edge it in the dark frieze colour (`KYEMA` here) — a white handrail
  on a white ramp against a white wall is invisible, and that dark diagonal
  is what the eye follows — and keep the parapet a handrail's height, not
  twelve metres.
- **Outbuildings are a street, not a scatter.** Twenty-six free-standing
  boxes on three walks read as crates. Party-walled houses laid end to end
  along one walk, heights and depths wandering, read as a village. Better
  still, build the ones the survey names (§0b) where the survey puts them.
- **The stone budget is a number, not a feeling.** The level went 36k →
  55k → 40k → 50k → 43k stones across the rebuild. Above about 45k at low
  tier the rasteriser cannot screenshot it and a phone will not enjoy it.
  `node tools/blocks.mjs <id>` prints the count, the box above ground,
  every section, and the material share of the visible volume with its
  colour, in a quarter of a second and no browser; run it after every
  structural change, and read the colour line — "58% LIMESTONE #dcc99e"
  under a white palace is the tan base, caught before the first render.
- **The camera is where the photographs are taken from.** Every picture of
  the Potala is from the road at the foot, looking up. The level camera was
  nine hundred metres back at a quarter radian of pitch, looking *down* on
  the roofs, from where a mountain fortress is a floor plan. Low and close
  (`pitch: 0.10, distance: 700, height: 70`), and 336 m of building fills
  the frame by being looked up at.
- **Resizing the landmark stales everything that was sized to it.** The
  garrison's rooflines were three numbers from the old block heights, so ten
  men were posted inside masonry. The deployment test spawned its dummy unit
  at a fixed 160 m south, which the new terraces occupied, and failed for
  having nowhere to stand a man. After a rebuild, grep the level's constants
  for every consumer and re-derive them from the builder.

---

## 3. Give it interiors, and a trick

A landmark that is one solid lump is a grind. The pyramid became playable
only when it got its real chambers, gallery and passage as voids with
real ceilings, relieving stones over the King's Chamber, and a scatter of
`CHARGE` blocks (a demolition charge goes off when shellfire uncovers it,
and takes a few per cent of the monument with it). The Taj has its
chamber and iwans; the tower is hollow with floors at the stages. Build
the inside the building really has, then ask what a shell uncovering it
would do.

---

### A gun that shoots back

A level may carry `turret: { x, z, yaw, scale, minRange }` — a coastal
mounting (`src/game/turret.js`) that turns slowly toward the nearest battery
in range, drops two shells at a time on it in a high arc, deflects three
friendly rounds in four off its dome and barrels (re-firing them along their
new line), and is wrecked after sixteen that bite. It is a machine with a hit
count and a kinematic body, not masonry, and not an objective. The forest
clearing and the deploy exclusion follow its position on their own.

Give it its own ground. Rio's stood on the summit platform fifty-five metres
from the pedestal once and read as a piece of the monument; it is on the
first bench now, forty metres below the terraces and a hundred and thirty
out, in a clearing of its own. Flat ground under the whole wire ring (about
2.7 × dome radius, 17 m at scale 1.25), a clear arc, and `yaw` facing away
from the landmark. `minRange` is the radius inside which it will not fire:
sixty metres when the batteries can stand above it, more when it is on the
same platform as the guns.

## 4. Post the garrison

`src/game/defenders.js`: add `populate<Name>(origin, groundY, counts = {})`
and call it from the level's `garrison` function. Types are in
`DEFENDER_TYPES`: `rifleman`, `mg`, `sniper`, `at`, `mortar` (indirect;
never needs a field of fire). `place(type, pos, facing, maxDist, opts)`
snaps the man to the nearest stone within `maxDist` and, if the spot is a
floor, onto its top.

- **Read every position from the builder's own constants** (`TOWER.width`,
  `WING.windows.heights`, `TAJ.scale`…). The tower's garrison was copied
  out by hand once; scaling the tower then left the men standing in the
  air where the old walls had been.
- **Windows, roofs, arcades, ground behind sandbags.** Weight the long
  weapons upward: snipers high, MGs mid, riflemen low; AT teams where the
  field of fire is best; mortars on roofs. Every position sits *inside*
  the wall plane so the reveal covers it.
- **Every position must be able to see out.** `_settleIntoPosition`
  nudges a blind man outward and upward; what it cannot rescue it flags,
  and the "garrison has a field of fire" test counts them. Westminster 10,
  Paris 4, Giza 6 blind is the accepted baseline; more than that and the
  positions are wrong. The Taj's plinth men were inside the minaret
  footprints until moved to four per side; the Eiffel's gunners were
  inside the closed leg boxes until `spread` kept them off the corners.
- **Men on a structure must be anchored to the stone they stand on**, or
  shelling the plinth out from under them leaves them hanging. The
  "defenders fall when their footing goes" test checks it.
- Every structure that holds a garrison must be `required` in the level
  record. A wing that shoots at the player all match and counts for
  nothing was wrong.

---

## 5. The level record

`src/game/levels.js`. Copy the nearest existing entry. The fields:

```js
<id>: {
  id, terrain: '<id>',                 // terrain id = level id
  name: 'Landmark, City', place, target: 'UPPERCASE', subtitle,
  victory: 'The pun the end card leads with',
  cityExcludeRadius,                   // keep the procedural city off the precinct
  contextExclude,                      // and the context props
  camera: { yaw, pitch, distance, height },   // the opening view, and the stand-off's landing view
  structures: (quality) => [
    { key, blocks: build...(quality), primary: true, required: true, label: 'UPPERCASE' },
    { key, blocks: ..., required: true, label },          // garrisoned → required
    { key, blocks: ..., label, offset: { x, z } },          // its own ground, elsewhere on the map
    { key, blocks: ..., required: false, scenery: true, label, offset },
    //  ↑ a landmark that is there for recognition, not for the bar: the London
    //    Eye. It comes down if shot and counts for nothing; it gets no precinct,
    //    no trench belt and no garrison, and its footprint is what touches the
    //    ground (blocks under 12 m), not the whole silhouette.
  ],
  garrison: (g, origin, groundY, sites) => { g.populate...(origin, groundY); },
  scoreTags: [...],                    // if a plinth or raft outweighs the monument
  precinct: { boundary, ground, ornament, river, obelisk, pier },
  palette: { urban, urbanAlt, park, parkAlt, road, bank, bed, dry },   // if not a temperate river city
  setting: { hinterland, canopy, canopyFrom, haze },   // what is beyond the town; see below
  traits: { windows, river, topples }, // what the suite must NOT assert here
  unlockScale,                         // for very massive monuments
  turret: { x, z, yaw, scale, minRange },   // a gun that shoots back (§3), if the place has one
  win / winSecondary,                  // only if the defaults are wrong
  brief: 'One line: what the player has to find out.',
},
```

Copy the nearest existing entry and change every field; a field left as the
neighbour's is the commonest way a new map ships with London's palette or
Paris's camera.

Add the id to `LEVEL_ORDER` (easiest first; nothing is locked) and a
line to `LEVEL_BLURB`.

- **`camera`** frames the *whole* monument from the side people know it
  from (the Trocadéro for the Eiffel, the charbagh for the Taj). Sit far
  enough back for the scaled height. The stand-off intro starts high and
  wide and glides onto exactly this view.
- **`cityExcludeRadius`** is the landmark's footprint plus its precinct.
  Too small and OSM buildings stand in the garden; too big and the
  monument stands in a paddock. The context builder also measures the
  real footprints, so streets come up to the precinct on the open sides.
- **`scoreTags`** exist because the Taj's 95 m plinth outweighs the dome:
  measured on everything, the dome fell and the number barely moved.
  Name the sections that *are* the monument; the plinth stays as ground.
- **`unlockScale`**: unlocks are fractions of all the mass on the map.
  On Giza that meant the RPG needed 0.6% of two and a third million cubic
  metres, so nothing ever unlocked. 16 there. A single tower needs 1.
- **`traits`**: the suite was written against a river city with a tower.
  A level says what it is not (`windows: false`, `river: false`,
  `topples: false`) and the suite reads that rather than being weakened
  for everybody.
- **Win rules**: 90% on the bar wins (`Battle.WIN_AT`). The bar is every
  objective's progress to its own threshold, weighted by mass. The primary
  is also done when under 30% of its height stands; secondaries too, since
  a wing shelled into a pile keeps its lowest courses intact under the
  rubble and reads 32% standing when there is nothing to shoot at.
- **`precinct`** is level data, not a builder special case. `boundary`
  `railings | sandstone | none`; `ground` `lawn | charbagh | sand` (lawn
  gets a perimeter gravel walk, walks in from the gates, beds and plane
  trees; charbagh gets the quartered garden with a water channel);
  `ornament` `statues | pavilions | none`; `river` `embankment | ghats`.
  A new place may need a new value here, which means a branch in
  `src/world/places.js` `buildPrecinct` and `src/world/context.js`.
- **`palette`**: the default ground is London (brick dust, parkland, wet
  silt). Giza needed sand. Anywhere not a temperate river city needs its
  own eight colours.
- **`setting`** is what lies beyond the surveyed town, and what the
  outskirts may do. `hinterland` is `'forest'` (Rio) or `'jungle'`
  (Chichén) for a canopy that closes in past `canopyFrom` metres at a
  density of `canopy` (2.5 is a wall of trees), `'harbour'` for Sydney;
  omit it for a city, where fields and hedgerows take over past the
  buildings. `haze: { colour, density }` is the fog — thin and blue seven
  hundred metres up, thick and warm over a desert. Every level that is not
  a temperate river city sets both `palette` and `setting`.
- **`victory`, `subtitle`, `target`, `place`** are the end card's pun, the
  level select's second line, the target card's uppercase name and the
  dossier's place line. Write all four; the campaign map and the level
  select read them and an empty one shows.

### 5b. The campaign record

`src/game/campaign.js`, `THEATRES`: one contract per level, in campaign
order. The Campaign HQ map draws its pin, label, dossier and burn from this
record and nothing else, and `campaignState()` walks it to decide what is
open. A level in `LEVELS` but not here is unreachable in the campaign.

```js
{
  id: '<id>',                  // the level id
  iso: 'BRA',                  // ISO 3166-1 alpha-3; must exist in public/assets/world.json (`i`)
  lx: 46, ly: 24,              // label offset from the pin, map pixels; move it off the coast
  city: 'RIO DE JANEIRO',      // the label
  lon: -43.2105, lat: -22.9519,
  no: 9,                       // the contract number: its index in LEVEL_ORDER + 1
  title: 'OPEN ARMS',          // two or three words, uppercase
  brief: 'Three or four sentences: the structural problem, plainly.',
  unlocks: ['m142'],           // unit ids released on close, or []
  unlockLine: 'HIMARS released',   // or 'Nothing new — you have it all'
},
```

- **The order is `LEVEL_ORDER`.** `campaignState()` opens the next id in
  that array when the previous is won. Keep `no` equal to the position.
- **`iso`** picks the country that burns when the contract closes. The
  atlas (`public/assets/world.json`) is a list of `{ n, i, p }` — name,
  ISO3, path — and a country not in it gets no land to burn. Check it.
- **The unlock chain is a decision, not a default.** Contracts 1–5 each
  release a unit (`m109`, `f15`, `m142`, `m270`, `b1`); 6–9 release
  nothing, and the dossier says so. A tenth contract at the end of the
  chain releases nothing unless a unit is moved or added. A unit with a
  rendered icon (`IMAGE_ICONS` in `src/ui/icons.js`) shows it on the
  dossier's release panel.

---

## 6. The trimmings that make it that place

- **Flag** (`src/world/flags.js`): one `FLAG_SITES[id]` entry on a stone
  that will fall when its building does (`snapToStone` finds it). A new
  nation needs a `PATTERNS` function: they are drawn on a canvas, twenty
  lines each.
- **Stand-off** (`src/game/cast.js`, `src/ui/standoff.js`): a `CAST`
  entry (id, file, rank in the nation's own usage, an invented name,
  nation, side `right`, three flag colours for the bubble trim and the
  dossier's stripe), `DEFENDER_OF[id]`, and `STANDOFF[id]` — three beats,
  US / defender / US, verbatim from the writer, and mirrored into
  `docs/SCRIPTS.md`. The bubble wraps at 44vw or 520px and is sized from
  the whole line before it types, so a hundred characters is fine; past
  that it crowds the figure on a phone. Non-Latin lines lay out on their
  own (`dir="auto"`); the font request includes an Arabic face and would
  need another for a new script. The officer's art is a cutout PNG under
  `public/assets/characters/<nation>-<rank>.png`, RGBA with the figure cut
  out and a soft dark halo in the alpha, about 1024×1536, catalogued in
  `manifest.json` (look, pose, side). If the art is not given, wire the
  file name anyway and say in the manifest that the slot is empty; the
  stand-off and the dossier both tolerate a missing image.
- **Recon photograph** (`tools/recon.mjs`): `node tools/recon.mjs <id>`
  with the dev server up renders the level from its own opening camera to
  `public/assets/recon/<id>.jpg`, 1280×720, for the dossier on the
  campaign map. Re-run it whenever the camera or the landmark changes
  enough to show. The dossier hides the figure if the file is missing, so
  a missing photo is a blank panel, not an error — which is why `mapcheck`
  looks for it.
- **Victory line**: the pun on the end card (`victory`). The card widens
  its title automatically past sixteen characters.
- **Blurb and brief**: one line each. The blurb is what kind of problem
  it is; the brief is the hint.

---

## 7. Verify, then ship

First the wiring, because it is the cheapest check and the one a person
forgets:

```
node tools/mapcheck.mjs <id>          # every file and table has its entry
```

It reads the level, campaign, cast, flag and blurb tables, and looks for
the terrain, city, portrait and recon files. It does not judge the map; it
says whether the map is *connected*. A missing campaign record or a
portrait path with a typo is the class of fault it exists for.

Then the harness, which drives the real game in headless Chromium:

```
npx vite --port 5177 --strictPort &                      # dev server
sh tools/suiteall.sh <id>                                # expect "<id>: 50 pass 0 fail"
TIER=high sh tools/suiteall.sh <id>                      # another tier
```

`suiteall.sh` runs the whole suite (`tools/suite.js` through
`tools/shot.mjs`) at low tier against the dev server, several levels at a
time when given several ids, and prints one line each. It sets `TT_SUITE=1`,
which drops the screenshots and the settling pauses a human would want.
For one scenario by hand: `TT_URL='http://localhost:5177/?level=<id>'
TT_TIER=low node tools/shot.mjs /tmp/out/<id> <scenario.js>`; the scenario
is any JS expression evaluated in the page, and may return a Promise.
Useful handles on `window`: `battle`, `primary`, `structures`, `terrain`,
`rig`, `garrison`, `testMenu`, `standoff`, `__fastForward(seconds)`,
`__runTests()`.

Before any of that, look at it from where the photographs are taken. The
suite says whether it stands; it cannot say whether it is the place.

```
node tools/postcard.mjs <id>                          # the level's own camera
node tools/postcard.mjs <id> --pitch 0.1 --dist 700   # try another
node tools/postcard.mjs <id> --survey                 # the load painter on
```

Low, from the side every picture of the building is shot from; put the
render beside the photograph, then fill in the proportion table from §0b
with the numbers you can now measure (`blocks.mjs` has the built ones).
Iterate there, on one level, one screenshot a minute, until the table is
right; only then run the suite. The Potala went through nine renders that
way and the suite once.

Two probes worth reaching for before the whole suite:

```
node tools/loose.mjs <id> low             # where the loose stones are, not how many
node tools/look.mjs /tmp/out/<id> <id>    # three views, plus the blind ranks
```

`loose.mjs` prints each detached stone's section, height, distance from the
origin and size, which usually names the bug without opening the builder:
four-centimetre stones at one height are a ring whose wall has gone to
nothing, and a whole tag at one height is a slab spanning further than
anything can carry it. `look.mjs` prints the blind defenders' height and
radius, which is how twenty-seven blind men at Chichen Itza turned out to
be on the other building two hundred metres away rather than on the
pyramid everyone assumed.

Rules of the harness, learned the hard way:
- Never edit a source file or run a heavy probe while a suite is in
  flight. Vite's reload corrupts the run and a concurrent probe caused a
  flaky Agra failure.
- Three browsers on one software rasteriser is what the box has cores
  for. A single test dropping under that load and passing alone
  (`JOBS=1`) is load, not a bug; the same test dropping twice is a bug.
- Probe the ground with `window.primary.groundY`, not `window.groundY`.
- The software rasteriser renders at about a frame a second, so
  wall-clock waits advance almost no game time. Use `__fastForward`.
- Giza at high and Paris at ultra time out in the rasteriser; verify those
  at low.
- Iterate on *one* level. A change to the masonry or the streets is a
  change on every map, and the nine take seven minutes; find the fault on
  one, fix it, then run the nine once.
- Scratch probes live under `tools/` (Playwright resolves from the repo)
  and are deleted before the commit.
- A test that spawns or aims at a fixed offset from the origin is a test
  that assumes a footprint. The deployment test put its unit at (0, 160)
  and the Potala's terraces reach z 215; it now spawns beyond the
  structure's own extent. Derive coordinates from the structure, not from
  the eight landmarks that happened to fit.

A level is done when `mapcheck` is clean, the suite is 50 pass 0 fail at
low tier, the production build (`npx vite build`) is clean, and you have
*looked* at it: the opening camera, the precinct from close in, both banks
of the river or the whole shore, the mouths where the water leaves the map,
the recon photo, the dossier on the campaign map, the stand-off with the
longest line, and one collapse. The first pass should get the map ninety
per cent of the way; the last ten is someone looking at those pictures and
saying what is wrong.

Ship: commit to the branch the session names, fast-forward `main`
(`git push origin <branch>:main`), and confirm the "Deploy to GitHub Pages"
run is green (poll `actions/runs?branch=main&per_page=1` for the commit's
`completed success`). The remote is `getarsenal/Excessive-Force`; the repo
has been renamed twice and pushes to the current name work.

---

### Several maps at once

The third five were built in parallel, one landmark per worktree, and the
shape of that is worth keeping. The skeleton first, in the main checkout:
bakes, level records with one placeholder block each, contracts, cast,
scripts, flags, manifest slots — everything in the file table except the
masonry — committed and pushed to the branch, not to `main`. Then a
worktree per map (`git worktree add /home/user/wt-<id> -b wt/<id>`, with
`node_modules` symlinked from the main checkout), each with its own dev
server on its own port, and every tool told about it: `TT_PORT=<port>` and
`OUT=/tmp/out-<id>`. The builder edits its own module and, if it must, its
own level record, and nothing else, so the five branches merge without a
conflict. The garrison lives in the landmark module as
`populate<Name>(g, origin, groundY)` for the same reason — five people
adding methods to `defenders.js` at once would not merge. The box has cores
for three browsers in total, so each builder runs one at a time and none
while its own suite is up. `docs/THIRD_FIVE.md` is the brief that was
handed over, and is the model for the next batch.

## 8. The request, and what it turns into

When the ask is *"make a map for X in Y"*, the deliverable is all of the
following, in this order, each verified before the next:

1. The kind of problem, the scale, and the twist — stated in one
   paragraph before any code.
2. Terrain and city baked and committed (both bakes; `WILD_COVER` if the
   ground is wild); the water, the far water line and any pads checked
   in-game.
3. The builder, with the model standing loose-stone-free at every tier
   and going over (or not, by design) when undercut.
4. Interiors and the trick; a turret if the place has a gun.
5. The garrison, within the blind baseline, anchored to the stone.
6. The level record, with camera, precinct, palette, setting, traits and
   win rules; `LEVEL_ORDER` and `LEVEL_BLURB`.
7. The campaign record in `THEATRES`, with the ISO code checked against
   the atlas and the unlock chain decided.
8. Flag, officer, stand-off script (ask the writer for the lines if they
   are not given; draft one option and mark it as a draft), the recon
   photograph, `docs/SCRIPTS.md`.
9. `mapcheck` clean, suite green at low tier, build clean, the pictures
   in §7 looked at, deployed, deploy run green.

The first four maps needed no engine change at all, and that was worth
saying. The second five needed six, and every one of them was the engine
being wrong rather than the map being clever: a bearing walk that settled
same-height edges in whatever order the height sort happened to produce; no
rule at all for a cantilever; a railway that picked its side of the map at
random and landed in a harbour; a building bedded to its low corner and
buried when the ground fell more than seven metres across its plot; a roof
level with the hillside still offered as a firing position; a flatten pad
that could only be a disc levelled to the median of the ring round it.

So the rule stands, with the exception stated: a new map should not need
new *gameplay*. If it seems to need a new unit type, a new UI, or a special
case in the win rules, the design is wrong for the engine and it is worth
saying so before building it. If it turns up a physical situation the
solver has never been asked about — a shell, a cantilever, a coast, a
mountain — that is not the map being difficult, that is the map finding a
hole, and the fix belongs in the engine where every later map gets it.
