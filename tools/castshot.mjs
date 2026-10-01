// A level's stand-off with its officer, and the units drawer with its cards:
// for checking a new portrait or a new card icon where the player meets it.
//
//   node tools/castshot.mjs [level=saintsava]   -> /tmp/out/cast-<level>-standoff.png, /tmp/out/cast-drawer.png
import { chromium } from 'playwright';
const [level = 'saintsava'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const prep = (s) => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
} catch {} };
{
  const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.addInitScript(prep, { 'tt.autostart': '1', 'tt.intros': '1' });
  await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
  await page.waitForTimeout(6000);
  // Buck has the first line; a tap brings on the other side.
  for (let k = 0; k < +(process.env.TAPS || 2); k++) { await page.mouse.click(500, 560); await page.waitForTimeout(2500); }
  await page.screenshot({ path: `/tmp/out/cast-${level}-standoff.png`, timeout: 180000 });
  await page.close();
}
{
  const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
  await page.addInitScript(prep, { 'tt.autostart': '1', 'tt.intros': '0', 'tt.suite': '1' });
  await page.goto(`http://localhost:${port}/?level=westminster`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  await page.evaluate(() => document.getElementById('dock-units')?.click());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/out/cast-drawer.png', timeout: 180000 });
  await page.close();
}
await b.close();
console.log('done');
