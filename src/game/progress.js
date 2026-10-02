/**
 * Progression: experience, rank, ribbons, career medals, daily orders and
 * supply crates.
 *
 * The games people cannot put down do the same handful of things, and they
 * do all of them at once, on different clocks:
 *
 *   every run pays     a battle that is lost still earns: the sortie, the
 *                      tonnage, the men. There is never a run worth nothing.
 *                      The pay is itemised on the report and counted up into
 *                      a bar, line by line, so the player watches it arrive.
 *   rank comes fast    and then slower. The first rank-up comes inside the
 *                      first battle, the next few inside the first evening, and
 *                      fifty grades later the ladder is still going. Every
 *                      grade is a moment (the insignia, the new name, a fanfare)
 *                      and pays something: a supply crate, and every fifth a
 *                      commission that stays with the commander.
 *   ribbons            the small things a fight does well, earned as often as
 *                      they happen, each with its own few hundred XP: a direct
 *                      hit, a chain of dumps, a transport shot down.
 *   career medals      the long goals, in four grades each, with the progress
 *                      to the next grade always on show. The nearer the bar is
 *                      to full, the harder people push to fill it; the report
 *                      names the nearest one.
 *   daily orders       three small jobs a day, the same for everyone on the
 *                      date, worth a good slice of a rank, and a crate for all
 *                      three. A reason to play today, and again tomorrow.
 *   supply crates      the reward nobody can predict: opened at the front
 *                      door, a common handful of funds most of the time, now
 *                      and then a war chest, rarely a blank cheque. What comes
 *                      out is spent in the next battle.
 *
 * All of it lives in `tt.career`, which travels with the save slot. Nothing
 * here touches a battle that is under the harness: perks are not applied and
 * the overlay never covers the report the suite reads.
 */
import { MEDALS as FEATS, loadMedals } from './medals.js';

const KEY = 'tt.career';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const parse = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
export const underHarness = () => get('tt.suite') === '1';

// ── The ladder.

/**
 * The United States Army's own ladder, as it stands: the thirteen enlisted
 * ranks from Private to Sergeant Major of the Army, then the ten commissioned
 * ones from Second Lieutenant to General, and Field Marshal over the top —
 * the five-star rank the Army has only ever held in wartime, here earned.
 * Warrant officers are a track of their own, not a step on this one.
 *
 * Fifty grades, as before, on the same XP curve, so a save keeps its place:
 * the longer ranks are split into steps (I, II, III). `id` names the icon in
 * `public/assets/ranks/`; until one is there the insignia is drawn.
 *
 *   [name, steps, id, kind, n, rockers, device, metal]
 */
