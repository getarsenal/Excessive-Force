/**
 * The performance test, on the device in the hand.
 *
 * Started from the test panel's PERFORMANCE section in a battle, it plays a
 * fixed script through the real frame loop and measures every frame the
 * phone actually draws: the battle standing quiet, the camera circling, a
 * battery set up and firing, an air strike and the gunship overhead, the
 * landmark's base blown out, and the quiet scene again at the end to see
 * how far the phone has slowed while it warmed up. LONG plays the fight on
 * for ten minutes so the battery's own reading moves and the heat shows.
 *
 * What it records a frame: the time since the last drawn frame (what the
 * eye sees), the simulation's milliseconds, the time to hand the frame to
 * the GPU, the GPU's own milliseconds where the browser will say
 * (`EXT_disjoint_timer_query_webgl2`: Chrome on Android, not Safari), the
 * triangles and draw calls across every pass, and whether the shadow map
 * was redrawn. Then the battery's level and charging state where the
 * browser exposes it (`navigator.getBattery`, again not Safari: an iPhone's
 * figures are typed in on the card), the JS heap where it is exposed, and
 * how much quality the governor shed.
 *
 * The run's summary is kept (`tt.perfruns`, the last thirty) so the card
 * compares each run with the last one on the same level and tier, and
 * COPY puts the whole record on the clipboard to send.
 *
 * The test leaves the battle in pieces, so the card offers a restart. While
 * it runs the battle can be neither won nor lost (`battle.holdEnd`), the
 * guns are free and cannot be killed, and the player should leave the
 * screen alone.
 */
import * as THREE from 'three';

const KEY = 'tt.perfruns';
const KEEP = 30;

/** The script. Seconds of real time each; `long` appends the sustained fight. */
const QUICK = [
  { id: 'quiet', name: 'Quiet', secs: 20 },
  { id: 'pan', name: 'Camera circling', secs: 20 },
  { id: 'battery', name: 'Battery firing', secs: 30 },
  { id: 'air', name: 'Air strike & gunship', secs: 25 },
  { id: 'collapse', name: 'Landmark collapsing', secs: 25 },
  { id: 'quiet2', name: 'Quiet again', secs: 20 },
];
const SUSTAIN_MIN = 7;   // LONG: minutes of fight between the collapse and the last quiet

const pct = (a, p) => {
  if (!a.length) return null;
  const v = a.slice().sort((x, y) => x - y);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** The GPU's own clock on the frame, where the browser lends one. */
class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    try { this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch { this.ext = null; }
    this.pending = [];
    this.active = null;
  }
  get ok() { return !!this.ext; }
  begin() {
    if (!this.ext || this.active || this.pending.length > 6) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  /** Finished queries, in milliseconds; a disjoint one (clock changed under it) is thrown away. */
  poll() {
    const gl = this.gl, out = [];
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      this.pending.shift();
      if (!disjoint) out.push(ns / 1e6);
    }
    return out;
  }
  dispose() {
    if (this.active) { try { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); } catch { /* gone */ } this.active = null; }
    for (const q of this.pending) { try { this.gl.deleteQuery(q); } catch { /* gone */ } }
    this.pending = [];
  }
}

export class PerfTest {
  /**
   * @param {object} c { battle, engine, physics, rig, quality, level, governor, power, onOpen(bool), restart() }
   */
  constructor(c) {
    this.c = c;
    this.running = false;
    this.run = null;
    this._chip = null;
    this._card = null;
  }

  // ── Starting and stopping ─────────────────────────────────────────────

