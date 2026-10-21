import * as THREE from 'three';

/**
 * Audio.
 *
 * Two things matter more than the samples themselves.
 *
 * **Sound is slow.** It covers 343 m per second, so a HIMARS firing 2.5 km away
 * is heard seven seconds after the flash, and a shell that lands across the
 * river cracks noticeably after you watch the stone leave. Artillery is the one
 * genre where that delay is the whole character of the thing, so impacts and
 * distant guns are scheduled by their real travel time rather than played on
 * the frame they happen. It is capped so nothing arrives so late it reads as a
 * bug rather than as distance.
 *
 * **Repetition is what makes game audio cheap.** Six MLRS rockets firing on a
 * 0.35 s interval from one buffer is a machine gun, not a ripple. Every voice
 * gets its own pitch and gain jitter, and a per-sound cooldown collapses
 * stacked triggers so twenty stones landing at once is one rockfall rather than
 * twenty clipped transients.
 *
 * Positioning is done by hand — distance gain plus a stereo pan taken from
 * where the source sits relative to the camera — rather than with PannerNodes.
 * At bird's-eye distance the HRTF work a panner does is inaudible, and this
 * costs a couple of multiplies per voice.
 */

const SPEED_OF_SOUND = 343; // m/s
const MAX_DELAY = 3.0;      // beyond this, late audio reads as broken, not distant
// Delayed voices count from when they are scheduled, and the explosion's
// slowed-down tails run for ten seconds and more, so a busy fight fills this.
const MAX_VOICES = 32;

const CLIPS = {
  gun: 'assets/cannon',
  rocket: 'assets/rocket',
  explosion: 'assets/explosion',
  mg: 'assets/machine_gun',
  enemy: 'assets/enemy_shot',
  // The A-10's gun, as heard near its target: impacts, then the gun.
  brrt: 'assets/a10_gun',
  // The lasgun, three takes of it: synth.js's `lasgun` picks one a beam and
  // loops it for the beam's time over its own rumble bed.
  lasgun1: 'assets/lasgun1',
  lasgun2: 'assets/lasgun2',
  lasgun3: 'assets/lasgun3',
};

/**
 * Every clip is shipped twice, as the mp3 the owner made and as an AAC copy
 * of it (`tools/clips.sh`), and the loader takes the other when the first
 * will not decode. The App Store build asks for the AAC first: the clips
 * played on the web and were silent in the native app, every one of them,
 * with the synthesised sounds playing on the same context, which is a
 * decoder saying no and not a muted page; AAC in an m4a is CoreAudio's own
 * format and the surest thing WebKit can be handed. The order is settled
 * once; `loadReport` says which each clip came in as, or why neither did.
 */
const NATIVE_APP = (() => {
  try { return window.location?.protocol === 'capacitor:' || !!window.Capacitor?.isNativePlatform?.(); } catch { return false; }
})();
const FORMATS = NATIVE_APP ? ['m4a', 'mp3'] : ['mp3', 'm4a'];

/**
 * A file's bytes, from a server that may not speak HTTP.
 *
 * Capacitor's iOS asset handler answers a media file (mp3, m4a, wav: its
 * own list) with a plain URLResponse rather than an HTTP one, for the
 * media elements' sake, so `fetch` gets the body with no status: `ok` is
 * false and `status` 0, and a loader that checked `ok` first threw every
 * clip away while the JSON and the models, served with a 200, loaded.
 * That was every recorded sound silent in the App Store build. A body on
 * a status-less answer is taken; a fetch that will not even do that is
 * asked again through XMLHttpRequest, which has always handed over the
 * bytes of a non-HTTP load with its status at 0.
 */
