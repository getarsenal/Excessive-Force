# Angkor Wat, Siem Reap — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py angkor`
before the builder is written; checked against `node tools/blocks.mjs angkor` and
`node tools/postcard.mjs angkor` after.

| | The real thing | Built (S = 1.3) |
|---|---|---|
| Plan, from the survey | three enclosures 234 × 209, 142 × 126 and 83 × 77 (with gopuras), centred 20 m west of the origin; libraries 17 × 13 | outer gallery 215 × 187 on a 1.2 m plinth with eight gopuras; second gallery 115 × 100 on a 6.5 m terrace with four corner towers; bakan 75 → 60 m over 13 m in three tiers; five towers; causeway 100 m west; × 1.3 → 433 × 264 × 80 m |
| Height from the ground the camera stands on | central tower 65 m, corners ~55 | 61.5 real → 80 m world; corners 68 |
| Taller than wide? | no — 0.3:1 across the outer gallery | no, 0.30:1 |
| The bottom third is | the long low outer gallery and its gopuras | LIMESTONE colonnade facing out, corbelled vault, gopuras |
| Dominant surface colour (as a material) | grey sandstone, dark under the trees | 44 % LIMESTONE on the faces, 56 % RUBBLE inside the terraces (not seen until quarried) |
| Where the eye goes | the five towers over the galleries from the causeway | the same, camera at the causeway's end to the west |
| Outbuildings the survey names, and which are built | ថែវឈើឆ្កាង (the cruciform terrace, 31 × 68), the two libraries (built), the north library of the outer court, a small chedi | libraries built; the rest at life size fall inside the 1.3× galleries and `cityExcludeRadius: 320` clears them |

Kind of problem: a temple-mountain — a shell on a mountain. The twist: the
galleries are lintels on pillars and come down a bay at a time; the towers are
solid and each stands on one corner pier of the bakan. Score on `towers`,
`bakan`. `topples: false`, jungle hinterland.

Measured: 13.0k stones at low, 23.5k at high, 0 loose at both. Camera from the
west, `{ yaw: -1.42, pitch: 0.08, distance: 560, height: 42 }`.
