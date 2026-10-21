/**
 * The durable copy of the game's records on the phone.
 *
 * Everything the game keeps — the campaign, the commander, the battles in
 * progress, the settings — is in `localStorage` under `tt.*`, and on the web
 * that is the right place for it. In the App Store build it is not enough:
 * WKWebView writes its localStorage to disk on its own schedule, behind the
 * page, and an app the player kills from the switcher a few seconds after
 * leaving a battle can be reopened with the last writes gone, the battle it
 * was saving along with them. The lost battle is the one the owner saw in
 * TestFlight: forty minutes of fight, then the title with nothing to continue.
 *
 * So on the native build every `tt.*` write is mirrored, a beat behind, into
 * the app's own preferences (`@capacitor/preferences`: UserDefaults, which
 * the system flushes with the app), and the boot reads them back first: a
 * key the web storage has lost or has an older copy of is restored from the
 * mirror before the title looks. The few records that are written every
 * couple of seconds and matter only to this page (the black box, the load
 * stage) are left out; everything else is a few kilobytes at most.
 *
 * The web build does none of this: `attach` is a no-op away from
 * `capacitor://`, and nothing here is imported by the page's hot paths.
 */
import { Preferences } from '@capacitor/preferences';

/** Written every few seconds for the page that is up, worth nothing after it. */
const SKIP = new Set(['tt.blackbox', 'tt.loadstage', 'tt.movefrom', 'tt.suite', 'tt.dev', 'tt.boot']);
const KEEP = (k) => typeof k === 'string' && k.startsWith('tt.') && !SKIP.has(k);
const DEBOUNCE_MS = 250;

const isNative = () => {
  try {
    return window.location?.protocol === 'capacitor:' || !!window.Capacitor?.isNativePlatform?.();
  } catch { return false; }
};

export const store = {
  native: false,
  attached: false,
  /** What the last boot did: keys in the mirror, keys restored into the page, errors. */
  report: null,
  pending: new Map(),
  timers: new Map(),
  writes: 0,
  errors: 0,
  lastError: null,
  _set0: null,
  _rm0: null,

  /**
   * Reads the mirror back into localStorage, then starts mirroring. Awaited
   * at the top of the boot so the title, the campaign and the saved battles
   * read what the phone kept. Never throws: a failure is recorded and the
   * page carries on with what localStorage has.
   */
  async restore() {
    this.native = isNative();
    const rep = { native: this.native, at: new Date().toISOString(), keys: 0, restored: [], uploaded: [], ms: 0, error: null };
    this.report = rep;
    if (!this.native) return rep;
    const t0 = performance.now();
    // A bridge that never answers must not hold the boot: the page carries on
    // with what localStorage has, and the report says the mirror was late.
    const late = new Promise((_, reject) => setTimeout(() => reject(new Error('the phone\'s store did not answer in 4 s')), 4000));
    const ask = (p) => Promise.race([p, late]);
    try {
      const { keys } = await ask(Preferences.keys());
      const mine = (keys || []).filter(KEEP);
      rep.keys = mine.length;
      for (const key of mine) {
        const { value } = await ask(Preferences.get({ key }));
        if (value == null) continue;
        let have = null;
        try { have = localStorage.getItem(key); } catch { /* blocked */ }
        // The mirror is what survived the kill; the page's copy may be older.
        if (have !== value) {
          try { localStorage.setItem(key, value); rep.restored.push(key); } catch (e) { rep.error = String(e?.message || e); }
        }
      }
      // The first boot after the update: what the page already had goes up.
      const seen = new Set(mine);
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!KEEP(key) || seen.has(key)) continue;
          const value = localStorage.getItem(key);
          if (value == null) continue;
          await ask(Preferences.set({ key, value }));
          rep.uploaded.push(key);
        }
      } catch (e) { rep.error = String(e?.message || e); }
    } catch (e) {
      rep.error = String(e?.message || e);
      this.lastError = rep.error;
    }
    rep.ms = Math.round(performance.now() - t0);
    this.attach();
    if (rep.restored.length) console.warn('[tumble] store: restored from the phone', rep.restored.join(' '));
    return rep;
  },

  /** Mirrors every later `tt.*` write. Idempotent; a no-op off the native build. */
  attach() {
    if (this.attached || !isNative()) return;
    const proto = Storage.prototype;
    const set0 = proto.setItem, rm0 = proto.removeItem, clear0 = proto.clear;
    this._set0 = set0; this._rm0 = rm0;
    const self = this;
    proto.setItem = function (k, v) {
      set0.call(this, k, v);
      if (this === window.localStorage && KEEP(k)) self._queue(k, String(v));
    };
    proto.removeItem = function (k) {
      rm0.call(this, k);
      if (this === window.localStorage && KEEP(k)) self._queue(k, null);
    };
    proto.clear = function () {
      if (this === window.localStorage) {
        try { for (let i = 0; i < this.length; i++) { const k = this.key(i); if (KEEP(k)) self._queue(k, null); } } catch { /* blocked */ }
      }
      clear0.call(this);
    };
    const flush = () => this.flush();
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    this.attached = true;
  },

  _queue(key, value) {
    this.pending.set(key, value);
    if (this.timers.has(key)) clearTimeout(this.timers.get(key));
    // A write with the page already hidden (the battle saved on its way to
    // the background) goes now: the system stops the timers with the page,
    // and a debounce would hold the one save that matters past the kill.
    if (document.hidden) { this._write(key); return; }
    this.timers.set(key, setTimeout(() => this._write(key), DEBOUNCE_MS));
  },

  _write(key) {
    this.timers.delete(key);
    if (!this.pending.has(key)) return;
    const value = this.pending.get(key);
    this.pending.delete(key);
    const p = value == null ? Preferences.remove({ key }) : Preferences.set({ key, value });
    this.writes++;
    p.catch((e) => { this.errors++; this.lastError = String(e?.message || e); });
  },

  /** Everything still waiting, written now: the page is going out of view. */
  flush() {
    for (const key of [...this.pending.keys()]) {
      if (this.timers.has(key)) { clearTimeout(this.timers.get(key)); this.timers.delete(key); }
      this._write(key);
    }
  },

  /** One line for the SETTINGS sheet. */
  says() {
    if (!this.native) return 'web storage only';
    const r = this.report || {};
    const bits = [`${r.keys || 0} kept on the phone`];
    if (r.restored?.length) bits.push(`${r.restored.length} restored at boot`);
    if (this.writes) bits.push(`${this.writes} written`);
    if (this.errors) bits.push(`${this.errors} failed`);
    if (r.error) bits.push(r.error);
    return bits.join(' · ');
  },
};
