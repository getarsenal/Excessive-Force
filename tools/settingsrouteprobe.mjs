// SETTINGS opens on SETTINGS with a country still waiting to burn on the
// campaign map: Westminster planted as won and not yet burnt, the title
// opened on a phone, SETTINGS tapped, and the map screen's view read. Then
// MAP tapped from the title, where the burn should play.
//   node tools/settingsrouteprobe.mjs [port=5177]
import { chromium } from 'playwright';
const port = process.argv[2] || process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
    localStorage.setItem('tt.progress', JSON.stringify({ westminster: { won: true, runs: 1, bestTime: 240, bestShots: 40 } }));
    localStorage.removeItem('tt.campaign');
  } catch {}
});
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('[data-act="records"]', { timeout: 120000 });
await page.click('[data-act="records"]');
await page.waitForSelector('#worldmap', { timeout: 60000 });
await page.waitForTimeout(1200);
const v1 = await page.evaluate(() => document.querySelector('#worldmap [data-view]')?.closest('[data-view]')?.dataset.view || document.querySelector('#worldmap .ef-shell, #worldmap [class*="shell"]')?.dataset.view);
const shellView = await page.evaluate(() => { const s = [...document.querySelectorAll('#worldmap *')].find((e) => e.dataset && e.dataset.view && e.children.length > 2); return s ? s.dataset.view : null; });
console.log('SETTINGS opened on view:', shellView || v1);
await page.click('#ef-back').catch(() => {});
await page.waitForTimeout(800);
// Back on the title: now the map, where the burn should play.
const onTitle = await page.waitForSelector('[data-act="map"]', { timeout: 15000 }).then(() => true).catch(() => false);
if (onTitle) {
  await page.click('[data-act="map"]');
  await page.waitForSelector('#worldmap', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const v2 = await page.evaluate(() => { const s = [...document.querySelectorAll('#worldmap *')].find((e) => e.dataset && e.dataset.view && e.children.length > 2); return { view: s?.dataset.view, burning: !!document.querySelector('#worldmap .wm-burn .wm-flame[r]:not([r="0"])') || !!document.querySelector('#worldmap .wm-target.burnt') }; });
  console.log('MAP opened on view:', JSON.stringify(v2));
} else console.log('did not return to the title after DONE');
await b.close();
