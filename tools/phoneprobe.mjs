// A phone's view of the frame loop: frames drawn per second in battle, with
// the pause menu up, and across a NEXT TARGET hop, under an iPhone's user
// agent (so the battery saver is on by default, as it is on a phone).
//
//   node tools/phoneprobe.mjs [level] [tier]
import { chromium } from 'playwright';

const [level = 'westminster', tier = 'low'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(([t, SAVER_ENV]) => {
  try {
    localStorage.setItem('tt.quality', t);
    localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0');
    localStorage.setItem('tt.opening', '0');
    if (SAVER_ENV) localStorage.setItem('tt.saver', SAVER_ENV);
  } catch { /* private mode */ }
}, [tier, process.env.SAVER || '']);
const page = await ctx.newPage();
const errors = [];
let loads = 0;
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/\[tumble\] level /.test(m.text())) { loads++; console.log('  load:', m.text()); } });
await page.goto(`http://localhost:5177/?level=${level}`);
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 240000 });
// Count drawn frames by wrapping the renderer's draw.
const rate = async (ms) => page.evaluate((ms) => new Promise((r) => {
  let n = 0;
  const orig = window.engine.render.bind(window.engine);
  window.engine.render = () => { n++; };
  setTimeout(() => { window.engine.render = orig; r(n * 1000 / ms); }, ms);
}), ms);
console.log(`saver ${await page.evaluate(() => localStorage.getItem('tt.saver') ?? 'default')}`);
console.log(`battle: ${(await rate(4000)).toFixed(1)} frames/s`);
await page.evaluate(() => { document.getElementById('menu-btn')?.click() || window.hud.onPause(true); });
await page.evaluate(() => window.hud.onPause(true));
console.log(`paused: ${(await rate(4000)).toFixed(1)} frames/s`);
await page.evaluate(() => window.hud.onPause(false));
const t0 = Date.now();
await page.evaluate(() => { window.hud.onNextTarget(); });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 240000 });
console.log(`next target up in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.waitForTimeout(6000);
console.log(`loads ${loads} (expect 2), url ${page.url()}`);
console.log(`after hop: ${(await rate(3000)).toFixed(1)} frames/s`);
console.log(`errors: ${errors.length}`); for (const e of errors.slice(0, 8)) console.log('  ', e.slice(0, 200));
await browser.close();
