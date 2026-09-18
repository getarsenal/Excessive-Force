import { LEVELS, DEFAULT_LEVEL, LEVEL_BLURB, levelList } from '../game/levels.js';
import { suppressNextOpening } from './opening.js';

/**
 * The record of what has been brought down, and how a level gets started.
 *
 * The screen that used to live here — a grid of four cards — is now the
 * campaign map in `worldmap.js`. What is left is the part that is not a
 * picture: the saved record of every run, and the one function that boots a
 * level.
 *
 * Choosing a target reloads the page. That is not a shortcut — a level is a
 * different DEM, a different city, a different set of structures and its own
 * physics world, so switching is a full rebuild either way, and a reload is
 * the one version of that with no chance of leaking state between maps.
 */

const PROGRESS_KEY = 'tt.progress';
const AUTOSTART_KEY = 'tt.autostart';

/** Read the saved record. Never throws: private mode has no storage. */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* no storage */ }
}

/**
 * Record a finished level.
 *
 * Keeps the best run rather than the last one: most masonry down, and the
 * quickest time among winning runs.
 */
export function recordResult(levelId, won, summary) {
  if (!levelId) return;
  const p = loadProgress();
  const was = p[levelId] || { runs: 0, won: false, bestScore: 0, bestTime: null };
  const next = {
    runs: was.runs + 1,
    won: was.won || !!won,
    bestScore: Math.max(was.bestScore || 0, Math.round(summary?.score || 0)),
    bestTime: won
      ? (was.bestTime == null ? summary?.time : Math.min(was.bestTime, summary?.time))
      : was.bestTime,
  };
  p[levelId] = next;
  saveProgress(p);
  return next;
}

/** The next target after `id` that has not been taken down yet. */
export function nextTarget(id) {
  const list = levelList();
  const p = loadProgress();
  const at = list.findIndex((l) => l.id === id);
  for (let k = 1; k <= list.length; k++) {
    const cand = list[(at + k + list.length) % list.length];
    if (!p[cand.id]?.won) return cand;
  }
  return list[(at + 1) % list.length];
}

/** Load a level. A full page load, deliberately — see the note at the top. */
export function goToLevel(id, opts = {}) {
  suppressNextOpening();
  const params = new URLSearchParams(window.location.search);
  params.set('level', id);
  if (opts.test) params.set('test', '1'); else params.delete('test');
  try { localStorage.setItem(AUTOSTART_KEY, '1'); } catch { /* no storage */ }
  window.location.search = params.toString();
}


/**
 * Which level to boot, asking the player if they have not said.
 *
 * The asking is the campaign map — see `worldmap.js` — imported here rather
 * than at the top of the file because it pulls in a hundred kilobytes of
 * coastline that a level started from a deep link never needs.
 *
 * An explicit `?level=` always wins, so deep links and the headless test
 * harness keep working. `tt.autostart` is set once the player has chosen
 * something, so they are not asked again every time they reload — and
 * `tools/shot.mjs` sets it too, which is what keeps the regression suite
 * booting straight into a level instead of sitting on this screen forever.
 */
export async function resolveStartLevel() {
  let explicit = null;
  try {
    explicit = new URLSearchParams(window.location.search).get('level');
  } catch { /* no location in some embeds */ }
  if (explicit && LEVELS[explicit]) {
    // And then take it out of the address bar.
    //
    // `?level=` is how the game navigates to a level and how a shared link
    // names one, and both of those are a thing that happens *once*. Left in
    // place it is also the address the browser reopens on — so a player who
    // closed the game inside Westminster and came back to it half an hour
    // later was put straight back into Westminster, with no way to the map
    // except a button inside the HUD. Restarting and switching quality go back
    // through `goToLevel`, which puts the parameter back for the one load that
    // needs it.
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('level')) {
        u.searchParams.delete('level');
        window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
      }
    } catch { /* no history in some embeds */ }
    return LEVELS[explicit];
  }

  // The front door is the front door, every time.
  //
  // This used to remember that the player had chosen once and then send them
  // straight back into Westminster on every later launch, so opening the game
  // dropped you into the middle of a battle with no way back to the map
  // except a button inside the HUD. A level only starts without asking when
  // something has explicitly asked for it — a shared link, or the game's own
  // navigation on the way to the next target, both of which name the level in
  // the URL and are handled above.
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  const { showWorldMap } = await import('./worldmap.js');
  const id = await showWorldMap({});
  if (loading) loading.style.display = '';
  try { localStorage.setItem(AUTOSTART_KEY, '1'); } catch { /* no storage */ }
  // Chosen from the front door: no reload needed, this is the first boot.
  if (id && LEVELS[id] && id !== DEFAULT_LEVEL) {
    const params = new URLSearchParams(window.location.search);
    params.set('level', id);
    window.history.replaceState({}, '', `?${params.toString()}`);
  }
  return LEVELS[id] || LEVELS[DEFAULT_LEVEL];
}