  /** `opts.scale` shortens every scene, for the harness (tools/perftestprobe.mjs). */
  async start(mode = 'quick', opts = {}) {
    const { battle, engine } = this.c;
    if (this.running) return false;
    if (battle.state !== 'playing') { this._toast('Start a battle first: the test runs in a fight.'); return false; }
    const R = engine.renderer;
    // QUICK takes its second quiet reading before the collapse, because the
    // seconds after one are the physics settling rubble, not the phone
    // getting hot; LONG takes it at the end, minutes after the rubble is down.
    const byId = (id) => ({ ...QUICK.find((s) => s.id === id) });
    const scenes = mode === 'long'
      ? ['quiet', 'pan', 'battery', 'air', 'collapse'].map(byId)
      : ['quiet', 'pan', 'battery', 'air', 'quiet2', 'collapse'].map(byId);
    if (mode === 'long') {
      for (let m = 1; m <= SUSTAIN_MIN; m++) scenes.push({ id: `sustain${m}`, name: `Fight, minute ${m}`, secs: 60, sustain: true });
      scenes.push(byId('quiet2'));
    }
    if (opts.scale) for (const sc of scenes) sc.secs *= opts.scale;
    this.run = {
      mode, scenes, at: 0, sceneT: 0, t0: performance.now(),
      started: new Date().toISOString(),
      device: this._device(),
      battery: { start: await this._battery() },
      heapStart: this._heap(),
      shedStart: this.c.governor?.stage ?? null,
      samples: scenes.map(() => ({ dt: [], sim: [], submit: [], gpu: [], tris: [], calls: [], shadow: 0, frames: 0, awake: 0, shed: 0 })),
      gpu: new GpuTimer(R.getContext()),
      autoReset: R.info.autoReset,
      stopped: false,
    };
    R.info.autoReset = false;
    battle.holdEnd = true;
    battle.freeBuild = true;
    battle.unlockAll = true;
    battle.invulnerable = true;
    this.running = true;
    this.c.onOpen?.(false);
    this._enter(0);
    this._showChip();
    return true;
  }

  cancel() {
    if (!this.running) return;
    this.run.stopped = true;
    this._finish();
  }

  // ── The frame's hooks (main.js) ───────────────────────────────────────

  /** Before the draw: counters reset, the GPU's clock started, the shadow map's intent noted. */
  beforeRender() {
    const R = this.c.engine.renderer;
    R.info.reset();
    this._shadow = R.shadowMap.enabled && (R.shadowMap.autoUpdate || R.shadowMap.needsUpdate);
    this.run.gpu.begin();
  }

  /**
   * After the draw. `dtMs` the time since the last drawn frame, `simMs` the
   * frame's work before the draw, `submitMs` the draw's own CPU time.
   */
  afterRender(dtMs, simMs, submitMs) {
    const run = this.run;
    if (!run) return;
    run.gpu.end();
    const S = run.samples[run.at];
    const R = this.c.engine.renderer;
    S.frames++;
    if (S.frames > 1) S.dt.push(dtMs);   // the first is the scene change itself
    S.sim.push(simMs); S.submit.push(submitMs);
    S.tris.push(R.info.render.triangles); S.calls.push(R.info.render.calls);
    if (this._shadow) S.shadow++;
    S.awake = Math.max(S.awake, this.c.physics.awakeCount);
    S.shed = Math.max(S.shed, this.c.governor?.stage ?? 0);
    for (const ms of run.gpu.poll()) S.gpu.push(ms);
    const sec = Math.min(0.25, dtMs / 1000);
    run.sceneT += sec;
    this._drive(run.scenes[run.at], sec);
    if (run.sceneT >= run.scenes[run.at].secs) {
      if (run.at + 1 >= run.scenes.length) { this._finish(); return; }
      this._enter(run.at + 1);
    }
    this._chipTick();
  }

  // ── The script ────────────────────────────────────────────────────────

  _enter(i) {
    const run = this.run;
    run.at = i;
    run.sceneT = 0;
    run.scenes[i].clock = 0;
    const s = run.scenes[i];
    const { battle } = this.c;
    try {
      if (s.id === 'quiet') this._pose = this._camera();
      if (s.id === 'quiet2') this._calm();
      if (s.id === 'battery') this._deployBattery();
      if (s.id === 'air') this._callAir();
      if (s.id === 'collapse') this._blowBase();
      if (s.sustain && i > 0 && !run.scenes[i - 1].sustain) this._deployBattery(3);
      if (s.id === 'collapse' && i > 0 && run.scenes[i - 1].id === 'quiet2') battle.setTarget(this._aim(), 'perf');
    } catch (e) { console.warn('[perftest] scene setup', s.id, e); }
  }

