import { LEVELS, LEVEL_ORDER } from './levels.js';
import { loadProgress } from '../ui/levelselect.js';

/**
 * The campaign.
 *
 * Four contracts, in one order, each one a country on the map. The order is not
 * decoration: the arsenal opens up as contracts are closed, so London is fought
 * with light guns and Egypt with whatever is left of the air force, and a
 * player who arrives at the Great Pyramid with an AT4 has been sent there by
 * the game rather than by their own bad idea.
 *
 * Two things are tracked and they are not the same. `tt.progress` already knows
 * which levels have been won and what the best run was; that is the record of
 * play and it belongs to the level. This knows which *contracts* are closed and
 * which of their objectives were met, which is the record of the campaign and
 * belongs to the map. Keeping them apart means replaying a finished contract
 * can improve a score without the map pretending the war is still on.
 */

const KEY = 'tt.campaign';

/**
 * Where each contract is, and what the client wants.
 *
 * Coordinates are the landmark's own, not the capital's: the fire starts at the
 * building and runs out to the border from there, so Giza burns from the
 * pyramids up the Nile rather than from a dot on Cairo.
 *
 * `lx`/`ly` push the label off its own pin, in map units. London and Paris are
 * three hundred and forty kilometres apart, which at the width of a phone is
 * four pixels, and the two names printed straight through each other.
 */
export const THEATRES = [
  {
    id: 'westminster',
    iso: 'GBR',
    lx: -52, ly: -30,
    city: 'LONDON',
    lon: -0.1246, lat: 51.4994,
    no: 1,
    title: 'THE CLOCK',
    brief: 'Ninety-six metres of Anston stone on four walls and a hollow shaft. '
      + 'The client wants it in the river. Open one face and it will go that way '
      + 'on its own.',
    unlocks: ['m109', 'f15'],
    unlockLine: 'Paladin and close air support released',
  },
  {
    id: 'paris',
    iso: 'FRA',
    lx: 44, ly: 26,
    city: 'PARIS',
    lon: 2.2945, lat: 48.8584,
    no: 2,
    title: 'FOUR LEGS',
    brief: 'Seven thousand tonnes of wrought iron standing on nothing but its '
      + 'own piers. It will not be shelled down like masonry — it has to be cut. '
      + 'Take a leg and it falls towards the gap.',
    unlocks: ['m270', 'm142'],
    unlockLine: 'Rocket artillery released',
  },
  {
    id: 'agra',
    iso: 'IND',
    lx: 46, ly: -22,
    city: 'AGRA',
    lon: 78.0421, lat: 27.1751,
    no: 3,
    title: 'THE DOME',
    brief: 'A marble shell on four piers over a terrace the size of a parade '
      + 'ground. Nothing here topples. The dome has to be broken, and the piers '
      + 'under it are the only thing holding the roof up.',
    unlocks: ['b1'],
    unlockLine: 'Heavy bomber on call',
  },
  {
    id: 'giza',
    iso: 'EGY',
    lx: -14, ly: 34,
    city: 'GIZA',
    lon: 31.1342, lat: 29.9792,
    no: 4,
    title: 'THE LAST ONE',
    brief: 'Two and a third million cubic metres of limestone that has stood for '
      + 'four and a half thousand years. It cannot fall over. There is nothing to '
      + 'undercut and nothing to topple: it comes down by being removed.',
    // Nothing left to release: this is the one you finish with everything.
    unlocks: [],
    unlockLine: 'The board is clear',
  },
];

/** The contract for a level id, if that level is one. */
export function theatreOf(id) {
  return THEATRES.find((t) => t.id === id) || null;
}

/**
 * The objectives on a contract.
 *
 * One that has to be met and two that pay. The optional pair are deliberately
 * pulling in opposite directions — one rewards going in hard and fast, the other
 * rewards not losing anything — so a run cannot casually satisfy both and the
 * player has to come back and fight it a different way.
 */
export function objectivesFor(id) {
  const lv = LEVELS[id];
  if (!lv) return [];
  return [
    {
      key: 'primary',
      label: lv.victory === 'Eiffel-down' ? 'Bring the tower down'
        : lv.traits && lv.traits.topples === false ? 'Break the structure'
          : 'Bring it down',
      test: (s, won) => !!won,
    },
    {
      key: 'quick',
      label: 'Finish inside eight minutes',
      test: (s) => s && s.time > 0 && s.time <= 480,
    },
    {
      key: 'clean',
      label: 'Finish without losing a gun',
      test: (s) => s && s.unitsLost === 0,
    },
  ];
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return (v && typeof v === 'object') ? v : {};
  } catch { return {}; }
}

