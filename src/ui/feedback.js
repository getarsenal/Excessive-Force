/**
 * Feedback: what the game says back when something happens.
 *
 * One vocabulary for the whole game, so a tap on a button, a gun set down,
 * a refusal and a building coming down each have a feel of their own and the
 * same feel everywhere they happen. Every event is three channels at once:
 *
 *   touch   a vibration pattern. Android takes `navigator.vibrate`. iOS has
 *           no vibration API at all, but Safari 18 plays the system haptic
 *           when a switch-style checkbox is toggled, so a hidden one is
 *           toggled here, a tick per pulse. That only fires inside a gesture,
 *           which is exactly when a button is pressed; the heavier events
 *           that land later are felt on Android and heard and seen on both.
 *   sound   a few milliseconds of synthesis in the game's own AudioContext:
 *           a tick, a blip, a two-note confirm, a buzz for no, a coin, a
 *           brass stab for a milestone. The game's SOUND switch covers it.
 *   sight   left to the caller (the HUD shakes, flashes and pops), because
 *           the look of a thing lives with the thing.
 *
 * Every event has its own floor between repeats, so sixty guns firing is not
 * sixty buzzes, and nothing here allocates more than a couple of audio nodes.
 */
const KEY = 'tt.haptics';

const suite = () => { try { return localStorage.getItem('tt.suite') === '1'; } catch { return false; } };
const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The palette. `v` is the vibration pattern (on, off, on ...) in
 * milliseconds; `gap` the shortest time in seconds between two of the same;
 * `s` the sound, if any.
 */
const EVENTS = {
  tap:       { v: [8], gap: 0.04, s: 'tick' },
  select:    { v: [12], gap: 0.06, s: 'blip' },
  open:      { v: [10], gap: 0.08, s: 'whoosh' },
  confirm:   { v: [16, 40, 22], gap: 0.12, s: 'confirm' },
  deny:      { v: [28, 45, 28, 45, 28], gap: 0.3, s: 'deny' },
  target:    { v: [14, 30, 30], gap: 0.2, s: 'lock' },
  strike:    { v: [30, 50, 30, 50, 70], gap: 0.5, s: 'klaxon' },
  lift:      { v: [18, 60, 18], gap: 0.5, s: 'confirm' },
  landed:    { v: [22], gap: 0.3, s: null },
  kill:      { v: [9], gap: 0.25, s: 'coin' },
  impact:    { v: [22], gap: 0.3, s: null },
  hit:       { v: [26, 40, 16], gap: 0.6, s: 'thud' },
  lost:      { v: [70, 50, 110], gap: 0.8, s: 'down' },
  rank:      { v: [12, 40, 12, 40, 24], gap: 0.6, s: 'rank' },
  milestone: { v: [30, 60, 30, 60, 90], gap: 1.0, s: 'stab' },
  collapse:  { v: [50, 30, 90, 40, 180, 60, 260], gap: 2.0, s: null },
  win:       { v: [90, 70, 90, 70, 320], gap: 3.0, s: 'fanfare' },
  lose:      { v: [320], gap: 3.0, s: 'down' },
  // A supply crate: the knocking as it rocks, the lid going, the payout.
  rattle:    { v: [14, 30, 14], gap: 0.3, s: 'rattle' },
  burst:     { v: [60, 30, 40], gap: 0.6, s: 'burst' },
  jackpot:   { v: [40, 40, 40, 40, 200], gap: 1.0, s: 'jackpot' },
};

class Feedback {
  constructor() {
    this.audio = null;      // the game's Audio, once there is one
    this._own = null;
    this._last = Object.create(null);
    this._sw = null;
  }

  /** Borrow the game's audio (its switch and its context). */
  attach(audio) { this.audio = audio; }

  get haptics() {
    try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
  }
  set haptics(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    if (on) this.emit('confirm');
  }

  get _soundOn() {
    const a = this.audio;
    return !(a && a.enabled === false);
  }

