import { LEVELS, DEFAULT_LEVEL, LEVEL_BLURB, levelList } from '../game/levels.js';
import { suppressNextOpening } from './opening.js';

/**
 * Target select, and the record of what has been brought down.
 *
 * Until this existed there was no way for a player to reach any level but
 * Westminster: the other maps were behind a hand-edited query string or the
 * developer test panel. Three quarters of the game was unreachable from inside
 * the game.
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

const fmtTime = (t) => {
  if (t == null) return '—';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Build the screen and return a promise that resolves to the chosen level id.
 *
 * `current` marks the level in play, if any, so the screen can be reopened
 * mid-match as a "where else can I go" rather than only as a front door.
 */
export function showLevelSelect({ current = null, canResume = false } = {}) {
  const progress = loadProgress();
  const list = levelList();
  const done = list.filter((l) => progress[l.id]?.won).length;

  const root = document.createElement('div');
  root.id = 'levelselect';

  const cards = list.map((l) => {
    const rec = progress[l.id] || {};
    const state = rec.won ? 'done' : (rec.runs ? 'tried' : 'new');
    const badge = rec.won ? 'DOWN' : (rec.runs ? `${rec.runs} ATTEMPT${rec.runs > 1 ? 'S' : ''}` : 'STANDING');
    const stats = rec.won
      ? `<div class="ls-stats"><span>Best ${Math.round(rec.bestScore).toLocaleString()} t</span>`
        + `<span>${fmtTime(rec.bestTime)}</span></div>`
      : (rec.runs
        ? `<div class="ls-stats"><span>Best ${Math.round(rec.bestScore || 0).toLocaleString()} t</span></div>`
        : '');
    return `
      <button class="ls-card ${state}${l.id === current ? ' here' : ''}" data-level="${l.id}">
        <div class="ls-badge">${badge}</div>
        <div class="ls-target">${l.target}</div>
        <div class="ls-place">${l.place || l.name}</div>
        <div class="ls-blurb">${LEVEL_BLURB[l.id] || l.brief || ''}</div>
        ${stats}
        ${l.id === current ? '<div class="ls-here">IN PLAY</div>' : ''}
      </button>`;
  }).join('');

  root.innerHTML = `
    <div class="ls-inner">
      <div class="ls-head">
        <img class="ls-logo" src="./logo-512.png" alt="Excessive Force" width="512" height="512">
        <div class="ls-title">EXCESSIVE FORCE</div>
        <div class="ls-sub">SELECT TARGET · ${done} OF ${list.length} DOWN</div>
      </div>
      <div class="ls-grid">${cards}</div>
      <div class="ls-foot">
        ${canResume ? '<button class="ls-back" id="ls-back">BACK TO THE MATCH</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(root);

  return new Promise((resolve) => {
    root.querySelectorAll('.ls-card').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-level');
        root.remove();
        resolve(id);
      });
    });
    const back = root.querySelector('#ls-back');
    if (back) back.addEventListener('click', () => { root.remove(); resolve(null); });
  });
}

/**
 * Which level to boot, asking the player if they have not said.
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
  if (explicit && LEVELS[explicit]) return LEVELS[explicit];

  let seen = false;
  try { seen = localStorage.getItem(AUTOSTART_KEY) === '1'; } catch { /* no storage */ }
  if (seen) return LEVELS[DEFAULT_LEVEL];

  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  const id = await showLevelSelect({});
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
