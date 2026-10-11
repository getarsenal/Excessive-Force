// Boot Camp, walked the way a new player walks it: fresh storage, the front
// door, GOT IT and the real taps on the pulsing rings, a screenshot per step
// and the step each one landed on. Run it after any change to the HUD; a
// step that stops advancing is a tutorial that has fallen behind the game.
//
//   node tools/tutorialwalk.mjs [/tmp/tut]      (dev server on 5177; TT_PORT= for another)
//   W=393 H=852 OPENER=1 node tools/tutorialwalk.mjs /tmp/tutp   the first shot on a phone
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/tut';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
// W=393 H=852 for a phone held upright (touch, mobile); OPENER=1 stops after the first shot.
const W = +(process.env.W || 1280), H = +(process.env.H || 720), phone = W < 600;
const page = await b.newPage({ viewport: { width: W, height: H }, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && !document.getElementById('ui').hidden, null, { timeout: 400000 });
await page.waitForTimeout(3000);
const shot = async (n) => { await page.screenshot({ path: `${out}-${n}.png` }); console.log('shot', n, await page.evaluate(() => document.querySelector('.tut-title')?.textContent + ' | ' + document.querySelector('.tut-count')?.textContent)); };
await shot('0-general');
// The General has the floor first; CARRY ON, then the step.
const hush = async () => { if (await page.evaluate(() => { const t = window.__tutorial; if (t && t.talking) { t.hush(); return true; } return false; })) await page.waitForTimeout(300); };
const ok = async () => { await hush(); await page.click('.tut-ok'); };
await hush(); await page.waitForTimeout(300); await shot(1);
// The first shot: a tap on the smokestack's foot, and the game seconds and
// stone it takes to bring it down, before any lesson.
const ringAt0 = async () => page.evaluate(() => { const r = document.querySelector('.tut-ring').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const title0 = () => page.evaluate(() => document.querySelector('.tut-title')?.textContent);
if ((await title0()) === 'FIRE') {
  await hush();
  const g0 = await page.evaluate(() => window.battle.elapsed);
  const [fx, fy] = await ringAt0(); await page.mouse.click(fx, fy);
  console.log('first shot: target', await page.evaluate(() => window.battle.targetLabel), 'guns', await page.evaluate(() => window.__tutorial.battery.length));
  for (let k = 0; k < 80 && (await title0()) !== 'TARGET'; k++) {
    await page.evaluate(() => window.__fastForward && window.__fastForward(0.5));
    await page.waitForTimeout(150);
    if (k === 8) await shot('1-splash');
    await hush();
  }
  console.log('first shot: stack up', await page.evaluate(() => window.__tutorial._stackUp().toFixed(2)),
    'after', (await page.evaluate(() => window.battle.elapsed) - g0).toFixed(1), 'game s; step', await title0());
  await hush(); await shot('1-target');
}
if (process.env.OPENER) { await b.close(); process.exit(0); }
// Orientation: GOT IT where there is one, and the orbit and the zoom done
// through the camera's own controls where the step wants the gesture.
const advance = async () => {
  await hush();
  const t = await title0();
  if (t === 'LOOK AROUND') await page.evaluate(() => { window.__tutorial.rig.desiredYaw += 0.7; });
  else if (t === 'ZOOM') await page.evaluate(() => { window.__tutorial.rig.desiredDistance *= 1.3; });
  else await ok();
  for (let k = 0; k < 30 && (await title0()) === t; k++) { await page.evaluate(() => window.__fastForward && window.__fastForward(0.2)); await page.waitForTimeout(150); await hush(); }
};
await advance(); await page.waitForTimeout(400); await shot(2);      // target -> look around
for (let k = 0; k < 4 && (await title0()) !== 'UNITS'; k++) await advance();
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
