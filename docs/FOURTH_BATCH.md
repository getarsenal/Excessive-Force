# The fourth batch: twenty-five maps

Twenty-five maps added together, built in parallel in worktrees, one
landmark module each. This is the §0 paragraph the playbook asks for, per
map — kind, scale, twist, materials, sections — and the rules the builders
work under. `docs/THIRD_FIVE.md` is the model; `docs/NEW_MAP_PLAYBOOK.md`
is the law, §0b and §2b above all.

Everything below is a brief, not a survey. Before a constant is typed, run
`python3 tools/survey.py <id>`: the landmark's own outline is usually in the
bake with its real plan, and the outbuildings are there by name. Where the
survey and this page disagree, the survey wins on plan and the photographs
win on elevation.

## The twenty-five

**colosseum — the Colosseum, Rome.** Kind: *shell*, a ring. An ellipse
189 × 156 m, the outer wall 48 m: three tiers of eighty arches on piers
(Doric, Ionic, Corinthian), an attic with pilasters and small square
windows. Two fifths of the outer ring stands (the north side); the rest
shows the inner ring at about 40 m, and the cavea between them is radial
walls under vaulted corridors stepping down to the arena, 87 × 55. Scale
1.5. Twist: the outer wall is eighty piers carrying three storeys of arches
with nothing behind it where the cavea has gone; kick two adjacent
ground-tier piers out and the whole bay above them falls *outward*. Where
the cavea survives, the inner ring braces the outer and the same shot does
nothing. Materials: LIMESTONE for the travertine ring, BRICK for the inner
ring, RUBBLE for the cavea fill. Sections: `outer`, `inner`, `cavea`,
`hypogeum`. Score on `outer`, `inner`.

**towerbridge — Tower Bridge, London.** Kind: *cantilever pair* tied by a
bridge. 244 m end to end: an 82 m side span, a tower on its pier, the 61 m
central span (the bascules), the second tower, the second side span. The
towers are 65 m to the pinnacle, about 26 × 20 in plan, a steel frame clad
in granite and Portland stone; the two walkways run between them 44 m over
the water. Scale 1.6. The level's origin is the **north abutment on Tower
Hill**, on dry ground; the survey says where the water begins south of it,
and the bridge is built south (+z) across the Thames with its piers founded
below the bed — `FOUND` well under the waterline, coarse and bare below the
water. Twist: the side spans rest on the towers and the abutments and the
walkways tie the towers; cut the north tower's pier and the tower, the
walkway ends and both spans on it go into the river. Materials: LIMESTONE
facing, STEEL for the walkway lattice, IRONWORK for the bascule frames,
SLATE roofs, GILT finials. Sections: `northtower`, `southtower`, `walkways`,
`bascules`, `northspan`, `southspan`, `abutments`. Score on the towers and
the walkways. `traits: { windows: true, river: true, topples: true }`.

**florence — the Cathedral, Florence.** Kind: *shell*. Brunelleschi's dome:
an octagon 45 m across, springing at 55 m off a drum on four great piers
and three tribunes (apses), 32 m of dome and a 21 m lantern to 114 m. The
nave is 153 m long and 38 wide, 45 m to the roof; Giotto's campanile,
84.7 m and 14.45 m square, stands at the south-west corner. Scale 1.4.
Twist: the dome bears on the drum, the drum on the piers, and the piers are
held by the three tribunes; open a tribune and the drum spreads on that side
and the dome comes down in a sheet — it does not topple, and the suite must
not expect it to. Materials: MARBLE with VERDE bands for the facings,
REDSTONE for the terracotta dome and the roofs, BRICK where the dome's
inner shell shows, GILT for the lantern's ball. Sections: `dome`, `drum`,
`lantern`, `tribunes`, `nave`, `campanile`. Score on `dome`, `drum`,
`lantern`, `campanile`. `topples: false`.

