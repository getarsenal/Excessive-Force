// What shader programs a level compiles, how many materials use each, and,
// for programs of one kind, which of three's parameters set them apart: the
// list to read before a boot spends seconds linking near-duplicates.
//   node tools/programprobe.mjs [level=westminster] [port=5190]
import { chromium } from 'playwright';
const port = process.argv[3] || 5190, level = process.argv[2] || 'westminster';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}&nosw`, { waitUntil: 'load', timeout: 600000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 900000 });
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const out = await page.evaluate(() => {
  const r = window.__engine.renderer;
  return r.info.programs.map((p) => ({ name: p.name, users: p.usedTimes, key: p.cacheKey }));
});
const keys = out.map((o) => o.key.split(','));
for (const o of out) console.log(o.name.padEnd(24), o.users, o.key.length);
// What differs between programs of the same name.
const byName = {};
out.forEach((o, i) => (byName[o.name] ||= []).push(keys[i]));
for (const [n, ks] of Object.entries(byName)) if (ks.length > 1) {
  const len = Math.max(...ks.map((k) => k.length));
  const diff = [];
  for (let j = 0; j < len; j++) { const v = new Set(ks.map((k) => k[j])); if (v.size > 1) diff.push(`${j}:${[...v].map((x) => String(x).slice(0, 40)).join('|')}`); }
  console.log('\n', n, ks.length, '\n  ', diff.join('\n   '));
}
await b.close();
