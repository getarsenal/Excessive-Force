// Every screen that carries a text box, photographed: for checking that the
// type and the panels read as one game.
//
//   node tools/uishots.mjs [outdir=/tmp/ui] [width=900] [height=600]   (dev server on 5177)
//
// Writes title, sheet, hud, drawer, menu, comcard, end, tutorial and
// standoff PNGs.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [out = '/tmp/ui', W = '900', H = '600'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const vp = { width: +W, height: +H };
const prep = (extra = {}) => (s) => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
} catch {} };
const ready = (page) => page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const err = (page) => page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));

// Title and one of its sheets.
{
  const page = await b.newPage({ viewport: vp }); err(page);
  await page.addInitScript(prep(), { 'tt.autostart': '0', 'tt.intros': '0' });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForTimeout(6000);
  await shot(page, 'title');
  await page.evaluate(() => document.querySelector('[data-act="armoury"]')?.click());
  await page.waitForTimeout(1200);
  await shot(page, 'sheet');
  await page.close();
}
// The battle: HUD, feed, prompt, status, target card, a drawer, the menu,
// the generals' card and the report.
{
  const page = await b.newPage({ viewport: vp }); err(page);
  await page.addInitScript(prep(), { 'tt.autostart': '1', 'tt.intros': '0', 'tt.suite': '1' });
  await page.goto(`http://localhost:${port}/?level=westminster`, { waitUntil: 'load', timeout: 300000 });
  await ready(page);
  await page.evaluate(() => {
    const h = window.hud;
    h.feed('M777 DEPLOYED', 'good'); h.feed('SECONDARY EXPLOSION · AMMUNITION', 'big'); h.feed('FLAK OVER TARGET · 2 GUNS', 'warn');
    h.showPrompt('Tap the ground to place the M777');
    h.status('lift · 2 units · wheels up in 12 s', 30);
    document.getElementById('targetcard')?.classList.add('open');
  });
  await page.waitForTimeout(700);
  await shot(page, 'hud');
  await page.evaluate(() => document.getElementById('dock-units')?.click());
  await page.waitForTimeout(700);
  const card = await page.$('#buildbar .unit-card');
  if (card) { const bb = await card.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await page.waitForTimeout(900);
  await shot(page, 'drawer');
  await page.evaluate(() => { document.getElementById('dock-units')?.click(); document.getElementById('menu').hidden = false; });
  await page.waitForTimeout(500);
  await shot(page, 'menu');
  await page.evaluate(() => { document.getElementById('menu').hidden = true; window.__comcard?.win(); });
  await page.waitForTimeout(2600);
  await shot(page, 'comcard');
  await page.evaluate(() => {
    const s = window.battle.summary();
    window.hud.showEnd('win', { ...s, score: 48000, shotsFired: 31, time: 212 }, {
      marks: [{ id: 'rounds', label: 'ROUNDS', par: 45, got: 31, unit: '', won: true, best: true },
        { id: 'spend', label: 'BUDGET', par: 4200, got: 5100, unit: '$', won: false },
        { id: 'time', label: 'CLOCK', par: 180, got: 212, unit: 's', won: false }],
      medals: [{ name: 'MEASURED RESPONSE', line: 'Win with one weapon and nothing else' }],
      release: { unlockLine: 'M109A7 Paladin released for the campaign' },
    });
  });
  // The suite hold pauses CSS animation, and the card fades in.
  await page.evaluate(() => { document.getElementById('endcard').style.animation = 'none'; });
  await page.waitForTimeout(1500);
  await shot(page, 'end');
  await page.close();
}
// Boot Camp's card.
{
  const page = await b.newPage({ viewport: vp }); err(page);
  await page.addInitScript(prep(), { 'tt.autostart': '1', 'tt.intros': '0', 'tt.tutorial': '' });
  await page.goto(`http://localhost:${port}/?level=tutorial`, { waitUntil: 'load', timeout: 300000 });
  await ready(page);
  await page.waitForTimeout(3000);
  await shot(page, 'tutorial');
  await page.close();
}
// The stand-off.
{
  const page = await b.newPage({ viewport: vp }); err(page);
  await page.addInitScript(prep(), { 'tt.autostart': '1', 'tt.intros': '1' });
  await page.goto(`http://localhost:${port}/?level=paris`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
  await page.waitForTimeout(5000);
  await shot(page, 'standoff');
  await page.close();
}
await b.close();
console.log('wrote', out);
