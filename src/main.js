import * as THREE from 'three';
import { detectQuality, setQuality, AdaptiveGovernor } from './core/quality.js';
import { initPhysics, PhysicsWorld } from './core/physics.js';
import { Engine, CameraRig, SUN_OFFSET } from './core/engine.js';
import { Audio } from './core/audio.js';
import { loadTerrain } from './world/terrain.js';
import { createSky, createWater } from './world/sky.js';
import { buildContext } from './world/context.js';
import { Life } from './world/life.js';
import { loadCity } from './world/city.js';
import { buildCityBodies } from './world/citybodies.js';
import { buildFieldWorks } from './world/works.js';
import { CoastalTurret } from './game/turret.js';
import { Structure } from './structure/structure.js';
import {
  resolveStartLevel, recordResult, nextTarget, goToLevel,
} from './ui/levelselect.js';
import { UNITS, UNITS_BY_ID } from './game/units.js';
import { recordTheatre, releaseNoteFor } from './game/campaign.js';
import { MATERIAL_PROPS, MATERIALS } from './structure/builder.js';
import { ExplosionFX } from './fx/explosion.js';
import { CraterFX } from './fx/craters.js';
import { Garrison, loadSoldierGeometry } from './game/defenders.js';
import { Battle } from './game/battle.js';
import { HUD } from './ui/hud.js';
import { TAP } from './ui/pointer.js';
import { Picker } from './core/picking.js';
import { TestMenu } from './ui/testmenu.js';
import { Flags, FLAG_SITES } from './world/flags.js';
import { cloudShadows, cloudUniforms } from './world/clouds.js';
import { Fires } from './fx/fires.js';
import { CityFire } from './game/cityfire.js';
import { SmokeScreens } from './game/smoke.js';
import { attachUnitTips, UnitCard } from './ui/inspector.js';
import { Standoff, introsEnabled, preloadCast } from './ui/standoff.js';
import { runOpening, shouldPlayOpening } from './ui/opening.js';

const statusEl = document.getElementById('load-status');
const fillEl = document.getElementById('load-fill');

