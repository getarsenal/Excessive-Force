/**
 * The typewriter under the generals.
 *
 * Their lines type themselves out at forty characters a second, and in
 * silence that read as a subtitle; with a key striking under every letter it
 * reads as a dispatch being cut, which is what a stand-off between two
 * commanders is. Made rather than loaded, like the menu's thump: a key is a
 * few milliseconds of filtered noise over a short knock, the space bar is a
 * duller one, and the end of a line is the carriage coming back — a ratchet
 * of clicks — and the bell.
 *
 * It borrows the game's AudioContext when there is one, so the sound switch
 * in the pause menu is its switch too, and makes its own otherwise. A context
 * that the browser has not yet let start stays silent until the next tap,
 * which the stand-off and the tutorial both get plenty of.
 */
let own = null;
let noise = null;

function suite() {
  try { return localStorage.getItem('tt.suite') === '1'; } catch { return false; }
}

export class Typewriter {
  /** @param {object|null} audio  the game's Audio, if it is to share it */
  constructor(audio = null) {
    this.audio = audio;
    this.last = 0;
  }

  get ctx() {
    const a = this.audio;
    if (a && a.ctx) return a.ctx;
    if (!own) {
      const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!C) return null;
      try { own = new C(); } catch { return null; }
    }
    return own;
  }

  get on() {
    if (suite()) return false;
    const a = this.audio;
    return !(a && a.enabled === false);
  }

  /** Call from inside a tap: the browser's permission to start sound. */
  resume() {
    const c = this.ctx;
    if (c && c.state !== 'running') c.resume().catch(() => {});
  }

  _ready() {
    if (!this.on) return null;
    const c = this.ctx;
    if (!c || c.state !== 'running') return null;
    if (!noise || noise.sampleRate !== c.sampleRate) {
      noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.06), c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    }
    return c;
  }

  _strike(c, t, { freq, q, gain, knock, dur }) {
    const src = c.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
    // The typebar landing on the platen: a short low knock under the click.
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(knock, t);
    o.frequency.exponentialRampToValueAtTime(knock * 0.5, t + 0.03);
    og.gain.setValueAtTime(gain * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(og).connect(c.destination);
    o.start(t);
    o.stop(t + 0.05);
  }

  /** One key. Spaces are the bar; punctuation is struck a little harder. */
  key(ch = 'a') {
    const c = this._ready();
    if (!c) return;
    const t = c.currentTime;
    // Never two on top of each other: at forty a second a frame can owe two.
    if (t - this.last < 0.018) return;
    this.last = t;
    if (ch === ' ' || ch === '\n') {
      this._strike(c, t, { freq: 900, q: 1.2, gain: 0.07, knock: 110, dur: 0.05 });
      return;
    }
    const hard = /[.,!?;:—-]/.test(ch);
    this._strike(c, t, {
      freq: 2600 + Math.random() * 1600, q: 2.2,
      gain: (hard ? 0.2 : 0.13) * (0.8 + Math.random() * 0.4),
      knock: 190 + Math.random() * 60, dur: 0.028,
    });
  }

  /** The end of a line: the carriage coming back, and the bell. */
  ding() {
    const c = this._ready();
    if (!c) return;
    const t = c.currentTime + 0.02;
    for (let i = 0; i < 6; i++) {
      this._strike(c, t + i * 0.028, { freq: 1500 + i * 60, q: 3, gain: 0.05, knock: 140, dur: 0.02 });
    }
    const b = t + 0.2;
    for (const [f, v] of [[2093, 0.09], [3140, 0.045], [5230, 0.02]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, b);
      g.gain.exponentialRampToValueAtTime(v, b + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, b + 1.1);
      o.connect(g).connect(c.destination);
      o.start(b);
      o.stop(b + 1.2);
    }
  }
}
