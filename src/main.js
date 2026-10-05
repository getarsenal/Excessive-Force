import * as THREE from 'three';
import { detectQuality, setQuality, AdaptiveGovernor } from './core/quality.js';
import { power, recoverFromCrash, armBoot } from './core/power.js';
import { initPhysics, PhysicsWorld } from './core/physics.js';
import { Engine, CameraRig, SUN_OFFSET } from './core/engine.js';
import { Audio } from './core/audio.js';
import { loadTerrain } from './world/terrain.js';
import { createSky, createWater } from './world/sky.js';
import { buildContext } from './world/context.js';
import { benchLines } from './world/realstreets.js';
import { Life } from './world/life.js';
import { FLEETS } from './world/craft.js';
import { loadCity } from './world/city.js';
import { buildCityBodies } from './world/citybodies.js';
import { buildFieldWorks } from './world/works.js';
import { CoastalTurret } from './game/turret.js';
import { Structure } from './structure/structure.js';
import {
  resolveStartLevel, recordResult, marksFor, loadProgress, nextTarget, goToLevel, getChallenge,
} from './ui/levelselect.js';
import { UNITS, UNITS_BY_ID } from './game/units.js';
import { recordTheatre, releaseNoteFor } from './game/campaign.js';
import { MATERIAL_PROPS, MATERIALS } from './structure/builder.js';
import { ExplosionFX } from './fx/explosion.js';
import { CraterFX } from './fx/craters.js';
import { Garrison } from './game/defenders.js';
import { Battle } from './game/battle.js';
import { HUD } from './ui/hud.js';
import { TAP } from './ui/pointer.js';
import { Picker } from './core/picking.js';
import { TestMenu } from './ui/testmenu.js';
import { Ambience } from './core/ambient.js';
import { access } from './core/access.js';
import { Stores } from './game/stores.js';
import { checkMedals } from './game/medals.js';
import { award, bootCampXp, battlePerks, spendBattlePerks, underHarness, RIBBONS } from './game/progress.js';
import { BeforeAfter } from './ui/beforeafter.js';
import { damageBill, money } from './ui/bill.js';
import { CollapseClip } from './ui/clip.js';
import { Flags, FLAG_SITES } from './world/flags.js';
import { cloudShadows, cloudUniforms } from './world/clouds.js';
import { Fires } from './fx/fires.js';
import { CityFire } from './game/cityfire.js';
import { TargetingPod } from './ui/tgp.js';
import { newsflash, hideNewsflash } from './ui/newsflash.js';
import { WhiteFlags } from './fx/whiteflags.js';
import * as synth from './core/synth.js';
import { airRaidSiren } from './core/synth.js';
import { SmokeScreens } from './game/smoke.js';
import { SamSites, siteSams, SAM } from './game/sam.js';
import { HuntMarkers } from './game/huntmarkers.js';
import { CommandPost } from './game/hq.js';
import { clearGround } from './world/clearing.js';
import { HighValue } from './game/highvalue.js';
import { attachUnitTips, UnitCard } from './ui/inspector.js';
import { Standoff, introsEnabled, preloadCast } from './ui/standoff.js';
import { Tutorial } from './ui/tutorial.js';
import { ComCard } from './ui/comcard.js';
import { feedback, installTapFeedback } from './ui/feedback.js';
import { runOpening, shouldPlayOpening } from './ui/opening.js';
import { menuMusic } from './ui/music.js';
import { snapshotBattle, saveBattle, clearBattle, battleFor, restoreBattle } from './game/battlesave.js';
import { takeDailyRun, endDailyRun, dailyMet, markDailyDone, DAILY_MODS, today } from './game/career.js';

const statusEl = document.getElementById('load-status');
const fillEl = document.getElementById('load-fill');

/**
 * A tip on the loading screen, and another every few seconds after it. The
 * things the game has never said out loud, said while the player is waiting
 * anyway; a level with a trick of its own leads with that.
 */
const TIPS = [
  'SURVEY paints the stone that is holding the rest up. Shoot the hottest colour.',
  'Undercut the base. Gravity works for free.',
  'DELAY fuze bursts inside the wall, not on it.',
  'A gun that has stood still for thirty seconds digs in and takes a third less.',
  'Smoke blinds the garrison. It does not stop mortars.',
  'Every defender you drop is money. Kills pay.',
  'Leverage is what fell that you did not shoot. It is the mark that matters.',
  'With a gun armed, drag across the ground to lay a whole battery in one stroke.',
  'Guns on rooftops see over the town. Rooftops burn.',
  'Everything placed inside eight seconds flies in on one lift.',
  "Tap the target's name to fly the camera back to it; tap UNITS for your battery.",
  'Leave mid-fight from MAIN MENU and the battle is kept. CONTINUE picks it up.',
];
function startTips(level) {
  const el = document.getElementById('load-tip');
  if (!el) return () => {};
  const pool = [...TIPS].sort(() => Math.random() - 0.5);
  if (level && level.traits && level.traits.topples === false) pool.unshift('This one will not tip over. Take it apart.');
  let i = 0;
  const show = () => { el.classList.remove('swap'); el.textContent = pool[i++ % pool.length]; };
  show();
  const t = setInterval(() => { el.classList.add('swap'); setTimeout(show, 320); }, 3400);
  return () => { clearInterval(t); };
}

