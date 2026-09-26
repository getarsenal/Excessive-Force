# Wat Arun, Bangkok — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py watarun`
before the builder is written; checked against `node tools/blocks.mjs watarun` and
`node tools/postcard.mjs watarun` after.

| | The real thing | Built (S = 2.0) |
|---|---|---|
| Plan, from the survey | พระปรางค์วัดอรุณ 37 × 37 m, the Chao Phraya 150 m east | central prang base 37 m square (three terraces 6 / 6.5 / 6.5 m), body 18.4 m square to 29 m, spire to 66 m, trident to 70.5; satellites at ±26 m (0.36 of the great one), mondops 8 m square at ±25 m on the axes; × 2 → 133 × 133 × 141 m |
| Height from the ground the camera stands on | 70 m (66.8 to 81.85 by different measures) | 70.5 real → 141 m world |
| Taller than wide? | yes, 1.9:1 for the prang alone | yes, 1.06:1 over the whole group with the satellites |
| The bottom third is | steep white terraces with stairs, the satellite prangs and mondops around them | MARBLE solid courses with TILE bands, eight stairs, four satellites, four mondops |
| Dominant surface colour (as a material) | white stucco with coloured porcelain — grey-white from the river | 88 % MARBLE, 12 % TILE |
| Where the eye goes | the spire's silhouette against the sky, from the river | the same, camera on the east bank |
| Outbuildings the survey names, and which are built | พระอุโบสถ 105 m SW, พระวิหาร 66 m W, โบสถ์น้อย / วิหารน้อย 50 m E, Mondop of the Buddha's Footprint | none built; `cityExcludeRadius: 80` keeps the ubosot and the outer monastery, the prang at 2× covers the rest |

Kind of problem: a mountain. The twist: a prang is solid and does not fall; the
terraces at its foot are the widest, heaviest part and carry the spire, so an
undercut low on one side takes that side's skin down the steps. `topples:
false`, `river: true`, `unlockScale: 4`.

Measured: 14.0k stones at low, 29.3k at high, 0 loose at both. Camera from the
river, `{ yaw: 1.45, pitch: 0.10, distance: 360, height: 60 }`.
