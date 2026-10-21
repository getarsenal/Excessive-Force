# Heat and power on a phone

The owner's TestFlight phones run hot. This is the plan and the ledger: what
the frame costs, what each change saves, and what it costs the picture. The
rule for the whole pass: the look stays at ninety per cent of what it is.

## Where the power goes (Westminster, the phone tier, before)

Measured on the probe box with the game's own tools. The box is a software
rasteriser, so its milliseconds are not a phone's, but the shares are.

| What | Measure | Source |
|---|---|---|
| Pixels shaded a frame | 1.5 × device pixels, two full-screen passes (scene, grade), bloom off on a phone | `engine.js` `_pixelRatio`, `forPhone` |
| Triangles a frame | 868k · ground 522k, town bodies 220k, apron 166k, surround 108k | `tools/triprobe.mjs` |
| Draw calls | 365 · 41 shader programs | `tools/renderprobe.mjs` |
| Lighting per pixel | PBR (`MeshStandardMaterial`) everywhere, two directional lights (sun with VSM shadows, rim), hemisphere, ambient, environment map | `engine.js` |
| Shadow map | 1024² VSM, blur 8 samples, redrawn on 31% of frames | `tools/shadowprobe.mjs` |
| Particle fill | up to 20 screens of blended quads a frame | `fx.fillBudget` |
| CPU a simulated second | 124 ms on the box: support solver 45, battle 40, physics 13 | `tools/perfprobe.mjs westminster 24` |
| Frame rate | 30 in battle (battery saver, on by default on a phone), 4 behind a menu | `power.js` |
| Interface | 21 CSS animations that run forever; each keeps the compositor awake at the display's own rate | `style.css` |

The frame is fill-bound on a phone: every full-screen pass at 1.5× the
device's pixels, every PBR fragment with two direct lights and an
environment lookup, and up to twenty screens of smoke on top. The CPU is a
third of a core at most. The ground's half a million triangles are vertex
work the GPU does cheaply, but they are the next thing after fill.

## What the web cannot see, the app can

A web page has no thermometer. The App Store build does:
`ProcessInfo.thermalState` (nominal, fair, serious, critical), Low Power
Mode and the battery, through `ios/App/App/ThermalPlugin.swift`, read by
`src/core/heat.js`. The heat governor turns the picture down a rung as the
phone warms and back up as it cools, so a phone is never left to throttle
itself:

| Phone says | The game does |
|---|---|
| nominal | the phone tier as it is |
| fair | render scale 0.85, particle fill 12 screens, shadows redrawn at most every third frame |
| serious | 24 frames a second, render scale 0.72, fill 8, shadows every sixth frame |
| critical | 20 frames a second, render scale 0.6, fill 5, shadows off |
| Low Power Mode on | the battery saver on, whatever the player set |

On the web the same ladder is driven by a proxy: a frame that keeps getting
longer at a steady workload is a phone that has started to throttle.

## The baseline, for every phone (the ninety per cent)

1. **Pixels:** 1.5 → 1.35 of the device's ratio, with a contrast-adaptive
   sharpen in the grade pass (it already reads three taps for the chromatic
   split; the sharpen is two more). 19% fewer fragments in every pass.
2. **Half precision** for the fill-heavy shaders that do not need more: the
   particles and the grade pass run at `mediump`, which an Apple GPU executes
   at twice the rate and half the energy. Not the scene materials: VSM shadow
   moments need the range.
3. **One direct light fewer:** the rim light is off on a phone. Every PBR
   fragment evaluates one direct light instead of two.
4. **Shadow blur:** VSM blur 8 → 4 samples on a phone; the map is 1024² and
   the blur radius 2.2 texels, where four samples is already a full cover.
5. **Smoke:** the fill budget 20 → 14 screens on a phone. The governor thins
   the big pools, never the near puffs.
6. **The interface at the display's rate:** under `body.lean` every looping
   animation runs in steps, ten a second, so the compositor sleeps between.
   The title's slow pan over the hero art was a 120 Hz full-screen composite
   on a ProMotion phone while the game sat on the menu.
7. **Quiet frames:** when nothing moves (no awake bodies, no rounds, no
   aircraft, no particles, the camera still), the battle draws at 20 frames.

## Measured, after the baseline

Westminster, the phone tier, the probe box's software rasteriser (its
milliseconds are not a phone's; the share is):

| | before | after |
|---|---|---|
| Render frame, median | 6.0 ms | 4.9 ms (−18%) |
| Pixel ratio on a phone | 1.5 | 1.35 |
| Direct lights per fragment | 2 | 1 |
| Particle fill budget | 20 screens | 14 |
| Heat ladder (`tools/thermalprobe.mjs`) | none | nominal 1.35 / fair 1.15 / serious 0.97 at 24 fps / critical 0.81 at 20 fps; Low Power Mode switches the saver on |

The two frames side by side (`/tmp/out/ab-before.png`, `ab-after.png`) read
the same at arm's length; the sharpen makes the brick a touch crisper, the
water is a shade deeper without the rim.

## Later

- The ground at a distance: 522k triangles at the level camera. Far cells
  of the terrain at half the grid, stitched at the ring, would take it to
  about 150k.
- The environment map on a phone: a single hemisphere term in its place
  would remove the costliest part of the PBR fragment; it changes the
  metals and the glass, so it needs pictures first.
