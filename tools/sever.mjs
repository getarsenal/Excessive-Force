/**
 * Cut the primary clean through at a given height and watch what happens.
 *
 * `shot.mjs` runs the suite and `look.mjs` stands and looks; this one asks the
 * single question the collapse model exists to answer — when a tower is severed,
 * does the part above the cut come down as a mass, or hang there and crumble?
 *
 *   node tools/sever.mjs <level> [cutFraction] [seconds]
 */
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const frac = Number(process.argv[3] ?? 0.06);
const secs = Number(process.argv[4] ?? 14);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 640, height: 440 } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 250)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); } catch {} });
await page.goto(`http://localhost:5177/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none',
  null, { timeout: 400000 });

const report = await page.evaluate(async ([frac, secs]) => {
  const tm = window.testMenu, st = window.primary;
  const snap = (t) => {
    let hung = 0, hungTop = -1e9, alive = 0, free = 0, island = 0, top = -1e9;
    for (let i = 0; i < st.count; i++) {
      if (!(st.flags[i] & 1)) continue;
      alive++;
      const y = st.py[i] + st.hy[i];
      top = Math.max(top, y);
      if (st.flags[i] & 2) { free++; continue; }
      if (st.flags[i] & 8) { island++; continue; }
      // Alive, fixed, and the solver says it has no path to the ground.
      if (!st._reach[i]) { hung++; hungTop = Math.max(hungTop, y); }
    }
    return { t, alive, free, island, isles: st.islands.size, hung,
      hungTop: +(hungTop - st.groundY).toFixed(1),
      top: +(top - st.groundY).toFixed(1),
      standing: Math.round(st.standingMass),
      lean: st.lean ? +(st.lean.angle ?? 0).toFixed(3) : null };
  };
  const out = [snap(0)];
  // Cut clean through, not one face: five craters across the full width.
  const p = tm.aimPoint(frac);
  for (const [dx, dz] of [[-12, 0], [-6, 0], [0, 0], [6, 0], [12, 0],
    [0, -10], [0, -5], [0, 5], [0, 10], [-8, -8], [8, 8], [-8, 8], [8, -8]]) {
    const q = p.clone(); q.x += dx; q.z += dz;
    for (const s of window.structures) s.explode(q, 5.0, 14, 60000);
  }
  st.stabilityDirty = true;
  st.solveStability(true);
  out.push(snap(0.01));
  for (let k = 1; k <= secs; k++) {
    window.testMenu.ctx.fastForward(1);
    out.push(snap(k));
  }
  return out;
}, [frac, secs]);
for (const r of report) console.log(JSON.stringify(r));

// And look at it. A number that says the section has come down is not the same
// claim as a picture of a building that has come down.
await page.evaluate(() => window.hud.setClearView(true));
await page.evaluate(() => {
  const r = window.rig; r.yaw = r.desiredYaw = 0.9; r.pitch = r.desiredPitch = 0.16;
  r.distance = r.desiredDistance = 300; r.target.y = r.desiredTarget.y = 45;
});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${process.argv[5] || '/tmp/out/sever'}.png` });
await b.close();