function progress(pct, msg) {
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (statusEl && msg) statusEl.textContent = msg;
  // Yield twice so the browser actually paints the new state.
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function boot() {
  installTapFeedback();
  // A regression run is reproducible, so its randomness is too.
  //
  // Everything else about the suite is now identical from one run to the next
  // — the clock is held, the governor is frozen, the tests are one synchronous
  // call — and one test still flipped. The stream is what was left: the game
  // draws on `Math.random` during the frames between the level loading and the
  // suite starting, and how many of those there are is a property of the
  // machine. A seeded generator is as varied as the real one and asks the same
  // questions in the same order every time, which is the whole point of a
  // regression run.
  try {
    if (localStorage.getItem('tt.suite') === '1') {
      let seed = 0x9e3779b9;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
  } catch { /* private mode */ }

  // The last level load died on screen: a tier down before anything is
  // built, or the phone runs out the same way again (see power.js).
  access.apply();
  const recovered = recoverFromCrash();
  if (recovered) console.warn('[tumble] last load died; quality', recovered.from, '->', recovered.to);
  const quality = detectQuality();
  console.log('[tumble] quality', quality.id, '· wasm simd', quality.simd,
    '· body budget', quality.activeBodies);

  // The wasm starts down the wire now, not after the opening.
  //
  // Physics does not care which level was chosen, so there is no reason for
  // it to wait behind a studio card. Started here it loads while the player
  // is watching the title arrive, and the await further down is usually
  // already satisfied by the time we reach it — the opening costs the player
  // nothing but the seconds they would have spent on a progress bar. The
  // no-op catch only stops the browser reporting an unhandled rejection in
  // the window before that await; the await itself still throws.
  const physicsReady = initPhysics();
  physicsReady.catch(() => { /* surfaced at the await below */ });

  // The menu music starts down the wire now too, when the menu is where this
  // load is going (a `?level=` link goes straight into a level).
  try {
    if (!new URLSearchParams(location.search).has('level')) menuMusic.preload();
  } catch { /* no location */ }

  if (shouldPlayOpening()) await runOpening();

  // Ask which target, unless the player has already said or a link says for
  // them. This is the front door: without it the only level a player can
  // reach is Westminster.
  const level = await resolveStartLevel();
  console.log('[tumble] level', level.id, '·', level.name);
  armBoot(level.id);
  const sub = document.querySelector('.load-sub');
  if (sub) sub.textContent = level.name.toUpperCase();
  // The place itself behind the loader: its dossier photograph, dark and
  // drifting, so the wait is spent looking at where you are going.
  const loadBg = document.getElementById('load-bg');
  if (loadBg) {
    const img = new Image();
    img.onload = () => { loadBg.style.backgroundImage = `url(${img.src})`; loadBg.classList.add('on'); };
    img.src = `assets/recon/${level.id}.jpg`;
  }

  await progress(6, 'starting physics');
  const stopTips = startTips(level);
  // The two commanders fetch while the world builds, so the stand-off never
  // opens on an empty stage.
  // RUN ALL on a battle in progress restarts the level to run the suite on a
  // fresh board (see `TestMenu.runTests`); this is that load.
  let selftest = false;
  try {
    selftest = sessionStorage.getItem('tt.selftest') === '1';
    sessionStorage.removeItem('tt.selftest');
  } catch { /* private mode */ }
  // Back into a battle in progress, from the front door (see battlesave.js).
  let resumeSnap = null;
  try {
    if (sessionStorage.getItem('tt.resume') === level.id) resumeSnap = battleFor(level.id);
    sessionStorage.removeItem('tt.resume');
  } catch { /* private mode */ }
  // Today's daily strike, if this load is one.
  // A daily is read once per load, so a daily left mid-fight and resumed
  // carries its terms in the save, while it is still the same day.
  const daily = selftest ? null : (takeDailyRun(level.id)
    || (resumeSnap?.daily && resumeSnap.daily.level === level.id && resumeSnap.daily.date === today() ? resumeSnap.daily : null));
  const dailyMod = daily ? DAILY_MODS.find((m) => m.id === daily.mod) : null;
  const intros = introsEnabled() && level.intros !== false && !selftest && !resumeSnap;
  const castReady = intros ? preloadCast(level.id) : Promise.resolve();
  await physicsReady;

  const canvas = document.getElementById('game-canvas');
  const engine = new Engine(canvas, quality);
  const physics = new PhysicsWorld(quality);
  const audio = new Audio();
  // Every event's touch, sound and sight: see feedback.js.
  feedback.attach(audio);
  // Browsers won't start an AudioContext without a gesture, so the first tap
  // on the canvas is what brings sound up.
  // Not `once`: `unlock()` doubles as "start the clock again", and a game that
  // has been in the background comes back with its context suspended.
  const unlockAudio = () => { audio.unlock(); };
  canvas.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);

  await progress(18, `surveying ${level.name.split(',')[1]?.trim() || level.name}`);
  const terrain = await loadTerrain(level.terrain, quality);
  // A level may dictate its own ground palette. Giza is desert: the default
  // London greens and brick dust make the plateau read as the Home Counties
  // with a pyramid on it.
  if (level.palette) terrain.palette = level.palette;
  // The landmarks' footprints, measured before the ground is committed to.
  //
  // This has to happen before the mesh and the heightfield collider are built,
  // because the ground each one stands on gets levelled first. A structure is
  // founded at a single sampled height and then built as though the world were
  // flat under all of it, which is fine for a clock tower and wrong for a
  // ninety-five metre terrace — the Taj's plinth was founded on the height at
  // its centre with the ground rising across it, and a third of the terrace
  // ended up underground.
  // The ground is passed in for the builders that lay masonry over a slope.
  // A mountain road is cut into the mountain, before anything stands on it:
  // the masonry, the mesh, the collider and the streets all read the ground
  // with the bench in it. Only where a level lays a road up its own slope.
  const cityLoad = loadCity(level.terrain);
  if (level.road) {
    const moved = terrain.benchRoads(benchLines(level.road, await cityLoad, terrain));
    console.log(`[tumble] road benched into the hillside, up to ${moved.toFixed(1)} m of cut and fill`);
  }
  const specs = level.structures(quality, { terrain });
  const landmarks = specs.map((sp) => {
    const off = sp.offset || { x: 0, z: 0 };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of sp.blocks.blocks || sp.blocks) {
      // Scenery's footprint is what touches the ground. The London Eye is a
      // hundred and ninety metres across and stands on two feet and a plinth;
      // a footprint taken from the whole wheel would level a disc of the
      // South Bank the size of a stadium and keep every building off it.
      if (sp.scenery && b.y - b.hy > 12) continue;
      const r = Math.max(b.hx, b.hz);
      if (b.x - r < x0) x0 = b.x - r;
      if (b.x + r > x1) x1 = b.x + r;
      if (b.z - r < z0) z0 = b.z - r;
      if (b.z + r > z1) z1 = b.z + r;
    }
    return { x: (x0 + x1) / 2 + off.x, z: (z0 + z1) / 2 + off.z,
      w: x1 - x0, d: z1 - z0, scenery: !!sp.scenery, open: !!sp.open };
  });
  // One pad per group of structures founded at the same point, not one per
  // structure. The Taj, its mosque and its jawab are all founded at the level
  // origin, and levelling each to the median of its own surrounding ring gave
  // three pads at three heights with a step between them — a terrace the
  // mosque sat two metres below. Structures with their own offset (Khafre,
  // five hundred metres across the plateau) keep their own ground.
  const pads = new Map();
  specs.forEach((sp, i) => {
    const off = sp.offset || { x: 0, z: 0 };
    const key = `${Math.round(off.x)},${Math.round(off.z)}`;
    const L = landmarks[i];
    const g = pads.get(key) || { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, rects: [] };
    // The course that sits on the ground, for the pad to make ground under
    // (see `Terrain.levelPad`). Not scenery, and not a level that says its
    // building stands in the water on purpose (a bridge on its piers).
    if (!sp.scenery && level.padFill !== false) {
      for (const b of sp.blocks.blocks || sp.blocks) {
        if (b.y - b.hy > 0.5 || b.y + b.hy <= 0) continue;
        const c = Math.abs(Math.cos(b.ry || 0)), s = Math.abs(Math.sin(b.ry || 0));
        g.rects.push([b.x + off.x, b.z + off.z, b.hx * c + b.hz * s, b.hx * s + b.hz * c]);
      }
    }
    g.x0 = Math.min(g.x0, L.x - L.w / 2); g.x1 = Math.max(g.x1, L.x + L.w / 2);
    g.z0 = Math.min(g.z0, L.z - L.d / 2); g.z1 = Math.max(g.z1, L.z + L.d / 2);
    pads.set(key, g);
  });
  // The pad is the precinct's ground, not a bald disc of dirt: painted as
  // parkland where the level's precinct is lawn or garden.
  const green = ['lawn', 'charbagh'].includes(level.precinct?.ground);
  for (const g of pads.values()) {
    const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
    // No pond under the building (see `Terrain.clearPonds`).
    terrain.clearPonds(g.x0, g.x1, g.z0, g.z1);
    // The pad is normally the landmark's own footprint, which is right for a
    // building that stands on ground and wrong for one that stands on a hill.
    // A structure four hundred metres across levels a four-hundred-metre disc,
    // and on a summit that is the summit: the Potala flattened Marpo Ri into a
    // table five hundred and forty metres wide and then sat in the middle of
    // it, so the hundred and thirty metres of rock the place is famous for
    // became a cliff at the rim of a car park.
    //
    // `padRadius` lets a level say how much ground its monument is entitled to
    // flatten. Zero means none at all — the bake's own summit is the floor,
    // and the building is expected to carry its own foundations down to meet
    // the rock wherever the rock happens to be, which is what a palace built
    // on retaining walls does anyway.
    const override = level.padRadius;
    const r = Number.isFinite(override)
      ? override : Math.max(g.x1 - g.x0, g.z1 - g.z0) * 0.5 + 8;
    if (!(r > 0)) continue;
    // `groundLevel: 'bake'` — the bake's `flatten` pad already cut the ground
    // to its real height, so the pad is levelled to that and not to the
    // median of whatever the ring round it happens to be standing on.
    const lvl = level.groundLevel === 'bake' ? terrain.heightAt(cx, cz) : undefined;
    const cover = g.rects.length ? terrain.coverOf(g.rects, 5) : null;
    terrain.levelPad(cx, cz, r, 40, { park: green, level: lvl, cover });
  }

  // The surround needs to know what country it is in before it is drawn.
  terrain.hinterland = level.setting?.hinterland || 'fields';

  // The air, which is not the same everywhere either.
  //
  // One warm sand-coloured haze at one density was set for a London river
  // valley and then used on a rainforest and a harbour: it is most of why the
  // Tijuca read as a desert pavement, because at five kilometres four fifths
  // of what you see out there is the fog's own colour and not the ground's.
  // And a mountain is above most of the murk — the whole point of standing on
  // one is that you can see a long way.
  const haze = level.setting?.haze;
  if (haze) {
    if (haze.colour !== undefined) engine.scene.fog.color.setHex(haze.colour);
    if (haze.density !== undefined) engine.scene.fog.density = haze.density;
  }
  engine.scene.add(terrain.buildMesh());
  // The ground, kept by handle: anything resting on the terrain is settled for
  // good, and the freezing bookkeeping can stop worrying about it.
  physics.groundBody = terrain.addToPhysics(physics);

  const sunDir = engine.sun.position.clone().normalize();
  const sky = createSky(sunDir);
  // Pre-filter the sky into an environment map before the dome joins the
  // scene, so metals have something to reflect.
  engine.scene.add(engine.useEnvironmentFrom(sky));
  const water = createWater(terrain, sunDir, quality);
  engine.scene.add(water);
  console.log(`[tumble] water: ${water.userData.quads} quads over the river mask`);

  const groundY = terrain.heightAt(0, 0);
  const origin = new THREE.Vector3(0, groundY, 0);

  await progress(30, 'building london');
  // The landmarks' own ground, worked out before the city is laid.
  //
  // The city used to be kept off them by a single radius around the origin,
  // which is a fair description of a clock tower and a poor one of a palace
  // wing seventy-five metres long: the radius had to be big enough to clear the
  // wing's far end, so it also cleared a hundred and sixty metres of open
  // ground in every other direction and left the monument standing in a
  // paddock. Measuring the real footprints lets the streets come right up to
  // the precinct on the sides where there is nothing in the way.
  // Real OpenStreetMap footprints when they've been baked; otherwise the
  // hand-placed approximation, so the level still reads as a city either way.
  //
  // One world builder, given the real place when the real place has been
  // baked. It used to be two: a generator that invented a city with roads,
  // parks, trees, street furniture and a railway, or an extruder that laid out
  // the true footprints on bare ground with none of it. Choosing between them
  // meant choosing between a place that was right and a place that was alive.
  // Now the footprints and the street plan go *into* the generator, so a baked
  // level gets the real buildings on the real streets with everything else
  // still built around them.
  const city = await cityLoad;
  const tCity = performance.now();
  const contextGroup = buildContext(terrain, quality, {
    landmarks, precinct: level.precinct, exclude: level.contextExclude,
    // The turret's emplacement, kept clear of the forest.
    clearings: level.turret
      ? [{ x: origin.x + level.turret.x, z: origin.z + level.turret.z,
        r: 5.2 * (level.turret.scale ?? 1.4) * 4.2 }]
      : [],
    city, cityExclude: level.cityExcludeRadius, road: level.road,
    // What is beyond the town. A level says where it is; the generator does
    // not guess it from the terrain, because fields and forest look much the
    // same to a heightmap and nothing like each other from the air.
    hinterland: level.setting?.hinterland,
    canopy: level.setting?.canopy,
    canopyFrom: level.setting?.canopyFrom,
    downtown: level.setting?.downtown,
    // A pitched roof is a climate, not a building size. See `buildContext`.
    roofPitch: level.setting?.roofPitch,
  });
  console.log(`[tumble] town built in ${(performance.now() - tCity).toFixed(0)} ms`);
  engine.scene.add(contextGroup);
  // And the city is solid. Until this it was scenery: a round fired at a gun
  // behind a terrace went through the terrace, through the office block behind
  // it and into the monument.
  const cityBodies = buildCityBodies(physics, contextGroup.userData.plots);
  physics.cityBody = cityBodies ? cityBodies.body : null;

  const d = contextGroup.userData.detail || {};
  console.log(`[tumble] city: ${d.plan} street plan, `
    + `${contextGroup.userData.plots.length} buildings `
    + `(${d.real || 0} surveyed), ${d.junctions} junctions, `
    + `${contextGroup.userData.roofs.length} deployable roofs, `
    + `${d.canopy || 0} trees`
    + (d.surround ? `, ${d.surround} of ${d.surroundAvailable} beyond the map` : '')
    + (city ? ` — ${city.source}` : ' (run tools/bake_overture.py for the real place)'));

  // The defence, laid round whichever set of buildings got built.
  const fieldWorks = buildFieldWorks(terrain, quality, {
    // Nothing worth defending is dug in round: the belt goes round the
    // objectives, not round the scenery across the river.
    // An open precinct is the exception: the Forbidden City's galleries are
    // scenery, and a belt laid round the halls alone was dug inside them, with
    // every man in it looking at the back of a wall forty metres off.
    landmarks: landmarks.filter((l) => !l.scenery || l.open),
    // And the turret's emplacement is ground already taken.
    plots: (contextGroup?.userData?.plots || []).concat(level.turret
      ? [{ x: origin.x + level.turret.x, z: origin.z + level.turret.z,
        w: 5.2 * (level.turret.scale ?? 1.4) * 7, d: 5.2 * (level.turret.scale ?? 1.4) * 7 }]
      : []),
    // The street network and the frame it is laid on, so the belt is square to
    // the place rather than to the map, and so it knows where the roads are.
    net: contextGroup?.userData?.network || null,
    // Square to the building on a surveyed map. The landmark stands on the
    // map's own axes; the measured street angle is the commonest bearing in a
    // plan that has no single one, and a belt turned to it crossed Parliament
    // Square at eleven degrees to the Palace it was dug to defend.
    yaw: contextGroup?.userData?.network?.real ? 0 : (contextGroup?.userData?.gridYaw || 0),
    exclude: level.contextExclude || level.cityExcludeRadius || 70,
  });
  engine.scene.add(fieldWorks.group);

  // The things that move. A still city is uncanny however detailed it is: the
  // eye reads motion as life long before it reads a bollard.
  const lifeRng = () => {
    let a = 0x5eed1e5;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const life = contextGroup?.userData?.network
    ? new Life(engine.scene, terrain,
      contextGroup.userData.network, quality, lifeRng(),
      level.setting?.fleet || FLEETS[level.id] || [], contextGroup.userData.plots || [])
    : null;

  await progress(44, 'quarrying stone');
  const totalBlocks = specs.reduce((a, sp) => a + sp.blocks.length, 0);

  await progress(56, `setting ${totalBlocks.toLocaleString()} stones`);

  const fx = new ExplosionFX(engine.scene, quality);
  const pod = new TargetingPod(engine, quality);
  const whiteFlags = new WhiteFlags(engine.scene);
  const huntMarkers = new HuntMarkers(engine.scene);
  // Gold diamonds over the high-value targets: the SAM launchers and radars
  // and the command post, while they stand.
  const hvtMarkers = new HuntMarkers(engine.scene, { color: 0xf3c14a, shape: 'diamond', cap: 40 });
  const hvtPts = [];
  // Dirt on the lens: a blast close enough to the camera throws it at the
  // glass. Spots of mud in a soft-edged splatter, sliding down as they fade.
  const lensSuite = (() => { try { return localStorage.getItem('tt.suite') === '1'; } catch { return false; } })();
  let lensAt = -1e9;
  fx.onBlast = (pos, power) => {
    if (lensSuite || access.still) return;
    const d = engine.camera.position.distanceTo(pos);
    if (d > 26 + power * 20 || performance.now() - lensAt < 1500) return;
    lensAt = performance.now();
    let el = document.getElementById('lensdirt');
    if (!el) { el = document.createElement('div'); el.id = 'lensdirt'; document.body.appendChild(el); }
    // Big clots and a spray of small ones round each, nearer the side the
    // blast was on.
    const n = 4 + Math.floor(Math.random() * 4);
    const g = [];
    for (let i = 0; i < n; i++) {
      const x = 8 + Math.random() * 84, y = 8 + Math.random() * 84, r = 4 + Math.random() * 9;
      const a = 0.6 + Math.random() * 0.3;
      g.push(`radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(46,34,22,${a.toFixed(2)}) 0, rgba(58,44,30,${(a * 0.75).toFixed(2)}) ${(r * 0.45).toFixed(1)}vmin, rgba(70,55,40,${(a * 0.25).toFixed(2)}) ${(r * 0.8).toFixed(1)}vmin, transparent ${r.toFixed(1)}vmin)`);
      for (let k = 0; k < 4; k++) {
        const sx = x + (Math.random() - 0.5) * r * 2.2, sy = y + (Math.random() - 0.5) * r * 2.2, sr = 0.6 + Math.random() * 1.6;
        g.push(`radial-gradient(circle at ${sx.toFixed(1)}% ${sy.toFixed(1)}%, rgba(46,34,22,${(a * 0.9).toFixed(2)}) 0, transparent ${sr.toFixed(1)}vmin)`);
      }
    }
    el.style.background = g.join(',');
    el.className = ''; void el.offsetWidth; el.className = 'go';
  };
  const dustColour = new THREE.Color();
  // Charges that have been uncovered and are about to go off. Queued rather
  // than fired here: this runs from inside the explosion that destroyed the
  // crate, and detonating from within that pass would re-enter the solver
  // while it is halfway through rebuilding its own graphs.
  const pendingCharges = [];
  const onChunkDestroyed = (x, y, z, size, mat) => {
    dustColour.setHex(MATERIAL_PROPS[mat].color);
    fx.stoneBurst(x, y, z, size, dustColour);
    if (mat === MATERIALS.CHARGE) {
      pendingCharges.push(new THREE.Vector3(x, y, z));
    }
  };

  const t0 = performance.now();
  const structures = [];
  let primary = null;
  for (const spec of specs) {
    // A structure may stand somewhere other than the level's origin, and when
    // it does it is founded on its own ground rather than on the primary's.
    // Giza needs both: Khafre is 500 m away across a plateau that falls eleven
    // metres over that distance, and giving it the origin's ground height
    // would bury one corner and leave the other in the air.
    const off = spec.offset;
    const sOrigin = off
      ? new THREE.Vector3(origin.x + off.x, 0, origin.z + off.z)
      : origin;
    const sGround = off ? terrain.heightAt(sOrigin.x, sOrigin.z) : groundY;
    if (off) sOrigin.y = sGround;
    const st = new Structure(physics, spec.blocks,
      { groundY: sGround, origin: sOrigin, onChunkDestroyed,
        groundAt: spec.onSlope ? (x, z) => terrain.heightAt(x, z) : null });
    st.key = spec.key;
    st.required = !!spec.required;
    // A ring of buildings round open ground: judged by its stones, not its box.
    st.open = !!spec.open;
    st.label = spec.label || spec.key.toUpperCase();
    engine.scene.add(st.group);
    structures.push(st);
    st.origin = sOrigin;
    st.groundY = sGround;
    if (spec.primary) primary = st;
    if (spec.primary && level.scoreTags) st.setScoreTags(level.scoreTags);
  }
  primary = primary || structures[0];
  console.log('[tumble] built', structures.reduce((a, st) => a + st.count, 0),
    'stones in', (performance.now() - t0).toFixed(0), 'ms');

  await progress(74, 'posting the garrison');
  const garrison = new Garrison(engine.scene, structures, quality);
  // Each structure's own origin and ground are handed over too, so a level
  // whose landmarks are spread across the map can post men on the ones that
  // are not at the centre of it.
  const sites = {};
  for (const st of structures) sites[st.key] = { origin: st.origin, groundY: st.groundY };
  level.garrison(garrison, origin, groundY, sites);
  // And the belt, last of all.
  //
  // An objective an army has had time to prepare is not a building with men in
  // it: it is a trench line stood off from every structure on the map and
  // through the streets behind them, with gun pits behind the line. It is
  // posted after the buildings on purpose — the cap is finite, and if anything
  // has to go unmanned it should be the far end of the line rather than the
  // top of the tower.
  {
    // A level can man only part of the belt: Boot Camp is a lesson, not a siege.
    const share = level.fieldWorksShare ?? 1;
    const every = Math.max(1, Math.round(1 / Math.max(share, 0.01)));
    const posts = fieldWorks.posts.filter((_, i) => i % every === 0);
    const manned = garrison.populateFieldWorks(posts);
    console.log(`[tumble] field works: ${fieldWorks.counts.trenchBays} bays, `
      + `${fieldWorks.counts.gunPits} gun pits, `
      + `${manned} of ${fieldWorks.posts.length} positions manned`);
  }

  const rig = new CameraRig(engine.camera, canvas, {
    tx: 0, ty: groundY + level.camera.height, tz: 0,
    distance: level.camera.distance, yaw: level.camera.yaw, pitch: level.camera.pitch,
  });
  rig.groundHeight = (x, z) => terrain.heightAt(x, z);

  await progress(88, 'ranging guns');

  let hud;
  const picker = new Picker(canvas, engine.camera, terrain);
  // A coastal gun on the summit, where the level has one. Not a structure —
  // a machine with a hit count — and not an objective.
  const turret = level.turret
    ? new CoastalTurret({ scene: engine.scene, physics, terrain, fx, audio,
      x: origin.x + level.turret.x, z: origin.z + level.turret.z, yaw: level.turret.yaw ?? 0,
      scale: level.turret.scale, minRange: level.turret.minRange })
    : null;
  const battle = new Battle({
    scene: engine.scene, camera: engine.camera, engine, physics, terrain,
    structures, primary, garrison, fx, quality, groundY, audio, level, turret,
    onEvent: (kind, data) => handleEvent(kind, data),
  });
  // So a shell landing can scatter whatever was sitting on the roofs.
  battle.life = life;
  // A level can set its own terms: Boot Camp opens the whole arsenal and
  // charges nothing for it. The guns still come in by air — that is one of
  // the things it teaches.
  if (level.startMoney) battle.money = level.startMoney;
  if (level.unlockAll) battle.unlockAll = true;
  if (level.freeBuild) battle.freeBuild = true;
  // The commander's commissions, and whatever the last crate left for this
  // battle. Not in Boot Camp, and never under the harness.
  // Not on a resume: the save's money replaces whatever the perks would add,
  // and spending them here threw a fresh crate's cheque away.
  const perks = (!underHarness() && level.id !== 'tutorial' && !resumeSnap) ? battlePerks() : null;
  if (perks) {
    battle.money = Math.round(battle.money * (1 + perks.fundsPct)) + perks.funds;
    // Income is computed from the battle's progress; the perk scales it.
    battle.incomeScale *= 1 + perks.incomePct + perks.income;
    if (perks.funds || perks.income) spendBattlePerks();
  }
  if (dailyMod) {
    if (dailyMod.id === 'chest') battle.money *= 2;
    if (dailyMod.id === 'lean') battle.money = Math.round(battle.money * 0.5);
    if (dailyMod.id === 'arsenal') battle.unlockAll = true;
  }

  // The downloaded soldier is not loaded any more: flattened, it stood in its
  // rest pose, a T, and the whole garrison held its arms straight out. The
  // figure is built in `game/soldier.js` in a firing pose instead.

  battle.craters = new CraterFX(engine.scene, terrain, quality);

  // Warm the model cache in the background. Deploying a gun for the first time
  // otherwise means a Draco decode on the spot, which lands as a visible hitch
  // at exactly the moment the player is watching the thing they just bought.
  (async () => {
    for (const u of UNITS) {
      // Men are built, not loaded, and the aircraft are lofted in code: only
      // the guns and vehicles have a file to warm.
      if (u.model === 'infantry' || u.model === 'aircraft' || u.strike) continue;
      try {
        await battle.models.load(u.model, u.modelLength, { tint: u.tint });
      } catch (e) { console.warn(`[tumble] ${u.model} unavailable:`, e.message); }
    }
  })();
  // Footprints, so a gun cannot be deployed inside a building.
  battle.cityPlots = contextGroup?.userData?.plots || null;
  // The firing solution reads this: a gun in a street has to put the shell
  // over the roof in front of it rather than into it.
  battle.cityBlocker = cityBodies;
  garrison.city = cityBodies;

  // Smoke the garrison cannot see through, and fires that burn on after a
  // heavy hit.
  battle.smokes = new SmokeScreens(fx);
  garrison.smokes = battle.smokes;
  battle.fires = new Fires(fx, quality);
  // And the town burns. A shell that stops against a building guts it: the
  // walls go to soot, the windows go dark, and the fire is on the roof.
  // The dumps beside the heavy weapons, which go up when a round lands close.
  battle.stores = new Stores({ scene: engine.scene, garrison, terrain, structures });
  // The S-300 battery. Not in Boot Camp, and never under the harness: the
  // strike tests fly aeroplanes in and measure what they do, and a battery
  // that brought one down at random would make every one of them a coin.
  if (!lensSuite && level.id !== 'tutorial' && level.sams !== false) {
    const samOpts = {
      exclude: level.contextExclude || level.cityExcludeRadius || 120,
      plots: contextGroup?.userData?.plots || [],
      net: contextGroup?.userData?.network || null,
      landmarks,
    };
    // Sand where the ground is sand, olive drab everywhere else.
    const u = level.palette?.urban;
    const desert = !!(u && u.r > 0.5 && u.r > u.b * 1.25);
    const makeSams = (sites) => new SamSites({ scene: engine.scene, terrain, fx, audio, air: battle.air,
      camera: engine.camera, quality, sites, desert,
      onEvent: (kind, data) => handleEvent(kind, data) });
    // Two or three launchers round the map, by the level.
    let hash = 0;
    for (const ch of level.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const count = level.samCount ?? (SAM.sites[0] + (hash % (SAM.sites[1] - SAM.sites[0] + 1)));
    const sites = siteSams(terrain, { ...samOpts, count });
    if (sites.length) {
      battle.sams = makeSams(sites);
      // Each compound with its own guard round the ring.
      for (const st of battle.sams.sites) battle.sams.garrisonSite(st, garrison);
    }
    // The command post: inside the belt, nearer the objective than the SAMs,
    // clear of them, on ground a bunker and a mast can stand on.
    if (level.hq !== false) {
      const ex = samOpts.exclude;
      const hs = siteSams(terrain, { ...samOpts, count: 1, seed: 0x4c2, r0: Math.max(90, ex * 0.95),
        rMax: Math.max(260, ex * 2.4), sizes: [20, 16, 13], avoid: sites, avoidR: 140 })[0]
        || siteSams(terrain, { ...samOpts, count: 1, seed: 0x4c2, r0: Math.max(90, ex * 0.95),
          sizes: [16, 13], avoid: sites, avoidR: 140 })[0];
      if (hs) {
        battle.hq = new CommandPost({ scene: engine.scene, terrain, fx, site: hs, desert,
          onEvent: (kind, data) => handleEvent(kind, data) });
        battle.hq.garrison(garrison);
      }
    }
    // The depot, inside the belt like the command post; the enemy battery
    // further out, where howitzers stand; and the road in, its checkpoint,
    // its trucks and the general (see highvalue.js).
    if (level.hvt !== false) {
      const ex = samOpts.exclude;
      const taken = [...sites, ...(battle.hq ? [{ x: battle.hq.x, z: battle.hq.z }] : [])];
      const depot = siteSams(terrain, { ...samOpts, count: 1, seed: 0x7d1, r0: Math.max(100, ex * 1.1),
        rMax: Math.max(340, ex * 2.8), sizes: [20, 16], avoid: taken, avoidR: 120 })[0] || null;
      if (depot) taken.push(depot);
      const battery = siteSams(terrain, { ...samOpts, count: 1, seed: 0x3b7, r0: Math.max(260, ex * 2.2),
        sizes: [26, 20, 16], avoid: taken, avoidR: 150 })[0] || null;
      if (battery) taken.push(battery);
      battle.hv = new HighValue({ battle, scene: engine.scene, terrain, fx, garrison, desert,
        net: contextGroup?.userData?.network || null, origin: new THREE.Vector3(origin.x, groundY, origin.z),
        exclude: ex, sites: { depot, battery, avoid: taken },
        onEvent: (kind, data) => handleEvent(kind, data) });
    }
    // The trees and props inside a compound's ring and round the command
    // post, the depot and the battery: the town was grown before they were sited.
    clearGround(contextGroup, [
      ...(battle.sams ? battle.sams.sites.map((st) => ({ x: st.x, z: st.z, r: st.r + 5 })) : []),
      ...(battle.hq ? [{ x: battle.hq.x, z: battle.hq.z, r: 17 }] : []),
      ...(battle.hv?.depot ? [{ x: battle.hv.depot.x, z: battle.hv.depot.z, r: 19 }] : []),
      ...(battle.hv?.batterySite ? [{ x: battle.hv.batterySite.x, z: battle.hv.batterySite.z, r: 24 }] : []),
    ]);
    // The counter-attack's battery: three more sites, clear of the first
    // two, dropped on pallets and live from the moment each one lands.
    battle.samSites = (n) => siteSams(terrain, { ...samOpts, count: n, seed: 0x9e1,
      avoid: battle.sams ? battle.sams.launchers : [] });
    battle.landSam = (site) => {
      if (!site) return;
      if (!battle.sams) battle.sams = makeSams([]);
      battle.sams.add(site, battle.elapsed);
      handleEvent('samlanded', { point: new THREE.Vector3(site.x, site.y, site.z) });
    };
  }
  // Boot Camp's practice targets: a SAM compound that does not fire and a
  // command post with nobody in it, close in, to learn the gold diamonds on.
  if (!lensSuite && level.id === 'tutorial') {
    const u = level.palette?.urban;
    const desert = !!(u && u.r > 0.5 && u.r > u.b * 1.25);
    const opts = { exclude: level.contextExclude || level.cityExcludeRadius || 120,
      plots: contextGroup?.userData?.plots || [], net: contextGroup?.userData?.network || null, landmarks };
    const ps = siteSams(terrain, { ...opts, count: 1, seed: 0x71, r0: 200, rMax: 460, sizes: [36, 28, 20] });
    if (ps.length) {
      battle.sams = new SamSites({ scene: engine.scene, terrain, fx, audio, air: battle.air, camera: engine.camera,
        quality, sites: ps, desert, training: true, onEvent: (kind, data) => handleEvent(kind, data) });
    }
    const hs = siteSams(terrain, { ...opts, count: 1, seed: 0x72, r0: 150, rMax: 420, sizes: [20, 16, 13],
      avoid: ps, avoidR: 120 })[0];
    if (hs) battle.hq = new CommandPost({ scene: engine.scene, terrain, fx, site: hs, desert, onEvent: (kind, data) => handleEvent(kind, data) });
    clearGround(contextGroup, [
      ...(battle.sams ? battle.sams.sites.map((st) => ({ x: st.x, z: st.z, r: st.r + 5 })) : []),
      ...(battle.hq ? [{ x: battle.hq.x, z: battle.hq.z, r: 17 }] : []),
    ]);
  }
  battle.cityFire = new CityFire({
    cityGroup: contextGroup, fx, fires: battle.fires, audio, scene: engine.scene,
    onBurn: (p) => battle.cityCollapse(p),
  });

  // Flags on the landmarks, each standing on a stone and going with it.
  const flags = new Flags(engine.scene, quality);
  flags.raise(FLAG_SITES[level.id] || [], sites && Object.fromEntries(structures.map((st) => [st.key, st])));

  // Cloud shadows drifting over the ground and the town.
  cloudShadows(terrain.mesh.material, 0.30);
  contextGroup?.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.userData.clouded) {
      o.material.userData.clouded = true;
      cloudShadows(o.material, 0.26);
    }
  });

  hud = new HUD(battle, {
    onSelect: (id) => {
      battle.selectUnit(id);
      // The drawer's job is done the moment something is picked out of it, and
      // what the player wants next is the map it was standing over.
      if (battle.selectedUnitId) hud.closeDrawer();
      if (!battle.selectedUnitId) hud.hidePrompt();
      else if (UNITS_BY_ID[id].strike?.strafe) hud.status('press and drag along the line to strafe', 4);
      else if (UNITS_BY_ID[id].strike) hud.status('drag to aim the strike', 4);
      else hud.status(`${TAP} to deploy · drag for a line`, 4);
    },
    onClearTarget: () => battle.clearTarget(),
    onDisarm: () => {
      if (!battle.selectedUnitId) return false;
      battle.selectedUnitId = null;
      hud.hidePrompt();
      endAiming();
      hud.status('weapon put away', 1.6);
      return true;
    },
    // Through `goToLevel` rather than a bare reload: the level is no longer in
    // the address bar by the time anyone can press this, so a reload would
    // land on the map.
    onRestart: () => { battleOver = true; clearBattle(level.id); goToLevel(level.id); },
    onNextTarget: () => goToLevel(nextTarget(level.id).id),
    // The win is already banked; this just lets play carry on against
    // whatever is still standing.
    onKeepGoing: () => {
      if (battle.resumeAfterWin()) hud.feed('ASSAULT CONTINUES', 'big');
    },
    onPickTarget: async () => {
      // The battle holds while the map is up: the menu that opened it has
      // already un-paused, and a garrison does not wait for a player who is
      // looking at the world.
      const wasPaused = testMenu.paused;
      testMenu.paused = true;
      cover(1);
      keepBattle();
      try {
        const { showWorldMap } = await import('./ui/worldmap.js');
        // A finished battle has nothing to go back to; picking it again
        // starts it afresh, as the front door does.
        const id = await showWorldMap({ current: level.id, canResume: !battleOver });
        if (id && id !== level.id) { goToLevel(id); return; }
        if (id === level.id && battleOver) { goToLevel(id); return; }
      } finally {
        testMenu.paused = wasPaused;
        cover(-1);
      }
      // Picking the level already in play, or backing out, just closes it.
    },
    // The title screen, over a battle that holds and is saved while it is up.
    onHome: async () => {
      const wasPaused = testMenu.paused;
      testMenu.paused = true;
      cover(1);
      keepBattle();
      try {
        const { openFrontDoor } = await import('./ui/title.js');
        // A finished battle has nothing to go back to: the title's first line
        // is the next contract, and choosing this one again starts it afresh.
        const id = await openFrontDoor({ current: level.id, canResume: !battleOver });
        if (id && id !== level.id) { goToLevel(id); return; }
        if (id === level.id && battleOver) { goToLevel(id); return; }
        if (id === level.id) {
          let daily = null;
          try {
            daily = sessionStorage.getItem('tt.dailyrun');
            sessionStorage.removeItem('tt.resume');
          } catch { /* private mode */ }
          // The daily is this contract under today's terms: a fresh start.
          if (daily) { battleOver = true; clearBattle(level.id); goToLevel(id); return; }
        }
      } finally {
        testMenu.paused = wasPaused;
        cover(-1);
      }
    },
    // The readouts fly the camera: the target's name back to the target, UNITS
    // to the middle of whatever is deployed.
    onFocusTarget: () => rig.focus(new THREE.Vector3(origin.x, groundY + level.camera.height * 0.6, origin.z), level.camera.distance),
    onFocusUnits: () => {
      const live = battle.units.filter((u) => u.alive);
      if (!live.length) { hud.status('no units on the ground', 1.6); return; }
      const c = new THREE.Vector3();
      for (const u of live) c.add(u.pos);
      c.divideScalar(live.length);
      rig.focus(c.setY(c.y + 6), Math.max(90, Math.min(220, 60 + live.length * 8)));
    },
    onToggleSound: (on) => audio.setEnabled(on),
    onFireMode: (m) => battle.setFireMode(m),
    onSmoke: () => battle.placeSmoke(),
    onPause: (p) => { testMenu.paused = p; menuOpen = p; },
    onQuality: (id) => { if (setQuality(id)) goToLevel(level.id); },
    // The survey goes on every structure on the map, not just the contract:
    // at Giza the answer to "what is holding Khafre up" is Khafre.
    onSurvey: (on) => { for (const st of structures) st.setSurvey(on); },
    picker,
    qualityId: quality.id,
  });
  hud.audio = audio;
  attachUnitTips(hud, battle);
  // The collapse, filmed for the player to share. The game holds still while
  // the clip is being watched, and picks up where it was when it is closed.
  let clipWasPaused = false;
  const clip = new CollapseClip({
    canvas: engine.renderer.domElement, audio,
    place: () => battle.level?.subtitle || battle.level?.name || '',
    context: () => ({ level: battle.level?.id, rounds: battle.collapseRounds ?? battle.shotsFired }),
    onModal: (open) => {
      if (open) { clipWasPaused = testMenu.paused; testMenu.paused = true; }
      else testMenu.paused = clipWasPaused;
    },
  });
  hud.setClip(clip);
  // The sound of the place, under the guns. The bells stop when the belfry
  // is no longer standing.
  const ambience = new Ambience(audio, level,
    () => battle.state === 'playing' && primary.monumentIntegrity > 0.85);
  window.__ambience = ambience;
  // The survey repaints in the other ramp the moment the switch is thrown.
  access.onChange((k) => {
    if (k !== 'cb') return;
    for (const st of structures) if (st._survey) { st.setSurvey(false); st.setSurvey(true); }
  });
  window.__clip = clip;     // for the harness and the console
  // The landmark before, the ruin after: taken as the report goes up.
  const beforeAfter = new BeforeAfter({
    level, canvas: engine.renderer.domElement, render: () => engine.render(),
    onModal: (open) => {
      if (open) { clipWasPaused = testMenu.paused; testMenu.paused = true; }
      else testMenu.paused = clipWasPaused;
    },
  });
  window.__beforeAfter = beforeAfter;
  const baBtn = document.getElementById('ec-ba');
  if (baBtn) {
    baBtn.hidden = true;
    baBtn.addEventListener('click', () => beforeAfter.open());
  }
  const takeBeforeAfter = (sum) => {
    if (level.id === 'tutorial') return;
    const claim = money(damageBill(sum, { burnt: battle.cityFire?.burnt || 0 }).total);
    beforeAfter.capture({ claim, rounds: battle.collapseRounds ?? battle.shotsFired })
      .then((b) => { if (b && baBtn) baBtn.hidden = false; })
      .catch(() => {});
  };
  const unitCard = new UnitCard(battle, {
    onSell: (u) => battle.sellUnit(u),
    onFocus: (u) => rig.focus(u.pos.clone().setY(u.pos.y + 4), 110),
  });

  // The win is written to the campaign once, whichever report shows it.
  let winRecorded = false;
  /**
   * The three marks for a finished run, and which of them are new bests.
   *
   * Asked before `recordResult` banks the run, because banking it rewrites
   * the stored best — ask afterwards and every single run comes back a
   * personal best, which is the same as none of them being one.
   */
  const markRun = (sum) => {
    const rec = loadProgress()[level.id] || {};
    const had = { rounds: rec.bestShots, spend: rec.bestSpent, time: rec.bestTime };
    return marksFor(level, sum).map((m) => ({
      ...m, best: had[m.id] == null || m.got < had[m.id],
    }));
  };
  // The generals' corner card, the win orbit and the milestones: see the
  // frame loop. Boot Camp has its own General and gets no heckling.
  const comcard = level.id === 'tutorial' ? null : new ComCard({ level, audio });
  window.__comcard = comcard;      // for the harness
  window.__hunt = huntMarkers;
  window.__hvt = hvtMarkers;
  let winOrbit = false;
  // What went into the fight, for the medals: every weapon deployed or
  // called, and whether an aircraft was lost doing it.
  const used = new Set();
  let lostAircraft = false;
  let chain = 0, chainAt = 0;
  // What the fight earned besides the result: ribbons, as often as they
  // happen, and the counts the career and the daily orders are made of.
  const ribbons = {};
  const runStats = { hits: 0, downed: 0, strikes: 0, collapses: 0 };
  const ribbon = (id, n = 1) => {
    ribbons[id] = (ribbons[id] || 0) + n;
    const rb = RIBBONS[id];
    if (rb && !suiteHold) hud.feed(`+${(rb.xp * n).toLocaleString()} XP · ${rb.name}`, 'xp');
  };
  let paid = false;
  const payOut = (won, sum, extra = {}) => {
    if (paid) return null;
    paid = true;
    if (level.id === 'tutorial') return won ? bootCampXp() : null;
    return award({
      won, sum, level: level.id, ribbons, marks: extra.marks || [], feats: extra.feats || [],
      daily: !!dailyBanked, streak: dailyBanked || 0,
      stats: { ...runStats, burnt: battle.cityFire?.burnt || 0, dumps: battle.stores?.blown || 0 },
    });
  };
  let dailyBanked = 0;
  const awardMedals = (sum) => {
    for (const u of battle.units) if (u.def) used.add(u.def.id);
    const fresh = checkMedals({
      level, sum, used, defs: UNITS_BY_ID, burnt: battle.cityFire?.burnt || 0,
      defendersLeft: garrison ? garrison.aliveCount : 1, lostAircraft, dumps: battle.stores?.blown || 0,
    });
    for (const m of fresh) hud.feed(`MEDAL · ${m.name}`, 'big');
    return fresh;
  };
  // The battery celebrates: fireworks from wherever the guns are, a dozen
  // over five seconds, over the ruin.
  function celebrate() {
    if (lensSuite || !fx.flourish) return;
    const from = battle.units.filter((u) => u.alive && u.pos).map((u) => u.pos);
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        let p = from.length ? from[i % from.length] : null;
        if (!p) {
          const a = Math.random() * Math.PI * 2, r = 110 + Math.random() * 80;
          const x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r;
          p = { x, y: terrain.heightAt(x, z), z };
        }
        fx.flourish.firework(p.x + (Math.random() - 0.5) * 6, p.y + 1, p.z + (Math.random() - 0.5) * 6,
          90 + Math.random() * 70, audio, synth);
      }, 300 + i * 420 + Math.random() * 250);
    }
  }
  let sirenSounded = false;
  function handleEvent(kind, data) {
    // Boot Camp coaches on what actually happens, as it happens.
    if (level.id === 'tutorial' && window.__tutorial?.root) window.__tutorial.onEvent(kind, data);
    if ((kind === 'deployed' || kind === 'queued' || kind === 'strike') && data?.def) used.add(data.def.id);
    if (kind === 'shotdown') lostAircraft = true;
    switch (kind) {
      case 'target':
        if (data) feedback.emit('target');
        break;
      case 'bounty':
        hud.popup(`+$${data.amount.toLocaleString()}`, data.point, data.kind);
        hud.flareMoney();
        if (data.kind === 'kill') feedback.emit('kill');
        if (data.kind === 'kill' && !ribbons.firstblood) ribbon('firstblood');
        break;
      case 'bigimpact':
        hud.edgeFlash('impact', data.point);
        feedback.emit('impact');
        break;
      case 'unithit':
        hud.edgeFlash('hit', data.from);
        feedback.emit('hit');
        break;
      case 'rank': {
        feedback.emit('rank');
        const names = ['', 'SEASONED', 'VETERAN', 'ELITE'];
        hud.feed(`${data.def.name} CREW ${names[data.rank]} ${'★'.repeat(data.rank)}`, 'good');
        break;
      }
      case 'dugin':
        hud.feed(`${data.def.name} DUG IN`, 'good');
        break;
      case 'smoke':
        hud.feed('SMOKE LAID', 'good');
        break;
      case 'smokewait':
        hud.showPrompt(`smoke ready in ${Math.ceil(data)} s`, 'warn');
        break;
      case 'firemode':
        hud.feed(`FIRE MODE: ${data.toUpperCase()}`, '');
        break;
      case 'sold':
        hud.feed(`${data.unit.def.name} SOLD  +$${data.refund}`, '');
        break;
      case 'deployed':
        feedback.emit(battle.airlift ? 'landed' : 'confirm');
        hud.feed(`${data.def.name} ${battle.airlift ? 'ON THE GROUND' : 'DEPLOYED'}`, 'good');
        // With the airlift this arrives twenty seconds after the tap, and
        // whatever the player has selected since is theirs to keep.
        if (!battle.airlift) { battle.selectedUnitId = null; hud.hidePrompt(); }
        break;
      case 'queued':
        feedback.emit('confirm');
        // The card stays selected while the package is open: the message
        // says place more, so placing more is one tap, not two.
        hud.feed(`${data.def.name} IN THE LIFT`, 'good');
        break;
      case 'package':
        if (data.first) hud.feed('LIFT PACKAGE OPEN — PLACE MORE, THEY FLY TOGETHER', '');
        break;
      case 'packagetick':
        hud.status(`lift · ${data.count} unit${data.count > 1 ? 's' : ''} · wheels up in ${data.left} s`, 1.6);
        break;
      case 'lift':
        feedback.emit('lift');
        hud.hidePrompt();
        {
          const parts = [];
          if (data.hercs) parts.push(`${data.hercs}× C-130`);
          if (data.helis) parts.push(`${data.helis}× CHINOOK`);
          hud.feed(`${parts.join(' + ') || 'LIFT'} INBOUND · ${data.count} UNIT${data.count > 1 ? 'S' : ''} · ${Math.round(data.eta)} s`, 'big');
          hud.status(`${parts.join(' + ') || 'lift'} inbound · ${Math.round(data.eta)} s`, 5);
        }
        break;
      case 'strike':
        feedback.emit('strike');
        runStats.strikes++;
        hud.feed(`${data.def.name} INBOUND · ${Math.round(data.eta)} s`, 'big');
        hud.hidePrompt();
        battle.pulse(data.point, 0xffa040, 22, true);
        // The spot marked for the pilot with a smoke canister, burning until
        // the strike is in and a while after.
        if (data.point && fx.flourish) fx.flourish.markerSmoke(data.point, (data.eta || 10) + 10);
        // The first aircraft over a town sets its sirens going.
        if (!sirenSounded && life?.cars) { sirenSounded = true; airRaidSiren(audio); }
        // And the pilot's picture of it in the corner, for a single pass.
        if (data.point && !data.def?.aircraft?.station) pod.show(data.point, data.eta || 10, data.def.name);
        break;
      case 'airborne':
        // The enemy sends for help. Said big, with the count, so the player
        // knows it is worth turning the machine guns up for.
        feedback.emit('lost');
        hud.feed(`ENEMY AIRBORNE · ${data.planes}× ${data.name} · ${data.men} MEN · ${Math.round(data.eta)} s`, 'bad');
        hud.status(`enemy airborne inbound · ${data.men} men · M240 teams engage aircraft`, 6);
        if (data.point) battle.pulse(data.point, 0xd04030, 40, true);
        if (comcard) comcard.airborne();
        break;
      case 'airbornedown':
        feedback.emit('impact', 1.2);
        ribbon('downed'); runStats.downed++;
        hud.feed(`${data.name} SHOT DOWN${data.bounty ? ` · +$${data.bounty.toLocaleString()}` : ''}${data.aboard ? ` — ${data.aboard} ABOARD` : ''}`, 'big');
        break;
      case 'airbornelanded':
        hud.feed(`ENEMY AIRBORNE DOWN · ${data.landed} DUG IN · ${data.lost} LOST`, data.landed > data.lost ? 'bad' : 'big');
        break;
      case 'assaultwarn':
        // Signals hear it coming: time to spread the guns, put the M240s up
        // and buy what will be needed when the sky is shut again.
        feedback.emit('strike');
        hud.feed('SIGINT · ENEMY BRIGADE STAGING · HEAVY DROP AT 75% · SAMS ON PALLETS', 'warn');
        hud.status('counter-attack coming at 75% · spread your guns · M240 teams up · strike before the SAMs land', 9);
        if (comcard) comcard.assaultWarn();
        break;
      case 'assault':
        feedback.emit('lost');
        feedback.emit('strike');
        hud.feed(`COUNTER-ATTACK · ${data.planes}× ${data.name} · ${data.men} MEN · ${data.squads} SQUADS ACROSS THE MAP${data.sams ? ` · ${data.sams} SAM LAUNCHERS` : ''}`, 'bad');
        hud.status(`counter-attack inbound · ${data.men} men · mortar squads all over the map · M240 teams engage aircraft`, 8);
        if (data.point) battle.pulse(data.point, 0xd04030, 60, true);
        if (comcard) comcard.assault();
        break;
      case 'assaultlanded':
        hud.feed(`COUNTER-ATTACK DOWN · ${data.landed} DUG IN · ${data.lost} LOST${data.sams ? ` · ${data.sams} SAM LAUNCHERS UP` : ''}`, data.landed > data.lost ? 'bad' : 'big');
        break;
      case 'winheld':
        // The building is down and the drop is not: the level waits for it.
        feedback.emit('strike');
        hud.feed(`OBJECTIVE DOWN · ${data.left} ENEMY FROM THE DROP STILL FIGHTING · CLEAR THEM TO WIN`, 'warn');
        hud.status(`clear the drop to win · ${data.left} left · each one is marked in red`, 8);
        break;
      case 'dropsleft':
        hud.status(`clear the drop to win · ${data.left} left · marked in red`, 6.5);
        break;
      case 'flushed':
        // Survivors walled in by the town, sent out to where the guns can see them.
        hud.feed(`${data.n} ENEMY BREAKING COVER · MOVING INTO THE OPEN`, 'warn');
        break;
      case 'samlanded':
        hud.feed('S-300 LAUNCHER ON THE GROUND · AIRCRAFT AT RISK', 'warn');
        if (data.point) battle.pulse(data.point, 0xff5030, 24, true);
        break;
      case 'flak':
        // Said before the INBOUND line, so the player reads "under fire" and
        // then watches what the guns do about it, rather than wondering
        // afterwards why the bomb went wide. It is a warning, not a verdict:
        // the pits are still there to be shot at while the aircraft runs in.
        hud.feed(`FLAK OVER TARGET · ${data.guns} GUN${data.guns > 1 ? 'S' : ''}`, 'warn');
        break;
      case 'underfire':
        hud.feed(`${data.def.name} TAKING FIRE${data.loiter ? '' : ' ON THE RUN'}`, 'bad');
        break;
      case 'aborted':
        hud.feed(`${data.def.name} DRIVEN OFF — NO DROP`, 'bad');
        break;
      case 'onstation':
        hud.feed(`${data.def.name} ON STATION · ${Math.round(data.time)} s`, 'big');
        break;
      case 'offstation':
        hud.feed(`${data.def.name} OFF STATION — ${data.stones} STONES · ${data.kills} KILLED`, 'big');
        break;
      case 'samactive':
        hud.feed('SAM SITES ACTIVE — THEY FIRE ON EVERY AIRCRAFT UNTIL DESTROYED', 'warn');
        break;
      case 'samlaunch':
        // Every launch, marked at the launcher, so the player can find it; the
        // feed says so once per aeroplane rather than every few seconds.
        feedback.emit('impact', 0.4);
        if (data.first) hud.feed(`SAM LAUNCH — ${data.label || data.def.name} ENGAGED`, 'bad');
        if (data.point) battle.pulse(data.point.clone(), 0xff5030, 26, true);
        break;
      case 'samkill':
        feedback.emit('impact', 1.4);
        // A transport's loss is said by the air wing, with what it carried.
        if (!data.transport) hud.feed(`${data.label || data.def.name} SHOT DOWN BY SAM`, 'big');
        battle.onEvent('stamp', { text: 'AIRCRAFT LOST', point: data.point, kind: 'loss' });
        if (comcard) comcard.samKill();
        break;
      case 'liftdown':
        lostAircraft = true;
        hud.feed(data.lost.length
          ? `${data.kind} SHOT DOWN — ${data.lost.join(', ')} LOST WITH IT`
          : `${data.kind} SHOT DOWN — ITS LOAD WAS ALREADY OUT`, 'bad');
        if (data.lost.length) hud.status('the SAM sites are hitting the airlift · knock them out before you buy heavy', 6);
        break;
      case 'sammiss':
        hud.feed(`SAM MISSED — ${data.label || data.def.name} STILL FLYING`, 'warn');
        break;
      case 'samdown':
        feedback.emit('impact', 1.0);
        ribbon('samkill');
        battle.hv?.noteKill(data.point);
        hud.feed(data.left ? `SAM LAUNCHER DESTROYED · +$6,000 · ${data.left} LEFT` : 'LAST SAM LAUNCHER DESTROYED — THE SKY IS YOURS', 'big');
        battle.onEvent('stamp', { text: 'SAM DESTROYED', point: data.point, kind: 'hit' });
        break;
      case 'samradar':
        ribbon('samkill');
        battle.hv?.noteKill(data.point);
        hud.feed(data.first
          ? 'RADAR FIRST · +$4,000 +$3,000 BONUS — BOTH ITS LAUNCHERS BLIND BEFORE THEY WERE TOUCHED'
          : 'SAM RADAR DESTROYED · +$4,000 — ITS LAUNCHERS ARE FIRING BLIND', 'big');
        battle.onEvent('stamp', { text: data.first ? 'RADAR FIRST' : 'RADAR DOWN', point: data.point, kind: 'hit' });
        break;
      // ── The rest of the high-value targets (see highvalue.js).
      case 'depothit':
      case 'checkpointhit':
        hud.feed(`${kind === 'depothit' ? 'AMMO DEPOT' : 'CHECKPOINT'} HIT · ${Math.max(1, Math.round(data.frac * 100))}% LEFT`, 'warn');
        break;
      case 'depotdown':
        feedback.emit('jackpot');
        ribbon('depot');
        hud.feed('AMMO DEPOT DESTROYED · +$10,000 — THEY ARE SHORT OF ROUNDS: EVERY GUN SLOWER, THE MORTARS SLOWEST', 'big');
        battle.onEvent('stamp', { text: 'AMMO DEPOT DESTROYED', point: data.point, kind: 'hit' });
        if (comcard) comcard.hvt('depot');
        break;
      case 'checkpointdown':
        feedback.emit('jackpot');
        ribbon('checkpoint');
        hud.feed('CHECKPOINT DESTROYED · +$8,000 — THE ROAD IS CUT: NO MORE TRUCKS COME UP IT', 'big');
        battle.onEvent('stamp', { text: 'ROAD CUT', point: data.point, kind: 'hit' });
        if (comcard) comcard.hvt('road');
        break;
      case 'batterydown':
        feedback.emit('jackpot');
        ribbon('battery');
        hud.feed('ENEMY BATTERY SILENCED · +$10,000 — COUNTER-BATTERY: YOUR GUNS RELOAD 25% FASTER FOR 2 MINUTES', 'big');
        battle.onEvent('stamp', { text: 'BATTERY SILENCED', point: data.point, kind: 'hit' });
        if (comcard) comcard.hvt('battery');
        break;
      case 'generalinbound':
        feedback.emit('strike');
        hud.feed(`INTEL: THE ENEMY GENERAL IS ON THE ROAD — THREE VEHICLES, ${data.eta} s TO COVER · $20,000 ON THE BLACK CAR`, 'warn');
        hud.status('the general\'s convoy is marked in gold · catch it before it gets in', 8);
        if (data.point) battle.pulse(data.point, 0xf3c14a, 30, true);
        if (comcard) comcard.hvt('generalinbound');
        break;
      case 'generalkilled':
        feedback.emit('jackpot');
        ribbon('general');
        hud.feed('THE ENEMY GENERAL IS DEAD · +$20,000', 'big');
        battle.onEvent('stamp', { text: 'GENERAL KILLED', point: data.point, kind: 'hit' });
        if (comcard) comcard.hvt('general');
        break;
      case 'escortdown':
        hud.feed('ESCORT VEHICLE DESTROYED · +$2,000', 'big');
        break;
      case 'generalescaped':
        hud.feed('THE GENERAL GOT AWAY', 'bad');
        break;
      case 'columninbound':
        hud.feed(`ENEMY TRUCKS ON THE ROAD · ${data.eta} s OUT · DESTROY THE CHECKPOINT TO CUT IT`, 'warn');
        break;
      case 'columnlanded':
        hud.feed(`ENEMY TRUCKS UNLOADED · ${data.men} MEN UP FROM THE ROAD`, 'bad');
        break;
      case 'truckdown':
        hud.feed(`ENEMY TRUCK DESTROYED · +$1,500${data.aboard ? ` · ${data.aboard} ABOARD` : ''}`, 'big');
        break;
      case 'firemission':
        feedback.emit('strike');
        ribbon('streak');
        hud.feed(`KILL STREAK — FIRE MISSION: TWELVE 155 mm ROUNDS ON THE ${String(data.what || 'TARGET').toUpperCase()}`, 'big');
        if (data.point) battle.pulse(data.point, 0xf3c14a, 40, true);
        break;
      case 'samhit': {
        // Damage that did not finish it: said, with what is left, so the player
        // knows the rounds are going in and to keep them coming.
        const pct = Math.max(1, Math.round(data.frac * 100));
        hud.feed(`SAM ${data.what === 'radar' ? 'RADAR' : 'LAUNCHER'} HIT · ${pct}% LEFT`, 'warn');
        break;
      }
      case 'samsite': {
        // A whole compound: the money, a free strike, and the general.
        battle.onSamSite();
        feedback.emit('jackpot');
        ribbon('samsite');
        hud.feed(`SAM SITE DESTROYED · +$15,000 · FREE AIR STRIKE EARNED${data.left ? ` · ${data.left} SITE${data.left > 1 ? 'S' : ''} LEFT` : ''}`, 'big');
        hud.status('free air strike: any up to the F-15 is on the house — open STRIKES', 8);
        battle.onEvent('stamp', { text: 'SAM SITE DESTROYED', point: data.point, kind: 'hit' });
        if (!data.left) {
          ribbon('supremacy');
          hud.feed('EVERY SAM SITE DESTROYED — AIR SUPREMACY', 'big');
        }
        if (comcard) comcard.samSite(!data.left);
        break;
      }
      case 'hqhit': {
        const pct = Math.max(1, Math.round(data.frac * 100));
        hud.feed(`COMMAND POST HIT · ${pct}% LEFT`, 'warn');
        break;
      }
      case 'hqdown':
        battle.cutComms();
        battle.hv?.noteKill(data.point);
        feedback.emit('jackpot');
        ribbon('hq');
        hud.feed('ENEMY COMMAND POST DESTROYED · +$12,000 · COMMS CUT: THEIR FIRE IS RAGGED, THEIR MORTARS BLIND', 'big');
        hud.status('comms cut for 90 s · any drop they send for now comes a third short', 8);
        battle.onEvent('stamp', { text: 'COMMAND POST DESTROYED', point: data.point, kind: 'hit' });
        if (comcard) comcard.hqDown();
        break;
      case 'freestrike':
        hud.feed(`FREE STRIKE USED · ${data.def.name}${data.left ? ` · ${data.left} MORE` : ''}`, 'big');
        break;
      case 'samquiet':
        hud.feed('SAM SITES HAVE GONE QUIET', 'big');
        break;
      case 'shotdown':
        hud.feed(`${data.def.name} SHOT DOWN`, 'bad');
        break;
      case 'transporthit':
        hud.feed('TRANSPORT HIT — STICKS DUMPED SHORT', 'bad');
        break;
      case 'canopy':
        hud.feed(data.troops ? `CANOPY SHOT OUT — ${data.def.name}` : `LOAD STREAMING — ${data.def.name}`, 'bad');
        break;
      case 'droplost':
        hud.feed(`${data.def.name} LOST ON THE DROP`, 'bad');
        break;
      case 'dropmauled':
        hud.feed(`${data.def.name} DOWN HARD · ${Math.round(data.health * 100)}%`, 'bad');
        break;
      case 'strikehit':
        hud.feed(`${data.def.name} ON TARGET — ${data.destroyed} STONES`, 'big');
        break;
      case 'megablast': {
        // Eleven tonnes of it: the screen goes white, time stumbles, and the
        // ground shakes the camera whatever it was looking at.
        let el = document.getElementById('whiteout');
        if (!el) { el = document.createElement('div'); el.id = 'whiteout'; document.body.appendChild(el); }
        el.className = ''; void el.offsetWidth; el.className = 'go';
        engine.addShake(1.2);
        if (!suiteHold && !access.still) testMenu.dramaticPause(1.8, 0.3);
        hud.feed('GBU-43/B DETONATION', 'big');
        break;
      }
      case 'stamp':
        hud.stamp(data.text, data.point, data.kind);
        if (data.text === 'DIRECT HIT') { ribbon('hit'); runStats.hits++; }
        else if (/^MASSACRE/.test(data.text)) ribbon('massacre');
        else if (/^MULTI-KILL/.test(data.text)) ribbon('multikill');
        break;
      case 'collateral':
        hud.feed(`${data.n} CITY BLOCKS LEVELLED`, 'big');
        ribbon('collateral');
        setTimeout(() => hud.stamp(`COLLATERAL ×${data.n}`, data.point, 'city', 58), 380);
        break;
      case 'needtarget':
        hud.showPrompt(`${TAP} the building to mark the drop`, 'warn');
        break;
      case 'poor':
        feedback.emit('deny'); hud.deny('money');
        hud.showPrompt(`need $${data.cost.toLocaleString()}`, 'warn');
        break;
      case 'badplace':
        feedback.emit('deny'); hud.deny();
        hud.showPrompt(data.reason, 'warn');
        break;
      case 'unitlost':
        feedback.emit('lost');
        hud.feed(data.fell ? `${data.def.name} DOWN WITH THE BUILDING` : `${data.def.name} LOST`, 'bad');
        if (comcard) comcard.firstLoss();
        break;
      case 'crushed':
        if (data > 2) feedback.emit('impact', 1.3);
        if (data > 2) { hud.feed(`${data} DEFENDERS CRUSHED`, 'big'); ribbon('crushed'); }
        break;
      case 'secondary': {
        // One line for a chain, not one per dump: a run of them inside a
        // couple of seconds is counted up on the same line.
        feedback.emit('impact', 1.1);
        const now = performance.now();
        chain = now - chainAt < 2500 ? chain + 1 : 1;
        chainAt = now;
        hud.feed(chain > 1 ? `CHAIN REACTION ×${chain}` : `SECONDARY EXPLOSION · ${data.kind === 'fuel' ? 'FUEL' : 'AMMUNITION'}`, 'big');
        ribbon('secondary');
        break;
      }
      case 'charge':
        feedback.emit('collapse');
        hud.feed(`DEMOLITION CHARGE — ${data.destroyed} STONES`, 'big');
        ribbon('charge');
        break;
      // The marks, and which of them fell to this run.
      //
      // Read *before* the result is banked, because banking it rewrites the
      // best — ask afterwards and every run is a personal best.
      case 'win': {
        battleOver = true;
        feedback.emit('win');
        clearBattle(level.id);
        winOrbit = true;
        if (comcard) setTimeout(() => { if (!document.body.classList.contains('ended')) comcard.win(); }, 1400);
        // Banked once, by whichever comes first: the timers below, or the
        // page going away. The report waits seven seconds for the collapse
        // to finish, and a player who restarted or closed the tab inside them
        // lost the win, the XP, the medals and the daily, with the save
        // already gone.
        let dailyDone = !dailyMod;
        const bankDaily = () => {
          if (dailyDone) return;
          dailyDone = true;
          if (dailyMet(dailyMod.id, battle.summary())) {
            const streak = markDailyDone(daily.date);
            dailyBanked = streak;
            hud.feed(`DAILY STRIKE COMPLETE · ${streak}-DAY STREAK`, 'big');
          } else {
            hud.feed('DAILY STRIKE MISSED · TOO SLOW FOR BLITZ', 'bad');
          }
          endDailyRun();
        };
        let banked = null;
        const bankWin = () => {
          if (banked) return banked;
          bankDaily();
          const sum = battle.summary();
          const marks = markRun(sum);
          if (!winRecorded) { winRecorded = true; recordResult(level.id, true, sum); }
          recordTheatre(level.id, true, sum);
          const feats = awardMedals(sum);
          banked = { sum, marks, feats, xp: payOut(true, sum, { marks, feats }) };
          return banked;
        };
        window.addEventListener('pagehide', bankWin);
        if (dailyMod) setTimeout(bankDaily, 1500);
        // Let the collapse actually finish before covering it with a panel —
        // the tower coming down is the thing the player came for.
        hud.feed('STRUCTURE FAILING', 'big');
        setTimeout(() => {
          if (battle.state !== 'won') return;
          whiteFlags.raise(garrison.defenders, engine.camera);
          celebrate();
          const sum = battle.summary();
          newsflash(level, sum, { burnt: battle.cityFire?.burnt || 0,
            claim: damageBill(sum, { burnt: battle.cityFire?.burnt || 0 }).total });
        }, 1800);
        rig.focus(new THREE.Vector3(0, groundY + level.camera.height * 0.7, 0),
          level.camera.distance * 1.3);
        setTimeout(() => {
          const { sum, marks, feats, xp } = bankWin();
          window.removeEventListener('pagehide', bankWin);
          hud.nextTargetLabel = nextTarget(level.id).target;
          takeBeforeAfter(sum);
          hideNewsflash();
          hud.showEnd('win', sum, { release: releaseNoteFor(level.id), marks, medals: feats, xp });
        }, 7000);
        break;
      }
      case 'flattened':
        battleOver = true;
        clearBattle(level.id);
        winOrbit = true;
        hud.feed('NOTHING LEFT STANDING', 'big');
        whiteFlags.raise(garrison.defenders, engine.camera);
        {
          const sum0 = battle.summary();
          newsflash(level, sum0, { burnt: battle.cityFire?.burnt || 0,
            claim: damageBill(sum0, { burnt: battle.cityFire?.burnt || 0 }).total });
        }
        setTimeout(() => {
          const sum = battle.summary();
          const marks = markRun(sum);
          // One play is one result, however many reports it shows.
          if (!winRecorded) { winRecorded = true; recordResult(level.id, true, sum); }
          recordTheatre(level.id, true, sum);
          hud.nextTargetLabel = nextTarget(level.id).target;
          takeBeforeAfter(sum);
          hideNewsflash();
          const feats = awardMedals(sum);
          hud.showEnd('win', sum, {
            xp: payOut(true, sum, { marks, feats }),
            medals: feats,
            title: 'Flattened',
            sub: `${level.subtitle} · nothing left standing`,
            release: releaseNoteFor(level.id),
            marks,
          });
        }, 3000);
        break;
      case 'lose':
        battleOver = true;
        feedback.emit('lose');
        clearBattle(level.id);
        if (dailyMod) endDailyRun();
        setTimeout(() => {
          recordResult(level.id, false, data);
          recordTheatre(level.id, false, data);
          hud.showEnd('lose', data, { xp: payOut(false, data) });
        }, 1500);
        break;
      default: break;
    }
  }

  // A structure that is out of plumb groans about it, and once it lets go the
  // world slows for a beat. The collapse is what the player came for; giving it
  // a moment to land is the cheapest drama in the game.
  for (const st of structures) {
    st.onLean = (lean) => {
      if (lean.angle < 0.006) return;
      audio.groan(Math.min(1, lean.angle / 0.13),
        new THREE.Vector3(lean.pivotX, lean.pivotY + 20, lean.pivotZ));
    };
    st.onSectionFalling = (island) => {
      if (island.mass < 400000) return;      // a minor section; no fuss
      const t = island.body.translation();
      const where = new THREE.Vector3(t.x, t.y, t.z);
      audio.rumble(1, where);
      feedback.emit('collapse');
      engine.addShake(0.8);
      hud.feed('STRUCTURE COLLAPSING', 'big');
      ribbon('collapse'); runStats.collapses++;
      // The rounds it took, counted at the moment the first big section went:
      // what a shared clip boasts and what a challenge is scored on.
      if (battle.collapseRounds == null) battle.collapseRounds = battle.shotsFired;
      clip.trigger(island.mass);
      // The first time the landmark goes, it gets the film treatment: a cut
      // to a low angle a quarter round from where the player was, time down
      // to a third for three seconds, and back. Every fall after the first
      // gets the short half-speed beat, which is enough once it has been seen.
      // And where it lands, the dust it drives out along the ground.
      if (fx.flourish && performance.now() - surgeAt > 3000) {
        surgeAt = performance.now();
        const fall = Math.min(4, Math.sqrt(2 * Math.max(1, t.y - groundY) / 9.81));
        const k = Math.min(3, 0.8 + island.mass / 2.5e6);
        fx.flourish.later(fall, () => fx.flourish.surge(t.x, terrain.heightAt(t.x, t.z), t.z, k));
      }
      if (!cine.played && st === primary) collapseCinematic(where);
      else testMenu.dramaticPause(2.0, 0.45);
    };
  }

  /**
   * The collapse, shot like a film. The camera cuts rather than glides — a
   * glide at a third of the speed is a second of nothing moving — to a low
   * orbit on the side of the building a quarter turn from the player's view,
   * far enough out to hold the whole height, looking at the lower third
   * where the fall is. When the beat ends the view eases back to where it
   * was, unless the player has taken the camera in the meantime.
   */
  const cine = { played: false, keep: null };
  let surgeAt = -1e9;
  function collapseCinematic(where) {
    cine.played = true;
    if (suiteHold || access.still) { testMenu.dramaticPause(2.0, 0.45); return; }
    const tall = Math.max(24, (battle.startHeight ?? groundY + 60) - groundY);
    cine.keep = {
      yaw: rig.desiredYaw, pitch: rig.desiredPitch, distance: rig.desiredDistance,
      target: rig.desiredTarget.clone(),
    };
    const turn = Math.random() < 0.5 ? 0.85 : -0.85;
    rig.yaw = rig.desiredYaw = rig.yaw + turn;
    rig.pitch = rig.desiredPitch = 0.1;
    rig.distance = rig.desiredDistance = Math.min(rig.maxDistance, Math.max(70, tall * 1.5));
    const aim = new THREE.Vector3(where.x, groundY + tall * 0.32, where.z);
    rig.target.copy(aim); rig.desiredTarget.copy(aim);
    testMenu.dramaticPause(3.2, 0.3);
  }
  // Called each frame: once the beat is over, hand the camera back.
  function cinematicTick() {
    if (!cine.keep || testMenu._drama) return;
    const k = cine.keep; cine.keep = null;
    if (rig._pointers.size || battleOver) return;   // the player, or the win orbit, has it
    rig.desiredYaw = k.yaw; rig.desiredPitch = k.pitch; rig.desiredDistance = k.distance;
    rig.desiredTarget.copy(k.target);
  }

  // Welded sections fragment when they land hard enough.
  // The physics side needs to know where the ground is: it is the difference
  // between answering "is this stone supported?" with arithmetic and
  // answering it with a ray, and it asks that question thousands of times
  // during a collapse.
  physics.groundAt = (x, z) => terrain.heightAt(x, z);

  physics.onImpact((a, b, force, c1, c2) => {
    // ── Masonry landing on masonry destroys masonry.
    //
    // Standing stone is a collider on the structure's one fixed body, and a
    // fixed body does not care what lands on it — so a tower cut clean through
    // at the base dropped everything above the cut onto the stumps and stopped
    // there, upright, a few metres lower, for the rest of the match. That is
    // the reported "the top part floats and slowly crumbles": the section is
    // resting on its own base and the base is being ground away underneath it
    // one stone at a time by the load solver. Nothing survives having a tower
    // dropped on it, and now nothing does.
    if (force > 34000) {
      for (const [live, col] of [[a, c2], [b, c1]]) {
        if (!live || !col) continue;
        const st = live.structure;
        if (!st) continue;
        // How much came down. An island knows its own mass; a single stone
        // falling off a cornice is not an event.
        let mass = 0;
        if (live.island !== undefined) {
          const isl = st.islands.get(live.island);
          if (!isl) continue;
          mass = isl.mass;
        } else if (live.chunk !== undefined) {
          mass = st.mass[live.chunk];
        }
        if (mass < 4000) continue;
        for (const target of structures) {
          const i = target.chunkAtCollider(col);
          if (i < 0) continue;
          const at = new THREE.Vector3(target.px[i], target.py[i] + target.hy[i], target.pz[i]);
          const gone = target.crushUnder(at, mass, force);
          if (gone > 3) {
            fx.impactDust(at.x, at.y, at.z, Math.min(2.6, gone / 20));
            engine.addShake(Math.min(0.3, gone / 240));
            // And it goes over, rather than down.
            //
            // The support under this edge has just failed, so the weight is
            // now bearing on whatever is left on the other side and the
            // section rotates about it. Without this a severed tower is
            // symmetric, has nothing to tip it, and telescopes straight into
            // its own crater — the base grinding away underneath while the
            // shaft slides down it, which reads exactly as "it crumbles from
            // the bottom up". A demolition charge works this way for the same
            // reason: you do not cut the base evenly, you cut one side.
            const isl = live.island !== undefined ? st.islands.get(live.island) : null;
            if (isl && PhysicsWorld.alive(isl.body)) {
              isl.body.applyImpulseAtPoint(
                { x: 0, y: -mass * 0.30, z: 0 },
                { x: at.x, y: at.y, z: at.z }, true,
              );
            }
          }
          break;
        }
      }
    }

    for (const o of [a, b]) {
      if (!o || o.island === undefined) continue;
      const st = o.structure;
      const isl = st.islands.get(o.island);
      if (!isl || !isl.body) continue;
      isl.impacts++;
      if (force > 26000) {
        const t = isl.body.translation();
        fx.impactDust(t.x, terrain.heightAt(t.x, t.z), t.z,
          Math.min(3.5, isl.members.length / 90));
        // A big section landing throws a column that stands for half a minute,
        // and everything with wings within a hundred metres leaves.
        if (isl.members.length > 90) {
          fx.dustColumn(t.x, terrain.heightAt(t.x, t.z), t.z,
            Math.min(3.2, isl.members.length / 220));
        }
        if (life) life.startle(t.x, t.z, 90 + isl.members.length * 0.5);
        engine.addShake(Math.min(0.55, isl.members.length / 900));
        const where = new THREE.Vector3(t.x, t.y, t.z);
        audio.rumble(Math.min(1, isl.members.length / 260), where);
        audio.play('explosion', where, {
          rate: 0.55, gain: 0.35, rolloff: 420, cooldown: 0.18,
        });
        st.fragmentIsland(o.island);
      }
    }
  });

  // ── Input: tap the structure to designate a target, tap the ground to
  // deploy the selected unit, tap one of your own guns to inspect it.
  const pick = (x, y, own = false) =>
    picker.pick(x, y, structures, contextGroup, garrison, own ? battle.units : null);
  // The same pick with the city answered from its plot list rather than its
  // triangles. A tap happens once and can afford the exact answer; a pointer
  // that is moving cannot — see `Picker.pick`.
  const pickMoving = (x, y, own = false) =>
    picker.pick(x, y, structures, contextGroup, garrison, own ? battle.units : null, true);

  // Every touch gets an immediate screen-space acknowledgement, before any of
  // the work below decides what the touch meant. Feedback that waits on a
  // decision is feedback that arrives too late to be reassuring.
  // Which pointers actually went down on the canvas.
  //
  // A tap is only a tap if this page saw it start. When the system steals a
  // gesture — the iOS app-switcher swipe — the touches it took can deliver
  // their pointerup on the way back in, with no drag recorded against them,
  // and that reads as a deliberate tap: a target designated or a gun planted
  // somewhere the player never touched, at the exact moment they are trying
  // to work out why the camera stopped working.
  const livePointers = new Set();
  const forgetPointers = () => livePointers.clear();
  document.addEventListener('visibilitychange', () => { if (document.hidden) forgetPointers(); });
  window.addEventListener('blur', forgetPointers);
  canvas.addEventListener('pointercancel', (e) => livePointers.delete(e.pointerId));

  /**
   * The gesture in progress, when a weapon is armed.
   *
   * With something selected, one finger on the map belongs to the weapon
   * rather than to the camera: a drag lays a line of guns, or walks the
   * strike sight across the ground. Two fingers still orbit and pinch, so
   * the view is never actually taken away — `rig.dragLocked` is what makes
   * that split, and it is set from here every frame the selection changes.
   */
  let aiming = null;
  const armedDef = () => (battle.selectedUnitId ? UNITS_BY_ID[battle.selectedUnitId] : null);
  const endAiming = () => {
    aiming = null;
    battle.hideLine();
    battle.hideStrikeAim();
    battle.ghost.visible = false;
    battle.rangeRing.visible = false;
  };

  canvas.addEventListener('pointerdown', (e) => {
    livePointers.add(e.pointerId);
    hud.ripple(e.clientX, e.clientY, battle.selectedUnitId ? 'deploy' : 'aim');
    // A tap that dismisses a drawer is a dismissal and nothing else. Letting
    // it through would plant a gun under the panel the player was closing.
    if (hud.openDrawer) { hud.closeDrawer(); aiming = { swallow: true }; return; }
    if (battle.state !== 'playing') return;
    const def = armedDef();
    if (!def || livePointers.size > 1) return;
    const hit = pick(e.clientX, e.clientY, !!def.strike);
    if (!hit) return;
    if (def.strike?.strafe) {
      // A gun run is a line: down where the stream starts, drag along it.
      const at = hit.point.clone();
      aiming = { kind: 'strafe', def, at, to: at.clone() };
      battle.showStrafe(at, at, def);
    } else if (def.strike) {
      const at = hit.kind === 'defender' ? hit.defender.pos.clone() : hit.point.clone();
      aiming = { kind: 'strike', def, at };
      battle.showStrikeAim(at, def);
    } else if (hit.kind === 'ground' || hit.kind === 'roof') {
      aiming = { kind: 'line', def, from: hit.point.clone(), points: [hit.point.clone()] };
      aiming.from.onRoof = hit.kind === 'roof';
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!livePointers.delete(e.pointerId)) return;
    // The armed gestures resolve themselves and end the tap here: a line of
    // guns goes down, or the strike goes in at whatever the sight was on.
    if (aiming) {
      const a = aiming;
      aiming = null;
      if (a.swallow) return;
      if (a.kind === 'strike') {
        battle.hideStrikeAim();
        if (battle.state === 'playing') battle.callStrike(battle.selectedUnitId, a.at);
        return;
      }
      if (a.kind === 'strafe') {
        battle.hideStrikeAim();
        if (battle.state === 'playing') battle.callStrike(battle.selectedUnitId, a.at, { to: a.to });
        return;
      }
      if (a.kind === 'line') {
        battle.hideLine();
        battle.rangeRing.visible = false;
        battle.ghost.visible = false;
        if (battle.state !== 'playing') return;
        const pts = a.points.length > 1 ? a.points : [a.from];
        let placed = 0;
        for (const p of pts) {
          if (pts.length > 1 && !p.ok) continue;
          const before = battle.units.length + battle.pending.length;
          battle.deploy(battle.selectedUnitId, p);
          if (battle.units.length + battle.pending.length > before) {
            placed++;
            battle.pulse(p, 0x6fd08c, 14);
          } else if (pts.length === 1) {
            battle.pulse(p, 0xe8604c, 14);
          }
        }
        if (pts.length > 1 && placed > 1) {
          hud.feed(`${placed} × ${a.def.name} EMPLACED`, '');
        }
        return;
      }
    }
    if (rig.wasDrag) return;
    if (battle.state !== 'playing') return;
    const strike = !!(battle.selectedUnitId && UNITS_BY_ID[battle.selectedUnitId].strike);
    const hit = pick(e.clientX, e.clientY, !battle.selectedUnitId || strike);
    if (!hit) return;

    if (hit.kind === 'unit') {
      unitCard.show(hit.unit);
      battle.pulse(hit.point, 0x58a6ff, 10);
      return;
    }
    unitCard.hide();

    if (battle.selectedUnitId && UNITS_BY_ID[battle.selectedUnitId].strike) {
      // An air strike goes wherever you tap: the building, a defender, the
      // ground beside it. The aircraft does the rest.
      const at = hit.kind === 'defender' ? hit.defender.pos.clone() : hit.point.clone();
      battle.callStrike(battle.selectedUnitId, at);
      return;
    }
    if (battle.selectedUnitId) {
      if (hit.kind === 'ground' || hit.kind === 'roof') {
        const ok = battle.validPlacement(hit.point, UNITS_BY_ID[battle.selectedUnitId]);
        battle.pulse(hit.point, ok.ok ? 0x6fd08c : 0xe8604c, 14);
        battle.deploy(battle.selectedUnitId, hit.point);
        battle.rangeRing.visible = false;
      } else {
        battle.pulse(hit.point, 0xe8604c, 9, true);
        hud.showPrompt('deploy on open ground', 'warn');
      }
      return;
    }
    if (hit.kind === 'defender') {
      // Aim at the man himself, not the point on him the ray happened to hit,
      // so the battery converges on the position rather than on a shoulder.
      battle.setTarget(hit.defender.pos, hit.label, hit.defender);
      hud.feed(`TARGET: ${(hit.label || 'defender').toUpperCase()}`, 'big');
    } else if (hit.kind === 'structure') {
      battle.setTarget(hit.point, hit.label);
      hud.feed(`TARGET: ${(hit.label || 'structure').toUpperCase()}`, '');
    } else {
      // A gold-marked target under the tap: the guns lay on it. A launcher,
      // a radar or a truck is not masonry and not a man, and there was no way
      // to put the battery on one but to hit the ground beside it.
      const hv = nearestHvt(hit.point, 22);
      if (hv) {
        const p = new THREE.Vector3(hv.x, terrain.heightAt(hv.x, hv.z) + 1.5, hv.z);
        battle.setTarget(p, HVT_LABEL[hv.kind] || 'target');
        hud.feed(`TARGET: ${(HVT_LABEL[hv.kind] || 'target').toUpperCase()}`, 'big');
        return;
      }
      // Tapping bare ground with nothing selected still confirms the tap, so
      // it is obvious the game registered it and where.
      battle.pulse(hit.point, 0x7e8b9b, 9);
    }
  });

  const onPointerMove = (e) => {
    // A gesture in progress owns the preview, on any input: this is the drag
    // that lays the line and the drag that walks the strike sight, and it is
    // the only way either of them exists on a touch screen.
    if (aiming && !aiming.swallow) {
      if (livePointers.size > 1) { endAiming(); return; }
      const hit = pickMoving(e.clientX, e.clientY, aiming.kind === 'strike');
      if (!hit) return;
      if (aiming.kind === 'strafe') {
        aiming.to = hit.point.clone();
        battle.showStrafe(aiming.at, aiming.to, aiming.def);
        const len = Math.hypot(aiming.to.x - aiming.at.x, aiming.to.z - aiming.at.z);
        hud.status(len < 12 ? 'drag along the line to strafe' : `GUN RUN · ${Math.round(Math.min(len, aiming.def.strike.maxLen))} m`, 1.2);
        return;
      }
      if (aiming.kind === 'strike') {
        aiming.at = hit.kind === 'defender' ? hit.defender.pos.clone() : hit.point.clone();
        battle.showStrikeAim(aiming.at, aiming.def);
        return;
      }
      if (hit.kind !== 'ground' && hit.kind !== 'roof') return;
      aiming.points = battle.linePlacements(aiming.from, hit.point, aiming.def);
      if (aiming.points.length > 1) {
        battle.showLine(aiming.points, aiming.def);
        battle.ghost.visible = false;
        battle.rangeRing.visible = false;
        const n = aiming.points.filter((p) => p.ok).length;
        hud.status(`${n} × ${aiming.def.name} · $${(n * aiming.def.cost).toLocaleString()}`, 1.2);
      } else {
        battle.hideLine();
        const ok = battle.validPlacement(hit.point, aiming.def).ok;
        battle.ghost.position.copy(hit.point).setY(hit.point.y + 0.25);
        battle.ghost.material.color.setHex(ok ? 0x58a6ff : 0xe8604c);
        battle.ghost.visible = true;
        battle.showRange(hit.point, aiming.def);
      }
      return;
    }

    // Hover preview for the deployment footprint (desktop only).
    if (!battle.selectedUnitId || e.pointerType === 'touch') {
      battle.ghost.visible = false;
      battle.rangeRing.visible = false;
      battle.hideStrikeAim();
      return;
    }
    const def = UNITS_BY_ID[battle.selectedUnitId];
    const hit = pickMoving(e.clientX, e.clientY, !!def.strike);
    if (def.strike) {
      // The sight follows the mouse over the ground, at the size of the
      // warhead it would call, so the cost of a tap is visible before it.
      battle.ghost.visible = false;
      battle.rangeRing.visible = false;
      if (!hit) { battle.hideStrikeAim(); return; }
      // A gun run previews the default line through the point.
      if (def.strike.strafe) { battle.showStrafe(hit.point, hit.point, def); return; }
      battle.showStrikeAim(hit.kind === 'defender' ? hit.defender.pos : hit.point, def);
      return;
    }
    battle.hideStrikeAim();
    if (!hit || (hit.kind !== 'ground' && hit.kind !== 'roof')) {
      battle.ghost.visible = false;
      battle.rangeRing.visible = false;
      return;
    }
    const ok = battle.validPlacement(hit.point, def).ok;
    battle.ghost.position.copy(hit.point).setY(hit.point.y + 0.25);
    battle.ghost.material.color.setHex(ok ? 0x58a6ff : 0xe8604c);
    battle.ghost.visible = true;
    battle.showRange(hit.point, def);
  };

  /**
   * One preview a frame, and only when the pointer has actually gone
   * somewhere.
   *
   * A finger dragging a line of guns delivers pointer moves faster than the
   * game draws — a hundred and twenty a second on a modern phone, more in a
   * coalesced burst — and each one of them was re-picking the world and
   * re-laying the line. Even after the pick itself got cheap, doing that work
   * several times between two frames is work nobody ever sees. The last
   * position is kept and answered once, on the next frame, which is the only
   * moment the answer can appear.
   */
  let movePending = null, moveQueued = false;
  const flushMove = () => {
    moveQueued = false;
    const e = movePending;
    movePending = null;
    if (e) onPointerMove(e);
  };
  canvas.addEventListener('pointermove', (e) => {
    if (movePending && Math.abs(e.clientX - movePending.clientX) < 1.5
        && Math.abs(e.clientY - movePending.clientY) < 1.5) return;
    movePending = { clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType };
    if (!moveQueued) { moveQueued = true; requestAnimationFrame(flushMove); }
  });

  canvas.addEventListener('pointercancel', () => { if (aiming) endAiming(); });

  window.addEventListener('keydown', (e) => {
    // Not with a modifier (Cmd-1 is a browser tab), not while typing in the
    // test panel, and not under the map or the report.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (battle.state !== 'playing' || document.body.classList.contains('ended')) return;
    if (document.body.classList.contains('covered')) return;
    if (e.code === 'Escape') {
      battle.selectedUnitId = null;
      hud.hidePrompt();
      hud.closeDrawer();
      endAiming();
    }
    // Number keys pick the corresponding slot in the build bar. The bar runs
    // to eleven cards and prints the number on each one, so 0 and - carry the
    // last two rather than leaving the air wing — the two the badges promise
    // and the only ones you cannot reach any other way from the keyboard —
    // pickable by mouse alone.
    //
    // Two drawers now, so two rows: the ground units on the bare keys, the
    // strikes with Shift, or on the bare keys while the STRIKES drawer is
    // open. By code rather than key, because Shift-1 is '!' on one layout
    // and something else on the next.
    const dm = /^Digit(\d)$/.exec(e.code);
    const n = dm ? (+dm[1] || 10) : e.code === 'Minus' ? 11 : 0;
    if (n >= 1 && n <= 11) {
      const row = (e.shiftKey || hud.openDrawer === 'strikes') ? hud.bars.strikes : hud.bars.units;
      const id = row[n - 1];
      if (id && battle.selectUnit(id)) {
        hud.status(UNITS_BY_ID[id].strike?.strafe ? 'press and drag along the line to strafe'
          : UNITS_BY_ID[id].strike ? `${TAP} the target to call the strike` : `${TAP} the ground to deploy`, 4);
      }
    }
  });

  // The high-value target nearest a point, within `r` metres, for a tap.
  const HVT_LABEL = { launcher: 'SAM launcher', radar: 'SAM radar', hq: 'command post', depot: 'ammo depot',
    checkpoint: 'checkpoint', howitzer: 'howitzer', car: "general's car", truck: 'escort truck' };
  const hvtTap = [];
  function nearestHvt(p, r) {
    let best = null, bd = r * r;
    for (const h of battle.hvtPoints(hvtTap)) {
      const d = (h.x - p.x) ** 2 + (h.z - p.z) ** 2;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  let tutorial = null;
  const firstPrompt = () => {
    if (level.id === 'tutorial') {
      tutorial = new Tutorial({ hud, battle, rig, camera: engine.camera, origin, groundY, level, audio, unitCard });
      return;
    }
    hud.status(`${TAP} the tower to designate a target`, 4);
    if (resumeSnap) hud.feed(`BATTLE RESUMED · ${Math.round(resumeSnap.integrity * 100)}% STANDING`, 'big');
    if (dailyMod) hud.feed(`DAILY STRIKE · ${dailyMod.name} · ${dailyMod.line.toUpperCase()}`, 'big');
    const ch = getChallenge();
    if (ch && ch.level === level.id) {
      hud.challenge = ch;
      hud.feed(`CHALLENGE · BRING IT DOWN IN UNDER ${ch.rounds} ROUNDS`, 'big');
    }
    // And then, once, the thing the game had never said out loud: that the
    // building is a load path and the player can see it. The mechanic was
    // always there — ninety stones out of five thousand, cut on the right
    // side, and the campanile goes over — but a tool nobody is told about is
    // a tool nobody uses, and every level was being ground down from the top.
    setTimeout(() => {
      if (battle.state === 'playing' && !hud.survey) {
        hud.status(`SURVEY (V) \u2014 ${access.cb ? 'yellow' : 'red'} stone is holding the rest up`, 6);
      }
    }, 9000);
  };
  const uiEl = document.getElementById('ui');
  let standoff = null;
  if (intros) {
    await castReady;
    // The HUD stays out of the way until the two of them have had their say.
    uiEl.classList.add('standoff');
    standoff = new Standoff({
      level, rig, groundY, audio,
      onDone: () => {
        standoff = null;
        uiEl.classList.add('hud-fade');
        uiEl.classList.remove('standoff');
        setTimeout(() => uiEl.classList.remove('hud-fade'), 700);
        firstPrompt();
      },
    });
  }
  // Build every shader now, while there is still a progress bar to hide it.
  //
  // A WebGL program is compiled the first time something needs it, and the
  // renderer needs a new one the first time each combination of material,
  // lights and shadows appears. That is not spread evenly over a level: the
  // scene sits on a handful of programs until the garrison opens fire, and
  // then the tracers, the muzzle flashes, the sparks and the men themselves
  // all arrive within a second of each other and every one of them stops the
  // frame while its shader is built. On a phone that is the game hitching
  // hard and going black at the exact moment the shooting starts — which is
  // the exact moment it was reported.
  //
  // `compileAsync` walks the scene and builds them up front, off the main
  // thread where the driver supports it. It costs a second here, where a
  // second is already being spent, and buys back every stall out there.
  await progress(97, 'building shaders');
  try {
    if (engine.renderer.compileAsync) {
      await engine.renderer.compileAsync(engine.scene, engine.camera);
    } else {
      engine.renderer.compile(engine.scene, engine.camera);
    }
  } catch (err) {
    // A driver that will not pre-compile still runs the game; it just pays
    // for each shader when it first needs it, as it did before.
    console.warn('[tumble] shader pre-compile skipped:', err?.message || err);
  }

  // The battle as it was left, before the player sees the board.
  if (resumeSnap) {
    try {
      if (restoreBattle(resumeSnap, { battle, structures })) {
        for (const st of structures) st.solveStability(true);
        battle.rebaseEconomy();
        for (const id of resumeSnap.used || []) used.add(id);
        console.log(`[tumble] resumed ${level.id}: ${resumeSnap.units.length} units, $${resumeSnap.money}`);
      } else {
        console.warn('[tumble] saved battle does not fit this build of the level; starting fresh');
        resumeSnap = null;
      }
    } catch (err) {
      console.warn('[tumble] could not resume the battle', err);
    }
  }

  stopTips();
  document.getElementById('loading').style.display = 'none';
  if (recovered) hud.feed(`LAST LOAD RAN OUT OF MEMORY · QUALITY ${recovered.to.toUpperCase()}`, 'big');
  uiEl.hidden = false;
  if (!standoff) firstPrompt();

  // Written down while it is being fought, so a phone call or a closed tab
  // does not cost the battle. Boot Camp and regression runs are not kept.
  let battleOver = false;
  // The frame loop's pacing and its end (see power.js and `release` below).
  let released = false, menuOpen = false, coveredBy = 0;
  // The front door or the map over the battle. Said on the body as well, so
  // the battle's keys (and the HUD's) can stand down while it is covered:
  // a digit pressed on the map armed a gun behind it.
  function cover(n) {
    coveredBy = Math.max(0, coveredBy + n);
    document.body.classList.toggle('covered', coveredBy > 0);
  }
  const keepBattle = () => {
    if (battleOver || level.id === 'tutorial' || selftest) return;
    try { if (localStorage.getItem('tt.suite') === '1') return; } catch { /* private mode */ }
    try { saveBattle(snapshotBattle({ level, battle, structures, daily, used })); } catch (err) { console.warn('[tumble] battle not saved', err); }
  };
  window.__keepBattle = keepBattle;
  setInterval(keepBattle, 10000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) keepBattle(); });
  window.addEventListener('pagehide', keepBattle);

  const governor = new AdaptiveGovernor(quality, engine);
  const perfEl = document.getElementById('perf');
  // Kept up to date either way — the harness reads its text — but only shown
  // when asked for.
  if (perfEl && new URLSearchParams(location.search).has('perf')) {
    perfEl.classList.add('on');
  }
  let last = performance.now();
  let frames = 0, fpsAcc = 0, fps = 0, physMs = 0;

  /**
   * Step the simulation without rendering.
   *
   * Automated tests and the test menu both need to cover a two-minute
   * engagement in a fraction of a second — under a software rasteriser the
   * page runs at a couple of frames a second, so wall-clock waiting advances
   * almost no game time and nothing with a setup timer ever fires. This runs
   * the same update path the frame loop does, minus the draw.
   */
  const fastForward = (seconds, step = 1 / 60) => {
    const steps = Math.round(seconds / step);
    for (let i = 0; i < steps; i++) {
      physics.step(step);
      physics.recycleSettled(quality.settleFrames);
      physics.auditFrozen();
      physics.cullRunaways(terrain.span * 1.6);
      for (const s of structures) {
        s.solveStability(); s.maintainIslands(step); s.tickLean(step); s.syncTransforms();
      }
      battle.update(step);
      while (pendingCharges.length) battle.demolitionCharge(pendingCharges.pop());
      fx.update(step);
      whiteFlags.update(step);
    }
    return steps;
  };

  // Collect anything the WebGL context complains about, so the self-test suite
  // can assert the render path is clean rather than relying on someone
  // noticing a warning in the console.
  const shaderLog = [];
  {
    const warn = console.warn.bind(console);
    const err = console.error.bind(console);
    const watch = (fn) => (...args) => {
      const s = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
      if (/shader|program|glsl|webgl/i.test(s)) shaderLog.push(s.slice(0, 160));
      fn(...args);
    };
    console.warn = watch(warn);
    console.error = watch(err);
  }

  const testMenu = new TestMenu({
    battle, engine, physics, terrain, rig, quality, level, structures, water,
    cityGroup: contextGroup, hud, picker, fx, garrison, governor,
    life, fastForward,
    stats: () => ({ fps, physMs: +physMs.toFixed(2) }),
    shaderErrors: () => shaderLog,
  });

  /**
   * A regression run starts from a board nothing has happened on yet.
   *
   * The harness waits for the loading overlay to clear and then runs the whole
   * suite in one synchronous call — but between those two moments the real
   * frame loop is running at whatever rate the machine can manage, and with
   * three browsers sharing the cores that is a different number of frames every
   * time. Every one of them is a frame of battle: the garrison fires, the men
   * move, `Math.random` is drawn. So the suite began from a slightly different
   * board on each run, and three tests have been coin flips for it — passing
   * alone, failing in the batch, and moving between levels between runs.
   *
   * Under `tt.suite` the clock does not start until a test asks for time.
   * `fastForward` drives physics and the battle directly, so every test that
   * wants the level running still gets it, to the frame, identically.
   */
  let suiteHold = false;
  try {
    if (localStorage.getItem('tt.suite') === '1') {
      testMenu.paused = true;
      suiteHold = true;
      // And the machine does not get a vote on the simulation either: see
      // `frozen` in the governor.
      governor.frozen = true;
    }
  } catch { /* private mode */ }
  // Nothing a test wants is out of reach while the hold is on: `fastForward`
  // drives the physics, the structures and the battle directly, which is how
  // every test that needs the level running already buys its time.

  /**
   * A frame that cannot take the picture down with it.
   *
   * `frame` re-arms itself on its first line, so a thrown error never stopped
   * the loop — but `engine.render()` is its last line, so anything that threw
   * in between meant the canvas was simply never drawn again while the loop
   * went on spinning at full rate. From the outside that is a frozen game on a
   * live page: the HUD still responds, the pause menu still opens, the perf
   * readout still says sixty frames a second, because those are the numbers
   * from the last frame that finished. Two players' reports and a stats dump
   * taken *from inside* a frozen level all say exactly that.
   *
   * There is at least one way to get there that this engine cannot recover
   * from at all. Rapier hands out wrappers around raw indices; touching a body
   * that has been removed traps in wasm, and a wasm trap leaves the world
   * permanently borrowed, so every `step` after it throws for the rest of the
   * session. `PhysicsWorld.remove` marks bodies for exactly that reason and
   * the call sites check it — but a single missed check anywhere is a level
   * that dies mid-collapse with no message and no way back.
   *
   * So the simulation is fenced off from the draw. Whatever happens in there,
   * the camera still moves and the frame is still rendered; the fault is
   * recorded once with its stack, and if it keeps happening the player is told
   * rather than left looking at a still photograph wondering whose fault it
   * is. Nothing is swallowed silently: the first one goes to the console in
   * full, and the panel carries enough of it to be read off a screenshot.
   */
  let faultRun = 0, faultShown = false, faultFirst = null;
  const onFrameFault = (err, where) => {
    faultRun++;
    if (!faultFirst) {
      faultFirst = err;
      console.error(`[tumble] frame fault in ${where}`, err);
    }
    // Half a second of nothing but faults is not a hiccup; it is broken.
    if (faultRun >= 30 && !faultShown) {
      faultShown = true;
      const msg = String((err && err.message) || err || 'unknown');
      const at = String((err && err.stack) || '').split('\n')[1] || '';
      hud.showFault(`${where}: ${msg}`, at.trim());
    }
  };

  let lastArmed = null, lastDrawer = null;
  const hazeBase = engine.scene.fog.density;
  const warmBase = engine.gradePass.uniforms.uWarm.value;
  const MILESTONES = [
    { at: 0.75, label: 'A QUARTER OF IT DOWN', taunt: 'quarter' },
    { at: 0.5, label: 'HALF STANDING', taunt: 'half' },
    { at: 0.25, label: 'A QUARTER STANDING' },
    { at: 0.2, label: 'ONE FIFTH STANDING — NEARLY THERE', taunt: 'last' },
  ];
  let nextMs = -1;

  // The whistle of an incoming mortar bomb, timed to the landing: a sine
  // sliding down an octave under a low-pass, cut off dead at the impact,
  // made in the game's own audio context so the SOUND switch covers it.
  let lastWhistle = -10;
  garrison.onMortarFire = (d, aim, vel, g) => {
    const c = audio.ctx;
    if (!c || !audio.enabled || c.state !== 'running') return;
    const now = c.currentTime;
    if (now - lastWhistle < 1.3) return;
    lastWhistle = now;
    const flight = Math.max(0.6, (2 * Math.max(0, vel.y)) / g);
    const len = Math.min(1.6, flight * 0.55);
    const t0 = now + flight - len, t1 = now + flight;
    try {
      const o = c.createOscillator(), f = c.createBiquadFilter(), gn = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1500, t0);
      o.frequency.exponentialRampToValueAtTime(620, t1);
      f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.7;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(0.11, t1 - 0.08);
      gn.gain.setValueAtTime(0.0001, t1);
      o.connect(f).connect(gn).connect(c.destination);
      o.start(t0); o.stop(t1 + 0.01);
    } catch { /* no audio */ }
  };

  function frame() {
    if (released) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    // Paced (see power.js): thirty frames on the battery saver, a few behind
    // a menu. The time skipped is not work the device failed to do, so the
    // governor is told the frame took what it would have unpaced.
    const gap = power.gap({ menu: menuOpen, covered: coveredBy > 0, over: battleOver });
    if (gap && now - last < gap - 3) return;
    const dtMs = now - last;
    const workMs = gap ? Math.max(0, dtMs - gap + 1000 / 60) : dtMs;
    const rawDt = Math.min(dtMs / 1000, 0.05);
    const dt = testMenu.paused ? 0 : rawDt * testMenu.timeScale;
    last = now;

    try {
    const pStart = performance.now();
    // Held for a regression run until a test asks for time.
    //
    // Pausing sets `dt` to zero, and that is not the same as not running: the
    // bodies still take a step, the recycler still counts a frame toward
    // settling, the freeze audit still runs. Those are counted in frames, not
    // in seconds, so the number of real frames between the level finishing
    // loading and the suite starting still moved the board about — which is
    // three quarters of a second on an idle box and several on a loaded one.
    // Cologne's hanging rubble was the last test still flipping on it.
    if (!suiteHold) {
      physics.setBudget(governor.update(workMs));
      physics.step(dt);
      physics.recycleSettled(quality.settleFrames);
      physics.auditFrozen();
      physics.cullRunaways(terrain.span * 1.6);
      for (const s of structures) { s.solveStability(false, quality.solveGap || 0); s.maintainIslands(dt); s.tickLean(dt); }
    }
    physMs = physMs * 0.9 + (performance.now() - pStart) * 0.1;

    for (const s of structures) s.syncTransforms();

    // Held with the rest of it: the birds and the traffic draw on the same
    // generator the suite seeds, so leaving them running between the level
    // loading and the tests starting put the stream at a different place on
    // every run — which is the whole thing the seed was for.
    if (life && !suiteHold) life.update(rawDt);
    audio.setListener(engine.camera);
    battle.tracerFX.setCamera(engine.camera);
    if (!suiteHold) battle.update(dt);
    // The survey follows the solver. Throttled inside `paintSurvey` — the
    // numbers only move when the stability pass runs, and repainting thirty
    // thousand stones sixty times a second to watch that is a frame's work
    // for nothing.
    if (hud.survey) for (const st of structures) st.paintSurvey();
    // Anything the last frame uncovered goes off now, one frame late and
    // safely outside the pass that exposed it.
    while (pendingCharges.length) battle.demolitionCharge(pendingCharges.pop());
    fx.update(dt);
    whiteFlags.update(dt);
    huntMarkers.update(rawDt, battle.garrison, engine.camera, !!battle._held && battle.state === 'playing');
    hvtMarkers.updatePoints(rawDt, battle.hvtPoints(hvtPts), engine.camera, battle.state === 'playing' && !document.body.classList.contains('clear-view'));
    hud.update(rawDt);
    if (tutorial) tutorial.update();
    // A weapon armed, a drawer opened: felt and heard, from whichever of the
    // dozen places that can do it did it.
    if (battle.selectedUnitId !== lastArmed) {
      if (battle.selectedUnitId) feedback.emit('select');
      lastArmed = battle.selectedUnitId;
    }
    if (hud.openDrawer !== lastDrawer) {
      if (hud.openDrawer) feedback.emit('open');
      lastDrawer = hud.openDrawer;
    }
    // The fight leaves its mark on the air. As the building comes down the
    // haze thickens and the grade warms, so a site an hour into a bombardment
    // does not look like the postcard it started as. Two uniforms a frame.
    {
      const frac = battle.primary ? Math.max(0, Math.min(1, 1 - battle.primary.monumentIntegrity)) : 0;
      engine.scene.fog.density = hazeBase * (1 + 0.6 * frac);
      engine.gradePass.uniforms.uWarm.value = warmBase + 0.07 * frac;
    }
    // Milestones on the way down: a flash on the bar, a line in the feed, a
    // nudge to the camera, and the enemy general with something to say.
    if (battle.state === 'playing') {
      const integ = 1 - battle.objectiveProgress;
      if (nextMs < 0) { nextMs = 0; while (MILESTONES[nextMs] && integ <= MILESTONES[nextMs].at) nextMs++; }
      while (MILESTONES[nextMs] && integ <= MILESTONES[nextMs].at) {
        const m = MILESTONES[nextMs++];
        hud.milestone();
        feedback.emit('milestone');
        hud.feed(m.label, 'big');
        engine.addShake(0.22);
        if (comcard && m.taunt) comcard[m.taunt]();
      }
    }
    // Once it is down the camera drifts round the ruin until the player
    // takes it back.
    if (winOrbit && rig._pointers.size === 0 && !access.still) rig.desiredYaw += rawDt * 0.07;
    // One finger belongs to the weapon while one is armed. Set here rather
    // than in the selection handler because a unit can be deselected from
    // half a dozen places — a keypress, a deploy, a win — and a camera left
    // locked after one of them is a camera that has stopped working.
    rig.dragLocked = !!battle.selectedUnitId && battle.state === 'playing';
    unitCard.update();
    testMenu.update(rawDt);
    cinematicTick();
    ambience.tick();
    flags.update(rawDt);
    if (standoff) standoff.update();
    faultRun = 0;
    } catch (err) { onFrameFault(err, 'simulation'); }

    water.material.uniforms.uTime.value = now * 0.001;
    if (sky.material.uniforms) sky.material.uniforms.uTime.value = now * 0.001;
    // The dome rides with the eye. It is four kilometres across and Lhasa
    // stands three and a half up, so a dome pinned to the world origin has
    // the camera at the top of it with half the sky outside the geometry.
    sky.position.copy(engine.camera.position);
    cloudUniforms.uCloudTime.value = now * 0.001;

    const shake = engine.updateShake(rawDt, rig.distance);
    rig.update(rawDt, shake);
    engine.sun.target.position.set(rig.target.x, rig.target.y, rig.target.z);
    engine.sun.position.set(
      rig.target.x + SUN_OFFSET.x, rig.target.y + SUN_OFFSET.y, rig.target.z + SUN_OFFSET.z);
    engine.render();
    pod.render(dt);
    clip.frame();

    frames++; fpsAcc += dtMs;
    if (fpsAcc > 420) { fps = Math.round(1000 / (fpsAcc / frames)); frames = 0; fpsAcc = 0; }
    if (perfEl) {
      perfEl.textContent =
        `${fps} fps · phys ${physMs.toFixed(1)}ms · ${physics.awakeCount} awake / ` +
        `${physics.dynamicSet.size} sim · ` +
        `${structures.reduce((a, st) => a + st.destroyedCount, 0)} stones gone · ` +
        `${structures.reduce((a, st) => a + st.islands.size, 0)} sections · ${quality.id}` +
        ` · shed: ${governor.shed}`;
    }
  }
  /**
   * The other way the picture stops.
   *
   * A browser that runs short of graphics memory takes the context back, and
   * on a phone that is not rare. Three.js then draws nothing; the page carries
   * on, the interface carries on, and what the player sees is a frozen game —
   * the same symptom as a fault in the update and a completely different
   * cause. Nothing here listened for it, so the two were indistinguishable
   * from the outside. `preventDefault` is what allows the context to come back
   * at all; without it the browser will not restore one.
   */
  engine.renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (released) return;
    console.error('[tumble] webgl context lost');
    hud.showFault('the graphics context was lost',
      'the browser took the GPU back — usually because it ran out of memory');
  });
  engine.renderer.domElement.addEventListener('webglcontextrestored', () => {
    console.warn('[tumble] webgl context restored');
  });

  // Leaving: give everything back before the next page asks for it.
  //
  // Moving to another level is a full page load, and a phone browser keeps the
  // page being left — its graphics context, its physics heap, its audio — alive
  // until the next one is up, and longer if it decides to cache it for the back
  // button. Two levels' worth of memory at once is more than a phone has, and
  // the next level died loading and was loaded again, over and over. So the
  // old one is taken down first, and a page brought back from that cache is
  // simply loaded fresh.
  const release = () => {
    if (released) return;
    released = true;
    try { engine.renderer.dispose(); } catch { /* going anyway */ }
    try { engine.renderer.forceContextLoss(); } catch { /* going anyway */ }
    try { physics.dead = true; physics.world.free(); } catch { /* going anyway */ }
    try { ambience.stop(); } catch { /* going anyway */ }
    try { if (audio.ctx) audio.ctx.close(); } catch { /* going anyway */ }
  };
  window.__releaseLevel = release;
  window.addEventListener('pagehide', release);
  window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

  frame();

  Object.assign(window, {
    engine, physics, terrain, rig, battle, garrison, fx, quality, audio, level, life,
    structures, tower: primary, primary, picker, hud, water, testMenu, flags, unitCard,
    cityGroup: contextGroup,
    // Exposed so a console session or the headless harness can build the same
    // vectors the game does rather than duck-typing them.
    THREE,
  });
  // Live, because it is replaced by null when the stand-off ends.
  Object.defineProperty(window, 'standoff', { get: () => standoff, configurable: true });
  window.__fastForward = fastForward;
  // One real frame, on demand. The suite uses it to prove that an update which
  // throws still reaches the draw — which cannot be asserted from
  // `fastForward`, because that is the path with no draw in it.
  window.__frame = frame;
  // Exercised by the UI probe: the end-of-level path without having to win.
  window.__recordAndEnd = (sum) => {
recordResult(level.id, true, sum);
    recordTheatre(level.id, true, sum);
    hud.nextTargetLabel = nextTarget(level.id).target;
    hud.showEnd('win', sum);
  };
  // The headless harness drives the same suite the panel does, so a regression
  // fails CI and the in-game panel identically.
  window.__runTests = () => testMenu.runTestsSync();

  // The panel holds the clock for its run the way `tt.suite` does for the
  // harness, and lets it go again when the run is over.
  testMenu.holdClock = (on) => {
    suiteHold = on;
    testMenu.paused = on;
    governor.frozen = on;
  };
  if (selftest) {
    const go = () => {
      if (document.getElementById('loading')?.style.display !== 'none') { setTimeout(go, 400); return; }
      testMenu.toggle(true);
      testMenu.runTestsLive();
    };
    setTimeout(go, 800);
  }
}

boot().catch((err) => {
  console.error(err);
  if (statusEl) statusEl.textContent = `failed: ${err.message}`;
});
