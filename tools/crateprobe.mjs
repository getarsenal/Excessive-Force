// The supply crates on a phone: seven waiting, OPEN ALL, and the tally read
// back against what the record banked.
//   node tools/crateprobe.mjs  -> /tmp/out/crates-{ready,haul}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const port = process.env.TT_PORT || 5177;
const N = +(process.env.N || 7);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: +(process.env.W || 393), height: +(process.env.H || 852) }, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.addInitScript((n) => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
  if (!sessionStorage.getItem('seeded')) {
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tt.career', JSON.stringify({ xp: 5000, prestige: 0, seenGrade: 99, counts: {}, medals: {}, places: {}, orders: { date: null, prog: {}, done: [], bonus: false }, crates: n, perks: { funds: 0, income: 0, double: 0 }, firstWin: null, boot: true }));
  }
} catch {} }, N);
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 120000 });
await page.waitForTimeout(1500);
const opener = await page.$('#title [data-act="crates"]');
if (opener) await opener.click(); else { await page.click('#title [data-act="today"]').catch(() => {}); await page.waitForTimeout(600); await page.click('[data-act="crates"]'); }
await page.waitForTimeout(1200);
const ready = await page.evaluate(() => ({ open: document.querySelector('.cx-btn')?.textContent, all: document.querySelector('.cx-all')?.hidden ? null : document.querySelector('.cx-all')?.textContent }));
await page.screenshot({ path: '/tmp/out/crates-ready.png' });
await page.click('.cx-all');
await page.waitForTimeout(3600);
await page.screenshot({ path: '/tmp/out/crates-haul.png' });
const after = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('tt.career'));
  return {
    rows: [...document.querySelectorAll('.cx-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    card: document.querySelector('.cx-cfront')?.textContent.replace(/\s+/g, ' ').trim(),
    open: document.querySelector('.cx-btn')?.textContent, allHidden: document.querySelector('.cx-all')?.hidden,
    crates: c.crates, perks: c.perks, xp: c.xp,
    badge: document.querySelector('#title [data-act="crates"] b u')?.textContent ?? null,
  };
});
console.log(JSON.stringify({ ready, after, errors }, null, 1));
await b.close();
