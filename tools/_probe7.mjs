import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality','low'); localStorage.setItem('tt.autostart','1'); localStorage.setItem('tt.intros','0'); localStorage.setItem('tt.opening','0'); } catch {} });
await page.goto(`http://localhost:5177/?level=rio`, { waitUntil:'load', timeout:300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout:400000 });
const r = await page.evaluate(() => {
  const B = window.battle, T = B.turret;
  const out = {};
  B.unlockAll = true; B.money = 1e6;
  window.testMenu.spawnSomewhere('m119', 3, 300);
  const units = B.units.filter(u => u.alive).map(u => [Math.round(u.pos.x), Math.round(u.pos.y), Math.round(u.pos.z)]);
  out.units = units; out.turret = [Math.round(T.pos.x), Math.round(T.pos.y), Math.round(T.pos.z)];
  const hits = [];
  const orig = B._onImpact.bind(B);
  B._onImpact = (h) => { if (h.proj.hostile) hits.push({ p: [Math.round(h.point.x), Math.round(h.point.y), Math.round(h.point.z)], struct: h.structureHit, owner: h.owner === T ? 'turret' : (h.owner ? 'other' : null), age: +h.proj.age.toFixed(1) }); return orig(h); };
  const log = [];
  let lastFired = 0;
  for (let t = 0; t < 40; t += 0.5) {
    window.__fastForward(0.5);
    if (T.fired > lastFired) { lastFired = T.fired; const p = B.projectiles.list.filter(q => q.alive && q.hostile).pop(); if (p) log.push({ t, pos: [Math.round(p.pos.x), Math.round(p.pos.y), Math.round(p.pos.z)], vel: [Math.round(p.vel.x), Math.round(p.vel.y), Math.round(p.vel.z)], muzzle: T.muzzle(1).toArray().map(v => Math.round(v)), speed: Math.round(T._speed || 0), pitch: +T.pitch.toFixed(2) }); }
  }
  out.fired = T.fired; out.shots = log.slice(0, 3); out.hits = hits.slice(0, 8); out.target = T.target && [Math.round(T.target.pos.x), Math.round(T.target.pos.y), Math.round(T.target.pos.z)];
  return out;
});
console.log(JSON.stringify(r)); console.log('errors', JSON.stringify(errors));
await b.close();
