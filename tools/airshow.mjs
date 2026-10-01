// The air's small things, photographed: a strike called on the monument
// (marker smoke, the pod's picture in the corner), the jet on its run, and
// a burst of flares out of it.
//
//   node tools/airshow.mjs [level=westminster] [id=f15] [phone]
//     -> /tmp/out/airshow-<level>-<n>.png
import { chromium } from 'playwright';
const [level = 'westminster', id = 'f15', phone] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage(phone
  ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1100, height: 680 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const shots = [];
const snap = async (tag) => { const f = `/tmp/out/airshow-${level}-${tag}.png`; await page.screenshot({ path: f, timeout: 180000 }); shots.push(f); };
const info = await page.evaluate((id) => {
  const B = window.battle, ff = window.__fastForward;
  B.unlockAll = true; B.freeBuild = true; B.airborne.auto = false; B.garrison.fireEnabled = false;
  ff(1);
  const o = B.primary.origin;
  const aim = o.clone(); aim.y = B.primary.groundY + 20;
  const s = B.callStrike(id, aim);
  window.__s = s;
  return { eta: s && (s.releaseAt + s.fall) };
}, id);
console.log(JSON.stringify(info));
await page.evaluate(() => window.__fastForward(4, 1 / 30));
await page.waitForTimeout(800);
await snap('1-smoke-pod');
// The jet near release, the camera on it, flares out.
await page.evaluate(() => {
  const s = window.__s, B = window.battle, r = window.rig, ff = window.__fastForward;
  const left = Math.max(0, s.releaseAt - s.t - 1.5);
  ff(left, 1 / 30);
  B.air._popFlares(s);
  ff(0.9, 1 / 30);
  const p = s.model.position;
  r.target.set(p.x, p.y - 20, p.z); r.desiredTarget.copy(r.target);
  r.distance = r.desiredDistance = 260; r.pitch = r.desiredPitch = -0.05;
  for (let k = 0; k < 30; k++) r.update(0.1);
});
await page.waitForTimeout(600);
await snap('2-flares');
await page.evaluate(() => { window.__fastForward(1.6, 1 / 30); for (let k = 0; k < 4; k++) window.rig.update(0.1); });
await page.waitForTimeout(400);
await snap('3-flares-later');
console.log(shots.join('\n'));
await b.close();
