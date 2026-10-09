/**
 * Power: how hard the game is allowed to work the device it is on.
 *
 * Two problems, both of them a phone's.
 *
 * Heat. The frame loop drew as fast as the display would take it, all the
 * time: sixty frames a second of shadowed, fogged, post-processed city while
 * the player was lining up a shot, while the pause menu was up, and behind
 * the title screen and the campaign map when either was opened over a battle.
 * The governor only ever steps quality down when frames run *long*, so a
 * phone that could keep up was never asked to do less, and ran its GPU flat
 * out until it was too hot to hold. The battery saver draws a battle at
 * thirty frames, which is what the eye needs for artillery and half the work;
 * a paused game, a finished one and one hidden behind a menu get a few frames
 * a second, which is enough to keep the picture behind the glass alive.
 *
 * Memory. A phone browser that runs out does not fail, it discards the page
 * and loads it again — and loads the same level, which runs out the same way,
 * and that is the game reloading itself over and over. Each level load leaves
 * a mark in storage that is wiped whenever the page is hidden or left in the
 * ordinary way. If the next boot finds it still there, the last page died in
 * front of the player, and on a phone the quality steps down a tier before
 * anything is built, so the loop breaks on the second try instead of never.
 */
import { detectQuality, setQuality, isMobile } from './quality.js';

const SAVER = 'tt.saver';
const BOOT = 'tt.boot';
const LADDER = ['low', 'medium', 'high', 'ultra'];

const suite = () => { try { return localStorage.getItem('tt.suite') === '1'; } catch { return false; } };

export const power = {
  /** Thirty frames in battle. On by default on a phone, off on a desktop. */
  // Asked every frame, so read from storage once and kept.
  _saver: null,
  get saver() {
    if (this._saver !== null) return this._saver;
    let v = null;
    if (suite()) v = false;
    else {
      try { const s = localStorage.getItem(SAVER); if (s) v = s === 'on'; } catch { /* private mode */ }
      if (v === null) v = isMobile();
    }
    return (this._saver = v);
  },
  /** The free savings (see `applySaver`): a phone, or the saver on. */
  get lean() { return this.saver || isMobile(); },
  set saver(on) {
    this._saver = !!on;
    try { localStorage.setItem(SAVER, on ? 'on' : 'off'); } catch { /* private mode */ }
    applySaver();
  },

  /**
   * The least time between drawn frames, in milliseconds, for the state the
   * game is in: `menu` a pause menu, `covered` the title or the campaign map
   * over the battle, `over` the level won or lost.
   */
  gap({ menu = false, covered = false, over = false } = {}) {
    if (suite()) return 0;
    if (covered) return 250;
    if (menu) return 100;
    if (over) return this.saver ? 50 : 0;
    return this.saver ? 1000 / 30 : 0;
  },
};

/**
 * Before anything is built: did the last level load die on screen? If so, on
 * a phone, a tier down. Returns `{ from, to }` when it stepped, else null.
 */
export function recoverFromCrash() {
  if (suite()) return null;
  let mark = null;
  try {
    mark = localStorage.getItem(BOOT);
    localStorage.removeItem(BOOT);
  } catch { return null; }
  if (!mark || !isMobile()) return null;
  const from = detectQuality().id;
  const at = LADDER.indexOf(from);
  if (at <= 0) return null;
  const to = LADDER[at - 1];
  return setQuality(to) ? { from, to, level: mark } : null;
}

/**
 * A level is loading: leave the mark, and take it away whenever the page is
 * hidden or left on purpose, so only a page that dies in view leaves it.
 */
export function armBoot(levelId) {
  if (suite()) return;
  const set = () => { try { localStorage.setItem(BOOT, levelId); } catch { /* private mode */ } };
  const clear = () => { try { localStorage.removeItem(BOOT); } catch { /* private mode */ } };
  set();
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); else set(); });
  window.addEventListener('pagehide', clear);
}

/**
 * The savings that cost nothing to look at — the shadow map drawn only when
 * something has moved (main.js `placeSun`), no frosted glass over the moving
 * picture (style.css `body.lean`) — are taken on any phone, and on a desktop
 * with the saver on. The page wears them as `body.lean`.
 */
export function applySaver() {
  if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('lean', power.lean);
}
