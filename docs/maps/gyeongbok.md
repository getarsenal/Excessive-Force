# Gyeongbokgung, Seoul — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py gyeongbok`
before the builder is written; checked against `node tools/blocks.mjs gyeongbok` and
`node tools/postcard.mjs gyeongbok` after.

| | The real thing | Built (S = 2.2) |
|---|---|---|
| Plan, from the survey | 근정전 33 × 25 m (eaves); the cloister ring 130 × 140 m centred 42 m south of the hall; 근정문 22 × 14 at 94 m south | hall 30 × 21 (walls) on a two-level woldae 68 × 52; courtyard 124 × 136, cloister 6 m deep, gate 20 × 9 in the south range; × 2.2 → 280 × 312 m |
| Height from the ground the camera stands on | terrace 3 m + hall ~22 m = 25 m to the ridge; cloister 6 m; gate ~15 m | 3.0 + 21.5 real → 54 m world; cloister 6.5 real (14 world) |
| Taller than wide? | no | no, 0.20:1 — the cloister ring makes it a courtyard with a hall in it |
| The bottom third is | granite terrace and the cloister's red columns | LIMESTONE slabs (granite) and REDSTONE cloister walls with an open colonnade |
| Dominant surface colour (as a material) | grey tile roofs over red-brown timber | 37 % SLATE, 36 % LIMESTONE, 18 % REDSTONE, 9 % VERDE |
| Where the eye goes | the grey double roof of the throne hall above the courtyard, Bugaksan behind | the same, from the gate |
| Outbuildings the survey names, and which are built | 근정문 (built as `gate`), 사정전 53 m N, 강녕전 104 m N, 수정전 106 m W, 계조당, 자선당 … all at life size | the gate and the cloister ring are built; the rest fall inside the 2.2× courtyard and `cityExcludeRadius: 200` clears them |

Kind of problem: a topple on a plinth (Himeji's). The twist: the cloister ring
is where the garrison is and it is not the target; the hall and the gate are
top-heavy roofs on columns and go over the way they are leaned. Score on
`hall`, `gate`.

Measured: 14.3k stones at low, 22.7k at high, 0 loose at both. Camera from
the south over the gate, `{ yaw: 0.06, pitch: 0.11, distance: 400, height: 30 }`.
