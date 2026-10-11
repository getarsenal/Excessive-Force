// Par against play: a battle won by a player who reads the survey. Six guns
// of the tier the par notes in levels.js price `spend` on (the M119 at
// Westminster, the M777 by Agra, the Paladin by Sydney, MLRS by Istanbul,
// HIMARS by Kuala Lumpur), bought as the money comes in and flown in by
// the lift as a player's are, the garrison firing back and lost guns bought
// again. Every few seconds the battery is laid on the most loaded scored
// stone in the bottom quarter of what still stands — the red stone the
// survey shows — and the fight runs to the win or LIMIT game minutes. Prints
// the four marks against par, and a line of JSON for the table.
// HOW=face lays on the lowest stone of the battery's face instead (the
// undercut); with HOW=full, AIMBY=face does the same. QUIET=1 silences the
// garrison, to measure the demolition alone; STOPDOWN=1 stops at the win mark.
//   node tools/parprobe.mjs <level> [port=5178]     GUN=m777 LIMIT=20 RETARGET=6 HOW=survey|face QUIET=1
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.argv[3] || process.env.TT_PORT || 5178;
const TIER = { westminster: 'm119', paris: 'm119', agra: 'm777', giza: 'm777', chichen: 'm777', pisa: 'm777',
  sydney: 'm109', moscow: 'm109', rio: 'm109', athens: 'm109', istanbul: 'm270', cologne: 'm270', himeji: 'm270',
  petronas: 'm142', dubai: 'm142', potala: 'm142' };
