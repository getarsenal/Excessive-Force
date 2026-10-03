// The front door, photographed on a phone and on a desktop.
//
//   node tools/titleshot.mjs [tag]   -> /tmp/out/title-<tag>-phone.png, -desk.png
import { chromium } from 'playwright';
const tag = process.argv[2] || 'now';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const [name, opts] of [
  ['phone', { viewport: { width: 430, height: +(process.env.PH || 860) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['desk', { viewport: { width: 1400, height: 860 } }],
]) {
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
  await page.addInitScript(() => { try {
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.intros', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '0');
    const c = JSON.parse(localStorage.getItem('tt.career') || 'null') || { xp: 9000, counts: {}, medals: {}, places: {}, perks: {} };
    c.crates = 3; localStorage.setItem('tt.career', JSON.stringify(c));
    const prog = {}; for (const id of ['westminster', 'paris', 'agra', 'giza', 'chichen']) prog[id] = { won: true, bestScore: 4000, runs: 2 };
    localStorage.setItem('tt.progress', JSON.stringify(prog));
  } catch {} });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForSelector('#title .tt-item', { timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { for (const a of document.getAnimations()) { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch {} } });
  await page.screenshot({ path: `/tmp/out/title-${tag}-${name}.png` });
  await ctx.close();
}
await b.close();
