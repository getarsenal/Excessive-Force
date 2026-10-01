// The enemy's airborne, called in on demand: what flies, how many men, where
// they land, and what a few M240 teams on the ground make of it.
//
//   node tools/airborneprobe.mjs <level>[,<level>...] [mgs=3] [tier=low] [shot]
//
// Prints one JSON line a level. With `shot`, writes /tmp/out/airborne-<level>.png
// from beside the formation as it crosses.
import { chromium } from 'playwright';
const [levels = 'westminster', mgs = '3', tier = 'low', shot = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const level of levels.split(',')) {
  const page = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((tier) => { try {
    localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} }, tier);
  try {
    await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
    const pre = await page.evaluate(async ([n, quiet]) => {
      const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
      B.unlockAll = true; B.freeBuild = true; B.airlift = false;
      B.airborne.auto = false;
      if (quiet) B.garrison.fireEnabled = false;
      ff(2);
      const S = B.primary;
      let placed = 0;
      for (let k = 0; k < 160 && placed < n; k++) {
        const a = 2.2 + k * 0.37, r = 120 + (k % 5) * 25;
        const q = new THREE.Vector3(S.origin.x + Math.sin(a) * r, 0, S.origin.z + Math.cos(a) * r);
        q.y = window.terrain.heightAt(q.x, q.z);
        if (B.validPlacement(q).ok) { await B.deploy('m240', q); placed++; }
      }
      ff(4);
      const g = B.garrison;
      const base = g.defenders.filter((d) => d.pool !== 'air').length;
      const r = B.airborne.launch();
      return { mgs: placed, base, airPool: g.pools.air, ...(r || { err: 'nothing sent' }),
        frame: B.airborne.nation.frame };
    }, [+mgs, !!process.env.QUIET]);
    if (pre.err) { console.log(JSON.stringify({ level, ...pre, errors })); await page.close(); continue; }
    if (shot) {
      // The rig flies the camera: point it rather than the camera itself.
      const look = async (fn, file) => {
        await page.evaluate(fn);
        await page.evaluate(() => document.body.classList.add('clear-view'));
        await page.waitForTimeout(2500);
        await page.screenshot({ path: file });
      };
      await page.evaluate(([eta]) => window.__fastForward(Math.max(1, eta - 2)), [pre.eta]);
      await look(() => {
        const B = window.battle, r = window.rig, p = B.airborne.planes[0];
        if (!p) return;
        const at = p.model.position;
        r.target.set(at.x, at.y - 10, at.z); r.desiredTarget.copy(r.target);
        r.yaw = r.desiredYaw = Math.atan2(p.side.x, p.side.z) + 0.5;
        r.pitch = r.desiredPitch = 0.12; r.distance = r.desiredDistance = 120;
      }, `/tmp/out/airborne-${level}.png`);
      await page.evaluate(() => window.__fastForward(7));
      await look(() => {
        const B = window.battle, r = window.rig, c = B.airborne.center;
        r.target.set(c.x, B.airborne.groundY + 45, c.z); r.desiredTarget.copy(r.target);
        r.pitch = r.desiredPitch = 0.25; r.distance = r.desiredDistance = 200;
      }, `/tmp/out/airborne-${level}-chutes.png`);
    }
    const r = await page.evaluate(() => {
      const B = window.battle, ff = window.__fastForward;
      const A = B.airborne;
      const kills0 = B.defendersKilled;
      let t = 0;
      while (A.state === 'inbound' && t < 120) { ff(2); t += 2; }
      const f = B.primary.footprint;
      const air = B.garrison.defenders.filter((d) => d.pool === 'air');
      const dist = air.map((d) => Math.hypot(
        Math.max(f.x0 - d.pos.x, 0, d.pos.x - f.x1), Math.max(f.z0 - d.pos.z, 0, d.pos.z - f.z1)));
      dist.sort((a, b) => a - b);
      const types = {};
      for (const d of air) types[d.type] = (types[d.type] || 0) + 1;
      return {
        secs: t, state: A.state, landed: A.landed, lost: A.lost, alive: air.filter((d) => d.alive).length,
        killedByMG: B.defendersKilled - kills0,
        nearest: +(dist[0] ?? -1).toFixed(1), median: +(dist[dist.length >> 1] ?? -1).toFixed(1),
        farthest: +(dist[dist.length - 1] ?? -1).toFixed(1), types,
        planeDamage: Math.round(A.planeDamage || 0), mgAt: B.units.filter((u) => u.def.id === 'm240').map((u) => Math.round(Math.hypot(u.pos.x - A.center.x, u.pos.z - A.center.z))),
        mgUnits: B.units.filter((u) => u.def.id === 'm240' && u.alive).length,
      };
    });
    console.log(JSON.stringify({ level, ...pre, ...r, errors }));
  } catch (e) {
    console.log(JSON.stringify({ level, err: String(e.message || e).slice(0, 200), errors }));
  }
  await page.close();
}
await b.close();
