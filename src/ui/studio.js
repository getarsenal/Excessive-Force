/**
 * The studio: the game as a camera.
 *
 * Behind the dock's VIEW button. The interface goes, and a band on the thumb
 * line takes its place with the things a content studio wants from a fight
 * it is filming: the clock (paused, a quarter, a half, real time, two, four
 * and eight times), a camera that follows a gun, an aircraft or a shell
 * through the air, a slow orbit round whatever is in focus, a move from one
 * pose to another over eight seconds, four lenses, a still at full size and
 * a recording of the canvas with the game's own sound, saved through the
 * phone's share sheet (SAVE VIDEO on an iPhone) or as a download.
 *
 * Nothing here is a cheat: the battle runs as it runs, only slower, faster
 * or held. The trailer tool (`tools/trailer.mjs`) does the same things to
 * the same rig from outside the page; this is the same camera in the
 * player's hand.
 *
 * Slow motion is smooth because the physics is told to step finer, not
 * less often (`physics.setTimeStep`): at a quarter speed and sixty frames a
 * second a sixtieth-of-a-second step would land every fourth frame, and a
 * collapse stuttered at fifteen frames a second. A time lapse is the other
 * way round: the physics is let take more steps a frame than the budget
 * normally allows (`maxSteps`, `maxDt`), and main.js steps the battle in
 * thirtieths, so the guns and the stones stay in the same time.
 */
import * as THREE from 'three';

