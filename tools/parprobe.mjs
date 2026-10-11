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
  const want = 6;
  // The full arsenal, bought the way a player who knows it buys: the
  // heaviest ground unit the bar has opened that the money covers, placed
  // inside its own reach on the battery's side, and not a cheap team when a
  // much better one is a moment's income away; ten on the ground at most.
  // Strikes (single pass, not the strafe or the loiter) once the money covers
  // one, on the point the battery is laid on.
  const LADDER = ['m119', 'm777', 'm109', 'm270', 'm142'];
  const ground = UM.UNITS.filter((d) => !d.strike && d.id !== 'm240');
  const strikes = UM.STRIKES.filter((d) => !UM.isLoiter(d) && !d.strike?.strafe);
  const ringFor = (d) => {
    const out = [];
    for (const r of [120, 160, 200, 240, 280, 340, 420]) {
      if (r > d.range * 0.85 || r < (d.minRange || 0) + 60) continue;
      for (let k = 0; k < 13; k++) {
        const a = bear + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 6) / 57.3;
        const x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
        out.push(new T.Vector3(x, terrain.heightAt(x, z), z));
      }
    }
    return out;
  };
  const rings = new Map(ground.map((d) => [d.id, ringFor(d)]));
  const cursor = new Map();
  let struck = 0;
  const fullStep = async () => {
    const open = ground.filter((d) => B.isUnlocked(d));
    if (!open.length) return;
    const top = Math.max(...open.map((d) => B.costOf(d)));
    const mine = B.units.filter((u) => u.alive && !u.def.strike).length + B.pending.filter((d) => !d.lost).length;
    const aim = B.target;
    if (aim && !B.air?.sorties.some((x) => !x.lift)) {
      const st = strikes.filter((d) => B.isUnlocked(d) && B.money >= B.costOf(d)).sort((x, y) => B.costOf(y) - B.costOf(x))[0];
      if (st && await B.deploy(st.id, aim.clone())) { struck++; return; }
    }
    const buy = open.filter((d) => B.money >= B.costOf(d) && B.costOf(d) >= top * 0.4)
      .sort((x, y) => B.costOf(y) - B.costOf(x))[0];
    if (!buy) return;
    if (mine >= 10) {
      // Full: trade the cheapest unit in for one at least three times its price.
      const cheap = B.units.filter((u) => u.alive && !u.def.strike).sort((x, y) => B.costOf(x.def) - B.costOf(y.def))[0];
      if (!cheap || B.costOf(buy) < B.costOf(cheap.def) * 3) return;
      B.sellUnit(cheap);
    }
    const ring = rings.get(buy.id);
    for (let tries = 0; tries < 10 && ring.length; tries++) {
      const k = cursor.get(buy.id) || 0;
      cursor.set(buy.id, k + 1);
      if (await B.deploy(buy.id, ring[k % ring.length].clone())) break;
    }
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
      const p = (how === 'face' || aimBy === 'face') ? pickFace() : pick();
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
