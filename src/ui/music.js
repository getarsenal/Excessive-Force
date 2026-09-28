/**
 * The menu music: one looping track under the front door and the campaign
 * map, faded in, and faded out when a level starts.
 *
 * The file is `public/assets/audio/menu.mp3` (or .ogg, .m4a). Until it is
 * there, nothing happens: the element fails to load and is dropped. Browsers
 * refuse to start sound before the page has been touched, so a refused start
 * waits for the first tap and tries again. The choice to mute it is kept.
 */
const SOURCES = ['assets/audio/menu.mp3', 'assets/audio/menu.ogg', 'assets/audio/menu.m4a'];
const KEY = 'tt.music';
const VOLUME = 0.42;

class MenuMusic {
  constructor() {
    this.el = null;
    this.want = false;
    this.missing = false;
    this._fade = null;
  }

  get enabled() {
    try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
  }

  set enabled(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    if (on && this.want) this.play(); else if (!on) this._fadeTo(0, 300, true);
  }

  _load() {
    if (this.el || this.missing) return this.el;
    const a = new Audio();
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    let i = 0;
    const next = () => {
      if (i >= SOURCES.length) { this.missing = true; this.el = null; return; }
      a.src = SOURCES[i++];
    };
    a.addEventListener('error', next);
    next();
    this.el = a;
    return a;
  }

  play() {
    this.want = true;
    if (!this.enabled || (typeof localStorage !== 'undefined' && localStorage.getItem('tt.suite') === '1')) return;
    const a = this._load();
    if (!a) return;
    const start = () => a.play().then(() => this._fadeTo(VOLUME, 1800)).catch(() => {
      // Not allowed yet: the first touch anywhere is permission.
      const retry = () => { window.removeEventListener('pointerdown', retry, true); if (this.want) start(); };
      window.addEventListener('pointerdown', retry, true);
    });
    start();
  }

  stop(ms = 700) {
    this.want = false;
    this._fadeTo(0, ms, true);
  }

  _fadeTo(v, ms, pauseAtEnd = false) {
    const a = this.el;
    if (!a) return;
    clearInterval(this._fade);
    const from = a.volume, t0 = performance.now();
    this._fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = Math.max(0, Math.min(1, from + (v - from) * k));
      if (k >= 1) {
        clearInterval(this._fade);
        if (pauseAtEnd && v === 0) a.pause();
      }
    }, 40);
  }
}

export const menuMusic = new MenuMusic();
