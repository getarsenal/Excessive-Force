import * as THREE from 'three';
import { UNITS, UNITS_BY_ID } from '../game/units.js';
import { DEFENDER_TYPES } from '../game/defenders.js';
import { LEVELS } from '../game/levels.js';
import { lineOfSight } from '../structure/occupancy.js';
import { solveArc } from '../game/projectiles.js';
import { junctionRing, padRadius } from '../world/streets.js';

/**
 * The test menu.
 *
 * Every number in this game is tuned, and a tuned number you cannot see or
 * change is a number you cannot tune. So this exposes the lot: the economy, the
 * arsenal, the garrison, the solver, the renderer and the camera, live, with no
 * rebuild and no reload — plus a self-test suite that asserts the things that
 * have actually broken before, so a regression announces itself instead of
 * waiting to be noticed in play.
 *
 * Two rules keep it honest as the game grows:
 *
 *   - Controls *read* from live state every time the panel refreshes. Nothing
 *     here keeps its own copy of a value, so the panel can never disagree with
 *     the simulation.
 *   - New systems add a section here in the same commit. The suite at the
 *     bottom is the contract: if a feature is not asserted, it is not finished.
 *
 * Opens with the TEST button, the ` (backquote) key, or `?test=1`.
 */

export class TestMenu {
  constructor(ctx) {
    this.ctx = ctx;            // { battle, engine, physics, terrain, rig, ... }
    this.open = false;
    this.sections = new Map();
    this._rows = [];
    this._lastRefresh = 0;
    this.timeScale = 1;
    this.paused = false;

    this._buildDom();
    this._buildSections();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.toggle();
      }
    });

    let auto = false;
    try { auto = new URLSearchParams(location.search).get('test') === '1'; } catch { /* no url */ }
    if (auto) this.toggle();
  }

  // ───────────────────────────────────────────────────────────────── shell ──

  _buildDom() {
    const btn = document.createElement('button');
    btn.id = 'test-btn';
    btn.textContent = 'TEST';
    btn.addEventListener('click', () => this.toggle());
    document.getElementById('ui').appendChild(btn);
    this.btn = btn;

    const panel = document.createElement('div');
    panel.id = 'testmenu';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="tm-head">
        <span class="tm-title">TEST &amp; TUNING</span>
        <span class="tm-hint">\`</span>
        <button class="tm-close">×</button>
      </div>
      <div class="tm-body"></div>`;
    panel.querySelector('.tm-close').addEventListener('click', () => this.toggle());
    // The panel is an overlay on a canvas that captures pointer gestures; stop
    // drags inside it reaching the camera rig.
    for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'wheel']) {
      panel.addEventListener(ev, (e) => e.stopPropagation());
    }
    document.getElementById('ui').appendChild(panel);
    this.panel = panel;
    this.body = panel.querySelector('.tm-body');
  }

  toggle(force) {
    this.open = force === undefined ? !this.open : force;
    this.panel.hidden = !this.open;
    this.btn.classList.toggle('on', this.open);
    if (this.open) this.refresh();
  }

  // ─────────────────────────────────────────────────────── control factory ──

  _section(name, open = false) {
    const wrap = document.createElement('div');
    wrap.className = `tm-sec${open ? ' open' : ''}`;
    wrap.innerHTML = `<div class="tm-sec-head">${name}</div><div class="tm-sec-body"></div>`;
    wrap.querySelector('.tm-sec-head').addEventListener('click', () => {
      wrap.classList.toggle('open');
    });
    this.body.appendChild(wrap);
    const bodyEl = wrap.querySelector('.tm-sec-body');
    this.sections.set(name, bodyEl);
    return bodyEl;
  }

  /** A live-updating read-only row. `get` is called on every refresh. */
  _stat(parent, label, get) {
    const row = document.createElement('div');
    row.className = 'tm-row tm-stat';
    row.innerHTML = `<span>${label}</span><b></b>`;
    parent.appendChild(row);
    const val = row.querySelector('b');
    this._rows.push(() => {
      const v = get();
      const s = typeof v === 'number' ? fmt(v) : String(v);
      if (val.textContent !== s) val.textContent = s;
    });
    return row;
  }

  _slider(parent, label, { min, max, step = 0.01, get, set, fmt: f }) {
    const row = document.createElement('div');
    row.className = 'tm-row tm-slider';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><b></b>`;
    parent.appendChild(row);
    const input = row.querySelector('input');
    const val = row.querySelector('b');
    const show = () => { val.textContent = (f || fmt)(Number(input.value)); };
    input.addEventListener('input', () => { set(Number(input.value)); show(); });
    this._rows.push(() => {
      if (document.activeElement === input) return;   // don't fight the user
      const v = get();
      if (Number(input.value) !== v) input.value = String(v);
      show();
    });
    return row;
  }

  _toggle(parent, label, { get, set }) {
    const row = document.createElement('div');
    row.className = 'tm-row tm-toggle';
    row.innerHTML = `<span>${label}</span><button></button>`;
    parent.appendChild(row);
    const b = row.querySelector('button');
    b.addEventListener('click', () => { set(!get()); this.refresh(); });
    this._rows.push(() => {
      const on = !!get();
      b.textContent = on ? 'ON' : 'OFF';
      b.classList.toggle('on', on);
    });
    return row;
  }

  _buttons(parent, label, pairs) {
    const row = document.createElement('div');
    row.className = 'tm-row tm-buttons';
    row.innerHTML = label ? `<span>${label}</span>` : '';
    const holder = document.createElement('div');
    holder.className = 'tm-btns';
    for (const [text, fn] of pairs) {
      const b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', () => { fn(); this.refresh(); });
      holder.appendChild(b);
    }
    row.appendChild(holder);
    parent.appendChild(row);
    return row;
  }

  _select(parent, label, { options, get, set }) {
    const row = document.createElement('div');
    row.className = 'tm-row tm-select';
    row.innerHTML = `<span>${label}</span><select></select>`;
    parent.appendChild(row);
    const sel = row.querySelector('select');
    for (const [value, text] of options) {
      const o = document.createElement('option');
      o.value = value; o.textContent = text;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => set(sel.value));
    this._rows.push(() => { if (document.activeElement !== sel) sel.value = String(get()); });
    return { row, sel };
  }

  _note(parent, text) {
    const d = document.createElement('div');
    d.className = 'tm-note';
    d.textContent = text;
    parent.appendChild(d);
    return d;
  }

  // ────────────────────────────────────────────────────────────── sections ──

  _buildSections() {
    const c = this.ctx;
    const b = c.battle;

    // ── Diagnostics ────────────────────────────────────────────────────────
    const diag = this._section('DIAGNOSTICS', true);
    this._stat(diag, 'FPS', () => c.stats().fps);
    this._stat(diag, 'Physics ms', () => c.stats().physMs);
    this._stat(diag, 'Awake bodies', () => c.physics.awakeCount);
    this._stat(diag, 'Simulated bodies', () => c.physics.dynamicSet.size);
    this._stat(diag, 'Body budget', () => c.physics.activeBudget);
    this._stat(diag, 'Stones destroyed', () => sum(c.structures, (s) => s.destroyedCount));
    this._stat(diag, 'Loose sections', () => sum(c.structures, (s) => s.islands.size));
    this._stat(diag, 'Out of plumb', () => `${b.primary.leanDegrees.toFixed(2)}°`);
    this._stat(diag, 'Peak bearing stress',
      () => `${((b.primary.lastStressRatio || 0) * 100).toFixed(0)}% of capacity`);
    this._stat(diag, 'Worst slice cut to',
      () => `${((b.primary.lastCutFrac ?? 1) * 100).toFixed(0)}% bearing`);
    this._stat(diag, 'Debris culled', () => c.physics.runawaysCulled || 0);
    this._stat(diag, 'Shells in flight', () => b.projectiles.inFlight);
    this._stat(diag, 'Live tracers', () => b.tracerFX.tracers.length);
    this._stat(diag, 'Rounds fired at you', () => b.tracerFX.fired);
    this._stat(diag, 'LOS checks / blocked',
      () => `${b.garrison.losChecks} / ${b.garrison.losBlocked}`);
    this._stat(diag, 'Mortar bombs fired', () => b.garrison.mortarsFired);
    this._stat(diag, 'Solid LOS cells',
      () => sum(c.structures, (s) => s.occupancy.solidCells));
    this._stat(diag, 'Water quads', () => c.water.userData.quads ?? 0);
    this._stat(diag, 'Quality tier', () => c.quality.id);

    // ── Self tests ─────────────────────────────────────────────────────────
    const tests = this._section('SELF TESTS', true);
    this._buttons(tests, null, [
      ['RUN ALL', () => this.runTests()],
      ['COPY STATE', () => this.copyState()],
    ]);
    this.testOut = document.createElement('div');
    this.testOut.className = 'tm-tests';
    tests.appendChild(this.testOut);
    this._note(tests, 'Assertions cover picking, line of sight, firing, '
      + 'stability, the economy and the render path.');

    // ── Economy ────────────────────────────────────────────────────────────
    const eco = this._section('ECONOMY');
    this._stat(eco, 'Funds', () => Math.floor(b.money));
    this._stat(eco, 'Income /s', () => b.income);
    this._stat(eco, 'Progress', () => `${(b.progress * 100).toFixed(2)}%`);
    this._stat(eco, 'Spent', () => Math.round(b.spent));
    this._stat(eco, 'Masonry down (t)', () => Math.round(b.score));
    this._buttons(eco, 'Grant', [
      ['+$1k', () => { b.money += 1000; }],
      ['+$10k', () => { b.money += 10000; }],
      ['+$100k', () => { b.money += 100000; }],
      ['ZERO', () => { b.money = 0; }],
    ]);
    this._toggle(eco, 'Free build (costs nothing)', {
      get: () => b.freeBuild === true,
      set: (v) => { b.freeBuild = v; },
    });
    this._toggle(eco, 'Unlock every unit', {
      get: () => b.unlockAll === true,
      set: (v) => { b.unlockAll = v; },
    });
    this._slider(eco, 'Income multiplier', {
      min: 0, max: 20, step: 0.5,
      get: () => b.incomeScale ?? 1, set: (v) => { b.incomeScale = v; },
    });

    // ── Player units ───────────────────────────────────────────────────────
    const units = this._section('PLAYER UNITS');
    this._stat(units, 'Alive', () => b.units.filter((u) => u.alive).length);
    this._stat(units, 'Lost', () => b.unitsLost);
    this._stat(units, 'Rounds fired', () => b.shotsFired);
    this._stat(units, 'Guns engaging', () => b.gunsOnTarget);
    this.spawnSel = this._select(units, 'Spawn', {
      options: UNITS.map((u) => [u.id, `${u.name} ($${u.cost})`]),
      get: () => this._spawnId || UNITS[0].id,
      set: (v) => { this._spawnId = v; },
    });
    this._buttons(units, null, [
      ['SPAWN 1', () => this.spawnRing(1)],
      ['SPAWN 4', () => this.spawnRing(4)],
      ['SPAWN 8', () => this.spawnRing(8)],
      ['KILL ALL', () => { for (const u of b.units) if (u.alive) u.health = -1; }],
    ]);
    this._toggle(units, 'Auto-engage without a designated target', {
      get: () => b.autoEngage, set: (v) => { b.autoEngage = v; },
    });
    this._slider(units, 'Reload scale', {
      min: 0.05, max: 4, step: 0.05,
      get: () => b.reloadScale ?? 1, set: (v) => { b.reloadScale = v; },
    });
    this._slider(units, 'Dispersion scale', {
      min: 0, max: 4, step: 0.05,
      get: () => b.dispersionScale ?? 1, set: (v) => { b.dispersionScale = v; },
    });
    this._slider(units, 'Warhead power scale', {
      min: 0.1, max: 10, step: 0.1,
      get: () => b.powerScale ?? 1, set: (v) => { b.powerScale = v; },
    });
    this._toggle(units, 'Invulnerable', {
      get: () => b.invulnerable === true, set: (v) => { b.invulnerable = v; },
    });

    // ── Targeting ──────────────────────────────────────────────────────────
    const tgt = this._section('TARGETING');
    this._stat(tgt, 'Designated', () => (b.target
      ? `${b.targetLabel || '—'} @ ${b.target.y.toFixed(1)} m` : 'free fire'));
    this._buttons(tgt, 'Aim at', [
      ['BASE', () => this.aimAt(0.08)],
      ['MID', () => this.aimAt(0.5)],
      ['TOP', () => this.aimAt(0.92)],
      ['CLEAR', () => b.clearTarget()],
    ]);
    this._note(tgt, 'Tap the structure in the world to designate; guns fall '
      + 'back to the nearest standing masonry when nothing is designated.');

    // ── Garrison ───────────────────────────────────────────────────────────
    const gar = this._section('GARRISON');
    this._stat(gar, 'Alive', () => b.garrison.aliveCount);
    this._stat(gar, 'Killed', () => b.defendersKilled);
    for (const key of Object.keys(DEFENDER_TYPES)) {
      this._stat(gar, `· ${DEFENDER_TYPES[key].name}`,
        () => b.garrison.countsByType()[key] || 0);
    }
    this._toggle(gar, 'Enemy fire', {
      get: () => b.garrison.fireEnabled, set: (v) => { b.garrison.fireEnabled = v; },
    });
    this._toggle(gar, 'Line of sight blocks fire', {
      get: () => b.garrison.losEnabled, set: (v) => { b.garrison.losEnabled = v; },
    });
    this._slider(gar, 'Enemy damage scale', {
      min: 0, max: 5, step: 0.05,
      get: () => b.garrison.damageScale ?? 1, set: (v) => { b.garrison.damageScale = v; },
    });
    this._buttons(gar, null, [
      ['KILL ALL', () => { for (const d of b.garrison.defenders) d.alive = false; }],
      ['SHOW COVER', () => this.logGarrison()],
    ]);

    // ── Structure ──────────────────────────────────────────────────────────
    const st = this._section('STRUCTURE');
    this._stat(st, 'Monument integrity', () => `${(b.primary.monumentIntegrity * 100).toFixed(1)}%`);
    this._stat(st, 'Whole-site integrity', () => `${(b.primary.integrity * 100).toFixed(1)}%`);
    this._stat(st, 'Standing height', () => `${(b.primary.standingHeight() - b.originGround).toFixed(1)} m`);
    this._stat(st, 'Stones', () => sum(c.structures, (s) => s.count));
    this._stat(st, 'Total mass (t)', () => Math.round(sum(c.structures, (s) => s.totalMass) / 1000));
    this._slider(st, 'Test blast radius (m)', {
      min: 2, max: 40, step: 0.5,
      get: () => this.blastRadius ?? 10, set: (v) => { this.blastRadius = v; },
    });
    this._slider(st, 'Test blast power', {
      min: 500, max: 60000, step: 500,
      get: () => this.blastPower ?? 9000, set: (v) => { this.blastPower = v; },
    });
    this._stat(st, 'Mortar bond (worst)', () => {
      let lo = 1;
      for (const s2 of c.structures) {
        for (let i = 0; i < s2.count; i++) {
          if (s2.flags[i] & 1) lo = Math.min(lo, s2.bond[i]);
        }
      }
      return `${(lo * 100).toFixed(0)}%`;
    });
    this._buttons(st, null, [
      ['DETONATE AT AIM', () => this.detonate()],
      ['CUT THE BASE', () => this.cutBase()],
      ['FORCE A LEAN', () => this.forceLean()],
      ['RELOAD LEVEL', () => location.reload()],
    ]);
    this._note(st, 'A slice carrying an off-centre load crushes on its '
      + 'compression edge, which tips the load further out. Past 7.5° the '
      + 'section is handed to the physics engine and falls.');

    // ── Physics ────────────────────────────────────────────────────────────
    const phys = this._section('PHYSICS & TIME');
    this._toggle(phys, 'Paused', { get: () => this.paused, set: (v) => { this.paused = v; } });
    this._slider(phys, 'Time scale', {
      min: 0.05, max: 4, step: 0.05,
      get: () => this.timeScale, set: (v) => { this.timeScale = v; },
    });
    // The adaptive governor rewrites the budget every frame, so the slider has
    // to move the governor's ceiling, not the live figure, or it springs back.
    this._slider(phys, 'Active body budget', {
      min: 100, max: 8000, step: 50,
      get: () => c.governor.baseBudget,
      set: (v) => {
        c.governor.baseBudget = v;
        c.governor.budget = v;
        c.quality.activeBodies = v;
        c.physics.setBudget(v);
      },
    });
    this._stat(phys, 'Budget in force', () => c.physics.activeBudget);
    this._buttons(phys, 'Fast forward', [
      ['+5s', () => c.fastForward(5)],
      ['+15s', () => c.fastForward(15)],
      ['+60s', () => c.fastForward(60)],
    ]);

    // ── Visuals ────────────────────────────────────────────────────────────
    const vis = this._section('VISUALS');
    const grade = c.engine.gradePass.uniforms;
    this._slider(vis, 'Exposure', {
      min: 0.3, max: 2.4, step: 0.02,
      get: () => c.engine.renderer.toneMappingExposure,
      set: (v) => { c.engine.renderer.toneMappingExposure = v; },
    });
    this._slider(vis, 'Saturation', {
      min: 0, max: 2.5, step: 0.02,
      get: () => grade.uSaturation.value, set: (v) => { grade.uSaturation.value = v; },
    });
    this._slider(vis, 'Contrast', {
      min: 0.6, max: 1.8, step: 0.01,
      get: () => grade.uContrast.value, set: (v) => { grade.uContrast.value = v; },
    });
    this._slider(vis, 'Warmth', {
      min: 0, max: 0.2, step: 0.005,
      get: () => grade.uWarm.value, set: (v) => { grade.uWarm.value = v; },
    });
    this._slider(vis, 'Vignette', {
      min: 0.2, max: 2.0, step: 0.02,
      get: () => grade.uVignette.value, set: (v) => { grade.uVignette.value = v; },
    });
    this._slider(vis, 'Sun intensity', {
      min: 0, max: 8, step: 0.05,
      get: () => c.engine.sun.intensity, set: (v) => { c.engine.sun.intensity = v; },
    });
    this._slider(vis, 'Ambient floor', {
      min: 0, max: 1.5, step: 0.02,
      get: () => c.engine.ambient.intensity,
      set: (v) => { c.engine.ambient.intensity = v; },
    });
    this._slider(vis, 'Environment fill', {
      min: 0, max: 3, step: 0.05,
      get: () => c.engine.scene.environmentIntensity,
      set: (v) => { c.engine.scene.environmentIntensity = v; },
    });
    this._slider(vis, 'Sky fill', {
      min: 0, max: 3, step: 0.02,
      get: () => c.engine.hemi.intensity, set: (v) => { c.engine.hemi.intensity = v; },
    });
    this._slider(vis, 'Rim light', {
      min: 0, max: 3, step: 0.02,
      get: () => c.engine.rim.intensity, set: (v) => { c.engine.rim.intensity = v; },
    });
    this._slider(vis, 'Fog density (×10⁻⁴)', {
      min: 0, max: 16, step: 0.1,
      get: () => c.engine.scene.fog.density * 1e4,
      set: (v) => { c.engine.scene.fog.density = v * 1e-4; },
    });
    if (c.engine.bloom) {
      this._slider(vis, 'Bloom strength', {
        min: 0, max: 2, step: 0.02,
        get: () => c.engine.bloom.strength, set: (v) => { c.engine.bloom.strength = v; },
      });
      this._slider(vis, 'Bloom threshold', {
        min: 0, max: 2, step: 0.02,
        get: () => c.engine.bloom.threshold, set: (v) => { c.engine.bloom.threshold = v; },
      });
    }
    this._toggle(vis, 'Water', { get: () => c.water.visible, set: (v) => { c.water.visible = v; } });
    this._toggle(vis, 'Terrain', {
      get: () => c.terrain.group.visible, set: (v) => { c.terrain.group.visible = v; },
    });
    this._toggle(vis, 'City', {
      get: () => (c.cityGroup ? c.cityGroup.visible : false),
      set: (v) => { if (c.cityGroup) c.cityGroup.visible = v; },
    });
    this._toggle(vis, 'Structures', {
      get: () => c.structures[0].group.visible,
      set: (v) => { for (const s of c.structures) s.group.visible = v; },
    });
    this._toggle(vis, 'Garrison', {
      get: () => b.garrison.mesh.visible,
      set: (v) => {
        for (const m of [b.garrison.mesh, b.garrison.mortarMesh, b.garrison.bagMesh]) m.visible = v;
      },
    });
    this._toggle(vis, 'Tracers', {
      get: () => b.tracerFX.enabled, set: (v) => { b.tracerFX.enabled = v; },
    });
    this._toggle(vis, 'Impact scorch marks', {
      get: () => !!(b.craters && b.craters.enabled),
      set: (v) => { if (b.craters) { b.craters.enabled = v; if (!v) b.craters.clear(); } },
    });
    this._toggle(vis, 'Unit damage bars', {
      get: () => b.hpBack.visible,
      set: (v) => { b.hpBack.visible = v; b.hpFill.visible = v; },
    });
    this._toggle(vis, 'Street detail', {
      get: () => {
        const d = c.cityGroup && c.cityGroup.getObjectByName('detail');
        return d ? d.visible : false;
      },
      set: (v) => {
        const d = c.cityGroup && c.cityGroup.getObjectByName('detail');
        if (d) d.visible = v;
      },
    });

    // ── Camera ─────────────────────────────────────────────────────────────
    const cam = this._section('CAMERA');
    this._stat(cam, 'Yaw / pitch', () => `${c.rig.yaw.toFixed(2)} / ${c.rig.pitch.toFixed(2)}`);
    this._stat(cam, 'Distance', () => `${c.rig.distance.toFixed(0)} m`);
    this._slider(cam, 'Field of view', {
      min: 25, max: 90, step: 1,
      get: () => c.engine.camera.fov,
      set: (v) => { c.engine.camera.fov = v; c.engine.camera.updateProjectionMatrix(); },
    });
    this._buttons(cam, 'Preset', [
      ['OVERHEAD', () => this.camera(1.3, 320)],
      ['THREE-QUARTER', () => this.camera(0.42, 240)],
      ['GROUND', () => this.camera(0.1, 150)],
      ['RECENTRE', () => c.rig.focus(new THREE.Vector3(
        b.primary.origin.x, b.originGround + 40, b.primary.origin.z), 250)],
    ]);

    // ── Level ──────────────────────────────────────────────────────────────
    const lvl = this._section('LEVEL & QUALITY');
    this._stat(lvl, 'Level', () => c.level.name);
    this._buttons(lvl, 'Load', Object.values(LEVELS).map((l) => [
      l.target, () => { location.search = `?level=${l.id}&test=1`; },
    ]));
    this._buttons(lvl, 'Quality', ['low', 'medium', 'high', 'ultra'].map((q) => [
      q.toUpperCase(),
      () => {
        try { localStorage.setItem('tt.quality', q); } catch { /* private mode */ }
        location.reload();
      },
    ]));
  }

  // ────────────────────────────────────────────────────────────── actions ──

  /** A point on the primary at a given fraction of its height. */
  aimPoint(frac) {
    const b = this.ctx.battle;
    const st = b.primary;
    // Standing masonry only. Loose stone is not a target — and because this
    // works from the *extremes* of what it scans, a single piece of debris that
    // has been thrown clear drags the whole height range with it and puts the
    // aim point underground.
    const standing = (i) => (st.flags[i] & 1) && !(st.flags[i] & (2 | 8));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < st.count; i++) {
      if (!standing(i)) continue;
      lo = Math.min(lo, st.py[i]); hi = Math.max(hi, st.py[i]);
    }
    if (!isFinite(lo)) return st.origin.clone();
    const want = lo + (hi - lo) * frac;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < st.count; i++) {
      if (!standing(i)) continue;
      const d = Math.abs(st.py[i] - want);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return st.origin.clone();
    return new THREE.Vector3(st.px[best], st.py[best], st.pz[best]);
  }

  aimAt(frac) {
    const p = this.aimPoint(frac);
    this.ctx.battle.setTarget(p, `test ${Math.round(frac * 100)}%`);
  }

  detonate() {
    const b = this.ctx.battle;
    const p = b.target || this.aimPoint(0.4);
    const r = this.blastRadius ?? 10;
    const pw = this.blastPower ?? 9000;
    let n = 0;
    for (const s of this.ctx.structures) n += s.explode(p, r * 0.22, r, pw);
    b.garrison.splash(p, r * 1.25, pw);
    b.fx.detonate(p, Math.min(3, r / 6), { ground: false });
    this.ctx.engine.addShake(0.4);
    this._note(this.sections.get('STRUCTURE'), `last blast destroyed ${n} stones`);
  }

  /** Push the primary straight into its lean, for looking at the mechanism. */
  forceLean() {
    const st = this.ctx.battle.primary;
    st.solveStability(true);
    if (!st.lean) {
      // Nothing is failing yet; cut a face first so there is something to tip.
      this.cutBase();
      st.solveStability(true);
    }
    if (st.lean) st.lean.target = Math.max(st.lean.target, 0.06);
  }

  /** Undercut one face at the base — the canonical way to topple a tower. */
  cutBase() {
    const st = this.ctx.battle.primary;
    const p = this.aimPoint(0.04);
    const dir = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < 5; i++) {
      const q = p.clone().addScaledVector(dir, (i - 2) * 3.4);
      for (const s of this.ctx.structures) s.explode(q, 3.2, 9, 22000);
    }
    st.stabilityDirty = true;
  }

  spawnRing(n) {
    const b = this.ctx.battle;
    const id = this._spawnId || UNITS[0].id;
    const def = UNITS_BY_ID[id];
    const origin = b.primary.origin;
    const radius = Math.min(def.range * 0.7, 170);
    let placed = 0;
    for (let a = 0; a < 64 && placed < n; a++) {
      const ang = (a / 64) * Math.PI * 2 + placed * 0.7;
      const p = new THREE.Vector3(
        origin.x + Math.cos(ang) * radius, 0, origin.z + Math.sin(ang) * radius,
      );
      p.y = this.ctx.terrain.heightAt(p.x, p.z);
      if (!b.validPlacement(p).ok) continue;
      // Test spawns ignore both gates: the funds you have and the damage
      // threshold the tier normally unlocks at.
      const money = b.money;
      const unlock = b.unlockAll;
      b.unlockAll = true;
      b.money = Math.max(b.money, def.cost);
      b.deploy(id, p);
      b.money = money;
      b.unlockAll = unlock;
      placed++;
    }
    return placed;
  }

  /**
   * A compass bearing from the primary with nothing else in the way.
   *
   * Tries the four cardinal directions and takes the first whose sight line to
   * the top of the structure is clear of every *other* building on the level.
   */
  _clearBearing(range) {
    const c = this.ctx, b = c.battle, st = b.primary;
    const aim = new THREE.Vector3(st.origin.x, b.originGround + 40, st.origin.z);
    const others = c.structures.filter((s) => s !== st);
    for (const a of [Math.PI, 0, Math.PI / 2, -Math.PI / 2]) {
      const from = new THREE.Vector3(
        st.origin.x + Math.sin(a) * range, b.originGround + 3,
        st.origin.z + Math.cos(a) * range,
      );
      if (lineOfSight(others, from, aim, 0, 0)) return a;
    }
    return Math.PI;
  }

  /** Put `n` guns of one type on a bearing at a given range from the primary. */
  spawnAt(id, n, bearing, range) {
    const c = this.ctx, b = c.battle, st = b.primary;
    let placed = 0;
    // Widen the search as it goes. Streets are narrow, buildings are now solid,
    // and a single bearing at a single range will often find nothing at all.
    for (let k = 0; k < 260 && placed < n; k++) {
      const ring = Math.floor(k / 40);
      const a = bearing + (k % 2 ? 1 : -1) * Math.ceil((k % 40) / 2) * 0.05;
      const r = range * (1 + ring * 0.07);
      const p = new THREE.Vector3(
        st.origin.x + Math.sin(a) * r, 0, st.origin.z + Math.cos(a) * r,
      );
      p.y = c.terrain.heightAt(p.x, p.z);
      if (!b.validPlacement(p).ok) continue;
      const money = b.money, unlock = b.unlockAll;
      b.unlockAll = true;
      b.money = Math.max(b.money, UNITS_BY_ID[id].cost);
      b.deploy(id, p);
      b.money = money; b.unlockAll = unlock;
      placed++;
    }
    return placed;
  }

  /** Remove every deployed unit, so a test starts from a known board. */
  clearUnits() {
    const b = this.ctx.battle;
    for (const u of b.units) {
      if (!u.alive) continue;
      u.alive = false;
      b.scene.remove(u.group);
    }
    b.units.length = 0;
  }

  camera(pitch, distance) {
    const r = this.ctx.rig;
    r.desiredPitch = pitch;
    r.desiredDistance = distance;
  }

  logGarrison() {
    const by = {};
    for (const d of this.ctx.battle.garrison.defenders) {
      if (!d.alive) continue;
      const k = `${d.type}/${d.cover || 'unspecified'}`;
      by[k] = (by[k] || 0) + 1;
    }
    console.table(by);
    this._note(this.sections.get('GARRISON'), `positions logged: ${Object.keys(by).join(', ')}`);
  }

  copyState() {
    const s = JSON.stringify(this.state(), null, 2);
    try { navigator.clipboard.writeText(s); } catch { /* no clipboard */ }
    console.log(s);
  }

  /** Everything worth knowing about the running game, as plain data. */
  state() {
    const c = this.ctx, b = c.battle;
    return {
      level: c.level.id,
      quality: c.quality.id,
      fps: c.stats().fps,
      physMs: c.stats().physMs,
      money: Math.round(b.money),
      progress: +b.progress.toFixed(4),
      integrity: +b.primary.monumentIntegrity.toFixed(4),
      standingHeight: +(b.primary.standingHeight() - b.originGround).toFixed(2),
      stones: sum(c.structures, (s) => s.count),
      destroyed: sum(c.structures, (s) => s.destroyedCount),
      islands: sum(c.structures, (s) => s.islands.size),
      bodies: c.physics.dynamicSet.size,
      units: b.units.filter((u) => u.alive).length,
      shotsFired: b.shotsFired,
      defenders: b.garrison.aliveCount,
      defendersByType: b.garrison.countsByType(),
      incomingRounds: b.tracerFX.fired,
      losChecks: b.garrison.losChecks,
      losBlocked: b.garrison.losBlocked,
      waterQuads: c.water.userData.quads ?? 0,
    };
  }

  // ──────────────────────────────────────────────────────────── self tests ──

  /**
   * Run `fn` with the defence switched off and the player's guns unkillable.
   *
   * Tests run in sequence against one live game, so without this they interfere
   * with each other: the mortar test leaves the garrison shelling the battery,
   * and the next test's guns are dead before they finish setting up. Isolating
   * the conditions is what makes each assertion about the thing it names.
   */
  _calm(fn) {
    const b = this.ctx.battle;
    const fire = b.garrison.fireEnabled;
    const inv = b.invulnerable;
    b.garrison.fireEnabled = false;
    b.invulnerable = true;
    try {
      return fn();
    } finally {
      b.garrison.fireEnabled = fire;
      b.invulnerable = inv;
    }
  }

  /**
   * The regression suite.
   *
   * Each entry asserts something that has actually gone wrong at some point, or
   * that the player has explicitly asked for. They run against the live game,
   * so they catch integration failures a unit test would not — a shader that
   * fails to compile, a structure that collapses under its own weight, a tap
   * that lands somewhere other than where it was made.
   */
  tests() {
    const c = this.ctx, b = c.battle;
    return [
      ['a structure stands as built, with nothing loose', () => {
        // The build-time invariant. Grouting guarantees every stone is
        // connected to the ground through the adjacency graph, but the solver
        // walks *bearing* — held up only by something underneath — which is a
        // strictly harder test, so a stone could be perfectly well grouted and
        // still condemned on the first frame. Six hundred and twenty-seven
        // stones of the Palace Wing were, one course of them at nine metres.
        // Harmless while detaching a collider did not work; the moment that was
        // fixed they became six hundred loose bodies starting the match
        // interpenetrating their neighbours, and the solver resolves that by
        // flinging them. Bricks spraying off the building on load.
        const bad = [];
        for (const st of c.structures) {
          let loose = 0;
          for (let i = 0; i < st.count; i++) {
            if (!(st.flags[i] & 1)) continue;
            if (st.flags[i] & 10) loose++;
          }
          if (loose > 0) bad.push(`${st.key}: ${loose} stones start detached`);
        }
        assert(bad.length === 0, bad.join('; '));
        const grout = c.structures.map((st) => `${st.key} +${st.bearingGrout || 0}`);
        return `nothing loose (bearing grout: ${grout.join(', ')})`;
      }],

      // First, deliberately. This is a claim about a *pristine* structure —
      // that a building the solver has just assembled does not sag, slump or
      // shed anything when left alone. Run it after the tests that put real
      // shells into the tower and it is asking something else entirely: a
      // building with two hundred stones blown out of it is perfectly
      // entitled to keep moving, and it started doing exactly that once
      // detaching a collider began to work.
      ['the structure stands under its own weight', () => {
        const st = b.primary;
        const before = st.standingHeight();
        const wasFire = b.garrison.fireEnabled;
        const units = b.units.filter((u) => u.alive);
        const healths = units.map((u) => u.health);
        b.garrison.fireEnabled = false;
        // Nothing shooting, nothing should move.
        const hadTarget = b.target ? b.target.clone() : null;
        b.clearTarget();
        const auto = b.autoEngage;
        b.autoEngage = false;
        c.fastForward(6);
        b.autoEngage = auto;
        b.garrison.fireEnabled = wasFire;
        if (hadTarget) b.setTarget(hadTarget, b.targetLabel);
        units.forEach((u, i) => { u.health = healths[i]; });
        const drop = before - st.standingHeight();
        assert(drop < 1.5, `lost ${drop.toFixed(2)} m of height with nothing firing`);
        return `settled within ${drop.toFixed(2)} m`;
      }],

      ['picking round-trips within 2.5 px', () => {
        const r = c.picker.selfTest(25, 2.5);
        assert(r.samples >= 20, `only ${r.samples} samples hit the ground`);
        assert(r.failures.length === 0,
          `${r.failures.length}/${r.samples} taps off by up to ${r.worst} px`);
        return `worst ${r.worst} px over ${r.samples} taps`;
      }],

      ['a tap on the structure designates it', () => {
        const p = this.aimPoint(0.5);
        const s = c.picker.toScreen(p);
        assert(!s.behind, 'aim point is behind the camera');
        const hit = c.picker.pick(s.x, s.y, c.structures);
        assert(hit, 'nothing under the projected aim point');
        assert(hit.kind === 'structure', `picked ${hit.kind}, expected structure`);
        return `hit ${hit.label || 'structure'}`;
      }],

      ['the building blocks line of sight', () => {
        const st = b.primary;
        // Sampled at several heights, not one.
        //
        // A single probe at 30 % of the height used to be safe, and stopped
        // being safe the moment the tower got twelve storeys of windows
        // instead of six: 30 % landed exactly on a bay, and a horizontal ray
        // through two aligned 3.4 m openings genuinely is not blocked. That is
        // the building behaving correctly — defenders shoot out of those
        // windows — so what the assertion should say is that the building is
        // mostly opaque, not that every line through it is.
        const top = st.standingHeight();
        const reach = Math.max(140, (st.footprint ? st.footprint.x1 - st.footprint.x0 : 0) * 1.6);
        const hs = [0.18, 0.3, 0.42, 0.54, 0.66];
        let blocked = 0;
        for (const f of hs) {
          const y = b.originGround + Math.max(6, (top - b.originGround) * f);
          const a2 = new THREE.Vector3(st.origin.x - reach, y, st.origin.z);
          const d2 = new THREE.Vector3(st.origin.x + reach, y, st.origin.z);
          if (!lineOfSight(c.structures, a2, d2, 0, 0)) blocked++;
        }
        assert(blocked >= hs.length - 1,
          `only ${blocked} of ${hs.length} lines through the building were blocked`);
        const high = b.originGround + top + 200;
        assert(lineOfSight(c.structures,
          new THREE.Vector3(st.origin.x - reach, high, st.origin.z),
          new THREE.Vector3(st.origin.x + reach, high, st.origin.z), 0, 0),
        'a line 200 m over the building came back blocked');
        return `${blocked}/${hs.length} through blocked, over clear`;
      }],

      ['defenders stand on real masonry', () => {
        const g = b.garrison;
        assert(g.defenders.length > 0, 'the garrison is empty');
        // Living men, on masonry that is still masonry.
        //
        // Counting the dead makes this measure the wrong thing: a defender who
        // died because his stone was blown loose is *correctly* far from it,
        // since the stone has since fallen forty metres. What the assertion is
        // actually about is that a man on his feet is pinned to a piece of the
        // building he is standing on, rather than to something across the site.
        let bad = 0, checked = 0;
        for (const d of g.defenders) {
          if (!d.alive) continue;
          const i = d.chunk;
          const s = d.structure;
          if (!(s.flags[i] & 1) || (s.flags[i] & 10)) continue;   // dead or falling
          checked++;
          const dist = Math.hypot(s.px[i] - d.pos.x, s.py[i] - d.pos.y, s.pz[i] - d.pos.z);
          if (dist > 10) bad++;
        }
        assert(checked > 0, 'no living defender is pinned to standing masonry');
        assert(bad === 0,
          `${bad} of ${checked} defenders are more than 10 m from their stone`);
        const cover = {};
        for (const d of g.defenders) cover[d.cover || 'none'] = (cover[d.cover || 'none'] || 0) + 1;
        assert(!cover.none, `${cover.none} defenders have no stated position type`);
        return Object.entries(cover).map(([k, v]) => `${v} ${k}`).join(', ');
      }],

      ['there are windows to shoot from', () => {
        const g = b.garrison;
        const traits = c.level.traits || {};
        const inWindows = g.defenders.filter((d) => d.cover === 'window').length;
        const onRoofs = g.defenders.filter((d) => d.cover === 'roof').length;
        // A pyramid has no windows, and saying so is not the same as failing.
        if (traits.windows === false) {
          const covered = g.defenders.filter((d) => d.cover === 'arcade').length;
          assert(covered > 0, 'nobody is under cover anywhere on this landmark');
          assert(onRoofs > 0, 'nobody is posted on the faces');
          const m = g.defenders.filter((d) => d.def.indirect).length;
          assert(m > 0, 'no mortars');
          return `no windows here: ${covered} in the chambers, ${onRoofs} on the faces, ${m} mortars`;
        }
        assert(inWindows > 0, 'nobody is posted in a window');
        assert(onRoofs > 0, 'nobody is posted on a roof');
        const mortars = g.defenders.filter((d) => d.def.indirect).length;
        assert(mortars > 0, 'no mortars');
        return `${inWindows} at windows, ${onRoofs} on roofs, ${mortars} mortars`;
      }],

      ['defenders can see out of their positions', () => {
        // The counterpart to the blocking test. It is easy to make line of
        // sight so strict that the garrison never fires at all, and a silent
        // defender looks exactly like one with no target — so assert that the
        // great majority of positions have a field of fire.
        const r = b.garrison.fieldOfFireReport(c.structures);
        const total = r.clear + r.blind;
        assert(total > 0, 'no live defenders');
        const frac = r.clear / total;
        assert(frac > 0.85,
          `only ${(frac * 100).toFixed(0)}% can see out: ${JSON.stringify(r.blindBy)}`);
        return `${r.clear}/${total} with a field of fire`;
      }],

      ['mortars put shells in the air', () => {
        const before = b.garrison.mortarsFired;
        const inv = b.invulnerable;
        b.invulnerable = true;   // the point is the bombs, not the casualties
        try {
          if (b.units.filter((u) => u.alive).length === 0) this.spawnRing(2);
          c.fastForward(20);
        } finally { b.invulnerable = inv; }
        const fired = b.garrison.mortarsFired - before;
        assert(fired > 0, 'no mortar rounds were fired in 20 s with guns in range');
        return `${fired} bombs`;
      }],

      ['friendly units fire without a designated target', () => this._calm(() => {
        const hadTarget = b.target ? b.target.clone() : null;
        const label = b.targetLabel;
        b.clearTarget();
        const before = b.shotsFired;
        if (b.units.filter((u) => u.alive).length === 0) this.spawnRing(2);
        c.fastForward(14);
        const fired = b.shotsFired - before;
        if (hadTarget) b.setTarget(hadTarget, label);
        assert(fired > 0, 'no rounds went out in 14 s with guns deployed');
        return `${fired} rounds`;
      })],

      // Free fire used to take the nearest sampled stone, which from outside
      // the precinct is always one at the foot of the near wall — so with
      // dispersion on top, half the sheaf landed on the pavement around the
      // tower and never touched it. The order is now the garrison first, then
      // the nearest part of the building that is not skirting.
      ['free fire lays on the enemy, not the pavement', () => this._calm(() => {
        const hadTarget = b.target ? b.target.clone() : null;
        const label = b.targetLabel;
        b.clearTarget();
        if (b.units.filter((u) => u.alive).length < 3) this.spawnRing(5);
        b._refreshAimCandidates();
        const alive = b.units.filter((u) => u.alive);
        const men = (b.garrison?.defenders || []).filter((d) => d.alive);
        let onMen = 0, low = 0, blank = 0, off = 0;
        for (const u of alive) {
          const a = b.aimFor(u);
          if (!a) { blank++; continue; }
          if (men.some((d) => (d.muzzle || d.pos)
            && (d.muzzle || d.pos).distanceTo(a) < 0.5)) { onMen++; continue; }
          if (a.y < b.originGround + 4.0) low++;
          const on = c.structures.some((s) => s.footprint
            && a.x > s.footprint.x0 - 3 && a.x < s.footprint.x1 + 3
            && a.z > s.footprint.z0 - 3 && a.z < s.footprint.z1 + 3);
          if (!on) off++;
        }
        if (hadTarget) b.setTarget(hadTarget, label);
        assert(alive.length > 0, 'no guns were deployed to test with');
        assert(blank === 0, `${blank} of ${alive.length} guns had nothing to aim at`);
        assert(low === 0, `${low} guns are laid on stones at pavement level`);
        assert(off === 0, `${off} guns are laid at nothing in particular`);
        return `${alive.length} guns: ${onMen} on the garrison, `
          + `${alive.length - onMen} on the structure`;
      })],

      ['shells actually reach the building', () => this._calm(() => {
        // A howitzer, not an AT4: the whole point of the light tiers is that
        // they barely scratch stone, so asserting damage with one would assert
        // the opposite of the design.
        //
        // The guns are placed deliberately rather than on the generic ring.
        // The ring puts them wherever there is space, which on Westminster can
        // be behind the palace wing — a legitimate firing position that a real
        // battery would have to shoot over, but not what this test is about.
        this.clearUnits();
        const st = b.primary;
        const before = sum(c.structures, (s) => s.destroyedCount);
        const shots0 = b.shotsFired;
        // A heavier battery, and longer, where the landmark is a solid mass.
        //
        // Two M119s firing eight rounds is plenty to knock stone off a hollow
        // tower and is nothing at all against a pyramid: 2.3 million cubic
        // metres of it, in blocks so large that one shell's blast covers a
        // single stone. That is the level behaving as designed, not the shells
        // failing to arrive — but this test cannot tell the difference, so on
        // such a level it brings a battery that can.
        const massive = (c.level.traits || {}).topples === false;
        const placed = massive
          ? this.spawnAt('m777', 4, this._clearBearing(260), 260)
          : this.spawnAt('m119', 2, this._clearBearing(220), 220);
        this.aimAt(0.35);
        c.fastForward(massive ? 60 : 26);
        const gone = sum(c.structures, (s) => s.destroyedCount) - before;
        const fired = b.shotsFired - shots0;
        assert(placed > 0, 'no firing position was available');
        assert(gone > 0,
          `nothing destroyed — ${placed} guns, ${fired} rounds fired, `
          + `state ${b.state}, target ${b.target ? 'set' : 'none'}`);
        return `${gone} stones from ${fired} rounds`;
      })],


      ['water covers the river and nothing else', () => {
        const w = c.water;
        const quads = w.userData.quads ?? 0;
        const t = c.terrain;
        let wetCells = 0;
        for (let i = 0; i < t.size * t.size; i++) if (t.mask[i * 3] > 0.35) wetCells++;
        if (wetCells === 0) {
          assert(quads === 0, `${quads} water quads on a level with no river`);
          return 'landlocked, no water drawn';
        }
        assert(quads > 0, 'the river mask is populated but no water was built');
        // The sheet must not reach the landmark's plot.
        assert(!t.isWater(b.primary.origin.x, b.primary.origin.z),
          'the target is standing in the river');
        return `${quads} quads over ${wetCells} wet cells`;
      }],

      ['guns can be put on a rooftop', () => {
        const city = c.cityGroup;
        const roofs = city && city.userData ? city.userData.roofs : null;
        assert(roofs && roofs.length > 0, 'the city exposes no deployable roofs');
        // Pick the roof the way a player would: project its centre to the
        // screen and tap it, then check what comes back.
        let tested = 0, placed = 0;
        for (const r of roofs.slice(0, 40)) {
          const s = c.picker.toScreen(new THREE.Vector3(r.x, r.top, r.z));
          if (s.behind) continue;
          const hit = c.picker.pick(s.x, s.y, c.structures, city);
          if (!hit || hit.kind !== 'roof') continue;
          tested++;
          if (!b.validPlacement(hit.point).ok) continue;
          const before = b.units.length;
          const money = b.money, unlock = b.unlockAll;
          b.unlockAll = true; b.money = 1e6;
          b.deploy('m119', hit.point);
          b.money = money; b.unlockAll = unlock;
          if (b.units.length > before) {
            const u = b.units[b.units.length - 1];
            assert(u.onRoof, 'the unit was not flagged as being on a roof');
            assert(u.pos.y > c.terrain.heightAt(u.pos.x, u.pos.z) + 4,
              `deployed at ${u.pos.y.toFixed(1)} m, barely above the `
              + `${c.terrain.heightAt(u.pos.x, u.pos.z).toFixed(1)} m ground`);
            placed++;
          }
          if (placed >= 2) break;
        }
        assert(tested > 0, `${roofs.length} roofs exist but none picked as one`);
        assert(placed > 0, `${tested} roofs picked but nothing could be placed`);
        this.clearUnits();
        return `${placed} of ${tested} on-screen roofs took a gun`;
      }],

      ['deployment rules hold', () => {
        const t = c.terrain;
        const o = b.primary.origin;
        assert(!b.validPlacement(new THREE.Vector3(o.x, o.y, o.z)).ok,
          'a gun may be placed inside the target');
        const far = new THREE.Vector3(t.span * 0.99, 0, 0);
        assert(!b.validPlacement(far).ok, 'a gun may be placed off the map');
        if (b.cityPlots && b.cityPlots.length) {
          const inside = b.cityPlots.find((p) => Math.hypot(p.x, p.z) > 140);
          const pt = new THREE.Vector3(inside.x, 0, inside.z);
          pt.y = t.heightAt(pt.x, pt.z);
          assert(!b.validPlacement(pt).ok, 'a gun may be placed inside a building');
        }
        const good = new THREE.Vector3(o.x + 150, 0, o.z + 150);
        good.y = t.heightAt(good.x, good.z);
        if (!t.isWater(good.x, good.z)) {
          assert(b.validPlacement(good).ok, 'open ground 210 m out was rejected');
        }
        return 'inside the target, inside a building, off-map and water all rejected';
      }],

      ['the economy pays for damage', () => {
        const m0 = b.money;
        c.fastForward(3);
        assert(b.money > m0, 'no income accrued over three seconds');
        return `+$${Math.round(b.money - m0)} in 3 s`;
      }],

      ['the render path is intact', () => {
        const r = c.engine.renderer;
        const info = r.info;
        assert(info.render.calls > 0, 'nothing was drawn last frame');
        const log = c.shaderErrors();
        assert(log.length === 0, `shader problems: ${log.join('; ')}`);
        return `${info.render.calls} draw calls, ${fmt(info.render.triangles)} triangles`;
      }],

      ['tracers are travelling, not instantaneous lines', () => {
        const fx = b.tracerFX;
        fx.fire(
          new THREE.Vector3(0, 60, 0), new THREE.Vector3(120, 4, 0),
          DEFENDER_TYPES.rifleman, true,
        );
        const t = fx.tracers[fx.tracers.length - 1];
        assert(t, 'the tracer was not queued');
        assert(t.speed > 0 && t.len > 0, 'the tracer has no speed or length');
        const p0 = t.t;
        fx.update(0.05);
        assert(fx.tracers.includes(t) ? t.t > p0 : true, 'the tracer did not advance');
        return `${fx.tracers.length} in flight, ${t.speed} m/s`;
      }],

      ['every gun points the way it is aimed', () => {
        // The two towed pieces are modelled across their own axis and the
        // tracked vehicles along it, so one group needs a quarter turn and the
        // other must not have one. Measured from the model rather than eyeballed
        // — a gun facing ninety degrees away from its own shells is the kind of
        // thing that survives a dozen playtests because it looks deliberate.
        // The old version of this only checked that a quarter turn *existed*
        // on the pieces modelled across their axis, which both towed guns pass
        // whichever way they are pointing — so it sat there green while the
        // M777 fired its shells out of the back of the trails for a week. It
        // now finds the barrel and checks where the barrel ends up.
        //
        // Finding it: the barrel is the thin end. Sample the maximum radius
        // from the model's own spine in slices along its long axis; the end
        // with the smaller mean radius is the muzzle.
        const wrong = [], found = [];
        const v = new THREE.Vector3();
        for (const u of UNITS) {
          if (u.model === 'infantry') continue;
          const w = b.models.cache.get(`${u.model}:${u.modelLength}:${u.tint ?? ''}`);
          if (!w) continue;
          w.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(w);
          const size = box.getSize(new THREE.Vector3());
          const alongX = size.x > size.z;
          const lo = alongX ? box.min.x : box.min.z;
          const hi = alongX ? box.max.x : box.max.z;
          const cy = (box.min.y + box.max.y) / 2;
          const cc = alongX ? (box.min.z + box.max.z) / 2 : (box.min.x + box.max.x) / 2;
          const N = 20, rad = new Array(N).fill(0);
          w.traverse((o) => {
            if (!o.isMesh || !o.geometry?.attributes?.position) return;
            const pos = o.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
              const t = ((alongX ? v.x : v.z) - lo) / Math.max(1e-6, hi - lo);
              const k = Math.max(0, Math.min(N - 1, Math.floor(t * N)));
              const r = Math.hypot((alongX ? v.z : v.x) - cc, v.y - cy);
              if (r > rad[k]) rad[k] = r;
            }
          });
          const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
          const rLo = mean(rad.slice(0, 5)), rHi = mean(rad.slice(-5));
          // A launcher box has no barrel and no thin end; skip those.
          if (Math.abs(rLo - rHi) < 0.18) { found.push(`${u.name} n/a`); continue; }

          // Local direction the muzzle points, then the model yaw applied.
          const local = new THREE.Vector3();
          if (alongX) local.set(rHi < rLo ? 1 : -1, 0, 0);
          else local.set(rHi < rLo ? 1 : -1, 0, 0).set(0, 0, rHi < rLo ? 1 : -1);
          local.applyAxisAngle(new THREE.Vector3(0, 1, 0), u.modelYaw ?? 0);
          // A unit aims by setting group.rotation.y from atan2(dx, dz), i.e.
          // its forward is +Z. So after the model yaw the barrel must be +Z.
          if (local.z < 0.9) {
            wrong.push(`${u.name} barrel points (${local.x.toFixed(1)}, `
              + `${local.z.toFixed(1)}) after its yaw, not down +Z`);
          }
          found.push(`${u.name} ${alongX ? 'X' : 'Z'}${rHi < rLo ? '+' : '-'}`);
        }
        assert(wrong.length === 0, wrong.join('; '));
        return found.join(', ');
      }],

      ['the deployment preview shows reach and damage', () => {
        const st = b.primary;
        const p = new THREE.Vector3(st.origin.x + 150, 0, st.origin.z + 150);
        p.y = c.terrain.heightAt(p.x, p.z);
        b.showRange(p, UNITS_BY_ID.m119);
        assert(b.rangeRing.visible, 'the range ring did not appear');
        assert(Math.abs(b.rangeRing.scale.x - UNITS_BY_ID.m119.range) < 1,
          'the ring is not drawn at the unit\'s range');
        b.rangeRing.visible = false;

        // Damage bars: only for units that have actually been hit.
        this.clearUnits();
        this.spawnAt('at4', 1, 0, 160);
        const u = b.units.find((x) => x.alive);
        assert(u, 'no unit to test the bar on');
        b._updateHealthBars();
        assert(b.hpFill.count === 0, 'an undamaged unit is showing a damage bar');
        u.health = u.maxHealth * 0.4;
        b._updateHealthBars();
        assert(b.hpFill.count === 1, 'a damaged unit is not showing one');
        this.clearUnits();
        return 'range ring and damage bars behave';
      }],

      ['the collapse gets a beat of slow motion', () => {
        const before = this.timeScale;
        this.dramaticPause(1.2, 0.4);
        this.update(0.1);
        assert(this.timeScale < before, 'time did not slow');
        // And it comes back on its own rather than leaving the game in
        // permanent slow motion, which is exactly the bug worth guarding.
        for (let i = 0; i < 40; i++) this.update(0.05);
        assert(Math.abs(this.timeScale - before) < 1e-6,
          `time scale stuck at ${this.timeScale}`);
        return 'slows, then restores itself';
      }],

      ['click feedback exists', () => {
        const pool = c.hud._ripplePool;
        assert(pool && pool.length > 0, 'no ripple pool');
        c.hud.ripple(100, 100, 'aim');
        assert(pool.some((el) => el.classList.contains('go')), 'no ripple was triggered');
        assert(b._rings.length > 0, 'no world-space confirmation rings');
        b.pulse(new THREE.Vector3(0, b.originGround, 0));
        assert(b._rings.some((r) => r.age < 0.01), 'the world pulse did not fire');
        return `${pool.length} screen ripples, ${b._rings.length} world rings`;
      }],
      ['collider handles survive being stored', () => {
        // The bug this exists for was invisible and cost the engine its
        // physics. Rapier's JS bindings return a collider handle that is not
        // an integer index — it is a 64-bit value reinterpreted as a double,
        // and for a young world it comes out as a denormal near 1e-312. Every
        // chunk stored one in an Int32Array, which truncates it to zero, so
        // the whole building recorded handle 0, the reverse map never matched,
        // and detaching a stone's collider removed collider zero or nothing.
        //
        // What that looked like in play: a destroyed stone kept its collider,
        // so the building's physical shape never changed, and a section that
        // had gone dynamic sank through the ghost of itself at the solver's
        // penetration-recovery speed — a constant metre a second that never
        // accelerated, which is a ninety-metre tower drifting away instead of
        // falling over.
        const st = b.primary;
        let checked = 0, bad = 0, zero = 0, unmapped = 0;
        for (let i = 0; i < st.count && checked < 400; i++) {
          if (!(st.flags[i] & 1)) continue;
          const h = st.colliderOf[i];
          if (h < 0) continue;
          checked++;
          if (h === 0) zero++;
          const col = c.physics.world.getCollider(h);
          if (!col || col.handle !== h) bad++;
          if (st.colliderToChunk.get(h) !== i) unmapped++;
        }
        assert(checked > 50, `only ${checked} chunks had a collider handle`);
        assert(zero < checked,
          `every one of ${checked} handles stored as 0 — they are being `
          + 'truncated, almost certainly by an integer typed array');
        assert(bad === 0, `${bad}/${checked} handles do not resolve to themselves`);
        assert(unmapped === 0, `${unmapped}/${checked} are missing from the reverse map`);
        return `${checked} handles round-trip`;
      }],

      ['shells arrive instead of loitering', () => {
        // A Paladin used to put its round up at ninety metres a second on an
        // eight-second arc, because the solver went straight to the minimum-
        // energy lob. A 155 mm shell is not a mortar bomb.
        const from = new THREE.Vector3(0, b.originGround + 2, 300);
        const to = new THREE.Vector3(0, b.originGround + 30, 0);
        const slow = [];
        const times = [];
        for (const u of UNITS) {
          const p = u.projectile;
          if (p.kind !== 'arc') continue;
          const vel = solveArc(from, to, p.speed, p.gravity, false);
          if (!vel) { slow.push(`${u.name} cannot reach 300 m flat`); continue; }
          const horiz = Math.hypot(vel.x, vel.z);
          const t = horiz > 0.01 ? from.distanceTo(to) / horiz : 99;
          times.push(`${u.name} ${t.toFixed(1)}s`);
          if (t > 3.0) slow.push(`${u.name} takes ${t.toFixed(1)}s over 300 m`);
        }
        assert(slow.length === 0, slow.join('; '));
        return times.join(', ');
      }],

      ['defenders fall when their footing goes', () => this._calm(() => {
        // A sandbagged position on the plinth is anchored to whichever stone
        // happened to be nearest when it was posted — up to eight metres away,
        // and the field-of-fire nudge can then move the man several more. So
        // the masonry he stands on and the stone whose flags decide his fate
        // were routinely different stones, and shelling the plinth out from
        // under him left him hanging at five metres, still shooting.
        const st = b.primary;
        const g = b.garrison;
        const gy = b.originGround;
        const high = g.defenders.filter((d) => d.alive && d.pos.y - gy > 1.6).length;
        assert(high > 4, `only ${high} defenders are off the ground to test`);

        const unsupported = () => {
          let n = 0;
          for (const d of g.defenders) {
            if (!d.alive || d.pos.y - gy < 1.6) continue;
            const occ = d.structure.occupancy;
            if (!occ) continue;
            if (!occ.solidAt(d.pos.x, d.pos.y - 1.0, d.pos.z)
                && !occ.solidAt(d.pos.x, d.pos.y - 2.2, d.pos.z)) n++;
          }
          return n;
        };
        assert(unsupported() === 0,
          `${unsupported()} defenders are standing on nothing before a shot is fired`);

        // Take the floor out from under specific men, rather than guessing
        // where their floor is — the two levels put their ground positions at
        // different heights and on different structures.
        // Deterministic, and it costs the building almost nothing.
        //
        // Blasting a hole is the wrong instrument here twice over: how much
        // masonry a given radius removes depends on the geometry under each
        // man, so the test passed on one level and not the other, and a blast
        // wide enough to work everywhere took the tower down to a third of
        // itself and disarmed the lean assertion at the end of the suite. What
        // is under test is the footing check, so remove exactly the stones the
        // footing check looks at and nothing else.
        const standing = g.defenders.filter((d) => d.alive && d.pos.y - gy > 1.6);

        // Pick men who actually have something under them, rather than the
        // first three in the list. Stone sizes differ by quality tier and
        // position types differ by level, so a fixed slice finds a mortar on a
        // roof slab on one configuration and three men over open air on
        // another — which fails the test for the one reason it should not.
        const floorOf = (d) => {
          const st2 = d.structure;
          const under = [];
          for (let i = 0; i < st2.count; i++) {
            if (!(st2.flags[i] & 1) || (st2.flags[i] & 10)) continue;
            const dy = d.pos.y - st2.py[i];
            if (dy < 0.2 || dy > 3.2) continue;
            if (Math.abs(st2.px[i] - d.pos.x) > 2.6) continue;
            if (Math.abs(st2.pz[i] - d.pos.z) > 2.6) continue;
            under.push(i);
          }
          return under;
        };
        const marked = [];
        for (const d of standing) {
          const under = floorOf(d);
          if (!under.length) continue;
          marked.push({ d, under });
          if (marked.length >= 3) break;
        }
        assert(marked.length > 0,
          `none of ${standing.length} raised defenders had masonry beneath them`);

        const before = g.aliveCount;
        let removed = 0;
        for (const { d, under } of marked) {
          for (const i of under) { d.structure.destroyChunk(i); removed++; }
          d.structure.stabilityDirty = true;
        }
        c.fastForward(0.8);
        const after = g.aliveCount;
        assert(after < before,
          `removed ${removed} stones from under ${marked.length} defenders and `
          + 'killed none of them');
        assert(unsupported() === 0,
          `${unsupported()} defenders left hanging in the air with no masonry beneath them`);
        return `${removed} stones pulled, ${before - after} fell, none left floating`;
      })],

      ['the city is detailed, and its roads keep out of the river', () => {
        const city = this.ctx.cityGroup;
        const d = city?.userData?.detail;
        assert(d, 'the detail pass did not run');
        // `wall` is the river wall, and a level with no river has none.
        const traits = c.level.traits || {};
        const want = ['lamps', 'parked', 'cornices', 'porches', 'streetTrees'];
        if (traits.river !== false) want.push('wall');
        const thin = want.filter((k) => !(d[k] > 20));
        assert(thin.length === 0,
          `too little of: ${thin.map((k) => `${k}=${d[k] ?? 0}`).join(', ')}`);

        // No carriageway in the water. Roads used to run to the waterline and,
        // where the river mask is coarse, a metre or two past it — half the
        // streets on the map ended in the Thames.
        //
        // One road is allowed over the river, and it is the bridge. It is an
        // edge of the street network now rather than a separate thing built
        // alongside it, so its deck is part of this mesh and is found here as
        // road over water — which it is, at nine metres up. Anything at ground
        // level is still the fault this exists to catch.
        const streets = city.getObjectByName('streets');
        assert(streets, 'there is no street mesh');
        const pos = streets.geometry.attributes.position;
        const deckY = (city.userData.bridge?.deckTop ?? Infinity) - 1.5;
        let wet = 0, sampled = 0;
        for (let i = 0; i < pos.count; i += 97) {
          const x = pos.getX(i), z = pos.getZ(i);
          sampled++;
          if (pos.getY(i) > deckY) continue;            // up on the bridge
          if (this.ctx.terrain.isWater(x, z)) wet++;
        }
        assert(wet === 0,
          `${wet} of ${sampled} sampled road vertices are in the river`);
        const total = Object.values(d).reduce((a, v) => a + v, 0);
        return `${total.toLocaleString()} props, no road in the water`;
      }],

      ['the map is a place, not a plan', () => {
        // The complaint this answers: the landmark stood in an apron of bare
        // paving, every open block was flat and blank, and past the last street
        // the map was a wash of colour running to the fog. All three are the
        // same failure — ground with nothing on it and no reason to be empty.
        const city = this.ctx.cityGroup;
        const d = city?.userData?.detail || {};
        const traits = c.level.traits || {};
        const want = {
          railing: 40,        // something stands round the monument
          statues: 3,         // and something to look at inside it
          wall: 60,           // the river's edge is built, not a beach
          fields: 150,        // there is country beyond the town
          towers: 40,         // and a skyline at the limit of vision
          track: 20,          // a railway crosses it
          programmes: 4,      // open blocks are for something
        };
        // A level with no river has no river wall, and no railed precinct or
        // statuary either where the monument stands in open desert.
        if (traits.river === false) { delete want.wall; delete want.railing; delete want.statues; }
        const thin = Object.entries(want).filter(([k, n]) => !(d[k] >= n));
        assert(thin.length === 0,
          `the map is missing: ${thin.map(([k, n]) => `${k} ${d[k] ?? 0}/${n}`).join(', ')}`);
        // And that edge is the one this river actually has: a parapet with a
        // balustrade along the Thames, steps down to the water at Agra. Both
        // are river walls; only one of them has balusters on it.
        if (traits.river !== false) {
          assert((d.balusters || 0) >= 200 || (d.stairs || 0) >= 30,
            `the river wall has neither a balustrade (${d.balusters || 0}) nor `
            + `steps down to the water (${d.stairs || 0})`);
        }

        // And the things that move are moving.
        const life = this.ctx.life;
        assert(life, 'nothing in this city moves');
        const cars = life.cars?.cars?.length || 0;
        assert(cars > 20, `only ${cars} vehicles on a network of ${d.streets} streets`);
        const before = [];
        const m = life.cars.mesh;
        const mat = new THREE.Matrix4();
        for (let i = 0; i < Math.min(8, m.count); i++) {
          m.getMatrixAt(i, mat);
          before.push(mat.elements[12], mat.elements[14]);
        }
        life.update(1.0);
        let moved = 0;
        for (let i = 0; i < Math.min(8, m.count); i++) {
          m.getMatrixAt(i, mat);
          if (Math.abs(mat.elements[12] - before[i * 2]) > 0.5
            || Math.abs(mat.elements[14] - before[i * 2 + 1]) > 0.5) moved++;
        }
        assert(moved > 4, `${moved} of 8 sampled vehicles moved in a second`);
        return `${d.railing} of railing, ${d.fields} fields, ${d.towers} towers on `
          + `the skyline, ${d.programmes} blocks with a use, ${cars} vehicles moving`;
      }],

      // A river that stops at the edge of the elevation data is a lake with two
      // square ends, and from any height that is exactly what it read as. The
      // channel is carried out through the surrounding country to the limit of
      // vision — and the boats on it move at the speed they were given, which
      // they did not while their position was an index into a list of samples
      // taken at a fixed step in z.
      ['the river runs to both horizons', () => {
        const t = c.terrain;
        const exits = t.riverExits();
        if (!exits.length) return 'landlocked: no river leaves this map';
        const tails = t.riverTails();
        assert(tails.length === exits.length,
          `${exits.length} river mouths but ${tails.length} channels`);

        let reach = 0, worst = 0;
        for (const pts of tails) {
          const end = pts[pts.length - 1];
          reach = Math.max(reach, Math.hypot(end.x, end.z));
          // A quarter-kilometre-wide river that changes heading sharply every
          // few hundred metres is a crinkled ribbon, not a reach.
          for (let k = 1; k < pts.length - 1; k++) {
            const a = Math.atan2(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
            const b2 = Math.atan2(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
            let dd = Math.abs(b2 - a);
            if (dd > Math.PI) dd = Math.PI * 2 - dd;
            worst = Math.max(worst, dd);
          }
        }
        assert(reach > t.span * 4,
          `the channel reaches ${Math.round(reach)} m, barely past the `
          + `${Math.round(t.span)} m playfield`);
        assert(worst < 0.16,
          `the channel kinks ${(worst * 180 / Math.PI).toFixed(0)}° between samples`);

        // And the water is actually drawn out there, not just carved.
        const p = c.water?.geometry?.attributes?.position;
        assert(p, 'there is a river mask but no water surface');
        let far = 0;
        for (let i = 0; i < p.count; i++) {
          if (Math.hypot(p.getX(i), p.getZ(i)) > t.span * 2) far++;
        }
        assert(far > 60, `only ${far} water vertices lie beyond the playfield`);

        // Boat speeds, measured over the ground rather than trusted.
        const life = c.life;
        const bm = life?.boats?.mesh;
        assert(bm && bm.count > 3, 'there is a river but nothing is on it');
        const mat2 = new THREE.Matrix4();
        const was = [];
        life.update(0.001);
        for (let i = 0; i < bm.count; i++) {
          bm.getMatrixAt(i, mat2);
          was.push(mat2.elements[12], mat2.elements[14]);
        }
        for (let k = 0; k < 10; k++) life.update(0.1);
        let fastest = 0, slowest = Infinity;
        for (let i = 0; i < bm.count; i++) {
          bm.getMatrixAt(i, mat2);
          const v = Math.hypot(mat2.elements[12] - was[i * 2],
            mat2.elements[14] - was[i * 2 + 1]);
          fastest = Math.max(fastest, v);
          slowest = Math.min(slowest, v);
        }
        assert(fastest < 9,
          `a boat is doing ${fastest.toFixed(1)} m/s — about ${Math.round(fastest * 1.94)} knots`);
        assert(slowest > 1.2, `a boat is doing ${slowest.toFixed(1)} m/s, adrift`);
        return `${tails.length} reaches out to ${Math.round(reach)} m, `
          + `${bm.count} boats at ${slowest.toFixed(1)}–${fastest.toFixed(1)} m/s`;
      }],

      ['the city is a street network, not a grid of stripes', () => {
        // What this is really checking is the complaint that produced it: the
        // roads were dead straight and went nowhere, houses stood in the
        // carriageway at the end of the bridge, and houses hung over the edge
        // of the river. All three came from laying streets and buildings on
        // two independent grids and hoping. The layout is now one graph, and
        // these are the properties that graph has to have.
        const city = this.ctx.cityGroup;
        const net = city?.userData?.network;
        const terrain = this.ctx.terrain;
        assert(net, 'the city was built without a street network');
        assert(net.edges.length > 150,
          `only ${net.edges.length} streets in the whole city`);

        // Connected: junctions joined into one town, not a scatter of stubs.
        // Two components are expected — one per bank, joined by the bridge.
        const seen = new Set();
        const sizes = [];
        for (let i = 0; i < net.nodes.length; i++) {
          if (seen.has(i) || !net.nodes[i].links.length) continue;
          const q = [i]; seen.add(i); let n = 0;
          while (q.length) {
            const k = q.pop(); n++;
            for (const l of net.nodes[k].links) {
              if (!seen.has(l.other)) { seen.add(l.other); q.push(l.other); }
            }
          }
          sizes.push(n);
        }
        sizes.sort((a, b) => b - a);
        const linked = net.nodes.filter((n) => n.links.length).length;
        const inTwo = (sizes[0] || 0) + (sizes[1] || 0);
        assert(inTwo / Math.max(1, linked) > 0.9,
          `the street network is in ${sizes.length} pieces; the two largest hold `
          + `${inTwo} of ${linked} junctions`);

        // Straight: streets are ruled lines, and the variety comes from where
        // they are rather than from bending them. A map of gently wandering
        // roads reads as noise — nothing lines up and nothing points anywhere.
        let bent = 0;
        for (const e of net.edges) {
          if (e.bank || e.approach) continue;      // these curve for a reason
          const a = e.pts[0], b = e.pts[e.pts.length - 1];
          const straight = Math.hypot(b.x - a.x, b.z - a.z);
          let along = 0;
          for (let i = 0; i < e.pts.length - 1; i++) {
            along += Math.hypot(e.pts[i + 1].x - e.pts[i].x, e.pts[i + 1].z - e.pts[i].z);
          }
          if (along > straight * 1.003) bent++;
        }
        assert(bent === 0, `${bent} streets wander instead of running straight`);

        // But the blocks they enclose are all different sizes: a grid at one
        // fixed pitch is the other way to make a city look machine-made.
        const spans = net.blocks.map((b) => Math.hypot(
          b.poly[1].x - b.poly[0].x, b.poly[1].z - b.poly[0].z));
        spans.sort((a, b) => a - b);
        const lo = spans[Math.floor(spans.length * 0.1)];
        const hi = spans[Math.floor(spans.length * 0.9)];
        assert(hi > lo * 1.3,
          `every block is the same size: ${lo.toFixed(0)}–${hi.toFixed(0)} m across`);

        // And every block is *for* something. Bare ground in the middle of a
        // city reads as a hole in the map.
        const used = net.blocks.filter((b) => b.use).length;
        assert(used === net.blocks.length,
          `${net.blocks.length - used} of ${net.blocks.length} blocks were left `
          + 'with nothing in them');

        // Nothing standing in the road, on any part of its footprint.
        const plots = city.userData.plots || [];
        assert(plots.length > 300, `only ${plots.length} buildings in the city`);
        let inRoad = 0, worstRoad = 0, wet2 = 0, onBridge = 0;
        const bridge = city.userData.bridge;
        for (const p of plots) {
          const ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
          for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
            const x = p.x + (u * p.w / 2) * ca + (v * p.d / 2) * sa;
            const z = p.z - (u * p.w / 2) * sa + (v * p.d / 2) * ca;
            const clear = Math.min(net.roadClearance(x, z), net.nodeClearance(x, z));
            if (clear < 0) { inRoad++; worstRoad = Math.max(worstRoad, -clear); break; }
            if (terrain.isWater(x, z)
              || terrain.heightAt(x, z) < terrain.waterLevel + 0.6) { wet2++; break; }
            if (bridge) {
              const a = bridge.far.a, b = bridge.far.b;
              const dx = b.x - a.x, dz = b.z - a.z;
              const l2 = dx * dx + dz * dz;
              let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
              t = Math.max(0, Math.min(1, t));
              const dist = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
              if (dist < 11) { onBridge++; break; }
            }
          }
        }
        assert(inRoad === 0,
          `${inRoad} buildings stand in the carriageway, the worst `
          + `${worstRoad.toFixed(1)} m into it`);
        assert(wet2 === 0, `${wet2} buildings are in the river or over its edge`);
        assert(onBridge === 0, `${onBridge} buildings are in the bridge's corridor`);

        // No street that goes nowhere.
        //
        // Every street that fails to build — the line runs into the water, or
        // across the abbey, or off the edge — leaves the one behind it ending
        // at nothing, and a map dotted with hundred-metre stubs is most of what
        // "too many disjointed streets" was. The exceptions are the two roads
        // that are supposed to end where they end: the bridge approach, at the
        // abutment, and the embankment, at the edge of the map.
        const stubs = net.edges.filter((e) => !e.approach && !e.bank
          && (net.nodes[e.a].links.length < 2 || net.nodes[e.b].links.length < 2));
        assert(stubs.length === 0,
          `${stubs.length} streets are dead-end stubs that lead nowhere`);

        // No junction in the middle of a street.
        //
        // A junction's paving is built from the kerb lines of the streets that
        // meet it, and for two streets running straight on there is no crossing
        // point to build it from — so the pad pinched to a wedge at the node and
        // the road appeared to narrow to nothing and open out again. Ten of them
        // in a row along the embankment, which is a chain of exactly such nodes.
        // Two arms running through is not a junction; it is a street, and the
        // graph now says so.
        const dirAt = (n, l) => {
          const pts = l.edge.pts;
          const p = l.at === 0 ? pts[1] : pts[pts.length - 2];
          const dx = p.x - n.x, dz = p.z - n.z;
          const d = Math.hypot(dx, dz) || 1;
          return { x: dx / d, z: dz / d };
        };
        let through = 0;
        for (const n of net.nodes) {
          if (n.links.length !== 2) continue;
          const a = dirAt(n, n.links[0]), b2 = dirAt(n, n.links[1]);
          // Same class, and the second arm carries straight on from the first.
          if (n.links[0].edge.cls !== n.links[1].edge.cls) continue;
          if (n.links[0].edge.approach || n.links[1].edge.approach) continue;
          if (-(a.x * b2.x + a.z * b2.z) > 0.998) through++;
        }
        assert(through === 0,
          `${through} junctions sit in the middle of a straight street, which is `
          + 'where the paving pinches the road to a wedge');

        // Every junction's paving is a simple shape.
        //
        // The outline is built by walking neighbouring arms and inserting the
        // point where their kerbs cross, and it is filled by a fan from the
        // node — which needs the outline to go round the node once, in one
        // direction. When two arms are close together their kerb lines are
        // nearly parallel, so that point runs away, or lands behind the node,
        // and the outline stops being star-shaped: the fan then either folds
        // over itself and draws a spike, or fails to close and leaves bare
        // ground showing through the middle of a junction. Eighteen of two
        // hundred and fourteen pads were doing one or the other, sweeping
        // anywhere from 242° to 383° instead of 360°.
        //
        // This asks the real builder, not a copy of it.
        let folded = 0, sprawled = 0, worstSweep = 360;
        for (const n of net.nodes) {
          if (n.links.length < 2) continue;
          const R = padRadius(n);
          for (const widthOf of [(a) => a.full, (a) => a.road]) {
            const ring = junctionRing(n, widthOf);
            if (ring.length < 3) { folded++; continue; }
            let sweep = 0, back = 0, prev = null;
            for (let k = 0; k <= ring.length; k++) {
              const p = ring[k % ring.length];
              const ang = Math.atan2(p.z - n.z, p.x - n.x);
              if (prev !== null) {
                let d = ang - prev;
                while (d > Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                sweep += d;
                if (d < -1e-6) back++;
              }
              prev = ang;
              if (Math.hypot(p.x - n.x, p.z - n.z) > R * 1.45) sprawled++;
            }
            const turn = Math.abs(sweep * 180 / Math.PI);
            if (back > 0 || turn < 350 || turn > 370) {
              folded++;
              if (Math.abs(turn - 360) > Math.abs(worstSweep - 360)) worstSweep = turn;
            }
          }
        }
        assert(folded === 0,
          `${folded} junction outlines fold back on themselves or fail to close `
          + `— the worst sweeps ${worstSweep.toFixed(0)}° instead of 360°`);
        assert(sprawled === 0,
          `${sprawled} junction outline points sit outside their own paving`);

        // And no junction has two streets leaving on almost the same bearing.
        // That is not a fork, it is one road drawn twice, and it is the input
        // the geometry above cannot be given a sensible answer for.
        let folds = 0, tightest = 0;
        for (const n of net.nodes) {
          for (let i = 0; i < n.links.length; i++) {
            for (let j = i + 1; j < n.links.length; j++) {
              // The crossing is exempt: it arrives where the river lets it and
              // cannot be moved to suit the street it meets. The rule is about
              // two *streets* drawn as one, which is a thing the layout chose.
              if (n.links[i].edge.bridge || n.links[j].edge.bridge) continue;
              const a = dirAt(n, n.links[i]), b2 = dirAt(n, n.links[j]);
              const dot = a.x * b2.x + a.z * b2.z;
              if (dot > 0.82) { folds++; tightest = Math.max(tightest, dot); }
            }
          }
        }
        assert(folds === 0,
          `${folds} junctions have two streets leaving on the same bearing, the `
          + `worst ${(Math.acos(Math.min(1, tightest)) * 180 / Math.PI).toFixed(0)}° apart`);

        // The crossing is part of the street network, not a second one.
        //
        // It used to be built entirely outside it, which is two road generators
        // and so two answers about where the road is: the deck met the street
        // four metres narrower, in its own colour, with no markings and its
        // surface two metres higher, and the join was a seam.
        if (bridge) {
          const deck = net.edges.find((e) => e.bridge);
          assert(deck, 'the bridge is not an edge of the street network');
          for (const k of [deck.a, deck.b]) {
            assert(net.nodes[k].links.length >= 2,
              'a bridge lands at a junction with nothing else joining it');
          }
          const rise = deck.pts.filter((q) => q.y !== undefined).length;
          assert(rise === deck.pts.length,
            `${deck.pts.length - rise} points of the bridge carry no height, so `
            + 'that stretch of it is drawn on the riverbed');
        }

        // Everything stands square to the plan.
        //
        // A building is either aligned with the block it is in or it is one of
        // the things that made the city read as boxes dropped from a height.
        // Measured modulo a quarter turn, because a building along the short
        // side of its block is just as square to the grid as one along the long
        // side.
        const quarter = Math.PI / 2;
        const wrap = (a) => {
          let o = ((a % quarter) + quarter) % quarter;
          if (o > quarter / 2) o -= quarter;
          return o;
        };
        // The grid's own bearing, taken from the buildings themselves rather
        // than from a constant, so this holds on any level.
        const bearings = plots.map((p) => wrap(p.yaw || 0)).sort((a, b) => a - b);
        const ref = bearings[bearings.length >> 1] || 0;
        let skew = 0, worstSkew = 0;
        for (const p of plots) {
          const off = Math.abs(wrap((p.yaw || 0) - ref));
          if (off > 0.035) { skew++; worstSkew = Math.max(worstSkew, off); }
        }
        assert(skew / Math.max(1, plots.length) < 0.06,
          `${skew} of ${plots.length} buildings are out of line with the street `
          + `grid, the worst by ${(worstSkew * 180 / Math.PI).toFixed(0)}°`);

        // And none of them is off the ground. A box stood on the height of its
        // own centre hangs off the downhill end of any slope.
        let hovering = 0, worstGap = 0;
        for (const p of plots) {
          const ca = Math.cos(p.yaw || 0), sa = Math.sin(p.yaw || 0);
          const base = p.base ?? (p.top - p.h);
          for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const x = p.x + (u * p.w / 2) * ca + (v * p.d / 2) * sa;
            const z = p.z - (u * p.w / 2) * sa + (v * p.d / 2) * ca;
            const gap = terrain.heightAt(x, z) - base;
            if (gap < -0.35) {
              hovering++;
              worstGap = Math.max(worstGap, -gap);
              break;
            }
          }
        }
        assert(hovering === 0,
          `${hovering} buildings hang above the ground, the worst by `
          + `${worstGap.toFixed(1)} m`);

        const counts = city.userData.detail || {};
        assert((counts.crossings || 0) > 15,
          `only ${counts.crossings || 0} pedestrian crossings in the whole city`);
        return `${net.edges.length} streets, ${net.nodes.length} junctions, `
          + `${net.blocks.length} blocks, ${plots.length} buildings — square to `
          + 'the grid, on the ground, and none of them in the road';
      }],

      ['a severed section cannot hang in the air', () => this._calm(() => {
        // Cut a building clean through and everything above the cut must come
        // down. It used to stay up: the "is this section resting on anything"
        // test counted reachable stone anywhere in the three bands below, so a
        // tower cut through on one side reported itself as resting because the
        // *other* side of the building was still standing at that height. The
        // section then got the lean treatment rather than being released, and
        // hung over the gap at seven degrees with nothing underneath it.
        //
        // Run against a secondary structure where there is one, so the primary
        // survives for the collapse test below.
        const st = c.structures.find((x) => x !== b.primary) || b.primary;
        const gy = b.originGround;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < st.count; i++) {
          if (!(st.flags[i] & 1) || (st.flags[i] & 10)) continue;
          lo = Math.min(lo, st.py[i]); hi = Math.max(hi, st.py[i]);
        }
        assert(isFinite(lo) && hi - lo > 8,
          `${st.key} is too short to sever meaningfully`);

        // A narrow cut is enough: what is under test is whether the section
        // above a clean break is left hanging, not how much masonry the engine
        // can chew through in one tick.
        const cut = lo + (hi - lo) * 0.55;
        const band = Math.max(1.2, (hi - lo) * 0.045);
        let removed = 0;
        for (let i = 0; i < st.count; i++) {
          if (!(st.flags[i] & 1) || (st.flags[i] & 10)) continue;
          if (Math.abs(st.py[i] - cut) > band) continue;
          st.destroyChunk(i); removed++;
        }
        st.stabilityDirty = true;
        assert(removed > 20, `the cut only removed ${removed} stones`);
        c.fastForward(3.0);

        let stillFixed = 0, topFixed = -Infinity;
        for (let i = 0; i < st.count; i++) {
          if (!(st.flags[i] & 1)) continue;
          if (st.py[i] < cut + 2.5) continue;         // below the cut is fine
          if (st.flags[i] & 10) continue;             // free or islanded: falling
          if (st.lean && st.bandOf[i] >= st.lean.band) continue;   // leaning
          stillFixed++;
          topFixed = Math.max(topFixed, st.py[i] - gy);
        }
        assert(stillFixed === 0,
          `${stillFixed} stones are still standing above a clean cut through `
          + `${st.key}, the highest ${topFixed.toFixed(0)} m up`);
        return `cut ${st.key} through with ${removed} stones; nothing left hanging`;
      })],

      ['debris never freezes in mid-air', () => this._calm(() => {
        // The bug this guards against: rubble is recycled back into scenery
        // once it stops moving, and "stopped" used to mean nothing more than
        // slow. A stone at the top of its arc is momentarily slower than one
        // lying on the ground, so under budget pressure a bombardment left
        // blooms of masonry hanging in the sky — motionless, never falling,
        // and still solid enough to shoot at. Rubble that freezes onto a wall
        // and then has the wall shot out from under it is the same picture.
        const st = c.structures.find((x) => x !== b.primary) || b.primary;
        const gy = b.originGround;
        const P = c.physics;
        const RT = P.rapier.RigidBodyType;

        // Squeeze the budget: recycling only runs hard when it has to, and
        // that pressure is exactly what used to freeze stone in the air.
        const wasBudget = P.activeBudget;
        P.setBudget(200);
        try {
          for (let r = 0; r < 6; r++) {
            let best = -1, bestd = Infinity;
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < st.count; i++) {
              if (!(st.flags[i] & 1) || (st.flags[i] & 10)) continue;
              lo = Math.min(lo, st.py[i]); hi = Math.max(hi, st.py[i]);
            }
            if (!isFinite(lo)) break;
            const wantY = lo + (hi - lo) * (0.3 + r * 0.09);
            for (let i = 0; i < st.count; i++) {
              if (!(st.flags[i] & 1) || (st.flags[i] & 10)) continue;
              const d = Math.abs(st.py[i] - wantY);
              if (d < bestd) { bestd = d; best = i; }
            }
            if (best < 0) break;
            st.explode(
              { x: st.px[best], y: st.py[best], z: st.pz[best] }, 2.6, 8, 8000,
              { dir: { x: 0, y: 0.05, z: 1 }, kinetic: 0.85 },
            );
            st.stabilityDirty = true;
            c.fastForward(1.4);
          }
          c.fastForward(6.0);

          // Let the sweep converge before counting.
          //
          // The invariant worth asserting is that nothing *stays* hanging, not
          // that no stone is ever unsupported for an instant — and the instant
          // is real: a stone resting on rubble becomes unsupported the moment
          // that rubble is culled, and the sweep gets to it on its next pass a
          // fraction of a second later. Sampling between those two is how this
          // reported thirteen stones hanging while the sweep's own tally said
          // it had checked a hundred and fifty thousand and found all but
          // three hundred of them standing.
          for (let k = 0; k < 3; k++) {
            P.auditFrozen(P.frozen.length);
            c.fastForward(0.4);
          }

          let frozen = 0;
          const hanging = [];
          const tracked = new Set(P.frozen);
          for (let i = 0; i < st.count; i++) {
            if (!(st.flags[i] & 1) || !(st.flags[i] & 2)) continue;
            const body = st.bodyOf[i];
            if (!body || body.__removed || body.bodyType() !== RT.Fixed) continue;
            frozen++;
            if (st.py[i] - st.hy[i] < gy + 3) continue;
            if (P._standsOnSomething(body)) continue;
            hanging.push(`${(st.py[i] - gy).toFixed(0)}m`
              + `${tracked.has(body) ? '' : '/untracked'}`
              + `${body.__frozen ? '' : '/unflagged'}`);
          }
          assert(frozen > 20, `only ${frozen} stones were recycled — no pressure`);
          assert(hanging.length === 0,
            `${hanging.length} stones are frozen in mid-air with nothing under `
            + `them: ${hanging.slice(0, 8).join(', ')} `
            + `(list ${P.frozen.length}, dynamic ${P.dynamicSet.size}/${P.activeBudget}, `
            + `sweep ${JSON.stringify(P.sweepStats || {})})`);
          return `${frozen} stones recycled, none of them hanging`;
        } finally {
          P.setBudget(wasBudget);
        }
      })],

      ['no stone is ever drawn the size of a district', () => this._calm(() => {
        // The worst thing this engine has done on screen, and it was a
        // rendering fault rather than a physics one. `Matrix4.compose` treats
        // the quaternion as a rotation *and* a scale — it applies |q|² — so a
        // stone whose rotation reads back as anything but unit length draws at
        // the wrong size. When the wasm world traps, every transform that
        // comes back is whatever was in that memory, and a few of those draw
        // as slabs of masonry hundreds of metres across, hanging over the map
        // and blocking most of the view.
        //
        // Nothing may reach an instance matrix unchecked, so this walks the
        // matrices themselves: every stone is drawn at a stone's size, and
        // stands somewhere on the map.
        const m = new THREE.Matrix4();
        const v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        const span = c.terrain.span;
        let biggest = 0, farthest = 0, drawn = 0;
        for (const st of c.structures) {
          // Per structure, both of them: the Taj's stones are bigger than the
          // mosque's, and judging the mosque by the Taj's yardstick is how this
          // assertion managed to fail on a level where nothing was wrong.
          let stone = 0, worst = 0;
          for (let i = 0; i < st.count; i++) {
            stone = Math.max(stone, st.hx[i] * 2, st.hy[i] * 2, st.hz[i] * 2);
          }
          for (const e of st.meshes) {
            const mesh = e.mesh;
            for (let k = 0; k < mesh.count; k++) {
              mesh.getMatrixAt(k, m);
              m.decompose(v, q, sc);
              if (sc.x < 1e-4 && sc.y < 1e-4) continue;      // a destroyed stone
              drawn++;
              worst = Math.max(worst, sc.x, sc.y, sc.z);
              biggest = Math.max(biggest, worst);
              farthest = Math.max(farthest, Math.hypot(v.x, v.y, v.z));
            }
          }
          assert(worst <= stone * 1.35 + 0.2,
            `${st.key} is drawing a stone ${worst.toFixed(1)} m across, `
            + `against a largest real stone of ${stone.toFixed(1)} m`);
        }
        assert(isFinite(farthest) && farthest < span * 4,
          `a stone is being drawn ${farthest.toFixed(0)} m from the middle of `
          + `a map ${span.toFixed(0)} m across`);
        return `${drawn} stones drawn, the biggest ${biggest.toFixed(1)} m across`;
      })],

      // ── Destructive: leaves the level a pile of rubble, so it runs last.
      // Everything above needs a building to be standing in front of it.
      ['undercutting the base brings it down', () => this._calm(() => {
        // The headline behaviour, and the one that was most wrong: shelling the
        // base of a landmark used to do nothing at all until it did everything.
        //
        // What counts as success depends on the shape of the thing. A tower is
        // a cantilever and must visibly go out of plumb before it comes down —
        // that intermediate state is the whole point of the mechanism. The Taj
        // is a dome on a terrace with an aspect ratio of one; it has no lean in
        // it and never did, so demanding one would be demanding a bug.
        const st = b.primary;
        this.clearUnits();
        const h0 = st.standingHeight();
        const gy = b.originGround;
        const intactAtStart = st.monumentIntegrity;

        // Footprint, for the slenderness test.
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < st.count; i++) {
          if (!(st.flags[i] & 1) || (st.flags[i] & 10)) continue;
          minX = Math.min(minX, st.px[i]); maxX = Math.max(maxX, st.px[i]);
          minZ = Math.min(minZ, st.pz[i]); maxZ = Math.max(maxZ, st.pz[i]);
        }
        const width = Math.max(1, Math.min(maxX - minX, maxZ - minZ));
        const slender = (h0 - gy) / width;

        // Aim at the foot of the *monument*. On a level that scores only part
        // of the structure, the terrace underneath it is not the base worth
        // cutting — the piers carrying the dome are.
        // Cut *one face*, above grade. Both matter. Spreading the damage round
        // the perimeter erodes a building evenly and it settles straight down;
        // it is undercutting one side that produces a lean. And the lowest
        // stone of all is usually a buried foundation block, where shells
        // accomplish nothing.
        const mask = st._winMask;
        const face = st.origin.z - 1.0;
        const foot = () => {
          let best = -1, by = Infinity;
          for (let i = 0; i < st.count; i++) {
            if (!(st.flags[i] & 1) || (st.flags[i] & 10)) continue;
            if (mask && !mask[i]) continue;
            if (st.pz[i] > face) continue;
            if (st.py[i] < gy + 0.5) continue;
            if (st.py[i] < by) { by = st.py[i]; best = i; }
          }
          return best;
        };

        let leaned = 0;
        // Enough rounds to actually finish the job. Forty was sized against a
        // pristine tower; this test runs last, so it now starts against one
        // that is already well chewed, and a cut that stops half way through
        // leaves the thing standing for no better reason than the loop ran out.
        // Scaled to the monument. Eighty rounds was sized against a building
        // sixty metres across; a Taj at 2.2x is a hundred and twenty-five, and
        // asking the same eighty rounds to gut it is asking a different
        // question of a bigger building. The count grows with the footprint,
        // so the test keeps asking "does undercutting work here" rather than
        // "is this building small".
        const rounds = Math.round(80 * Math.min(3, Math.max(1, width / 60)));
        for (let round = 0; round < rounds; round++) {
          const i = foot();
          if (i < 0) break;
          st.explode(
            { x: st.px[i], y: st.py[i] + 1.5, z: st.pz[i] }, 1.9, 6.6, 6400,
            { dir: { x: 0, y: -0.1, z: 1 }, kinetic: 0.85 },
          );
          st.stabilityDirty = true;
          // Sampled through the wait, not just at the end of it. A lean builds
          // and resolves inside a couple of seconds, so checking once a round
          // can step straight over the part being asserted.
          for (let k = 0; k < 5; k++) {
            c.fastForward(0.24);
            leaned = Math.max(leaned, st.leanDegrees);
          }
          if (st.standingHeight() < h0 - 25) break;
        }
        // Let it finish. A tower that is three seconds into going over is a
        // tower that has been brought down, and measuring the instant the last
        // shell lands reads the height it had on the way past — which is how
        // this managed to fail on a collapse that was working perfectly.
        // Let it finish what it has started.
        //
        // Six seconds was the whole allowance, which is enough for one
        // collapse and not for two — and two is now a normal way for this to
        // go: the first section is handed over, comes to rest on the rubble
        // instead of falling, the lockout that would have frozen the building
        // in that state is lifted, and a *second* lean arms and takes it the
        // rest of the way. Caught mid-second-collapse this read as a failure,
        // with the evidence sitting right there in the message: peak lean
        // 12.28°, and a fresh lean running at 1.52° with the resultant already
        // a quarter of the way past the edge of its bearing.
        //
        // So it waits while something is still moving, up to twenty seconds,
        // and stops the moment nothing is leaning any more.
        for (let k = 0; k < 80; k++) {
          c.fastForward(0.25);
          leaned = Math.max(leaned, st.leanDegrees);
          if (!st.lean && (k > 26 || (k > 6 && st.standingHeight() < h0 - 25))) break;
        }
        const dropped = st.standingHeight() < h0 ? h0 - st.standingHeight() : 0;
        const integ = st.monumentIntegrity;
        // The lean is only required of a tall building that is still *there*.
        //
        // Slenderness alone is not the premise: by the time this runs, last in
        // a destructive suite, the tower has taken real shellfire from the
        // tests above it — which it did not before detaching a collider worked
        // — and a tower already reduced to a third of itself is a stump. A
        // stump has no lean in it and demanding one is demanding a bug.
        // Whatever state it is in now, a slender tower must have gone out of
        // plumb at *some* point on its way here — that is the high-water mark,
        // and it is the only honest way to assert the mechanism from the last
        // test in a suite that has already half demolished the thing.
        // A landmark that cannot topple is measured on whether it can be
        // quarried instead.
        //
        // This is Giza. A pyramid has no cantilever in it — every stone is
        // already sitting on a wider stone — so demanding a lean, or twenty
        // metres off the top from cutting one face, is demanding the one thing
        // the level is built around not happening. What matters there is that
        // shelling the base actually takes stone out of it, which is the whole
        // of how that level is won.
        if ((c.level.traits || {}).topples === false) {
          // Sized against the charge this test actually fires, which is an
          // M119's — lethal 1.9, radius 6.6, power 6400. That is the lightest
          // howitzer in the game, and eighty rounds of it into the side of a
          // two-and-a-third-million cubic metre pyramid should not level the
          // thing. The heaviest tier carries nearly three times the power and
          // twice the radius.
          //
          // What is asserted is that shelling works here at all. The first cut
          // of this level answered nine stones to eighty rounds, and softening
          // the stone to a quarter of its toughness only moved that to
          // thirteen — block size, not strength, is what governs it, and that
          // is worth knowing if these numbers ever need moving again.
          //
          // Measured as material, not as stones. A count cannot be compared
          // across quality tiers, because a tier is precisely a choice of how
          // big a stone is: the same eighty rounds answered seventy-two stones
          // at high and nine at low while removing 0.79% and 0.36% of the
          // monument, so a bar of ten stones failed the coarse tier for being
          // coarse rather than for being unshootable. The pyramid was also
          // genuinely harder to quarry there, which is a real fault and is
          // fixed where it belongs — in the stone size `giza.js` builds at.
          const removedFrac = 1 - integ / Math.max(0.001, intactAtStart);
          assert(removedFrac > 0.004 && st.destroyedCount > 4,
            `eighty rounds into one face took out ${st.destroyedCount} stones, `
            + `${(removedFrac * 100).toFixed(2)}% of the monument`);
          return `cannot topple, and should not: ${st.destroyedCount} stones `
            + `quarried out of one face by eighty light rounds `
            + `(${(removedFrac * 100).toFixed(2)}% of the monument)`;
        }

        if (slender > 2.5 || intactAtStart > 0.55) {
          assert((st.peakLean || 0) > 0.4 || slender < 2.0,
            `this structure has never been out of plumb by more than `
            + `${(st.peakLean || 0).toFixed(2)}° at any point`);
        }

        const requiresLean = slender > 2.5 && intactAtStart > 0.55;
        if (requiresLean) {
          assert(leaned > 0.4,
            `a tower ${slender.toFixed(1)}:1 slender and `
            + `${(intactAtStart * 100).toFixed(0)}% intact never went out of `
            + `plumb (worst ${leaned.toFixed(2)}°)`);
        }
        const L = st.lean;
        assert(dropped > 20 || integ < 0.6,
          `it kept ${(integ * 100).toFixed(0)}% of itself and lost only `
          + `${dropped.toFixed(1)} m with its base shot out `
          + `(started ${(intactAtStart * 100).toFixed(0)}% intact, `
          + `${slender.toFixed(1)}:1 slender, peak lean `
          + `${(st.peakLean || 0).toFixed(2)}°, `
          + `lean now ${L ? `${(L.angle * 180 / Math.PI).toFixed(2)}° tip `
            + `${(L.tip || 0).toFixed(2)} bearing ${(L.reachOut || 0).toFixed(2)}`
            + `/${(L.reachOut0 || 0).toFixed(2)}` : 'none'}, `
          + `${st.islands.size} sections, `
          + `${c.physics.dynamicSet.size}/${c.physics.activeBudget} bodies)`);

        // Nothing is left hanging in the air.
        //
        // The worst-looking bug this engine has had: a stone that had lost its
        // support but could not be given a body — because the budget was spent,
        // or because the release pass was filtering on the very support it no
        // longer had — simply stayed where it was, with no collider and no
        // flags, floating. A demolished tower would leave thousands of them
        // hanging over the rubble. Every living stone must be a free body, part
        // of a welded section, or standing on something.
        // A leaning structure is not a floating one.
        //
        // While a lean is running, every stone above the hinge is deliberately
        // *not* marked as reached — the support flood has condemned that slice
        // and the lean is what is holding the section up until it decides. So
        // the naive test counts the entire upper tower as hanging in mid-air:
        // measured at 6,357 stones during a lean, resolving to zero the moment
        // it finished. Which made this assertion fail at random depending on
        // whether the tower happened to be mid-topple when it ran, and report
        // a bug that was not there.
        const reach = st._reach;
        const leanFrom = st.lean ? st.lean.band : Infinity;
        let floating = 0, worstY = 0;
        for (let i = 0; i < st.count; i++) {
          if (!(st.flags[i] & 1) || (st.flags[i] & 10)) continue;   // dead, free or island
          if (reach[i]) continue;
          if (st.bandOf[i] >= leanFrom) continue;                   // carried by the lean
          floating++;
          worstY = Math.max(worstY, st.py[i] - gy);
        }
        assert(floating === 0,
          `${floating} stones are hanging unsupported in mid-air, the highest `
          + `${worstY.toFixed(0)} m up`);

        // And the rubble is rubble, not a building lying on its side.
        //
        // Given its own window, because this is a claim about a *settled*
        // wreck: the loop above stops the moment the tower is down, which is
        // the right moment to measure how far it fell and much too early to
        // ask what its pieces look like. Breaking up is progressive — a
        // section splits, the parts land, those split — and it needs a few
        // seconds on the ground, which is exactly as long as it takes in play.
        for (let k = 0; k < 34; k++) c.fastForward(0.25);
        let biggest = 0;
        for (const isl of st.islands.values()) {
          if (isl.settling) continue;
          biggest = Math.max(biggest, isl.members.length);
        }
        // Scaled to the structure, because a tier that builds the same tower
        // out of half as many stones should not get twice the licence to leave
        // it in one piece.
        const lump = Math.max(48, Math.min(420, Math.round(st.count * 0.08)));
        assert(biggest <= lump,
          `a landed section is still welded into one ${biggest}-stone slab `
          + `(the most a ${st.count}-stone structure may leave is ${lump})`);

        return requiresLean
          ? `leaned ${leaned.toFixed(1)}°, then lost ${dropped.toFixed(0)} m`
          : `${slender.toFixed(1)}:1 at ${(intactAtStart * 100).toFixed(0)}%; `
            + `peak lean ${(st.peakLean || 0).toFixed(1)}°; `
            + `down to ${(integ * 100).toFixed(0)}%`;
      })],

      ['a welded section is drawn where its colliders are', () => this._calm(() => {
        // The ball of masonry, and the assertion that would have caught it on
        // the first run rather than the fifth report.
        //
        // A section is one rigid body: its stones cannot move relative to each
        // other, so the box round where they are *drawn* has to match the box
        // round where their colliders are. It did not. Scratch aliasing in the
        // transform sync rotated every stone after the first by its
        // predecessor's rotation instead of by the body's, and a seventeen by
        // eighteen by fifty-seven metre piece of tower came out drawn as a
        // sixty-metre ball — moving as one lump, because it is one body, and
        // sinking slowly, because that body is falling.
        //
        // Nothing in the physics could have fixed it and nothing in the physics
        // was wrong. So this compares the two directly.
        const P = c.physics;
        const box = (pts) => {
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          let z0 = Infinity, z1 = -Infinity, n = 0;
          for (const p of pts) {
            if (!p) continue;
            n++;
            if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
            if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
            if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
          }
          return n ? { n, w: x1 - x0, h: y1 - y0, d: z1 - z0 } : null;
        };
        const bad = [];
        let checked = 0;
        for (const st of c.structures) {
          for (const isl of st.islands.values()) {
            const body = isl.body;
            if (!body || body.__removed || isl.members.length < 8) continue;
            const drawn = [];
            for (const i of isl.members) {
              if (!(st.flags[i] & 1)) continue;
              drawn.push({ x: st.px[i], y: st.py[i], z: st.pz[i] });
            }
            const nc = body.numColliders();
            const cols = [];
            const step = Math.max(1, Math.floor(nc / 60));
            for (let k = 0; k < nc; k += step) {
              const col = body.collider(k);
              if (col) cols.push(col.translation());
            }
            const a = box(drawn), b2 = box(cols);
            if (!a || !b2 || a.n < 8) continue;
            checked++;
            // Generous: the collider set is sampled and a stone's centre is not
            // its collider's centre. An order-of-magnitude disagreement is what
            // this is for.
            const off = Math.max(a.w - b2.w, a.h - b2.h, a.d - b2.d);
            if (off > 8 + Math.max(b2.w, b2.h, b2.d) * 0.35) {
              bad.push(`${isl.members.length} stones drawn `
                + `${a.w.toFixed(0)}×${a.h.toFixed(0)}×${a.d.toFixed(0)} m `
                + `against colliders ${b2.w.toFixed(0)}×${b2.h.toFixed(0)}×`
                + `${b2.d.toFixed(0)} m`);
            }
          }
        }
        assert(bad.length === 0,
          `${bad.length} of ${checked} welded sections are drawn as a cloud `
          + `rather than as themselves: ${bad.slice(0, 3).join('; ')}`);
        return `${checked} welded sections, every one drawn where it is`;
      })],

      ['no cloud of rubble hangs over the site', () => this._calm(() => {
        // The same complaint as the assertion above, asked a way that does not
        // trust the engine's own answer.
        //
        // That one calls `_standsOnSomething`, which is the function on trial:
        // when support meant "touching anything at all", a clump of debris in
        // mid-air satisfied it for every one of its members — each stone really
        // was resting on its neighbour — and the whole clot froze in the sky,
        // three hundred pieces of it, while the assertion reported nothing
        // hanging. So this one measures instead. Every piece of loose masonry
        // is joined to the ones it is touching, and every group that results
        // has to reach the ground.
        // Let it stop moving first. The claim is that nothing comes to *rest*
        // in mid-air, which is not the same as the claim that no stone is ever
        // off the ground: a section in free fall is exactly what should be
        // happening, and sampling in the middle of one reports it as a fault.
        for (let k = 0; k < 60 && c.physics.awakeCount > 20; k++) c.fastForward(0.25);
        const gy = b.originGround;
        const nodes = [];
        for (const st of c.structures) {
          for (let i = 0; i < st.count; i++) {
            if (!(st.flags[i] & 1)) continue;
            const r = Math.hypot(st.hx[i], st.hy[i], st.hz[i]);
            const body = (st.flags[i] & 8) ? st.islands.get(st.islandOf[i])?.body
              : st.bodyOf[i];
            nodes.push({
              x: st.px[i], y: st.py[i], z: st.pz[i], r,
              kind: (st.flags[i] & 8) ? 'island' : ((st.flags[i] & 2) ? 'free' : 'built'),
              islandId: (st.flags[i] & 8) ? `${st.key}:${st.islandOf[i]}` : undefined,
              fixed: !!body && !body.__removed
                && body.bodyType() === c.physics.rapier.RigidBodyType.Fixed,
              dead: (st.flags[i] & 8) ? !(body && !body.__removed) : false,
              settling: (st.flags[i] & 8)
                && !!st.islands.get(st.islandOf[i])?.settling,
              body,
              // Masonry still attached to the building is ground by definition;
              // so is anything lying on the terrain.
              ground: !(st.flags[i] & 10)
                || st.py[i] - st.hy[i] <= c.terrain.heightAt(st.px[i], st.pz[i]) + 1.4,
            });
          }
        }
        // Union-find over a hash grid: touching stones share a group.
        //
        // The cell has to be at least a stone wide, or two stones resting on
        // each other can sit two cells apart and never be compared: the
        // Great Pyramid's six-metre blocks on a five-metre grid reported a
        // dozen stones lying on the flank as a clump hanging in the air, with
        // the physics quite correctly saying it had found support.
        const maxR = nodes.reduce((a, n) => Math.max(a, n.r), 0);
        const CELL = Math.max(5, maxR * 1.3);
        const parent = new Int32Array(nodes.length);
        for (let i = 0; i < parent.length; i++) parent[i] = i;
        const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        const union = (a, d) => { a = find(a); d = find(d); if (a !== d) parent[d] = a; };
        const grid = new Map();
        const key = (x, y, z) => `${x},${y},${z}`;
        nodes.forEach((n, i) => {
          const k = key(Math.floor(n.x / CELL), Math.floor(n.y / CELL), Math.floor(n.z / CELL));
          let cell = grid.get(k);
          if (!cell) grid.set(k, cell = []);
          cell.push(i);
        });
        // Stones welded into one section are connected whether or not they
        // happen to touch. A section is a single rigid body: if any part of it
        // is on the ground then none of it is hanging, and joining its members
        // only by proximity reported the top of an L-shaped piece as a separate
        // clump floating over the bottom of the same piece.
        const byIsland = new Map();
        nodes.forEach((n, i) => {
          if (n.islandId === undefined) return;
          const first = byIsland.get(n.islandId);
          if (first === undefined) byIsland.set(n.islandId, i); else union(first, i);
        });
        nodes.forEach((n, i) => {
          const cx = Math.floor(n.x / CELL), cy = Math.floor(n.y / CELL), cz = Math.floor(n.z / CELL);
          for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) {
            const cell = grid.get(key(cx + a, cy + d, cz + e));
            if (!cell) continue;
            for (const j of cell) {
              if (j <= i) continue;
              const m = nodes[j];
              const gap = Math.hypot(n.x - m.x, n.y - m.y, n.z - m.z) - n.r - m.r;
              // Matched to the metre of clear air the engine allows under
              // anything it freezes. If this were tighter than that, the test
              // would keep finding stones the engine considers settled.
              if (gap < 1.2) union(i, j);
            }
          }
        });
        const groups = new Map();
        nodes.forEach((n, i) => {
          const g = find(i);
          let rec = groups.get(g);
          if (!rec) {
            groups.set(g, rec = { n: 0, ground: false, top: -Infinity, low: Infinity,
              island: 0, free: 0, built: 0, fixed: 0, settling: 0, dead: 0 });
          }
          rec.n++;
          rec[n.kind]++;
          if (n.fixed) rec.fixed++;
          if (n.settling) rec.settling++;
          if (n.dead) rec.dead++;
          if (!rec.lowNode || n.y < rec.lowNode.y) rec.lowNode = n;
          if (!rec.why && n.body && !n.body.__removed) {
            const P = c.physics;
            rec.why = {
              onGround: !!n.body.__supGround,
              supCol: n.body.__supCol,
              intact: P._footingIntact(n.body),
              findsNow: !!P._findSupport(n.body),
              cols: n.body.numColliders(),
              strikes: n.body.__hangStrikes || 0,
              inList: P.frozen.indexOf(n.body) >= 0,
            };
          }
          if (n.ground) rec.ground = true;
          const h = n.y - c.terrain.heightAt(n.x, n.z);
          if (h > rec.top) rec.top = h;
          if (h < rec.low) rec.low = h;
        });
        // A single stone caught at the top of its arc is not a cloud, and a
        // stone genuinely in free fall is the thing we want to see happen. So
        // the complaint is groups that have *stopped*: several pieces, all of
        // them frozen back into scenery, well clear of the ground, with nothing
        // joining them to it.
        const floating = [...groups.values()]
          .filter((r) => !r.ground && r.n >= 4 && r.low > 6 && r.fixed === r.n)
          .sort((a, d) => d.n - a.n);
        const total = floating.reduce((a, r) => a + r.n, 0);
        const worst = floating[0];
        if (floating.length) {
          for (const r of floating.slice(0, 6)) {
            const L = r.lowNode;
            if (!L) continue;
            const hit = c.physics.castRay(
              { x: L.x, y: L.y - L.r - 0.05, z: L.z }, { x: 0, y: -1, z: 0 }, 60);
            r.dropTo = hit ? +hit.toi.toFixed(2) : null;
            r.terrainBelow = +(L.y - L.r - c.terrain.heightAt(L.x, L.z)).toFixed(2);
            delete r.lowNode;
          }
          console.log('[tumble] hanging rubble:', JSON.stringify(floating.slice(0, 6)));
        }
        for (const r of floating) delete r.lowNode;
        assert(floating.length === 0,
          `${floating.length} clumps of masonry (${total} stones) are hanging `
          + `clear of the ground — the biggest ${worst?.n} stones at `
          + `${worst?.low.toFixed(0)}–${worst?.top.toFixed(0)} m up, with `
          + `${worst?.dropTo ?? '∞'} m of clear air under it `
          + `(${worst?.island} welded, ${worst?.free} loose, ${worst?.built} built)`);
        return `${groups.size} groups of rubble, every one of them on the ground`;
      })],
    ];
  }

  runTests() {
    this.testOut.innerHTML = '<div class="tm-test running">running…</div>';
    // Let the "running" line paint before the suite blocks the thread.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const rows = [];
      let pass = 0, fail = 0;
      for (const [name, fn] of this.tests()) {
        let ok = true, detail = '';
        const t0 = performance.now();
        try {
          detail = fn() || '';
        } catch (err) {
          ok = false;
          detail = err.message;
        }
        const ms = performance.now() - t0;
        if (ok) pass++; else fail++;
        rows.push(`<div class="tm-test ${ok ? 'pass' : 'fail'}">
          <b>${ok ? 'PASS' : 'FAIL'}</b>
          <span>${name}</span>
          <i>${detail}</i>
          <u>${ms.toFixed(0)}ms</u></div>`);
      }
      rows.unshift(`<div class="tm-test summary ${fail ? 'fail' : 'pass'}">
        ${pass} passed, ${fail} failed</div>`);
      this.testOut.innerHTML = rows.join('');
      this.lastResults = { pass, fail };
      console.log(`[tumble] self tests: ${pass} passed, ${fail} failed`);
    }));
    return this.lastResults;
  }

  /** Synchronous variant, for the headless harness. */
  runTestsSync() {
    const out = [];
    let pass = 0, fail = 0;
    for (const [name, fn] of this.tests()) {
      try {
        const detail = fn() || '';
        pass++;
        out.push({ name, ok: true, detail });
      } catch (err) {
        fail++;
        out.push({ name, ok: false, detail: err.message });
      }
    }
    this.lastResults = { pass, fail, out };
    return this.lastResults;
  }

  /**
   * Slow the world briefly, then ease back.
   *
   * Lives here because the time scale does, and because a single owner of
   * "how fast is the game running" is the only way the tuning slider and the
   * collapse beat can coexist without fighting each other.
   */
  dramaticPause(seconds, scale) {
    if (this.paused) return;
    this._drama = { left: seconds, total: seconds, scale, from: this.timeScale };
  }

  refresh() {
    if (!this.open) return;
    for (const fn of this._rows) {
      try { fn(); } catch { /* a section whose system is mid-teardown */ }
    }
  }

  update(dt) {
    if (this._drama) {
      const d = this._drama;
      d.left -= dt;
      if (d.left <= 0) {
        this.timeScale = d.from;
        this._drama = null;
      } else {
        // Snap down, then ease back over the last third of the beat.
        const tail = d.total * 0.34;
        const k = d.left > tail ? 0 : 1 - d.left / tail;
        this.timeScale = d.scale + (d.from - d.scale) * k;
      }
    }
    if (!this.open) return;
    this._lastRefresh += dt;
    if (this._lastRefresh < 0.2) return;
    this._lastRefresh = 0;
    this.refresh();
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function sum(list, get) {
  let t = 0;
  for (const x of list) t += get(x);
  return t;
}

function fmt(v) {
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString();
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
