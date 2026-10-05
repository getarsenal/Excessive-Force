import { CAST, DEFENDER_OF } from './cast.js';
import { UNITS_BY_ID } from './units.js';

/**
 * The campaign, as a campaign.
 *
 * Forty-one contracts in one long line was a list, not a war: nothing built to
 * anything, nothing was ever nearly done, and the one reason to win the next
 * was that it was next. So the line is cut into eight operations of four
 * battles and a boss, and a finale on the Great Wall.
 *
 * An operation is an evening: four battles that each hand something over
 * (a weapon, a new kind of enemy, a star to chase) and then a fortress held
 * by a named warlord, with his own bunker to dig out, a garrison half as big
 * again, and the next operation behind him. The boss is on the strip from the
 * start, skull and all, so there is always a thing being worked toward.
 *
 * Three stars a battle, banked across runs so no single run has to be perfect:
 * the win, the par (two of the four marks), and the battle's own challenge.
 * The boss opens on four battles won and six stars of the twelve, which is a
 * nudge back to a battle already won rather than a wall. The catalogue's
 * fifty-nine maps are side operations, opened seven at a time as each boss
 * falls.
 *
 * Difficulty is a sawtooth: each battle in an operation is a little harder
 * than the one before, the boss is the peak, and the first battle of the next
 * operation drops back, which is where the weapon the boss released gets to
 * feel like a weapon.
 */

export const OPERATIONS = [
  {
    id: 'op1', name: 'OPENING SALVO', theatre: 'EUROPE',
    battles: ['westminster', 'paris', 'pisa', 'agra'], boss: 'moscow',
    release: { westminster: ['m109'], moscow: ['f15'] },
    brief: 'Four postcards and a fortress. Knock over the tourist traps, then go take the Kremlin off Marshal Zimyanin. He thinks red brick makes him safe. Prove him wrong.',
  },
  {
    id: 'op2', name: 'SAND AND STONE', theatre: 'ANTIQUITY',
    battles: ['giza', 'chichen', 'athens', 'istanbul'], boss: 'colosseum',
    release: { giza: ['m120'], colosseum: ['ah64'] },
    brief: 'Old rocks, older grudges. Every one of these has stood for a thousand years. Call it a personal challenge. The Colosseum is the main event: they want a show, give them one.',
  },
  {
    id: 'op3', name: 'HIGH TIDE', theatre: 'THE WATERFRONT',
    battles: ['sydney', 'rio', 'towerbridge', 'cologne'], boss: 'himeji',
    release: { sydney: ['m142'], himeji: ['stryker'] },
    brief: 'Harbours, bridges and a cathedral on a river. Everything here falls into water, which saves on clean-up. Then a castle that has never been taken. Until Tuesday.',
  },
  {
    id: 'op4', name: 'STEEL AND GLASS', theatre: 'THE SKYLINE',
    battles: ['petronas', 'tokyotower', 'atomium', 'dubai'], boss: 'kuwait',
    release: { petronas: ['m270'], kuwait: ['ac130'] },
    brief: 'Tall, shiny, insured. These people build up because they have never been shot at. The Kuwait Towers have a gun on the roof. Somebody up there is about to have a very bad day.',
  },
  {
    id: 'op5', name: 'OLD WORLD ORDER', theatre: 'THE CONTINENT',
    battles: ['florence', 'segovia', 'budapest', 'sagrada'], boss: 'edinburgh',
    release: { edinburgh: ['b1'] },
    brief: 'Domes, aqueducts, parliaments and a church they never finished. We will finish it for them. Then a castle on a volcano. Bring the big guns. Bring the bigger ones after that.',
  },
  {
    id: 'op6', name: 'FAIRY TALES', theatre: 'THE HIGH GROUND',
    battles: ['pena', 'montstmichel', 'hassan', 'karnak'], boss: 'neuschwanstein',
    release: { neuschwanstein: ['tomahawk'] },
    brief: 'Castles on rocks, abbeys on islands, temples in the sand. Somebody built all of this to look impregnable. Nothing is impregnable. I have a budget.',
  },
  {
    id: 'op7', name: 'THE DRAGON\'S DOOR', theatre: 'THE FAR EAST',
    battles: ['gyeongbok', 'watarun', 'shwedagon', 'angkor'], boss: 'forbidden',
    release: { forbidden: ['gbu28'] },
    brief: 'Palaces, pagodas and a temple the jungle already tried to eat. Then the Forbidden City. Nine hundred buildings and every one of them says keep out. Knock.',
  },
  {
    id: 'op8', name: 'TEMPLES OF THE SUN', theatre: 'THE ROOF OF THE WORLD',
    battles: ['borobudur', 'tikal', 'teotihuacan', 'machupicchu'], boss: 'potala',
    release: {},
    brief: 'Pyramids and mountain cities, all the way up. At the top of it, the Potala: thirteen storeys on a mountain at twelve thousand feet. Bring oxygen. Bring everything.',
  },
];

