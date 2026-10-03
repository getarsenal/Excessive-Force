// The stand-off and a battle line from the enemy general, photographed, with
// the English subtitle under his own language.
//
//   node tools/dialogshot.mjs <level>   -> /tmp/out/dlg-<level>-standoff.png, -battle.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'giza';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '1'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:5177/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.querySelector('.so-sub.in'), null, { timeout: 400000 }).catch(() => console.log('no standoff sub'));
await page.waitForTimeout(300);
await page.screenshot({ path: `/tmp/out/dlg-${level}-standoff.png` });
await page.evaluate(() => { const s = window.standoff; if (s) s.finish(); });
await page.waitForFunction(() => window.battle && window.__comcard, null, { timeout: 200000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__comcard.last());
await page.waitForFunction(() => document.querySelector('.cc-sub.in'), null, { timeout: 30000 }).catch(() => console.log('no cc sub'));
await page.waitForTimeout(300);
await page.screenshot({ path: `/tmp/out/dlg-${level}-battle.png` });
console.log(await page.evaluate(() => [document.querySelector('.cc-line')?.textContent, document.querySelector('.cc-sub')?.textContent]));
await b.close();
