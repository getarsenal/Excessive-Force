# Mont-Saint-Michel, Normandy — the proportion table

Filled in from the photographs and `python3 tools/survey.py montstmichel`
before the builder was written; checked against `node tools/blocks.mjs
montstmichel` and `node tools/postcard.mjs montstmichel` after.

| | The real thing | Built (scale 1.3) |
|---|---|---|
| Plan, from the survey | Église abbatiale 64 x 42 m, 11 m east of the summit; La Merveille 82 x 48 m, 38 m north; Cloître 31 x 29 m, 36 m north-west; Logis abbatiaux 43 x 26 m, 26 m south; the rock level for 88 x 92 m at 80 m and 30–50 m lower a hundred metres out | church 70 x 42 (nave, crossing, transepts, choir), the Merveille 70 x 22 along the north face founded 36 m down, the cloister on its deck, the lodgings on the south |
| Height from the ground the camera stands on | spire to 157 m ASL over a bay at 0: 77 m of church and spire on 80 m of rock | 106 m world over the summit; the footing 47 m world below it |
| Taller than wide? | yes, the rock and the spire together | yes above the summit, 1.08:1, and the rock doubles it |
| The bottom third is | the village and the ramparts up the south-east, bare rock north and west | the surveyed village (kept, `cityExcludeRadius: 70`) and the Merveille's blank lower storeys |
| Dominant surface colour (as a material) | grey-tan granite, slate roofs | 83 % LIMESTONE, 17 % SLATE, the archangel GILT |
| Where the eye goes | the spire, then the Merveille's three storeys on the north face | the same |
| Outbuildings the survey names, and which are built | Église abbatiale, Cloître, Logis abbatiaux, Belle Chaise (rebuilt here, all within 40 m); Église Saint-Pierre, the Poulard hotels, the Tour du Nord, Tour Perrine, Tour de l'Avancée and sixty more houses at 70–120 m (kept from the survey) | the abbey is built; the village and its towers are the survey's |

Kind of problem: a mountain with a spire, the Potala's footing rule under a
Gothic church. The twist: the crypts — the church stands on the summit only
at its nave, and the choir and the north transept stand on crypt boxes built
out over the rock's east and north flanks; break a crypt and the church over
it goes down the face.

Measured: 7,783 stones at low (3,107 below the summit), 19,978 at high, 0
loose at both. `padRadius: 0`, `groundLevel: 'bake'`; footings -32 real under
the choir, -36 under the Merveille, -20 under the north transept, -6 under the
nave; coarse `RUBBLE` below -14. The gable roofs are corbelled courses
stepping in to the ridge, which is what carries a roof here and what a
Norman roof is.
