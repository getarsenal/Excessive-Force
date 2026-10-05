// The hangar sheet on a phone: open it from the title, turn through the
// fleet, pick a piece of nose art, and check the choice is kept.
//   node tools/hangarprobe.mjs  -> /tmp/out/hangar-phone.png, /tmp/out/hangar-phone-2.png
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const W = +(process.env.W || 393), H = +(process.env.H || 852);
const page = await b.newPage({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
  const won = ['westminster','paris','pisa','agra','giza','chichen','athens','istanbul','sydney','rio','moscow','cologne'];
  localStorage.setItem('tt.progress', JSON.stringify(Object.fromEntries(won.map((id) => [id, { runs: 1, won: true }]))));
  localStorage.setItem('tt.ops', JSON.stringify({ stars: Object.fromEntries(won.map((id) => [id, 7])) }));
} catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 120000 });
await page.waitForTimeout(2500);
await page.click('#title [data-act="hangar"]');
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/out/hangar-phone.png' });
const r1 = await page.evaluate(() => ({ chips: document.querySelectorAll('.hg-chip').length, pieces: document.querySelectorAll('.hg-piece').length, canvas: [document.querySelector('.hg-canvas')?.width, document.querySelector('.hg-canvas')?.height], name: document.querySelector('.hg-name b')?.textContent }));
await page.click('.hg-chip[data-kind="lancer"]');
await page.waitForTimeout(1500);
await page.click('.hg-piece[data-art="beer"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/out/hangar-phone-2.png' });
const r2 = await page.evaluate(() => ({ choice: localStorage.getItem('tt.noseart'), on: document.querySelector('.hg-piece.on')?.dataset.art, name: document.querySelector('.hg-name b')?.textContent }));
console.log(JSON.stringify({ r1, r2, errors }));
await b.close();
