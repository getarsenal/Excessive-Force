// The supply crate, opened, photographed frame by frame at the front door.
//
//   node tools/crateshot.mjs [phone]   -> /tmp/out/crate-<ms>.png
import { chromium } from 'playwright';
const phone = process.argv[2] === 'phone';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext(phone
  ? { viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
  : { viewport: { width: 1100, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.intros', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '0');
  const c = JSON.parse(localStorage.getItem('tt.career') || 'null') || { xp: 5000, counts: {}, medals: {}, places: {}, perks: {} };
  c.crates = 6; localStorage.setItem('tt.career', JSON.stringify(c)); } catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title [data-act="crates"]', { timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/out/crate-menu.png' });
await page.evaluate(() => document.querySelector('#title [data-act="crates"]').click());
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/out/crate-0000.png' });
// Each state held still and photographed: a screenshot under the software
// rasteriser takes longer than the whole sequence does in real time.
await page.evaluate(() => document.querySelector('#title .cx-btn').click());
await page.waitForTimeout(3300);
const sheet = page.locator('#title .tt-sheet-in');
for (const [st, ms] of [['idle', 0], ['rock', 80], ['buck', 60], ['strain', 30], ['open', 250], ['rise', 300], ['reveal', 600]]) {
  await page.evaluate(([st, ms]) => {
    const s = document.querySelector('.cx-stage');
    s.dataset.state = st;
    void s.offsetWidth;
    for (const a of s.getAnimations({ subtree: true })) { try { a.pause(); a.currentTime = ms; } catch {} }
  }, [st, ms]);
  await page.waitForTimeout(400);
  await page.evaluate((ms) => { for (const a of document.querySelector('.cx-stage').getAnimations({ subtree: true })) { try { a.pause(); a.currentTime = ms; } catch {} } }, ms);
  await sheet.screenshot({ path: `/tmp/out/crate-${st}.png` });
}
console.log(await page.evaluate(() => [document.querySelector('#title [data-act="crates"]')?.outerHTML.slice(0, 400), document.querySelector('.cx-stage').dataset.state]));
await b.close();