const LADDER = [
  ['PRIVATE', 1, 'pv1', 'none', 0],
  ['PRIVATE SECOND CLASS', 1, 'pv2', 'chev', 1],
  ['PRIVATE FIRST CLASS', 2, 'pfc', 'chev', 1, 1],
  ['SPECIALIST', 2, 'spc', 'spc', 0],
  ['CORPORAL', 3, 'cpl', 'chev', 2],
  ['SERGEANT', 3, 'sgt', 'chev', 3],
  ['STAFF SERGEANT', 2, 'ssg', 'chev', 3, 1],
  ['SERGEANT FIRST CLASS', 2, 'sfc', 'chev', 3, 2],
  ['MASTER SERGEANT', 2, 'msg', 'chev', 3, 3],
  ['FIRST SERGEANT', 2, '1sg', 'chev', 3, 3, 'diamond'],
  ['SERGEANT MAJOR', 2, 'sgm', 'chev', 3, 3, 'star'],
  ['COMMAND SERGEANT MAJOR', 2, 'csm', 'chev', 3, 3, 'wreath'],
  ['SERGEANT MAJOR OF THE ARMY', 1, 'sma', 'chev', 3, 3, 'eagle'],
  ['SECOND LIEUTENANT', 2, '2lt', 'bar', 1, 0, null, 'gold'],
  ['FIRST LIEUTENANT', 2, '1lt', 'bar', 1, 0, null, 'silver'],
  ['CAPTAIN', 3, 'cpt', 'bar', 2, 0, null, 'silver'],
  ['MAJOR', 3, 'maj', 'leaf', 1, 0, null, 'gold'],
  ['LIEUTENANT COLONEL', 3, 'ltc', 'leaf', 1, 0, null, 'silver'],
  ['COLONEL', 3, 'col', 'eagle', 1, 0, null, 'silver'],
  ['BRIGADIER GENERAL', 2, 'bg', 'star', 1, 0, null, 'silver'],
  ['MAJOR GENERAL', 2, 'mg', 'star', 2, 0, null, 'silver'],
  ['LIEUTENANT GENERAL', 2, 'ltg', 'star', 3, 0, null, 'silver'],
  ['GENERAL', 2, 'gen', 'star', 4, 0, null, 'silver'],
  ['FIELD MARSHAL', 1, 'fm', 'fm', 5, 0, null, 'gold'],
];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
/** What draws a grade's insignia, carried with it wherever it is shown. */
export const insigniaOf = (g) => ({ id: g.id, kind: g.kind, n: g.n, r: g.r, dev: g.dev, metal: g.metal });
/** Prestige, past the top of the ladder. */
export const PRESTIGE_INSIGNIA = { id: 'prestige', kind: 'prestige', n: 5, metal: 'gold' };
/** Every grade: its name, its insignia, and the XP it takes to reach it from the one below. */
export const GRADES = (() => {
  const out = [];
  for (const [name, steps, id, kind, n, r = 0, dev = null, metal = 'gold'] of LADDER) {
    for (let s = 1; s <= steps; s++) {
      out.push({ name: steps > 1 ? `${name} ${ROMAN[s]}` : name, base: name, id, kind, n, r, dev, metal });
    }
  }
  out.forEach((g, i) => { g.cost = i === 0 ? 0 : Math.round(900 + 260 * i + 12 * i * i); });
  let acc = 0;
  for (const g of out) { acc += g.cost; g.at = acc; }
  return out;
})();
export const TOP = GRADES.length - 1;

/**
 * Every fifth grade carries a commission: a small advantage that stays. Funds
 * and income, never anything that makes a fight look different — the
 * building is the same building for everyone.
 */
export const COMMISSIONS = {
  5: { id: 'f1', line: '+5% starting funds', funds: 0.05 },
  10: { id: 'i1', line: '+5% income', income: 0.05 },
  15: { id: 'f2', line: '+5% starting funds', funds: 0.05 },
  20: { id: 'i2', line: '+5% income', income: 0.05 },
  25: { id: 'f3', line: '+10% starting funds', funds: 0.10 },
  30: { id: 'i3', line: '+5% income', income: 0.05 },
  35: { id: 'f4', line: '+10% starting funds', funds: 0.10 },
  40: { id: 'i4', line: '+10% income', income: 0.10 },
  45: { id: 'f5', line: '+10% starting funds', funds: 0.10 },
};

export function gradeFor(xp) {
  let i = 0;
  while (i < TOP && xp >= GRADES[i + 1].at) i++;
  const g = GRADES[i], nx = GRADES[i + 1] || null;
  const into = xp - g.at, span = nx ? nx.cost : 1;
  return {
    i, name: g.name, base: g.base, ...insigniaOf(g),
    next: nx ? nx.name : null, need: nx ? nx.at - xp : 0,
    into, span, frac: nx ? Math.max(0, Math.min(1, into / span)) : 1,
    reward: nx ? rewardFor(i + 1) : null,
  };
}

/** What reaching grade `i` pays. */
export function rewardFor(i) {
  const c = COMMISSIONS[i];
  return { crates: i % 5 === 0 ? 2 : 1, commission: c || null };
}

// ── Career medals: four grades each, and the counter behind them.

