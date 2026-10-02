/**
 * The commander: who is playing, how far they have come, and what today asks.
 *
 * Three things live here because the front door needs all three at once and
 * none of them is big enough for a module of its own.
 *
 * SAVE SLOTS. A commander is a whole career — the record, the campaign, the
 * battles in progress, the daily streak, the name — and a household has more
 * than one player on the same phone. There are three. The active one lives in
 * the ordinary keys, where every other module already reads and writes, so
 * nothing else has to know that slots exist; the others are parked whole
 * under `tt.slots` and swapped in when chosen.
 *
 * RANK. Tonnes of masonry brought down, on a ladder that roughly doubles, from
 * recruit to field marshal. It is only a number with a name on it, and it is
 * the number the player already has: the ledger on the front door.
 *
 * THE DAILY STRIKE. One open contract a day, the same for everyone on that
 * date, with a twist on it — double funds, the whole arsenal, a five-minute
 * clock, half the money — and a streak for coming back tomorrow.
 */
const SLOT_KEYS = ['tt.progress', 'tt.campaign', 'tt.tutorial', 'tt.battles', 'tt.daily', 'tt.commander', 'tt.medals', 'tt.career'];
import { gradeFor } from './progress.js';

const SLOTS_KEY = 'tt.slots';
export const SLOT_IDS = ['A', 'B', 'C'];

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const parse = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

function readSlots() {
  const v = parse(get(SLOTS_KEY), null);
  return v && v.active ? v : { active: 'A', data: {} };
}

export function activeSlot() { return readSlots().active; }

function captureLive() {
  const out = {};
  for (const k of SLOT_KEYS) { const v = get(k); if (v != null) out[k] = v; }
  return out;
}

/** Make another commander the active one. The caller reloads the page. */
export function switchSlot(id) {
  const s = readSlots();
  if (id === s.active || !SLOT_IDS.includes(id)) return false;
  s.data[s.active] = captureLive();
  const next = s.data[id] || {};
  for (const k of SLOT_KEYS) put(k, next[k] ?? null);
  delete s.data[id];
  s.active = id;
  put(SLOTS_KEY, JSON.stringify(s));
  return true;
}

/** Wipe a commander. The active one starts over; a parked one is emptied. */
export function eraseSlot(id) {
  const s = readSlots();
  if (id === s.active) for (const k of SLOT_KEYS) put(k, null);
  else delete s.data[id];
  put(SLOTS_KEY, JSON.stringify(s));
}

/** What a slot holds, for its card. */
export function slotInfo(id) {
  const s = readSlots();
  const src = id === s.active ? captureLive() : (s.data[id] || {});
  const prog = parse(src['tt.progress'], {}) || {};
  const recs = Object.values(prog);
  const tons = recs.reduce((a, r) => a + (r.bestScore || 0), 0);
  const cmd = parse(src['tt.commander'], null);
  const battles = Object.keys(parse(src['tt.battles'], {}) || {}).length;
  return {
    id,
    active: id === s.active,
    empty: !recs.length && !cmd,
    name: (cmd && cmd.name) || null,
    tons,
    closed: recs.filter((r) => r.won).length,
    sorties: recs.reduce((a, r) => a + (r.runs || 0), 0),
    battles,
    // Rank from the experience the slot has banked; a slot from before
    // there was experience shows the old tonnage rank until it is next played.
    rank: (() => { const c = parse(src['tt.career'], null); return c && typeof c.xp === 'number' ? gradeFor(c.xp) : rankFor(tons); })(),
    streak: (parse(src['tt.daily'], {}) || {}).streak || 0,
  };
}

// ── The commander's name.

const CALLSIGNS = ['HAMMER', 'IRONSIDE', 'LONGBOW', 'THUNDER', 'REDLEG', 'BASILISK', 'GRANITE',
  'WARLOCK', 'SLEDGE', 'CROWBAR', 'TEMPEST', 'BULWARK', 'RAMPART', 'KINGPIN', 'BRIMSTONE', 'SALVO'];

export function commander() {
  const c = parse(get('tt.commander'), null);
  if (c && c.name) return c;
  const name = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
  const made = { name, since: Date.now() };
  put('tt.commander', JSON.stringify(made));
  return made;
}

