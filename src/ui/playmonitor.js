/**
 * Recording a session of real play: performance against battery.
 *
 * Started from the test panel (RECORD MY PLAY), it measures every frame the
 * phone draws while the player plays as they like: guns placed, strikes
 * called, battles won and the next one started. It does nothing to the
 * battle. Each minute is closed into one row: the frame rate and hitches,
 * the main thread's work, the GPU's own time where the browser lends a timer
 * (Android Chrome), triangles and shadow redraws, and what was happening (guns
 * on the field, rounds fired, aircraft up, stone brought down), beside the
 * battery's level at the end of it.
 *
 * The recording outlives the page. Moving to another level is a full page
 * load, so the state is kept in storage (`tt.perflive`) and every boot picks
 * it up again, until STOP. A recording left more than half an hour without a
 * frame is closed on the next boot as it stood.
 *
 * The battery is read through `navigator.getBattery` where it exists. Every
 * change of level is logged with its time, and the drain is taken between
 * the first and last change, which is exact to the step where start and end
 * percentages are not. Safari exposes no battery, so the card takes the
 * phone's own start and end percentages typed in, and the load figures (how
 * busy the CPU and GPU were, a second at a time) stand in for it.
 *
 * Sessions are kept (`tt.perfsessions`, the last twenty) for comparison.
 */
import { GpuTimer } from './perftest.js';

const LIVE = 'tt.perflive';
const KEEP = 'tt.perfsessions';
const STALE_MS = 30 * 60 * 1000;
const MINUTE = 60;

