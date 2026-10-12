// The black box, tested by crashing the page: a level loaded and fought for a
// few seconds, the renderer killed outright (CDP Page.crash, so no pagehide
// and the boot mark stays, as when a phone kills the tab), the game loaded
// again, and what the next boot filed read back: the crash, its samples and
// the panel's line for it.
//   node tools/crashprobe.mjs [level=westminster] [tier=low]
import { chromium } from 'playwright';
const [level = 'westminster', tier = 'low'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
await ctx.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
const open = async () => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  return page;
};
const p1 = await open();
await p1.evaluate(() => { window.battle.freeBuild = true; window.testMenu.spawnAt('m777', 4, 1, 220); });
await p1.waitForTimeout(7000);
const box = await p1.evaluate(() => JSON.parse(localStorage.getItem('tt.blackbox') || 'null'));
console.log('box before the crash:', box ? `${box.samples.length} samples, last ${JSON.stringify(box.samples.at(-1))}` : 'NONE');
const cdp = await ctx.newCDPSession(p1);
await cdp.send('Page.crash').catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
const p2 = await open();
await p2.waitForTimeout(3500);
const out = await p2.evaluate(async () => {
  const m = await import('/src/core/blackbox.js');
  const all = m.crashes();
  return { filed: all.length, line: m.describeCrash(all.at(-1)), feed: [...document.querySelectorAll('#feed *, .feed *')].map((e) => e.textContent).filter((t) => /CRASH/.test(t)).slice(0, 2) };
});
console.log('after the reload:', JSON.stringify(out));
await b.close();
