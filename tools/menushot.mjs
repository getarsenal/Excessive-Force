// The title's menu and its nested sheets, at a phone's size or a desktop's:
// the menu, then TODAY, then a row inside it (the back arrow), then MODES.
//   W=393 H=852 node tools/menushot.mjs      -> /tmp/out/menu-393x852-{menu,today,inner,modes}.png
import { chromium } from 'playwright';
const W = +(process.env.W || 393), H = +(process.env.H || 852);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 700, hasTouch: W < 700 });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 120000 });
await page.waitForTimeout(3200);
const shot = (n) => page.screenshot({ path: `/tmp/out/menu-${W}x${H}-${n}.png` });
await shot('menu');
const tiles = await page.$$eval('#title .tt-item', (els) => els.map((e) => e.querySelector('b')?.textContent.trim()));
console.log('rows:', tiles.join(' | '));
await page.click('#title [data-act="today"]'); await page.waitForTimeout(500); await shot('today');
const rows = await page.$$eval('.tt-sheet .tt-row', (els) => els.map((e) => e.querySelector('b')?.textContent.trim()));
console.log('today:', rows.join(' | '));
const first = await page.$('.tt-sheet .tt-row');
if (first) { await first.click(); await page.waitForTimeout(500); await shot('inner'); console.log('back arrow:', !!(await page.$('.tt-sheet .tt-back'))); }
const back = await page.$('.tt-sheet .tt-back'); if (back) { await back.click(); await page.waitForTimeout(400); }
await page.click('.tt-sheet [data-act="close"]'); await page.waitForTimeout(400);
await page.click('#title [data-act="modes"]'); await page.waitForTimeout(500); await shot('modes');
console.log('modes:', (await page.$$eval('.tt-sheet .tt-row', (els) => els.map((e) => e.querySelector('b')?.textContent.trim()))).join(' | '));
await b.close();