**segovia — the Aqueduct, Segovia.** Kind: *arch chain*. Unmortared granite:
in the Plaza del Azoguejo it is 28.5 m high in two tiers of arches on piers
about 2.4 m wide at the top and wider below, spans around 5 m; the tall
section runs about 280 m and the single-tier run climbs west with the
ground. Scale 2.2 (63 m high). The ground under it is *not* level — that is
what an aqueduct is for — so every pier is founded down to meet the rock
(`padRadius: 0` on the level; no flatten pad). Twist: an arcade shares its
thrust; take one pier out and the two arches on it fall, and the two piers
beside them are now unbraced and go with the next hit, and the chain
unzips to the next wide pier. Materials: CONCRETE for the grey granite (its
colour is right), LIMESTONE for the channel. Sections: `lowerpiers`,
`lowerarches`, `upperpiers`, `upperarches`, `channel`. Score on all.
`traits: { windows: false, river: false, topples: true }`.

**atomium — the Atomium, Brussels.** Kind: *lattice*. 102 m: nine 18 m
steel spheres at the corners and centre of a cube standing on one vertex,
joined by 3.3 m tubes along the cube's edges and its diagonals, the whole
thing on a central vertical tube and three bipods under the three lower
outer spheres. Scale 2.0 (204 m). The diagonal tubes are stacks of yawed
stones that corbel — each stone steps sideways by less than its own width —
so the solver's "underneath" walk follows them. Twist: the mass is in the
spheres and the spheres carry only themselves; the load runs down the
column and the bipods. Take the bipods and it is a tower on one leg; take
the column at the base pavilion and the whole molecule comes down.
Materials: STEEL throughout, GLASS for the sphere windows. Sections:
`base`, `column`, `tubes`, `spheres`, `bipods`. `windows: false`.

**tokyotower — Tokyo Tower.** Kind: *lattice*, the Eiffel's kind: read
`eiffel.js`. 333 m, four legs on an 80 m square, the main observatory a
two-storey box at 150 m, the special observatory at 250 m, the antenna
above. International orange and white in bands. Scale 1.0. Twist: the
Eiffel's — cut a leg and it falls toward it — and the observatory at 150 m
is where the mass is, so the fall is decided low. Members sized to their
spacing (40% of the gap), decks as solid plates. Materials: IRONWORK for the
orange (its bronze reads as it), STEEL for the white bands, GLASS for the
observatory. Sections: `legs`, `cage`, `observatory`, `upper`, `antenna`.

**budapest — the Hungarian Parliament.** Kind: *shell* with wings: 268 m
along the Danube, 123 m deep, the dome 96 m on a sixteen-sided drum over the
central hall, two pinnacled pavilions at the ends, Gothic Revival in
limestone with a red-brown dome and roofs. Scale 1.2 (322 × 148 × 115).
Stone budget: the wings are the mass and go coarse; the dome, drum and the
two great spires beside it are the fine work. Twist: the dome stands on the
sixteen piers of the drum, inside the hall; the wings are not the target and
their courses are not the load path. Score on `dome`, `drum`, `spires`.
Materials: LIMESTONE, REDSTONE for the dome and roofs, GILT finials.
Sections: `dome`, `drum`, `spires`, `hall`, `northwing`, `southwing`.
`traits: { windows: true, river: true, topples: false }`.

**sagrada — the Sagrada Família, Barcelona.** Kind: *cantilever cluster*.
Plan 90 × 60; eighteen spires: four on the Nativity facade (98–120 m), four
on the Passion facade, the four Evangelists at 135 m round the crossing,
Mary at 138 over the apse and Jesus at 172.5 over the crossing. Scale 1.0.
Twist: every spire is a hollow parabolic cone of stone standing on four
piers at facade level, and the Jesus tower stands over the crossing on four
columns inside the nave; cut two of those columns and 172 m of stone comes
down through the nave roof. Materials: SANDSTONE for the warm Montjuïc
stone, LIMESTONE for the newer work, GILT for the finials, GLASS.
Sections: `nativity`, `passion`, `evangelists`, `mary`, `jesus`, `nave`.

