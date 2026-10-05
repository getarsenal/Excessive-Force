// The campaign, looked at: a battle booted, a win forced through the real
// report (stars, the operation strip, NEXT), then the title, the campaign
// door, the operations list and the doctrine tree, at phone size.
//
//   node tools/campaignprobe.mjs [level=westminster]   -> /tmp/out/camp-*.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 240)));
await page.addInitScript(() => { try {
  if (!sessionStorage.getItem('probe.init')) {
    sessionStorage.setItem('probe.init', '1');
    localStorage.clear();
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done');
    // Three battles of the first operation already won, two with extra stars.
    localStorage.setItem('tt.progress', JSON.stringify({ westminster: { runs: 1, won: true }, paris: { runs: 2, won: true } }));
    localStorage.setItem('tt.ops', JSON.stringify({ stars: { westminster: 7, paris: 3 } }));
  }
} catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/out/camp-1-hud.png' });
const info = await page.evaluate(() => ({ threat: window.battle.threat, boss: !!window.battle.boss, money: window.battle.money,
  crews: window.battle.units.length, bark: !!window.__barks }));
console.log('battle', JSON.stringify(info));
await page.evaluate(() => {
  const B = window.battle;
  window.__recordAndEnd({ ...B.summary(), score: 12000, time: 300, shotsFired: 20, spent: 9000, unitsLost: 0, leverage: 3, strikes: 0 });
});
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/out/camp-2-report.png' });
const rep = await page.evaluate(() => ({ stars: document.getElementById('ec-stars')?.innerText, op: document.getElementById('ec-op')?.innerText,
  next: document.getElementById('ec-next')?.innerText }));
console.log('report', JSON.stringify(rep));
// The front door, with nothing autostarted.
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/out/camp-3-title.png' });
console.log('title', JSON.stringify(await page.$$eval('#title .tt-item', (a) => a.map((e) => e.innerText.replace(/\s+/g, ' ')))));
await page.click('#title [data-act="campaign"]').catch((e) => console.log('no campaign', e.message));
await page.waitForSelector('#worldmap', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/out/camp-4-door.png' });
await page.click('#ef-tomap').catch(() => {});
await page.waitForTimeout(2000);
await page.evaluate(() => { const l = document.getElementById('ef-list'); l?.scrollIntoView(); });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/out/camp-5-list.png' });
await page.click('#ef-back').catch(() => {});
await page.waitForTimeout(800);
await page.click('#ef-todoct').catch((e) => console.log('no doct', e.message));
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/out/camp-6-doctrine.png' });
console.log(JSON.stringify({ errors }));
await b.close();
