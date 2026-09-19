# Excessive Force

A 3D artillery demolition game: real landmarks on their real ground, laid
up stone by stone, brought down by the player's guns. Three.js + Rapier
WASM, Vite, deployed from `main` by GitHub Pages to https://getarsenal.app.

## Working rules

- Every task goes all the way to production: verified, committed, `main`
  fast-forwarded, deploy run confirmed green. Do not stop to ask.
- Develop on the branch the session names (most recently
  `claude/excessive-force-handoff-i40ha3`). Deploy is
  `git push origin <branch>:main`. The remote is
  `https://github.com/getarsenal/Excessive-Force`; the repo has been
  renamed twice and pushes to the current name work.
- Never commit synthetic fixtures to `public/assets/city/`. Never put a
  model identifier in a commit message, code comment or asset.
- Do not edit source or run heavy probes while a harness suite is running:
  the dev server's reload corrupts the run.

## Verify

```
npx vite --port 5177 --strictPort &
sh tools/suiteall.sh <id>...            # expect "<id>: 35 pass 0 fail" per level
npx vite build
```

`suiteall.sh` runs three browsers at a time against the one dev server, which
is what the box has cores for: all nine levels in seven minutes rather than
twenty-one. `JOBS=1` for a clean timing, `TIER=high` for another tier. It sets
`TT_SUITE=1`, which drops the three screenshots and the twelve seconds of
settling between them — those exist so a human can look, and a regression run
is not a human looking.

Iterate on *one* level. A change to the masonry is a change to the masonry on
every map, and finding that out costs seven minutes each time; find the fault
on one level, fix the batch, then run the nine once.

Levels, in campaign order: `westminster`, `paris`, `agra`, `giza`,
`chichen`, `pisa`, `sydney`, `moscow`, `rio`. Tiers: `low` (phones; the
grid is coarsened) to `ultra`. Giza at high and Paris at ultra time out in
the software rasteriser; verify those at low.

`node tools/loose.mjs <level> low` says *where* the loose stones are and
`node tools/look.mjs /tmp/out/<id> <level>` gives three views plus the
blind ranks — both are quicker than the whole suite while building.
`sh tools/suiteall.sh <level>...` runs the suite over several levels and
prints one line each.

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

- `src/game/levels.js` level records · `src/structure/landmarks/` the
  masonry · `src/structure/builder.js` the block vocabulary ·
  `src/structure/structure.js` support solver, collapse, damage ·
  `src/game/battle.js` units, targeting, impacts, win rules ·
  `src/game/aircraft.js` air strikes · `src/game/defenders.js` the
  garrison · `src/world/` terrain, rivers, city, precinct, flags ·
  `src/ui/` HUD, level select, stand-off, test panel ·
  `tools/bake_terrain.py` the ground · `tools/bake_overture.py` the real
  buildings, streets and coastline · `src/world/realstreets.js` the
  surveyed graph · `tools/shot.mjs` the harness.
