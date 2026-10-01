/**
 * Battles in progress.
 *
 * A fight on a phone is interrupted — a call, a lock screen, a browser that
 * reclaims the tab — and the whole of it used to go with the page: forty
 * minutes of Cologne and a cathedral at a third of its height, gone. So a
 * battle is written down while it is being fought, and the front door offers
 * it back.
 *
 * What is kept is what the player did, not the physics: which stones are gone,
 * which buildings in town are burnt out, which defenders are dead, where every
 * gun is standing, the money, the clock and the tally. The rubble is not kept —
 * it cannot be, it is a few hundred bodies mid-flight — and it does not need to
 * be. On the way back in the missing stones are taken out quietly and the
 * support solver is asked about what is left, so anything that was already
 * hanging on nothing comes down again in front of the player: the building
 * remembers what was done to it.
 *
 * One save per contract, in the active commander's slot, newest first, and a
 * handful at most. A win or a loss clears it; so does starting that contract
 * over.
 */
import * as THREE from 'three';

const KEY = 'tt.battles';
const MAX = 6;

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function writeAll(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; }
}

/** Every battle in progress, newest first. */
export function listBattles() {
  return Object.values(readAll())
    .filter((b) => b && b.level)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function battleFor(levelId) {
  return readAll()[levelId] || null;
}

export function clearBattle(levelId) {
  const all = readAll();
  if (!all[levelId]) return;
  delete all[levelId];
  writeAll(all);
}

/** A bitset of dead stones, as base64: a few kilobytes for fourteen thousand. */
function packBits(n, isSet) {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  let any = false;
  for (let i = 0; i < n; i++) {
    if (isSet(i)) { bytes[i >> 3] |= 1 << (i & 7); any = true; }
  }
  if (!any) return '';
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function unpackBits(b64, n, fn) {
  if (!b64) return 0;
  const s = atob(b64);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i >> 3) & (1 << (i & 7))) { fn(i); c++; }
  }
  return c;
}

/**
 * The battle as it stands, or null if there is nothing worth keeping: no gun
 * on the ground and not a stone touched is a contract not yet started.
 */
export function snapshotBattle({ level, battle, structures }) {
  if (!battle || battle.state !== 'playing') return null;
  const units = battle.units.filter((u) => u.alive && u.health > 0).map((u) => ({
    id: u.def.id,
    x: +u.pos.x.toFixed(2), y: +u.pos.y.toFixed(2), z: +u.pos.z.toFixed(2),
    r: u.pos.onRoof ? 1 : 0, k: u.pos.onDeck ? 1 : 0,
    h: Math.round(u.health), kills: u.kills || 0, rank: u.rank || 0,
  }));
  const touched = structures.some((s) => s.destroyedCount > 0);
  if (!units.length && !touched && !battle.shotsFired) return null;
  const g = battle.garrison;
  let nBase = g ? g.defenders.findIndex((d) => d.pool === 'air') : 0;
  if (g && nBase < 0) nBase = g.defenders.length;
  const cf = battle.cityFire;
  const burnt = [];
  if (cf) for (const p of cf.plots) if (p.burnt) burnt.push(p.index);
  return {
    v: 1,
    level: level.id,
    at: Date.now(),
    target: level.target || level.name,
    place: level.place || level.subtitle || '',
    money: Math.round(battle.money),
    spent: Math.round(battle.spent),
    elapsed: +battle.elapsed.toFixed(1),
    score: +battle.score.toFixed(1),
    shots: battle.shotsFired || 0,
    killed: battle.defendersKilled || 0,
    lost: battle.unitsLost || 0,
    integrity: +(battle.primary.monumentIntegrity ?? 1).toFixed(3),
    stones: structures.map((s) => ({ n: s.count, dead: packBits(s.count, (i) => !s.isAlive(i)) })),
    // The garrison the level was built with, by index. The airborne come
    // after it in the list and are saved by where they dug in instead,
    // because a fresh level does not have them.
    defenders: g ? packBits(nBase, (i) => !g.defenders[i].alive) : '',
    nDefenders: nBase,
    alive: g ? g.defenders.filter((d) => d.alive).length : 0,
    airborne: battle.airborne && battle.airborne.spent ? 1 : 0,
    air: g ? g.defenders.slice(nBase).filter((d) => d.alive).map((d) => [
      d.type, +d.pos.x.toFixed(1), +d.pos.y.toFixed(2), +d.pos.z.toFixed(1), +d.facing.toFixed(2)]) : [],
    burnt,
    units,
  };
}

