// Does every gun with a barrel point it where it is aimed? Each barrelled
// kind deployed without the airlift (and, with LIFT=1, through it), laid by
// hand to thirty degrees, the barrel actually drawn read back (near or far
// model); then the crews left to fire on their own at the target for half a
// minute, and the elevation of their last shot set against the drawn
// barrel's. Prints a row a gun; `ok` is whether the drawn barrel is within
// two degrees of where it should be.
//   node tools/barrelcheck.mjs [level=westminster]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1000);
const out = await page.evaluate(async (lift) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = !!lift;
  if (B.garrison) B.garrison.fireEnabled = false;
  const kinds = ['m119', 'm777', 'm109', 'stryker', 'm270', 'm142'];
  let i = 0;
  for (let a = 0; a < 2160 && i < kinds.length; a += 13) {
    const rad = 170 + (a % 150);
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (await B.deploy(kinds[i], p)) i++;
  }
  for (let t = 0; t < 200; t++) {
    window.__fastForward(1, 1 / 30);
    if (t > 10 && !B.pending.length && !B.package && B.units.every((u) => u.state === 'ready' && u.model)) break;
    await new Promise((r) => setTimeout(r, 2));
  }
  window.__frame();
  const angle = (q) => +(2 * Math.acos(Math.min(1, Math.abs(q.w))) * 57.3).toFixed(1);
  const shown = (u) => (u.lodFar && u.barrelLo ? u.barrelLo : u.barrel);
  const rows = {};
  for (const u of B.units) {
    const r = rows[u.def.id] = { barrel: !!u.barrel, far: !!u.barrelLo, state: u.state };
    if (!u.barrel || !B.canLay(u)) continue;
    window.__lay.enter(u);
    B.lay.elev = 30 / 57.3; B.layTurn(0, 0);
    for (let k = 0; k < 6; k++) { window.__fastForward(1 / 30, 1 / 30); }
    window.__frame();
    const want = Math.max(u.barrelB.min, Math.min(u.barrelB.max, B.lay.elev)) - u.barrelB.rest;
    r.lay = { want: +(want * 57.3).toFixed(1), drawn: angle(shown(u).quaternion), lodFar: u.lodFar };
    r.lay.ok = Math.abs(r.lay.drawn - Math.abs(r.lay.want * 1)) < 2;
    window.__lay.exit(); window.__frame();
  }
  // The crews on their own, at the target, half a minute.
  B.setTarget?.(new T.Vector3(o.x, B.originGround + 8, o.z), 'tower');
  const last = new Map();
  for (let t = 0; t < 60; t++) {
    window.__fastForward(0.5, 1 / 30);
    if (t % 20 === 0) window.__frame();
    for (const u of B.units) if (u.barrel && u.recoilT > 0.9) last.set(u, u.barrelElev);
    await new Promise((r) => setTimeout(r, 2));
  }
  for (const u of B.units) {
    if (!u.barrel) continue;
    const r = rows[u.def.id];
    const want = Math.abs(Math.max(u.barrelB.min, Math.min(u.barrelB.max, u.barrelElev)) - u.barrelB.rest);
    r.crew = { fired: last.has(u), shotElev: last.has(u) ? +(last.get(u) * 57.3).toFixed(1) : null, elevNow: +(u.barrelElev * 57.3).toFixed(1),
      drawn: angle(shown(u).quaternion), want: +(want * 57.3).toFixed(1), lodFar: u.lodFar };
    r.crew.ok = Math.abs(r.crew.drawn - r.crew.want) < 2;
  }
  return rows;
}, !!process.env.LIFT);
for (const [k, r] of Object.entries(out)) console.log(k.padEnd(8), JSON.stringify(r));
console.log('errors', JSON.stringify(errors));
await b.close();
