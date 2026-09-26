# Sagrada Familia, Barcelona — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py sagrada`
before the builder is written; checked against `node tools/blocks.mjs sagrada` and
`node tools/postcard.mjs sagrada` after.

The survey has the basilica as a hundred-and-thirteen point outline named
Basílica de la Sagrada Família, 117 × 102 m in the world's axes; its principal
axis is 45.2° off +x, which is the Eixample's grid, and along its own axes it
runs 108 m (apse to the Glory front, the cloister included) by 83 m (Nativity
to Passion, the porticoes included), with the crossing on the level's origin.
The builder is written in the church's own frame — u along the nave, v across
it — and turned onto the grid as its last act.

| | The real thing | Built (× 1.0) |
|---|---|---|
| Plan, from the survey | 108 × 83 m outline; the church 90 × 60 inside it | 96 × 72 m in its own frame (91 × 91 world box) |
| Height from the ground the camera stands on | 172.5 m (Jesus); 138 (Mary); 135 (Evangelists); 98–112 (facade towers) | 172.5 / 138 / 135 / 98–112 |
| Taller than wide? | yes, nearly 2:1 | yes, 1.91:1 |
| The bottom third is | portal walls between the feet of the towers, aisle walls with tall pointed windows | the same: 40 m portal walls, 30 m aisle walls with a light per 7.5 m bay |
| Dominant surface colour (as a material) | warm brown-grey Montjuïc stone (old work), paler stone (new) | 72 % `LIMESTONE`, 26 % `SANDSTONE` (apse, Nativity), 2 % `GILT` |
| Where the eye goes | the cluster of tapering towers and their glass pinnacles | eighteen cones, `GILT` pinnacles on every one |
| Outbuildings the survey names, and which are built | Escoles de la Sagrada Família (19 × 19, 3 m), Botiga Oficial (23 × 29); apartments from 83 m out | none built; the radius is pulled in to 82 m so the apartments across the streets stay |

Stones: 13,480 at low, 19,664 at high; 0 loose at both. Sections: nave 3,250,
nativity 2,026, passion 2,058, evangelists 3,112, mary 1,161, jesus 1,873.

Kind of problem: cantilever cluster. The twist: every spire is a hollow
parabolic cone on piers, and Jesus stands on the four piers of the crossing's
own arcade, each a house wide; cut two and 172 m of stone comes down through
the nave roof, which is a corbelled shell and carries nothing. The bar is the
towers; the nave is the hall they stand in.
