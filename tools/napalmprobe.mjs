// Napalm (src/game/napalm.js) on a level: the F-4 called on a line through
// the landmark's foot, the fight stepped (not drawn) through the run and the
// burn, and what it did read back: canisters down, men burnt, flak pits
// lost, stones melted, the town gutted, the particle fill at its worst and
// the frame's milliseconds. SHOT=1 draws and photographs the burn from the
// level's camera and from close in.
//
//   node tools/napalmprobe.mjs [level] [tier]      -> /tmp/out/napalm/*.png
//   QUIET=1   the garrison holds its fire (and its flak)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const level = process.argv[2] || 'westminster';
const tier = process.argv[3] || 'low';
const port = process.env.TT_PORT || 5177;
const out = '/tmp/out/napalm';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(String(e).slice(0, 300)); console.log('page error:', String(e).slice(0, 300)); });
page.on('crash', () => console.log('page crashed'));
await page.addInitScript((t) => { try {
  localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const quiet = !!process.env.QUIET;
const r0 = await page.evaluate((quiet) => {
  const B = window.battle, T = window.THREE, o = B.primary.origin, cam = window.__engine.camera;
  B.airborne.auto = false; B.assault.auto = false; B.unlockAll = true; B.money = 1e7; B.holdEnd = true;
  if (quiet && B.garrison) { B.garrison.fireEnabled = false; if (B.sams) B.sams._engage = () => {}; }
  const dx = o.x - cam.position.x, dz = o.z - cam.position.z, l = Math.hypot(dx, dz) || 1;
  const from = new T.Vector3(o.x - dx / l * 150, 0, o.z - dz / l * 150);
  const to = new T.Vector3(o.x + dx / l * 90, 0, o.z + dz / l * 90);
  const aa = () => B.garrison.defenders.filter((d) => d.alive && d.def.air === 'all').length;
  const alive = () => B.garrison.defenders.filter((d) => d.alive).length;
  const stones = () => B.structures.reduce((n, s) => n + s.destroyedCount, 0);
  window.__np = { aa, alive, stones, gutted: () => B.cityFire?.burnt ?? B.cityFire?.gutted?.size ?? null };
  const s = B.callStrike('napalm', from, { to });
  return { called: !!s, aa: aa(), men: alive(), stones: stones(), drops: s?.napalm?.drops.map((d) => +d.t.toFixed(2)), alt: Math.round(s?.alt || 0), from: [Math.round(from.x), Math.round(from.z)], to: [Math.round(to.x), Math.round(to.z)] };
}, quiet);
console.log('called', JSON.stringify(r0));
let worstFill = 0, lastBurns = 0;
const t0 = Date.now();
for (let sec = 0; sec < 60; sec++) {
  const r = await page.evaluate(() => {
    window.__fastForward(1, 1 / 30);
    const B = window.battle, N = B.napalm;
    window.__engine.camera.updateMatrixWorld();
    B.fx._govern();
    return { burns: N.burns.length, hot: N.burns.filter((b) => !b.done).length, killed: N.burns.reduce((n, b) => n + b.killed, 0),
      melted: N.burns.reduce((n, b) => n + b.melted, 0), flames: N.flames.g.instanceCount, fill: +(B.fx.fillNow || 0).toFixed(1),
      glow: +N.glow.toFixed(2), aa: window.__np.aa(), men: window.__np.alive(), stones: window.__np.stones() };
  });
  worstFill = Math.max(worstFill, r.fill);
  if (sec % 4 === 0 || r.burns !== lastBurns) console.log(`t+${sec + 1}s`, JSON.stringify(r));
  lastBurns = r.burns;
  if (process.env.SHOT && r.burns >= 2 && !globalThis.__shot && (globalThis.__shot = true)) {
    // Drawn: the level's own view, then close in on the line.
    await page.evaluate(() => { window.__frame(); window.__frame(); });
    await page.screenshot({ path: `${out}/${level}-wide.png`, timeout: 180000 });
    await page.evaluate(() => {
      const B = window.battle, R = window.__rig, b = B.napalm.burns[1] || B.napalm.burns[0];
      if (!b) return;
      R.target.set(b.a.x + b.dx * 40, b.a.y + 6, b.a.z + b.dz * 40); R.desiredTarget.copy(R.target);
      R.distance = R.desiredDistance = 110; R.pitch = R.desiredPitch = 0.22;
      R.yaw = R.desiredYaw = Math.atan2(-b.dz, b.dx);
      window.__frame(); window.__frame();
    });
    await page.screenshot({ path: `${out}/${level}-close.png`, timeout: 180000 });
    // The frame's cost with the fire up, drawn.
    const ms = await page.evaluate(() => { const t = performance.now(); for (let k = 0; k < 4; k++) window.__frame(); return (performance.now() - t) / 4; });
    console.log('drawn frame with the fire up (software)', ms.toFixed(0), 'ms');
  }
  if (r.burns > 0) globalThis.__seen = true;
  if (globalThis.__seen && r.burns === 0) break;
}
const r1 = await page.evaluate(() => ({ aa: window.__np.aa(), men: window.__np.alive(), stones: window.__np.stones() }));
console.log(JSON.stringify({ level, tier, aaLost: r0.aa - r1.aa, menLost: r0.men - r1.men, stonesDown: r1.stones - r0.stones, worstFill, wall: ((Date.now() - t0) / 1000).toFixed(0) + ' s', errors }));
await b.close();
