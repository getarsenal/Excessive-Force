/**
 * Three looks at a level, and the numbers behind them.
 *
 * `shot.mjs` runs the suite; this one just stands in the level and looks at
 * it. Wide, close and from above, plus one line of JSON — stones, how many
 * start detached, how tall the primary is, how many defenders there are and
 * how many of them cannot see out, with the first few blind ones' height and
 * distance from the origin so a blind rank can be named rather than guessed
 * at. That last part is the whole reason this exists: twenty-seven blind men
 * at Chichen Itza were assumed to be on the pyramid's terraces and were in
 * fact all on the other building, two hundred metres away.
 *
 *   node tools/look.mjs /tmp/out/pisa pisa     (needs the dev server on 5177)
 */
import { chromium } from 'playwright';
import { statSync } from 'node:fs';
const out = process.argv[2], level = process.argv[3];
if (!out || !level) { console.error('usage: node tools/look.mjs <out-prefix> <level>'); process.exit(2); }
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const page = await b.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 300)));
page.on('console', (m) => { const t = m.text();
  if (/built|field works|city:|blind|ERROR/i.test(t)) console.log(' ', t.slice(0, 160)); });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); } catch {} });
await page.goto(`http://localhost:5177/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', { timeout: 400000 });
await page.waitForTimeout(2600);
console.log(JSON.stringify(await page.evaluate(() => {
  const s = window.primary, g = window.battle.garrison;
  let alive = 0, top = -1e9, lo = 1e9;
  for (let i = 0; i < s.count; i++) {
    if (!(s.flags[i] & 1)) continue;
    alive++; top = Math.max(top, s.py[i]); lo = Math.min(lo, s.py[i]);
  }
  const loose = g.fieldOfFireReport ? g.fieldOfFireReport(window.structures) : null;
  return { stones: s.count, alive, detached: s.count - alive,
    height: +(top - lo).toFixed(1), defenders: g.defenders.length,
    blind: loose ? loose.blind : null, blindBy: loose ? loose.blindBy : null,
    blindAt: g.defenders.filter((d) => d.blind).slice(0, 8).map((d) => ({
      t: d.type, y: +(d.pos.y - s.groundY).toFixed(1),
      r: +Math.hypot(d.pos.x - s.origin.x, d.pos.z - s.origin.z).toFixed(1) })),
    total: window.structures.reduce((a, st) => a + st.count, 0) };
})));
await page.evaluate(() => window.hud.setClearView(true));
for (const [tag, yaw, pitch, dist, ty] of [
  ['wide', 0.72, 0.30, 330, 40], ['close', 1.5, 0.12, 150, 25], ['top', 0.4, 0.55, 260, 55],
]) {
  await page.evaluate(([y, p, d, t]) => {
    const r = window.rig; r.yaw = r.desiredYaw = y; r.pitch = r.desiredPitch = p;
    r.distance = r.desiredDistance = d; r.target.y = r.desiredTarget.y = t;
  }, [yaw, pitch, dist, ty]);
  let size = 0;
  for (let a = 0; a < 4 && size < 20000; a++) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}-${tag}.png` });
    size = statSync(`${out}-${tag}.png`).size;
  }
}
await b.close();
