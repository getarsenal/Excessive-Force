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
const MAX_VOICES = 24;

const CLIPS = {
  gun: 'assets/cannon.mp3',
  rocket: 'assets/rocket.mp3',
  explosion: 'assets/explosion.mp3',
  mg: 'assets/machine_gun.mp3',
  enemy: 'assets/enemy_shot.mp3',
};

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
    if (this.ctx || this._failed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this._failed = true; return; }
      this.ctx = new Ctx();
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.75;
      // A limiter stops a barrage from clipping into distortion; without it a
      // HIMARS salvo plus its impacts is a wall of crackle.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -8;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.master.connect(this.limiter).connect(this.ctx.destination);

      await this._loadAll();
      this.ready = true;
    } catch (e) {
      console.warn('[tumble] audio unavailable:', e.message);
      this._failed = true;
    }
  }

  async _loadAll() {
    const jobs = Object.entries(CLIPS).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const bytes = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(bytes);
        this.buffers.set(name, buf);
      } catch (e) {
        console.warn(`[tumble] could not load ${url}:`, e.message);
      }
    });
    await Promise.all(jobs);
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
   * @param {object} opts   { gain, rate, rolloff, cooldown, delay }
   */
  play(name, pos, opts = {}) {
    if (!this.ready || !this.enabled || this._failed) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    if (this.voices >= MAX_VOICES) return;

    const now = this.ctx.currentTime;

    // Collapse stacked triggers of the same sound.
    const cooldown = opts.cooldown ?? 0;
    if (cooldown > 0) {
      const last = this._lastPlayed.get(name) ?? -1e9;
      if (now - last < cooldown) return;
      this._lastPlayed.set(name, now);
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
      if (gain < 0.006) return;  // inaudible; don't spend a voice on it

      this._tmp.subVectors(pos, this._listenerPos).normalize();
      pan = THREE.MathUtils.clamp(this._tmp.dot(this._listenerRight), -1, 1) * 0.85;

      delay += Math.min(dist / SPEED_OF_SOUND, MAX_DELAY);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // Pitch jitter, plus whatever the caller wants for weapon size.
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);

    const g = this.ctx.createGain();
    g.gain.value = gain * (0.88 + Math.random() * 0.24);

    const panner = this.ctx.createStereoPanner?.();
    if (panner) {
      panner.pan.value = pan;
      src.connect(g).connect(panner).connect(this.master);
    } else {
      src.connect(g).connect(this.master);
    }

    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(now + delay);
  }

  /**
   * A collapse doesn't have a sample — it's a long, low, structureless roar.
   * Synthesising it from filtered noise is both cheaper than shipping a big
   * loop and easier to scale by how much building is actually coming down.
   *
   * @param {number} magnitude 0..1
   */
  rumble(magnitude, pos) {
    if (!this.ready || !this.enabled || this._failed) return;
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
