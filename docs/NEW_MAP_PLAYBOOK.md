# New map playbook

How to add a landmark to Excessive Force, written after four of them:
the Elizabeth Tower, the Taj Mahal, the Eiffel Tower and the Giza plateau.
Everything below is what the code actually does today, not what it was
meant to do. When the two drift, fix the code or fix this file.

A map is: a real place baked into a heightmap, a masonry model of the
landmark laid up stone by stone, a garrison posted on it, a level record
that ties them together, and the trimmings that make it read as *that*
place rather than as a monument on a plate. The engine is generic. Adding
a map touches these files and nothing else:

| File | What goes in it |
|---|---|
| `tools/bake_terrain.py` | The place: lat/lon, river polyline, parks, pads to flatten. Run it once to bake `public/assets/terrain/<id>_{height,mask}.png` + `<id>.json`. |
| `src/structure/landmarks/<name>.js` | The masonry. One exported builder per structure, returning a `BlockList`. |
| `src/game/defenders.js` | `populate<Name>(origin, groundY)`: where the garrison stands. |
| `src/game/levels.js` | The level record: camera, structures, garrison, precinct, win rules, blurbs. Add the id to `LEVEL_ORDER` and `LEVEL_BLURB`. |
| `src/world/flags.js` | `FLAG_SITES[id]`: where the flag flies, and a pattern for the nation if it is a new one. |
| `src/game/cast.js` | `CAST.<nation>`, `DEFENDER_OF[id]`, `STANDOFF[id]`: the defending officer and the three-line stand-off. |
| `public/assets/characters/<nation>-<rank>.png` | The officer's cutout, RGBA, roughly 1024×1536, and a line in `manifest.json`. |
| `src/ui/levelselect.js` | Nothing, if the level record is complete. |

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
},
```

Then `python3 tools/bake_terrain.py <id>`. It fetches AWS Terrarium
tiles (no key), writes the three files, and prints the elevation range.

Then `python3 tools/bake_overture.py <id>`, which is the one that matters. It
re-cuts the DEM, pulls the buildings, the street graph and the real coastline,
and writes `<id>_far.png` — the water for seven spans in every direction, which
is what the surround and the skyline are drawn over. Read the line it prints:
`far water: N polygons, X% of the K km square`. A coastal or riverside place
that comes back at nought per cent has a bake that did not reach its own water,
and the level will render as a field with a monument in it.

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
    straightens the run onto its chord, lifts it three metres over the bank,
    ramps the roads at each landing and hands the line to `buildBridge` for
    arches, piers, balustrade and lamps.
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
- **The guns have to have somewhere to stand.** This is the constraint that
  decides the shape of a summit. A howitzer below a rise puts its shell into
  the rise: on the Corcovado cut to its true platform, ten rounds went out
  and ten landed at the guns' own feet. The suite spawns its battery at 220 m
  and the ring test at 170 m, so the ground has to be level out to about
  250 m in the direction the guns come from. Offset the pad — a ridge rather
  than a cone — and the rim can still be close on the side the camera looks.

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
the builders take `quality` and derive `stone` from it. Two rules that
bit us:

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
  ],
  garrison: (g, origin, groundY, sites) => { g.populate...(origin, groundY); },
  scoreTags: [...],                    // if a plinth or raft outweighs the monument
  precinct: { boundary, ground, ornament, river, obelisk, pier },
  palette: { urban, urbanAlt, park, parkAlt, road, bank, bed, dry },   // if not a temperate river city
  traits: { windows, river, topples }, // what the suite must NOT assert here
  unlockScale,                         // for very massive monuments
  win / winSecondary,                  // only if the defaults are wrong
  brief: 'One line: what the player has to find out.',
},
```

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

---

## 6. The trimmings that make it that place

- **Flag** (`src/world/flags.js`): one `FLAG_SITES[id]` entry on a stone
  that will fall when its building does (`snapToStone` finds it). A new
  nation needs a `PATTERNS` function: they are drawn on a canvas, twenty
  lines each.
- **Stand-off** (`src/game/cast.js`, `src/ui/standoff.js`): a `CAST`
  entry (file, name, side `right`, three flag colours for the bubble
  trim), `DEFENDER_OF[id]`, and `STANDOFF[id]` — three beats, US /
  defender / US, verbatim from the writer. Non-Latin lines lay out on
  their own (`dir="auto"`); the font request includes an Arabic face and
  would need another for a new script. The officer's art is a cutout PNG
  under `public/assets/characters/`, catalogued in `manifest.json`.
- **Victory line**: the pun on the end card (`victory`). The card widens
  its title automatically past sixteen characters.
- **Blurb and brief**: one line each. The blurb is what kind of problem
  it is; the brief is the hint.

---

## 7. Verify, then ship

The harness drives the real game in headless Chromium. From the repo:

```
npx vite --port 5177 --strictPort &                      # dev server
TT_URL='http://localhost:5177/?level=<id>' TT_TIER=low \
  node tools/shot.mjs /tmp/out/<id>-low tools/suite.js   # the whole suite
python3 tools/report.py /tmp/out/<id>-low-console.txt    # pass/fail summary
```

`TT_TIER` is `low | medium | high | ultra`; `TT_INTRO=1` keeps the
stand-off (the suite turns it off). A scenario file is any JS expression
evaluated in the page; it may return a Promise. Screenshots land beside
the console log. Useful handles on `window`: `battle`, `primary`,
`structures`, `terrain`, `rig`, `garrison`, `testMenu`, `standoff`,
`__fastForward(seconds)`, `__runTests()`.

Two probes worth reaching for before the whole suite:

```
node tools/loose.mjs <id> low      # where the loose stones are, not how many
node tools/look.mjs /tmp/out/<id> <id>   # three views, plus the blind ranks
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
- Probe the ground with `window.primary.groundY`, not `window.groundY`.
- The software rasteriser renders at about a frame a second, so
  wall-clock waits advance almost no game time. Use `__fastForward`.
- A level is done when the suite is 35 pass 0 fail at low tier, the
  production build (`npx vite build`) is clean, and you have *looked* at
  it: the opening camera, the precinct from close in, both banks of the
  river, the mouths where it leaves the map, and one collapse.

Ship: commit to `claude/landmark-destruction-game-4gxy06`, fast-forward
`main` (`git push origin <branch>:main`), and confirm the "Deploy to
GitHub Pages" run is green. The remote stays on the old repo URL
(`getarsenal/Excessive-Force`). The repo has been renamed twice —
Tumble-Town, then this — and pushes to the current name work; if a
credential ever fails, the old URL redirects.

---

## 8. The request, and what it turns into

When the ask is *"make a map for X in Y"*, the deliverable is all of the
following, in this order, each verified before the next:

1. The kind of problem, the scale, and the twist — stated in one
   paragraph before any code.
2. Terrain baked and committed; the river and any pads checked in-game.
3. The builder, with the model standing loose-stone-free at every tier
   and going over (or not, by design) when undercut.
4. Interiors and the trick.
5. The garrison, within the blind baseline, anchored to the stone.
6. The level record, with camera, precinct, palette, traits and win rules.
7. Flag, officer, stand-off script (ask the writer for the lines if they
   are not given; draft one option and mark it as a draft).
8. Suite green at low tier, build clean, screenshots looked at, deployed.

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
