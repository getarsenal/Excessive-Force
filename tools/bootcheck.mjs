// Does a level load, and what does the page say on the way: every page
// error and console error, and the seconds to the first battle frame.
//   node tools/bootcheck.mjs [level=westminster] [tier=low]
import { chromium } from 'playwright';
const [level = 'westminster', tier = 'low'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
const said = [];
page.on('pageerror', (e) => said.push('PAGEERROR ' + String(e.stack || e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error' || /tumble\]/.test(m.text())) said.push(m.type() + ' ' + m.text().slice(0, 300)); });
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
const t0 = Date.now();
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
const ok = await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: +(process.env.WAIT || 240000) }).then(() => true, () => false);
console.log(ok ? `loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'NOT LOADED');
for (const s of said.slice(0, 30)) console.log(' ', s);
await b.close();
