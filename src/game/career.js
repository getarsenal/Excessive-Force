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
const SLOT_KEYS = ['tt.progress', 'tt.campaign', 'tt.tutorial', 'tt.battles', 'tt.daily', 'tt.commander'];
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
    rank: rankFor(tons),
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
export function insignia(rank, cls = 'ins') {
  const g = '#e4b54a';
  let body = '';
  if (rank.kind === 'chev') {
    for (let k = 0; k < rank.n; k++) {
      const y = 10 + k * 8;
      body += `<path d="M6 ${y + 8} L24 ${y} L42 ${y + 8}" fill="none" stroke="${g}" stroke-width="4.2" stroke-linejoin="miter"/>`;
    }
  } else if (rank.kind === 'bar') {
    const w = rank.n === 1 ? 10 : 8;
    for (let k = 0; k < rank.n; k++) {
      const x = rank.n === 1 ? 19 : 12 + k * 14;
      body += `<rect x="${x}" y="8" width="${w}" height="32" rx="1.5" fill="${g}"/>`;
    }
  } else if (rank.kind === 'leaf') {
    body = `<path d="M24 6 C34 14 38 22 32 32 C29 36 26 38 24 42 C22 38 19 36 16 32 C10 22 14 14 24 6 Z" fill="${g}"/><path d="M24 12 V40" stroke="#6b4b10" stroke-width="1.6"/>`;
  } else if (rank.kind === 'eagle') {
    body = `<path d="M4 18 L18 22 L24 12 L30 22 L44 18 L34 28 L28 28 L24 40 L20 28 L14 28 Z" fill="${g}"/>`;
  } else if (rank.kind === 'star') {
    const n = rank.n, gap = 44 / n;
    const star = (cx, cy, r) => {
      let d = '';
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.42 : r;
        d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
      }
      return `<path d="${d}Z" fill="${g}"/>`;
    };
    const r = Math.min(9, gap * 0.48);
    for (let k = 0; k < n; k++) body += star(2 + gap * (k + 0.5), 24, r);
  } else {
    body = `<circle cx="24" cy="24" r="7" fill="none" stroke="${g}" stroke-width="2.4"/>`;
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