**edinburgh — Edinburgh Castle.** Kind: *fortress on a hill* — the Potala's
kind, read §2b twice. Castle Rock's summit is about 130 m ASL and 80 m above
Princes Street, sheer on the north, south and west, with the Esplanade
running east along the tail. The Half Moon Battery is the great curved wall
at the east end, 30 m high, with David's Tower inside it and the Royal
Palace and Great Hall on Crown Square behind; the Argyle and Mills Mount
batteries face north; St Margaret's Chapel is on the very top. Scale 1.6.
`padRadius: 0`, `groundLevel: 'bake'`; walls founded below the summit and
exposed where the rock falls away. Twist: the Half Moon Battery is a
retaining wall holding the fill the palace stands on; undercut it and the
palace block goes east onto the Esplanade. The One O'Clock Gun is a
`turret` on Mills Mount, on its own ground. Materials: LIMESTONE for the grey
sandstone, SLATE roofs. Sections: `halfmoon`, `palace`, `greathall`,
`chapel`, `batteries`, `gatehouse`. Flag pattern: `saltire`.

**neuschwanstein — Neuschwanstein, Schwangau.** Kind: *cantilever cluster
on a ridge*. The castle runs along a north–south ridge 160 m above the
village: the red-brick gatehouse at the north end, the Knights' House and
the Bower along the courtyard, the Palas at the south end — a five-storey
block about 30 × 20 with the 65 m north tower and the 45 m square tower at
its corners. Scale 1.6. `padRadius: 0`, `groundLevel: 'bake'`, foundations
down the west flank into the Pöllat gorge. Twist: two slender towers on the
corners of a big block; the towers go over the way they lean, and the Palas
is the counterweight. Materials: MARBLE for the white limestone, REDSTONE
for the gatehouse, SLATE roofs, GILT. Sections: `palas`, `northtower`,
`squaretower`, `gatehouse`, `knightshouse`, `bower`. Setting: forest
hinterland, thin blue Alpine haze.

**montstmichel — Mont-Saint-Michel.** Kind: *mountain with a spire*. An
80 m rock in a tidal bay; the abbey church on the summit with its nave floor
at 80 m and the spire to 157 m; La Merveille, three storeys and 35 m high,
along the north face; the village on the south-east benches inside the
ramparts and their towers. Scale 1.3. `padRadius: 0`, `groundLevel: 'bake'`;
the bake floods the bay at high water. Twist: the church stands on crypts
built out on the rock's flanks — the chancel over one, the nave over
another; break a crypt and the church above it goes down the face. Materials:
LIMESTONE for the granite, SLATE roofs, GILT for the archangel. Sections:
`church`, `spire`, `merveille`, `crypts`, `ramparts`, `village`. Score on
`church`, `spire`, `merveille`. `river: false`.

**pena — the Pena Palace, Sintra.** Kind: *fortress on a hill*. On a 500 m
crag in the Sintra forest: the ochre-red old monastery with its clock tower,
the yellow New Palace with the great round bastion on the cliff, the
battlemented terraces, the drawbridge gate, azulejo everywhere. About 100 ×
60 in plan. Scale 1.8. `padRadius: 0`, `groundLevel: 'bake'`. Twist: the
round bastion stands on the cliff edge on its own foundations; the palace
leans on it. Materials: SANDSTONE for the red, LIMESTONE for the yellow,
TILE for the azulejo bands, SLATE. Sections: `monastery`, `clocktower`,
`newpalace`, `bastion`, `terraces`, `gate`. Forest hinterland.

