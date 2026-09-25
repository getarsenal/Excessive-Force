---
name: new-map
description: Add a new landmark level (map) to Excessive Force. Use whenever the user asks to make, add or build a map, level or landmark for a real building or place ("make a map for X in Y", "add the Colosseum", "new level: Sydney Opera House").
---

# Adding a map

Read `docs/NEW_MAP_PLAYBOOK.md` first, in full. It is the record of what
worked and what broke on the sixteen existing maps, and it names every file
a level touches. Do not reconstruct that from the code. §0b and §2b are the
Potala, which was built twice; read those twice.

Then, in this order, each step verified before the next:

1. **Say what kind of problem the building is** (cantilever, lattice,
   shell, mountain), the scale it will be built at, and the twist the
   player has to discover. One paragraph, before any code.
   Then `node tools/newmap.mjs <id> "<Landmark>, <City>" <lat> <lon> --iso
   --city --nation --code`: every table gets its `TODO(<id>)` stub and
   `mapcheck` tells you what is really left.
2. **Bake the ground and the town**: add the place to
   `tools/bake_terrain.py` (river *or* sea, parks, pads, `peak` for a
   summit — with `top` the size of the *real* summit, a ridge term in
   `wobble` if the hill is long, and shelves whose `slope × run` fits on
   the hill), add the id to `WILD_COVER` in `tools/bake_overture.py` if the
   ground is wild, run both bakes (they work in-session), commit the
   terrain files and `public/assets/city/<id>.json`. Read the far-water
   line; check the water and pads in the game.
3. **Survey it**: `python3 tools/survey.py <id>`. Read the ground profile
   and the level extent (a hilltop that prints as 400 m of flat is a table
   — fix `top` and set `padRadius: 0` on the level record). Read the
   surveyed buildings: the landmark's own outline is usually there with its
   real plan dimensions, and so are its outbuildings by name. Note what
   `cityExcludeRadius` will delete and decide, in writing, whether to build
   each of those or keep it. Look at the plan PNG.
4. **Write the proportion table** from three reference photographs and the
   survey: width, height from the ground the camera stands on, taller-
   than-wide or not, what the bottom third is, the dominant surface colour
   (as a material), and where the eye goes. This is the specification the
   builder is written to; if a render later disagrees with it, the render
   is wrong.
5. **Write the builder** in `src/structure/landmarks/`, one `BlockList`
   per structure, constants in one exported object, one `BATTER` for every
   face on a hill, foundations carried below the summit if there is one,
   coarse and bare where buried. `node tools/blocks.mjs <id>` after every
   change: stones under about 45k at low, taller than wide if the real
   thing is, and the material colour line reading as the photograph does.
   Zero loose stones at every tier; the undercut test must behave as
   designed.
6. **Look at it from the postcard angle** — `node tools/postcard.mjs <id>`,
   with `--pitch --dist --height` to try others and `--survey` for the load
   painter — beside the photograph, and fill in `docs/maps/<id>.md` with
   measured numbers. Iterate here, on one level, one render a minute, until
   the table is right; then set the level's `camera` to the angle that won.
   Then the suite, once.
7. **Interiors and the trick.** A turret if the place has a gun, on its
   own ground. Outbuildings the survey named, as a street, where the survey
   puts them.
8. **Garrison** in the landmark module as `populate<Name>(g, origin,
   groundY)`, every position read from the builder's constants, within the
   blind baseline; `look.mjs` reports blind men, and a walk between two
   terraces is usually the fix.
9. **Level record** in `src/game/levels.js` — every field changed from
   the neighbour's, `palette` and `setting` for anywhere that is not a
   temperate river city, `padRadius: 0` on a summit, `cityExcludeRadius`
   pulled in to the hill's real base, `par`, the camera from step 6 — plus
   `LEVEL_ORDER` and `LEVEL_BLURB`. Add the level's boats to `FLEETS` in
   `src/world/craft.js` if it has water.
10. **Campaign record** in `src/game/campaign.js` `THEATRES`: number,
    ISO code (checked against `public/assets/world.json`), city, lon/lat,
    title, brief, unlocks. Without it the level is not on the campaign map.
11. **Flag, officer, stand-off script, recon photo** in
    `src/world/flags.js`, `src/game/cast.js`, `docs/SCRIPTS.md`,
    `public/assets/characters/`, and `node tools/recon.mjs <id>`. If no
    script or art was given, draft the lines and say they are a draft;
    leave the art slot documented in `manifest.json`.
12. **Verify and ship** per the playbook §7: `node tools/mapcheck.mjs <id>`
    clean, `sh tools/suiteall.sh <id>` at 50 pass 0 fail, then all sixteen
    once, build clean, the pictures looked at (postcard, opening camera,
    precinct, shore, dossier, stand-off, one collapse), deployed to `main`,
    deploy run confirmed green for *this* commit's sha.

Bring it all the way to production unless told otherwise. Never commit
synthetic fixture data to `public/assets/city/`. Never put a model
identifier in a commit or a code comment.
