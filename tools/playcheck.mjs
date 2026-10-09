// A battle played the way the player plays it, on a phone tier: every ground
// unit deployed through the real path (the airlift included), waited for
// until it is on the ground and ready, each gun with a barrel laid to thirty
// degrees and its shown barrel read back, then every fixed-wing strike called
// on the target and its detonations, stone taken and fate counted. Every page
// error and frame fault is printed with the step it happened in.
//   node tools/playcheck.mjs [level=windsor] [tier=low]
import { chromium } from 'playwright';
const level = process.argv[2] || 'windsor', tier = process.argv[3] || 'low';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
let step = 'load';
const errors = [];
page.on('crash', () => { console.log(`PAGE CRASHED during ${step}`); });
page.on('pageerror', (e) => errors.push(`[${step}] ${String(e.stack || e).slice(0, 400)}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('ERR_CERT') && !t.includes('Failed to load resource')) errors.push(`[${step}] ${t.slice(0, 400)}`);
  if (t.startsWith('[check]')) console.log(t);
});
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
// Errors caught by the frame loop are logged with their stack; the stack is
// what says where.
await page.evaluate(() => {
  const ce = console.error.bind(console);
  console.error = (...a) => { ce(...a.map((x) => (x instanceof Error ? `${x.message} @ ${(x.stack || '').split('\n').slice(1, 4).join(' | ')}` : x))); };
});

step = 'deploy';
const dep = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  if (B.garrison) B.garrison.fireEnabled = false;
  const kinds = ['m240', 'at4', 'gustaf', 'rpg32', 'm120', 'javelin', 'm119', 'm777', 'stryker', 'm270', 'm109', 'm142'];
  let i = 0;
  for (let a = 0; a < 1440 && i < kinds.length; a += 11) {
    const rad = 150 + (a % 120);
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    const n0 = B.units.length + B.pending.length + (B.lift?.drops?.length || 0);
    B.deploy(kinds[i], p);
    i++;
  }
  // Until everything ordered is on the ground and ready.
  let t = 0;
  for (; t < 240; t += 1) {
    window.__fastForward(1, 1 / 30); window.__frame();
    await new Promise((r) => setTimeout(r, 2));
    const ready = B.units.filter((u) => u.alive && u.state === 'ready').length;
    if (ready >= kinds.length && !B.pending.length) break;
  }
  return { ordered: i, t, units: B.units.map((u) => `${u.def.id}:${u.state}${u.airDropped || u.drop ? '(air)' : ''}`).join(' '), pending: B.pending.length, airlift: !!B.airlift };
});
console.log('deploy', JSON.stringify(dep));

step = 'lay';
const lay = await page.evaluate(async () => {
  const B = window.battle;
  const out = [];
  for (const u of B.units) {
    if (!u.def.barrel) continue;
    const r = { id: u.def.id, barrel: !!u.barrel, barrelLo: !!u.barrelLo, model: !!u.model };
    if (!u.barrel || !B.canLay(u)) { r.canLay = B.canLay?.(u); out.push(r); continue; }
    window.__lay.enter(u);
    B.layTurn(0.4, 0.5);
    for (let k = 0; k < 10; k++) { window.__fastForward(1 / 30, 1 / 30); window.__frame(); }
    const shown = u.lodFar && u.barrelLo ? u.barrelLo : u.barrel;
    const ang = 2 * Math.acos(Math.min(1, Math.abs(shown.quaternion.w)));
    r.elev = +(B.lay.elev * 57.3).toFixed(1);
    r.barrelElev = +(u.barrelElev * 57.3).toFixed(1);
    r.shownRot = +(ang * 57.3).toFixed(1);
    r.rest = +(u.barrelB.rest * 57.3).toFixed(1);
    r.lodFar = u.lodFar; r.nearVis = u.model.visible; r.farVis = u.modelLo?.visible;
    r.yawOk = Math.abs(((u.group.rotation.y - B.lay.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.05;
    window.__lay.exit(); window.__frame();
    out.push(r);
  }
  return out;
});
for (const r of lay) console.log('lay', JSON.stringify(r));

step = 'strikes';
const strikes = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  const out = [];
  const fx = B.fx;
  let det = 0, blasts = 0;
  const d0 = fx.detonate.bind(fx), s0 = fx.strikeBlast.bind(fx);
  fx.detonate = (...a) => { det++; return d0(...a); };
  fx.strikeBlast = (...a) => { blasts++; return s0(...a); };
  const stones = () => B.structures.reduce((n, s) => n + (s.destroyedCount ?? s.stats?.destroyed ?? 0), 0);
  for (const id of ['f15', 'a10', 'gbu28', 'b1', 'tomahawk']) {
    det = 0; blasts = 0;
    const before = B.primary.aliveCount ?? null;
    const target = new T.Vector3(o.x, B.originGround + 8, o.z);
    const s = B.callStrike(id, target);
    let t = 0, lost = null;
    for (; t < 60; t += 0.5) {
      window.__fastForward(0.5, 1 / 30); if ((t * 2) % 4 === 0) window.__frame();
      await new Promise((r) => setTimeout(r, 2));
      if (s && !B.air.sorties.includes(s)) break;
    }
    out.push({ id, called: !!s, t, detonate: det, strikeBlast: blasts, downed: s?.downed || s?.shotDown || false, aborted: s?.aborted || false,
      left: B.air.sorties.length, aliveBefore: before, aliveAfter: B.primary.aliveCount ?? null });
  }
  return out;
});
for (const r of strikes) console.log('strike', JSON.stringify(r));
console.log('errors', errors.length);
for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ', e);
await b.close();
