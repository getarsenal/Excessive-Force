# Excessive Force

A 3D artillery demolition game: real landmarks on their real ground, laid
up stone by stone, brought down by the player's guns. Three.js + Rapier
WASM, Vite, deployed from `main` by GitHub Pages to https://getarsenal.app.

## Working rules

- Every task goes all the way to production. **Deploy first, then test**:
  once it builds (`npx vite build`), commit, fast-forward `main` and confirm
  the deploy run green, so the owner has it immediately; then run the suite
  and fix what it finds in a follow-up deploy. Do not stop to ask.
- Develop on the branch the session names (most recently
  `claude/excessive-force-handoff-i40ha3`). Deploy is
  `git push origin <branch>:main`. The remote is
  `https://github.com/getarsenal/Excessive-Force`; the repo has been
  renamed twice and pushes to the current name work.
- Never commit synthetic fixtures to `public/assets/city/`. Never put a
  model identifier in a commit message, code comment or asset.
- Do not edit source or run heavy probes while a harness suite is running:
  the dev server's reload corrupts the run.
- **Keep the tutorial current.** Boot Camp (`src/ui/tutorial.js`, level
  `tutorial`) teaches the real HUD by pulsing its real buttons. Any change
  to the HUD, the dock, the arsenal, targeting, strikes or the win rules
  updates the tutorial's steps in the same commit, and the tutorial's own
  suite run (`sh tools/suiteall.sh tutorial`) stays green. It opens on a
  shot, not a lecture: four M777s (`u.demo`, left out of the lessons'
  counts) laid on a brick smokestack (tag `stack` in the Boot Camp spec),
  the garrison holding fire, one tap on its foot and it is down in five to
  nine seconds. `node tools/tutorialwalk.mjs` walks it all (`W=393 H=852
  OPENER=1` for the first shot on a phone, with the seconds it took);
  `TAG=stack AIM=base node tools/firstboomprobe.mjs` is the battery alone.
- **Keep it a phone game.** The HUD is laid out for a thumb first: every
  control forty-four points a side under `pointer: coarse`, nothing a
  player must read under ten pixels, every edge anchored to `--pad-l` /
  `--pad-r` (the gutter or the safe-area inset, whichever is larger), the
  dock sized by `--dock-h` so five fit a 360-wide phone. Everything that
  talks in a fight sits in the talk band (`--talk-top`), never in the lower
  middle where the fingers go; on a portrait phone the band hangs under the
  right-hand column (`--right-bottom`, published by the HUD). The one
  exception is the crews' barks (`src/ui/barks.js`): a small line at a fixed
  pixel size standing over its own gun, following it on the screen. Say a
  thing once: one event is one line (the feed merges repeats by `key`), a
  stamp at most every two seconds, a general at most every twenty-five, and
  `node tools/chatterprobe.mjs <level>` counts what a five-minute fight says
  per channel. A phone on
  its side (`orientation: landscape` and `max-height: 500px`) is the
  two-thumb layout: dock split to the two bottom corners, drawers as a
  side panel up the left edge. After any HUD change run
  `node tools/mobaudit_run.mjs iphone15pro-portrait iphone15pro-landscape`
  and the same with `TT_LEVEL=moscow`, a boss battle, whose warlord bar is a
  row of the top bar that Westminster never shows
  (sets the real insets through CDP, screenshots every state into
  `/tmp/out/mobaudit/`, prints small targets / overlaps / clipping /
  safe-area hits per screen) and read the numbers before the pictures;
  `node tools/landshot.mjs` and `W=393 H=852 node tools/landshot.mjs` are
  the quick two-shot versions. With a weapon armed one finger lays a line
  of guns: main.js keeps its own count of fingers (`livePointers`) and must
  never trust it past the glass: it starts over on a new primary touch,
  drops a finger lifted anywhere on the page, and clears when the glass
  reports itself empty, because one finger the system swallowed made every
  later drag a two-finger gesture for the rest of the battle; a dragged
  line deploys the weapon it was drawn with, not whatever is selected after
  the first unit lands, and a placement never disarms the card, with the
  lift or without it (Blitz cleared it after every gun). `node tools/lineprobe.mjs` (`NOLIFT=1` for Blitz's
  path) plants a lost finger and drags three lines.

## Verify

```
npx vite --port 5177 --strictPort &
sh tools/suiteall.sh <id>...            # expect "<id>: 50 pass 0 fail" per level
npx vite build
```

`suiteall.sh` runs three browsers at a time against the one dev server, which
is what the box has cores for: all sixteen levels in thirteen minutes rather
than thirty-eight. `JOBS=1` for a clean timing, `TIER=high` for another tier. It sets
`TT_SUITE=1`, which drops the three screenshots and the twelve seconds of
settling between them — those exist so a human can look, and a regression run
is not a human looking.

Iterate on *one* level. A change to the masonry is a change to the masonry on
every map, and finding that out costs seven minutes each time; find the fault
on one level, fix the batch, then run the sixteen once. `suiteall.sh` rewrites
`<id>-console.txt` only when that level's run *finishes*, so a report read out
of a batch still in flight is the previous run's — check the file's mtime
before believing a failure.

