# Forbidden City, Beijing — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py forbidden`
before the builder is written; checked against `node tools/blocks.mjs forbidden` and
`node tools/postcard.mjs forbidden` after.

| | The real thing | Built (S = 2.0) |
|---|---|---|
| Plan, from the survey | 太和殿 68 × 41 m (eaves), 中和殿 27 × 27, 保和殿 53 × 29, on one terrace ~230 × 130 | halls 64 × 37, 24 × 24, 50 × 25 (walls) at real size; terrace 工-shaped 212 × 130, three tiers 8.1 m; all × 2 → 452 × 260 m, 79 m tall |
| Height from the ground the camera stands on | terrace 8 m + Taihedian 27 m = 35 m | 8.1 + 28.6 real → 73 m world to the ridge, 79 with the ridge ornaments |
| Taller than wide? | no — the terrace is seven times as long as the hall is tall | no, 0.30:1; the halls read as tall against the terrace's flatness |
| The bottom third is | white marble terrace with its balustrades and three stairs | MARBLE slabs in three tiers, balustrade rings, three corbelled flights on the south |
| Dominant surface colour (as a material) | white marble below, red walls, yellow glazed roof — the roof is what the eye reads | 91 % MARBLE by volume (the terrace is solid), then GOLD roofs, MADDER walls, SLATE brackets |
| Where the eye goes | the double-eaved yellow roof of Taihedian above the stairs | the same: the roof is GOLD, stepped rings closing on a 27 m ridge |
| Outbuildings the survey names, and which are built | 中右门 / 中左门 / 右翼门 (the side gates), 院墙 6 / 7 (the flanking galleries), all at life size inside 120 m | none — at 2× the terrace stands over every one of them; `cityExcludeRadius: 380` clears the court |

Kind of problem: a topple on a plinth (Himeji's). The twist: the terrace is
ground and scores nothing; the roof is the heaviest part of each hall and the
walls under it are columns with doors between them, so the halls go over the way
the player leans them. Score on `supreme`, `central`, `preserving`.

Measured: 23.4k stones at low, 38.9k at high, 0 loose at both. Camera from
the south courtyard, `{ yaw: 0.16, pitch: 0.13, distance: 470, height: 38 }`.