**hassan — the Hassan II Mosque, Casablanca.** Kind: *cantilever* on a
*shell*. The prayer hall is 200 × 100 and 60 m high, part of it standing
over the Atlantic; the minaret is 210 m on a 25 m square, at the hall's
corner. Scale 1.0. Twist: the hall's roof is beams on seventy-eight columns
(lintels, as the Parthenon's — a flat slab does not span), and the minaret
stands on the hall's corner piers; the fight is the minaret and the hall
under it. Materials: MARBLE, TILE for the green-glazed bands, GILT.
Sections: `minaret`, `hall`, `columns`, `roof`, `esplanade`. Score on
`minaret`, `hall`, `roof`. Palette: white city, ocean. `windows: true`.

**kuwait — the Kuwait Towers.** Kind: *cantilever trio*. The main tower is
187 m with two spheres — the lower 32 m across at about 80 m, the upper 14 m
across at about 120 m; the second is 147 m with one sphere; the third is a
113 m needle. Tapering concrete shafts, the spheres faced in blue-green
enamel discs. Scale 1.4. Twist: the mass is the spheres and the shafts are
slender; cut a shaft below its sphere and the sphere comes down whole.
Materials: CONCRETE for the shafts, TILE and GLASS for the spheres.
Sections: `tower1`, `tower2`, `tower3`, `spheres`. Sea on three sides.

**karnak — the Hypostyle Hall, Karnak.** Kind: *colonnade* — the
Parthenon's kind, read `parthenon.js`. 103 × 52 m, 134 columns in sixteen
rows: twelve central columns 21 m tall and 3.6 m across with open capitals,
122 others 15 m and 2.7 m; architraves bridging each pair, roof slabs, a
clerestory over the centre. The Second Pylon west of it and the Third east,
about 30 m high and ruined; the Great Court and the First Pylon beyond.
Scale 2.0. Twist: the Parthenon's — the lintels are the load path — with
the clerestory riding on the height difference between the two column
sizes. Materials: SANDSTONE throughout (it is). Sections: `pylon2`,
`pylon3`, `columns`, `architraves`, `roof`, `court`. Palette: Giza's.
`traits: { windows: false, river: true, topples: false }`.

**forbidden — the Forbidden City, Beijing.** Kind: *topple on a plinth* —
Himeji's kind, read `himeji.js`. The Hall of Supreme Harmony, 64 × 37 and
27 m to the ridge, a double-hipped roof of yellow glazed tile on seventy-two
red columns, standing with the Hall of Central Harmony (a 24 m square) and
the Hall of Preserving Harmony behind it on one three-tier white marble
terrace 230 m long and 8 m high. Scale 2.0. Twist: the roof is the heaviest
part of the hall and the terrace is ground; the halls go over the way you
lean them. Materials: MARBLE for the terrace, MADDER for the red walls and
columns, GOLD for the glazed roofs (structural — GILT is not), KYEMA for the
dark eaves. Sections: `terrace`, `supreme`, `central`, `preserving`. Score
on the three halls.

**gyeongbok — Gyeongbokgung, Seoul.** Kind: *topple on a plinth*.
Geunjeongjeon, the throne hall, 30 × 21 with a two-tier grey tile roof about
25 m to the ridge on a two-level granite terrace, in a courtyard 100 × 130
enclosed by cloisters with Geunjeongmun gate on the south. Scale 2.2. Twist:
Himeji's again, with the cloister ring as the garrison's cover. Materials:
LIMESTONE for the granite, REDSTONE for the columns, SLATE for the roofs (it
is grey tile), VERDE for the painted eaves. Sections: `terrace`, `hall`,
`cloisters`, `gate`. Score on `hall`, `gate`.

**watarun — Wat Arun, Bangkok.** Kind: *mountain*. The central prang is
about 70 m on a base 35 m square of steep tiered terraces, four satellite
prangs about 25 m at the corners and four mondops between them, all
encrusted in porcelain. Scale 2.0 (140 m). Twist: a prang is solid — it has
to be quarried — but its terraces are retaining rings round a core, and an
undercut on one side sheds that side's skin down the terraces. Give it the
stairs it has. Materials: MARBLE for the white stucco, TILE for the
porcelain bands, GILT for the finial. Sections: `core`, `terraces`,
`satellites`, `mondops`. The Chao Phraya is sixty metres east. `river:
true`, `topples: false`.

**shwedagon — the Shwedagon Pagoda, Yangon.** Kind: *mountain*. The stupa
is 99 m to the hti on a base 138 m across: octagonal terraces, the bell, the
banana bud, the umbrella, all gold; sixty-four small stupas round its foot,
four devotional halls at the cardinal points, on a platform of 5.6 ha on a
hill 50 m over the city. Scale 1.3. `groundLevel: 'bake'`. Twist: solid
gilded brick — quarry it; the small stupas and the halls are the finesse.
Materials: GOLD for the stupa (structural), MARBLE for the platform and
halls, GILT for the hti. Sections: `stupa`, `terraces`, `smallstupas`,
`halls`. `topples: false`.

**angkor — Angkor Wat.** Kind: *temple-mountain*. Inside a 190 m moat, the
outer gallery 187 × 215, the second 100 × 115, the inner enclosure 60 × 60 on
a 13 m pyramid base, and the five towers in quincunx — the central 65 m
over the ground, the corners about 55; the western causeway 350 m. Scale
1.3. Twist: the towers stand on the bakan's corner piers and the galleries
are colonnades, lintels over columns; the stone budget says the galleries
are coarse and the towers fine. Materials: LIMESTONE for the grey
sandstone, RUBBLE for the terrace fill. Sections: `bakan`, `towers`,
`inner`, `outer`, `causeway`. Score on `towers`, `bakan`. Jungle.

**borobudur — Borobudur, Magelang.** Kind: *mountain*. 123 × 123 at the
base, 35 m high: six square terraces of balustraded galleries, three round
terraces with seventy-two perforated bell stupas of 3.5–4 m, a 16 m central
stupa. Scale 2.0. Twist: it is a hill with a stone skin — the galleries are
retaining walls — and what scores is the upper terraces and the stupas, not
the hill. Materials: CONCRETE for the dark andesite, RUBBLE inside.
Sections: `lower`, `galleries`, `round`, `stupas`, `central`. Score on
`round`, `stupas`, `central`. Wild ground. `topples: false`.

**tikal — Temple I, Tikal.** Kind: *mountain with a comb*. Temple I is 47 m:
nine stepped terraces on a base about 35 × 30, the stair up the west face,
the shrine on top and a hollow roof comb 12 m above it. Temple II faces it
across the Great Plaza a hundred metres west, 38 m. Build both — Temple II
as a second structure with `offset: { x: -100, z: 0 }`, its own ground.
Scale 2.4. Twist: the comb is thin, tall and hollow, and stands on the
shrine's back wall; shoot its base and the comb topples whole. Materials:
LIMESTONE. Sections: `terraces`, `stair`, `shrine`, `comb`. Score on all but
`terraces`. Jungle; Chichén's palette and setting.

**teotihuacan — the Pyramid of the Sun.** Kind: *mountain* — Giza's kind,
read `giza.js` for the stone cap. 223 × 224 at the base and 65 m high in
five tiers of talud-tablero, the stair on the west face, the Adosada
platform in front of it. Scale 1.0. Twist: Giza's — nothing falls, it is
quarried — with the real cave and tunnel under the centre as a void with
CHARGE blocks along it. The Pyramid of the Moon stands 800 m north and
300 m west as a coarse scenery structure on its own pad, `required: false,
scenery: true, offset: { x: -300, z: -780 }`. `unlockScale` around 12.
Materials: RUBBLE core, SANDSTONE facing (it was plastered red).
Sections: `core`, `facing`, `stair`, `adosada`, `temple`, `tunnel`. Palette:
dry highland — tan, olive, dust.

**machupicchu — Machu Picchu.** Kind: *mountain*, terraces. A citadel on a
north–south saddle ridge at 2430 m with the Urubamba 400 m below on both
sides. Nothing here is tall: the Intihuatana is a terraced outcrop about
20 m high with the stone on top; the Temple of the Sun (the Torreón) has the
curved wall; the Principal Temple and the Sacred Plaza beside it; the
agricultural terraces step down the south. Scale 1.8. `padRadius: 0`,
`groundLevel: 'bake'`. Primary: the Intihuatana with the Sacred Plaza
temples; the Torreón as a second required structure; the terraces as
scenery. Twist: dry ashlar with no mortar; the terraces are retaining walls
and the temples stand on them. Materials: MARBLE for the pale granite,
LIMESTONE for the terraces. Sections: `intihuatana`, `temples`, `torreon`,
`terraces`, `houses`. `topples: false`. Forest hinterland.

**greatwall — the Great Wall at Badaling.** Kind: *fortress on a ridge*.
The wall is 7.8 m high and 5–6 m wide at the top with battlemented parapets
both sides, granite blocks under brick; two-storey watchtowers about 10 × 10
and 12 m high every 100–200 m. The bake cuts a ridge running north–south
through the origin; build about 500 m of wall along its crest with four or
five towers, the wall stepping with the ground and founded down to the rock
where the crest falls away (`padRadius: 0`, `groundLevel: 'bake'`). Scale
2.0. Twist: the wall is a retaining wall full of rubble and does not
topple; the towers do, and they are the score. Materials: LIMESTONE for the
granite, BRICK for the parapets, RUBBLE for the fill. Sections: `wall`,
`parapets`, `towers`, `fill`. Score on `towers`. Forest hinterland.

## Rules for a builder written in a worktree

- **Read `docs/NEW_MAP_PLAYBOOK.md` §0b, §2, §2b, §4, §5 in full before a
  line of code.** Then `python3 tools/survey.py <id>` for the plan and the
  outbuildings, and write `docs/maps/<id>.md` before the builder.
- **Edit only**: your landmark modules in `src/structure/landmarks/`, your
  own levels' records in `src/game/levels.js` (every `TODO(<id>)` in the
  record: camera, exclusion radii, palette, setting, traits, scoreTags,
  precinct, par, brief, victory, and `padRadius`/`groundLevel` on a summit),
  and `docs/maps/<id>.md`. Nothing else: the contract, the cast, the flag,
  the blurb and the running order are being written by someone else at the
  same time.
