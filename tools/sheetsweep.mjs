// Every sheet off the title and every view of the campaign screen, on a phone both ways up:
// what lays out past the right edge, and what can be panned sideways. A phone screen scrolls
// one way; the only strips meant to pan are the battle's card bar and the perf card's table.
//   node tools/sheetsweep.mjs            # portrait, 393x852
//   LAND=1 node tools/sheetsweep.mjs     # on its side, 852x393
// Screenshots in /tmp/out/sheets-port/ and /tmp/out/sheets-land/. The title's drifting slides,
// grain and news ticker and the loader's art are decoration under a clipped box, not a scroll.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const port = process.env.TT_PORT || 5177;
const LAND = process.env.LAND === '1';
const W = LAND ? 852 : 393, H = LAND ? 393 : 852;
const OUT = `/tmp/out/sheets-${LAND ? 'land' : 'port'}`; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], viewport: { width: W, height: H } });
await ctx.addInitScript(() => { try {
  localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.quality', 'low');
  localStorage.setItem('tt.progress', JSON.stringify({ westminster: { done: true, bestTime: 300, rounds: 40 }, paris: { done: true, bestTime: 400 } }));
} catch {} });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
const DECOR = '.tt-slide, .tt-grain, .tt-bg, .tt-fx, .tt-flash, .tt-wire, #loading';
const measure = (label) => page.evaluate(({ label, DECOR }) => {
  const W = innerWidth;
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.'); return s; };
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 0; };
  const wide = [], pan = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || el.closest(DECOR)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 && r.bottom > 0 && r.top < innerHeight && ![...el.children].some((c) => c.getBoundingClientRect().right > W + 1)) wide.push(`${sel(el)}<${sel(el.parentElement)} r=${Math.round(r.right)}`);
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const cs = getComputedStyle(el);
      if (/auto|scroll/.test(cs.overflowX) && !el.matches('.cardbar, .pc-scroll')) pan.push(`${sel(el)} ${el.clientWidth}<${el.scrollWidth}`);
    }
  }
  return { label, wide: wide.slice(0, 8), pan: pan.slice(0, 8) };
}, { label, DECOR });
const report = async (label) => {
  await page.waitForTimeout(700);
  const m = await measure(label);
  await page.screenshot({ path: `${OUT}/${label}.png`, timeout: 240000 });
  console.log(`${label.padEnd(22)} ${m.wide.length || m.pan.length ? 'WIDE ' + JSON.stringify(m.wide) + ' PAN ' + JSON.stringify(m.pan) : 'ok'}`);
};
const act = async (a) => { const ok = await page.evaluate((a) => { const el = document.querySelector(`#title [data-act="${a}"]`); if (!el) return false; el.click(); return true; }, a); if (!ok) console.log(`  (no ${a})`); await page.waitForTimeout(600); return ok; };
const closeAll = async () => { for (let i = 0; i < 4; i++) { const open = await page.evaluate(() => { const s = document.querySelector('#title .tt-sheet'); return s && !s.hidden; }); if (!open) break; await act('close'); } };

await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title .tt-menu', { timeout: 240000 });
await page.waitForTimeout(2500);
await report('title');
const PATHS = [['today'], ['today', 'daily'], ['today', 'weekly'], ['today', 'season'], ['today', 'orders'], ['today', 'crates'],
  ['modes'], ['modes', 'free'], ['modes', 'studio'],
  ['more'], ['more', 'armoury'], ['more', 'armoury', 'unit'], ['more', 'medals'], ['more', 'hangar'], ['more', 'boards'], ['more', 'commanders']];
for (const p of PATHS) {
  let ok = true;
  for (const a of p) { if (!(await act(a))) { ok = false; break; } }
  if (ok) await report(p.join('-'));
  await closeAll();
}
// The campaign screen: door, doctrine, list, dossier, records.
await act('campaign');
await page.waitForTimeout(2500);
await report('wm-door');
await page.evaluate(() => document.getElementById('ef-todoct')?.click()); await report('wm-doctrine');
await page.evaluate(() => document.getElementById('ef-back')?.click()); await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('ef-tomap')?.click()); await report('wm-list');
await page.evaluate(() => { const r = document.querySelector('.ef-row:not(.locked)'); r?.scrollIntoView({ block: 'center' }); r?.click(); }); await report('wm-dossier');
await page.evaluate(() => document.getElementById('ef-back')?.click()); await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('ef-gear')?.click()); await report('wm-records');
console.log('page errors', errs.slice(0, 5));
await b.close();
