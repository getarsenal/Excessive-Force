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
TT_URL='http://localhost:5177/?level=<id>' TT_TIER=low node tools/shot.mjs /tmp/out/<id> tools/suite.js
python3 tools/report.py /tmp/out/<id>-console.txt      # expect 35 pass 0 fail
npx vite build
```

Levels, in campaign order: `westminster`, `paris`, `agra`, `giza`,
`chichen`, `pisa`, `sydney`, `moscow`, `rio`. Tiers: `low` (phones; the
grid is coarsened) to `ultra`. Giza at high and Paris at ultra time out in
the software rasteriser; verify those at low.

`node tools/loose.mjs <level> low` says *where* the loose stones are and
`node tools/look.mjs /tmp/out/<id> <level>` gives three views plus the
blind ranks — both are quicker than the whole suite while building.

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
  `tools/bake_terrain.py` the ground · `tools/shot.mjs` the harness.
