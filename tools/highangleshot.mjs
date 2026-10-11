// The HIGH ANGLE lay on a phone, photographed: a gun (KIND, default m777)
// taken through the real lay, the switch pressed, the plot and CLOSE shot,
// and one round fired. Writes /tmp/out/highangle/<kind>-{direct,plot,close}.png.
//   KIND=m109 node tools/highangleshot.mjs [level=westminster] [port=5177]
import { chromium } from 'playwright';
import fs from 'node:fs';
const level = process.argv[2] || 'westminster', port = process.argv[3] || process.env.TT_PORT || 5177, kind = process.env.KIND || 'm777';
const out = '/tmp/out/highangle';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__lay, null, { timeout: 400000 });
const info = await page.evaluate(async (kind) => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.airlift = false; B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  if (B.garrison) B.garrison.fireEnabled = false;
  const cam = window.__engine.camera.position, bear = Math.atan2(cam.x - o.x, cam.z - o.z);
  let u = null;
  for (let r = 380; r < 700 && !u; r += 40) for (let a = 0.25; a <= 1.2 && !u; a += 0.2) {
    const x = o.x + Math.sin(bear + a) * r, z = o.z + Math.cos(bear + a) * r;
    u = await B.deploy(kind, new T.Vector3(x, window.terrain.heightAt(x, z), z));
  }
  for (let i = 0; i < 40 && u.state !== 'ready'; i++) window.__fastForward(0.5, 1 / 30);
  window.__lay.enter(u);
  return { ok: !!B.lay };
}, kind);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/${kind}-direct.png` });
const btn = await page.$('#lay-wpn');
const vis = btn && await btn.isVisible();
if (vis) await btn.click();
await page.evaluate(() => {
  const B = window.battle, L = B.lay, o = B.primary.origin;
  const yaw = Math.atan2(o.x - L.from.x, o.z - L.from.z);
  B.layTurn(yaw - L.yaw, 0);
  L.rangeWant = Math.hypot(o.x - L.from.x, o.z - L.from.z);
  B.layTurn(0, 0);
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/${kind}-plot.png` });
await page.click('#lay-zoom');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/${kind}-close.png` });
const read = await page.evaluate(() => ({ read: document.getElementById('lay-read')?.textContent, btn: document.getElementById('lay-wpn')?.textContent, zoom: document.getElementById('lay-zoom')?.textContent, hint: document.getElementById('lay-hint')?.textContent }));
console.log(kind, JSON.stringify({ ...info, buttonVisible: vis, ...read }));
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close();