Levels 42 to 100 are the catalogue, generated from data by
`src/game/atlas.js` (see "Many maps at once" in the playbook); their order
is `src/game/atlas_places.js`. `node tools/kitcheck.mjs <id> --solve` is the
building dry, and a level there is new rows in three files, not a module.

The campaign is eight operations of four battles and a boss, then the
Great Wall (`src/game/operations.js`): stars per battle (win, par, the
battle's challenge), six of an operation's twelve to open its boss, a boss
is won only with the warlord's bunker (the command post) destroyed, and
the catalogue opens as side operations, seven per boss. The original
sixteen, in suite order: `westminster`, `paris`, `agra`, `giza`,
`chichen`, `pisa`, `sydney`, `moscow`, `rio`, `athens`, `istanbul`,
`cologne`, `himeji`, `petronas`, `dubai`, `potala`. Tiers: `low` (phones;
the grid is coarsened) to `ultra`. Giza at high and Paris at ultra time out
in the software rasteriser; verify those at low.

`node tools/newmap.mjs <id> "Landmark, City" lat lon --iso --city --nation
--code` scaffolds a level into every table it touches;
`node tools/mapcheck.mjs <level>` says whether a level is wired everywhere
it has to be (tables, bakes, contract, portrait, recon) before the suite is
worth running. `python3 tools/survey.py <level>` is the aerial survey out of
the bakes — the ground under the origin and every named building the
exclusion radius is about to delete. `node tools/blocks.mjs <level>` runs
the builder in Node in a quarter of a second: stones, the box above ground,
sections, material share by colour; `node tools/loosecheck.mjs <level> low`
runs the support solver on it, also in Node, and names every loose stone. `node tools/postcard.mjs <level>`
renders it from the level's own camera with the HUD cleared.
`node tools/wateraudit.mjs <level>...` says whether the water is right: how
much stands above its own surface (must be none), how many pieces it is in,
and every boat position over ground or through a building (must be none). `node tools/loose.mjs <level> low` says *where* the loose stones are and
`node tools/look.mjs /tmp/out/<id> <level>` gives three views plus the
blind ranks — both are quicker than the whole suite while building.
`sh tools/suiteall.sh <level>...` runs the suite over several levels and
prints one line each.
`node tools/perfprobe.mjs <level> [units] [seconds] [warm-up]` puts an army
on the ground, runs the fight and prints milliseconds per simulated second
for each system and the draw calls with and without the units.
`node tools/stressprobe.mjs <level> [units] [tier]` is the phone's question:
units in batches of six with the fight stepped between, and after each
batch the JS heap, the renderer's geometries and textures, render and
update time apart, physics bodies and context loss. Geometries must hold
level as units die and sorties land: `scene.remove` gives nothing back,
`releaseTree` (`src/core/release.js`) does, and every path a unit, a
sortie, a sling or a chute leaves the scene by calls it.
A gun past `LOD_DIST` (67 m, `src/game/units.js`) is drawn with its far
model: the finished wrapper (barrel already cut) cloned and every mesh
simplified by meshoptimizer to five centimetres of error in a worker
(`src/game/lodworker.js`), colour-aware for the vertex-painted ones, so
the far copy has the same pivot and barrel and `battle._lod` swaps the
two by the camera's distance and poses whichever is shown, a gun still in
the lift too (its stand-in, `drop.stub`, under the Chinook or the canopy:
it flew in on its near model, and sixteen M777s in the sling were 4.56
million triangles a frame, now 1.83; `node tools/heliprobe.mjs westminster
16 low m777 40` counts every pass's triangles). Past `LOD2_DIST` (333 m)
a gun draws a third copy, the far one simplified again to a quarter of a
metre (an M777 2,845 triangles), and guns are culled to the view like
everything else (they were not: every gun on the map was drawn, behind the
camera or not). `node tools/armytris.mjs saintsava 240` puts a 240-gun
battery down on a phone's screen and counts a frame with and without it:
the guns were 1.63 million triangles and 576 calls, now 82,000 and 179.
An M777 is 182,675 triangles near and 11,844 far. `node tools/lodshot.mjs` renders
each gun near and far side by side; `node tools/unitcost.mjs <level>`
counts what the deployed units cost a frame.

## The real world

`tools/bake_overture.py <level>|--all` pulls the actual place out of the
Overture Maps Foundation's GeoParquet on public S3 and writes the
buildings and street graph to `public/assets/city/<level>.json` and the
coastline and land cover into `public/assets/terrain/<level>_mask.png`,
dredging `<level>_height.png` underneath it so the two agree. It re-cuts
the DEM first, so it is safe to re-run.

Both halves are cached outside the repo — the DEM tiles in `/tmp/tt-tiles`,
the Overture queries in `/tmp/tt-overture`, keyed by release, theme, square and
columns. A release is immutable, so a re-bake after a change to the mask, the
dredge or the packing is two seconds rather than a minute a level. `--fresh`
bypasses it; deleting the directories costs one slow bake.

The bake also writes `<level>_far.png`: the same Overture water, burned a
second time over a square seven spans wide at forty metres to the pixel, with
`farSpan` recorded in the terrain JSON. That is how far the surround apron and
the skyline ring reach, and past the map edge the loader used to have only two
answers — open sea everywhere if the boundary happened to be wet, dry country
everywhere if it did not. Rio is the case that proves it: the level is the
summit of the Corcovado, the Lagoa is two kilometres out and Botafogo three,
both of them below you and in front of you the whole game, and the map had
neither. `terrain._farWet` now answers for the distant water, `surfaceAt` sinks
a bed under it, and `createWater` lays the sheet on it — at the level's own
waterline, which for a mountain is sixty metres out and invisible, where a
second waterline in the same picture would not be.

Every bake ends by checking itself against its own other half: the origin is
not under water, the wet half of the map is the low half, nothing wet stands
above its own surface, and the surveyed buildings are on the surveyed land.
That last one is the only one that catches a flipped mask, because the dredge
follows the mask and the two agree with each other however wrong they are.

The city file carries two sets. `buildings` is the playfield: outlines,
heights, and what the game lays up, collides and deploys on. `outer` is
everything from the boundary out to 2.25 spans, flat-packed six numbers at
a time — x, z, w, d, yaw in degrees, height — and built by
`src/world/surround.js` as boxes with no physics and no plots. That split
is why the surround costs a few hundred kilobytes rather than megabytes.

Egress: `s3.amazonaws.com` and `raw.githubusercontent.com` are allowed.
Overpass, `tile.openstreetmap.org`, `basemaps.cartocdn.com` and
`extensions.duckdb.org` are all 403 at the proxy — organisation policy,
so report it rather than retrying. Needs `pyarrow`, `shapely`, `pillow`.

There is one world builder. `buildContext` invents a city when no bake
exists and lays the surveyed one on the surveyed streets when it does; it
builds the roads, parks, trees, furniture, railway and the surround either
way. The console line on load says which, and how much of each. What is
beyond the map decides what the outskirts may do: fields and hedgerows keep
off ground the surveyed city stands on.

## Adding a map

Read `docs/NEW_MAP_PLAYBOOK.md`. The `new-map` skill walks the steps.

## Where things are

- The particles' fill budget (`ExplosionFX._govern`, `src/fx/explosion.js`):
  every puff is a blended quad, and a MOAB seen from close in was a hundred
  and sixty screens of fill a frame. A puff is never drawn wider than half
  its distance and fades out inside a few metres (the vertex shader in
  `src/fx/particles.js`); the fill is added up from the camera every frame
  and past `fx.fillBudget` screens (twenty on a phone, forty otherwise)
  the big pools are drawn thinned to a stable share (`thin`).
  `NEAR=1 LATE=1 EDGE=1 node tools/moabprobe.mjs <level> low` calls a
  Lancer with the camera on it over a town already burning and prints the
  fill a second (raw, drawn, the governor's), the milliseconds and heap of
  each system the impact touches and the buffers before and after; `SHOT=1`
  photographs the cloud at the budget, unbudgeted and at a phone's. A
  gutted building (`cityfire.burn`) sends only its own stretch of the
  town's buffers to the GPU (`addUpdateRange`), not the whole of both.
- `src/core/blackbox.js` the crash recorder: a phone that kills the tab
  reloads to the title with nothing caught, so every two seconds of a
  battle a snapshot goes to storage (`tt.blackbox`, the last thirty:
  clock, fps, guns, lift, aircraft, rounds, bodies and budget, sections,
  stone down, town burnt, geometries, textures, programs, visible
  triangles, particles and fill, heap where told, context loss, the last
  dozen events; a lost context or a frame fault at once), and the next
  boot that finds power.js's mark (only a page that died in view leaves
  it) files it in `tt.crashes` (the last five), says so in the feed, and
  shows it in the test panel's CRASH RECORDER with COPY LAST CRASH.
  `node tools/crashprobe.mjs` kills a page with CDP `Page.crash` and reads
  back what was filed.
- `src/core/power.js` how hard the game works a phone: the battery saver
  (thirty frames in battle, on by default on a phone), a few frames behind
  a menu, and `power.lean` (any phone, or the saver), which takes the
  savings that cost nothing to look at: the shadow map drawn on demand
  (`placeSun` in main.js: every other frame while `battle.shadowBusy` or
  the physics has bodies awake, three times a second otherwise, at once
  when the focus crosses a thirty-metre square; `window.__shadows()`
  counts frames and redraws) and no frosted glass (`body.lean`). The
  audio context is suspended and the menu track paused with the page
  hidden, the hangar is paced to thirty, and nothing on the page animates
  forever off screen (the news ticker sat at -104% running all battle).
  `TIER=medium node tools/triprobe.mjs <level>` counts a frame's
  triangles by group and what of them casts shadows;
  `node tools/shadowprobe.mjs <level>` counts shadow redraws quiet, under
  a deploying battery and in a pan, saver on and off, photographs both
  and counts the frosted elements left on the page.
  `PORTS=5178:before,5177:after RUNS=3 FRAMES=30 node tools/powerbench.mjs`
  measures two builds the same way (an old checkout served on 5178):
  four scenes driven frame by frame through `window.__frame` at the
  iPhone tier, each draw timed to `gl.finish`, triangles, calls and shadow
  redraws counted; `python3 tools/powerstats.py <dir> --json out.json`
  gives medians, bootstrap intervals and fight mixes, and
  `python3 tools/powerreport.py out.json out.html` the page. The first
  measured pass is `docs/perf/power-2026-10-09.*`: a typical fight 30%
  fewer triangles a frame, shadow redraws 100% to 31% of frames, draw
  time 22% less.
  On the phone, the test panel's PERFORMANCE & BATTERY section has two.
  RECORD MY PLAY (`src/ui/playmonitor.js`) records the player's own play,
  touching nothing: every drawn frame a row a minute (frame rate, hitches,
  CPU work, GPU time where readable, how busy each was a second at a
  time, triangles, shadow redraws, guns, rounds, aircraft, stone down)
  beside the battery's level, every change of which is logged with its
  time so the drain is taken between the first and last change; the state
  lives in `tt.perflive` and every boot picks it up, so it runs across
  battles until STOP & SHOW (one left half an hour without a frame is
  closed on the next boot); the TEST button wears REC and the time; the
  card has sparklines of frame rate, busy and battery, the minutes, the
  phone's own percentages typed in where Safari reads none, and the last
  twenty sessions (`tt.perfsessions`); `MINUTE=10 node tools/playprobe.mjs`
  runs it headless across a page reload. The scripted fight is the other.
  The scripted run
  (`src/ui/perftest.js`) runs QUICK (two and a half minutes: quiet, the
  camera circling, a battery firing, an F-15 and the gunship, quiet again
  with the guns gone and the view restored, the landmark's foot blown out)
  or LONG (ten: the same, then seven minutes of fight and quiet at the
  end) through the real frame loop (`perfTest.beforeRender`/`afterRender`
  round the draw in main.js), with the battle held from ending
  (`battle.holdEnd`), and measures every drawn frame: interval, CPU work,
  the GPU's own time where `EXT_disjoint_timer_query_webgl2` exists
  (Android Chrome, not Safari), triangles, calls, shadow redraws, heat
  (first quiet against the second, or LONG's first minute against its
  last), the battery through `navigator.getBattery` (not Safari: the card
  takes the phone's percentages typed in), heap and the governor's stage.
  The card compares with the last run on the same level and tier, keeps
  thirty (`tt.perfruns`), and COPY RESULTS puts the record on the
  clipboard to send. `SCALE=0.15 node tools/perftestprobe.mjs` runs it
  headless through the panel and prints the record.
- `public/sw.js` the offline copy, registered by a built game only (never
  the dev server; `?nosw` removes it): the page network-first with a
  three-second fallback, Vite's fingerprinted bundles kept for good, the
  rest (level data, terrain, models, sound) served from the cache and
  refreshed behind it; a page that differs from the one kept is a deploy and
  empties both caches. `node tools/offlineprobe.mjs` loads a level online,
  again offline, and fakes a deploy. Boot: `MARKS=1 node tools/loadprobe.mjs
  <level>` against `vite preview --port 5190` (cold, warm, first frame;
  `QS=` adds a query), `TT_PORT=5190 node tools/bootprofile.mjs <level>`
  totals the load's CPU by function, and `node tools/programprobe.mjs` lists
  the shader programs. A shipped build skips three's synchronous shader
  checks (`?shadercheck` puts them back): two to four seconds of boot.
- The town's detail, made to read from the guns' distance at about a
  box's cost: `src/world/carkit.js` the cars (a side profile extruded,
  a narrower glasshouse with the roof in the paint, tail lamps, tyres;
  saloon, hatch, estate, van; parked ones on the kerbs and in car parks
  with a block a tyre pair, the traffic one instanced saloon whose paint
  is the instance colour; `node tools/carshot.mjs <level>` close and far,
  `BOAT=1` frames a boat); `src/world/craft.js` the boats (each kind's
  hull lofted to its draft so the waterline is at y 0, bulwarks over a
  sunk deck, antifouling, boot-top and sheer stripe; houses with a band
  of glass, wheelhouses, banded funnels, rails, sails on spars;
  `node tools/boatshot.mjs [kinds]` puts every kind on one sheet with its
  triangles) and `life.js` afloat (heave, pitch and roll by `roll`, a V
  wake per boat in one instanced draw at renderOrder 6, after the water,
  and boats lying alongside at `_moorings`, which the speed test skips);
  `src/world/notables.js` the surveyed churches, mosques, shrines and
  stations dressed in their city's manner (`STYLE` by level: Gothic,
  Romanesque, Orthodox, Byzantine, Ottoman, Islamic, Japanese), walls held
  between `minHeight` and `maxHeight` whatever the survey guessed, towers,
  minarets, domes and vaults as colliders through `plot.extra`
  (citybodies.js), all burning with the building; names with "St" alone
  are not churches; `node tools/notableshot.mjs <level>` lists and frames
  them; `src/world/beaches.js` parasols and loungers on warm sea fronts
  facing open water; `node tools/shoreshot.mjs <level>` frames a level's
  waterfront. Triangles before and after: `TT_PORT=5178 TIER=medium node
  tools/triprobe.mjs <level>` against a snapshot of the old build.
- `src/world/look.js` the art direction: the climate's sky, fog, water
  and light palette (`LOOKS`), and the shared material hook (`stylize`:
  wrapped diffuse, value by face, stone edges). Perf is measured against
  `docs/snapshots/pre-beauty-v1-perf-westminster.txt`; revert recipe in
  `docs/snapshots/pre-beauty-v1.txt`. `node tools/renderprobe.mjs <level>`
  is the render-only A/B (median frame, calls, triangles, programs) and
  `node tools/unitshot.mjs <level>` photographs a battery from close.
  `look.js` also patches two guards into three's own shader chunks at load:
  a floor under r186's multi-scatter compensation (one over a near-zero
  lookup at a smooth model's silhouette was a pure white pixel, bloomed to
  a sparkle on every gun, soldier and sandbag) and a fade on the sky's
  reflection over the last ten degrees to the edge; `TAG=x DIST=22
  PITCH=0.35 node tools/sparkleprobe.mjs` shoots a battery close up,
  patches the guards out and in on the same frame and counts the white rim
  pixels either way. Specular fireflies are a shader question before they
  are a lighting one: look at the dots at one-to-one first.
  `src/fx/contactshadows.js` grounds the guns where there is no shadow map;
  the grade pass in `src/core/engine.js` is also the output pass.
- `src/game/airframes/` the aircraft, one module each (`geo.js` is the
  loft/surface vocabulary they are built from); the A-10 is still in
  `aircraft.js`. A builder says what an aircraft is made of a part at a
  time and ends in `bakeAirframe(g)`, which merges every static part that
  shares a material into one mesh and leaves what the sorties move alone
  (anything named, and whatever a part's `userData` points at): a Chinook
  is 16 meshes in flight, not 79, an Apache 25, not 218. Painted skins and
  tail codes go through `cachedSkin`, one texture per kind for the
  session, marked keep. `node tools/heliprobe.mjs <level> [n] [tier]
  [kind] [seconds]` flies a lift of n towed guns under n Chinooks (or any
  other kind under the C-130) and prints, every five seconds, the heap,
  geometries, textures, the sorties alive and down, the garrison's hits on
  them, and the worst single step of each simulation system. Each keeps its real dimensions, nose along +Z, and the
  named parts the sorties drive (`bomb`, `prop`, `rotorA`/`rotorB`,
  `tailrotor`, the Apache's chin turret `userData.gun`, which the sortie
  slews with `_layGun`; `node tools/apacheprobe.mjs` follows it in a
  fight, and `GUN=yaw,el FOCUS=x,y,z,dx,dy,dz` on the contact sheet poses
  and frames a close-up), and leaves a clean flat panel either side of the forward
  fuselage for the nose art (`userData.noseArt` says where, when the box
  would mislead the painter). `node tools/hangarshot.mjs [kinds]` builds
  and photographs them from four sides and prints where the art lands.
  `src/ui/hangar.js` is the HANGAR sheet off the title: the fleet on the
  apron, turnable, and the nose art each type wears (`tt.noseart`), which
  `decorate(model, kind)` then paints on every sortie;
  `node tools/hangarprobe.mjs` drives it on a phone. An airframe in the
  hangar's `GUNS` table gets the live-fire range: three boards down the
  lane, a FIRE button, tap a board to lay the gun (the Apache's turret by
  the sortie's own arcs; a fixed gun by swinging the aircraft on its
  stand), each gun at its real rate and belt — M230, GAU-8, the F-15E's
  M61 out of `userData.gunPort`, the gunship's 30 mm and 105 with a switch.
  `KIND=<kind> WPN=1 node tools/rangeprobe.mjs` holds the trigger and reads
  the count. Nose art is painted,
  not stuck on: `paintNoseArt` projects it onto the fuselage with three's
  `DecalGeometry`, from the cut-out (`<id>-cut.webp`, the poster's dark
  ground removed by `python3 tools/noseart_cut.py SRC OUT --check SHEET`);
  the gallery shows the whole painting (`<id>.jpg`). A new piece needs both.
  The contact sheet's `-nose.png` view is the close-up to judge it by.
- `src/game/range.js` THE RANGE (level `range`, off the title beside
  HANGAR): a live-fire range out on Boot Camp's Mojave desert at Fort
  Irwin, on the normal battle pipeline, so every weapon is deployed and
  laid as in a fight. Open sky (a hall's ceiling cut off the mortar's arc
  and the aircraft): a graded floor painted with lanes and distances and
  fading into the sand, earth berms down both sides, distance boards on
  posts, range control and the red flag behind the line, creosote and rock
  beyond; four lanes seventy metres apart down -z from the firing line
  (the level origin): paper silhouettes on gantries at 50/100/150 that flip and rise, steel poppers
  at 100/200/300 on hinges, gongs on chains at 300/400/500 that swing and
  ring, the block shack at 180 (three hundred blocks, each its own body,
  thrown by a blast and flying back to their courses when they have
  settled), a tank plate at 460, and two target drones towing sleeves on
  a racetrack over the far third for the machine guns (published to
  `battle.enemyAir`; a hand-laid burst finds them and the plates through
  `battle.extraTargets`). Every collider's owner carries `range`;
  `battle._onImpact` routes a round into one to `range.hit` and every
  impact to `range.blast`. The level is a sandbox (`level.sandbox`: no
  win or loss, garrison, SAMs, airborne, generals, perks or XP; free and
  unlocked; no airlift; the field works unmanned and hidden; the camera's
  focus pinned to the line, `rig.panLocked`) with the bullet-trap berm as its one Structure
  and its readouts hidden (`body.range`), the tally on the top bar
  (`#range-board`: the rounds fired down the range and the share that
  found a target, `range.open`/`close` round each impact and each MG
  round, then the tally). `node tools/rangeprobe.mjs [light|fire]` loads it,
  lays an M240, a Stryker and an M777 on the paper, a popper, a gong and
  the shack, lets the MG at the drones, waits for the rebuild and reads
  the board.
- `src/game/operations.js` the campaign's operations, stars, gating,
  bosses and difficulty sawtooth · `src/game/doctrine.js` what stars buy ·
  `src/game/crews.js` and `src/ui/barks.js` named crews and their chatter ·
- `src/structure/landmarks/kit.js` the landmark kit · `src/game/atlas*.js`
  the catalogue's places, specs and words ·
  `src/game/levels.js` level records · `src/structure/landmarks/` the
  masonry · `src/structure/builder.js` the block vocabulary ·
  `src/structure/structure.js` support solver, collapse, damage ·
  `src/game/battle.js` units, targeting, impacts, win rules, the lift
  package, and the player's own hand on a gun (`startLay`/`layTurn`/
  `handFire`: GUNNER on a gun's card (the code still calls it the lay), the camera the gunner's own eye behind
  the trail (`layEye`; the reload is a ring filling round FIRE), a drag
  lays it with the shell's flight drawn by the shell's own physics ray,
  FIRE sends one round with no dispersion; a hand-laid hit pays a bonus,
  the GUNNER'S SHOT stamp and the `marksman` ribbon; the hand's round is
  watched (`_armSpot`, `battle.handRound`): over the readout `#lay-spot`
  counts the drawn line's time of flight down to SPLASH, then the
  spotter's call (`_spotFall`: OVER/SHORT and LEFT/RIGHT in metres off
  the line from the gun to the designated point or the crew's own aim,
  ON TARGET, DEFLECTED, LOST), and a red cross (`fallMark`) stands where
  the gun's last round fell (`u.lastFall`); NEXT GUN (`#lay-next`, over
  DONE) takes the next layable gun; `node tools/spotprobe.mjs` fires one
  short and reads the calls; `node tools/layprobe.mjs`
  drives it on a phone; every round leaves its weapon's own muzzle
  (`def.muzzle`, forward and up; a mortar's the top of its tube; a gun
  with `def.barrel` has its barrel cut out of its model at load,
  `src/game/barrel.js`: the tip found in the geometry, the axis by the
  elevation along which the most surface lies, the tube's triangles hung
  on a pivot at the trunnions (or, `region`, a band whose floor falls
  toward the rear, for the M777, whose tube, cradle and hydraulic tubes
  swing together about trunnions at the base plate nearly ten metres
  behind the muzzle; `node tools/barrelmap.mjs <kind>` maps a model's
  metal round its barrel line to place them; the Paladin's band takes the
  square mantlet its barrel goes into, which pivots with it, and only the
  `tube` before `recoilTo` runs back on the recoil; `CLOSE=1` on the
  barrel sheet frames the trunnions), so the barrel is laid to every shot and to
  the lay, recoils along its own line, and `_muzzle` is that barrel's end
  at that elevation; a lob past the barrel's `max` falls back to the low
  line; a gun swings onto a new bearing at its own `def.traverse`
  (radians a second, `_traverse`) and fires only when on it, the barrel
  rising toward the shot's elevation as it swings (`_leadBarrel`) and
  settling to `barrel.ready` after eight idle seconds; the M270 and M142
  boxes are cut the same way and their rockets leave the cells in turn
  (`barrel.cells`); after a shot the muzzle smokes for four and a half
  seconds (`_muzzleSmoke`, `fx.wisp`), and the laid M240 run hot smokes
  off its jacket (`node tools/smokeshot.mjs`); `node tools/traverseprobe.mjs`
  times a swing; `node tools/barrelshot.mjs` photographs each gun at rest, level,
  elevated and in recoil with the cut tinted red, `tools/muzzlecheck.mjs`
  measures round start against barrel tip and `tools/gunfire.mjs` fires
  each gun and prints the shell's start and line against the barrel's), a mortar
  is laid by range on the charge that makes the arc and never under
  forty-five degrees, with its crew live and loading while the player has
  it, and each weapon says where its gunner's eye is (`def.eye`: a
  vehicle's commander in the hatch over the model's measured top, the
  mortar's gunner on the sight looking at the tube, a fire team's gunner
  in his own head with the tube on his shoulder, `h` his eye's height);
  every weapon also says what sight it has (`def.sight`: the kind of
  reticle, drawn in `src/ui/sights.js`, and its magnifications, which
  ZOOM steps through); the reticle's centre is the point of impact, so a
  straight shooter (rockets, the machine gun, the Javelin) looks through
  it at every magnification and a gun does when zoomed, the mark
  bracketing the fall of shot otherwise; an automatic weapon in the hand
  fires no bursts: FIRE held sets `battle.trigger` and the laid machine gun
  (`_handMG`) or the seat's cannon (`_updateSeat`) fires round after round
  at its own rate until it is let go or the barrel locks (`HEAT` in
  battle.js: heat per round, no cooling while firing, four seconds locked
  run hot, reopening at the reset line; the trigger ring is the heat, amber
  then red, dark and counting while locked; `node tools/heatprobe.mjs`
  holds both and prints the trace); the M240's first-person gun
  (`weaponView`, soldier.js) is the receiver low in the frame, the barrel
  and front sight post, and the belt (`ammoBelt`) walking into the feed
  tray a link a round, its belly on a damped spring that each round yanks
  and rattles; the gun carries its own flash at its flash hider (the
  world's is skipped for a hand round) and kicks back and up a little a
  round (`layRecoil` in main.js); `node tools/flashshot.mjs` photographs
  it mid-burst; a mortar's shell leaving the tube jolts the plot and
  thumps the phone; the mortar is laid from the plot
  (`sight.kind === 'plot'`): straight down on the tube and the fall of
  shot together, the drag walking the ring over the ground, CLOSE the
  same at half the height, EYE the gunner's own at the tube; the machine gun is laid too,
  FIRE held being burst after burst at the point under the cross
  (`_handBurst`), and the Javelin's cross designates; a howitzer (M119,
  M777, Paladin: `def.indirect`) has HIGH ANGLE on the button over ZOOM
  (`#lay-wpn`, the seat's weapon switch otherwise): `setLayIndirect` lays
  it from the plot like the mortar (`layIndirect`, `_mortarSolve` held
  between 45° and the barrel's own `max`), DIRECT puts it back on the low
  line, and each does it its own way by `def.indirect.style`: the M119
  `adjust` (the ring tightens with each round back on the same spot,
  `L.adjust`, to FIRE FOR EFFECT), the M777 `precision` (the tightest
  ring, the readout in mils, charge and time of flight), the Paladin
  `mrsi` (`_mrsi`: three arcs to one point, fired steepest first and
  held back by the difference in time of flight through `_timed`, so all
  land together); `node tools/highangleprobe.mjs` measures each round's
  landing time and miss, `KIND=<gun> node tools/highangleshot.mjs`
  photographs the lay; the survey stays live in the lay; `node
  tools/layviews.mjs` lays every weapon, measures how much of the view
  is the weapon itself, zooms, and pulls the trigger (tracers, missile,
  round counted), `node tools/mortarprobe.mjs` the mortar's lay,
  load and shot (FIRE lets the round go: it slides down the tube and the
  shell leaves at the pin, `MORTAR_DROP` later, `_mortarLaunch`; the loader
  ducks, turns low to the crate, and comes up once with the next round;
  `node tools/loaderstrip.mjs` films one shot and reload as a contact
  sheet), `node tools/samprobe.mjs` a rocket team against a SAM
  compound, which is solid now: launchers, radars and revetments carry
  colliders and a round into one is a direct hit; the gunner's seat
  (`startSeat`/`seatMove`/`seatFire`): while a gunship is in its orbit or
  an Apache at its hover, GUNNER (`#seat-btn`) puts the player at its
  sensor, the camera the ball under the aircraft (`air.seatEye`) on a
  cross the finger drags over the ground, the cross sitting where the
  sensor's line first meets the world (`_seatLook`) and the round going
  there dead on; FIRE the 105 or the rocket pair, the weapon button the
  30 mm held; the sortie's own fire stops (`loiter.hand`) and the Apache's
  turret follows the cross; the thermal grade is `body.optics-thermal`;
  `node tools/seatprobe.mjs <level> ac130|ah64` calls one, takes the seat,
  drags, fires both weapons and measures the fall against the cross) · `src/game/aircraft.js` air strikes and the airlift (the C-130,
  the parachutes, what the flak does to both) · `src/game/reinforce.js` the enemy's airborne at the halfway mark (each nation's
  transport, the drop, the men digging in round the building) · `src/game/cityfire.js` and `ruins.js` the town burning · `src/game/defenders.js` the
  garrison · `src/world/` terrain, rivers, city, precinct, flags ·
  `src/ui/` HUD, level select, stand-off, test panel · `src/ui/title.js`
  the title screen in front of the contract card (continue, daily strike,
  battles in progress, armoury, commanders, the war wire) ·
  `src/game/battlesave.js` battles saved mid-fight and resumed (never
  Boot Camp, the range or a Blitz) · BLITZ (`career.js` `BLITZ`, the
  front door's BLITZ · 3 MIN): three minutes on an open contract, no
  airlift, full arsenal, a bank and faster income, no airborne, the clock
  (`#blitzbar`) from the first gun, stars at 25/50/90 % of the bar, the
  best per landmark in `tt.blitz`; `node tools/blitzprobe.mjs` plays one
  as a keen player and reads the end card (`SHOT=1` photographs the bar) ·
  the WEEKLY OP (`career.js` `WEEKLY_RULES`, `weeklyFor`): one of the
  original sixteen for the ISO week under one rule (MORTARS ONLY, NO AIR,
  TUBE ARTILLERY, ROCKETS ONLY), open whatever the campaign has reached;
  the rule is `battle.allowed` (what it forbids has no card, and an empty
  strike drawer no STRIKES button), NO AIR also grounds the lift; the
  first win of the week pays 2,500 XP and a supply crate (`award` with
  `weekly`), and `tt.weekly` keeps the best time and the weeks won; not
  saved mid-fight; `node tools/weeklyprobe.mjs` (`RULE=<id>`) plays it
  through the title ·
  REMATCH (the end card's second button, RUN IT AGAIN when no gun went
  down): every gun the player places is written into the plan where it
  stood (a sold one comes out), carried to the next load in
  `sessionStorage` `tt.rematch`, and put back on its mark in the order it
  first went down as soon as the bar has unlocked it and the money is there,
  by the same lift; MENU and RESTART start clean; `node tools/rematchprobe.mjs`
  places three, sells one, rematches and checks the marks ·
  the landing blow: a section of sixty stones or more that came down at
  4 m/s and has lost two thirds of it calls `onSectionLanded`
  (structure.js), which vibrates the phone by size and distance, thumps the
  speaker, and from a hundred and fifty stones holds the clock seventy
  milliseconds; `node tools/hitstopprobe.mjs <level>` records it. A
  falling section's colliders ask Rapier for contact-force events past
  26,000 N (`structure.js`, the island weld), so the handler in main.js
  (`physics.onImpact`) crushes what a section lands on and breaks a hard
  landing up; until October 2026 nothing asked and it never ran. The cost
  of a big collapse on the probe box is the same with it on or off. The
  handlers destroy what they touch, so nothing in them may call into a
  collider or body an earlier event in the batch could have removed: a call
  into a removed one traps the wasm and halts the physics for good
  ("recursive use of an object"). `step` resolves every event before
  dispatching any and drops those whose bodies have gone, and
  `chunkAtCollider` looks the stone up by handle in plain JS. The crush
  breaks up only sections of more than sixteen stones: a smaller piece is
  rubble already, and breaking it again on every knock was fifty splits a
  step in a heap under a barrage. Rubble under a big battery
  (`recycleSettled`, physics.js): past twice the body budget a small piece
  (sixteen stones or fewer, not settling) counts as at rest when merely
  shuffling, and one lying within `LOW_PILE` (3.5 m) of the ground is frozen
  where it lies even on other loose pieces (`_freezeLow`); past two and a
  half times the budget the smallest and lowest go to dust (`_cullRubble`,
  `destroyIsland`). Two hundred and forty guns on Saint Sava held a thousand
  pieces awake and physics at 1.5 s a simulated second; now about four
  hundred and 0.5 s. `KINDS=m777,m777,m119 node tools/perfprobe.mjs
  saintsava 240 20 60` runs that fight and says what the moving bodies are
  (sections by size, stones, asleep, slow, fast, frozen low, culled) ·
  SEASONS (`src/game/seasons.js`): every six weeks a themed run of eight
  catalogue landmarks, open to all while it runs, stars counted once per
  landmark at its best, three tiers paid once (`grant` in progress.js: XP,
  crates, a painting handed over early through `seasonArt`, a mark); the
  table runs to February 2027 and a season's new aircraft or nose art is
  content added to its record; `node tools/seasonprobe.mjs` drives the
  books, the sheet and the boards ·
  BOARDS (`src/game/rivals.js`): fewest rounds per landmark, the player's
  best against every challenge link opened on this phone (`&c=rounds&by=`
  the sender's commander name), no server and so no world table; the
  title's BOARDS sheet, a tap on a closed landmark shares the challenge,
  and a win prints the place ·
  DAILY REMINDER (`src/core/reminders.js`, SETTINGS): opt-in; the offline
  copy's worker, woken by periodic background sync (Chromium, installed
  game only; it says so elsewhere), posts one notification after five in
  the evening if today's strike is not flown, from the note the title and
  the battle keep in the `ef-state` cache; no push server;
  `node tools/reminderprobe.mjs` against the preview build ·
  par against play: `node tools/parprobe.mjs <level>` plays a level to the
  win mark as a player who has reached it (`HOW=full`: the campaign's
  arsenal by then, opened along the bar; `AIMBY=survey|face`; `QUIET=1`
  silences the garrison; `STOPDOWN=1` stops at the win mark) and prints
  the four marks against par; `sh tools/parsweep.sh <levels>` runs both
  aims two at a time; `node tools/unlockprobe.mjs <levels>` lists where on
  the bar each unit opens beside the starting money. The first sweep is
  `docs/par/README.md`: the bot is too weak to set par from, and par was
  not changed ·
  `src/game/career.js` save slots, rank, the daily strike ·
  `tools/bake_terrain.py` the ground · `tools/bake_overture.py` the real
  buildings, streets and coastline · `src/world/realstreets.js` the
  surveyed graph · `tools/shot.mjs` the harness.
