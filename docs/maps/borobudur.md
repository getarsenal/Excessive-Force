# Borobudur, Magelang — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py borobudur`
before the builder is written; checked against `node tools/blocks.mjs borobudur` and
`node tools/postcard.mjs borobudur` after.

The survey: one outline, `Borobudur`, 126 x 126 m, centred 19 m north-east of
the origin, on a level top 345 x 349 m at 262 m; four sheds within 120 m and
nothing else. The ground falls five to ten metres beyond ±150 m.

| | The real thing | Built (S = 2.0) |
|---|---|---|
| Plan, from the survey | 126 x 126 m (123 over the processional foot) | 123 x 123 real → 256 x 256 world |
| Height from the ground the camera stands on | 35 m as it stands, ~42 with the chattra | 39 real → 80 world |
| Taller than wide? | no — 0.3:1, a hill | no — 0.31:1 |
| The bottom third is | the wide foot platform and the first two balustraded galleries, stepping in five to six metres per level | foot platform 1.5 m, then galleries at 4.9 and 8.3 with balustrades 1.6 m tall |
| Dominant surface colour (as a material) | dark grey andesite | `CONCRETE` 0xa39c8e skin over `RUBBLE` fill |
| Where the eye goes | the horizontal layering of six square terraces, then the ring of bells and the crown | the same: five gallery lips with parapets, three round terraces with 72 bells, the central stupa |
| Outbuildings the survey names, and which are built | none named besides the monument | none; `cityExcludeRadius` 210 clears the four sheds |

Plan: the twenty-sided square — every side stepped twice toward the corners
(3.4 m and 7.4 m, at 30% and 62% of the half-width) — laid with a rectilinear
ring that bonds its thirty-six corners the way `ring` bonds four. Galleries at
4.9 / 8.3 / 11.7 / 15.1 / 18.5 m real, outer faces 56.5 / 51 / 45.5 / 40 / 34.5;
round terraces r 25.5 / 19 / 12.5 at 20 / 21.5 / 23; bells 32 + 24 + 16; the
central stupa r 5, 16 m to the finial. Four stairs through the balustrades.

Stones: 19,283 at low, 33,396 at high; 0 loose at both.

Kind of problem: mountain. The twist: the galleries are retaining walls round
a rubble hill, and what scores is the round terraces, the bells and the crown
— all of it standing on the fill under the top square terrace. Cut that and
the crown drops without a shell landing on a stupa.