/** The last battle, after every operation. */
export const FINALE = {
  id: 'finale', name: 'THE LONG WALL', theatre: 'FINALE', battles: [], boss: 'greatwall',
  release: {},
  brief: 'Twenty thousand kilometres of wall, and every warlord you ever made a fool of is behind it. This is the one they will write songs about. Make them rude songs.',
};

/** Every campaign level id in campaign order: the eight operations, then the wall. */
export const CAMPAIGN_ORDER = [...OPERATIONS.flatMap((o) => [...o.battles, o.boss]), FINALE.boss];

const BOSS_OF = new Map([...OPERATIONS, FINALE].map((o) => [o.boss, o]));
const OP_OF = new Map();
for (const o of [...OPERATIONS, FINALE]) for (const id of [...o.battles, o.boss]) OP_OF.set(id, o);

/** The operation a level belongs to, or null for a side op or Boot Camp. */
export const operationOf = (id) => OP_OF.get(id) || null;
/** Is this level an operation's boss? */
export const isBoss = (id) => BOSS_OF.has(id);

/** What winning this level hands over, as unit ids. */
export function releaseOf(id) {
  const o = OP_OF.get(id);
  return (o && o.release[id]) || [];
}
export function releaseLine(id) {
  const r = releaseOf(id);
  if (!r.length) return '';
  return r.map((u) => `${UNITS_BY_ID[u]?.name || u.toUpperCase()}`).join(' + ') + ' RELEASED';
}

/** The warlord who holds a boss level: the level's own defending officer. */
export function warlordOf(id) {
  const c = CAST[DEFENDER_OF[id]];
  return c ? { rank: c.rank, name: c.name, nation: c.nation, file: c.file } : { rank: 'Gen.', name: 'The Warlord', nation: '' };
}

/**
 * How hard this battle is, as a multiplier on the garrison's teeth.
 *
 * The sawtooth: +12% a battle through an operation, the boss well above the
 * last battle, and each operation's floor a little above the last one's.
 * Side ops sit at the level of the operations already beaten.
 */
export function threatOf(id, bossesDown = 0) {
  const o = OP_OF.get(id);
  if (!o) return 1 + Math.min(0.5, 0.06 * bossesDown);
  const opIdx = o === FINALE ? OPERATIONS.length : OPERATIONS.indexOf(o);
  const base = 1 + 0.07 * opIdx;
  if (o.boss === id) return base * (o === FINALE ? 1.75 : 1.55);
  return base * (1 + 0.12 * o.battles.indexOf(id));
}

/**
 * The third star: one challenge per battle, in the General's words.
 *
 * Chosen by the battle's place in the campaign so neighbours ask different
 * things, and only from what the battle can actually offer: no "wreck every
 * SAM site" on a map whose level turns the SAMs off.
 */
const CHALLENGES = {
  clean:    { label: 'LOSE NO GUNS', say: 'Bring every gun home. They are signed out in my name.', test: (s) => s.unitsLost === 0 },
  quick:    { label: 'UNDER 6 MINUTES', say: 'Six minutes. I have a tee time.', test: (s) => s.time > 0 && s.time <= 360 },
  noair:    { label: 'NO AIR STRIKES', say: 'Guns only. The Air Force is not getting credit for this one.', test: (s) => (s.strikes || 0) === 0 },
  sams:     { label: 'WRECK EVERY SAM SITE', say: 'Every missile site on the map. I want the sky back.', test: (s) => s.samSites > 0 && s.samSitesDown >= s.samSites, needs: (lv) => lv.sams !== false },
  hq:       { label: 'KILL THE COMMAND POST', say: 'Find their command post and flatten it. Cut the head off.', test: (s) => !!s.hqDown, needs: (lv) => lv.hq !== false },
  leverage: { label: 'LEVERAGE 2x', say: 'Twice as much down as you hit. Shoot smart, not a lot.', test: (s) => (s.leverage || 0) >= 2 },
  budget:   { label: 'SPEND UNDER $14,000', say: 'Under fourteen grand. Congress is watching. Mostly.', test: (s) => (s.spent || 0) <= 14000 },
};
const ROTA = ['clean', 'noair', 'hq', 'quick', 'sams', 'leverage', 'budget'];

