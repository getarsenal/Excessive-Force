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
  const B = window.battle, T = B.turret, THREE = window.THREE;
  const out = { pos: [T.pos.x.toFixed(0), T.pos.y.toFixed(1), T.pos.z.toFixed(0)], dome: T.domeCentre.y.toFixed(1), yaw0: +T.yaw.toFixed(2) };
  B.unlockAll = true; B.money = 1e6;
  out.placed = window.testMenu.spawnSomewhere('m119', 3, 300);
  out.unitsBefore = B.units.filter(u => u.alive).map(u => Math.round(u.health));
  // Track the slew: yaw after 3 s and 8 s.
  window.__fastForward(3); out.yaw3 = +T.yaw.toFixed(2); out.pitch3 = +T.pitch.toFixed(2);
  window.__fastForward(5); out.yaw8 = +T.yaw.toFixed(2); out.pitch8 = +T.pitch.toFixed(2); out.fired8 = T.fired;
  window.__fastForward(62);
  out.fired = T.fired; out.onTarget = T.onTarget; out.pitch = +T.pitch.toFixed(2);
  // Does the shell leave along the barrel? Compare the last shell's initial velocity direction with the barrel.
  const live = B.projectiles.list.filter(p => p.alive && p.hostile);
  out.hostileAlive = live.length;
  const bd = T.barrelDir();
  if (live.length) { const p = live[live.length-1]; const m = T.muzzle(1); out.lastShellFromMuzzle = +p.pos.distanceTo(m).toFixed(1); }
  out.unitsAfter = B.units.filter(u => u.alive).map(u => Math.round(u.health));
  return out;
});
console.log(JSON.stringify(r)); console.log('errors', JSON.stringify(errors));
await b.close();
