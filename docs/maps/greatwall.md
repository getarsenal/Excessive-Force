# Great Wall at Badaling, Beijing — the proportion table

Filled in from three reference photographs and `python3 tools/survey.py greatwall`
before the builder is written; checked against `node tools/blocks.mjs greatwall` and
`node tools/postcard.mjs greatwall` after.

The survey: a summit at 800 m, 226 m over the map's low ground, the level
crest 188 x 411 m (x -96..92, z -190..221), running north-south. No surveyed
building within 120 m. Along x = 0 the crest is level from z -160 to +210,
falls 60 m between -170 and -240 to a shelf, and 35 m between +220 and +270.

| | The real thing | Built (S = 2.0) |
|---|---|---|
| Plan, from the survey | the wall follows the crest; here 500 m of it | 500 m along z, 12 m over the leaves, five towers 22 m square at 111 m spacing |
| Height from the ground the camera stands on | wall 7.8 m to the walk, parapet to 9.6; towers about 12 m | wall 15.6 world to the walk, 19.2 to the merlons; towers 30 world over the ground, more where the base shows on the slope |
| Taller than wide? | the towers are; the wall is a line | towers 1.4:1 over their exposed base; the wall a line |
| The bottom third is | granite blocks, dressed, on the rock | `CONCRETE` leaves round `RUBBLE` fill, coarse and bare where buried |
| Dominant surface colour (as a material) | grey granite under grey-blue brick | `CONCRETE` 0xa39c8e (72%) with `SLATE` parapets and merlons |
| Where the eye goes | the line of the wall stepping over the ridge with the towers on it | the same: the walk steps down with the crest at both ends, the towers stand on the slope |
| Outbuildings the survey names, and which are built | none | none |

Summit: `padRadius: 0`, `groundLevel: 'bake'`. The wall is laid in level pieces
8 m (real) long between the towers, each piece's walk at the highest crest under
it plus 7.8 m and its footing 6 m under the lowest, coarse below the lowest
ground less two; the crest is a table in the module sampled from the bake at
ten metres along x = 0 over the wall's own width.

Materials: the brief said LIMESTONE for the granite; Badaling's granite is
grey, and CONCRETE is the grey the Segovia brief itself names for granite.
The parapets are SLATE (grey brick) rather than the red-brown BRICK.

Stones: 5,922 at low / 10,004 at high, 2,080 of them below the summit; 0
loose at both tiers.

Kind of problem: fortress on a ridge. The twist: the wall is a dyke full of
rubble and does not topple — it is not scored; the five towers are hollow,
tall on their exposed bases, and go over downhill when undercut.