- The module exports what the scaffold already exports and the game already
  imports: the constants object (with `scale` and `flag`), `build<Name>
  (quality)` returning a `BlockList`, `populate<Name>(g, origin, groundY)`.
  A second structure (Temple II, the Torreón) is a second exported builder,
  added to the level's `structures` list.
- **No browser is needed to know whether it stands.** `node tools/blocks.mjs
  <id>` for the count, the box, the sections and the colour line; `node
  tools/loosecheck.mjs <id> low` and `high` for the loose stones, in a
  second, by section. Both must be clean before a render. Keep the count
  under about 45,000 at low.
- **Renders are rationed.** `TT_PORT=<your port> node tools/postcard.mjs <id>
  --out /tmp/out-<id>` against your own dev server (`npx vite --port <port>
  --strictPort` in your worktree, `node_modules` symlinked). The box has
  four cores and five of you; one render at a time each, three or four per
  level, only after the two checks above are clean. Never run the suite; it
  is run centrally after the merge.
- **Done means**: `blocks.mjs` under budget with the colour line reading as
  the photograph; `loosecheck.mjs` zero at low and high; the postcard
  recognisably the place from the side its photographs are taken from, with
  the level's `camera` set to that angle; `docs/maps/<id>.md` filled in with
  measured numbers; every `TODO(<id>)` in your files gone; `git commit` in
  the worktree with a message that says what kind of problem the building is
  and what the twist does. No model identifier anywhere. Do not push.
- If the engine is wrong — a shape the solver has never met — say so in your
  final report with the evidence, rather than special-casing it in the
  builder.
