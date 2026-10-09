// The play recorder (src/ui/playmonitor.js) headless: a battle at the phone's
// tier, RECORD MY PLAY through the test panel with a row every MINUTE seconds
// (default 10), guns placed and fired as a player would, the page reloaded
// mid-session to prove the recording carries across a page load, then STOP &
// SHOW, the session printed and the card photographed.
//   MINUTE=10 node tools/playprobe.mjs [level=westminster]  -> /tmp/out/play-card.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const MINUTE = +(process.env.MINUTE || 10);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: UA });
await ctx.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.dev', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
} catch {} });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
const boot = async () => {
  await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__play, null, { timeout: 400000 });
  await page.waitForTimeout(1500);
};
await boot();
await page.click('#test-btn');
await page.waitForTimeout(300);
await page.evaluate((m) => { window.__play.start({ minute: m }); window.testMenu.toggle(false); }, MINUTE);
console.log('button', await page.evaluate(() => document.getElementById('test-btn').textContent));
// Play: four guns on the tower, as a player would place them.
await page.evaluate(() => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.freeBuild = true;
  B.setTarget(new T.Vector3(o.x, B.originGround + 20, o.z), 'tower');
  let n = 0;
  for (let a = 0; a < 360 && n < 4; a += 30) {
    const x = o.x + Math.cos(a * Math.PI / 180) * 280, z = o.z + Math.sin(a * Math.PI / 180) * 280, p = new T.Vector3(x, window.terrain.heightAt(x, z), z);
    if (B.validPlacement(p, null).ok) { B.deploy('m777', p); n++; }
  }
});
await page.waitForTimeout(MINUTE * 2600);
console.log('before reload', await page.evaluate(() => window.__play.live()));
await boot();   // the next battle: the recording must carry on
console.log('after reload', await page.evaluate(() => ({ running: window.__play.running, live: window.__play.live(), button: document.getElementById('test-btn').textContent })));
await page.waitForTimeout(MINUTE * 1600);
const sum = await page.evaluate(() => { const s = window.__play.stop(); return s; });
console.log('session', JSON.stringify({ wallMin: sum.wallMin, playMin: sum.playMin, battles: sum.battles, levels: sum.levels, perf: sum.perf, battery: sum.battery, activity: sum.activity, gpuTimer: sum.gpuTimer, rows: sum.minutes.length }));
for (const m of sum.minutes) console.log(' ', JSON.stringify(m));
console.log('card', await page.evaluate(() => !!document.getElementById('perf-card')), 'button', await page.evaluate(() => document.getElementById('test-btn').textContent), 'live left', await page.evaluate(() => localStorage.getItem('tt.perflive')));
await page.screenshot({ path: '/tmp/out/play-card.png', timeout: 120000 }).catch(() => {});
console.log('errors', errors.length ? errors : 'none');
await b.close();
