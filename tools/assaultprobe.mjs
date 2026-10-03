// The counter-attack, called in on demand: how many men, where they land,
// how many squads, how many SAM launchers come down, and what the battery's
// mortars and the new launchers do in the minute after.
//
//   node tools/assaultprobe.mjs <level>[,<level>...] [tier=low] [shot]
//
// Not under the suite flag: the suite runs without SAMs, and the heavy drop
// is half of what this is for. With `shot`, writes /tmp/out/assault-<level>-*.png.
import { chromium } from 'playwright';
const [levels = 'westminster', tier = 'low', shot = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const level of levels.split(',')) {
  const page = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(([tier, control, nodirect]) => { try {
    window.__control = control; window.__nodirect = nodirect;
    localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); } catch {} }, [tier, !!process.env.CONTROL, !!process.env.NODIRECT]);
  try {
    await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
    const pre = await page.evaluate(async () => {
      const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
      B.unlockAll = true; B.freeBuild = true; B.airlift = false;
      B.airborne.auto = false; B.assault.auto = false;
      B.invulnerable = !!window.__inv;
      ff(2);
      const S = B.primary;
      let placed = 0;
      // A battery of four guns and two M240 teams on one side, as a player would.
      for (let k = 0; k < 200 && placed < 6; k++) {
        const a = 2.2 + k * 0.13, r = (window.__R || 500) + (k % 4) * 20;
        const q = new THREE.Vector3(S.origin.x + Math.sin(a) * r, 0, S.origin.z + Math.cos(a) * r);
        q.y = window.terrain.heightAt(q.x, q.z);
        if (B.validPlacement(q).ok) { await B.deploy(placed < 4 ? 'm119' : 'm240', q); placed++; }
      }
      ff(4);
      const g = B.garrison;
      const t0 = performance.now();
      if (window.__nodirect) g.damageScale = 0;
      const r = window.__control ? { planes: 0, men: 0, eta: 0 } : B.assault.launch();
      return { guns: placed, aliveAtLaunch: B.units.filter((u) => u.alive).length, base: g.defenders.length, wavePool: g.pools.wave, launchMs: Math.round(performance.now() - t0), ...(r || { err: 'nothing sent' }) };
    });
    if (pre.err && !process.env.CONTROL) { console.log(JSON.stringify({ level, ...pre, errors })); await page.close(); continue; }
    if (shot) {
      await page.evaluate(([eta]) => window.__fastForward(Math.max(1, eta + 4)), [pre.eta]);
      await page.evaluate(() => {
        const B = window.battle, r = window.rig, c = B.assault.center;
        document.body.classList.add('clear-view');
        r.target.set(c.x, B.assault.groundY + 60, c.z); r.desiredTarget.copy(r.target);
        r.pitch = r.desiredPitch = 0.35; r.distance = r.desiredDistance = 700;
      });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `/tmp/out/assault-${level}-drop.png` });
    }
    const r = await page.evaluate(() => {
      const B = window.battle, ff = window.__fastForward;
      const A = B.assault, g = B.garrison;
      let t = 0;
      const tt = performance.now();
      while ((A.state === 'inbound' || (window.__control && t < 60)) && t < 150) { ff(2); t += 2; }
      const ms = performance.now() - tt;
      const wave = g.defenders.filter((d) => d.pool === 'wave');
      const types = {};
      for (const d of wave) types[d.type] = (types[d.type] || 0) + 1;
      const f = B.primary.footprint;
      const far = wave.filter((d) => Math.max(f.x0 - d.pos.x, 0, d.pos.x - f.x1, f.z0 - d.pos.z, 0, d.pos.z - f.z1) > 60).length;
      const aliveLanded = B.units.filter((u) => u.alive).length;
      const m0 = g.mortarsFired, lost0 = B.unitsLost || 0;
      const fired0 = B.sams ? B.sams.launchers.length : 0;
      ff(40);
      return { landedIn: t, simMsPerS: Math.round(ms / Math.max(1, t)), landed: A.landed, lost: A.lost, squads: A.squads,
        sams: A.samsLanded || 0, launchers: B.sams ? B.sams.launchers.filter((l) => l.alive).length : 0,
        types, farFromBuilding: far, mortarsIn40s: g.mortarsFired - m0, unitsLostIn40s: (B.unitsLost || 0) - lost0,
        defenders: g.defenders.filter((d) => d.alive).length, aliveLanded, aliveAfter: B.units.filter((u) => u.alive).length };
    });
    console.log(JSON.stringify({ level, ...pre, ...r, errors }));
  } catch (e) { console.log(JSON.stringify({ level, crash: e.message.slice(0, 300), errors })); }
  await page.close();
}
await b.close();