  /** Per frame, what the scene does: the camera circles in the pan, again in the sustained fight. */
  _drive(s, sec) {
    const { rig, battle } = this.c;
    s.clock += sec;
    if (s.id === 'pan' || (s.sustain && Math.floor(s.clock / 15) % 2 === 1)) rig.desiredYaw += sec * 0.35;
    // The sustained fight keeps something in the air.
    if (s.sustain && !s._air && s.clock > 30) { s._air = true; this._callAir(true); }
    void battle;
  }

  _camera() {
    const r = this.c.rig;
    return { yaw: r.desiredYaw, pitch: r.desiredPitch, dist: r.desiredDistance, target: r.desiredTarget.clone() };
  }

  /**
   * The last scene is the first one again, as near as a wrecked battle
   * allows: the guns taken off, the target cleared, the camera back where it
   * stood. Whatever is slower then than at the start is mostly the phone
   * having got hot (and some rubble that was not there before).
   */
  _calm() {
    const { battle, rig } = this.c;
    for (const u of battle.units.slice()) if (u.alive) battle.removeUnit(u);
    battle.clearTarget?.();
    const p = this._pose;
    if (p) { rig.desiredYaw = p.yaw; rig.desiredPitch = p.pitch; rig.desiredDistance = p.dist; rig.desiredTarget.copy(p.target); }
  }

  _aim() {
    const { battle } = this.c;
    const st = battle.primary, o = st.origin;
    const h = Math.min(40, Math.max(8, (st.standingHeight?.() ?? 30) - battle.originGround) * 0.35);
    return new THREE.Vector3(o.x, battle.originGround + h, o.z);
  }

  _deployBattery(n = 6) {
    const { battle } = this.c;
    const aim = this._aim();
    battle.setTarget(aim, 'perf');
    const kinds = ['m777', 'm109', 'm270', 'm777', 'm109', 'm119'];
    let placed = 0;
    for (const rad of [240, 290, 340, 400]) {
      for (let a = 0; a < 360 && placed < n; a += 24) {
        const ang = (a + rad) * Math.PI / 180;
        const x = aim.x + Math.cos(ang) * rad, z = aim.z + Math.sin(ang) * rad;
        const p = new THREE.Vector3(x, battle.terrain.heightAt(x, z), z);
        if (!battle.validPlacement(p, null).ok) continue;
        const before = battle.units.length + (battle.pending?.length || 0);
        battle.deploy(kinds[placed % kinds.length], p);
        if (battle.units.length + (battle.pending?.length || 0) > before) placed++;
      }
      if (placed >= n) break;
    }
    return placed;
  }

  _callAir(light = false) {
    const { battle } = this.c;
    const aim = this._aim();
    battle.callStrike('f15', aim);
    if (light) return;
    setTimeout(() => { if (this.running) battle.callStrike('ac130', aim); }, 1500);
    setTimeout(() => { if (this.running) battle.callStrike('f15', aim.clone().add(new THREE.Vector3(12, 0, -8))); }, 9000);
  }

