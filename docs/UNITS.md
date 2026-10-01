# Units: models, icons and what a new one needs

The arsenal is in `src/game/units.js`, one record per unit. A unit is a
gun, a launcher, a vehicle or an air strike; the record says which by what
it carries (`strike` and `aircraft` for a sortie, `model` and `modelLength`
for something that sits on the ground).

## Ground models

The towed guns and the self-propelled pieces are GLB files in
`public/assets/` (M119, M777, M109, M1128, M270, M142), loaded by `Models.load`
in `units.js`, Draco-compressed, normalised so the longest dimension is
`modelLength` metres, centred in plan, floored, and repainted the battery's
green with the source material's luminance kept so panel lines still read.

The convention is **nose along +Z, gun along +Z**. The two towed guns were
modelled trail-to-muzzle along X and carry a `modelYaw` to turn them; a
self-propelled piece modelled nose-forward needs none.

A supplied model is prepared before it goes in. The M1128 came as a
28 MB Sketchfab export: 235,000 triangles, 15 MB of textures, and the
spec-gloss material extension three.js no longer reads. The game repaints
every vehicle and drops its maps, so the textures, UVs and normals go
(`@gltf-transform`: strip, weld, meshopt simplify to a fifth, Draco); the
result is 150 KB, flat-shaded, which suits armour. Check the facing with
`node tools/icons.mjs <id>` before wiring it: the gun should point the way
the Paladin's does.

A unit with no file can be built in code. `src/game/vehicles.js` keeps
the procedural Stryker for that pattern: `model: 'procedural', build: fn`
in a record, and `Models.wrap` centres and floors what the function
returns without rescaling, because it is drawn in metres already.

## Airframes

Every aircraft is procedural, in `src/game/aircraft.js`, at true scale,
nose along +Z, in one vocabulary: `loft` for bodies, `surface` for wings
and fins, `pair` for anything on both sides, `part` for the rest. The
sortie picks the builder by `aircraft.kind`:

| kind | builder | who flies it |
|---|---|---|
| `eagle` | `makeEagle({ store })` | F-15E; GBU-28 with `store: 'gbu28'` |
| `lancer` | `makeLancer` | B-1B |
| `apache` | `makeApache` | AH-64E |
| `ghostrider` | `makeGhostrider` | AC-130J |
| `tomahawk` | `makeTomahawk` | BGM-109 |
| (lift) | `makeHercules`, `makeChinook` | the airlift |

`makeAirframe(def)` is the one switch over these, used by the sortie and
by the icon renderer, so a card shows exactly what flies.

Two strikes are not a pass but stay on station, and both follow the
player's target: `battle.setTarget` calls `air.retarget`. A record with
`aircraft.station` is flown by `_callLoiter` and `_updateLoiter`.

- **Apache** (45 s): hovers at `standoff` metres off the mark on the
  camera's side, each one in its own slot round the target so several
  never share the same air. On a new target it climbs over whatever
  `ceilingAlong` says stands on the route, crosses, and comes down to
  work: `rockets` in `pair`s every `every` seconds with `spread` metres of
  scatter, and a chain-gun burst every `gun.every` seconds on the defender
  nearest the mark through the `gunner` hooks the battle gives the air
  wing. Armour `AIRFRAME.gunship`.
- **AC-130** (75 s, `aircraft.orbit`): joins a banked left-hand orbit of
  `radius` at `height` over the mark on a tangent from behind the camera,
  and fires `shells` from the 105 mm on its port side (+x) straight down
  at the mark every `every` seconds. The orbit's centre drifts after a new
  target. Armour `AIRFRAME.ac130`.

Every crew in the garrison shoots at a helicopter (the Apache, and the
Chinook on a delivery), with line of sight, and a hovering one is easier
to hit; aeroplanes are still the AA gun's alone. Small arms do their
`heliDamage` to one, a fraction of what they do to a canopy, because it
is armoured; rockets and field guns carry an `airAim` that makes a hit
the exception. The AA gun is what brings an Apache down, so clearing the
flak first is what keeps one on station: at Westminster a full garrison
downs it after about 36 s of its 45, and with the flak gone it flies its
whole station and goes home.

Shot down, either one falls and explodes. Rounds carry their sortie, so
the feed reports stones and kills once, when it leaves. `loiterStatus()`
is what the HUD pill under the target card reads: one aircraft icon and
one run-down clock per aircraft on station, three to a row in call order,
the rest behind a +N toggle, closing up as they expire. The gunship
flies 450 m out and 300 m up; the camera tilts up past its lowest orbit
(`CameraRig.orbitFloor`) so it can be watched.

Names the sortie looks for: `prop` and `rotorA` are spun, `tailrotor` too;
`bomb` is the child hidden at release. `aircraft.consumed` means the
airframe is the round: the model vanishes at the aim point and the
projectile carries on. `strike.salvo { n, spread }` releases `n` rounds
spaced back along the run. `STRIKE_RATE` at the top of the file is the
pitch of each one's roar.

## Units and Strikes

The dock has two weapon drawers. UNITS holds everything that is placed on
the ground; STRIKES holds every record with a `strike`, the aircraft and
the Tomahawk, in two groups, loitering (anything with
`aircraft.station`, whose card says LOITER where the tier goes) then single
pass, each cheapest first: `STRIKES` in `units.js` is that order, and the
armoury reads it too. The split is by that field, not by tier, so a new strike
lands in the right drawer without a list to update. The armed weapon is
worn by the button it came from, and tapping that button puts it away.
Number keys pick from UNITS; Shift with a number, or a number while the
STRIKES drawer is open, picks from STRIKES. The badge in
`src/ui/dock/strikes.png` is the supplied art, cut tight to its disc and
resampled to 192 × 192 like the other four, so the circles match.

## Icons

Every unit has a 512 × 320 PNG in `public/assets/icons/`, listed in
`IMAGE_ICONS` in `src/ui/icons.js`. The infantry teams (the M120 among
them) and the Tomahawk are drawn art, trimmed to the artwork and centred
in the slot. The guns, vehicles and aircraft are rendered from the game's
own models by `node tools/icons.mjs [ids]` with the dev server up: rotor
and prop blur discs are hidden, and the bunker buster is shot from below
with an under-light so its card shows the store that makes it different
from the F-15's. The vector pictograms in the same file remain the
fallback for a unit with no PNG.

## Looking at a model

The quickest check on an airframe or a hull is to render it alone from
three sides. With the dev server up on 5177 and no suite running:

```
node tools/modelshot.mjs makeApache makeStryker    # writes /tmp/out/<name>.png
```

Do not run it while a suite is in flight: it puts a probe page in
`public/` for the duration, and the dev server reloads every client when
it appears.
