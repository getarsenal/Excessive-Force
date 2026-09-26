# Pena Palace, Sintra — the proportion table

Filled in from the photographs and `python3 tools/survey.py pena` before the
builder was written; checked against `node tools/blocks.mjs pena` and
`node tools/postcard.mjs pena` after.

| | The real thing | Built (scale 1.8) |
|---|---|---|
| Plan, from the survey | fifteen unnamed outlines in a cluster running north-south along the ridge, 38 x 38 m the largest, 40 m north-east; the summit is level for 113 x 162 m at 500 m and 30–40 m lower a hundred metres out | a 60 x 100 m terrace (108 x 180 world) along the ridge with the monastery, chapel and clock tower at the north end, the New Palace at the south, the gate on the south edge, the bastion off the south-west corner |
| Height from the ground the camera stands on | blocks 12–16 m, the clock tower ~30 m, the bastion ~20 m over its terrace, all on a crag | 78 m world over the summit at the tower's roof; the terrace footing 47 m world below the summit shows where the ridge falls away |
| Taller than wide? | no: a long cluster along a ridge | no, 0.64:1 above the summit |
| The bottom third is | battered terrace wall and bare granite | battered `LIMESTONE` terrace, coarse `RUBBLE` where buried |
| Dominant surface colour (as a material) | yellow ochre and red ochre render, grey granite terraces | 48 % LIMESTONE (yellow), 12 % SANDSTONE (red), 35 % RUBBLE (the fill, hidden), SLATE roofs, TILE bands |
| Where the eye goes | the round bastion and the yellow palace behind it, then the red clock tower | the same, from the south-east |
| Outbuildings the survey names, and which are built | none named; the cluster is the palace | the palace's parts are built; `cityExcludeRadius: 130` clears the outlines |

Kind of problem: a fortress on a hill, the Potala's kind. The twist: the
bastion stands on the cliff edge on its own footing, a hand clear of the
terrace, and the New Palace leans on it — undercut the bastion and it goes
down the west face alone; open the terrace under the palace and the palace
goes with the terrace.

Measured: 7,622 stones at low (1,933 below the summit), 19,568 at high, 0
loose at both. `padRadius: 0`, `groundLevel: 'bake'`, `FOUND = -26` real
(-47 world), one `BATTER` of 0.10 on every face of the hill.