function progress(pct, msg) {
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (statusEl && msg) statusEl.textContent = msg;
  // Yield twice so the browser actually paints the new state.
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function boot() {
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

  if (shouldPlayOpening()) await runOpening();

  // Ask which target, unless the player has already said or a link says for
  // them. This is the front door: without it the only level a player can
  // reach is Westminster.
  const level = await resolveStartLevel();
  console.log('[tumble] level', level.id, '·', level.name);
  const sub = document.querySelector('.load-sub');
  if (sub) sub.textContent = level.name.toUpperCase();

  await progress(6, 'starting physics');
  // The two commanders fetch while the world builds, so the stand-off never
  // opens on an empty stage.
  const castReady = introsEnabled() ? preloadCast(level.id) : Promise.resolve();
  await physicsReady;

  const canvas = document.getElementById('game-canvas');
  const engine = new Engine(canvas, quality);
  const physics = new PhysicsWorld(quality);
  const audio = new Audio();
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
  const specs = level.structures(quality);
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
      w: x1 - x0, d: z1 - z0, scenery: !!sp.scenery };
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
    const g = pads.get(key) || { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    g.x0 = Math.min(g.x0, L.x - L.w / 2); g.x1 = Math.max(g.x1, L.x + L.w / 2);
    g.z0 = Math.min(g.z0, L.z - L.d / 2); g.z1 = Math.max(g.z1, L.z + L.d / 2);
    pads.set(key, g);
  });
  // The pad is the precinct's ground, not a bald disc of dirt: painted as
  // parkland where the level's precinct is lawn or garden.
  const green = ['lawn', 'charbagh'].includes(level.precinct?.ground);
  for (const g of pads.values()) {
    const r = Math.max(g.x1 - g.x0, g.z1 - g.z0) * 0.5 + 8;
    terrain.levelPad((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2, r, 40, { park: green });
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
  const city = await loadCity(level.terrain);
  const contextGroup = buildContext(terrain, quality, {
    landmarks, precinct: level.precinct, exclude: level.contextExclude,
    // The turret's emplacement, kept clear of the forest.
    clearings: level.turret
      ? [{ x: origin.x + level.turret.x, z: origin.z + level.turret.z,
        r: 5.2 * (level.turret.scale ?? 1.4) * 4.2 }]
      : [],
    city, cityExclude: level.cityExcludeRadius,
    // What is beyond the town. A level says where it is; the generator does
    // not guess it from the terrain, because fields and forest look much the
    // same to a heightmap and nothing like each other from the air.
    hinterland: level.setting?.hinterland,
    canopy: level.setting?.canopy,
    canopyFrom: level.setting?.canopyFrom,
    downtown: level.setting?.downtown,
  });
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
    landmarks: landmarks.filter((l) => !l.scenery),
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
      contextGroup.userData.network, quality, lifeRng())
    : null;

  await progress(44, 'quarrying stone');
  const totalBlocks = specs.reduce((a, sp) => a + sp.blocks.length, 0);

  await progress(56, `setting ${totalBlocks.toLocaleString()} stones`);

  const fx = new ExplosionFX(engine.scene, quality);
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
      { groundY: sGround, origin: sOrigin, onChunkDestroyed });
    st.key = spec.key;
    st.required = !!spec.required;
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
    const manned = garrison.populateFieldWorks(fieldWorks.posts, groundY);
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
      scale: level.turret.scale })
    : null;
  const battle = new Battle({
    scene: engine.scene, camera: engine.camera, engine, physics, terrain,
    structures, primary, garrison, fx, quality, groundY, audio, level, turret,
    onEvent: (kind, data) => handleEvent(kind, data),
  });
  // So a shell landing can scatter whatever was sitting on the roofs.
  battle.life = life;

  // The real soldier from FIREBASE, flattened into one instanceable geometry.
  // Loaded after the garrison is posted rather than before it, so a slow or
  // missing asset costs the box stand-in instead of the whole level.
  loadSoldierGeometry(battle.models.loader, 'Enemy_Soldier', 1.85)
    .then((m) => {
      if (m && garrison.useSoldierModel(m.geometry, m.material)) {
        console.log('[tumble] garrison: Enemy_Soldier.glb,',
          m.geometry.attributes.position.count, 'verts per figure');
      }
    })
    .catch((e) => console.warn('[tumble] soldier model unavailable', e.message));

  battle.craters = new CraterFX(engine.scene, terrain, quality);

  // Warm the model cache in the background. Deploying a gun for the first time
  // otherwise means a Draco decode on the spot, which lands as a visible hitch
  // at exactly the moment the player is watching the thing they just bought.
  (async () => {
    for (const u of UNITS) {
      if (u.model === 'infantry') continue;
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
  battle.cityFire = new CityFire({ cityGroup: contextGroup, fx, fires: battle.fires, audio, scene: engine.scene });

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
      if (!battle.selectedUnitId) hud.hidePrompt();
      else if (UNITS_BY_ID[id].strike) hud.showPrompt(`${TAP} the target to call the strike`);
      else hud.showPrompt(`${TAP} the ground to deploy`);
    },
    onClearTarget: () => battle.clearTarget(),
    // Through `goToLevel` rather than a bare reload: the level is no longer in
    // the address bar by the time anyone can press this, so a reload would
    // land on the map.
    onRestart: () => goToLevel(level.id),
    onNextTarget: () => goToLevel(nextTarget(level.id).id),
    // The win is already banked; this just lets play carry on against
    // whatever is still standing.
    onKeepGoing: () => {
      if (battle.resumeAfterWin()) hud.feed('ASSAULT CONTINUES', 'big');
    },
    onPickTarget: async () => {
      const { showWorldMap } = await import('./ui/worldmap.js');
      const id = await showWorldMap({ current: level.id, canResume: true });
      if (id && id !== level.id) goToLevel(id);
      // Picking the level already in play, or backing out, just closes it.
    },
    onToggleSound: (on) => audio.setEnabled(on),
    onFireMode: (m) => battle.setFireMode(m),
    onSmoke: () => battle.placeSmoke(),
    onPause: (p) => { testMenu.paused = p; },
    onQuality: (id) => { if (setQuality(id)) goToLevel(level.id); },
    picker,
    qualityId: quality.id,
  });
  attachUnitTips(hud, battle);
  const unitCard = new UnitCard(battle, {
    onSell: (u) => battle.sellUnit(u),
    onFocus: (u) => rig.focus(u.pos.clone().setY(u.pos.y + 4), 110),
  });

  function handleEvent(kind, data) {
    switch (kind) {
      case 'bounty':
        hud.popup(`+$${data.amount.toLocaleString()}`, data.point, data.kind);
        break;
      case 'rank': {
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
        hud.feed(`${data.def.name} ${battle.airlift ? 'ON THE GROUND' : 'DEPLOYED'}`, 'good');
        battle.selectedUnitId = null;
        hud.hidePrompt();
        break;
      case 'queued':
        hud.feed(`${data.def.name} IN THE LIFT`, 'good');
        battle.selectedUnitId = null;
        break;
      case 'package':
        if (data.first) hud.feed('LIFT PACKAGE OPEN — PLACE MORE, THEY FLY TOGETHER', '');
        break;
      case 'packagetick':
        hud.showPrompt(`wheels up in ${data.left} s · ${data.count} in the lift`, '');
        break;
      case 'lift':
        hud.hidePrompt();
        {
          const parts = [];
          if (data.hercs) parts.push(`${data.hercs}× C-130`);
          if (data.helis) parts.push(`${data.helis}× CHINOOK`);
          hud.feed(`${parts.join(' + ') || 'LIFT'} INBOUND · ${data.count} UNIT${data.count > 1 ? 'S' : ''} · ${Math.round(data.eta)} s`, 'big');
        }
        break;
      case 'strike':
        hud.feed(`${data.def.name} INBOUND · ${Math.round(data.eta)} s`, 'big');
        hud.hidePrompt();
        battle.pulse(data.point, 0xffa040, 22, true);
        break;
      case 'flak':
        // Said before the INBOUND line, so the player reads "under fire" and
        // then watches the bomb miss, rather than wondering afterwards why it
        // did.
        hud.feed(`FLAK OVER TARGET · ${data.guns} GUN${data.guns > 1 ? 'S' : ''} — RUN SPOILED`, 'bad');
        break;
      case 'strikehit':
        hud.feed(`${data.def.name} ON TARGET — ${data.destroyed} STONES`, 'big');
        break;
      case 'needtarget':
        hud.showPrompt(`${TAP} the building to mark the drop`, 'warn');
        break;
      case 'poor':
        hud.showPrompt(`need $${data.cost.toLocaleString()}`, 'warn');
        break;
      case 'badplace':
        hud.showPrompt(data.reason, 'warn');
        break;
      case 'unitlost':
        hud.feed(`${data.def.name} LOST`, 'bad');
        break;
      case 'crushed':
        if (data > 2) hud.feed(`${data} DEFENDERS CRUSHED`, 'big');
        break;
      case 'charge':
        hud.feed(`DEMOLITION CHARGE — ${data.destroyed} STONES`, 'big');
        break;
      case 'win':
        // Let the collapse actually finish before covering it with a panel —
        // the tower coming down is the thing the player came for.
        hud.feed('STRUCTURE FAILING', 'big');
        rig.focus(new THREE.Vector3(0, groundY + level.camera.height * 0.7, 0),
          level.camera.distance * 1.3);
        setTimeout(() => {
          const sum = battle.summary();
          recordResult(level.id, true, sum);
          recordTheatre(level.id, true, sum);
          hud.nextTargetLabel = nextTarget(level.id).target;
          hud.showEnd('win', sum, { release: releaseNoteFor(level.id) });
        }, 7000);
        break;
      case 'flattened':
        hud.feed('NOTHING LEFT STANDING', 'big');
        setTimeout(() => {
          const sum = battle.summary();
          recordResult(level.id, true, sum);
          recordTheatre(level.id, true, sum);
          hud.nextTargetLabel = nextTarget(level.id).target;
          hud.showEnd('win', sum, {
            title: 'Flattened',
            sub: `${level.subtitle} · nothing left standing`,
            release: releaseNoteFor(level.id),
          });
        }, 3000);
        break;
      case 'lose':
        setTimeout(() => {
          recordResult(level.id, false, data);
          recordTheatre(level.id, false, data);
          hud.showEnd('lose', data);
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
      engine.addShake(0.8);
      hud.feed('STRUCTURE COLLAPSING', 'big');
      // Half speed for two seconds, eased back. Long enough to read what is
      // happening, short enough not to feel like a cutscene.
      testMenu.dramaticPause(2.0, 0.45);
    };
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

  canvas.addEventListener('pointerdown', (e) => {
    livePointers.add(e.pointerId);
    hud.ripple(e.clientX, e.clientY, battle.selectedUnitId ? 'deploy' : 'aim');
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!livePointers.delete(e.pointerId)) return;
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
      // Tapping bare ground with nothing selected still confirms the tap, so
      // it is obvious the game registered it and where.
      battle.pulse(hit.point, 0x7e8b9b, 9);
    }
  });

  // Hover preview for the deployment footprint (desktop only).
  canvas.addEventListener('pointermove', (e) => {
    if (!battle.selectedUnitId || e.pointerType === 'touch'
        || UNITS_BY_ID[battle.selectedUnitId].strike) {
      battle.ghost.visible = false;
      battle.rangeRing.visible = false;
      return;
    }
    const hit = pick(e.clientX, e.clientY);
    if (!hit || (hit.kind !== 'ground' && hit.kind !== 'roof')) {
      battle.ghost.visible = false;
      battle.rangeRing.visible = false;
      return;
    }
    const ok = battle.validPlacement(hit.point, UNITS_BY_ID[battle.selectedUnitId]).ok;
    battle.ghost.position.copy(hit.point).setY(hit.point.y + 0.25);
    battle.ghost.material.color.setHex(ok ? 0x58a6ff : 0xe8604c);
    battle.ghost.visible = true;
    battle.showRange(hit.point, UNITS_BY_ID[battle.selectedUnitId]);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      battle.selectedUnitId = null;
      hud.hidePrompt();
      battle.ghost.visible = false;
      battle.rangeRing.visible = false;
    }
    // Number keys pick the corresponding slot in the build bar. The bar runs
    // to eleven cards and prints the number on each one, so 0 and - carry the
    // last two rather than leaving the air wing — the two the badges promise
    // and the only ones you cannot reach any other way from the keyboard —
    // pickable by mouse alone.
    let n = parseInt(e.key, 10);
    if (e.key === '0') n = 10;
    else if (e.key === '-') n = 11;
    if (n >= 1 && n <= 11) {
      const id = [...hud.cards.keys()][n - 1];
      if (id && battle.selectUnit(id)) {
        hud.showPrompt(UNITS_BY_ID[id].strike
          ? `${TAP} the target to call the strike` : `${TAP} the ground to deploy`);
      }
    }
  });

  const firstPrompt = () => {
    hud.showPrompt(`${TAP} the tower to designate a target`);
    setTimeout(() => hud.hidePrompt(), 5200);
  };
  const uiEl = document.getElementById('ui');
  let standoff = null;
  if (introsEnabled()) {
    await castReady;
    // The HUD stays out of the way until the two of them have had their say.
    uiEl.classList.add('standoff');
    standoff = new Standoff({
      level, rig, groundY,
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

  document.getElementById('loading').style.display = 'none';
  uiEl.hidden = false;
  if (!standoff) firstPrompt();

  const governor = new AdaptiveGovernor(quality);
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

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dtMs = now - last;
    const rawDt = Math.min(dtMs / 1000, 0.05);
    const dt = testMenu.paused ? 0 : rawDt * testMenu.timeScale;
    last = now;

    const pStart = performance.now();
    physics.setBudget(governor.update(dtMs));
    physics.step(dt);
    physics.recycleSettled(quality.settleFrames);
    physics.auditFrozen();
    physics.cullRunaways(terrain.span * 1.6);
    for (const s of structures) { s.solveStability(); s.maintainIslands(dt); s.tickLean(dt); }
    physMs = physMs * 0.9 + (performance.now() - pStart) * 0.1;

    for (const s of structures) s.syncTransforms();

    if (life) life.update(rawDt);
    audio.setListener(engine.camera);
    battle.tracerFX.setCamera(engine.camera);
    battle.update(dt);
    // Anything the last frame uncovered goes off now, one frame late and
    // safely outside the pass that exposed it.
    while (pendingCharges.length) battle.demolitionCharge(pendingCharges.pop());
    fx.update(dt);
    hud.update(rawDt);
    unitCard.update();
    testMenu.update(rawDt);
    flags.update(rawDt);
    if (standoff) standoff.update();

    water.material.uniforms.uTime.value = now * 0.001;
    if (sky.material.uniforms) sky.material.uniforms.uTime.value = now * 0.001;
    cloudUniforms.uCloudTime.value = now * 0.001;

    const shake = engine.updateShake(rawDt, rig.distance);
    rig.update(rawDt, shake);
    engine.sun.target.position.set(rig.target.x, rig.target.y, rig.target.z);
    engine.sun.position.set(
      rig.target.x + SUN_OFFSET.x, rig.target.y + SUN_OFFSET.y, rig.target.z + SUN_OFFSET.z);
    engine.render();

    frames++; fpsAcc += dtMs;
    if (fpsAcc > 420) { fps = Math.round(1000 / (fpsAcc / frames)); frames = 0; fpsAcc = 0; }
    if (perfEl) {
      perfEl.textContent =
        `${fps} fps · phys ${physMs.toFixed(1)}ms · ${physics.awakeCount} awake / ` +
        `${physics.dynamicSet.size} sim · ` +
        `${structures.reduce((a, st) => a + st.destroyedCount, 0)} stones gone · ` +
        `${structures.reduce((a, st) => a + st.islands.size, 0)} sections · ${quality.id}`;
    }
  }
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
}

boot().catch((err) => {
  console.error(err);
  if (statusEl) statusEl.textContent = `failed: ${err.message}`;
});
