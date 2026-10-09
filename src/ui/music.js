/**
 * The menu music: one looping track under the front door and the campaign
 * map, faded in, and faded out when a level starts.
 *
 * The file is `public/assets/audio/menu.mp3` (or .ogg, .m4a): American patriotic
 * metal, re-encoded from the owner's 256k upload to 128k for phones. Until it is
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

  /** Start fetching now, well before anything wants to play it. */
  preload() {
    if (typeof Audio === 'undefined' || this._suite()) return;
    const a = this._load();
    if (a && !this._fetching) { this._fetching = true; try { a.load(); } catch { /* ignore */ } }
  }

  _suite() {
    try { return localStorage.getItem('tt.suite') === '1'; } catch { return false; }
  }

  /**
   * Spend a user gesture on the music element.
   *
   * A phone will not start sound without a tap, and it will not really fetch
   * a media file either until something has tried to play it. Playing it
   * muted inside the gesture, and pausing it straight away unless the menu
   * already wants it, does both: the element is unlocked for the rest of the
   * session and the track is buffering, so the menu's own play() starts at
   * once instead of eight seconds later.
   */
  unlock() {
    if (this._unlocked || this._suite()) return;
    const a = this._load();
    if (!a) return;
    this._unlocked = true;
    a.muted = true;
    const p = a.play();
    const after = () => {
      a.muted = false;
      if (!this.want || !this.enabled) { a.pause(); a.volume = 0; }
    };
    if (p && p.then) p.then(after).catch(() => { a.muted = false; this._unlocked = false; });
    else after();
  }

  play() {
    this.want = true;
    if (!this.enabled || (typeof localStorage !== 'undefined' && localStorage.getItem('tt.suite') === '1')) return;
    const a = this._load();
    preloadEagle();
    if (!a) return;
    const start = () => a.play().then(() => this._fadeTo(VOLUME, 500)).catch(() => {
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
// Left in the background, the menu's track stops, and comes back with the page.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const a = menuMusic.el;
    if (!a) return;
    if (document.hidden) { if (!a.paused) { menuMusic._hiddenPause = true; a.pause(); } }
    else if (menuMusic._hiddenPause) { menuMusic._hiddenPause = false; if (menuMusic.want && menuMusic.enabled) a.play().catch(() => { /* waits for a touch */ }); }
  });
}

/**
 * The eagle. One screech as the player commits to a battle — the nod to the
 * flag on every gun in the arsenal, and to the whole idea of the game, which
 * is that this is a great deal more force than anybody needed. It rides the
 * menu music's switch, which is the only sound control the menus have, and
 * resolves once it has had its moment so a page about to navigate does not
 * cut it off mid-cry.
 */
let eagleEl = null;
export function preloadEagle() {
  if (eagleEl || typeof Audio === 'undefined') return;
  eagleEl = new Audio('assets/audio/eagle.mp3');
  eagleEl.preload = 'auto';
  eagleEl.volume = 0.95;
}

export function eagle(hold = 950) {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('tt.suite') === '1') return Promise.resolve();
  if (!menuMusic.enabled) return Promise.resolve();
  preloadEagle();
  try {
    eagleEl.currentTime = 0;
    eagleEl.play().catch(() => {});
  } catch { /* no audio */ }
  return new Promise((r) => setTimeout(r, hold));
}

// The first touch anywhere unlocks the music, whichever screen it lands on.
if (typeof window !== 'undefined') {
  window.__menuMusic = menuMusic;     // for the console and the harness
  const first = () => {
    window.removeEventListener('pointerdown', first, true);
    window.removeEventListener('keydown', first, true);
    menuMusic.unlock();
  };
  window.addEventListener('pointerdown', first, true);
  window.addEventListener('keydown', first, true);
}
