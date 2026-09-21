# The third five

Five maps added together, each a new nation on the campaign map and a new
structural problem for the solver. This is the §0 paragraph the playbook asks
for, per map, and the rules the five builders were written under — in
parallel, in separate worktrees, one landmark module each.

## The five

**Athens — the Parthenon.** Kind: *colonnade*, which the game has not had. A
Doric temple is a dry-stone machine: forty-six fluted columns (8 × 17, the
corners counted once) of stacked drums, an architrave of lintels bridging
each pair, a frieze and cornice on that, a pediment at each end, and a
cella — a walled inner room with its own porch columns — inside the ring.
Nothing is fixed to anything; it stands on friction and dead weight. Scale
3.0 (the real thing is 31 × 70 m on the stylobate and 14 m to the cornice;
built at 92 × 210 m and 42 m). Twist: the lintels are the load path. Shoot
the drums out from under one column and its two lintels fall with the
cornice above them, and the next column along is carrying a cantilever it
was never asked to. The roof is absent, as it is in life; the pediments and
the cella's upper walls stand ruined, which reads as the ruin. Materials:
MARBLE for columns, entablature and cella; LIMESTONE for the three-step
stylobate. Sections: `stylobate`, `columns`, `entablature`, `pediment`,
`cella`. Score on everything but the stylobate.

**Istanbul — Hagia Sophia.** Kind: *shell*, but a different shell from the
Taj: a shallow dome fifty-five metres up on four great arches over a square
nave, its thrust taken not by the arches but by two half-domes east and
west and by four huge buttress piers north and south, with exedrae and
galleries under the half-domes and four minarets at the corners. Scale 1.6
(the dome is 31 m across and 55 m up; built at 50 m and 88 m; the plan
82 × 73 m becomes 131 × 117). Twist: the dome is held from outside. It does
not topple and the suite must not expect it to; it *breaks* when a
buttress pier or a half-dome is opened, because the arch it braced then
spreads and the dome over it comes down in a sheet. Materials: BRICK for
the dome, arches and vaults (the real dome is brick); LIMESTONE for the
piers and buttresses; MARBLE facings are not worth a material; the minarets
LIMESTONE with a SLATE cap; GILT for the finials. Sections: `dome`, `arches`,
`halfdomes`, `buttresses`, `nave`, `galleries`, `minarets`, `base`. Score on
`dome`, `halfdomes`, `arches`, `minarets`.

**Cologne — the Cathedral.** Kind: *cantilever pair*. Two openwork stone
spires 157 m high on the west front, on two piers each, over a five-aisled
nave with flying buttresses and a choir. Scale 1.3 (204 m spires; the plan
145 × 86 m becomes 188 × 112). Twist: gothic stone does as little work as it
can. The spires are hollow, pierced tracery over a square core, and each
stands on four piers at the tower's corners; the tracery carries nothing.
Cut two adjacent piers and the spire above them goes over, away from the
cut, and the nave roof it lands on is a thin vault. The flying buttresses
are the nave's stability: shoot them off one side and the clerestory wall
leans. Materials: LIMESTONE throughout (the real trachyte reads as grey
limestone), SLATE for the nave roof, RAILING for the tracery infill so
nothing rests on it, GILT for the cross finials. Sections: `northspire`,
`southspire`, `westfront`, `nave`, `buttresses`, `choir`, `roof`. Score on
everything.

**Himeji — the Castle.** Kind: *topple*, on a plinth that does not. A battered
stone base (a truncated pyramid of ishigaki, 15 m high, faces sloping in)
on the hilltop pad, and on it a six-storey keep — five visible roofs
stepping in, white plaster walls, dark tile roofs with wide eaves, gables
alternating in direction — with three smaller keeps linked to it by
corridors, which are the garrison's positions. Scale 2.5 (the keep is
31.5 m over its 14.85 m base; built at 79 m over 37 m). Twist: the base
cannot be shot down — it is the ground, near enough, and the suite must
not expect the *plinth* to fall — but the keep on it is tall, timber-light
above and heavy in its plaster walls, and it goes over the way you lean
it. Timber does not exist as a material; the walls are BRICK (light, it is
the closest in density to a plastered timber frame) faced white by the
material's colour where a white one is available, else MARBLE for the
plaster; SLATE for the roofs; LIMESTONE for the ishigaki; the small keeps
the same. Sections: `base`, `keep`, `roofs`, `westkeep`, `eastkeep`,
`corridors`. Score on everything but `base`.

**Dubai — the Burj Khalifa.** Kind: *cantilever*, the tallest by three
times. A Y-plan buttressed core: a hexagonal central core with three wings,
each wing stepping back in twenty-seven setbacks as it climbs, the wings
ending at different heights so the tower spirals in, then a telescoping
spire. Scale 0.6 (828 m becomes 497 m; still twice the Eiffel). Twist:
everything above a setback stands on the setback under it, and the core is
the one thing that goes all the way up. Take a wing at its base and the
wing above it is a free body but the core stands; take the core at a
setback and everything above the cut is a free body with a very long way
to fall and a city under it. Materials: CONCRETE for core and wing slabs,
GLASS as infill on every face (structural: false, it carries nothing), STEEL
for the spire. Sections: `core`, `wingA`, `wingB`, `wingC`, `spire`,
`podium`. Score on everything but `podium`. `unlockScale` is 1 in the level
record; check that the unlocks arrive at a sensible pace.

## Rules for a builder written in a worktree

- **Edit only your landmark module** in `src/structure/landmarks/`, and, if
  you must, only your own level's record in `src/game/levels.js` (camera,
  cityExcludeRadius, scoreTags, traits, precinct). Nothing else. Everything
  else in the repo is being edited by someone else at the same time.
- The module exports **three things** by the names the skeleton already
  uses and the rest of the game already imports: the constants object (with
  `scale` and `flag: { x, y, z }`, the flag's position on a stone that
  falls when the building does), `build<Name>(quality)` returning a
  `BlockList`, and `populate<Name>(g, origin, groundY)` calling `g.place`.
  Read `src/structure/builder.js` for the vocabulary and
  `src/structure/landmarks/tajmahal.js`, `bigben.js`, `pisa.js` for how the
  nine before you used it. Read `docs/NEW_MAP_PLAYBOOK.md` §2–4 in full
  before writing a line.
- **Your own dev server on your own port**: `npx vite --port <port>
  --strictPort &` in your worktree, and `TT_PORT=<port>` for every tool
  (`loose.mjs`, `look.mjs`, `suiteall.sh` with `OUT=/tmp/out-<id>`). The box
  has cores for three browsers at a time across everyone, so run one probe at
  a time and never the suite while a probe is up.
- `node_modules` is a symlink to the main checkout's. Do not run `npm
  install`.
- **Done means**: `node tools/loose.mjs <id> low` reports zero loose stones
  at low and at high; `TT_PORT=<port> OUT=/tmp/out-<id> sh tools/suiteall.sh
  <id>` is 35 pass 0 fail; you have looked at `look.mjs`'s three views and the
  building is recognisably the building; the blind-defender count is within
  the baseline in playbook §4; and `git commit` in the worktree of your module
  (and your record, if touched) with a message that says what kind of
  problem the building is and what the twist does. No model identifier in
  the commit or in a comment. Do not push.
- If the engine is wrong — a shape the solver has never met — say so in your
  final report with the evidence, rather than special-casing it in the
  builder. That is the map finding a hole, and the fix belongs in the engine.
