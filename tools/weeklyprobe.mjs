// The weekly operation, as a phone plays it: the title's WEEKLY OP row and
// its sheet, GO, and then the battle under the week's rule — what the build
// bar and the strike bar offer, the lift, the money, the opening line — and
// the reward the first win of the week pays. RULE=<id> forces a rule.
//   node tools/weeklyprobe.mjs [port=5178]
import { chromium } from 'playwright';
const port = process.argv[2] || process.env.TT_PORT || 5178;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('.tt-item[data-act="weekly"]', { timeout: 400000 });
const week = await page.evaluate(async () => (await import('/src/game/career.js')).weeklyFor());
console.log('this week', week.week, '·', week.level, '·', week.rule.name, '·', week.daysLeft, 'days left');
await page.click('.tt-item[data-act="weekly"]');
await page.waitForSelector('.tt-sheet:not([hidden]) [data-act="weeklygo"]');
console.log('sheet:', (await page.textContent('.tt-sheet .tt-dsheet')).replace(/\s+/g, ' ').trim());
await page.screenshot({ path: '/tmp/claude-0/weekly-sheet.png' });
if (process.env.RULE) {
  // Another rule on the same landmark, for testing them all.
  await page.evaluate(async (rid) => {
    const c = await import('/src/game/career.js');
    const w = c.weeklyFor();
    sessionStorage.setItem('tt.weeklyrun', JSON.stringify({ week: w.week, level: w.level, rule: rid }));
  }, process.env.RULE);
  await page.goto(`http://localhost:${port}/?level=${week.level}`, { waitUntil: 'load', timeout: 300000 });
} else {
  await page.click('.tt-sheet [data-act="weeklygo"]');
}
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const fight = await page.evaluate(() => {
  const B = window.battle;
  const cards = (sel) => [...document.querySelectorAll(`${sel} .unit-card`)].map((c) => c.dataset.id);
  return {
    level: window.__level?.id || location.search, allowed: B.allowed ? [...B.allowed] : null, airlift: B.airlift, money: B.money,
    build: cards('#buildbar'), strikes: cards('#strikebar'),
    feed: [...document.querySelectorAll('#feed *')].map((e) => e.textContent).filter((t) => /WEEKLY/.test(t)).slice(0, 1),
  };
});
console.log('battle:', JSON.stringify(fight));
await page.screenshot({ path: '/tmp/claude-0/weekly-fight.png' });
// The reward, through the career's own books.
const reward = await page.evaluate(async (w) => {
  const c = await import('/src/game/career.js'), p = await import('/src/game/progress.js');
  const crates0 = p.career().crates || 0;
  const first = c.markWeekly(w.week, true, { time: 400, shotsFired: 120 });
  const rep = p.award({ won: true, sum: { time: 400, shotsFired: 120 }, level: w.level, weekly: first ? w.rule.name : null });
  const again = c.markWeekly(w.week, true, { time: 350, shotsFired: 100 });
  return { first, again, line: rep.lines.find((l) => /WEEKLY/.test(l.label)), crates: (p.career().crates || 0) - crates0, state: c.weeklyState(w.week) };
}, week);
console.log('reward:', JSON.stringify(reward));
console.log('errors', JSON.stringify(errors));
await b.close();