export function setCommanderName(name) {
  const clean = String(name || '').toUpperCase().replace(/[^A-Z0-9 \-']/g, '').trim().slice(0, 16);
  if (!clean) return commander();
  const c = { ...commander(), name: clean };
  put('tt.commander', JSON.stringify(c));
  return c;
}

// ── Rank.

export const RANKS = [
  { name: 'RECRUIT', t: 0, kind: 'none' },
  { name: 'PRIVATE', t: 20e3, kind: 'chev', n: 1 },
  { name: 'CORPORAL', t: 80e3, kind: 'chev', n: 2 },
  { name: 'SERGEANT', t: 250e3, kind: 'chev', n: 3 },
  { name: 'STAFF SERGEANT', t: 600e3, kind: 'chev', n: 4 },
  { name: 'LIEUTENANT', t: 1.4e6, kind: 'bar', n: 1 },
  { name: 'CAPTAIN', t: 3e6, kind: 'bar', n: 2 },
  { name: 'MAJOR', t: 6e6, kind: 'leaf', n: 1 },
  { name: 'COLONEL', t: 12e6, kind: 'eagle', n: 1 },
  { name: 'BRIGADIER GENERAL', t: 25e6, kind: 'star', n: 1 },
  { name: 'MAJOR GENERAL', t: 50e6, kind: 'star', n: 2 },
  { name: 'LIEUTENANT GENERAL', t: 100e6, kind: 'star', n: 3 },
  { name: 'GENERAL', t: 200e6, kind: 'star', n: 4 },
  { name: 'FIELD MARSHAL', t: 400e6, kind: 'star', n: 5 },
];

export function rankFor(tons) {
  let i = 0;
  while (i + 1 < RANKS.length && tons >= RANKS[i + 1].t) i++;
  const r = RANKS[i], next = RANKS[i + 1] || null;
  const frac = next ? Math.max(0, Math.min(1, (tons - r.t) / (next.t - r.t))) : 1;
  return { i, name: r.name, next: next ? next.name : null, need: next ? next.t - tons : 0, frac, kind: r.kind, n: r.n || 0 };
}

/** The rank as a badge: chevrons, bars, a leaf, an eagle or stars. */
/**
 * The rank icons that have been supplied, by grade id, in
 * `public/assets/ranks/<id>.png`. A rank listed here is shown as its picture;
 * one that is not is drawn below. Add the id when its file goes in.
 */
export const RANK_ICONS = new Set([]);

/**
 * A rank's insignia: its supplied picture, or — until there is one — the
 * United States Army's own, drawn. Chevrons with rockers under them and the
 * device in the middle for the senior NCOs; the specialist's shield; bars,
 * leaves and the eagle in gold or silver; silver stars for the generals; and
 * five in a ring for the Field Marshal.
 */
export function insignia(rank, cls = 'ins') {
  if (rank && rank.id && RANK_ICONS.has(rank.id)) {
    return `<img class="${cls}" src="assets/ranks/${rank.id}.png" alt="" aria-hidden="true">`;
  }
  const gold = '#e4b54a', silver = '#d3d8de';
  const g = rank.metal === 'silver' ? silver : gold;
  const kind = rank.kind;
  const star = (cx, cy, r, fill = g) => {
    let d = '';
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.42 : r;
      d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
    }
    return `<path d="${d}Z" fill="${fill}"/>`;
  };
  let body = '';
  if (kind === 'chev') {
    // Chevrons point up; rockers curve under them; the device sits between.
    const n = rank.n || 0, r = rank.r || 0;
    const top = r ? 4 : 10;
    for (let k = 0; k < n; k++) {
      const y = top + k * 6;
      body += `<path d="M7 ${y + 9} L24 ${y} L41 ${y + 9}" fill="none" stroke="${gold}" stroke-width="3.6" stroke-linejoin="miter"/>`;
    }
    for (let k = 0; k < r; k++) {
      const y = 31 + k * 5;
      body += `<path d="M7 ${y} Q24 ${y + 8} 41 ${y}" fill="none" stroke="${gold}" stroke-width="3.2"/>`;
    }
    const cy = top + n * 6 + 6;
    if (rank.dev === 'diamond') body += `<path d="M24 ${cy - 6} L29 ${cy} L24 ${cy + 6} L19 ${cy} Z" fill="${gold}"/>`;
    else if (rank.dev === 'star') body += star(24, cy, 6);
    else if (rank.dev === 'wreath') body += `<circle cx="24" cy="${cy}" r="7" fill="none" stroke="${gold}" stroke-width="1.8"/>${star(24, cy, 4.6)}`;
    else if (rank.dev === 'eagle') body += `${star(17, cy, 3.6)}${star(31, cy, 3.6)}<path d="M20 ${cy - 2} L24 ${cy - 6} L28 ${cy - 2} L26 ${cy + 4} L22 ${cy + 4} Z" fill="${gold}"/>`;
  } else if (kind === 'spc') {
    // The specialist: an eagle on a shield under a curved top.
    body = `<path d="M8 12 Q24 4 40 12 L40 26 Q40 38 24 44 Q8 38 8 26 Z" fill="${gold}"/>`
      + `<path d="M15 22 L21 25 L24 18 L27 25 L33 22 L29 30 L24 36 L19 30 Z" fill="#3a3220"/>`;
  } else if (kind === 'bar') {
    const w = rank.n === 1 ? 10 : 8;
    for (let k = 0; k < rank.n; k++) {
      const x = rank.n === 1 ? 19 : 12 + k * 14;
      body += `<rect x="${x}" y="8" width="${w}" height="32" rx="1.5" fill="${g}"/>`;
    }
  } else if (kind === 'leaf') {
    const vein = rank.metal === 'silver' ? '#6f757c' : '#6b4b10';
    body = `<path d="M24 6 C34 14 38 22 32 32 C29 36 26 38 24 42 C22 38 19 36 16 32 C10 22 14 14 24 6 Z" fill="${g}"/><path d="M24 12 V40" stroke="${vein}" stroke-width="1.6"/>`;
  } else if (kind === 'eagle') {
    body = `<path d="M4 18 L18 22 L24 12 L30 22 L44 18 L34 28 L28 28 L24 40 L20 28 L14 28 Z" fill="${g}"/>`;
  } else if (kind === 'star') {
    const n = rank.n, gap = 44 / n;
    const r = Math.min(9, gap * 0.48);
    for (let k = 0; k < n; k++) body += star(2 + gap * (k + 0.5), 24, r);
  } else if (kind === 'fm' || kind === 'prestige') {
    // Five stars in a ring; prestige sets them in a laurel.
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      body += star(24 + Math.cos(a) * 12, 24 + Math.sin(a) * 12, 5.4, gold);
    }
    if (kind === 'prestige') body += `<circle cx="24" cy="24" r="21" fill="none" stroke="${gold}" stroke-width="2"/>`;
  } else {
    body = `<circle cx="24" cy="24" r="7" fill="none" stroke="${gold}" stroke-width="2.4"/>`;
  }
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
}