function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
}

/** Whether the player has asked for every contract to be open at once. */
export function freeDeploy() {
  return read().free === true;
}
export function setFreeDeploy(on) {
  const v = read();
  v.free = !!on;
  write(v);
}

/**
 * The state of the war, as the map draws it.
 *
 * A contract is `down` once its level has been won — read from the level
 * record rather than from anything here, so a win registered before the
 * campaign existed still counts and the map is never behind the game.
 */
export function campaignState() {
  const prog = loadProgress();
  const saved = read();
  const free = saved.free === true;
  let openedNext = false;
  const list = THEATRES.map((t) => {
    const rec = prog[t.id] || {};
    const down = !!rec.won;
    return {
      ...t,
      down,
      runs: rec.runs || 0,
      bestScore: rec.bestScore || 0,
      bestTime: rec.bestTime ?? null,
      met: (saved.met && saved.met[t.id]) || {},
      open: false,
    };
  });
  for (const t of list) {
    if (t.down) { t.open = true; continue; }
    if (free) { t.open = true; continue; }
    if (!openedNext) { t.open = true; openedNext = true; }
  }
  const done = list.filter((t) => t.down).length;
  return { list, done, total: list.length, free, next: list.find((t) => !t.down) || null };
}

/** The contracts closed before this one, which is what decides the arsenal. */
function closedCount() {
  const prog = loadProgress();
  return THEATRES.filter((t) => prog[t.id]?.won).length;
}

/**
 * Which weapons the campaign has released.
 *
 * The towed guns are issued from the start — a contract nobody can open is not
 * a campaign, it is a wall, and the Elizabeth Tower is thirty-two thousand
 * stones to be got through with what you are given. Each closed contract
 * releases the next rung, and the last one releases nothing because there is
 * nothing after it: Giza is the contract you arrive at holding everything. This gate sits *on top of* the per-level unlock: a weapon has
 * to be released by the campaign and earned inside the level, which is why
 * turning up at the Great Pyramid with a bomber still means working up to it.
 */
export function releasedUnits() {
  const out = new Set(['at4', 'gustaf', 'rpg32', 'javelin', 'm119', 'm777']);
  const prog = loadProgress();
  for (const t of THEATRES) {
    if (!prog[t.id]?.won) continue;
    for (const u of t.unlocks) out.add(u);
  }
  return out;
}

export function isReleased(unitId) {
  // Anything the campaign has no opinion about stays available, so adding a
  // weapon to the arsenal never silently removes it from every level.
  if (!THEATRES.some((t) => t.unlocks.includes(unitId))) return true;
  return releasedUnits().has(unitId);
}

/**
 * Which country is owed a fire, and marking that it has had one.
 *
 * The burn plays exactly once: the first time the map is opened after the
 * contract closed. Replaying a finished level does not set the country alight
 * again, and neither does coming back to the menu a second time — it is already
 * black by then, and a country that catches fire every time you look at it is a
 * screensaver rather than a result.
 */
export function pendingBurn() {
  const seen = read().burnt || {};
  const prog = loadProgress();
  const t = THEATRES.find((k) => prog[k.id]?.won && !seen[k.iso]);
  return t ? t.iso : null;
}

export function markBurnSeen(iso) {
  const v = read();
  v.burnt = v.burnt || {};
  v.burnt[iso] = true;
  write(v);
}

/**
 * Record how a contract went.
 *
 * Objectives are sticky: a player who finishes fast on one run and clean on the
 * next has met both, which is the only reading that makes coming back worth
 * anything.
 */
export function recordTheatre(id, won, summary) {
  const t = theatreOf(id);
  if (!t) return null;
  const v = read();
  v.met = v.met || {};
  const met = v.met[id] || {};
  for (const o of objectivesFor(id)) {
    if (met[o.key]) continue;
    // Only a winning run can satisfy anything: eight minutes of shelling that
    // left the building standing is not a fast run, it is a failed one.
    if (won && o.test(summary, won)) met[o.key] = true;
  }
  v.met[id] = met;
  write(v);
  return met;
}

/** What closing this contract has just released, for the after-action card. */
export function releaseNoteFor(id) {
  const t = theatreOf(id);
  if (!t) return null;
  const at = LEVEL_ORDER.indexOf(id);
  const nextId = LEVEL_ORDER[at + 1];
  return {
    unlockLine: t.unlockLine,
    next: nextId ? theatreOf(nextId) : null,
  };
}
