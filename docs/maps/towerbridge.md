# Tower Bridge, London — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py towerbridge`
before the builder is written; checked against `node tools/blocks.mjs towerbridge` and
`node tools/postcard.mjs towerbridge` after.

The bridge is not a building and is not in the survey. The origin is the
north abutment on Tower Hill at 6.9 m; the Thames begins 70 m south of it and
runs 280 m to the Bermondsey bank at 14 m, the bed at −4.9 m. Forty-five of
the Tower of London's buildings stand within 120 m (the White Tower 57 m
north, the Wakefield Tower 40 m west); a radius of 38 keeps every one.

| | The real thing | Built (scale 1.6) |
|---|---|---|
| Plan, from the survey | 244 m end to end across a 270 m river; towers 26 × 20; piers ~56 × 21 | 420 m end to end, 106 m across the piers' cutwaters; towers 42 × 32 |
| Height from the ground the camera stands on | 65 m to the pinnacles; walkways 44 m up | 103 m; walkways at 69 m |
| Taller than wide? | the towers are | 0.98:1 on the box |
| The bottom third is | two granite-faced piers in the river, the abutments, the decks | the same; piers founded 22 m down, bare below the water |
| Dominant surface colour (as a material) | pale Portland stone, blue-grey steel | 79% LIMESTONE, 6% SLATE, 5% IRONWORK decks, 2% STEEL walkways and chains |
| Where the eye goes | the two towers with the walkways between them, the chains falling to the banks | the same |
| Outbuildings the survey names, and which are built | the Tower of London, by its towers | kept as surveyed (radius 38); the bridge's own abutment towers are built |

Structure as built: piers 21 × 50 with cutwaters from −14 (real) to +3; towers
hollow from the deck up, solid from the pier to the deck, road arches through,
two tiers of paired lancets, a hollow slate pyramid roof stepping in on the
walls, four corner turrets with gilt finials; decks of ironwork plates three
lanes wide chained from the abutments and towers; two walkways of steel plates
with lattice sides; chains on hangers from the deck edges.

The decks and walkways stand by the solver's cantilever pass (a stranded stone
takes a bearing edge sideways to a standing neighbour, outward one stone a
pass, bounded to a twentieth of the structure) — nothing else in the engine
spans more than five metres. They are cambered two centimetres a plate so the
runtime walk, which settles lower stones first in five rounds, reaches the
whole chain from either end.

Kind of problem: a cantilever pair tied by a bridge. The twist: the spans rest
on the towers and the abutments and the walkways tie the towers; cut the north
tower's pier and the tower, the walkway ends and both spans on it go into the
river.