export const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
const TIER_XP = [300, 700, 1500, 3000];
export const CAREER = [
  { id: 'tonnes', name: 'DEMOLITION EXPERT', unit: 't', at: [50e3, 500e3, 3e6, 20e6], line: 'Masonry brought down' },
  { id: 'kills', name: 'GRAVEDIGGER', unit: '', at: [100, 1000, 5000, 20000], line: 'Defenders neutralised' },
  { id: 'wins', name: 'CONQUEROR', unit: '', at: [3, 10, 30, 75], line: 'Contracts closed' },
  { id: 'places', name: 'GLOBETROTTER', unit: '', at: [3, 10, 25, 60], line: 'Different landmarks brought down' },
  { id: 'hits', name: 'MARKSMAN', unit: '', at: [3, 15, 50, 150], line: 'Direct hits from the air' },
  { id: 'burnt', name: 'URBAN PLANNER', unit: '', at: [25, 250, 1000, 5000], line: 'City buildings burnt out' },
  { id: 'dumps', name: 'QUARTERMASTER', unit: '', at: [5, 30, 100, 400], line: 'Enemy dumps set off' },
  { id: 'downed', name: 'SKY CLEARER', unit: '', at: [3, 20, 75, 250], line: 'Enemy transports shot down' },
  { id: 'collapses', name: 'GRAVITY', unit: '', at: [5, 40, 150, 600], line: 'Great sections brought down' },
  { id: 'rounds', name: 'GUNNER', unit: '', at: [500, 5000, 40000, 250000], line: 'Rounds fired' },
  { id: 'spent', name: 'HIGH ROLLER', unit: '$', at: [100e3, 1e6, 10e6, 100e6], line: 'Funds spent' },
  { id: 'battles', name: 'VETERAN', unit: '', at: [5, 25, 100, 300], line: 'Battles fought' },
  { id: 'dailies', name: 'DEVOTION', unit: '', at: [3, 10, 30, 100], line: 'Daily strikes and orders finished' },
];

// ── Ribbons: earned in the fight, as often as they happen.

export const RIBBONS = {
  firstblood: { name: 'FIRST BLOOD', xp: 50 },
  hit: { name: 'DIRECT HIT', xp: 150 },
  collateral: { name: 'COLLATERAL', xp: 200 },
  multikill: { name: 'MULTI-KILL', xp: 100 },
  massacre: { name: 'MASSACRE', xp: 250 },
  secondary: { name: 'SECONDARY', xp: 120 },
  downed: { name: 'TRANSPORT DOWN', xp: 200 },
  crushed: { name: 'CRUSHED', xp: 150 },
  charge: { name: 'DEMOLITION CHARGE', xp: 300 },
  collapse: { name: 'COLLAPSE', xp: 250 },
};

// ── Daily orders.

const ORDERS = [
  { id: 'burnt', line: 'Burn out 20 city buildings', key: 'burnt', n: 20 },
  { id: 'kills', line: 'Neutralise 150 defenders', key: 'kills', n: 150 },
  { id: 'hits', line: 'Land 3 direct hits from the air', key: 'hits', n: 3 },
  { id: 'rounds', line: 'Fire 300 rounds', key: 'rounds', n: 300 },
  { id: 'wins', line: 'Close 2 contracts', key: 'wins', n: 2 },
  { id: 'tonnes', line: 'Bring down 150,000 tonnes', key: 'tonnes', n: 150e3 },
  { id: 'downed', line: 'Shoot down 2 enemy transports', key: 'downed', n: 2 },
  { id: 'dumps', line: 'Set off 3 enemy dumps', key: 'dumps', n: 3 },
  { id: 'underpar', line: 'Win a contract under its budget par', key: 'underpar', n: 1 },
  { id: 'strikes', line: 'Call in 4 air strikes', key: 'strikes', n: 4 },
  { id: 'collapses', line: 'Bring down 3 great sections', key: 'collapses', n: 3 },
];
const ORDER_XP = 750, ORDERS_BONUS_XP = 1000;

export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function ordersFor(date) {
  const pool = [...ORDERS];
  let h = hash(`orders:${date}`);
  const out = [];
  while (out.length < 3) {
    const k = h % pool.length;
    out.push(pool.splice(k, 1)[0]);
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
  }
  return out;
}

