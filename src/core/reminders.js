/**
 * The daily strike's reminder: one notification late in the day if today's
 * strike has not been flown, and nothing at all unless the player asked.
 *
 * There is no server to push from, so the reminder is the offline copy's own
 * (public/sw.js): the browser wakes the service worker now and then through
 * periodic background sync, the worker reads what the page last wrote down
 * (today's target, whether it is done) and decides. That API exists only in
 * Chromium, and only for a game installed to the home screen; everywhere else
 * the setting says so rather than pretending. iPhone's Safari has no way to
 * do this without a push server.
 */
const KEY = 'tt.remind';
const TAG = 'daily-reminder';
const STATE = 'ef-state';
const stateUrl = () => new URL('./__ef-state', location.href).href;

const get = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };
const set = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } };

async function registration() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return null;
  try { return await navigator.serviceWorker.ready; } catch { return null; }
}

export const reminders = {
  get on() { return get(); },

  /** Whether this browser can do it at all. */
  get possible() {
    return typeof window !== 'undefined' && 'Notification' in window
      && typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype;
  },

  /** What the settings row says. */
  label() {
    if (!this.possible) return 'NOT ON THIS BROWSER';
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'BLOCKED IN SETTINGS';
    return this.on ? 'ON · EVENINGS' : 'OFF';
  },

  /** Turn it on. Resolves to the row's new text. */
  async enable() {
    if (!this.possible) return this.label();
    const perm = await Notification.requestPermission().catch(() => 'denied');
    if (perm !== 'granted') return this.label();
    const reg = await registration();
    if (!reg) return 'NEEDS THE INSTALLED GAME';
    try {
      const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (st.state !== 'granted') return 'NEEDS THE INSTALLED GAME';
      await reg.periodicSync.register(TAG, { minInterval: 12 * 3600 * 1000 });
    } catch { return 'NEEDS THE INSTALLED GAME'; }
    set(true);
    await this.publish({ remind: true });
    return this.label();
  },

  async disable() {
    set(false);
    const reg = await registration();
    try { await reg?.periodicSync?.unregister(TAG); } catch { /* not registered */ }
    await this.publish({ remind: false });
    return this.label();
  },

  /**
   * Write down what the worker needs to decide: today's target and whether it
   * is done. Merged with what was there, so the title and the battle can each
   * say their half.
   */
  async publish(part) {
    if (typeof caches === 'undefined') return;
    try {
      const c = await caches.open(STATE);
      const old = await c.match(stateUrl());
      const s = old ? await old.json() : {};
      const next = { ...s, remind: get(), hour: 17, ...part };
      await c.put(stateUrl(), new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }));
    } catch { /* no storage: no reminder */ }
  },
};