const SPEEDS = [0, 0.25, 0.5, 1, 2, 4, 8];
const LENSES = [
  { name: 'WIDE', fov: 72 },
  { name: 'NORMAL', fov: 52 },
  { name: 'TELE', fov: 30 },
  { name: 'LONG', fov: 16 },
];
const ORBIT_RATES = [0, 0.09, 0.2, -0.09];   // radians a second: off, slow, brisk, slow the other way
const DOLLY_SECS = 8;
const TAP_PX = 44;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Studio {
  /**
   * @param {object} o engine, rig, battle, physics, hud, audio, testMenu,
   *   canvas, quality, feedback (optional)
   */
  constructor(o) {
    Object.assign(this, o);
    this.active = false;
    this.speed = 1;
    this.mode = 'free';           // free | follow | orbit | dolly
    this.armed = false;           // the next tap picks what to follow
    this.target = null;           // { kind, ref, name, point }
    this.orbitIx = 0;
    this.lensIx = 1;
    this.dolly = { a: null, b: null, t: -1 };
    this.dollySecs = DOLLY_SECS;   // the probe shortens it
    this.recording = false;
    this.rec = null;
    this.recT0 = 0;
    this.lastClip = null;
    this.snapPending = false;
    this._baseFov = this.engine.camera.fov;
    this._baseHz = Math.round(1 / this.physics.fixedStep);
    this._v = new THREE.Vector3();
    this._el();
  }

  // ── The band.

  _el() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      band: $('studio'), hint: $('studio-hint'), pill: $('studio-recpill'),
      exit: $('st-exit'), follow: $('st-follow'), orbit: $('st-orbit'), dolly: $('st-dolly'),
      lens: $('st-lens'), snap: $('st-snap'), rec: $('st-rec'), save: $('st-save'),
      speeds: [...document.querySelectorAll('#studio [data-speed]')],
    };
    if (!this.el.band) return;
    this.el.exit.addEventListener('click', () => this.exit());
    this.el.follow.addEventListener('click', () => this.followTap());
    this.el.orbit.addEventListener('click', () => this.orbitTap());
    this.el.dolly.addEventListener('click', () => this.dollyTap());
    this.el.lens.addEventListener('click', () => this.lensTap());
    this.el.snap.addEventListener('click', () => { this.snapPending = true; this._tick(); });
    this.el.rec.addEventListener('click', () => (this.recording ? this.stopRecording() : this.startRecording()));
    this.el.save.addEventListener('click', () => this._saveClip());
    this.el.pill.addEventListener('click', () => this.stopRecording());
    for (const b of this.el.speeds) b.addEventListener('click', () => this.setSpeed(+b.dataset.speed));
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.code;
      if (k === 'Space') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); }
      else if (k === 'BracketLeft') this.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(this.speed) - 1)]);
      else if (k === 'BracketRight') this.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.speed) + 1)]);
      else if (k === 'KeyF') this.followTap();
      else if (k === 'KeyO') this.orbitTap();
      else if (k === 'KeyB') this.dollyTap();
      else if (k === 'KeyL') this.lensTap();
      else if (k === 'KeyP') this.snapPending = true;
      else if (k === 'KeyR') (this.recording ? this.stopRecording() : this.startRecording());
    });
    this._paint();
  }

  _hint(text) { if (this.el.hint) this.el.hint.textContent = text || ''; }
  _tick() { this.feedback?.emit?.('tick'); }

  _paint() {
    const E = this.el;
    if (!E.band) return;
    for (const b of E.speeds) b.classList.toggle('on', +b.dataset.speed === this.speed);
    E.follow.classList.toggle('on', this.mode === 'follow' || this.armed);
    E.follow.textContent = this.armed ? 'TAP IT' : this.mode === 'follow' ? 'FOLLOW ·' : 'FOLLOW';
    E.orbit.classList.toggle('on', this.orbitIx !== 0);
    E.orbit.textContent = ['ORBIT', 'ORBIT ·', 'ORBIT ··', 'ORBIT ·'][this.orbitIx];
    const d = this.dolly;
    E.dolly.classList.toggle('on', d.t >= 0);
    E.dolly.textContent = d.t >= 0 ? 'STOP' : !d.a ? 'SET A' : !d.b ? 'SET B' : 'PLAY A→B';
    E.lens.textContent = `LENS · ${LENSES[this.lensIx].name}`;
    E.rec.classList.toggle('on', this.recording);
    E.rec.textContent = this.recording ? '■ STOP' : '● REC';
    E.save.hidden = !this.lastClip || this.recording;
    if (this.lastClip) E.save.textContent = `SAVE CLIP · ${this.lastClip.secs}s`;
    E.rec.disabled = !this.canRecord();
    E.rec.title = this.canRecord() ? 'Record the picture and the sound' : 'This browser cannot record the canvas; use the phone\'s screen recorder';
  }

  // ── In and out.

  enter() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('studio');
    if (this.el.band) this.el.band.hidden = false;
    this.setSpeed(1);
    this._hint('THE INTERFACE IS OFF · DRAG TO LOOK, PINCH TO ZOOM');
    this._paint();
  }

  exit() {
    if (!this.active) return;
    if (this.recording) this.stopRecording();
    this.active = false;
    this.armed = false;
    this.mode = 'free';
    this.target = null;
    this.orbitIx = 0;
    this.dolly = { a: null, b: null, t: -1 };
    this.rig.enabled = true;
    this.setSpeed(1);
    this.lensIx = 1;
    this._applyLens();
    document.body.classList.remove('studio');
    if (this.el.band) this.el.band.hidden = true;
    if (this.el.pill) this.el.pill.hidden = true;
    this._paint();
    // The interface back, through the HUD's own switch (which is wrapped in
    // main.js to call this very method, so guard against the echo).
    if (this.hud?.clearView) this.hud.setClearView(false);
  }

  // ── The clock.

  setSpeed(s) {
    if (!SPEEDS.includes(s)) s = 1;
    this.speed = s;
    const T = this.testMenu, P = this.physics;
    T.paused = s === 0;
    T.timeScale = s === 0 ? 1 : s;
    // Finer steps under real time, more of them over it (see the header).
    P.setTimeStep(s > 0 && s < 1 ? this._baseHz / s : this._baseHz);
    P.maxSteps = s > 1 ? Math.ceil(3 * s) : 3;
    P.maxDt = s > 1 ? 0.5 : 0.1;
    this._paint();
  }

  // ── The camera.

  followTap() {
    if (this.armed) {
      // A second tap cycles through what is in the air and on the ground
      // rather than waiting for a finger on it.
      const list = this._candidates();
      if (!list.length) { this._hint('NOTHING TO FOLLOW YET'); return; }
      const i = this.target ? list.findIndex((c) => c.ref === this.target.ref) : -1;
      this._follow(list[(i + 1) % list.length]);
      this.armed = false;
      this._paint();
      return;
    }
    if (this.mode === 'follow') {
      this.mode = 'free'; this.target = null;
      this._hint('FREE CAMERA');
      this._paint();
      return;
    }
    this.armed = true;
    this._hint('TAP A GUN, AN AIRCRAFT, A SHELL OR THE BUILDING · OR TAP FOLLOW AGAIN TO CYCLE');
    this._paint();
  }

  /** Everything the camera could follow, aircraft first. */
  _candidates() {
    const B = this.battle, out = [];
    for (const s of B.air?.sorties || []) if (s.model) out.push({ kind: 'sortie', ref: s, name: s.def?.name || 'AIRCRAFT' });
    for (const d of B.pending || []) if (d.group) out.push({ kind: 'drop', ref: d, name: 'THE LIFT' });
    const shells = (B.projectiles?.list || []).filter((p) => !p.hostile).slice(-4);
    for (const p of shells) out.push({ kind: 'shell', ref: p, name: p.kind === 'bomb' ? 'THE BOMB' : 'THE ROUND' });
    for (const u of B.units || []) if (u.group) out.push({ kind: 'unit', ref: u, name: u.def?.name || 'GUN' });
    return out;
  }

  _position(t, out) {
    const r = t.ref;
    if (t.kind === 'sortie') return r.model ? out.copy(r.model.position) : null;
    if (t.kind === 'drop') return r.group ? out.copy(r.group.position) : null;
    if (t.kind === 'shell') return r.pos ? out.copy(r.pos) : null;
    if (t.kind === 'unit') return r.group ? out.copy(r.group.position).add(new THREE.Vector3(0, 1.5, 0)) : null;
    if (t.kind === 'point') return out.copy(t.point);
    return null;
  }

  _alive(t) {
    const B = this.battle, r = t.ref;
    if (t.kind === 'sortie') return (B.air?.sorties || []).includes(r) && !!r.model;
    if (t.kind === 'drop') return (B.pending || []).includes(r);
    if (t.kind === 'shell') return (B.projectiles?.list || []).includes(r);
    if (t.kind === 'unit') return (B.units || []).includes(r);
    return true;
  }

  _follow(c) {
    this.target = c;
    this.mode = 'follow';
    // A thing in the air is better seen from a little closer than the
    // player keeps the map, and a gun from closer still.
    const near = c.kind === 'unit' ? 28 : c.kind === 'shell' ? 60 : 110;
    if (this.rig.desiredDistance > near * 3) this.rig.desiredDistance = near * 2;
    this._hint(`FOLLOWING ${c.name}`);
    this._tick();
    this._paint();
  }

  /**
   * A tap on the canvas while the studio is up (main.js routes it here
   * before the battle's own tap handling). Only a tap with FOLLOW armed does
   * anything; the rest is the rig's.
   */
  tap(x, y) {
    if (!this.active || !this.armed) return false;
    this.armed = false;
    const cam = this.engine.camera, cv = this.canvas;
    const r = cv.getBoundingClientRect();
    const w = r.width, h = r.height;
    let best = null, bd = TAP_PX;
    for (const c of this._candidates()) {
      const p = this._position(c, this._v);
      if (!p) continue;
      p.project(cam);
      if (p.z > 1) continue;
      const sx = r.left + (p.x + 1) / 2 * w, sy = r.top + (1 - p.y) / 2 * h;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { this._follow(best); return true; }
    const hit = this.pick ? this.pick(x, y) : null;
    if (hit?.point) {
      this._follow({ kind: 'point', ref: hit.point, name: hit.kind === 'structure' ? (hit.label || 'THE BUILDING') : 'THAT SPOT', point: hit.point.clone() });
      return true;
    }
    this._hint('NOTHING THERE · FREE CAMERA');
    this._paint();
    return true;
  }

  orbitTap() {
    this.orbitIx = (this.orbitIx + 1) % ORBIT_RATES.length;
    this._hint(['ORBIT OFF', 'SLOW ORBIT', 'BRISK ORBIT', 'SLOW ORBIT · THE OTHER WAY'][this.orbitIx]);
    this._tick();
    this._paint();
  }

  _pose() {
    const R = this.rig;
    return { target: R.target.clone(), distance: R.distance, yaw: R.yaw, pitch: R.pitch, fov: this.engine.camera.fov };
  }

  dollyTap() {
    const d = this.dolly;
    if (d.t >= 0) { d.t = -1; this.rig.enabled = true; this._hint('MOVE STOPPED'); }
    else if (!d.a) { d.a = this._pose(); this._hint('A SET · MOVE THE CAMERA TO WHERE THE SHOT ENDS, THEN SET B'); }
    else if (!d.b) { d.b = this._pose(); this._hint('B SET · PLAY RUNS A TO B OVER EIGHT SECONDS'); }
    else {
      // Play from A. Tapping again while it runs stops it; the next tap
      // after a run starts over with a new A.
      d.t = 0;
      this.rig.enabled = false;
      this.mode = 'free';
      this.orbitIx = 0;
      this._hint('ROLLING A → B');
    }
    this._tick();
    this._paint();
  }

  lensTap() {
    this.lensIx = (this.lensIx + 1) % LENSES.length;
    this._applyLens();
    this._hint(`${LENSES[this.lensIx].name} LENS · ${LENSES[this.lensIx].fov}°`);
    this._tick();
    this._paint();
  }

  _applyLens() {
    const cam = this.engine.camera;
    cam.fov = this.active ? LENSES[this.lensIx].fov : this._baseFov;
    cam.updateProjectionMatrix();
  }

  /** Each frame, before the rig moves the camera. `dt` is real seconds. */
  update(dt) {
    if (!this.active) return;
    const R = this.rig, d = this.dolly;
    if (d.t >= 0) {
      d.t = Math.min(1, d.t + dt / this.dollySecs);
      const k = ease(d.t), a = d.a, b = d.b;
      R.target.lerpVectors(a.target, b.target, k); R.desiredTarget.copy(R.target);
      R.distance = R.desiredDistance = a.distance + (b.distance - a.distance) * k;
      R.yaw = R.desiredYaw = a.yaw + (b.yaw - a.yaw) * k;
      R.pitch = R.desiredPitch = a.pitch + (b.pitch - a.pitch) * k;
      const cam = this.engine.camera, fov = a.fov + (b.fov - a.fov) * k;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      if (d.t >= 1) { d.t = -1; d.a = d.b = null; R.enabled = true; this._hint('MOVE DONE'); this._paint(); }
      return;
    }
    if (this.mode === 'follow' && this.target) {
      if (!this._alive(this.target)) {
        this._hint(`${this.target.name} IS GONE · FREE CAMERA`);
        this.mode = 'free'; this.target = null; this._paint();
      } else {
        const p = this._position(this.target, this._v);
        if (p) R.desiredTarget.copy(p);
      }
    }
    const w = ORBIT_RATES[this.orbitIx];
    if (w) { R.desiredYaw += w * dt; R.yaw += w * dt; }
    if (this.recording && this.el.pill) {
      const s = Math.floor((performance.now() - this.recT0) / 1000);
      this.el.pill.textContent = `● ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · TAP TO STOP`;
    }
  }

  // ── The still and the clip.

  /** After the draw, in the same task: the drawing buffer is still there. */
  afterRender() {
    if (!this.snapPending) return;
    this.snapPending = false;
    const name = `excessive-force-${this.battle.level?.id || 'shot'}-${stamp()}.jpg`;
    try {
      this.canvas.toBlob((blob) => { if (blob) this._deliver(blob, name, 'image/jpeg'); }, 'image/jpeg', 0.92);
      this._hint('STILL TAKEN');
    } catch (e) { this._hint('THE STILL FAILED'); }
  }

  canRecord() {
    return typeof MediaRecorder !== 'undefined' && typeof this.canvas.captureStream === 'function' && !!this._mime();
  }

  _mime() {
    const list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    try { return list.find((m) => MediaRecorder.isTypeSupported(m)) || null; } catch { return null; }
  }

  startRecording() {
    if (this.recording || !this.canRecord()) return;
    const stream = this.canvas.captureStream(30);
    // The game's own sound, tapped after the limiter.
    const A = this.audio;
    try {
      if (A?.ctx && A.limiter && !this._dest) { this._dest = A.ctx.createMediaStreamDestination(); A.limiter.connect(this._dest); }
      if (this._dest) for (const t of this._dest.stream.getAudioTracks()) stream.addTrack(t);
    } catch { /* picture only */ }
    const mimeType = this._mime();
    const chunks = [];
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 14e6, audioBitsPerSecond: 160e3 }); }
    catch (e) { this._hint('RECORDING FAILED TO START'); return; }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const secs = Math.max(1, Math.round((performance.now() - this.recT0) / 1000));
      const type = mimeType.split(';')[0];
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      this.lastClip = { blob, name: `excessive-force-${this.battle.level?.id || 'clip'}-${stamp()}.${ext}`, type, secs };
      this.recording = false;
      this.rec = null;
      if (this.el.pill) this.el.pill.hidden = true;
      if (this.el.band && this.active) this.el.band.hidden = false;
      this._paint();
      this._saveClip();
    };
    this.engine.setRenderScale(1);
    this.rec = rec;
    this.recording = true;
    this.recT0 = performance.now();
    this._stream = stream;
    rec.start(1000);
    // The band goes, so the recording is the picture alone; the pill is
    // the way to stop and is the one thing left on the glass.
    if (this.el.band) this.el.band.hidden = true;
    if (this.el.pill) { this.el.pill.hidden = false; this.el.pill.textContent = '● 0:00 · TAP TO STOP'; }
    this._tick();
    this._paint();
  }

  stopRecording() {
    if (!this.recording || !this.rec) return;
    try { this.rec.stop(); } catch { this.recording = false; }
    for (const t of this._stream?.getVideoTracks?.() || []) t.stop();
  }

  _saveClip() {
    const c = this.lastClip;
    if (!c) return;
    this._deliver(c.blob, c.name, c.type);
  }

  /** The share sheet where there is one (an iPhone: SAVE VIDEO), a download otherwise. */
  async _deliver(blob, name, type) {
    try {
      const file = new File([blob], name, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Excessive Force' });
        this._hint('SAVED');
        return;
      }
    } catch (e) {
      // Not in a gesture, or cancelled: the SAVE CLIP chip stays for a tap.
      if (e && e.name === 'AbortError') { this._hint('NOT SAVED · SAVE CLIP IS ON THE BAND'); this._paint(); return; }
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this._hint(`SAVED ${name}`);
    } catch (e) { this._hint('COULD NOT SAVE · TRY SAVE CLIP ON THE BAND'); }
    this._paint();
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