const pct = (a, p) => {
  if (!a.length) return null;
  const v = a.slice().sort((x, y) => x - y);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class PlayMonitor {
  /**
   * @param {object} c { battle, engine, physics, structures, quality, level, governor, power, perf, testMenu }
   */
  constructor(c) {
    this.c = c;
    this.state = null;
    this.running = false;
    this._card = null;
    const live = load(LIVE);
    if (live?.running) {
      // Picked up again on this page, or closed if it was left too long.
      if (Date.now() - (live.lastAt || live.startedAt) > STALE_MS) { this.state = live; this._close(true); }
      else this._resume(live);
    }
  }

  // ── Starting, resuming, stopping ──────────────────────────────────────

  /** `opts.minute` shortens a row's length in seconds, for the harness (tools/playprobe.mjs). */
  start(opts = {}) {
    if (this.running) return false;
    if (this.c.perf?.running) return false;
    const now = Date.now();
    this.state = {
      v: 1, running: true, startedAt: now, lastAt: now,
      device: this.c.perf?._device?.() || null,
      tier: this.c.quality?.id, saver: !!this.c.power?.saver,
      levels: [], segments: 0, minutes: [],
      battery: { start: null, changes: [], manualStart: null, manualEnd: null },
      gpuTimer: false, minuteSecs: opts.minute || MINUTE,
    };
    this._resume(this.state);
    return true;
  }

  _resume(state) {
    this.state = state;
    this.running = true;
    state.segments = (state.segments || 0) + 1;
    const lv = this.c.level?.id;
    if (lv && state.levels[state.levels.length - 1] !== lv) state.levels.push(lv);
    const R = this.c.engine.renderer;
    this._gpu = new GpuTimer(R.getContext());
    if (this._gpu.ok) state.gpuTimer = true;
    this._autoReset = R.info.autoReset;
    R.info.autoReset = false;
    this._open();
    this._watchBattery();
    this._watchPage();
    this._save();
    this._label();
  }

  /** Stop, close the minute in hand, keep the session and show it. */
  stop() {
    if (!this.running) return null;
    return this._close(false);
  }

  _close(stale) {
    const s = this.state;
    if (this.running) {
      this._shut(true);
      this.running = false;
      this.c.engine.renderer.info.autoReset = this._autoReset ?? true;
      this._gpu?.dispose();
    }
    s.running = false;
    s.endedAt = stale ? s.lastAt : Date.now();
    s.stale = !!stale;
    const sum = this.summarise(s);
    const list = load(KEEP) || [];
    list.unshift(sum);
    store(KEEP, list.slice(0, 20));
    try { localStorage.removeItem(LIVE); } catch { /* blocked */ }
    this.last = sum;
    this._label();
    if (!stale) this.showCard(sum);
    return sum;
  }

  // ── The frame's hooks (main.js) ───────────────────────────────────────

  beforeRender() {
    const R = this.c.engine.renderer;
    R.info.reset();
    this._shadow = R.shadowMap.enabled && (R.shadowMap.autoUpdate || R.shadowMap.needsUpdate);
    this._gpu.begin();
  }

  afterRender(dtMs, simMs, submitMs) {
    if (!this.running) return;
    this._gpu.end();
    const M = this._m, R = this.c.engine.renderer, B = this.c.battle;
    M.frames++;
    if (M.frames > 1 && dtMs < 1000) M.dt.push(dtMs);
    M.work.push(simMs + submitMs);
    M.tris += R.info.render.triangles;
    if (this._shadow) M.shadow++;
    for (const ms of this._gpu.poll()) M.gpu.push(ms);
    M.awake = Math.max(M.awake, this.c.physics.awakeCount);
    let units = 0; for (const u of B.units) if (u.alive) units++;
    M.units = Math.max(M.units, units);
    M.air = Math.max(M.air, B.air?.active || 0);
    M.inBattle = M.inBattle || B.state === 'playing';
    M.shed = Math.max(M.shed, this.c.governor?.stage ?? 0);
    if ((performance.now() - M.t0) / 1000 >= (this.state.minuteSecs || MINUTE)) { this._shut(false); this._open(); }
    this._tick();
  }

  // ── Minutes ───────────────────────────────────────────────────────────

  _open() {
    const B = this.c.battle;
    this._m = {
      t0: performance.now(), at: Date.now(), frames: 0, dt: [], work: [], gpu: [], tris: 0, shadow: 0,
      awake: 0, units: 0, air: 0, shed: 0, inBattle: false,
      shots0: B.shotsFired || 0, stones0: this._stones(), level: this.c.level?.id,
    };
  }

  /** The minute in hand into a row. A scrap under ten seconds at a page's end is dropped. */
  _shut(final) {
    const M = this._m, s = this.state;
    if (!M) return;
    const secs = (performance.now() - M.t0) / 1000;
    if (final && secs < Math.min(10, (s.minuteSecs || MINUTE) / 3)) { this._save(); return; }
    if (!M.frames) return;
    const B = this.c.battle;
    const fps = M.dt.length ? M.dt.length / (M.dt.reduce((a, b) => a + b, 0) / 1000) : null;
    const target = this.c.power?.gap?.() || 1000 / 60;
    const work = pct(M.work, 0.5), gpu = pct(M.gpu, 0.5);
    s.minutes.push({
      at: M.at, secs: r1(secs), level: M.level, frames: M.frames,
      fps: r1(fps), frameP95: r1(pct(M.dt, 0.95)),
      hitchPct: M.dt.length ? r1(100 * M.dt.filter((d) => d > target * 1.5).length / M.dt.length) : null,
      workP50: r1(work), gpuP50: r1(gpu),
      // How busy each was, a second at a time: milliseconds of work a frame
      // times frames a second, as a share of the second.
      cpuBusy: fps && work != null ? r1(Math.min(100, work * fps / 10)) : null,
      gpuBusy: fps && gpu != null ? r1(Math.min(100, gpu * fps / 10)) : null,
      trisK: Math.round(M.tris / M.frames / 1000), shadowPct: Math.round(100 * M.shadow / M.frames),
      units: M.units, air: M.air, awake: M.awake, shed: M.shed, inBattle: M.inBattle,
      shots: Math.max(0, (B.shotsFired || 0) - M.shots0), stones: Math.max(0, this._stones() - M.stones0),
      battery: this._bat ? Math.round(this._bat.level * 100) : null, charging: this._bat ? this._bat.charging : null,
    });
    s.lastAt = Date.now();
    this._save();
  }

  _stones() { return (this.c.structures || []).reduce((a, st) => a + (st.destroyedCount || 0), 0); }

  _save() { if (this.state) store(LIVE, this.state); }

  // ── Battery and the page ──────────────────────────────────────────────

  async _watchBattery() {
    try {
      if (!navigator.getBattery) return;
      const b = await navigator.getBattery();
      this._bat = b;
      const s = this.state;
      const note = () => {
        if (!this.running) return;
        s.battery.changes.push({ t: Date.now(), level: Math.round(b.level * 100), charging: b.charging });
        this._save();
        this._label();
      };
      if (!s.battery.start) s.battery.start = { t: Date.now(), level: Math.round(b.level * 100), charging: b.charging };
      b.addEventListener('levelchange', note);
      b.addEventListener('chargingchange', note);
      this._save();
    } catch { /* not readable */ }
  }

  _watchPage() {
    if (this._watching) return;
    this._watching = true;
    // The page going away (another level, the app closed) closes the minute
    // in hand into storage; the next page carries on from there.
    const put = () => { if (this.running) { this._shut(true); this._open(); } };
    window.addEventListener('pagehide', put);
    document.addEventListener('visibilitychange', () => { if (document.hidden) put(); });
  }

  // ── What it shows while running ───────────────────────────────────────

  _tick() {
    const sec = Math.floor((Date.now() - this.state.startedAt) / 1000);
    if (sec === this._shown) return;
    this._shown = sec;
    this._label();
  }

  /** The TEST button wears the recording: elapsed time, and the battery if it can be read. */
  _label() {
    const btn = this.c.testMenu?.btn;
    if (!btn) return;
    if (!this.running) { btn.textContent = 'TEST'; btn.classList.remove('rec'); return; }
    const sec = Math.floor((Date.now() - this.state.startedAt) / 1000);
    const bat = this._bat ? ` · ${Math.round(this._bat.level * 100)}%` : '';
    btn.textContent = `● REC ${clock(sec)}${bat}`;
    btn.classList.add('rec');
  }

  /** For the panel's live rows. */
  live() {
    if (!this.running) return 'not recording';
    const s = this.state, m = s.minutes[s.minutes.length - 1];
    const sec = Math.floor((Date.now() - s.startedAt) / 1000);
    return `${clock(sec)} · ${s.minutes.length} min logged${m ? ` · last ${m.fps ?? '—'} fps` : ''}`;
  }

  // ── The session's figures ─────────────────────────────────────────────

  summarise(s) {
    const mins = s.minutes.filter((m) => m.frames > 0);
    const w = (k) => {
      const v = mins.filter((m) => m[k] != null);
      const n = v.reduce((a, m) => a + m.frames, 0);
      return n ? r1(v.reduce((a, m) => a + m[k] * m.frames, 0) / n) : null;
    };
    const wallMin = ((s.endedAt || Date.now()) - s.startedAt) / 60000;
    const playMin = mins.reduce((a, m) => a + m.secs, 0) / 60;
    // The drain: between the first and last change of level while unplugged,
    // which is exact to the step; failing that, start to end over the session.
    const ch = s.battery.changes.filter((c) => !c.charging);
    let drain = null, drainHow = null;
    if (ch.length >= 2 && ch[0].level > ch[ch.length - 1].level) {
      const hrs = (ch[ch.length - 1].t - ch[0].t) / 3600000;
      if (hrs > 0) { drain = r1((ch[0].level - ch[ch.length - 1].level) / hrs); drainHow = 'between level changes'; }
    }
    const st = s.battery.start, end = s.battery.changes.length ? s.battery.changes[s.battery.changes.length - 1] : st;
    if (drain == null && st && end && !st.charging && !end.charging && st.level > end.level && wallMin > 0) {
      drain = r1((st.level - end.level) / (wallMin / 60)); drainHow = 'start to end';
    }
    const charged = s.battery.changes.some((c) => c.charging) || !!st?.charging;
    return {
      v: 1, kind: 'play', at: new Date(s.startedAt).toISOString(), stale: !!s.stale,
      wallMin: r1(wallMin), playMin: r1(playMin), battles: s.segments, levels: s.levels,
      tier: s.tier, saver: s.saver, device: s.device, gpuTimer: s.gpuTimer,
      perf: {
        fps: w('fps'), hitchPct: w('hitchPct'), workP50: w('workP50'), gpuP50: w('gpuP50'),
        cpuBusy: w('cpuBusy'), gpuBusy: w('gpuBusy'), trisK: w('trisK'), shadowPct: w('shadowPct'),
      },
      battery: {
        start: st?.level ?? null, end: end?.level ?? null, charged, drainPerHour: drain, drainHow,
        manualStart: s.battery.manualStart, manualEnd: s.battery.manualEnd,
        used: st && end ? st.level - end.level : null,
      },
      activity: {
        shots: mins.reduce((a, m) => a + m.shots, 0), stones: mins.reduce((a, m) => a + m.stones, 0),
        unitsMax: Math.max(0, ...mins.map((m) => m.units)), airMax: Math.max(0, ...mins.map((m) => m.air)),
      },
      minutes: mins,
    };
  }

  history() { return load(KEEP) || []; }

  // ── The card ──────────────────────────────────────────────────────────

  showCard(sum = this.last || this.history()[0]) {
    if (!sum) return false;
    if (this._card) this._card.remove();
    const f = (v, u = '') => (v == null ? '—' : `${v}${u}`);
    const P = sum.perf, B = sum.battery;
    const manualRate = B.manualStart != null && B.manualEnd != null && sum.wallMin > 0 && B.manualStart > B.manualEnd
      ? r1((B.manualStart - B.manualEnd) / (sum.wallMin / 60)) : null;
    const rate = B.drainPerHour ?? manualRate;
    const rateNote = B.drainPerHour != null ? `measured ${B.drainHow}`
      : manualRate != null ? 'from the percentages typed below'
        : B.charged ? 'charging during the session: unplug for a reading'
          : B.start == null ? 'not readable here: type the phone\'s % below'
            : 'too little change yet: play longer';
    const hours = rate ? r1(100 / rate) : null;
    // Sparklines: frame rate, how busy the GPU (or CPU) was, and the battery, a minute a point.
    const spark = (vals, lo, hi, label) => {
      const v = vals.map((x) => (x == null ? null : x));
      const pts = v.map((x, i) => (x == null ? null : [v.length < 2 ? 50 : (i / (v.length - 1)) * 100, 28 - ((x - lo) / Math.max(1e-6, hi - lo)) * 24]));
      const d = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
      const lastV = [...v].reverse().find((x) => x != null);
      return `<div class="ps-row"><span>${label}</span><svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" /></svg><b>${f(lastV)}</b></div>`;
    };
    const mins = sum.minutes;
    const busyKey = sum.gpuTimer ? 'gpuBusy' : 'cpuBusy';
    const bats = mins.map((m) => m.battery);
    const batLo = Math.min(...bats.filter((x) => x != null), 100), batHi = Math.max(...bats.filter((x) => x != null), 0);
    const rows = mins.map((m, i) => `<tr><th scope="row">${i + 1}</th><td>${m.level || ''}</td><td>${f(m.fps)}</td><td>${f(m.hitchPct, '%')}</td><td>${f(m.workP50)}</td><td>${f(m.gpuP50)}</td><td>${f(m.cpuBusy, '%')} / ${f(m.gpuBusy, '%')}</td><td>${f(m.trisK, 'k')}</td><td>${f(m.shadowPct, '%')}</td><td>${m.units}</td><td>${m.shots}</td><td>${m.air}</td><td>${m.stones}</td><td>${f(m.battery, '%')}${m.charging ? ' ⚡' : ''}</td></tr>`).join('');
    const hist = this.history().slice(0, 8).map((h) => `<tr><td>${h.at.slice(5, 16).replace('T', ' ')}</td><td>${(h.levels || []).join(', ')}</td><td>${f(h.wallMin, ' min')}</td><td>${f(h.perf.fps)}</td><td>${f(h.perf.gpuBusy ?? h.perf.cpuBusy, '%')}</td><td>${h.battery.drainPerHour != null ? `${h.battery.drainPerHour}%/h` : '—'}</td></tr>`).join('');
    const el = document.createElement('div');
    el.id = 'perf-card';
    el.innerHTML = `
      <div class="pcard" role="dialog" aria-label="Play session: performance and battery">
        <div class="pc-head"><b>PLAY SESSION · PERFORMANCE VS BATTERY</b><span>${(sum.levels || []).join(' · ') || ''} · ${sum.tier} tier · ${f(sum.wallMin)} min · ${sum.battles} page load${sum.battles === 1 ? '' : 's'}${sum.stale ? ' · CLOSED ON RETURN' : ''}</span></div>
        <div class="pc-tiles">
          <div><b>${rate != null ? `${rate}%` : '—'}</b><span>battery an hour</span><i class="pd">${rateNote}</i></div>
          <div><b>${hours != null ? `${hours} h` : '—'}</b><span>full charge would last</span></div>
          <div><b>${f(P.fps)}</b><span>frames a second</span><i class="pd">${f(P.hitchPct, '%')} hitched</i></div>
          <div><b>${f(P.gpuBusy ?? P.cpuBusy, '%')}</b><span>${sum.gpuTimer ? 'GPU' : 'CPU (main thread)'} busy</span><i class="pd">${sum.gpuTimer ? `CPU ${f(P.cpuBusy, '%')}` : 'GPU not readable here'}</i></div>
          <div><b>${f(P.workP50, ' ms')}</b><span>CPU work a frame</span>${sum.gpuTimer ? `<i class="pd">GPU ${f(P.gpuP50, ' ms')}</i>` : ''}</div>
          <div><b>${f(sum.activity.shots)}</b><span>rounds fired</span><i class="pd">${f(sum.activity.unitsMax)} guns at most · ${f(sum.activity.stones)} stones down</i></div>
        </div>
        <div class="ps-sparks">
          ${spark(mins.map((m) => m.fps), 0, Math.max(30, ...mins.map((m) => m.fps || 0)), 'fps')}
          ${spark(mins.map((m) => m[busyKey]), 0, Math.max(50, ...mins.map((m) => m[busyKey] || 0)), sum.gpuTimer ? 'GPU busy %' : 'CPU busy %')}
          ${bats.some((x) => x != null) ? spark(bats, batLo - 1, batHi + 1, 'battery %') : ''}
        </div>
        <div class="pc-bat">
          <span>Battery % at the start and end of the session, from the phone's own status bar (an iPhone does not let the game read it):</span>
          <label>start <input id="pc-b0" type="number" inputmode="numeric" min="0" max="100" value="${B.manualStart ?? (B.start ?? '')}"></label>
          <label>end <input id="pc-b1" type="number" inputmode="numeric" min="0" max="100" value="${B.manualEnd ?? (B.end ?? '')}"></label>
        </div>
        <div class="pc-scroll"><table>
          <thead><tr><th>Min</th><th>Level</th><th>fps</th><th>hitch</th><th>CPU ms</th><th>GPU ms</th><th>busy CPU/GPU</th><th>tris</th><th>shadow</th><th>guns</th><th>rounds</th><th>air</th><th>stones</th><th>battery</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="14">No full minute recorded yet.</td></tr>'}</tbody></table></div>
        <div class="pc-meta">${sum.device ? `${sum.device.buffer} px · ${sum.device.gpu || 'GPU unnamed'} · ` : ''}saver ${sum.saver ? 'on' : 'off'} · busy is the share of each second the processor spent on the game's frames</div>
        <details class="pc-hist"><summary>Previous sessions</summary><div class="pc-scroll"><table>
          <thead><tr><th>When</th><th>Levels</th><th>Length</th><th>fps</th><th>busy</th><th>battery</th></tr></thead><tbody>${hist}</tbody></table></div></details>
        <div class="pc-btns">
          <button type="button" data-a="copy">COPY RESULTS</button>
          <button type="button" data-a="close">CLOSE</button>
        </div>
      </div>`;
    const keep = () => {
      const v0 = el.querySelector('#pc-b0').value, v1 = el.querySelector('#pc-b1').value;
      sum.battery.manualStart = v0 === '' ? null : Number(v0);
      sum.battery.manualEnd = v1 === '' ? null : Number(v1);
      const list = this.history();
      const i = list.findIndex((x) => x.at === sum.at);
      if (i >= 0) { list[i] = sum; store(KEEP, list); }
      this.showCard(sum);
    };
    el.querySelector('#pc-b0').addEventListener('change', keep);
    el.querySelector('#pc-b1').addEventListener('change', keep);
    el.querySelector('.pc-btns').addEventListener('click', async (e) => {
      const a = e.target?.dataset?.a;
      if (a === 'copy') {
        const text = JSON.stringify(sum, null, 1);
        try { await navigator.clipboard.writeText(text); e.target.textContent = 'COPIED'; }
        catch {
          const ta = document.createElement('textarea');
          ta.className = 'pc-text'; ta.value = text; ta.readOnly = true;
          el.querySelector('.pcard').appendChild(ta); ta.focus(); ta.select();
        }
      } else if (a === 'close') { el.remove(); this._card = null; }
    });
    document.getElementById('ui').appendChild(el);
    this._card = el;
    return true;
  }
}
