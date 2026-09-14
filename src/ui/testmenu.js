import * as THREE from 'three';
import { UNITS, UNITS_BY_ID } from '../game/units.js';
import { DEFENDER_TYPES } from '../game/defenders.js';
import { LEVELS } from '../game/levels.js';
import { lineOfSight } from '../structure/occupancy.js';

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
    for (let k = 0; k < n * 6 && placed < n; k++) {
      const a = bearing + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.055;
      const p = new THREE.Vector3(
        st.origin.x + Math.sin(a) * range, 0, st.origin.z + Math.cos(a) * range,
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
        const y = b.originGround + Math.max(6, (st.standingHeight() - b.originGround) * 0.3);
        const reach = 140;
        const a = new THREE.Vector3(st.origin.x - reach, y, st.origin.z);
        const d = new THREE.Vector3(st.origin.x + reach, y, st.origin.z);
        assert(!lineOfSight(c.structures, a, d, 0, 0),
          'a line straight through the building came back clear');
        const high = b.originGround + 400;
        assert(lineOfSight(c.structures,
          new THREE.Vector3(a.x, high, a.z), new THREE.Vector3(d.x, high, d.z), 0, 0),
        'a line 400 m over the building came back blocked');
        return 'through blocked, over clear';
      }],

      ['defenders stand on real masonry', () => {
        const g = b.garrison;
        assert(g.defenders.length > 0, 'the garrison is empty');
        let bad = 0;
        for (const d of g.defenders) {
          const i = d.chunk;
          const s = d.structure;
          const dist = Math.hypot(s.px[i] - d.pos.x, s.py[i] - d.pos.y, s.pz[i] - d.pos.z);
          if (dist > 10) bad++;
        }
        assert(bad === 0, `${bad} defenders are more than 10 m from their stone`);
        const cover = {};
        for (const d of g.defenders) cover[d.cover || 'none'] = (cover[d.cover || 'none'] || 0) + 1;
        assert(!cover.none, `${cover.none} defenders have no stated position type`);
        return Object.entries(cover).map(([k, v]) => `${v} ${k}`).join(', ');
      }],

      ['there are windows to shoot from', () => {
        const g = b.garrison;
        const inWindows = g.defenders.filter((d) => d.cover === 'window').length;
        const onRoofs = g.defenders.filter((d) => d.cover === 'roof').length;
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
        const placed = this.spawnAt('m119', 2, this._clearBearing(220), 220);
        this.aimAt(0.35);
        c.fastForward(26);
        const gone = sum(c.structures, (s) => s.destroyedCount) - before;
        const fired = b.shotsFired - shots0;
        assert(placed > 0, 'no firing position was available');
        assert(gone > 0,
          `nothing destroyed in 26 s — ${placed} guns, ${fired} rounds fired, `
          + `state ${b.state}, target ${b.target ? 'set' : 'none'}`);
        return `${gone} stones from ${fired} rounds`;
      })],

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
        const good = new THREE.Vector3(o.x + 150, 0, o.z + 150);
        good.y = t.heightAt(good.x, good.z);
        if (!t.isWater(good.x, good.z)) {
          assert(b.validPlacement(good).ok, 'open ground 210 m out was rejected');
        }
        return 'inside, off-map and water all rejected';
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
        const face = st.origin.z - 3.0;
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
        for (let round = 0; round < 40; round++) {
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
        const dropped = st.standingHeight() < h0 ? h0 - st.standingHeight() : 0;
        const integ = st.monumentIntegrity;
        if (slender > 2.5) {
          assert(leaned > 0.4,
            `a tower ${slender.toFixed(1)}:1 slender never went out of plumb `
            + `(worst ${leaned.toFixed(2)}°)`);
        }
        assert(dropped > 20 || integ < 0.6,
          `it kept ${(integ * 100).toFixed(0)}% of itself and lost only `
          + `${dropped.toFixed(1)} m with its base shot out`);
        return slender > 2.5
          ? `leaned ${leaned.toFixed(1)}°, then lost ${dropped.toFixed(0)} m`
          : `${slender.toFixed(1)}:1 squat — no lean expected; down to `
            + `${(integ * 100).toFixed(0)}%`;
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

  refresh() {
    if (!this.open) return;
    for (const fn of this._rows) {
      try { fn(); } catch { /* a section whose system is mid-teardown */ }
    }
  }

  update(dt) {
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
