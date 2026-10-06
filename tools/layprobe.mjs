// The player on a gun, on a phone: an M777 put down near the tower, LAY from
// its card, a drag to re-lay it, FIRE, the round followed to its impact, and
// DONE. Prints the lay state at each step and the control boxes.
//   node tools/layprobe.mjs [level=westminster]  -> /tmp/out/lay-{card,laid,after}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const W = +(process.env.W || 393), H = +(process.env.H || 852);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1');
} catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const box = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }, sel);
const placed = await page.evaluate(() => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;   // the probe is about the lay, not the garrison
  const o = B.primary.origin;
  B.setTarget(new T.Vector3(o.x, B.originGround + 25, o.z), 'tower');
  // A gun with a line to the tower: candidates round it, each tried on the
  // stand until the first lay reaches the stone (a gun under a tall block
  // is BLOCKED, correctly, and no use to the probe).
  const tried = [];
  for (const rad of [300, 340, 380, 420]) for (let a = 0; a < 360; a += 30) {
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    const before = B.units.length + B.pending.length;
    B.deploy('m777', p);
    if (B.units.length + B.pending.length <= before) continue;
    for (let k = 0; k < 60 && !B.units.some((u) => u.alive && u.state === 'ready'); k++) window.__fastForward(1, 1 / 30);
    const u = B.units.find((q) => q.alive);
    if (!u) continue;
    B.startLay(u);
    const ok = B.lay && B.lay.masonry;
    tried.push([x.toFixed(0), z.toFixed(0), ok ? 'stone' : B.lay?.blocked ? 'blocked' : 'miss']);
    B.endLay();
    if (ok) return tried;
    B.removeUnit(u);
  }
  return tried;
});
const unit = await page.evaluate(() => { const B = window.battle; const u = B.units.find((x) => x.alive); return u ? { def: u.def.id, state: u.state, canLay: B.canLay(u) } : null; });
await page.evaluate(() => { const B = window.battle; const u = B.units.find((x) => x.alive); window.unitCard.show(u); });
await page.waitForTimeout(400);
const cardLay = await box('#uc2-lay');
await page.screenshot({ path: '/tmp/out/lay-card.png' });
await page.click('#uc2-lay');
await page.waitForTimeout(2500);
const laid0 = await page.evaluate(() => { const L = window.battle.lay; const R = window.rig; const proj = (v) => { const q = v.clone().project(R.camera); return [Math.round((q.x + 1) / 2 * innerWidth), Math.round((1 - q.y) / 2 * innerHeight)]; }; const cam = R.camera, T = window.terrain; return L && { eye: { offGun: +cam.position.distanceTo(L.unit.pos).toFixed(1), above: +(cam.position.y - T.heightAt(cam.position.x, cam.position.z)).toFixed(2), near: cam.near, fov: cam.fov }, gunPx: proj(L.unit.pos), muzzlePx: proj(L.from), impactPx: proj(L.impact), apexPx: proj(L.pts.reduce((a, q) => (q.y > a.y ? q : a), L.pts[0])), yaw: +L.yaw.toFixed(3), elev: +L.elev.toFixed(3), range: Math.round(L.range), masonry: L.masonry, hit: L.hit, held: L.unit.handHeld, rigOff: !window.rig.enabled, laying: document.body.classList.contains('laying'), read: document.getElementById('lay-read').textContent }; });
// A drag on the canvas: left 60 px, up 30 px.
const cv = await (await page.$('canvas')).boundingBox();
const cx = cv.x + cv.width * 0.5, cy = cv.y + cv.height * 0.45;
await page.evaluate(([x, y]) => { const c = document.querySelector('canvas'); c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, clientX: x, clientY: y, bubbles: true, isPrimary: true, pointerType: 'touch' })); }, [cx, cy]);
for (let i = 1; i <= 6; i++) await page.evaluate(([x, y]) => { const c = document.querySelector('canvas'); c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, clientX: x, clientY: y, bubbles: true, isPrimary: true, pointerType: 'touch' })); }, [cx - i * 10, cy - i * 5]);
await page.evaluate(([x, y]) => { const c = document.querySelector('canvas'); c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, clientX: x, clientY: y, bubbles: true, isPrimary: true, pointerType: 'touch' })); }, [cx - 60, cy - 30]);
await page.waitForTimeout(300);
const laid1 = await page.evaluate(() => { const L = window.battle.lay; return L && { yaw: +L.yaw.toFixed(3), elev: +L.elev.toFixed(3), range: Math.round(L.range), masonry: L.masonry }; });
// Back onto the stone for the shot, then fire.
await page.evaluate(() => { const B = window.battle, L = B.lay, u = L.unit; const o = B.primary.origin; const from = u.pos; const yaw = Math.atan2(o.x - from.x, o.z - from.z); B.layTurn(yaw - L.yaw, 0); let n = 0; while (n++ < 60 && !(L.masonry && L.impact.y > B.originGround + 18)) B.layTurn(0, 0.01); });
await page.waitForTimeout(4500);
const laid2 = await page.evaluate(() => { const L = window.battle.lay; return { range: Math.round(L.range), masonry: L.masonry, elev: +L.elev.toFixed(3), ready: document.getElementById('lay-fire').classList.contains('ready'), fireBox: (() => { const r = document.getElementById('lay-fire').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })(), doneBox: (() => { const r = document.getElementById('lay-done').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })() }; });
await page.screenshot({ path: '/tmp/out/lay-laid.png' });
const fired = await page.evaluate(() => {
  const B = window.battle; const ev = []; const f = B.onEvent; B.onEvent = (k, d) => { if (k === 'handshot' || k === 'handhit') ev.push({ k, destroyed: d.destroyed, killed: d.killed, bonus: d.bonus }); return f.call(B, k, d); };
  const m0 = B.money;
  for (let k = 0; k < 40 && B.lay.unit.cooldown > 0; k++) window.__fastForward(0.5, 1 / 30);
  // Where the line says the round lands, against where it does.
  B._layArc();
  const pred = B.lay.impact.clone(), predMasonry = B.lay.masonry, predRange = Math.round(B.lay.range);
  const impacts = [];
  const oi = B._onImpact.bind(B);
  B._onImpact = (hit) => { if (hit.proj.hand) impacts.push({ at: [hit.point.x, hit.point.y, hit.point.z].map((v) => +v.toFixed(1)), structureHit: hit.structureHit, owner: hit.owner ? (hit.owner.def ? hit.owner.def.id : 'stone/other') : null, offPred: +hit.point.distanceTo(pred).toFixed(1) }); return oi(hit); };
  document.getElementById('lay-fire').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 }));
  const shots = B.handShots, inFlight = B.projectiles.list.filter((p) => p.hand).length, cooldown = +B.lay.unit.cooldown.toFixed(1);
  window.__frame();
  const fireBtn = document.getElementById('lay-fire');
  const clock0 = { text: fireBtn.textContent, p: fireBtn.style.getPropertyValue('--p'), ready: fireBtn.classList.contains('ready'), total: B.lay.reloadTotal, read: document.getElementById('lay-read').textContent };
  window.__fastForward(3, 1 / 30); window.__frame();
  const clock1 = { text: fireBtn.textContent, p: fireBtn.style.getPropertyValue('--p'), ready: fireBtn.classList.contains('ready') };
  for (let k = 0; k < 16 && !ev.some((e) => e.k === 'handhit'); k++) window.__fastForward(1, 1 / 30);
  B.onEvent = f; B._onImpact = oi;
  return { shots, inFlight, cooldown, clock0, clock1, ev, pred: { at: [pred.x, pred.y, pred.z].map((v) => +v.toFixed(1)), masonry: predMasonry, range: predRange }, impacts, money: B.money - m0, stamp: [...document.querySelectorAll('.stamp')].map((e) => e.textContent).filter(Boolean) };
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/out/lay-after.png' });
const before = await page.evaluate(() => ({ lay: !!window.battle.lay, hidden: document.getElementById('lay').hidden, state: window.battle.state, alive: window.battle.units.filter((u) => u.alive).length }));
await page.evaluate(() => document.getElementById('lay-done').click());
await page.waitForTimeout(300);
const done = await page.evaluate(() => ({ lay: !!window.battle.lay, laying: document.body.classList.contains('laying'), rigOn: window.rig.enabled, held: window.battle.units.find((u) => u.alive)?.handHeld, hidden: document.getElementById('lay').hidden }));
console.log(JSON.stringify({ placed, unit, cardLay, laid0, laid1, laid2, fired, before, done, errors }, null, 1));
await b.close();
