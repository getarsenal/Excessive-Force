// The town from a pedestrian's height: close, oblique shots of the city
// blocks a level built, for finding the faults a top-down view hides — a
// roof that does not sit on its walls, plant standing off a roof, a street
// laid over another or over a house, a channel through a block.
//
//   node tools/cityclose.mjs <level> [out=/tmp/out/close] [n=8] [tier=medium] [seed=1]
//
// Writes <out>/<level>-<k>.png, one per sampled plot, and prints what each
// shot is of. Plots are picked spread across the town: pitched and flat,
// near the water, near a junction.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [level = 'westminster', out = '/tmp/out/close', nArg = '8', tier = 'medium', seedArg = '1'] = process.argv.slice(2);
const n = Number(nArg), seed = Number(seedArg);
mkdirSync(out, { recursive: true });
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)));
await page.addInitScript((t) => { try {
  localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.cityGroup, null, { timeout: 400000 });
await page.evaluate(() => { window.hud?.setClearView?.(true); if (window.battle) window.battle.airborne.auto = false; });
const picks = await page.evaluate(([n, seed]) => {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const T = window.terrain, plots = (window.cityGroup.userData.plots || []).filter((p) => Math.hypot(p.x, p.z) < T.span * 0.9);
  const wet = (p) => { for (const a of [0, 1.6, 3.1, 4.7]) if (T.isWater(p.x + Math.cos(a) * 40, p.z + Math.sin(a) * 40)) return true; return false; };
  const pitched = plots.filter((p) => p.pitched), flat = plots.filter((p) => !p.pitched), shore = plots.filter(wet);
  const out = [];
  const take = (arr, why) => { if (!arr.length) return; const p = arr[Math.floor(rnd() * arr.length)]; out.push({ x: p.x, z: p.z, top: p.top, base: p.base, w: p.w, d: p.d, why, yaw: rnd() * Math.PI * 2 }); };
  for (let i = 0; i < n; i++) take(i % 3 === 0 ? pitched : i % 3 === 1 ? flat : (shore.length ? shore : flat), i % 3 === 0 ? 'pitched' : i % 3 === 1 ? 'flat' : 'shore');
  return out;
}, [n, seed]);
let k = 0;
for (const p of picks) {
  await page.evaluate((p) => {
    const r = window.rig;
    r.target.set(p.x, (p.top + p.base) / 2, p.z); r.desiredTarget.copy(r.target);
    r.yaw = r.desiredYaw = p.yaw; r.pitch = r.desiredPitch = 0.42;
    r.distance = r.desiredDistance = Math.max(55, Math.max(p.w, p.d) * 2.6);
  }, p);
  await page.waitForTimeout(2600);
  const file = `${out}/${level}-${k}.png`;
  await page.screenshot({ path: file, timeout: 120000 }).catch(() => {});
  console.log(`${file}  ${p.why} at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) ${p.w.toFixed(0)}x${p.d.toFixed(0)} top ${(p.top - p.base).toFixed(0)} m`);
  k++;
}
await b.close();