const gun = process.env.GUN || TIER[level] || 'm777';
const limit = +(process.env.LIMIT || 20) * 60, retarget = +(process.env.RETARGET || 6);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
// HOW=full plays as a player who has reached this landmark: the arsenal the
// campaign has handed over by then (a challenge link's `c`), opened along
// the bar as the battle opens it, guns and strikes both.
const full = process.env.HOW === 'full';
await page.goto(`http://localhost:${port}/?level=${level}${full ? '&c=999' : ''}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1000);
const t0 = Date.now();
const out = await page.evaluate(async ({ gun, limit, retarget, quiet, how, aimBy, stopDown }) => {
  const B = window.battle, T = window.THREE, s = B.primary, terrain = window.terrain, o = s.origin;
  // The tier the par is priced on, released as the campaign would have it by
  // this landmark; the money, the lift and the garrison are the battle's own.
  const UM = await import('/src/game/units.js');
  if (how !== 'full') B.unlockAll = true;
  const U = UM.UNITS_BY_ID[gun];
  const cost = B.costOf(U);
  // Every objective the bar counts, not only the primary: the battery is laid
  // on whichever is furthest from done.
  const rests = new Map(B.objectives.map((ob) => [ob.structure, Float32Array.from(ob.structure.py)]));
  const scoredIn = (st, i) => (st.flags[i] & 1) && (!st._winMask || st._winMask[i]);
  const standingIn = (st, i) => scoredIn(st, i) && Math.abs(st.py[i] - rests.get(st)[i]) < 1;
  const behind = () => B.objectives.slice().sort((x, y) => B.objectiveShare(x) - B.objectiveShare(y))[0]?.structure || s;
  if (quiet) { B.invulnerable = true; if (B.garrison) B.garrison.fireEnabled = false; }
  // One battery, on the side the player looks from: ground two to three
  // hundred and fifty metres out, within forty degrees of the camera's bearing.
  const cam = window.__engine.camera.position;
  const bear = Math.atan2(cam.z - o.z, cam.x - o.x);
  const spots = [];
  for (let k = 0; k < 17; k++) {
    const a = bear + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5) / 57.3;
    for (const r of [220, 280, 340]) {
      const x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
      spots.push(new T.Vector3(x, terrain.heightAt(x, z), z));
    }
  }
  // The face that battery sees: stones whose bearing from the centre is within
  // thirty-five degrees of the guns'.
  const onFace = (i, st = s) => {
    let d = Math.atan2(st.pz[i] - o.z, st.px[i] - o.x) - bear;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) < 35 / 57.3;
  };
  let spot = 0, lastAim = -1e9, tags = 0;
  const pick = (st = behind()) => {
    // The bottom quarter of what stands, the most worked stone in it.
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < st.count; i++) if (standingIn(st, i)) { lo = Math.min(lo, st.py[i]); hi = Math.max(hi, st.py[i]); }
    if (lo === Infinity) return null;
    const top = lo + Math.max(2, (hi - lo) * 0.25);
    let best = -1, bu = -1;
    for (let i = 0; i < st.count; i++) {
      if (!standingIn(st, i) || st.py[i] > top) continue;
      if (st.py[i] < terrain.heightAt(st.px[i], st.pz[i]) + 0.4) continue;
      const u = st.utilisation(i);
      if (u > bu) { bu = u; best = i; }
    }
    return best < 0 ? null : new T.Vector3(st.px[best], st.py[best], st.pz[best]);
  };
  // The undercut: the lowest standing scored stone on the battery's face,
  // over and over, as the par notes' own measurement does.
  const pickFace = (st = behind()) => {
    let best = -1, by = Infinity;
    for (let i = 0; i < st.count; i++) {
      if (!standingIn(st, i) || !onFace(i, st)) continue;
      if (st.py[i] < terrain.heightAt(st.px[i], st.pz[i]) + 0.4) continue;
      if (st.py[i] < by) { by = st.py[i]; best = i; }
    }
    return best < 0 ? pick(st) : new T.Vector3(st.px[best], st.py[best], st.pz[best]);
  };
  // What the battery can see. A gun on the ground two hundred metres out
  // cannot see the foot of a building on a plinth (the Taj stands on seven
  // metres of marble), and laying on a stone it cannot see puts every round
  // into the plinth, which the bar does not count. So a candidate stone is
  // kept only if a ray from the battery's middle meets that structure first,
  // within a metre and a half of the stone; the most loaded such stone in the
  // bottom half of what stands is the lay. Indirect fire sees everything.
  const PH = window.__physics || B.physics;
  const seen = (st, i) => {
    const live = B.units.filter((u) => u.alive && !u.def.strike && u.pos);
    if (!live.length || live.every((u) => u.def.projectile?.kind === 'arc' && !u.def.projectile?.flat)) return true;
    let x = 0, y = 0, z = 0;
    for (const u of live) { x += u.pos.x; y += u.pos.y + 1.6; z += u.pos.z; }
    x /= live.length; y /= live.length; z /= live.length;
    const dx = st.px[i] - x, dy = st.py[i] - y, dz = st.pz[i] - z, d = Math.hypot(dx, dy, dz);
    const hit = PH.castRay({ x, y, z }, { x: dx / d, y: dy / d, z: dz / d }, d + 2, null, PH.cityBody);
    if (!hit) return false;
    return hit.owner?.structure === st && hit.toi > d - 1.5;
  };
  const pickSeen = (st = behind()) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < st.count; i++) if (standingIn(st, i)) { lo = Math.min(lo, st.py[i]); hi = Math.max(hi, st.py[i]); }
    if (lo === Infinity) return null;
    const top = lo + Math.max(3, (hi - lo) * 0.5);
    const list = [];
    for (let i = 0; i < st.count; i++) {
      if (!standingIn(st, i) || st.py[i] > top) continue;
      list.push([st.utilisation(i), i]);
    }
    list.sort((a, b) => b[0] - a[0]);
    for (const [, i] of list.slice(0, 160)) if (seen(st, i)) return new T.Vector3(st.px[i], st.py[i], st.pz[i]);
    return null;
  };
  const want = 6;
  // The full arsenal, bought the way a player who knows it buys: for value.
  // Each open ground unit is worth what it throws a second per dollar (a
  // warhead's power over its burst's area, by the salvo, over the reload,
  // over the price), and the bot buys the best of what the money covers,
  // unless a better one is under twenty seconds' income away, in which case
  // it waits for it. Placed on ground the game accepts, anywhere round the
  // landmark inside the unit's own reach, nearest the camera's side first
  // (the old ring was only the camera's side, and at Agra that is the far
  // bank of the Yamuna: every spot in the river, nothing bought after the
  // first lift). Twelve on the ground at most, the cheapest traded in for one
  // three times its price. Strikes only out of money that has been sitting
  // there: the battery full, twice the strike's price in hand, one a minute,
  // the cheapest single pass that is open.
  const ground = UM.UNITS.filter((d) => !d.strike && d.id !== 'm240' && d.warhead);
  const strikes = UM.STRIKES.filter((d) => !UM.isLoiter(d) && !d.strike?.strafe);
  const worth = (d) => {
    const w = d.warhead;
    return (w.power * w.radius * w.radius * (d.salvo?.count || 1)) / Math.max(0.5, d.reload || 1) / Math.max(1, B.costOf(d));
  };
  const cands = [];
  for (let r = 90; r <= 520; r += 30) {
    for (let k = 0; k < 36; k++) {
      const a = bear + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 10) / 57.3;
      const x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
      const off = Math.ceil(k / 2) * 10;
      cands.push({ r, off, p: new T.Vector3(x, terrain.heightAt(x, z), z) });
    }
  }
  // Nearest the camera's bearing first, then the middle of the unit's reach.
  const ringFor = (d) => cands
    .filter((c) => c.r <= d.range * 0.85 && c.r >= (d.minRange || 0) + 50)
    .sort((x, y) => (x.off - y.off) || (Math.abs(x.r - d.range * 0.4) - Math.abs(y.r - d.range * 0.4)));
  const rings = new Map(ground.map((d) => [d.id, ringFor(d)]));
  const used = new Map();
  let struck = 0, lastStrike = -1e9;
  const place = async (d) => {
    const ring = rings.get(d.id) || [];
    for (let k = used.get(d.id) || 0; k < ring.length; k++) {
      const p = ring[k].p;
      if (!B.validPlacement(p, d).ok) continue;
      used.set(d.id, k + 1);
      if (await B.deploy(d.id, p.clone())) return true;
    }
    used.set(d.id, 0);
    return false;
  };
  const fullStep = async () => {
    const open = ground.filter((d) => B.isUnlocked(d));
    if (!open.length) return;
    const mine = B.units.filter((u) => u.alive && !u.def.strike).length + B.pending.filter((d) => !d.lost).length;
    const aim = B.target;
    const cheapStrike = strikes.filter((d) => B.isUnlocked(d)).sort((x, y) => B.costOf(x) - B.costOf(y))[0];
    if (aim && cheapStrike && mine >= 12 && B.money >= 2 * B.costOf(cheapStrike) && B.elapsed - lastStrike > 60
      && !B.air?.sorties.some((x) => !x.lift)) {
      if (await B.deploy(cheapStrike.id, aim.clone())) { struck++; lastStrike = B.elapsed; return; }
    }
    const ranked = open.slice().sort((x, y) => worth(y) - worth(x));
    const best = ranked[0];
    const soon = B.money + B.income * 20 >= B.costOf(best);
    const buy = B.money >= B.costOf(best) ? best
      : soon ? null
      : ranked.find((d) => B.money >= B.costOf(d) && worth(d) >= worth(best) * 0.6);
    if (!buy) return;
    if (mine >= 12) {
      const cheap = B.units.filter((u) => u.alive && !u.def.strike).sort((x, y) => B.costOf(x.def) - B.costOf(y.def))[0];
      if (!cheap || B.costOf(buy) < B.costOf(cheap.def) * 1.5 || worth(buy) < worth(cheap.def) * 1.2) return;
      B.sellUnit(cheap);
    }
    await place(buy);
  };
  const timeline = [];
  let down = null;
  while (B.state === 'playing' && B.elapsed < limit) {
    // Buy: six on the ground or in the lift, as the money allows.
    const have = B.units.filter((u) => u.alive && u.def.id === gun).length + B.pending.filter((d) => !d.lost && d.def.id === gun).length;
    if (how === 'full') await fullStep();
    else if (have < want && (B.freeBuild || B.money >= cost)) {
      for (let tries = 0; tries < 12 && spot < spots.length * 3; tries++) {
        const p = spots[spot++ % spots.length];
        const u = await B.deploy(gun, p.clone());
        if (u) break;
        if (B.money < cost) break;
      }
    }
    // The moment the bar crosses the win mark: the demolition's own cost.
    if (!down && B.objectiveProgress >= B.constructor.WIN_AT) {
      down = { t: Math.round(B.elapsed), rounds: B.shotsFired, spent: Math.round(B.spent), leverage: +(B.leverage ?? 0).toFixed(2) };
    }
    if (down && stopDown) break;
    if (down && B.elapsed - lastAim > retarget) {
      // Down but not won: the men left, nearest first, as the red markers ask.
      lastAim = B.elapsed;
      const live = (B.garrison?.defenders || []).filter((d) => d.alive && d.pos);
      live.sort((x, y) => x.pos.distanceTo(o) - y.pos.distanceTo(o));
      if (live[0]) B.setTarget(live[0].pos.clone(), 'hunt', live[0]);
    } else if (B.elapsed - lastAim > retarget) {
      lastAim = B.elapsed;
      const p = (how === 'face' || aimBy === 'face') ? (pickFace()) : (how === 'full' ? (pickSeen() || pick()) : pick());
      if (p) { B.setTarget(p, 'bot'); tags++; }
    }
    window.__fastForward(0.5, 1 / 30);
    if (Math.round(B.elapsed) % 60 === 0 && (!timeline.length || timeline[timeline.length - 1].t !== Math.round(B.elapsed))) {
      timeline.push({ t: Math.round(B.elapsed), bar: +B.objectiveProgress.toFixed(3), rounds: B.shotsFired, spent: Math.round(B.spent), guns: B.units.filter((u) => u.alive).length });
    }
    await new Promise((r) => setTimeout(r, 1));
  }
  const sum = B.summary();
  return { state: B.state, sum: { shotsFired: sum.shotsFired, spent: sum.spent, time: Math.round(sum.time), leverage: +(sum.leverage ?? 0).toFixed(2), score: sum.score },
    par: null, down, timeline, tags, struck, kit: [...new Set(B.units.map((u) => u.def.id))], bar: +B.objectiveProgress.toFixed(3), lost: B.unitsLost ?? null };
}, { gun, limit, retarget, quiet: !!process.env.QUIET, how: process.env.HOW || 'survey', aimBy: process.env.AIMBY || 'survey', stopDown: !!process.env.STOPDOWN });
const par = out.par || (await page.evaluate(async (id) => (await import('/src/game/levels.js')).LEVELS[id].par, level));
const s = out.sum;
const row = (k, got, p, high = false) => `${k.padEnd(9)} ${String(got).padStart(8)}  par ${String(p).padStart(6)}  ${(high ? got >= p : got <= p) ? 'MET' : 'missed'}  (${(got / p).toFixed(2)}× par)`;
console.log(`${level} · ${gun} ×6 · ${process.env.HOW || 'survey'}${process.env.QUIET ? ' · garrison silent' : ''} · ${out.state} at ${s.time} s, bar ${out.bar} · ${((Date.now() - t0) / 60000).toFixed(1)} min wall`);
console.log(' ', row('rounds', s.shotsFired, par.rounds));
console.log(' ', row('spend', s.spent, par.spend));
console.log(' ', row('minutes', +(s.time / 60).toFixed(1), par.minutes));
console.log(' ', row('leverage', s.leverage, par.leverage, true));
console.log('  bar past the win mark at', JSON.stringify(out.down));
if (full) console.log('  strikes called', out.struck, '· guns used', JSON.stringify(out.kit));
for (const t of out.timeline) console.log('   ', JSON.stringify(t));
console.log('JSON', JSON.stringify({ level, gun, how: process.env.HOW || 'survey', aimBy: process.env.AIMBY || 'survey', quiet: !!process.env.QUIET, state: out.state, ...s, down: out.down, par }));
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close();