  /** Charges round the landmark's foot: the outermost low stone in each of eight sectors. */
  _blowBase() {
    const { battle } = this.c;
    const st = battle.primary, o = st.origin, g = battle.originGround;
    const best = new Array(8).fill(-1), bestR = new Array(8).fill(0);
    for (let i = 0; i < st.count; i++) {
      if (!(st.flags[i] & 1) || (st.flags[i] & (2 | 8))) continue;
      const y = st.py[i] - g;
      if (y < 0.5 || y > 9) continue;
      const dx = st.px[i] - o.x, dz = st.pz[i] - o.z, r = Math.hypot(dx, dz);
      const k = Math.min(7, Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 8));
      if (r > bestR[k]) { bestR[k] = r; best[k] = i; }
    }
    for (const i of best) {
      if (i < 0) continue;
      st.explode({ x: st.px[i], y: st.py[i], z: st.pz[i] }, 4, 9, 60000, { dir: { x: 0, y: 0.1, z: 1 }, kinetic: 0.8 });
    }
    st.stabilityDirty = true;
  }

  // ── The end ───────────────────────────────────────────────────────────

  async _finish() {
    const run = this.run;
    if (!run || !this.running) return;
    this.running = false;
    const { engine, battle } = this.c;
    engine.renderer.info.autoReset = run.autoReset;
    run.gpu.dispose();
    this._hideChip();
    const target = this.c.power?.gap?.() || 0;
    const budget = target > 0 ? target : 1000 / 60;
    const scenes = run.scenes.map((s, i) => {
      const S = run.samples[i];
      const work = S.sim.map((v, k) => v + S.submit[k]);
      const secs = Math.max(0.001, S.dt.reduce((a, b) => a + b, 0) / 1000);
      return {
        id: s.id, name: s.name, frames: S.frames,
        fps: r1(S.dt.length / secs),
        frameP50: r1(pct(S.dt, 0.5)), frameP95: r1(pct(S.dt, 0.95)), frameP99: r1(pct(S.dt, 0.99)),
        hitchPct: S.dt.length ? r1(100 * S.dt.filter((d) => d > budget * 1.5).length / S.dt.length) : null,
        simP50: r1(pct(S.sim, 0.5)), simP95: r1(pct(S.sim, 0.95)),
        submitP50: r1(pct(S.submit, 0.5)),
        workP50: r1(pct(work, 0.5)), workP95: r1(pct(work, 0.95)),
        gpuP50: r1(pct(S.gpu, 0.5)), gpuP95: r1(pct(S.gpu, 0.95)),
        trisK: S.tris.length ? Math.round(mean(S.tris) / 1000) : null,
        calls: S.calls.length ? Math.round(mean(S.calls)) : null,
        shadowPct: S.frames ? Math.round(100 * S.shadow / S.frames) : null,
        awakeMax: S.awake, shedMax: S.shed,
      };
    }).filter((s) => s.frames > 0);
    const q1 = scenes.find((s) => s.id === 'quiet'), q2 = scenes.find((s) => s.id === 'quiet2');
    const drift = q1 && q2 && q1.workP50 ? {
      work: r1(100 * (q2.workP50 / q1.workP50 - 1)),
      frame: q1.frameP50 ? r1(100 * (q2.frameP50 / q1.frameP50 - 1)) : null,
      gpu: q1.gpuP50 && q2.gpuP50 ? r1(100 * (q2.gpuP50 / q1.gpuP50 - 1)) : null,
    } : null;
    // LONG: the sustained fight's first minute against its last, the cleaner
    // reading of heat, since the scene is the same throughout.
    const sus = scenes.filter((s) => s.id.startsWith('sustain'));
    const trend = sus.length >= 2 && sus[0].workP50 ? {
      work: r1(100 * (sus[sus.length - 1].workP50 / sus[0].workP50 - 1)),
      frame: sus[0].frameP50 ? r1(100 * (sus[sus.length - 1].frameP50 / sus[0].frameP50 - 1)) : null,
      fps: [sus[0].fps, sus[sus.length - 1].fps],
    } : null;
    const minutes = (performance.now() - run.t0) / 60000;
    const bEnd = await this._battery();
    const b0 = run.battery.start;
    let drain = null;
    if (b0 && bEnd && !b0.charging && !bEnd.charging && b0.level > bEnd.level) drain = r1((b0.level - bEnd.level) / (minutes / 60));
    const all = scenes.filter((s) => s.id !== 'quiet2');
    const rec = {
      v: 1, at: run.started, mode: run.mode, stopped: run.stopped,
      level: this.c.level?.id, tier: this.c.quality?.id,
      minutes: r1(minutes), device: run.device,
      saver: !!this.c.power?.saver, lean: !!this.c.power?.lean, targetFps: target > 0 ? Math.round(1000 / target) : null,
      gpuTimer: run.gpu.ok,
      battery: { start: b0, end: bEnd, drainPerHour: drain, manualStart: null, manualEnd: null },
      heapMB: { start: run.heapStart, end: this._heap() },
      shed: { start: run.shedStart, end: this.c.governor?.stage ?? null, says: this.c.governor?.shed ?? null },
      summary: {
        fps: r1(mean(all.map((s) => s.fps))),
        workP50: r1(mean(all.map((s) => s.workP50))),
        gpuP50: run.gpu.ok ? r1(mean(all.map((s) => s.gpuP50).filter((v) => v != null))) : null,
        hitchPct: r1(mean(all.map((s) => s.hitchPct))),
        shadowPct: r1(mean(all.map((s) => s.shadowPct))),
        trisK: Math.round(mean(all.map((s) => s.trisK))),
      },
      drift, trend, scenes,
    };
    const prev = this.history().find((h) => h.level === rec.level && h.tier === rec.tier && h.mode === rec.mode);
    this._save(rec);
    this.run = null;
    battle.invulnerable = false;
    console.log('[perftest]', JSON.stringify(rec));
    this.last = rec;
    this.showCard(rec, prev);
    return rec;
  }

  // ── Readings ──────────────────────────────────────────────────────────

  _device() {
    const R = this.c.engine.renderer, gl = R.getContext();
    let gpu = '';
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); } catch { /* not told */ }
    const size = R.getDrawingBufferSize(new THREE.Vector2());
    return {
      ua: navigator.userAgent, gpu, cores: navigator.hardwareConcurrency || null, memGB: navigator.deviceMemory || null,
      screen: `${screen.width}×${screen.height}`, dpr: window.devicePixelRatio, renderScale: R.getPixelRatio(),
      buffer: `${size.x}×${size.y}`, shadows: R.shadowMap.enabled,
    };
  }

  async _battery() {
    try {
      if (!navigator.getBattery) return null;
      const b = await navigator.getBattery();
      return { level: Math.round(b.level * 100), charging: b.charging };
    } catch { return null; }
  }

  _heap() {
    const m = performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  }

  // ── History ───────────────────────────────────────────────────────────

  history() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  _save(rec) {
    try {
      const h = this.history();
      h.unshift(rec);
      localStorage.setItem(KEY, JSON.stringify(h.slice(0, KEEP)));
    } catch { /* full or blocked: the card still shows it */ }
  }

  _update(rec) {
    try {
      const h = this.history();
      const i = h.findIndex((x) => x.at === rec.at);
      if (i >= 0) { h[i] = rec; localStorage.setItem(KEY, JSON.stringify(h)); }
    } catch { /* blocked */ }
  }

  // ── On screen ─────────────────────────────────────────────────────────

  _showChip() {
    const el = document.createElement('div');
    el.id = 'perf-chip';
    el.innerHTML = '<span class="pc-dot"></span><span class="pc-text"></span><button type="button">STOP</button>';
    el.querySelector('button').addEventListener('click', () => this.cancel());
    document.getElementById('ui').appendChild(el);
    this._chip = el;
    this._chipText = el.querySelector('.pc-text');
    this._chipAt = -1;
    this._chipTick(true);
  }

  _chipTick(force = false) {
    if (!this._chip || !this.run) return;
    const run = this.run;
    const sec = Math.floor((performance.now() - run.t0) / 1000);
    if (!force && sec === this._chipAt) return;
    this._chipAt = sec;
    const total = run.scenes.reduce((a, s) => a + s.secs, 0);
    const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this._chipText.textContent = `PERF TEST · ${run.scenes[run.at].name.toUpperCase()} · ${run.at + 1}/${run.scenes.length} · ${mm(sec)} / ~${mm(total)} · HANDS OFF`;
  }

  _hideChip() {
    if (this._chip) { this._chip.remove(); this._chip = null; }
  }

  _toast(msg) {
    const t = document.createElement('div');
    t.className = 'perf-toast';
    t.textContent = msg;
    document.getElementById('ui').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /** The results card: the summary, each scene, the drift, the battery, and the last run beside it. */
  showCard(rec = this.last || this.history()[0], prev = null) {
    if (!rec) { this._toast('No performance runs yet.'); return; }
    if (this._card) this._card.remove();
    const el = document.createElement('div');
    el.id = 'perf-card';
    const f = (v, u = '') => (v == null ? '—' : `${v}${u}`);
    const delta = (a, b, lowerBetter) => {
      if (a == null || b == null || !b) return '';
      const d = 100 * (a / b - 1);
      if (Math.abs(d) < 0.5) return '<i class="pd same">same as last</i>';
      const good = lowerBetter ? d < 0 : d > 0;
      return `<i class="pd ${good ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${d.toFixed(0)}% vs last</i>`;
    };
    const S = rec.summary, P = prev?.summary;
    const bat = rec.battery;
    const batText = bat.drainPerHour != null ? `${bat.drainPerHour}% an hour`
      : bat.start == null ? 'not readable in this browser'
        : bat.start.charging ? 'charging: unplug and run LONG'
          : 'too little change: run LONG';
    const rows = rec.scenes.map((s) => `<tr><th scope="row">${s.name}</th><td>${f(s.fps)}</td><td>${f(s.frameP50)} / ${f(s.frameP95)}</td><td>${f(s.hitchPct, '%')}</td><td>${f(s.workP50)} / ${f(s.workP95)}</td><td>${f(s.gpuP50)}</td><td>${f(s.trisK, 'k')}</td><td>${f(s.calls)}</td><td>${f(s.shadowPct, '%')}</td></tr>`).join('');
    const hist = this.history().slice(0, 8).map((h) => `<tr><td>${h.at.slice(5, 16).replace('T', ' ')}</td><td>${h.level || '?'}</td><td>${h.mode}${h.stopped ? ' (stopped)' : ''}</td><td>${f(h.summary.fps)}</td><td>${f(h.summary.workP50)}</td><td>${f(h.summary.hitchPct, '%')}</td><td>${h.battery?.drainPerHour != null ? h.battery.drainPerHour + '%/h' : (h.battery?.manualStart != null && h.battery?.manualEnd != null ? `${h.battery.manualStart}→${h.battery.manualEnd}%` : '—')}</td></tr>`).join('');
    el.innerHTML = `
      <div class="pcard" role="dialog" aria-label="Performance test results">
        <div class="pc-head"><b>PERFORMANCE TEST</b><span>${rec.level || ''} · ${rec.tier} tier · ${rec.mode.toUpperCase()} · ${rec.minutes} min${rec.stopped ? ' · STOPPED EARLY' : ''}</span></div>
        <div class="pc-tiles">
          <div><b>${f(S.fps)}</b><span>frames a second${rec.targetFps ? ` (target ${rec.targetFps})` : ''}</span>${delta(S.fps, P?.fps, false)}</div>
          <div><b>${f(S.workP50, ' ms')}</b><span>CPU work a frame</span>${delta(S.workP50, P?.workP50, true)}</div>
          <div><b>${rec.gpuTimer ? f(S.gpuP50, ' ms') : 'n/a'}</b><span>GPU time a frame</span>${rec.gpuTimer ? delta(S.gpuP50, P?.gpuP50, true) : '<i class="pd">browser does not say</i>'}</div>
          <div><b>${f(S.hitchPct, '%')}</b><span>frames that hitched</span>${delta(S.hitchPct, P?.hitchPct, true)}</div>
          ${rec.trend
    ? `<div><b>${rec.trend.work > 0 ? '+' : ''}${rec.trend.work}%</b><span>CPU work, minute 1 to minute ${rec.scenes.filter((s) => s.id.startsWith('sustain')).length} (heat)</span><i class="pd">fps ${f(rec.trend.fps[0])} → ${f(rec.trend.fps[1])}</i></div>`
    : `<div><b>${rec.drift ? `${rec.drift.work > 0 ? '+' : ''}${rec.drift.work}%` : '—'}</b><span>CPU work, first quiet to last (heat)</span>${rec.drift?.gpu != null ? `<i class="pd">GPU ${rec.drift.gpu > 0 ? '+' : ''}${rec.drift.gpu}%</i>` : ''}</div>`}
          <div><b>${batText.includes('%') ? batText.replace(' an hour', '') : '—'}</b><span>battery an hour${batText.includes('%') ? '' : `: ${batText}`}</span></div>
        </div>
        <div class="pc-bat">
          <span>Battery % at start and end (type them if the phone shows them and the browser does not):</span>
          <label>start <input id="pc-b0" type="number" inputmode="numeric" min="0" max="100" value="${bat.manualStart ?? (bat.start?.level ?? '')}"></label>
          <label>end <input id="pc-b1" type="number" inputmode="numeric" min="0" max="100" value="${bat.manualEnd ?? (bat.end?.level ?? '')}"></label>
        </div>
        <div class="pc-scroll"><table>
          <thead><tr><th>Scene</th><th>fps</th><th>frame ms p50/p95</th><th>hitch</th><th>CPU ms p50/p95</th><th>GPU ms</th><th>tris</th><th>calls</th><th>shadow</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <div class="pc-meta">${rec.device.buffer} px · ${rec.device.gpu || 'GPU unnamed'} · ${rec.device.cores || '?'} cores · saver ${rec.saver ? 'on' : 'off'} · heap ${f(rec.heapMB.start)}→${f(rec.heapMB.end)} MB · quality shed: ${rec.shed.says || '—'}</div>
        <details class="pc-hist"><summary>Previous runs</summary><div class="pc-scroll"><table>
          <thead><tr><th>When</th><th>Level</th><th>Run</th><th>fps</th><th>CPU ms</th><th>hitch</th><th>battery</th></tr></thead><tbody>${hist}</tbody></table></div></details>
        <div class="pc-btns">
          <button type="button" data-a="copy">COPY RESULTS</button>
          <button type="button" data-a="restart">RESTART BATTLE</button>
          <button type="button" data-a="close">CLOSE</button>
        </div>
      </div>`;
    const keepBattery = () => {
      const v0 = el.querySelector('#pc-b0').value, v1 = el.querySelector('#pc-b1').value;
      rec.battery.manualStart = v0 === '' ? null : Number(v0);
      rec.battery.manualEnd = v1 === '' ? null : Number(v1);
      if (rec.battery.manualStart != null && rec.battery.manualEnd != null && rec.minutes > 0 && rec.battery.drainPerHour == null) {
        rec.battery.manualPerHour = r1((rec.battery.manualStart - rec.battery.manualEnd) / (rec.minutes / 60));
      }
      this._update(rec);
    };
    el.querySelector('#pc-b0').addEventListener('change', keepBattery);
    el.querySelector('#pc-b1').addEventListener('change', keepBattery);
    el.querySelector('.pc-btns').addEventListener('click', async (e) => {
      const a = e.target?.dataset?.a;
      if (a === 'copy') {
        const text = JSON.stringify(rec, null, 1);
        try { await navigator.clipboard.writeText(text); e.target.textContent = 'COPIED'; }
        catch {
          // No clipboard: the record in a box to select by hand.
          const ta = document.createElement('textarea');
          ta.className = 'pc-text'; ta.value = text; ta.readOnly = true;
          el.querySelector('.pcard').appendChild(ta); ta.focus(); ta.select();
        }
      } else if (a === 'restart') {
        this.c.restart?.();
      } else if (a === 'close') {
        el.remove(); this._card = null;
        this.c.battle.holdEnd = false;
      }
    });
    document.getElementById('ui').appendChild(el);
    this._card = el;
  }
}