// ── The daily strike.

export const DAILY_MODS = [
  { id: 'chest', name: 'WAR CHEST', line: 'Double funds from the first minute' },
  { id: 'arsenal', name: 'FULL ARSENAL', line: 'Every weapon released, today only' },
  { id: 'blitz', name: 'BLITZ', line: 'Bring it down inside five minutes' },
  { id: 'lean', name: 'SHOESTRING', line: 'Half the funds. Make every round count' },
];

export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Today's target: one of the contracts this commander has open, picked by the
 * date, so it is the same all day and different tomorrow.
 */
export function dailyFor(openIds, date = today()) {
  if (!openIds.length) return null;
  const h = hash(`ef:${date}`);
  const level = openIds[h % openIds.length];
  const mod = DAILY_MODS[(h >>> 8) % DAILY_MODS.length];
  return { date, level, mod };
}

export function dailyState() {
  const v = parse(get('tt.daily'), {}) || {};
  return { streak: v.streak || 0, best: v.best || 0, last: v.last || null, total: v.total || 0 };
}

export function dailyDoneToday() { return dailyState().last === today(); }

/** Bank a finished daily. Returns the streak it leaves. */
export function markDailyDone(date = today()) {
  const s = dailyState();
  if (s.last === date) return s.streak;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const streak = s.last === today(y) ? s.streak + 1 : 1;
  const out = { streak, best: Math.max(s.best, streak), last: date, total: s.total + 1 };
  put('tt.daily', JSON.stringify(out));
  return streak;
}

/** Whether a winning run met today's condition. */
export function dailyMet(mod, sum) {
  if (!mod) return false;
  if (mod === 'blitz') return !!sum && sum.time > 0 && sum.time <= 300;
  return true;
}

/** The daily a load was started for, if it was one. Read once per load. */
export function takeDailyRun(levelId) {
  try {
    const v = parse(sessionStorage.getItem('tt.dailyrun'), null);
    // Once: a restart or another contract is not the daily any more.
    sessionStorage.removeItem('tt.dailyrun');
    if (!v || v.level !== levelId || v.date !== today()) return null;
    return v;
  } catch { return null; }
}

export function startDailyRun(d) {
  try { sessionStorage.setItem('tt.dailyrun', JSON.stringify(d)); } catch { /* private mode */ }
}

export function endDailyRun() {
  try { sessionStorage.removeItem('tt.dailyrun'); } catch { /* private mode */ }
}
