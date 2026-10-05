// The title screen and a crew's line in battle, at phone size.
//   node tools/titleshot.mjs   -> /tmp/out/title-phone.png, /tmp/out/bark-phone.png
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done');
  localStorage.setItem('tt.progress', JSON.stringify({ westminster: { runs: 1, won: true } }));
  localStorage.setItem('tt.ops', JSON.stringify({ stars: { westminster: 7 } }));
  localStorage.setItem('tt.career', JSON.stringify({ xp: 4000, crates: 2, counts: {}, medals: {}, places: {}, orders: {}, perks: {} }));
} catch {} });
if (!process.env.SKIP_TITLE) {
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/out/title-phone.png' });
console.log(JSON.stringify(await page.$$eval('#title .tt-item', (a) => a.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))));
}
await page.goto(`http://localhost:${port}/?level=westminster`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.airborne.auto = false; B.assault.auto = false;
  for (let k = 0; k < 60; k++) {
    const a = k * 0.4, q = new T.Vector3(o.x + Math.sin(a) * 150, 0, o.z + Math.cos(a) * 150);
    q.y = B.terrain.heightAt(q.x, q.z);
    if (B.validPlacement(q).ok && await B.deploy('m119', q)) break;
  }
  for (let k = 0; k < 400 && !B.units.some((x) => x.alive); k++) window.__fastForward(0.1, 0.1);
  const u = B.units.find((x) => x.alive);
  if (u) { const R = window.rig; R.target.copy(u.pos); R.desiredTarget.copy(u.pos); R.distance = R.desiredDistance = 60; R.pitch = R.desiredPitch = 0.5; for (let k = 0; k < 20; k++) R.update(0.1); }
  const bk = window.__barks; bk.quiet = 0; bk.cool = {}; bk.say('unitlost', u);
  for (let k = 0; k < 3; k++) window.__frame();
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/out/bark-phone.png' });
console.log(await page.evaluate(() => ({ units: window.battle.units.length, alive: window.battle.units.filter((u) => u.alive).length })));
console.log(await page.evaluate(() => { const e = document.querySelector('.bark'); return e ? `${e.hidden} ${e.innerText.replace(/\s+/g, ' ')}` : 'no bark'; }));
await b.close();