  _ctx() {
    const a = this.audio;
    if (a && a.ctx) return a.ctx;
    if (!this._own) {
      const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!C) return null;
      try { this._own = new C(); } catch { return null; }
    }
    return this._own;
  }

  /** Something happened. `strength` scales the sound (0..1.5). */
  emit(kind, strength = 1) {
    if (suite()) return;
    const e = EVENTS[kind];
    if (!e) return;
    const now = performance.now() / 1000;
    if (now - (this._last[kind] ?? -9) < e.gap) return;
    this._last[kind] = now;
    if (this.haptics) this._buzz(e.v);
    if (e.s && this._soundOn) this._sound(e.s, strength);
  }

  // ── touch ────────────────────────────────────────────────────────────────
  _buzz(pattern) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(pattern); } catch { /* not allowed */ }
      return;
    }
    // iOS: one switch toggle per pulse, at the pulse's own offset.
    const sw = this._switch();
    if (!sw) return;
    let t = 0;
    for (let i = 0; i < pattern.length; i += 2) {
      const at = t;
      if (at === 0) sw.click(); else setTimeout(() => sw.click(), at);
      t += pattern[i] + (pattern[i + 1] || 0);
      if (i >= 6) break;          // four ticks is all a pattern needs
    }
  }

  _switch() {
    if (this._sw) return this._sw;
    if (typeof document === 'undefined' || !document.body) return null;
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-200px;top:-200px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    // The toggle is ours, not the page's: nothing else hears it.
    label.addEventListener('click', (ev) => ev.stopPropagation());
    document.body.appendChild(label);
    this._sw = label;
    return label;
  }

  // ── sound ────────────────────────────────────────────────────────────────
  _sound(name, k) {
    const c = this._ctx();
    if (!c) return;
    if (c.state !== 'running') { c.resume().catch(() => {}); if (c.state !== 'running') return; }
    const t = c.currentTime + 0.005;
    const g = Math.max(0.2, Math.min(1.5, k));
    const tone = (type, f0, f1, dur, vol, at = 0, filt = 0) => {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      gn.gain.setValueAtTime(0.0001, t + at);
      gn.gain.exponentialRampToValueAtTime(vol * g, t + at + Math.min(0.012, dur * 0.2));
      gn.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      let node = o.connect(gn);
      if (filt) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = filt;
        node = gn.connect(f);
      }
      node.connect(c.destination);
      o.start(t + at); o.stop(t + at + dur + 0.02);
    };
    // A burst of noise, for things that crack rather than ring.
    const noise = (dur, vol, at = 0, filt = 1800) => {
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = c.createBufferSource(), gn = c.createGain(), f = c.createBiquadFilter();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = filt;
      gn.gain.value = vol * g;
      src.connect(f).connect(gn).connect(c.destination);
      src.start(t + at);
    };
    switch (name) {
      case 'rattle':
        for (let i = 0; i < 3; i++) tone('square', 190 - i * 18, 120, 0.05, 0.05, i * 0.055, 900);
        noise(0.08, 0.06, 0, 1400);
        break;
      case 'burst':
        noise(0.45, 0.22, 0, 2600);
        tone('sine', 120, 40, 0.5, 0.2);
        tone('triangle', 660, 1320, 0.35, 0.04, 0.05, 3000);
        break;
      case 'jackpot':
        [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3], [1319, 0.42]].forEach(([f, at]) => tone('sawtooth', f, f, at > 0.4 ? 0.9 : 0.14, 0.045, at, 2600));
        for (let i = 0; i < 6; i++) tone('sine', 2093 + i * 260, 2093 + i * 260, 0.18, 0.025, 0.5 + i * 0.06);
        break;
      case 'tick': tone('square', 2400, 1800, 0.018, 0.035, 0, 5000); break;
      case 'blip': tone('sine', 880, 1320, 0.06, 0.07); break;
      case 'whoosh': tone('triangle', 300, 700, 0.09, 0.04, 0, 2400); break;
      case 'confirm': tone('sine', 1047, 1047, 0.07, 0.08); tone('sine', 1568, 1568, 0.11, 0.08, 0.065); break;
      case 'deny': tone('square', 140, 110, 0.09, 0.06, 0, 900); tone('square', 140, 100, 0.12, 0.06, 0.11, 900); break;
      case 'lock': tone('square', 1760, 1760, 0.035, 0.035, 0, 4000); tone('square', 1760, 1760, 0.035, 0.035, 0.06, 4000); tone('sine', 2637, 2637, 0.12, 0.05, 0.12); break;
      case 'klaxon': for (let i = 0; i < 2; i++) tone('sawtooth', 520, 390, 0.22, 0.05, i * 0.26, 1600); break;
      case 'coin': tone('square', 1976, 1976, 0.05, 0.035, 0, 6000); tone('square', 2637, 2637, 0.12, 0.035, 0.05, 6000); break;
      case 'thud': tone('sine', 150, 55, 0.14, 0.18); break;
      case 'down': tone('sawtooth', 330, 110, 0.5, 0.07, 0, 1200); break;
      case 'rank': [784, 988, 1175].forEach((f, i) => tone('triangle', f, f, 0.12, 0.07, i * 0.07)); break;
      case 'stab': [262, 330, 392, 523].forEach((f) => tone('sawtooth', f, f, 0.35, 0.03, 0, 1800)); break;
      case 'fanfare':
        [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]].forEach(([f, at]) => tone('sawtooth', f, f, at === 0.36 ? 0.7 : 0.14, 0.04, at, 2200));
        break;
      default: break;
    }
  }
}

export const feedback = new Feedback();

/**
 * Every button press anywhere in the game gets the tap: a tick under the
 * finger and a click in the ear. Installed once, in the capture phase, so it
 * runs before whatever the button does and cannot be stopped by it.
 */
export function installTapFeedback() {
  if (typeof window === 'undefined' || window.__tapFeedback) return;
  window.__tapFeedback = true;
  window.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('button, [role="button"], .unit-card, .ef-row, .tt-item, .wm-pin');
    if (!b || b.disabled) return;
    feedback.emit('tap');
  }, true);
  if (reduce()) document.documentElement.classList.add('reduce-motion');
}
