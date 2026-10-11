/**
 * The boards: fewest rounds to bring each landmark down, the player against
 * everyone who has sent them a challenge.
 *
 * There is no server, so there is no world ranking; what there is, is every
 * challenge link this phone has opened (`?level=…&c=rounds&by=name`), kept
 * as that commander's score on that landmark, and the player's own best from
 * the record of their runs. That is the board a group of friends passing
 * links round actually plays for. A global table needs somewhere to send the
 * scores, which is a decision for later and not one to fake.
 */
import { commander } from './career.js';

const KEY = 'tt.rivals';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 '.\-]/g, '').trim().slice(0, 18);

/** A challenge opened: that commander's rounds on that landmark, best kept. */
export function noteRival(level, rounds, by) {
  if (!level || !(rounds > 0)) return;
  const name = clean(by) || 'A FRIEND';
  if (name === clean(commander().name)) return;          // our own link, opened again
  const all = read();
  const list = all[level] || (all[level] = []);
  const had = list.find((r) => r.by === name);
  if (had) { if (rounds < had.rounds) { had.rounds = rounds; had.at = Date.now(); } } else list.push({ by: name, rounds, at: Date.now() });
  list.sort((a, b) => a.rounds - b.rounds);
  all[level] = list.slice(0, 20);
  write(all);
}

/** The rivals on one landmark, fewest rounds first. */
export function rivalsOn(level) { return read()[level] || []; }

/** Every landmark anyone has challenged this phone on. */
export function rivalLevels() { return Object.keys(read()).filter((k) => (read()[k] || []).length); }

/**
 * One landmark's board: the rivals and the player's own best, ranked. `mine`
 * is the player's fewest rounds to close it, or null if never closed.
 */
export function boardFor(level, mine) {
  const rows = rivalsOn(level).map((r) => ({ by: r.by, rounds: r.rounds, you: false }));
  if (mine > 0) rows.push({ by: clean(commander().name) || 'YOU', rounds: mine, you: true });
  rows.sort((a, b) => a.rounds - b.rounds || (a.you ? -1 : 1));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** The link that challenges a friend to beat these rounds. */
export function challengeLink(level, rounds) {
  const by = encodeURIComponent(clean(commander().name));
  return `https://getarsenal.app/?level=${encodeURIComponent(level)}${rounds > 0 ? `&c=${rounds}&by=${by}` : ''}`;
}
