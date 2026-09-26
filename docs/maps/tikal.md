# Tikal, Peten — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py tikal`
before the builder is written; checked against `node tools/blocks.mjs tikal` and
`node tools/postcard.mjs tikal` after.

The survey: `Templo del Gran Jaguar` 45 x 44 m at 45 m ESE of the origin,
`Templo de las Máscaras` 47 x 49 m at 89 m WSW — 114 m apart centre to
centre — the two ball court ranges, and thirteen more ruins within 120 m
(the North and Central Acropolis) whose heights are read off the canopy, 40 to
62 m, so as boxes they would be tower blocks. The plaza is level ground over
the whole map (the bake flattened the canopy DEM to a table 1.2 km across).

| | The real thing | Built (S = 2.4) |
|---|---|---|
| Plan, from the survey | Temple I 45 x 44 over its aprons (the body about 35 x 33); Temple II 47 x 49 | Temple I 35 x 33 real → 89 x 79 world; Temple II 38 x 38 → 96 x 91 |
| Height from the ground the camera stands on | Temple I 47 m to the comb; Temple II 38 m | 50 real → 122 world; 38 → 93 |
| Taller than wide? | yes, Temple I — 1.3:1 | yes — 1.54:1 |
| The bottom third is | nine steep terraces with a projecting moulding at each head, the stair a straight steep strip up the west face | the same, three courses a terrace, the head course laid proud, the stair a wedge two metres out with low ramps |
| Dominant surface colour (as a material) | pale weathered limestone | `LIMESTONE` skin over `RUBBLE` fill |
| Where the eye goes | the stair, then the shrine and the comb against the sky | the same; the comb 29 m tall and 6 m thick on the shrine roof |
| Outbuildings the survey names, and which are built | Temple II — built, as a second required structure 190 m west, its stair facing Temple I | the ball court and the acropolis ranges are cleared (`cityExcludeRadius` 330) |

Temple II stands 190 m west rather than the surveyed 114: at two and two fifths
life the surveyed distance would leave the two bases fourteen metres apart.

Stones: Temple I 4,597 at low / 9,238 at high; Temple II 4,951 / 9,643; 0 loose
at both tiers. The fill is laid on a fixed lattice: `slab`'s per-course pitch
leaked the whole hill's weight into the two centre stones (408 MN on 356) and
crushed them on load.

Kind of problem: mountain with a comb. The twist: the terraces are the hill
and do not score; the comb is a hollow wall three metres thick standing on the
back of the shrine's roof a hundred metres up, and it topples whole when its
foot is cut.