export function challengeOf(id, level) {
  if (isBoss(id)) return { key: 'clean', ...CHALLENGES.clean };
  const at = Math.max(0, CAMPAIGN_ORDER.indexOf(id));
  const seed = at >= 0 ? at : [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let k = 0; k < ROTA.length; k++) {
    const key = ROTA[(seed + k) % ROTA.length];
    const c = CHALLENGES[key];
    if (!c.needs || !level || c.needs(level)) return { key, ...c };
  }
  return { key: 'clean', ...CHALLENGES.clean };
}

// ── The record ────────────────────────────────────────────────────────────

const KEY = 'tt.ops';

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
}

/** Stars held on a level, as [win, par, challenge]. */
export function starsOf(id, prog = null) {
  const s = (read().stars || {})[id] || 0;
  // A level won before the stars existed still holds its first.
  const won = prog ? !!prog[id]?.won : false;
  return [!!(s & 1) || won, !!(s & 2), !!(s & 4)];
}
export const starCount = (id, prog) => starsOf(id, prog).filter(Boolean).length;

/**
 * Bank the stars a finished battle earned. Returns what this run took and
 * which of those are new, for the after-action card to count up.
 */
export function recordStars(id, won, summary, level, marks) {
  const v = read();
  v.stars = v.stars || {};
  const had = v.stars[id] || 0;
  let got = 0;
  if (won) {
    got |= 1;
    if ((marks || []).filter((m) => m.won).length >= 2) got |= 2;
    if (challengeOf(id, level).test(summary || {})) got |= 4;
  }
  v.stars[id] = had | got;
  write(v);
  const bits = [1, 2, 4];
  return {
    run: bits.map((b) => !!(got & b)),
    fresh: bits.map((b) => !!(got & b) && !(had & b)),
    have: bits.map((b) => !!((had | got) & b)),
  };
}

/** Every star held, across the campaign and the side ops. */
export function totalStars(prog) {
  const s = read().stars || {};
  let n = 0;
  for (const [id, bits] of Object.entries(s)) n += (bits & 1 ? 1 : 0) + (bits & 2 ? 1 : 0) + (bits & 4 ? 1 : 0);
  // Wins from before the stars, not yet banked.
  if (prog) for (const [id, r] of Object.entries(prog)) if (r?.won && !((s[id] || 0) & 1)) n++;
  return n;
}

export const BOSS_STARS = 6;      // of an operation's twelve, to open its boss
export const FINALE_STARS = 60;   // of the campaign's 120, to open the wall
export const SIDE_PER_BOSS = 7;   // side ops opened by each boss that falls

/**
 * The state of the war: every operation with each battle's place in it, open
 * or not, won or not, and its stars; and where the player should go next.
 */
export function operationsState(prog, free = false) {
  const ops = [...OPERATIONS, FINALE].map((o, k) => {
    const ids = [...o.battles, o.boss];
    const battles = ids.map((id) => ({
      id, boss: id === o.boss, won: !!prog[id]?.won, stars: starsOf(id, prog), open: false,
    }));
    const opStars = battles.slice(0, o.battles.length).reduce((a, b) => a + b.stars.filter(Boolean).length, 0);
    return { ...o, index: k, finale: o === FINALE, battles, opStars, open: false, done: !!prog[o.boss]?.won };
  });
  const total = totalStars(prog);
  let bossesDown = 0;
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    o.open = free || k === 0 || (ops[k - 1].done && (!o.finale || total >= FINALE_STARS));
    if (o.finale && !free) o.open = ops.slice(0, -1).every((p) => p.done) && total >= FINALE_STARS;
    const n = o.battles.length;
    for (let i = 0; i < n; i++) {
      const b = o.battles[i];
      if (free || b.won) { b.open = true; continue; }
      if (!o.open) continue;
      if (b.boss) {
        const four = o.battles.slice(0, n - 1).every((x) => x.won);
        b.open = four && (o.finale || o.opStars >= BOSS_STARS);
        b.needStars = four && !b.open ? BOSS_STARS - o.opStars : 0;
      } else {
        b.open = i === 0 || o.battles[i - 1].won;
      }
    }
    if (o.done && !o.finale) bossesDown++;
  }
  // Where to go next: the first open battle not yet won, in order.
  let next = null;
  for (const o of ops) for (const b of o.battles) if (!next && b.open && !b.won) next = { op: o, battle: b };
  return { ops, total, bossesDown, next, sideOpen: free ? Infinity : bossesDown * SIDE_PER_BOSS };
}
