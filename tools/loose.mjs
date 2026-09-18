/**
 * Where a structure's loose stones are.
 *
 * The suite asserts that nothing starts detached and prints a count. That is
 * the right assertion and the wrong debugging tool: a count of twenty-six tells
 * you there is a hole and nothing about where. This loads one level at one
 * tier, waits for the solver to settle, and prints every stone the solver has
 * freed with the section it belongs to, its height, its distance from the
 * structure's origin and its size — which is usually enough to name the bug
 * without opening the builder. Four-centimetre stones at one height are a ring
 * whose wall thickness has gone to nothing; a whole tag at one height is a slab
 * spanning further than anything can carry it.
 *
 * Detached here means the same thing the suite means: alive, and FREE or
 * ISLAND. Not-alive is a different condition and counts nothing.
 *
 *   node tools/loose.mjs pisa low        (needs the dev server on 5177)
 */
import { chromium } from 'playwright';

const level = process.argv[2];
const tier = process.argv[3] || 'low';
const port = process.env.TT_PORT || 5177;
if (!level) { console.error('usage: node tools/loose.mjs <level> [tier]'); process.exit(2); }

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)));
await page.addInitScript(([t]) => {
  try {
    localStorage.setItem('tt.quality', t);
    localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0');
    localStorage.setItem('tt.opening', '0');
  } catch { /* private mode */ }
}, [tier]);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(
  () => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
await page.waitForTimeout(1500);

const found = await page.evaluate(() => {
  const out = {};
  for (const s of window.structures) {
    const loose = [];
    for (let i = 0; i < s.count; i++) {
      if (!(s.flags[i] & 1) || !(s.flags[i] & 10)) continue;
      let tag = '?';
      for (const [k, [a, b]] of Object.entries(s.tagRanges || {})) if (i >= a && i < b) tag = k;
      loose.push({
        tag,
        y: +(s.py[i] - s.groundY).toFixed(1),
        r: +Math.hypot(s.px[i] - s.origin.x, s.pz[i] - s.origin.z).toFixed(1),
        h: [+s.hx[i].toFixed(2), +s.hy[i].toFixed(2), +s.hz[i].toFixed(2)],
      });
    }
    if (loose.length) out[s.key] = loose;
  }
  return out;
});
await browser.close();

const keys = Object.keys(found);
if (!keys.length) { console.log(`${level} @ ${tier}: nothing loose`); process.exit(0); }
for (const k of keys) {
  console.log(`${k}: ${found[k].length} loose`);
  for (const b of found[k].slice(0, 20)) {
    console.log(`   ${b.tag.padEnd(12)} y ${String(b.y).padStart(6)}  r ${String(b.r).padStart(6)}  ${b.h.join(' x ')}`);
  }
  if (found[k].length > 20) console.log(`   … and ${found[k].length - 20} more`);
}
process.exit(1);
