/**
 * The studio: the game as a camera, over the game.
 *
 * Behind the dock's STUDIO button. The interface stays: the player still
 * pauses, selects a unit, deploys it, designates, calls a strike, and the
 * band on the thumb line adds what a content studio wants from a fight it
 * is filming. The clock (held, a quarter, a half, real time, two, four and
 * eight times). A camera that follows a gun, an aircraft, a shell or the
 * lift. A slow orbit round whatever is in focus. A move from one pose to
 * another over eight seconds. Four lenses. A still at full size. A
 * recording of the canvas with the game's own sound, saved through the
 * phone's share sheet (SAVE VIDEO on an iPhone) or as a download. HUD
 * takes the interface off the glass for the phone's own screen recorder;
 * the in-app recorder reads the canvas alone, so the interface is never in
 * its clip and the band stays while it runs.
 *
 * In a battle this is a camera and nothing else: no money, no unlocks, the
 * enemy as it is. THE STUDIO off the title's MODES (career.js
 * `startStudioRun`) is the sandbox: any open landmark with the whole
 * arsenal free, nothing counted toward the campaign, the battle never
 * ending, and ENEMY on the band to hold the garrison's fire.
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
   *   canvas, quality, feedback (optional), pick (x, y) => hit, unitCard
   */
  constructor(o) {
    Object.assign(this, o);
    this.active = false;
    this.speed = 1;
    this.mode = 'free';           // free | follow
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
    this.enemy = true;
    this._baseFov = this.engine.camera.fov;
    this._baseHz = Math.round(1 / this.physics.fixedStep);
    this._v = new THREE.Vector3();
    this._el();
  }

  // ── The band.

  _el() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      band: $('studio'), hint: $('studio-hint'),
      exit: $('st-exit'), follow: $('st-follow'), orbit: $('st-orbit'), dolly: $('st-dolly'),
      lens: $('st-lens'), hud: $('st-hud'), enemy: $('st-enemy'),
      snap: $('st-snap'), rec: $('st-rec'), save: $('st-save'),
      speeds: [...document.querySelectorAll('#studio [data-speed]')],
    };
    if (!this.el.band) return;
    const E = this.el;
    E.exit.addEventListener('click', () => this.exit());
    E.follow.addEventListener('click', () => this.followTap());
    E.orbit.addEventListener('click', () => this.orbitTap());
    E.dolly.addEventListener('click', () => this.dollyTap());
    E.lens.addEventListener('click', () => this.lensTap());
    E.hud.addEventListener('click', () => this.hudTap());
    E.enemy.addEventListener('click', () => this.enemyTap());
    E.snap.addEventListener('click', () => { this.snapPending = true; this._tick(); this._hint('STILL ON THE NEXT FRAME'); });
    E.rec.addEventListener('click', () => (this.recording ? this.stopRecording() : this.startRecording()));
    E.save.addEventListener('click', () => this._saveClip());
    for (const b of E.speeds) b.addEventListener('click', () => this.speedTap(+b.dataset.speed));
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.code;
      if (k === 'Space') { e.preventDefault(); this.speedTap(0); }
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
    const hold = E.speeds.find((b) => b.dataset.speed === '0');
    if (hold) hold.textContent = this.speed === 0 ? '▶' : '❚❚';
    E.follow.classList.toggle('on', this.mode === 'follow' || this.armed);
    E.follow.textContent = this.armed ? 'TAP IT' : this.mode === 'follow' ? 'FOLLOW ·' : 'FOLLOW';
    E.orbit.classList.toggle('on', this.orbitIx !== 0);
    E.orbit.textContent = ['ORBIT', 'ORBIT ·', 'ORBIT ··', 'ORBIT ·'][this.orbitIx];
    const d = this.dolly;
    E.dolly.classList.toggle('on', d.t >= 0);
    E.dolly.textContent = d.t >= 0 ? 'STOP' : !d.a ? 'SET A' : !d.b ? 'SET B' : 'PLAY A→B';
    E.lens.textContent = `LENS · ${LENSES[this.lensIx].name}`;
    const clear = !!this.hud?.clearView;
    E.hud.classList.toggle('on', clear);
    E.hud.textContent = clear ? 'HUD OFF' : 'HUD ON';
    const sandbox = !!this.battle.studioRun;
    E.enemy.hidden = !sandbox;
    E.enemy.classList.toggle('on', sandbox && this.enemy);
    E.enemy.textContent = this.enemy ? 'ENEMY ON' : 'ENEMY OFF';
    E.rec.classList.toggle('on', this.recording);
    if (!this.recording) E.rec.textContent = '● REC';
    E.save.hidden = !this.lastClip || this.recording;
    if (this.lastClip) E.save.textContent = `SAVE CLIP · ${this.lastClip.secs}s`;
    E.rec.disabled = !this.canRecord();
    E.rec.title = this.canRecord() ? 'Record the picture and the sound' : 'This browser cannot record the canvas; use the phone\'s screen recorder with HUD OFF';
  }

  // ── In and out.

  toggle() { if (this.active) this.exit(); else this.enter(); }

  enter() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('studio');
    if (this.el.band) this.el.band.hidden = false;
    this.setSpeed(1);
    this._hint(this.battle.studioRun
      ? 'THE STUDIO · EVERYTHING IS FREE AND NOTHING IS COUNTED · PLAY THE FIGHT, FILM IT'
      : 'THE STUDIO · PLAY ON, THE BAND IS THE CAMERA · HUD OFF FOR A CLEAN SCREEN');
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
    if (this.hud?.clearView) this.hud.setClearView(false);
    this._paint();
  }

  hudTap() {
    if (!this.hud) return;
    this.hud.setClearView(!this.hud.clearView);
    this._hint(this.hud.clearView ? 'INTERFACE OFF · THE BAND STAYS · HUD ON BRINGS IT BACK' : 'INTERFACE ON');
    this._tick();
    this._paint();
  }

  /** The sandbox's enemy: the garrison's fire, the SAMs and the airborne together. */
  enemyTap() {
    const B = this.battle;
    if (!B.studioRun) return;
    this.enemy = !this.enemy;
    if (B.garrison) B.garrison.fireEnabled = this.enemy;
    if (B.sams) { if (!this.enemy) { B.sams._engageOff = B.sams._engageOff || B.sams._engage; B.sams._engage = () => {}; } else if (B.sams._engageOff) B.sams._engage = B.sams._engageOff; }
    if (B.airborne) B.airborne.auto = this.enemy;
    if (B.assault) B.assault.auto = this.enemy;
    this._hint(this.enemy ? 'THE ENEMY FIRES' : 'THE ENEMY HOLDS ITS FIRE');
    this._tick();
    this._paint();
  }

  // ── The clock.

  speedTap(s) {
    // The hold chip is a toggle: held, then back to real time.
    if (s === 0 && this.speed === 0) s = 1;
    this.setSpeed(s);
    this._tick();
  }

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
      if (!list.length) { this._hint('NOTHING TO FOLLOW YET'); this.armed = false; this._paint(); return; }
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
    // A gun with its card open is the one to follow, no tap needed.
    const u = this.unitCard?.unit;
    if (u && (this.battle.units || []).includes(u)) { this._follow({ kind: 'unit', ref: u, name: u.def?.name || 'GUN' }); return; }
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
   * A tap on the canvas while FOLLOW is armed (main.js routes it here before
   * the battle's own tap handling). Every other tap is the game's.
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
    if (this.recording && this.el.rec) {
      const s = Math.floor((performance.now() - this.recT0) / 1000);
      this.el.rec.textContent = `■ STOP ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
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
  }

  // ── The still and the clip.

  /** After the draw, in the same task: the drawing buffer is still there. */
  afterRender() {
    if (!this.snapPending) return;
    this.snapPending = false;
    const name = `excessive-force-${this.battle.level?.id || 'shot'}-${stamp()}.jpg`;
    try {
      this.canvas.toBlob((blob) => { if (blob) this._deliver(blob, name, 'image/jpeg'); else this._hint('THE STILL FAILED'); }, 'image/jpeg', 0.92);
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
    let stream;
    try { stream = this.canvas.captureStream(30); } catch (e) { this._hint('THIS BROWSER WILL NOT HAND OVER THE CANVAS'); return; }
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
    catch (e) {
      // Without the sound track, then: a browser that takes the canvas and
      // not a mixed stream is still a recorder.
      try { rec = new MediaRecorder(this.canvas.captureStream(30), { mimeType }); }
      catch (e2) { this._hint('RECORDING FAILED TO START'); return; }
    }
    this._chunks = chunks;
    this._mimeUsed = mimeType;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    // Stop is finished on `onstop`, on an error, or on a timer when neither
    // comes: an iPhone that never fired `onstop` left the band saying STOP.
    rec.onstop = () => this._finish();
    rec.onerror = () => this._finish();
    this.rec = rec;
    this._stream = stream;
    this.engine.setRenderScale(1);
    try { rec.start(1000); } catch (e) { try { rec.start(); } catch (e2) { this._hint('RECORDING FAILED TO START'); this.rec = null; return; } }
    this.recording = true;
    this.recT0 = performance.now();
    this._hint('RECORDING · THE CANVAS AND THE SOUND · STOP IS ON THE BAND');
    this._tick();
    this._paint();
  }

  stopRecording() {
    const rec = this.rec;
    if (!this.recording || !rec) return;
    this._hint('STOPPING');
    if (rec.state === 'inactive') { this._finish(); return; }
    try { rec.requestData?.(); } catch { /* a recorder without it */ }
    try { rec.stop(); } catch { this._finish(); return; }
    clearTimeout(this._stopTimer);
    this._stopTimer = setTimeout(() => this._finish(), 4000);
  }

  /** The clip out of the chunks, once; whichever of stop, error or timer gets here first. */
  _finish() {
    clearTimeout(this._stopTimer);
    if (!this.recording) return;
    this.recording = false;
    const secs = Math.max(1, Math.round((performance.now() - this.recT0) / 1000));
    const type = (this._mimeUsed || 'video/webm').split(';')[0];
    const chunks = this._chunks || [];
    for (const t of this._stream?.getTracks?.() || []) { try { if (t.kind === 'video') t.stop(); } catch { /* gone */ } }
    this.rec = null;
    this._stream = null;
    this._chunks = null;
    this._paint();
    if (!chunks.length) { this._hint('NOTHING WAS RECORDED · TRY THE PHONE\'S SCREEN RECORDER WITH HUD OFF'); return; }
    const blob = new Blob(chunks, { type });
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    this.lastClip = { blob, name: `excessive-force-${this.battle.level?.id || 'clip'}-${stamp()}.${ext}`, type, secs };
    this._paint();
    this._saveClip();
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
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) { this._hint('NOT SAVED · TAP SAVE CLIP ON THE BAND'); this._paint(); return; }
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this._hint(`SAVED ${name}`);
    } catch (e) { this._hint('COULD NOT SAVE · TAP SAVE CLIP ON THE BAND'); }
    this._paint();
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
