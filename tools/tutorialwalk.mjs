// Boot Camp, walked the way a new player walks it: fresh storage, the front
// door, GOT IT and the real taps on the pulsing rings, a screenshot per step
// and the step each one landed on. Run it after any change to the HUD; a
// step that stops advancing is a tutorial that has fallen behind the game.
//
//   node tools/tutorialwalk.mjs [/tmp/tut]      (dev server on 5177)
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/tut';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); } catch {} });
await page.goto('http://localhost:5177/', { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && !document.getElementById('ui').hidden, null, { timeout: 400000 });
await page.waitForTimeout(3000);
const shot = async (n) => { await page.screenshot({ path: `${out}-${n}.png` }); console.log('shot', n, await page.evaluate(() => document.querySelector('.tut-title')?.textContent + ' | ' + document.querySelector('.tut-count')?.textContent)); };
await shot('0-general'); await hush(); await page.waitForTimeout(300); await shot(1);
// The General has the floor first; CARRY ON, then the step.
const hush = async () => { if (await page.evaluate(() => !document.querySelector('.tut-gen').hidden)) { await page.click('.tut-gen-ok'); await page.waitForTimeout(300); } };
const ok = async () => { await hush(); await page.click('.tut-ok'); };
await ok(); await page.waitForTimeout(400); await shot(2);           // look around
await ok(); await page.waitForTimeout(400); await ok();                // funds
await page.waitForTimeout(400); await shot(3);                         // units
await hush(); await page.click('#dock-units'); await page.waitForTimeout(600); await shot(4);

await hush(); await page.click('#buildbar .unit-card[data-id="m119"]'); await page.waitForTimeout(300); await hush(); await page.waitForTimeout(600); await shot(5);
// Deploy where the ring is, then designate the tower where its ring is.
const ringAt = async () => page.evaluate(() => { const r = document.querySelector('.tut-ring').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
console.log('deploy spot', await page.evaluate(() => { const t = window.__tutorial, b = window.battle; const p = t.groundAt.clone(); p.y = window.terrain.heightAt(p.x, p.z); return JSON.stringify({ at: [p.x.toFixed(0), p.z.toFixed(0)], ok: b.validPlacement(p, null), sel: b.selectedUnitId, ring: [...document.querySelectorAll('.tut-ring')].map((r) => r.getBoundingClientRect().y.toFixed(0)) }); }));
await hush(); let [x, y] = await ringAt(); await page.mouse.click(x, y); await page.waitForTimeout(1500); await shot(6);
// The airlift: the package window, then the aircraft, then the gun on the ground.
const title = () => page.evaluate(() => document.querySelector('.tut-title')?.textContent);
let seen = new Set();
for (let k = 0; k < 120 && (await title()) !== 'DESIGNATE'; k++) {
  const t = await title();
  if (!seen.has(t)) { seen.add(t); await shot(`6-${t.toLowerCase().replace(/ /g, '-')}`); }
  await hush();
  if (t === 'A BATTERY') {
    // Press on the solid ring, drag to the dashed one, let go.
    const [a, b2] = await page.evaluate(() => [...document.querySelectorAll('.tut-ring')].map((r) => { const q = r.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; }));
    await page.mouse.move(a[0], a[1]); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(a[0] + (b2[0] - a[0]) * i / 12, a[1] + (b2[1] - a[1]) * i / 12); await page.waitForTimeout(80); }
    await page.mouse.up(); await page.waitForTimeout(800);
    console.log('battery: units+pending', await page.evaluate(() => { const b = window.__battle || null; return document.getElementById('hud-units').textContent; }));
  }
  // Headless runs a frame a second; move game time on so the lift flies.
  await page.evaluate(() => window.__fastForward && window.__fastForward(2));
  await page.waitForTimeout(300);
}
await shot('7-designate');
await hush(); [x, y] = await ringAt(); await page.mouse.click(x, y); await page.waitForTimeout(1500); await shot(8);
console.log('level', await page.evaluate(() => location.search), 'money', await page.evaluate(() => document.getElementById('hud-money').textContent));
await b.close();
