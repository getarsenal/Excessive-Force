// The title's SETTINGS screen, TESTING section: a crash, a play session and
// a perf run planted in storage, the screen opened on a phone, the rows
// read, SHOW LAST PLAY SESSION opened, COPY LAST CRASH pressed (the
// clipboard, or the box to select by hand), and a photograph.
//   node tools/settingsprobe.mjs
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
    localStorage.setItem('tt.crashes', JSON.stringify([{ kind: 'crash', filedAt: new Date().toISOString(), level: 'landmark81', tier: 'low', build: 'abc123', lastAt: new Date().toISOString(), samples: [{ el: 412, fps: 9, units: 419, air: 238, dyn: 1128, trisK: 3253, heapMB: null }], notes: [] }]));
    localStorage.setItem('tt.perfsessions', JSON.stringify([{ v: 1, kind: 'play', at: new Date().toISOString(), wallMin: 7, playMin: 7, battles: 1, levels: ['landmark81'], tier: 'low', saver: true, device: { buffer: '494x878', gpu: 'Apple GPU' }, gpuTimer: false, perf: { fps: 26.1, hitchPct: 10.6, workP50: 14.8, gpuP50: null, cpuBusy: 30.3, gpuBusy: null, trisK: 1714, shadowPct: 0 }, battery: { start: null, end: null, charged: false, drainPerHour: null, drainHow: null, manualStart: null, manualEnd: null, used: null }, activity: { shots: 6388, stones: 3535, unitsMax: 419, airMax: 238 }, minutes: [{ at: Date.now(), secs: 60, level: 'landmark81', frames: 1733, fps: 28.9, frameP95: 44, hitchPct: 1.6, workP50: 3, gpuP50: null, cpuBusy: 8.7, gpuBusy: null, trisK: 1737, shadowPct: 0, units: 28, air: 5, awake: 0, shed: 2, inBattle: true, shots: 90, stones: 0, battery: null, charging: null }] }]));
    localStorage.setItem('tt.perfruns', JSON.stringify([{ at: new Date().toISOString(), level: 'westminster', tier: 'low', mode: 'quick' }]));
  } catch {}
});
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
await page.waitForSelector('#title, .title, [data-act="records"]', { timeout: 120000 });
await page.click('[data-act="records"]');
await page.waitForSelector('#ef-testing', { timeout: 60000 });
const rows = await page.evaluate(() => [...document.querySelectorAll('#ef-testing .ef-set')].map((b) => `${b.querySelector('span').textContent}: ${b.querySelector('em').textContent}`));
console.log(rows.join('\n'));
await page.click('#ef-play');
const card = await page.waitForSelector('#perf-card .pcard', { timeout: 10000 }).then(() => true).catch(() => false);
console.log('session card over the title:', card);
await page.screenshot({ path: '/tmp/out/settings-card.png' }).catch(() => {});
if (card) await page.click('#perf-card [data-a="close"]');
await page.click('#ef-crash');
await page.waitForTimeout(500);
const after = await page.evaluate(() => ({ em: document.querySelector('#ef-crash em').textContent, box: !!document.querySelector('#ef-copytext'), boxHasCrash: (document.querySelector('#ef-copytext')?.value || '').includes('"kind": "crash"') }));
console.log('copy last crash:', JSON.stringify(after));
await page.screenshot({ path: '/tmp/out/settings-testing.png' }).catch(() => {});
await b.close();
