// The on-device performance test (src/ui/perftest.js), run headless: a
// battle at the phone's tier, the test panel's QUICK run started with every
// scene cut to a fraction (SCALE, default 0.15), the strip watched while it
// runs, and the results card photographed and its record printed.
//   SCALE=0.15 node tools/perftestprobe.mjs [level=westminster]  -> /tmp/out/perftest-{run,card}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const SCALE = +(process.env.SCALE || 0.15);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: UA });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('perftest')) console.log('warn', m.text().slice(0, 200)); });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.dev', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
} catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
// Through the panel, as a player would: TEST, then RUN QUICK (scaled through the hook).
await page.click('#test-btn');
await page.waitForTimeout(300);
const btn = await page.evaluate(() => [...document.querySelectorAll('#testmenu button')].map((b) => b.textContent).filter((t) => t.startsWith('RUN') || t.startsWith('LAST')));
console.log('panel buttons', JSON.stringify(btn));
await page.evaluate((s) => window.__perf.start('quick', { scale: s }), SCALE);
await page.waitForTimeout(4000);
console.log('chip', await page.evaluate(() => document.querySelector('#perf-chip .pc-text')?.textContent), 'panel open', await page.evaluate(() => !document.getElementById('testmenu').hidden));
await page.screenshot({ path: '/tmp/out/perftest-run.png', timeout: 120000 }).catch(() => {});
await page.waitForFunction(() => !window.__perf.running, null, { timeout: 1200000, polling: 2000 });
await page.waitForTimeout(500);
const rec = await page.evaluate(() => ({ ...window.__perf.last, holdEnd: window.battle.holdEnd, state: window.battle.state }));
console.log('summary', JSON.stringify({ mode: rec.mode, minutes: rec.minutes, summary: rec.summary, drift: rec.drift, battery: rec.battery, gpuTimer: rec.gpuTimer, holdEnd: rec.holdEnd, state: rec.state }));
for (const s of rec.scenes) console.log(' ', JSON.stringify(s));
console.log('card', await page.evaluate(() => !!document.getElementById('perf-card')), 'history', await page.evaluate(() => window.__perf.history().length));
await page.screenshot({ path: '/tmp/out/perftest-card.png', timeout: 120000 }).catch(() => {});
console.log('errors', errors.length ? errors : 'none');
await b.close();
