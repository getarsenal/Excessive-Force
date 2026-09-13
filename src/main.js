import * as THREE from 'three';
import { detectQuality, AdaptiveGovernor } from './core/quality.js';
import { initPhysics, PhysicsWorld } from './core/physics.js';
import { Engine, CameraRig } from './core/engine.js';
import { Audio } from './core/audio.js';
import { loadTerrain } from './world/terrain.js';
import { createSky, createWater } from './world/sky.js';
import { buildContext } from './world/context.js';
import { loadCity, buildCity } from './world/city.js';
import { Structure } from './structure/structure.js';
import { resolveLevel } from './game/levels.js';
import { MATERIAL_PROPS } from './structure/builder.js';
import { ExplosionFX } from './fx/explosion.js';
import { Garrison } from './game/defenders.js';
import { Battle } from './game/battle.js';
import { HUD } from './ui/hud.js';

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

  const level = resolveLevel();
  console.log('[tumble] level', level.id, '·', level.name);
  const sub = document.querySelector('.load-sub');
  if (sub) sub.textContent = level.name.toUpperCase();

  await progress(6, 'starting physics');
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
  engine.scene.add(terrain.buildMesh());
  terrain.addToPhysics(physics);

  const sunDir = engine.sun.position.clone().normalize();
  engine.scene.add(createSky(sunDir));
  const water = createWater(terrain.span, terrain.waterLevel, sunDir);
  engine.scene.add(water);

  const groundY = terrain.heightAt(0, 0);
  const origin = new THREE.Vector3(0, groundY, 0);

  await progress(30, 'building london');
  // Real OpenStreetMap footprints when they've been baked; otherwise the
  // hand-placed approximation, so the level still reads as a city either way.
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
    engine.scene.add(buildContext(terrain, quality));
    console.log('[tumble] city: hand-placed approximation'
      + ' (run tools/bake_buildings.py for real footprints)');
  }

  await progress(44, 'quarrying stone');
  const specs = level.structures(quality);
  const totalBlocks = specs.reduce((a, sp) => a + sp.blocks.length, 0);

  await progress(56, `setting ${totalBlocks.toLocaleString()} stones`);

  const fx = new ExplosionFX(engine.scene, quality);
  const dustColour = new THREE.Color();
  const onChunkDestroyed = (x, y, z, size, mat) => {
    dustColour.setHex(MATERIAL_PROPS[mat].color);
    fx.stoneBurst(x, y, z, size, dustColour);
  };

  const t0 = performance.now();
  const structures = [];
  let primary = null;
  for (const spec of specs) {
    const st = new Structure(physics, spec.blocks, { groundY, origin, onChunkDestroyed });
    st.key = spec.key;
    engine.scene.add(st.group);
    structures.push(st);
    if (spec.primary) primary = st;
    if (spec.primary && level.scoreTags) st.setScoreTags(level.scoreTags);
  }
  primary = primary || structures[0];
  console.log('[tumble] built', structures.reduce((a, st) => a + st.count, 0),
    'stones in', (performance.now() - t0).toFixed(0), 'ms');

  await progress(74, 'posting the garrison');
  const garrison = new Garrison(engine.scene, structures, quality);
  level.garrison(garrison, origin, groundY);

  const rig = new CameraRig(engine.camera, canvas, {
    tx: 0, ty: groundY + level.camera.height, tz: 0,
    distance: level.camera.distance, yaw: level.camera.yaw, pitch: level.camera.pitch,
  });
  rig.groundHeight = (x, z) => terrain.heightAt(x, z);

  await progress(88, 'ranging guns');

  let hud;
  const battle = new Battle({
    scene: engine.scene, camera: engine.camera, engine, physics, terrain,
    structures, primary, garrison, fx, quality, groundY, audio, level,
    onEvent: (kind, data) => handleEvent(kind, data),
  });

  hud = new HUD(battle, {
    onSelect: (id) => {
      battle.selectUnit(id);
      if (battle.selectedUnitId) hud.showPrompt('tap the ground to deploy');
      else hud.hidePrompt();
    },
    onClearTarget: () => battle.clearTarget(),
    onRestart: () => window.location.reload(),
    onToggleSound: (on) => audio.setEnabled(on),
  });

  function handleEvent(kind, data) {
    switch (kind) {
      case 'deployed':
        hud.feed(`${data.def.name} DEPLOYED`, 'good');
        battle.selectedUnitId = null;
        hud.hidePrompt();
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
      case 'win':
        // Let the collapse actually finish before covering it with a panel —
        // the tower coming down is the thing the player came for.
        hud.feed('STRUCTURE FAILING', 'big');
        rig.focus(new THREE.Vector3(0, groundY + level.camera.height * 0.7, 0),
          level.camera.distance * 1.3);
        setTimeout(() => hud.showEnd('win', battle.summary()), 7000);
        break;
      case 'lose':
        setTimeout(() => hud.showEnd('lose', data), 1500);
        break;
      default: break;
    }
  }

  // Welded sections fragment when they land hard enough.
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
  // deploy the selected unit.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let structureMeshes = structures.flatMap((s) => s.meshes.map((m) => m.mesh));

  function pick(clientX, clientY) {
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, engine.camera);

    const onStructure = raycaster.intersectObjects(structureMeshes, false);
    if (onStructure.length) {
      const hit = onStructure[0];
      const entry = structures.find((s) => s.meshes.some((m) => m.mesh === hit.object));
      let label = null;
      if (entry) {
        const meshEntry = entry.meshes.find((m) => m.mesh === hit.object);
        const chunk = meshEntry?.list[hit.instanceId];
        if (chunk !== undefined) label = entry.tagOf[chunk];
      }
      return { kind: 'structure', point: hit.point, label };
    }

    const groundHit = raycastTerrain(raycaster.ray);
    if (groundHit) return { kind: 'ground', point: groundHit };
    return null;
  }

  /** March the ray against the heightfield; cheaper and more robust than
   *  intersecting the terrain mesh, which has 260k triangles. */
  function raycastTerrain(ray) {
    const o = ray.origin, d = ray.direction;
    let t = 0;
    let prevDiff = o.y - terrain.heightAt(o.x, o.z);
    const maxT = 4000;
    const step = 2.5;
    while (t < maxT) {
      t += step + t * 0.012; // coarser strides further out
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const diff = y - terrain.heightAt(x, z);
      if (diff <= 0 && prevDiff > 0) {
        // Bisect once for a clean surface point.
        let lo = t - step, hi = t;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          const mx = o.x + d.x * mid, my = o.y + d.y * mid, mz = o.z + d.z * mid;
          if (my - terrain.heightAt(mx, mz) > 0) lo = mid; else hi = mid;
        }
        const ft = (lo + hi) / 2;
        return new THREE.Vector3(o.x + d.x * ft, 0, o.z + d.z * ft)
          .setY(terrain.heightAt(o.x + d.x * ft, o.z + d.z * ft));
      }
      prevDiff = diff;
    }
    return null;
  }

  canvas.addEventListener('pointerup', (e) => {
    if (rig.wasDrag) return;
    if (battle.state !== 'playing') return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit) return;

    if (battle.selectedUnitId) {
      if (hit.kind === 'ground') {
        battle.deploy(battle.selectedUnitId, hit.point);
      } else {
        hud.showPrompt('deploy on open ground', 'warn');
      }
      return;
    }
    if (hit.kind === 'structure') {
      battle.setTarget(hit.point, hit.label);
      hud.feed(`TARGET: ${(hit.label || 'structure').toUpperCase()}`, '');
    }
  });

  // Hover preview for the deployment footprint (desktop only).
  canvas.addEventListener('pointermove', (e) => {
    if (!battle.selectedUnitId || e.pointerType === 'touch') {
      battle.ghost.visible = false;
      return;
    }
    const hit = pick(e.clientX, e.clientY);
    if (!hit || hit.kind !== 'ground') { battle.ghost.visible = false; return; }
    const ok = battle.validPlacement(hit.point).ok;
    battle.ghost.position.copy(hit.point).setY(hit.point.y + 0.25);
    battle.ghost.material.color.setHex(ok ? 0x58a6ff : 0xe8604c);
    battle.ghost.visible = true;
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { battle.selectedUnitId = null; hud.hidePrompt(); battle.ghost.visible = false; }
    // Number keys pick the corresponding slot in the build bar.
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const id = [...hud.cards.keys()][n - 1];
      if (id && battle.selectUnit(id)) hud.showPrompt('tap the ground to deploy');
    }
  });

  document.getElementById('loading').style.display = 'none';
  document.getElementById('ui').hidden = false;
  hud.showPrompt('tap the tower to designate a target');
  setTimeout(() => hud.hidePrompt(), 5200);

  const governor = new AdaptiveGovernor(quality);
  const perfEl = document.getElementById('perf');
  let last = performance.now();
  let frames = 0, fpsAcc = 0, fps = 0, physMs = 0;

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dtMs = now - last;
    const dt = Math.min(dtMs / 1000, 0.05);
    last = now;

    const pStart = performance.now();
    physics.setBudget(governor.update(dtMs));
    physics.step(dt);
    physics.recycleSettled(quality.settleFrames);
    for (const s of structures) { s.solveStability(); s.maintainIslands(); }
    physMs = physMs * 0.9 + (performance.now() - pStart) * 0.1;

    for (const s of structures) s.syncTransforms();

    audio.setListener(engine.camera);
    battle.update(dt);
    fx.update(dt);
    hud.update(dt);

    water.material.uniforms.uTime.value = now * 0.001;

    const shake = engine.updateShake(dt);
    rig.update(dt, shake);
    engine.sun.target.position.set(rig.target.x, rig.target.y, rig.target.z);
    engine.sun.position.set(rig.target.x - 320, rig.target.y + 260, rig.target.z + 190);
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
    engine, physics, terrain, rig, battle, garrison, fx, quality, audio, level,
    structures, tower: primary, primary,
  });

  /**
   * Step the simulation without rendering.
   *
   * Automated tests run under a software rasteriser at a couple of frames a
   * second, so wall-clock waiting advances almost no game time and nothing with
   * a setup timer ever fires. This runs the same update path the frame loop
   * does, minus the draw, so a test can cover a two-minute engagement in a
   * second. It is a test hook, not a game speed control.
   */
  window.__fastForward = (seconds, step = 1 / 60) => {
    const steps = Math.round(seconds / step);
    for (let i = 0; i < steps; i++) {
      physics.step(step);
      physics.recycleSettled(quality.settleFrames);
      for (const s of structures) { s.solveStability(); s.maintainIslands(); s.syncTransforms(); }
      battle.update(step);
      fx.update(step);
    }
    return steps;
  };
}

boot().catch((err) => {
  console.error(err);
  if (statusEl) statusEl.textContent = `failed: ${err.message}`;
});