export function saveBattle(snap) {
  if (!snap) return false;
  const all = readAll();
  all[snap.level] = snap;
  // The oldest go first when there are too many.
  const keep = Object.values(all).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, MAX);
  const out = {};
  for (const b of keep) out[b.level] = b;
  if (writeAll(out)) return true;
  // Out of room: this one matters more than the others.
  return writeAll({ [snap.level]: snap });
}

/**
 * Put a saved battle back on a freshly built level.
 *
 * Quietly: the stones and the town go without dust or fire or sound, and the
 * battle's own bookkeeping is restored from the save rather than recounted
 * from what was just removed.
 */
export function restoreBattle(snap, { battle, structures }) {
  if (!snap || !battle) return false;
  // The stones.
  structures.forEach((s, k) => {
    const rec = snap.stones && snap.stones[k];
    if (!rec || rec.n !== s.count) return;      // a rebuilt level; leave it whole
    const hook = s.onChunkDestroyed;
    s.onChunkDestroyed = null;
    try {
      unpackBits(rec.dead, s.count, (i) => s.destroyChunk(i));
    } finally {
      s.onChunkDestroyed = hook;
    }
    s.stabilityDirty = true;
  });
  // The town.
  const cf = battle.cityFire;
  if (cf && snap.burnt && snap.burnt.length) {
    const keep = { fx: cf.fx, fires: cf.fires, audio: cf.audio };
    cf.fx = null; cf.fires = null; cf.audio = null;
    try {
      for (const i of snap.burnt) { const p = cf.plots[i]; if (p && !p.burnt) cf.burn(p, 0); }
    } finally {
      Object.assign(cf, keep);
    }
  }
  // The garrison.
  const g = battle.garrison;
  if (g && snap.nDefenders === g.defenders.length) {
    unpackBits(snap.defenders, g.defenders.length, (i) => { g.defenders[i].alive = false; });
  }
  // The airborne, if they have been: dug in where they were, and not coming
  // a second time.
  if (snap.airborne && battle.airborne) battle.airborne.state = 'done';
  if (g) {
    for (const [type, x, y, z, f] of snap.air || []) {
      g.place(type, new THREE.Vector3(x, y, z), f, 4, { cover: 'ground', emplaced: true, pool: 'air' });
    }
  }
  // The guns, where they were standing, as they were — without the feed
  // announcing each one as if it had just been deployed.
  const say = battle.onEvent;
  battle.onEvent = () => {};
  try {
  for (const u of snap.units || []) {
    const p = battle.restorePoint(u);
    const unit = battle.restoreUnit(u.id, p);
    if (!unit) continue;
    unit.health = Math.max(1, Math.min(unit.maxHealth, u.h));
    unit.kills = u.kills || 0;
    unit.rank = u.rank || 0;
    // Dug in and ready: it has been standing there all along.
    unit.state = 'ready';
    unit.setupLeft = 0;
  }
  } finally {
    battle.onEvent = say;
  }
  battle.money = snap.money;
  battle.spent = snap.spent;
  battle.elapsed = snap.elapsed;
  battle.score = snap.score;
  battle.shotsFired = snap.shots;
  battle.defendersKilled = snap.killed;
  battle.unitsLost = snap.lost;
  return true;
}
