# Units: models, icons and what a new one needs

The arsenal is in `src/game/units.js`, one record per unit. A unit is a
gun, a launcher, a vehicle or an air strike; the record says which by what
it carries (`strike` and `aircraft` for a sortie, `model` and `modelLength`
for something that sits on the ground).

## Ground models

The towed guns and the self-propelled pieces are GLB files in
`public/assets/` (M119, M777, M109, M270, M142), loaded by `Models.load`
in `units.js`, Draco-compressed, normalised so the longest dimension is
`modelLength` metres, centred in plan, floored, and repainted the battery's
green with the source material's luminance kept so panel lines still read.

The convention is **nose along +Z, gun along +Z**. The two towed guns were
modelled trail-to-muzzle along X and carry a `modelYaw` to turn them; a
self-propelled piece modelled nose-forward needs none.

A unit with no file is built in code. `src/game/vehicles.js` has the
Stryker MGS: `model: 'procedural', build: makeStryker` in its record, and
`Models.wrap` centres and floors what the function returns without
rescaling, because it is drawn in metres already. To replace it with a
model, drop `public/assets/<file>.glb` in, set `model: '<file>'`,
`modelLength: 6.95`, a `tint`, and delete the `build` line. The procedural
hull stays in `vehicles.js` for the next unit that has no file yet.

## Airframes

Every aircraft is procedural, in `src/game/aircraft.js`, at true scale,
nose along +Z, in one vocabulary: `loft` for bodies, `surface` for wings
and fins, `pair` for anything on both sides, `part` for the rest. The
sortie picks the builder by `aircraft.kind`:

| kind | builder | who flies it |
|---|---|---|
| `eagle` | `makeEagle` | F-15E, GBU-28 |
| `lancer` | `makeLancer` | B-1B |
| `apache` | `makeApache` | AH-64E |
| `ghostrider` | `makeGhostrider` | AC-130J |
| `tomahawk` | `makeTomahawk` | BGM-109 |
| (lift) | `makeHercules`, `makeChinook` | the airlift |

Names the sortie looks for: `prop` and `rotorA` are spun, `tailrotor` too;
`bomb` is the child hidden at release. `aircraft.consumed` means the
airframe is the round: the model vanishes at the aim point and the
projectile carries on. `strike.salvo { n, spread }` releases `n` rounds
spaced back along the run. `STRIKE_RATE` at the top of the file is the
pitch of each one's roar.

## Icons

`src/ui/icons.js` draws the roster's 512 × 320 silhouettes in code; a new
unit borrows a body via the `BODY` aliases until it has its own drawing.
The six added in the fourth batch (`m120`, `stryker`, `ah64`, `ac130`,
`tomahawk`, `gbu28`) all borrow.

## Looking at a model

The quickest check on an airframe or a hull is to render it alone from
three sides. With the dev server up on 5177 and no suite running:

```
node tools/modelshot.mjs makeApache makeStryker    # writes /tmp/out/<name>.png
```

Do not run it while a suite is in flight: it puts a probe page in
`public/` for the duration, and the dev server reloads every client when
it appears.
