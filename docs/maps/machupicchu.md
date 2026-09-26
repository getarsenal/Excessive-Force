# Machu Picchu, Cusco — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py machupicchu`
before the builder is written; checked against `node tools/blocks.mjs machupicchu` and
`node tools/postcard.mjs machupicchu` after.

The survey: a summit at 2,430 m, 579 m over the map's low ground, the level
top 180 x 342 m (x -93..86, z -160..181). Seventy-one house outlines on it,
12 x 14 m and smaller, one named (`Grupo de las Tres Portadas`, 51 m south),
all with heights read off the canopy (8 m for walls of 3). South of z 185 the
crest falls at about a metre per metre to a shelf 64 m down at z 250, and the
ridge there is only forty metres wide before it drops sixty on either hand.

| | The real thing | Built (S = 1.8) |
|---|---|---|
| Plan, from the survey | the citadel about 530 x 200 m; the Intihuatana outcrop about 60 x 45 at its foot | mound 60 x 44 real → 108 x 79 world; the plaza temples 11 x 8 and 5 x 10; seven houses 8 x 5; the Torreón 9 m across on a 12 m boulder, 40 m east and 70 south; nine rows of andenes from z 185 to 257 |
| Height from the ground the camera stands on | the Intihuatana about 20 m over the plaza; nothing else over 5 | 20 real → 36 world (40 with the gnomon); temples 4 → 7 |
| Taller than wide? | no — a citadel on a ridge | no — 0.32:1 |
| The bottom third is | retaining walls of dry granite with grass on top | `LIMESTONE` walls 1.2 thick round `RUBBLE` fill, in solid courses |
| Dominant surface colour (as a material) | pale grey granite, and grass | `LIMESTONE` for the terraces, `MARBLE` for the ashlar of the temples, the houses and the Torreón |
| Where the eye goes | the terraces stepping down the ridge, and Huayna Picchu behind | the andenes down the south end, exposed 4 to 15 m; the peak is in the bake, 180 m higher, 600 m north |
| Outbuildings the survey names, and which are built | the Three Doorways group and seventy others, as canopy-height boxes | cleared (`cityExcludeRadius` 230); the houses the level needs are built as roofless gabled walls |

Summit: `padRadius: 0`, `groundLevel: 'bake'`. The andenes are founded at -46 m
real (-83 world) and laid coarse below each row's own ground less four metres,
their tops six metres over the sampled crest under each wall.

Stones: Intihuatana 4,280 at low / 8,649 at high; Torreón 186 / 341; terraces
3,410 / 5,439 (3,286 of them below the summit). 0 loose at both tiers.

Kind of problem: mountain, a low one. The twist: nothing is tall enough to
topple; the temples stand on the ground the terrace walls hold up, and a wall
cut drops the fill and the stone on it.
