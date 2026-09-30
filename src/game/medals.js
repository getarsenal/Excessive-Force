/**
 * Medals: things a run did that the marks do not ask for.
 *
 * The marks are the same four questions every time. These are the odd ones —
 * one gun, three times par, nothing but aircraft — each won once per
 * commander and kept in `tt.medals`, which travels with the save slot.
 *
 * `check` reads a finished, won run: the summary, the level's marks, what
 * was put into the fight, and a few counters the battle keeps. It returns
 * the medals this run earned that the commander did not already hold.
 */
import { marksFor, loadProgress } from '../ui/levelselect.js';
import { damageBill } from '../ui/bill.js';

const KEY = 'tt.medals';

export const MEDALS = [
  { id: 'measured', name: 'MEASURED RESPONSE', line: 'Win with one weapon and nothing else' },
  { id: 'excessive', name: 'EXCESSIVE FORCE', line: 'Fire three times par and win anyway' },
  { id: 'surgical', name: 'SURGICAL', line: 'Leverage of 20× or better' },
  { id: 'hattrick', name: 'HAT TRICK', line: 'Rounds, budget and clock marks on one run' },
  { id: 'shoestring', name: 'SHOESTRING', line: 'Win under the budget par' },
  { id: 'blitz', name: 'BLITZKRIEG', line: 'Win inside three minutes' },
  { id: 'untouched', name: 'NOT A SCRATCH', line: 'Win without losing a unit' },
  { id: 'nowitness', name: 'NO WITNESSES', line: 'Leave no defender standing' },
  { id: 'airpower', name: 'AIR POWER ONLY', line: 'Win with strikes and no ground units' },
  { id: 'grunts', name: 'BOOTS ON THE GROUND', line: 'Win with infantry and nothing heavier' },
  { id: 'bigone', name: 'THE BIG ONE', line: 'Call in the B-1 and its MOAB' },
  { id: 'chain', name: 'SECONDARY OBJECTIVE', line: 'Set off three of their dumps in one fight' },
  { id: 'renewal', name: 'URBAN RENEWAL', line: 'Burn out twenty-five city buildings in one fight' },
  { id: 'claim', name: 'ACT OF GOD', line: 'Run up a damage bill over ten billion' },
  { id: 'flakbait', name: 'FLAK BAIT', line: 'Win after losing an aircraft to flak' },
  { id: 'tour', name: 'WORLD TOUR', line: 'Close ten contracts' },
  { id: 'fifty', name: 'FIFTY STATES OF MIND', line: 'Close fifty contracts' },
];
export const MEDALS_BY_ID = Object.fromEntries(MEDALS.map((m) => [m.id, m]));

export function loadMedals() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

function saveMedals(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
}

/**
 * @param {object} p
 * @param {object} p.level
 * @param {object} p.sum     battle.summary()
 * @param {Set<string>} p.used   unit ids deployed or called this fight
 * @param {object} p.defs    UNITS_BY_ID
 * @param {number} p.burnt   city buildings burnt out
 * @param {number} p.defendersLeft
 * @param {boolean} p.lostAircraft
 * @param {number} p.dumps   the garrison's dumps set off
 */
export function checkMedals({ level, sum, used, defs, burnt = 0, defendersLeft = 1, lostAircraft = false, dumps = 0 }) {
  if (!level || level.id === 'tutorial' || !sum) return [];
  const marks = Object.fromEntries(marksFor(level, sum).map((m) => [m.id, m]));
  const ids = [...used];
  const kinds = ids.map((id) => defs[id]).filter(Boolean);
  const ground = kinds.filter((d) => !d.strike);
  const wins = Object.values(loadProgress()).filter((r) => r && r.won).length;
  const got = {
    measured: ids.length === 1,
    excessive: marks.rounds && sum.shotsFired >= 3 * marks.rounds.par,
    surgical: (sum.leverage ?? 1) >= 20,
    hattrick: !!(marks.rounds?.won && marks.spend?.won && marks.time?.won),
    shoestring: !!marks.spend?.won,
    blitz: sum.time <= 180,
    untouched: sum.unitsLost === 0 && ground.length > 0,
    nowitness: defendersLeft === 0 && sum.defendersKilled > 0,
    airpower: kinds.length > 0 && ground.length === 0,
    grunts: ground.length > 0 && ground.length === kinds.length && ground.every((d) => d.model === 'infantry'),
    bigone: used.has('b1'),
    chain: dumps >= 3,
    renewal: burnt >= 25,
    claim: damageBill(sum, { burnt }).total >= 1e10,
    flakbait: lostAircraft,
    tour: wins >= 10,
    fifty: wins >= 50,
  };
  const have = loadMedals();
  const fresh = MEDALS.filter((m) => got[m.id] && !have[m.id]);
  if (fresh.length) {
    const when = new Date().toISOString().slice(0, 10);
    for (const m of fresh) have[m.id] = { at: when, level: level.id };
    saveMedals(have);
  }
  return fresh;
}
