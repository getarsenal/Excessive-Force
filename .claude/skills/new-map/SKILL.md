---
name: new-map
description: Add a new landmark level (map) to Excessive Force. Use whenever the user asks to make, add or build a map, level or landmark for a real building or place ("make a map for X in Y", "add the Colosseum", "new level: Sydney Opera House").
---

# Adding a map

Read `docs/NEW_MAP_PLAYBOOK.md` first, in full. It is the record of what
worked and what broke on the four existing maps, and it names every file
a level touches. Do not reconstruct that from the code.

Then, in this order, each step verified before the next:

1. **Say what kind of problem the building is** (cantilever, lattice,
   shell, mountain), the scale it will be built at, and the twist the
   player has to discover. One paragraph, before any code.
2. **Bake the ground and the town**: add the place to
   `tools/bake_terrain.py` (river *or* sea, parks, pads, `peak` for a
   summit), add the id to `WILD_COVER` in `tools/bake_overture.py` if the
   ground is wild, run both bakes (they work in-session), commit the
   terrain files and `public/assets/city/<id>.json`. Read the far-water
   line; check the water and pads in the game.
3. **Write the builder** in `src/structure/landmarks/`, one `BlockList`
   per structure, constants in one exported object. Zero loose stones at
   every tier; the undercut test must behave as designed.
4. **Interiors and the trick.** A turret if the place has a gun, on its
   own ground.
5. **Garrison** in `src/game/defenders.js`, positions read from the
   builder's constants, within the blind baseline.
6. **Level record** in `src/game/levels.js` — every field changed from
   the neighbour's, `palette` and `setting` for anywhere that is not a
   temperate river city — plus `LEVEL_ORDER` and `LEVEL_BLURB`.
7. **Campaign record** in `src/game/campaign.js` `THEATRES`: number,
   ISO code (checked against `public/assets/world.json`), city, lon/lat,
   title, brief, unlocks. Without it the level is not on the campaign map.
8. **Flag, officer, stand-off script, recon photo** in
   `src/world/flags.js`, `src/game/cast.js`, `docs/SCRIPTS.md`,
   `public/assets/characters/`, and `node tools/recon.mjs <id>`. If no
   script or art was given, draft the lines and say they are a draft;
   leave the art slot documented in `manifest.json`.
9. **Verify and ship** per the playbook §7: `node tools/mapcheck.mjs <id>`
   clean, `sh tools/suiteall.sh <id>` at 35 pass 0 fail, build clean, the
   pictures looked at (opening camera, precinct, shore, dossier,
   stand-off, one collapse), deployed to `main`, deploy run green.

Bring it all the way to production unless told otherwise. Never commit
synthetic fixture data to `public/assets/city/`. Never put a model
identifier in a commit or a code comment.
