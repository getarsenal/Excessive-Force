// The season and the boards on the title, on a phone: the SEASON row and its
// sheet (track, tiers, landmarks), a challenge link opened (its sender goes
// on the board), MORE → BOARDS, and the season's books driven directly — a
// run's stars counted once per landmark, the tiers paid once, the painting
// handed over early.
//   node tools/seasonprobe.mjs [port=5178]
import { chromium } from 'playwright';
const port = process.argv[2] || process.env.TT_PORT || 5178;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('.tt-item', { timeout: 400000 });
const books = await page.evaluate(async () => {
  const S = await import('/src/game/seasons.js'), N = await import('/src/game/noseart.js'), P = await import('/src/game/progress.js');
  const s = S.currentSeason();
  if (!s) return { season: null };
  const c0 = P.career().crates || 0;
  const paid = [];
  for (const id of s.levels) paid.push(...S.recordSeasonRun(id, 3).map((t) => t.label));
  const again = S.recordSeasonRun(s.levels[0], 3).length;
  return { season: s.name, daysLeft: s.daysLeft, levels: s.levels.length, state: S.seasonState(s), paid, againPaid: again,
    crates: (P.career().crates || 0) - c0, art: N.unlockedArt(JSON.parse(localStorage.getItem('tt.progress') || '{}')).map((a) => a.id) };
});
console.log('season books', JSON.stringify(books));
// A friend's challenge, as the link opens.
await page.goto(`http://localhost:${port}/?level=westminster&c=31&by=Viper`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
console.log('rivals after the link', await page.evaluate(() => localStorage.getItem('tt.rivals')), '· address', await page.evaluate(() => location.search));
await page.evaluate(() => { localStorage.removeItem('tt.autostart'); });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('.tt-item[data-act="season"]', { timeout: 400000 });
await page.click('.tt-item[data-act="season"]');
await page.waitForSelector('.tt-sheet:not([hidden]) .tt-stiers');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/claude-0/season-sheet.png' });
console.log('season sheet', (await page.textContent('.tt-sheet')).replace(/\s+/g, ' ').slice(0, 300));
await page.evaluate(() => document.querySelector('.tt-sheet')?.click());
await page.waitForTimeout(400);
await page.waitForTimeout(400);
await page.click('.tt-item[data-act="boards"]');
await page.waitForSelector('.tt-sheet:not([hidden]) .tt-list');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/claude-0/boards-sheet.png' });
console.log('boards sheet', (await page.textContent('.tt-sheet')).replace(/\s+/g, ' ').slice(0, 300));
console.log('errors', JSON.stringify(errors));
await b.close();
