/**
 * The stars, where a player reads them: the pause menu mid-fight (what each
 * asks, this battle's figures against par), the end card after a win (the
 * four marks under the stars), and the contract's dossier off the title.
 * On an iPhone's screen; the end card from a run like the owner's Taj
 * (12,566 rounds, $467,350, 8:29) unless SUM= gives one as JSON.
 *
 *   node tools/starsshot.mjs [level] [out dir]
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
const level = process.argv[2] || 'agra', out = process.argv[3] || '/tmp/out/stars';
mkdirSync(out, { recursive: true });
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });

// The dossier, off the title: the contract card, tapped.
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForTimeout(6000);
// The title's CAMPAIGN row opens the contract card.
const camp = await page.$('[data-act="campaign"]');
if (camp && await camp.isVisible()) { await camp.click(); await page.waitForTimeout(3000); }
const hero = await page.$('#ef-hero');
if (hero && await hero.isVisible()) {
  await page.screenshot({ path: `${out}/title-card.png` });
  await hero.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/dossier.png`, fullPage: false });
  const panel = await page.$('.wm-doss');
  if (panel) await panel.screenshot({ path: `${out}/dossier-full.png` }).catch(() => {});
  console.log('wrote dossier');
} else console.log('no contract card on the title');

// The fight: a few guns, half a minute of it, and the pause menu.
await page.evaluate(() => { localStorage.setItem('tt.autostart', '1'); });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.evaluate(() => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.unlockAll = true; B.money = 1e6; B.airlift = false;
  let n = 0;
  for (const rad of [260, 300]) for (let a = 0; a < 360 && n < 4; a += 30) {
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    if (B.deploy('m777', p)) n++;
  }
  window.__fastForward(30, 1 / 30);
});
await page.click('#dock-menu');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/menu.png` });
console.log('wrote menu', JSON.stringify(await page.evaluate(() => document.getElementById('menu-stars')?.innerText.replace(/\s+/g, ' '))));
await page.click('#menu-resume');

// The end card, from a run like the owner's.
const sum = process.env.SUM ? JSON.parse(process.env.SUM) : null;
await page.evaluate((given) => {
  const s = window.battle.summary();
  Object.assign(s, given || { score: 3478990, shotsFired: 12566, spent: 467350, time: 509, leverage: 7.4, unitsLost: 2, strikes: 3, defendersKilled: 521 });
  window.__recordAndEnd(s);
}, sum);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/endcard.png` });
console.log('wrote endcard', JSON.stringify(await page.evaluate(() => [document.getElementById('ec-stars')?.innerText, document.getElementById('ec-marks')?.innerText].map((t) => (t || '').replace(/\s+/g, ' ')))));
console.log(JSON.stringify({ errors }));
await b.close();
