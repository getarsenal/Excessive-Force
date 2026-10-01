// A strike into the town rather than the monument: how many buildings it
// guts, how many it scorches, how far out the circle reached, and a
// photograph from above before and after.
//
//   node tools/citybomb.mjs [level=westminster] [ids=f15,tomahawk,gbu28,b1]
//     -> /tmp/out/citybomb-<level>-<id>.png
import { chromium } from 'playwright';
const [level = 'westminster', ids = 'f15,tomahawk,gbu28,b1'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const id of ids.split(',')) {
  const page = await b.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
  await page.addInitScript(() => { try {
    localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
  await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  const aim = await page.evaluate(() => {
    const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
    B.unlockAll = true; B.freeBuild = true; B.airlift = false; B.airborne.auto = false;
    B.garrison.fireEnabled = false; B.flak = null;
    ff(1);
    // The densest block 250-450 m out from the monument: the plot with most
    // neighbours within sixty metres.
    const cf = B.cityFire, o = B.primary.origin;
    let best = null, bestN = -1;
    for (const p of cf.plots) {
      const r = Math.hypot(p.x - o.x, p.z - o.z);
      if (r < 250 || r > 450 || p.h < 8) continue;
      let n = 0;
      for (const q of cf.plots) if (Math.hypot(q.x - p.x, q.z - p.z) < 60) n++;
      if (n > bestN) { bestN = n; best = p; }
    }
    const top = best.top ?? (best.base + best.h);
    const r = window.rig;
    r.target.set(best.x, best.base, best.z); r.desiredTarget.copy(r.target);
    r.pitch = r.desiredPitch = 1.1; r.distance = r.desiredDistance = 330;
    for (let k = 0; k < 40; k++) r.update(0.1);
    document.body.classList.add('clear-view');
    window.__aim = new THREE.Vector3(best.x, top, best.z);
    return { at: [best.x, top, best.z].map(Math.round), neighbours: bestN };
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/out/citybomb-${level}-${id}-before.png`, timeout: 120000 });
  const r = await page.evaluate(async (id) => {
    const B = window.battle, ff = window.__fastForward, cf = B.cityFire, aim = window.__aim;
    const burnt0 = cf.burnt;
    const scorch0 = cf.plots.filter((p) => !p.burnt && (p.scorch || 0) > 0).length;
    let hit = null;
    const si = B._strikeImpact.bind(B);
    B._strikeImpact = (h) => { if (!hit) hit = h.point.clone(); return si(h); };
    const sortie = B.callStrike(id, aim);
    if (!sortie) return { err: 'refused' };
    const t0 = performance.now();
    for (let t = 0; t < 60 && !hit; t += 0.25) ff(0.25, 1 / 30);
    ff(3, 1 / 30);
    let far = 0;
    for (const p of cf.plots) if (p.burnt && hit) far = Math.max(far, Math.hypot(p.x - hit.x, p.z - hit.z));
    return {
      id, hit: hit ? [hit.x, hit.y, hit.z].map(Math.round) : null,
      missBy: hit ? Math.round(Math.hypot(hit.x - aim.x, hit.z - aim.z)) : null,
      burnt: cf.burnt - burnt0,
      scorched: cf.plots.filter((p) => !p.burnt && (p.scorch || 0) > 0).length - scorch0,
      farthestCentre: Math.round(far), queue: cf._queue.length, ms: Math.round(performance.now() - t0),
    };
  }, id);
  console.log(JSON.stringify(r));
  for (let k = 0; k < 3; k++) await page.evaluate(() => window.rig.update(0.1));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/out/citybomb-${level}-${id}.png`, timeout: 120000 });
  await page.close();
}
await b.close();
