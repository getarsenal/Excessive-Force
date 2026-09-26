# Karnak Temple, Luxor — the proportion table

Filled in from the photographs and `python3 tools/survey.py karnak` before the
builder was written; checked against `node tools/blocks.mjs karnak` and
`node tools/postcard.mjs karnak` after.

| | The real thing | Built (scale 2.0) |
|---|---|---|
| Plan, from the survey | Overture has no hypostyle hall, only six-metre stubs for the ruins; the literature gives 103 x 52 m for the hall, ~100 m pylons, an 84 x 100 m Great Court and a 113 m First Pylon | hall 102 x 53 (204 x 106 world); the whole temple 360 x 226 m world from the Third Pylon to the First |
| Height from the ground the camera stands on | side columns 15 m, nave 21 m (roof ~28 m); Second Pylon ruined to ~30 m; First Pylon 43 m | 30 / 42 / 56 m world; pylons 68/60, 48/40 and 64/86 m world |
| Taller than wide? | no: a low forest of columns between two broad pylons | no, 0.38:1 |
| The bottom third is | column drums and blank battered pylon faces | the same |
| Dominant surface colour (as a material) | honey sandstone: `LIMESTONE` 0xdcc99e (`SANDSTONE` is Agra's red and rendered as a brick kiln) | 62 % LIMESTONE, 38 % RUBBLE (the pylon fill, mostly hidden) |
| Where the eye goes | the twelve tall nave columns over the roofless aisles | the nave rising over the side rows through the fallen roof |
| Outbuildings the survey names, and which are built | Temple of Ramesses III, the three pylons, the chapels of Seti II and Hakoris, the Bubastite Portal — all six-metre placeholder boxes, all inside the radius | the three pylons and the Great Court are built; the rest is cleared (`cityExcludeRadius: 320`) |

Kind of problem: a colonnade, the Parthenon's, at twice life. The twist: the
architraves are the load path — cut a column and its two beams and the roof
over them fall, and the clerestory rides on the height difference between
the fifteen-metre and twenty-one-metre columns, so a tall column dropped
brings the nave roof down on the aisle roof.

Measured: 22,854 stones at low, 35,819 at high, 0 loose at both. Worst
utilisation 0.22. The pylons are dressed skin over coarse `RUBBLE` fill, with
a hand's gap between the two: touching stacks share load by count of
neighbours, and the fill's grid is fixed in space so no course leans on the
one beside it.
