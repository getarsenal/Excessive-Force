import * as THREE from 'three';
import { detectQuality, setQuality, AdaptiveGovernor } from './core/quality.js';
import { initPhysics, PhysicsWorld } from './core/physics.js';
import { Engine, CameraRig, SUN_OFFSET } from './core/engine.js';
import { Audio } from './core/audio.js';
import { loadTerrain } from './world/terrain.js';
import { createSky, createWater } from './world/sky.js';
import { buildContext } from './world/context.js';
import { Life } from './world/life.js';
import { loadCity, buildCity } from './world/city.js';
import { Structure } from './structure/structure.js';
import {
  resolveStartLevel, showLevelSelect, recordResult, nextTarget, goToLevel,
} from './ui/levelselect.js';
import { UNITS, UNITS_BY_ID } from './game/units.js';
import { MATERIAL_PROPS, MATERIALS } from './structure/builder.js';
import { ExplosionFX } from './fx/explosion.js';
import { CraterFX } from './fx/craters.js';
import { Garrison, loadSoldierGeometry } from './game/defenders.js';
import { Battle } from './game/battle.js';
import { HUD } from './ui/hud.js';
import { Picker } from './core/picking.js';
import { TestMenu } from './ui/testmenu.js';
import { Flags, FLAG_SITES } from './world/flags.js';
import { cloudShadows, cloudUniforms } from './world/clouds.js';
import { Fires } from './fx/fires.js';
import { SmokeScreens } from './game/smoke.js';
import { attachUnitTips, UnitCard } from './ui/inspector.js';
import { Standoff, introsEnabled, preloadCast } from './ui/standoff.js';

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
  await initPhysics();

  const canvas = document.getElementById('game-canvas');
  const engine = new Engine(canvas, quality);
  const physics = new PhysicsWorld(quality);
  const audio = new Audio();
  // Browsers won't start an AudioContext without a gesture, so the first tap
  // on the canvas is what brings sound up.
  const unlockAudio = () => { audio.unlock(); };
  canvas.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

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
      const r = Math.max(b.hx, b.hz);
      if (b.x - r < x0) x0 = b.x - r;
      if (b.x + r > x1) x1 = b.x + r;
      if (b.z - r < z0) z0 = b.z - r;
      if (b.z + r > z1) z1 = b.z + r;
    }
    return { x: (x0 + x1) / 2 + off.x, z: (z0 + z1) / 2 + off.z,
      w: x1 - x0, d: z1 - z0 };
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
  let contextGroup = null;
  const city = await loadCity(level.terrain);
  const cityGroup = city
    ? buildCity(city, terrain, quality, { excludeRadius: level.cityExcludeRadius })
    : null;
  if (cityGroup) {
    engine.scene.add(cityGroup);
    // Report the file's own provenance rather than assuming it is real data —
    // a test fixture must never be mistaken for OpenStreetMap.
    console.log(`[tumble] city: ${cityGroup.userData.built} of `
      + `${cityGroup.userData.available} buildings — ${city.source}`);
  } else {
    contextGroup = buildContext(terrain, quality, {
      landmarks, precinct: level.precinct, exclude: level.contextExclude,
    });
    engine.scene.add(contextGroup);
    console.log(`[tumble] city: hand-placed approximation, `
      + `${contextGroup.userData.plots.length} buildings, `
      + `${contextGroup.userData.roofs.length} deployable roofs`
      + ' (run tools/bake_buildings.py for real footprints)');
  }

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
  const life = (cityGroup || contextGroup)?.userData?.network
    ? new Life(engine.scene, terrain,
      (cityGroup || contextGroup).userData.network, quality, lifeRng())
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

  const rig = new CameraRig(engine.camera, canvas, {
    tx: 0, ty: groundY + level.camera.height, tz: 0,
    distance: level.camera.distance, yaw: level.camera.yaw, pitch: level.camera.pitch,
  });
  rig.groundHeight = (x, z) => terrain.heightAt(x, z);

  await progress(88, 'ranging guns');

  let hud;
  const picker = new Picker(canvas, engine.camera, terrain);
  const battle = new Battle({
    scene: engine.scene, camera: engine.camera, engine, physics, terrain,
    structures, primary, garrison, fx, quality, groundY, audio, level,
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
  battle.cityPlots = (cityGroup || contextGroup)?.userData?.plots || null;

  // Smoke the garrison cannot see through, and fires that burn on after a
  // heavy hit.
  battle.smokes = new SmokeScreens(fx);
  garrison.smokes = battle.smokes;
  battle.fires = new Fires(fx, quality);

  // Flags on the landmarks, each standing on a stone and going with it.
  const flags = new Flags(engine.scene, quality);
  flags.raise(FLAG_SITES[level.id] || [], sites && Object.fromEntries(structures.map((st) => [st.key, st])));

  // Cloud shadows drifting over the ground and the town.
  cloudShadows(terrain.mesh.material, 0.30);
  (cityGroup || contextGroup)?.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.userData.clouded) {
      o.material.userData.clouded = true;
      cloudShadows(o.material, 0.26);
    }
  });

  hud = new HUD(battle, {
    onSelect: (id) => {
      battle.selectUnit(id);
      if (!battle.selectedUnitId) hud.hidePrompt();
      else if (UNITS_BY_ID[id].strike) hud.showPrompt('tap the target to call the strike');
      else hud.showPrompt('tap the ground to deploy');
    },
    onClearTarget: () => battle.clearTarget(),
    onRestart: () => window.location.reload(),
    onNextTarget: () => goToLevel(nextTarget(level.id).id),
    // The win is already banked; this just lets play carry on against
    // whatever is still standing.
    onKeepGoing: () => {
      if (battle.resumeAfterWin()) hud.feed('ASSAULT CONTINUES', 'big');
    },
    onPickTarget: async () => {
      const id = await showLevelSelect({ current: level.id, canResume: true });
      if (id && id !== level.id) goToLevel(id);
      // Picking the level already in play, or backing out, just closes it.
    },
    onToggleSound: (on) => audio.setEnabled(on),
    onFireMode: (m) => battle.setFireMode(m),
    onSmoke: () => battle.placeSmoke(),
    onPause: (p) => { testMenu.paused = p; },
    onQuality: (id) => { if (setQuality(id)) window.location.reload(); },
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
        hud.feed(`${data.def.name} DEPLOYED`, 'good');
        battle.selectedUnitId = null;
        hud.hidePrompt();
        break;
      case 'strike':
        hud.feed(`${data.def.name} INBOUND · ${Math.round(data.eta)} s`, 'big');
        hud.hidePrompt();
        battle.pulse(data.point, 0xffa040, 22, true);
        break;
      case 'strikehit':
        hud.feed(`${data.def.name} ON TARGET — ${data.destroyed} STONES`, 'big');
        break;
      case 'needtarget':
        hud.showPrompt('tap the building to mark the drop', 'warn');
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
          hud.nextTargetLabel = nextTarget(level.id).target;
          hud.showEnd('win', sum);
        }, 7000);
        break;
      case 'flattened':
        hud.feed('NOTHING LEFT STANDING', 'big');
        setTimeout(() => {
          const sum = battle.summary();
          recordResult(level.id, true, sum);
          hud.nextTargetLabel = nextTarget(level.id).target;
          hud.showEnd('win', sum, { title: 'Flattened', sub: `${level.subtitle} · nothing left standing` });
        }, 3000);
        break;
      case 'lose':
        setTimeout(() => {
          recordResult(level.id, false, data);
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

  physics.onImpact((a, b, force) => {
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
    picker.pick(x, y, structures, cityGroup || contextGroup, garrison, own ? battle.units : null);

  // Every touch gets an immediate screen-space acknowledgement, before any of
  // the work below decides what the touch meant. Feedback that waits on a
  // decision is feedback that arrives too late to be reassuring.
  canvas.addEventListener('pointerdown', (e) => {
    hud.ripple(e.clientX, e.clientY, battle.selectedUnitId ? 'deploy' : 'aim');
  });

  canvas.addEventListener('pointerup', (e) => {
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
    // Number keys pick the corresponding slot in the build bar.
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const id = [...hud.cards.keys()][n - 1];
      if (id && battle.selectUnit(id)) {
        hud.showPrompt(UNITS_BY_ID[id].strike ? 'tap the target to call the strike' : 'tap the ground to deploy');
      }
    }
  });

  const firstPrompt = () => {
    hud.showPrompt('tap the tower to designate a target');
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
    cityGroup: cityGroup || contextGroup, hud, picker, fx, garrison, governor,
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
    cityGroup: cityGroup || contextGroup,
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