// ── Supply crates.

/**
 * What a crate can hold, and how often. The common half pays a battle's
 * opening funds again; the rare ones change what the next battle can afford.
 */
const LOOT = [
  { w: 30, rarity: 'COMMON', id: 'funds', line: '+$1,500 field funds, next battle', perk: { funds: 1500 } },
  { w: 24, rarity: 'COMMON', id: 'income', line: '+25% income, next battle', perk: { income: 0.25 } },
  { w: 18, rarity: 'UNCOMMON', id: 'xp', line: '+1,000 XP', xp: 1000 },
  { w: 14, rarity: 'UNCOMMON', id: 'double', line: 'Double XP on your next win', perk: { double: 1 } },
  { w: 10, rarity: 'RARE', id: 'chest', line: '+$6,000 war chest, next battle', perk: { funds: 6000 } },
  { w: 4, rarity: 'LEGENDARY', id: 'cheque', line: 'Blank cheque: +$40,000, next battle', perk: { funds: 40000 } },
];

// ── The record.

function blank() {
  return {
    xp: 0, prestige: 0, seenGrade: 0,
    counts: {}, medals: {}, places: {},
    orders: { date: null, prog: {}, done: [], bonus: false },
    crates: 0, perks: { funds: 0, income: 0, double: 0 },
    firstWin: null, boot: false,
  };
}

/**
 * The commander's record. A commander who played before this existed is
 * given XP for what they had already done, so nobody loses a rank to the
 * new ladder.
 */
export function career() {
  let c = parse(get(KEY), null);
  if (c && typeof c.xp === 'number') {
    const b = blank();
    return { ...b, ...c, orders: { ...b.orders, ...(c.orders || {}) }, perks: { ...b.perks, ...(c.perks || {}) } };
  }
  c = blank();
  const prog = parse(get('tt.progress'), {}) || {};
  const recs = Object.entries(prog);
  const tons = recs.reduce((a, [, r]) => a + (r.bestScore || 0), 0);
  const wins = recs.filter(([, r]) => r && r.won);
  c.xp = Math.round(Math.min(250000, 4 * Math.sqrt(tons) * 6 + wins.length * 900 + Object.keys(loadMedals()).length * 500));
  c.counts.tonnes = tons;
  c.counts.wins = wins.length;
  for (const [id] of wins) c.places[id] = 1;
  c.counts.places = wins.length;
  c.counts.battles = recs.reduce((a, [, r]) => a + (r.runs || 0), 0);
  c.seenGrade = gradeFor(c.xp).i;
  // Medals the career already holds are held, not re-awarded.
  for (const m of CAREER) c.medals[m.id] = tierOf(m, c.counts[m.id] || 0);
  save(c);
  return c;
}

function save(c) { put(KEY, JSON.stringify(c)); }

function tierOf(m, v) {
  let t = 0;
  while (t < m.at.length && v >= m.at[t]) t++;
  return t;          // 0 = none, 1 = bronze ...
}

/** Today's orders, with this commander's progress on them. */
export function dailyOrders(c = career()) {
  const date = today();
  if (c.orders.date !== date) c.orders = { date, prog: {}, done: [], bonus: false };
  return ordersFor(date).map((o) => ({
    ...o, have: Math.min(o.n, c.orders.prog[o.key] || 0), done: c.orders.done.includes(o.id),
  }));
}

