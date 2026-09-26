# Tokyo Tower, Tokyo — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py tokyotower`
before the builder is written; checked against `node tools/blocks.mjs tokyotower` and
`node tools/postcard.mjs tokyotower` after.

The survey carries the tower as a stack of concentric rings tagged by height —
57 m across at 66 m, 43 at 88, 35 at 106, 31 at 120, the main observatory a
35 × 34 box at 130–150, the special observatory 7 × 7 at 250 — and FootTown as
an 89 × 86 m block of 20 m between the feet. The envelope in the builder is two
straight lines through those rings.

| | The real thing | Built |
|---|---|---|
| Plan, from the survey | 89 × 86 m (FootTown, between the feet); feet about 80 m apart | 90 × 93 m at the feet; FootTown 76 × 76 |
| Height from the ground the camera stands on | 332.9 m | 333 m |
| Taller than wide? | yes, 3.7:1 | yes, 3.70:1 |
| The bottom third is | four splayed lattice legs with an arch between each pair, FootTown in the middle | the same: legs to 105 m, arches sprung at 26 m, FootTown to 20 m |
| Dominant surface colour (as a material) | international orange with white bands | 60 % `IRONWORK`, 25 % `STEEL`, 15 % `CONCRETE` (FootTown) |
| Where the eye goes | the white observatory box two fifths of the way up | the box at 145–157 m, glass between white steel posts |
| Outbuildings the survey names, and which are built | 大展望台 (the tower itself), 32芝公園ビル and 渋沢ビル (offices 70–90 m off) | FootTown built; the offices kept by pulling the radius in to 62 m |

Stones: 8,669 at low, 10,638 at high; 0 loose at both.

Kind of problem: lattice, the Eiffel's. The twist: the mass is the two-storey
observatory at 145 m, not the hundred metres of antenna over it — the fall is
decided at the feet, and cutting a leg puts the box and everything above it
over toward the cut.