export async function fetchBytes(url) {
  let first;
  try {
    const res = await fetch(url);
    if (!res.ok && res.status !== 0) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength >= 64) return { bytes, via: res.status === 0 ? 'fetch (no status)' : 'fetch' };
    throw new Error(`${bytes.byteLength} bytes (${res.headers.get('content-type') || 'no type'}, status ${res.status})`);
  } catch (e) { first = e; }
  return new Promise((resolve, reject) => {
    try {
      const x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'arraybuffer';
      x.onload = () => {
        const n = x.response ? x.response.byteLength : 0;
        if (n >= 64) resolve({ bytes: x.response, via: `xhr (status ${x.status})` });
        else reject(new Error(`fetch: ${first.message}; xhr: status ${x.status}, ${n} bytes`));
      };
      x.onerror = () => reject(new Error(`fetch: ${first.message}; xhr: failed`));
      x.send();
    } catch (e) { reject(new Error(`fetch: ${first.message}; xhr: ${e.message}`)); }
  });
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.ready = false;
    this.enabled = true;
    this.voices = 0;
    this._lastPlayed = new Map();
    this._listenerPos = new THREE.Vector3();
    this._listenerRight = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._failed = false;
  }

  /**
   * Browsers refuse to start an AudioContext without a gesture, so this is
   * called from the first pointerdown rather than at boot.
   */
  async unlock() {
    if (this.ctx) { this.resume(); return; }
    if (this._failed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this._failed = true; return; }
      // iOS: the page's sound is playback, not ambient. Ambient is what a
      // web page gets by default, and ambient is silenced by the ring/silent
      // switch and dropped for good by the first interruption; playback
      // rides the switch and is handed back after a call or an app switch.
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch { /* not iOS 17 */ }
      this.ctx = new Ctx();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this._graph();
      await this._loadAll();
      this.ready = true;
      this._watch();
    } catch (e) {
      console.warn('[tumble] audio unavailable:', e.message);
      this._failed = true;
    }
  }

  /** The master gain and the limiter into the context's output. */
  _graph() {
    this.master = this.ctx.createGain();
    // Muted before the first tap is still muted after it.
    this.master.gain.value = this.enabled ? 0.75 : 0;
    // A limiter stops a barrage from clipping into distortion; without it a
    // HIMARS salvo plus its impacts is a wall of crackle.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.master.connect(this.limiter).connect(this.ctx.destination);
  }

  /**
   * A new context in place of one that will not come back.
   *
   * iOS hands a page back from an app switch, a call or the lock screen
   * with its context 'interrupted', and `resume()` on that context resolves
   * and changes nothing: the clock stays stopped, or runs with the output
   * route gone, and every sound after it is silent until the page reloads.
   * The one thing that works is a fresh context, made inside a gesture.
   * The decoded clips are plain data and play in the new one as they did
   * in the old; whoever tapped the old graph (the studio's recorder) is
   * told through `onRebuild`.
   */
  _rebuild() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const old = this.ctx;
    try {
      this.ctx = new Ctx();
      this._graph();
      this.voices = 0;
      this._lastPlayed.clear();
      this.rebuilt = (this.rebuilt || 0) + 1;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => { /* the next gesture */ });
      if (old) old.close().catch(() => { /* gone already */ });
      if (this.onRebuild) this.onRebuild(this.ctx);
      console.warn('[tumble] audio context rebuilt');
      // Clips the first context never decoded get a second chance on this one.
      if (this.buffers.size < Object.keys(CLIPS).length) this._loadAll().catch(() => { /* reported in loadReport */ });
    } catch (e) {
      this.ctx = old;
      console.warn('[tumble] audio rebuild failed:', e.message);
    }
  }

  /**
   * Bring the context back when the game does.
   *
   * A browser suspends an AudioContext when its page goes into the background
   * and does not necessarily start it again on the way back — iOS in
   * particular hands the page back with the context still suspended, and
   * nothing here was asking. Every sound after that was scheduled into a clock
   * that was not running, which from the sofa is a game that has gone silent
   * for no reason and stays silent until it is reloaded.
   *
   * Three ways in, because no single one of them fires everywhere: the
   * visibility change, the back-forward cache restore, and the next thing the
   * player touches. `resume()` on a context that is already running is a no-op,
   * so asking three times costs nothing.
   */
  _watch() {
    if (this._watching) return;
    this._watching = true;
    const wake = () => this.resume();
    // A gesture is the one place a context can be made or started on iOS: if
    // the one we have is not running by now, or sits 'interrupted', it is
    // replaced here and now, on the tap, rather than asked again.
    const gesture = () => {
      if (!this.ctx || this._failed) return;
      const st = this.ctx.state;
      if (st === 'running') { this._stuckSince = 0; return; }
      if (st === 'interrupted' || (this._stuckSince && performance.now() - this._stuckSince > 700)) { this._rebuild(); return; }
      if (!this._stuckSince) this._stuckSince = performance.now();
      this.resume();
    };
    // Put away with the page: a phone keeps a running context, and the CPU
    // behind it, awake in the background for as long as the app is left
    // there, mixing a battle that is no longer being drawn.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) wake();
      else if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => { /* gone already */ });
    });
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);
    // Not `once`: the gesture is a fallback for every return, not just the
    // first one.
    window.addEventListener('pointerdown', gesture, { passive: true });
    window.addEventListener('touchend', gesture, { passive: true });
    window.addEventListener('keydown', gesture);
  }

  /** Start the clock again if something stopped it. Safe to call at any time. */
  resume() {
    if (!this.ctx || this._failed) return;
    if (this.ctx.state === 'running') { this._stuckSince = 0; return; }
    if (!this._stuckSince) this._stuckSince = performance.now();
    this.ctx.resume().then(() => { if (this.ctx.state === 'running') this._stuckSince = 0; }).catch(() => { /* still no gesture; the next one will do */ });
  }

  /** The context's state, for the diagnostics and the crash recorder. */
  get state() { return this.ctx ? this.ctx.state : (this._failed ? 'failed' : 'none'); }

  async _loadAll() {
    const t0 = performance.now();
    const clips = await Promise.all(Object.entries(CLIPS).map(([name, base]) => this._loadOne(name, base)));
    this.loadReport = {
      at: new Date().toISOString(),
      native: NATIVE_APP,
      formats: FORMATS.join(' then '),
      ctx: this.ctx ? { state: this.ctx.state, sampleRate: this.ctx.sampleRate } : null,
      ms: Math.round(performance.now() - t0),
      ok: clips.filter((c) => c.ok).length,
      total: clips.length,
      clips,
    };
    const failed = clips.filter((c) => !c.ok);
    if (failed.length) console.warn('[tumble] clips not loaded:', failed.map((c) => `${c.name} (${c.tried.map((t) => `${t.format}: ${t.error}`).join('; ')})`).join(', '));
  }

  /**
   * One clip, in the first format that fetches and decodes. The decode is
   * asked for in the callback form as well as the promise one: WebKit had
   * the callbacks long before it returned a promise, and the two never
   * disagree where both exist. A buffer handed to the decoder is detached by
   * it, so every attempt fetches its own.
   */
  async _loadOne(name, base) {
    const rec = { name, ok: false, format: null, bytes: 0, seconds: 0, tried: [] };
    for (const format of FORMATS) {
      const url = `${base}.${format}`;
      const t = { format, error: null };
      try {
        const got = await fetchBytes(url);
        const bytes = got.bytes;
        rec.bytes = bytes.byteLength; t.via = got.via;
        const buf = await new Promise((resolve, reject) => {
          try {
            const p = this.ctx.decodeAudioData(bytes, resolve, reject);
            if (p && typeof p.then === 'function') p.then(resolve, reject);
          } catch (e) { reject(e); }
        });
        this.buffers.set(name, buf);
        rec.ok = true; rec.format = format; rec.seconds = Math.round(buf.duration * 100) / 100;
        rec.tried.push(t);
        break;
      } catch (e) {
        t.error = (e && (e.message || e.name)) ? `${e.name || 'Error'}: ${e.message || ''}`.trim() : String(e);
        rec.tried.push(t);
      }
    }
    return rec;
  }

  /** The clips the fight has, as one line for the SETTINGS sheet. */
  says() {
    if (this._failed) return 'audio unavailable';
    const r = this.loadReport;
    if (!r) return this.ctx ? 'loading' : 'not started · tap first';
    const failed = r.clips.filter((c) => !c.ok).map((c) => c.name);
    const via = [...new Set(r.clips.filter((c) => c.ok).map((c) => c.format))].join('+') || '—';
    const ctx = this.ctx ? `${this.ctx.state} ${Math.round(this.ctx.sampleRate / 1000)}k` : 'no context';
    return `${r.ok}/${r.total} clips · ${via} · ${ctx}${failed.length ? ` · missing ${failed.join(' ')}` : ''}${this.rebuilt ? ` · rebuilt ×${this.rebuilt}` : ''}`;
  }

  /**
   * Every loaded clip once, in turn, flat and at a third: the SOUND CHECK
   * row on SETTINGS, so the owner can hear which clips the phone has without
   * a battle. Returns the names it played.
   */
  check() {
    if (!this.ready || this._failed || !this.ctx) return [];
    const names = Object.keys(CLIPS).filter((n) => this.buffers.has(n));
    let at = 0;
    for (const n of names) {
      this.play(n, null, { gain: 0.35, delay: at, priority: true, cooldown: 0 });
      at += Math.min(2.5, this.buffers.get(n).duration) + 0.25;
    }
    return names;
  }

  /** Call once per frame so positioning has somewhere to measure from. */
  setListener(camera) {
    camera.getWorldPosition(this._listenerPos);
    // Camera's own right vector, for the stereo image.
    this._listenerRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      this.master.gain.setTargetAtTime(on ? 0.75 : 0.0, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * @param {string} name   clip id
   * @param {THREE.Vector3|null} pos  world position, or null for a 2D cue
   * @param {object} opts   { gain, rate, rolloff, cooldown, delay, priority }
   *   `priority` plays past the voice cap: a sound that happens once and is
   *   the whole point of what the player paid for (the A-10's gun run) must
   *   not be the one dropped because the battle around it is loud.
   * @returns {boolean} whether it was scheduled
   */
  play(name, pos, opts = {}) {
    if (!this.ready || !this.enabled || this._failed) return false;
    // A suspended context (iOS: a call, Siri, the lock screen) has a stopped
    // clock: sources queue on it and never end, and play at once on resume.
    if (this.ctx.state !== 'running') return false;
    const buf = this.buffers.get(name);
    if (!buf) return false;
    if (this.voices >= MAX_VOICES && !opts.priority) return false;

    const now = this.ctx.currentTime;

    // Collapse stacked triggers of the same sound.
    const cooldown = opts.cooldown ?? 0;
    if (cooldown > 0) {
      const last = this._lastPlayed.get(name) ?? -1e9;
      if (now - last < cooldown) return false;
    }

    let gain = opts.gain ?? 1;
    let pan = 0;
    let delay = opts.delay ?? 0;

    if (pos) {
      const dist = this._listenerPos.distanceTo(pos);
      // Inverse-distance falloff with a soft near field, so standing the camera
      // on top of a gun doesn't blow the limiter.
      const rolloff = opts.rolloff ?? 220;
      gain *= rolloff / (rolloff + dist * dist / rolloff);
      if (gain < 0.006) return false;  // inaudible; don't spend a voice on it

      this._tmp.subVectors(pos, this._listenerPos).normalize();
      pan = THREE.MathUtils.clamp(this._tmp.dot(this._listenerRight), -1, 1) * 0.85;

      delay += Math.min(dist / SPEED_OF_SOUND, MAX_DELAY);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // Pitch jitter, plus whatever the caller wants for weapon size.
    // A recording that is a performance rather than a sample — the A-10's —
    // plays as it is.
    src.playbackRate.value = (opts.rate ?? 1) * (opts.exact ? 1 : 0.94 + Math.random() * 0.12);

    const g = this.ctx.createGain();
    g.gain.value = gain * (opts.exact ? 1 : 0.88 + Math.random() * 0.24);

    const panner = this.ctx.createStereoPanner?.();
    if (panner) {
      panner.pan.value = pan;
      src.connect(g).connect(panner).connect(this.master);
    } else {
      src.connect(g).connect(this.master);
    }

    // Stamped only for a sound that is actually played: a distant burst
    // culled as inaudible used to block a near one for its cooldown.
    if (opts.cooldown > 0) this._lastPlayed.set(name, now);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(now + delay);
    return true;
  }

  /**
   * A collapse doesn't have a sample — it's a long, low, structureless roar.
   * Synthesising it from filtered noise is both cheaper than shipping a big
   * loop and easier to scale by how much building is actually coming down.
   *
   * @param {number} magnitude 0..1
   */
  /**
   * The sound a building makes while it is deciding.
   *
   * A low, detuned, slowly bending tone — masonry grinding on masonry as a
   * section settles onto what is left of its bearing. It is the audio half of
   * the lean, and it does a job the visual cannot: it tells the player
   * something is happening even when they are looking somewhere else.
   *
   * @param {number} severity 0..1, how far past saving the structure is
   */
  /**
   * The hit marker's click, in the ear rather than in the world: a dry
   * tick for a round that found a man, a lower double one for a man down.
   * Synthesised, two oscillators at most; a held gun hitting every round
   * clicks at most every sixty milliseconds.
   */
  tick(kill = false) {
    if (!this.ready || !this.enabled || this._failed || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this._tickAt ?? -1) < 0.06) return;
    this._tickAt = now;
    for (let i = 0; i < (kill ? 2 : 1); i++) {
      const t = now + i * 0.07;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(kill ? 1300 : 2300, t);
      o.frequency.exponentialRampToValueAtTime(kill ? 650 : 1500, t + 0.04);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.06);
    }
  }

  groan(severity, pos) {
    if (!this.ready || !this.enabled || this._failed || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this._lastPlayed.get('groan') ?? -1e9) < 1.8) return;
    this._lastPlayed.set('groan', now);

    const m = THREE.MathUtils.clamp(severity, 0.1, 1);
    const dur = 1.6 + m * 1.8;
    const g = this.ctx.createGain();
    let level = 0.26 * (0.4 + m);
    if (pos) {
      const dist = this._listenerPos.distanceTo(pos);
      level *= 420 / (420 + dist);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), now + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    // Two oscillators a few cents apart beat against each other, which is what
    // makes it sound like stone under strain rather than a synthesiser.
    for (const [base, detune] of [[41, -9], [41, 11], [82, 4]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, now);
      o.frequency.linearRampToValueAtTime(base * (1 - 0.09 * m), now + dur);
      o.detune.value = detune;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180 + m * 120;
      lp.Q.value = 4.5;
      o.connect(lp).connect(g);
      o.start(now);
      o.stop(now + dur + 0.05);
    }
    // Into the master, like everything else here: `bus` is Ambience's, and
    // connecting to it threw, every 1.8 s, out of the middle of the frame.
    g.connect(this.master);
  }

  rumble(magnitude, pos) {
    if (!this.ready || !this.enabled || this._failed || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this._lastPlayed.get('rumble') ?? -1e9) < 0.5) return;
    this._lastPlayed.set('rumble', now);

    const m = THREE.MathUtils.clamp(magnitude, 0.1, 1);
    const dur = 1.1 + m * 2.6;
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(rate * dur), rate);
    const data = buf.getChannelData(0);

    // Brown-ish noise: integrating white noise tilts the spectrum down, which
    // is what gives it weight rather than hiss.
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.021 * white) / 1.021;
      data[i] = last * 5.2;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 110 + m * 220;
    lp.Q.value = 0.7;

    const g = this.ctx.createGain();
    let level = 0.5 * m;
    if (pos) {
      const dist = this._listenerPos.distanceTo(pos);
      level *= 420 / (420 + dist);
    }
    // Slow swell, long tail — a building coming down builds and then subsides.
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), now + 0.25 + m * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    this.voices++;
    src.onended = () => { this.voices--; };
    src.connect(lp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + dur);
  }

  /** Debug/telemetry. */
  get status() {
    return {
      ready: this.ready,
      failed: this._failed,
      state: this.ctx?.state ?? 'none',
      clips: [...this.buffers.keys()],
      voices: this.voices,
    };
  }
}