/** Time until the orders change, for the front door. */
export function ordersResetIn() {
  const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
  const s = Math.max(0, (m - n) / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** The perks to apply at the start of a battle: commissions and anything a crate left. */
export function battlePerks(c = career()) {
  const g = gradeFor(c.xp).i;
  let fundsPct = 0, incomePct = 0;
  for (const [lv, k] of Object.entries(COMMISSIONS)) {
    if (g >= +lv) { fundsPct += k.funds || 0; incomePct += k.income || 0; }
  }
  return { fundsPct, incomePct, funds: c.perks.funds || 0, income: c.perks.income || 0 };
}

/** The crate perks are spent once a battle has started with them. */
export function spendBattlePerks() {
  const c = career();
  c.perks.funds = 0; c.perks.income = 0;
  save(c);
}

/** Boot Camp, finished for the first time: the first rank, and a crate to open. */
export function bootCampXp() {
  const c = career();
  if (c.boot) return null;
  c.boot = true;
  save(c);
  return award({ won: true, boot: true });
}

/**
 * Bank a finished battle.
 *
 * @param {object} r
 * @param {boolean} r.won
 * @param {object} [r.sum]       battle.summary()
 * @param {object} [r.ribbons]   id -> count, from the fight
 * @param {object} [r.stats]     burnt, dumps, downed, strikes, collapses, hits
 * @param {object[]} [r.marks]   the level's marks, as won
 * @param {object[]} [r.feats]   the one-off medals this run won
 * @param {string} [r.level]
 * @param {boolean} [r.daily]    a daily strike, met
 * @param {number} [r.streak]
 * @returns the report: lines of XP, totals, grades crossed, medals and orders won
 */
export function award(r) {
  const c = career();
  const sum = r.sum || {};
  const lines = [];
  const add = (label, xp, kind = '') => { if (xp > 0) lines.push({ label, xp: Math.round(xp), kind }); };
  const before = c.xp, gBefore = gradeFor(c.xp).i;

  if (r.boot) {
    add('BASIC TRAINING COMPLETE', 700, 'big');
  } else {
    // The run itself: never nothing.
    const base = r.won ? 600 : 150;
    add(r.won ? 'CONTRACT CLOSED' : 'SORTIE FLOWN', base);
    const tonXp = Math.min(3000, 3 * Math.sqrt(Math.max(0, sum.score || 0)));
    add(`DEMOLITION · ${Math.round(sum.score || 0).toLocaleString()} t`, tonXp);
    add(`DEFENDERS · ${sum.defendersKilled || 0}`, Math.min(2000, (sum.defendersKilled || 0) * 4));
    for (const m of r.marks || []) if (m.won) add(`MARK · ${m.label}`, 250);
    // The first win of the day pays the run twice.
    const day = today();
    if (r.won && c.firstWin !== day) {
      c.firstWin = day;
      add('FIRST WIN OF THE DAY', 1000, 'gold');
    }
    if (r.daily) add(`DAILY STRIKE · ${r.streak || 1}-DAY STREAK`, 1000 * (1 + 0.1 * Math.min(10, (r.streak || 1) - 1)), 'gold');
  }

  // Ribbons, as many as the fight earned.
  for (const [id, n] of Object.entries(r.ribbons || {})) {
    const rb = RIBBONS[id];
    if (rb && n > 0) add(`${rb.name}${n > 1 ? ` ×${n}` : ''}`, rb.xp * n, 'ribbon');
  }
  for (const f of r.feats || []) add(`MEDAL · ${f.name}`, 750, 'medal');

  // The career's counters, and the medals and orders they reach.
  const st = r.stats || {};
  const delta = r.boot ? {} : {
    tonnes: sum.score || 0, kills: sum.defendersKilled || 0, rounds: sum.shotsFired || 0, spent: sum.spent || 0,
    wins: r.won ? 1 : 0, battles: 1, burnt: st.burnt || 0, dumps: st.dumps || 0, downed: st.downed || 0,
    hits: st.hits || 0, collapses: st.collapses || 0, strikes: st.strikes || 0,
    underpar: r.won && (r.marks || []).some((m) => m.id === 'spend' && m.won) ? 1 : 0,
    dailies: r.daily ? 1 : 0,
  };
  if (r.won && r.level && !c.places[r.level]) { c.places[r.level] = 1; delta.places = 1; }
  for (const [k, v] of Object.entries(delta)) c.counts[k] = (c.counts[k] || 0) + v;

  // Orders.
  const orders = dailyOrders(c);
  const ordersDone = [];
  for (const o of orders) {
    if (o.done) continue;
    c.orders.prog[o.key] = (c.orders.prog[o.key] || 0) + (delta[o.key] || 0);
    if (c.orders.prog[o.key] >= o.n) {
      c.orders.done.push(o.id);
      ordersDone.push(o);
      add(`ORDER · ${o.line.toUpperCase()}`, ORDER_XP, 'order');
      c.counts.dailies = (c.counts.dailies || 0) + 1;
    }
  }
  let bonusCrate = 0;
  if (!c.orders.bonus && c.orders.done.length >= 3) {
    c.orders.bonus = true;
    bonusCrate = 1;
    add('ALL THREE ORDERS', ORDERS_BONUS_XP, 'order');
  }

  // Career medals reached.
  const medals = [];
  for (const m of CAREER) {
    const had = c.medals[m.id] || 0, now = tierOf(m, c.counts[m.id] || 0);
    for (let t = had; t < now; t++) {
      medals.push({ ...m, tier: t + 1 });
      add(`${TIERS[t]} · ${m.name}`, TIER_XP[t], 'medal');
    }
    c.medals[m.id] = now;
  }

  // A crate's double.
  let total = lines.reduce((a, l) => a + l.xp, 0);
  if (r.won && c.perks.double > 0) {
    c.perks.double -= 1;
    lines.push({ label: 'DOUBLE XP', xp: total, kind: 'gold' });
    total *= 2;
  }

  c.xp += total;
  // Past the top, the ladder goes round again with a star for it.
  let prestiged = false;
  if (c.xp >= GRADES[TOP].at + 60000) {
    c.xp -= GRADES[TOP].at + 60000;
    c.prestige += 1;
    prestiged = true;
  }
  const gAfter = gradeFor(c.xp).i;
  const crossed = [];
  if (!prestiged) {
    for (let i = gBefore + 1; i <= gAfter; i++) {
      const rw = rewardFor(i);
      c.crates += rw.crates;
      crossed.push({ i, name: GRADES[i].name, ...insigniaOf(GRADES[i]), ...rw });
    }
  } else c.crates += 3;
  c.crates += bonusCrate;
  save(c);

  // The nearest medal grade not yet reached, for the report's "almost".
  let nearest = null;
  for (const m of CAREER) {
    const t = c.medals[m.id] || 0;
    if (t >= m.at.length) continue;
    const prev = t ? m.at[t - 1] : 0, v = c.counts[m.id] || 0;
    const f = (v - prev) / (m.at[t] - prev);
    if (!nearest || f > nearest.frac) nearest = { ...m, tier: t + 1, have: v, need: m.at[t], frac: f };
  }

  return {
    lines, total, before, after: c.xp, prestige: c.prestige, prestiged,
    gradeBefore: gradeFor(before), grade: gradeFor(c.xp), crossed, medals, ordersDone,
    orders: dailyOrders(c), bonusCrate, crates: c.crates, nearest,
  };
}

/** Open one crate. Returns what was in it, or null if there are none. */
export function openCrate(rand = Math.random) {
  const c = career();
  if (c.crates <= 0) return null;
  c.crates -= 1;
  const total = LOOT.reduce((a, l) => a + l.w, 0);
  let pick = rand() * total, item = LOOT[0];
  for (const l of LOOT) { pick -= l.w; if (pick <= 0) { item = l; break; } }
  if (item.perk) {
    for (const [k, v] of Object.entries(item.perk)) c.perks[k] = (c.perks[k] || 0) + v;
  }
  if (item.xp) c.xp += item.xp;
  save(c);
  return { ...item, crates: c.crates };
}

/** Every medal, career and feat, with progress, for the medal case. */
export function medalCase() {
  const c = career();
  const feats = loadMedals();
  return {
    career: CAREER.map((m) => {
      const t = c.medals[m.id] || 0, v = c.counts[m.id] || 0;
      const prev = t ? m.at[t - 1] : 0, next = m.at[t] ?? null;
      return { ...m, tier: t, have: v, next, frac: next ? Math.max(0, Math.min(1, (v - prev) / (next - prev))) : 1 };
    }),
    feats: FEATS.map((f) => ({ ...f, won: feats[f.id] || null })),
  };
}
