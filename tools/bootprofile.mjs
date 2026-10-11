// Where a level's load goes: the browser's own CPU profiler run from the
// first byte to the battle being playable, on the phone profile (CPU slowed
// four times), and the samples totalled by function (self time) and by
// source file. The top of each list is where to cut.
//   node tools/bootprofile.mjs [level=westminster] [throttle=4]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', rate = +(process.argv[3] || 4);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
// Warm the dev server's transforms first, so the profile is the game and not vite.
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 600000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 900000 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 600000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 900000 });
const wall = (Date.now() - t0) / 1000;
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas;
const self = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]);
  self.set(n.id, (self.get(n.id) || 0) + (dt[i] || 0));
}
const fn = new Map(), file = new Map();
let total = 0;
for (const [id, us] of self) {
  const cf = byId.get(id).callFrame;
  const f = (cf.url || '(native)').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '');
  const k = `${cf.functionName || '(anon)'}  ${f}:${cf.lineNumber + 1}`;
  fn.set(k, (fn.get(k) || 0) + us);
  file.set(f, (file.get(f) || 0) + us);
  total += us;
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1e6).toFixed(2).padStart(6)} s  ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
console.log(`${level}: ${wall.toFixed(1)} s wall at ${rate}x, ${(total / 1e6).toFixed(1)} s sampled`);
console.log('\nby file'); for (const l of top(file, 18)) console.log(l);
console.log('\nby function (self)'); for (const l of top(fn, 30)) console.log(l);
await b.close();
