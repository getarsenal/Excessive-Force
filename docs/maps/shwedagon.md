# Shwedagon Pagoda, Yangon — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py shwedagon`
before the builder is written; checked against `node tools/blocks.mjs shwedagon` and
`node tools/postcard.mjs shwedagon` after.

| | The real thing | Built (S = 1.3) |
|---|---|---|
| Plan, from the survey | ရွှေတိဂုံစေတီ 115 × 113 m on a levelled summit 285 × 243 m, 54 m over the low ground; fifty shrines on the platform | octagonal terraces 114 / 100 / 86 m across, bands 73 / 63, bell 52 m at the foot; 64 small stupas at r 64, four halls 22 × 15 at r 78; × 1.3 → 225 × 225 × 129 m |
| Height from the ground the camera stands on | 99 m to the hti, on a 50 m hill | 90 real to the bud + 9 hti → 129 m world, on the bake's 54 m summit |
| Taller than wide? | no — 99 tall on a 115 base, 0.86:1; the hill does the rest | 0.57:1 over the whole platform group; the stupa alone 1.1:1 |
| The bottom third is | gilded octagonal terraces with the small stupas round them | GOLD octagons, solid, sixty-four small GOLD stupas |
| Dominant surface colour (as a material) | gold, everything | 99 % GOLD |
| Where the eye goes | the bell and the bud against the sky | the same, from the south-east below the hill |
| Outbuildings the survey names, and which are built | Htidaw Pagoda and forty-nine unnamed shrines, all 6 m | the platform's ring of small stupas and the four devotional halls are built in their stead; `cityExcludeRadius: 150` |

Kind of problem: a mountain. The twist: solid gilded brick that never falls;
quarry it from the outside in, and the small stupas and the halls are the
finesse. `groundLevel: 'bake'`, `topples: false`, `unlockScale: 8`.

The stupa is laid in solid courses of nested same-polygon rings (skin of fine
stone, coarse fill inside, a bonded square at the centre), turned half a step
every course so the load spreads sideways rather than down one column.

Measured: 20.1k stones at low, 39.2k at high, 0 loose at both. Camera
`{ yaw: 0.55, pitch: 0.07, distance: 470, height: 75 }`.
