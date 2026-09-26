# Aqueduct of Segovia — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py segovia`
before the builder is written; checked against `node tools/blocks.mjs segovia` and
`node tools/postcard.mjs segovia` after.

The aqueduct is not a building and is not in the survey; the plaza's sixty-one
houses are, in a ring round the origin with a clear lane running south-east to
north-west through it, which is the aqueduct's own line (48° west of north,
Plaza de Día Sanz to the Postigo del Consuelo). The ground: the bake has the
origin at 1000 m on a local *rise* and falls 18–25 m at 300 m along the line
either way, which is the aqueduct's own top in the 30 m DEM — in life the
Azoguejo is the low point and the ground climbs both ways. The piers are
founded 12 m (26 m world) down, so the run stands whatever the ground does;
the run is kept to 26 bays so the exposed footing at the ends stays a plinth.

| | The real thing | Built (scale 2.2) |
|---|---|---|
| Plan, from the survey | a line 280 m long in the tall section, piers 2.4 × 3 m at 7.2 m | 412 m of two-tier arcade, 27 piers, 26 bays of 10.6 m; box 321 × 289 m |
| Height from the ground the camera stands on | 28.5 m | 63 m over the origin's ground, more at the ends |
| Taller than wide? | no — a wall of arches | no, 0.22:1 |
| The bottom third is | tall narrow lower arches on stepped piers | the same: lower piers 3.6 × 4.2 at the foot, 3 × 3.6 above, arches springing at 12.5 |
| Dominant surface colour (as a material) | grey unmortared granite | 96% CONCRETE (0xa39c8e), 4% LIMESTONE for the channel |
| Where the eye goes | the two tiers of arches against the sky, and daylight through both | the same |
| Outbuildings the survey names, and which are built | Caixabank, Telepizza, Burbujas | none; radius 45 keeps the plaza's ring of houses |

Tiers as built: lower piers to 12.5 m, rings 1 m thick over 4.8 m spans, haunch
courses on the piers, a wall to the impost at 19.5; upper piers 2.4 × 3 to 21.5,
rings, wall to 27; the channel 1.5 m with 0.6 m parapets. Every eighth pier and
the two end piers are half again as wide.

Kind of problem: an arch chain. The twist: an arcade shares its thrust — take
one pier and the two arches on it fall, the two piers beside them are now
unbraced and go with the next hit, and the chain unzips to the next wide pier.
