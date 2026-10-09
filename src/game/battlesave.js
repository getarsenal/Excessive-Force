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
export function snapshotBattle({ level, battle, structures, daily = null, used = null }) {
  if (!battle || battle.state !== 'playing') return null;
  const units = battle.units.filter((u) => u.alive && u.health > 0).map((u) => ({
    id: u.def.id,
    x: +u.pos.x.toFixed(2), y: +u.pos.y.toFixed(2), z: +u.pos.z.toFixed(2),
    r: u.pos.onRoof ? 1 : 0, k: u.pos.onDeck ? 1 : 0,
    h: Math.round(u.health), kills: u.kills || 0, rank: u.rank || 0,
  }));
  // Bought and still in the lift, or under the canopies: paid for, so saved
  // as on the ground where it was going. A save taken during the airlift
  // used to keep the money spent and lose the gun.
  for (const d of battle.pending || []) {
    if (d.lost || !d.def || !d.pos) continue;
    units.push({ id: d.def.id, x: +d.pos.x.toFixed(2), y: +d.pos.y.toFixed(2), z: +d.pos.z.toFixed(2),
      r: d.pos.onRoof ? 1 : 0, k: d.pos.onDeck ? 1 : 0, h: 1e6, kills: 0, rank: 0 });
  }
  const touched = structures.some((s) => s.destroyedCount > 0);
  if (!units.length && !touched && !battle.shotsFired) return null;
  const g = battle.garrison;
  let nBase = g ? g.defenders.findIndex((d) => d.pool === 'air' || d.pool === 'wave' || d.pool === 'column') : 0;
  if (g && nBase < 0) nBase = g.defenders.length;
  const cf = battle.cityFire;
  const burnt = [];
  // A bomb's circle goes over a few tenths of a second; what it has
  // claimed and not yet reached is as good as burnt.
  if (cf) for (const p of cf.plots) if (p.burnt || p.doomed) burnt.push(p.index);
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
    // Gone is not only destroyed: a stone blown loose and lying in the
    // rubble, or riding a section that has fallen, is alive and counted as
    // demolished, and a resume that put it back in the wall filled every
    // crater in and stood every fallen spire up again. (Flags: 2 free, 8 in
    // a welded island.) The blast mass goes with it, or the leverage read
    // everything before the save over the blasts after it.
    stones: structures.map((s) => ({ n: s.count, dead: packBits(s.count, (i) => !s.isAlive(i) || (s.flags[i] & (2 | 8))),
      b: Math.round(s.blastMass || 0) })),
    quality: battle.quality?.id || null,
    // The garrison the level was built with, by index. The airborne come
    // after it in the list and are saved by where they dug in instead,
    // because a fresh level does not have them.
    defenders: g ? packBits(nBase, (i) => !g.defenders[i].alive) : '',
    nDefenders: nBase,
    alive: g ? g.defenders.filter((d) => d.alive).length : 0,
    // Spent only once it is all on the ground. A save taken with the drop
    // still in the air lost every man aboard and under a canopy, and the
    // drop never came again; now it is not spent, it comes again, and the
    // part of it already down is not kept twice.
    airborne: battle.airborne && battle.airborne.state === 'done' ? 1 : 0,
    assault: battle.assault && battle.assault.state === 'done' ? 1 : 0,
    air: g ? g.defenders.slice(nBase).filter((d) => d.alive
      && (d.pool === 'column' || (d.pool === 'wave' ? battle.assault?.state === 'done' : battle.airborne?.state === 'done'))).map((d) => [
      d.type, +d.pos.x.toFixed(1), +d.pos.y.toFixed(2), +d.pos.z.toFixed(1), +d.facing.toFixed(2),
      d.pool === 'wave' ? 1 : d.pool === 'column' ? 2 : 0]) : [],
    hv: battle.hv ? battle.hv.save() : null,
    counter: Math.max(0, +((battle.counterBatteryUntil ?? -1) - battle.elapsed).toFixed(1)),
    burnt,
    units,
    // The SAM sites: which of the level's own are wrecked, and the ones the
    // counter-attack brought, which a fresh level does not have.
    sams: battle.sams ? {
      dead: battle.sams.launchers.map((l, i) => (!l.alive && !l.dropped ? i : -1)).filter((i) => i >= 0),
      // What is left of each, and of each compound's radar.
      hp: battle.sams.launchers.filter((l) => !l.dropped).map((l) => Math.round(l.alive ? l.hp : 0)),
      radars: battle.sams.sites.map((st) => Math.round(st.radar?.alive ? st.radar.hp : 0)),
      down: battle.sams.sites.map((st) => (st.down ? 1 : 0)),
      radar: battle.sams.radar && !battle.sams.radar.alive ? 1 : 0,
      added: battle.sams.launchers.filter((l) => l.dropped && l.alive).map((l) => [+l.x.toFixed(1), +l.y.toFixed(2), +l.z.toFixed(1), +l.yaw.toFixed(3)]),
    } : null,
    hq: battle.hq ? Math.round(battle.hq.alive ? battle.hq.hp : 0) : null,
    credits: battle.strikeCredits || 0,
    comms: Math.max(0, +((battle.commsDownUntil ?? -1) - battle.elapsed).toFixed(1)),
    daily,
    used: used ? [...used] : [],
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
  // All of it or none of it. A level built differently (another quality
  // tier coarsens the stones) used to come back with the building whole and
  // the garrison full under the old clock, score and money.
  if (!snap.stones || snap.stones.length !== structures.length
      || structures.some((s, k) => snap.stones[k].n !== s.count)) return false;
  if (battle.garrison && snap.nDefenders !== battle.garrison.defenders.length) return false;
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
    if (rec.b != null) s.blastMass = rec.b;
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
    unpackBits(snap.defenders, g.defenders.length, (i) => { g.defenders[i].alive = false; g.defenders[i].gone = true; });
  }
  // The airborne, if they have been: dug in where they were, and not coming
  // a second time.
  if (snap.airborne && battle.airborne) battle.airborne.state = 'done';
  if (snap.assault && battle.assault) { battle.assault.state = 'done'; battle.assault.warned = true; }
  if (g) {
    for (const [type, x, y, z, f, wave] of snap.air || []) {
      g.place(type, new THREE.Vector3(x, y, z), f, 4, { cover: 'ground', emplaced: true,
        pool: wave === 2 ? 'column' : wave ? 'wave' : 'air' });
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
  // The SAMs.
  const S = battle.sams;
  if (S && snap.sams) {
    for (const i of snap.sams.dead || []) {
      const l = S.launchers[i];
      if (l && l.alive) { l.alive = false; S._wreck(l.group); }
    }
    const own = S.launchers.filter((l) => !l.dropped);
    (snap.sams.hp || []).forEach((hp, i) => { if (own[i] && own[i].alive && hp > 0) own[i].hp = hp; });
    (snap.sams.radars || []).forEach((hp, i) => {
      const R = S.sites[i]?.radar;
      if (!R?.alive) return;
      if (hp > 0) R.hp = hp; else { R.alive = false; S._wreck(R.group); }
    });
    (snap.sams.down || []).forEach((d, i) => { if (d && S.sites[i]) S.sites[i].down = true; });
    if (snap.sams.radar && S.radar?.alive) { S.radar.alive = false; S._wreck(S.radar.group); }
    for (const [x, y, z, yaw] of snap.sams.added || []) S.add({ x, y, z, yaw }, Math.max(1, snap.elapsed || 1));
  }
  // The command post, the free strikes banked and the comms still cut.
  if (battle.hq && snap.hq != null) {
    if (snap.hq <= 0) {
      const say2 = battle.hq.onEvent;
      battle.hq.onEvent = () => {};
      const keepFx = battle.hq.fx;
      battle.hq.fx = null;
      battle.hq.hp = 0.001;
      battle.hq.blast({ x: battle.hq.x, y: battle.hq.y, z: battle.hq.z }, 1, 1e6);
      battle.hq.onEvent = say2; battle.hq.fx = keepFx;
    } else battle.hq.hp = snap.hq;
  }
  battle.strikeCredits = snap.credits || 0;
  if (battle.hv && snap.hv) battle.hv.load(snap.hv);
  battle.money = snap.money;
  battle.spent = snap.spent;
  battle.elapsed = snap.elapsed;
  if (snap.comms > 0) battle.commsDownUntil = snap.elapsed + snap.comms;
  if (snap.counter > 0) battle.counterBatteryUntil = snap.elapsed + snap.counter;
  battle.score = snap.score;
  battle.shotsFired = snap.shots;
  battle.defendersKilled = snap.killed;
  battle.unitsLost = snap.lost;
  return true;
}
