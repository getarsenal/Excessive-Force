// Run some of a level's self-tests rather than all fifty.
//
//   node tools/onetest.mjs <level> "<name part>"... [--upto] [--tier T] [--debug JS]
//
// Each argument picks the tests whose name contains it. With --upto every
// test before the last one picked runs as well, in order, which is how to
// reproduce a failure that only happens after what the suite did first.
// --debug evaluates JS in the page after the run (window.testMenu is `tm`).
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const flags = new Set(['--upto']);
const vals = new Set(['--tier', '--debug']);
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (vals.has(args[i])) { i++; continue; }
  if (!flags.has(args[i])) pos.push(args[i]);
}
const [id, ...picks] = pos;
const tier = opt('tier') || 'low';
const upto = args.includes('--upto');
const port = process.env.TT_PORT || 5177;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/^\[probe\]/.test(t)) console.log(t); });
await page.addInitScript((tier) => {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  // As the harness does: the clock held until a test asks for time.
  localStorage.setItem('tt.suite', '1');
}, tier);
await page.goto(`http://localhost:${port}/?level=${id}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
const res = await page.evaluate(({ picks, upto }) => {
  const tm = window.testMenu;
  tm.ctx.battle.airlift = false;
  const list = tm.tests();
  const hit = (n) => picks.some((p) => n.includes(p));
  let last = -1;
  list.forEach(([n], i) => { if (hit(n)) last = i; });
  const out = [];
  list.forEach(([n, fn], i) => {
    if (!(hit(n) || (upto && i < last))) return;
    let ok = true, detail = '';
    const note = tm._inPlay();
    try { detail = (fn() || '') + note; } catch (e) { ok = false; detail = e.message + note; }
    if (hit(n) || !ok) out.push(`${ok ? 'PASS' : 'FAIL'} ${n} :: ${String(detail).slice(0, 300)}`);
  });
  return out;
}, { picks, upto });
for (const r of res) console.log(r);
if (opt('debug')) {
  const r = await page.evaluate((src) => { const tm = window.testMenu; return eval(src); }, opt('debug'));
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
}
await b.close();
