/**
 * Seasons: every six weeks, a themed run of landmarks out of the catalogue,
 * open to every player for those six weeks whatever the campaign has reached,
 * and a track of three rewards for the stars won on them while it runs.
 *
 * A star counts once per landmark and season: the best a landmark gave in
 * the window, up to its three. Each tier pays once. What a season can give
 * is what the game has — XP, supply crates, a painting early off the hangar
 * wall — and a new aircraft or new nose art for a season is content to be
 * added to the season's record when it exists, not something to fake.
 */
import { LEVELS } from './levels.js';
import { grant } from './progress.js';

const DAY = 86400000;

export const SEASONS = [
  { id: 's1', name: 'OLD WORLD', start: '2026-10-11', weeks: 6,
    line: 'Cathedrals, palaces and castles across Europe.',
    levels: ['milan', 'stvitus', 'ulm', 'stephansdom', 'versailles', 'alhambra', 'malbork', 'winterpalace'],
    tiers: [
      { at: 4, xp: 2500, crates: 1, label: '2,500 XP and a supply crate' },
      { at: 10, art: 'sender', crates: 1, label: 'Return to Sender on your aircraft, early, and a crate' },
      { at: 18, xp: 10000, crates: 3, mark: true, label: '10,000 XP, three crates and the OLD WORLD mark' },
    ] },
  { id: 's2', name: 'TALL ORDERS', start: '2026-11-22', weeks: 6,
    line: 'Towers of glass and steel, the tallest the catalogue holds.',
    levels: ['taipei101', 'shanghaitower', 'landmark81', 'warsaw', 'bucharest', 'hallgrimskirkja', 'helsinki', 'saintsava'],
    tiers: [
      { at: 4, xp: 2500, crates: 1, label: '2,500 XP and a supply crate' },
      { at: 10, art: 'actofgod', crates: 1, label: 'Act of God on your aircraft, early, and a crate' },
      { at: 18, xp: 10000, crates: 3, mark: true, label: '10,000 XP, three crates and the TALL ORDERS mark' },
    ] },
  { id: 's3', name: 'FORTRESS', start: '2027-01-03', weeks: 6,
    line: 'Castles and forts built to take a siege. Now they get one.',
    levels: ['osaka', 'redfort', 'cartagena', 'chillon', 'bran', 'kronborg', 'trakai', 'hohensalzburg'],
    tiers: [
      { at: 4, xp: 2500, crates: 1, label: '2,500 XP and a supply crate' },
      { at: 10, art: 'exwife', crates: 1, label: "Buck's Ex-Wife on your aircraft, early, and a crate" },
      { at: 18, xp: 10000, crates: 3, mark: true, label: '10,000 XP, three crates and the FORTRESS mark' },
    ] },
  { id: 's4', name: 'HOLY GROUND', start: '2027-02-14', weeks: 6,
    line: 'Temples, stupas, pagodas and a ziggurat older than writing.',
    levels: ['wildgoose', 'boudhanath', 'prambanan', 'kinkakuji', 'baalbek', 'ur', 'djoser', 'yamoussoukro'],
    tiers: [
      { at: 4, xp: 2500, crates: 1, label: '2,500 XP and a supply crate' },
      { at: 10, art: 'refunds', crates: 1, label: 'No Refunds on your aircraft, early, and a crate' },
      { at: 18, xp: 10000, crates: 3, mark: true, label: '10,000 XP, three crates and the HOLY GROUND mark' },
    ] },
];

const KEY = 'tt.season';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

const startOf = (s) => new Date(`${s.start}T00:00:00`).getTime();
const endOf = (s) => startOf(s) + s.weeks * 7 * DAY;

/** The season running now, with how many days it has left, or null. */
export function currentSeason(now = Date.now()) {
  const s = SEASONS.find((x) => now >= startOf(x) && now < endOf(x));
  if (!s) return null;
  return { ...s, levels: s.levels.filter((id) => LEVELS[id]), daysLeft: Math.ceil((endOf(s) - now) / DAY) };
}

/** This season's record: best stars per landmark, tiers paid, marks held. */
export function seasonState(s = currentSeason()) {
  const v = read();
  const rec = (s && v[s.id]) || { stars: {}, paid: [] };
  const stars = Object.values(rec.stars || {}).reduce((a, n) => a + n, 0);
  return { stars, best: rec.stars || {}, paid: rec.paid || [], marks: SEASONS.filter((x) => v[x.id]?.mark).map((x) => x.name),
    max: s ? s.levels.length * 3 : 0 };
}

/** Paintings a season has handed over early (noseart.js reads this). */
export function seasonArt() {
  const v = read();
  return SEASONS.flatMap((s) => (v[s.id]?.paid || []).map((i) => s.tiers[i]?.art).filter(Boolean));
}

/**
 * A run on a landmark has ended. In season, its stars count (the best the
 * landmark has given this season), and any tier newly reached pays. Returns
 * the tiers paid now, for the feed.
 */
export function recordSeasonRun(level, starsWon) {
  const s = currentSeason();
  if (!s || !s.levels.includes(level) || !(starsWon > 0)) return [];
  const v = read();
  const rec = v[s.id] || (v[s.id] = { stars: {}, paid: [] });
  rec.stars[level] = Math.max(rec.stars[level] || 0, Math.min(3, starsWon));
  const total = Object.values(rec.stars).reduce((a, n) => a + n, 0);
  const now = [];
  s.tiers.forEach((t, i) => {
    if (total < t.at || rec.paid.includes(i)) return;
    rec.paid.push(i);
    grant({ xp: t.xp || 0, crates: t.crates || 0 });
    if (t.mark) rec.mark = true;
    now.push(t);
  });
  write(v);
  return now;
}

/** The season a landmark belongs to now, if any: such a landmark is open to all. */
export function inSeason(level) {
  const s = currentSeason();
  return !!s && s.levels.includes(level);
}
