// The A-10 on its run: what angle the rounds leave at, what one pass does to
// a manned trench bay, and photographs from alongside as it opens fire.
//
//   node tools/strafeshot.mjs <level> [shot]   -> /tmp/out/strafe-<level>-{run,fire}.png
//   YAW=-1.25 node tools/strafeshot.mjs <level> shot   the camera on the other side
//
// Dev server on 5177. The garrison is silenced (no flak), the line is laid
// along a trench bay through one of its men, and the pass is measured: the
// angle between the fuselage axis and the line to the point the stream is
// on, the dive angle of the path, the angle the rounds meet the ground at,
// and the men killed and stones lost.
import { chromium } from 'playwright';
const [level = 'westminster', shot = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const info = await page.evaluate(() => {
  const B = window.battle, THREE = window.THREE;
  B.unlockAll = true; B.freeBuild = true; B.airlift = false;
  B.garrison.fireEnabled = false;
  window.__fastForward(2);
  const trench = B.garrison.defenders.filter((d) => d.alive && d.cover === 'trench');
  let from, to, t = null;
  if (trench.length) {
    t = trench[Math.floor(trench.length / 3)];
    // A bay runs across the way its men face.
    const fx = Math.sin(t.facing), fz = Math.cos(t.facing);
    const ax = -fz, az = fx;
    from = new THREE.Vector3(t.pos.x - ax * 30, 0, t.pos.z - az * 30);
    to = new THREE.Vector3(t.pos.x + ax * 50, 0, t.pos.z + az * 50);
  } else {
    const o = B.primary.origin;
    from = new THREE.Vector3(o.x - 70, 0, o.z - 70);
    to = new THREE.Vector3(o.x + 70, 0, o.z + 70);
  }
  from.y = window.terrain.heightAt(from.x, from.z);
  to.y = window.terrain.heightAt(to.x, to.z);
  const near = (d) => {
    const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz;
    const k = Math.max(0, Math.min(1, ((d.pos.x - from.x) * dx + (d.pos.z - from.z) * dz) / L2));
    return Math.hypot(from.x + dx * k - d.pos.x, from.z + dz * k - d.pos.z) < 8;
  };
  window.__near = B.garrison.defenders.filter((d) => d.alive && near(d));
  window.__stones0 = B.structures.reduce((a, s) => a + s.destroyedCount, 0);
  const s = B.callStrike('a10', from, { to });
  if (!s) return { err: 'refused' };
  window.__sortie = s;
  return { trench: trench.length, near: window.__near.length, slant: Math.round(s.strafe.slant),
    releaseAt: +s.releaseAt.toFixed(1) };
});
console.log(JSON.stringify(info));
if (info.err) { await b.close(); process.exit(1); }
// Fly it in small steps and sample the geometry while the gun is firing.
const geo = await page.evaluate(() => {
  const THREE = window.THREE, s = window.__sortie, S = s.strafe, m = s.model;
  const out = [];
  const ax = new THREE.Vector3();
  while (s.t < s.releaseAt - 0.05) window.__fastForward(0.05);
  for (let k = 0; k < 40 && S.fired < S.rounds; k++) {
    window.__fastForward(0.05);
    const f = S.fired / Math.max(1, S.rounds - 1);
    const aim = S.from.clone().lerp(S.to, f);
    ax.set(0, 0, 1).applyQuaternion(m.quaternion);
    const toAim = aim.clone().sub(m.position).normalize();
    const rel = THREE.MathUtils.radToDeg(ax.angleTo(toAim));
    const ground = THREE.MathUtils.radToDeg(Math.asin(-toAim.y));
    const nose = THREE.MathUtils.radToDeg(Math.asin(-ax.y));
    out.push([+rel.toFixed(1), +ground.toFixed(1), +nose.toFixed(1), Math.round(m.position.distanceTo(aim))]);
  }
  return out;
});
const pick = [0, Math.floor(geo.length / 2), geo.length - 1].map((i) => geo[i]);
console.log('below the axis / below the horizon / nose down / slant  at open, mid, close:', JSON.stringify(pick));
const res = await page.evaluate(() => {
  window.__fastForward(6);
  const B = window.battle;
  return {
    killedOnLine: window.__near.filter((d) => !d.alive).length,
    stones: B.structures.reduce((a, s) => a + s.destroyedCount, 0) - window.__stones0,
    lowest: Math.round(window.__sortie.model.position.y - window.terrain.heightAt(window.__sortie.model.position.x, window.__sortie.model.position.z)),
  };
});
console.log(JSON.stringify(res));
if (shot) {
  // A second pass for the pictures.
  await page.evaluate(() => {
    const B = window.battle, s0 = window.__sortie;
    window.__sortie = B.callStrike('a10', s0.strafe.from.clone(), { to: s0.strafe.to.clone() });
  });
  const look = async (file) => {
    await page.evaluate((yaw) => {
      const s = window.__sortie, r = window.rig, m = s.model;
      const at = m.position;
      r.target.set(at.x, at.y, at.z); r.desiredTarget.copy(r.target);
      r.yaw = r.desiredYaw = Math.atan2(s.dir.x, s.dir.z) + yaw;
      r.pitch = r.desiredPitch = 0.05; r.distance = r.desiredDistance = 48;
      document.body.classList.add('clear-view');
    }, +(process.env.YAW || 1.25));
    await page.waitForTimeout(500);
    await page.screenshot({ path: file });
  };
  await page.evaluate(() => { const s = window.__sortie; window.__fastForward(Math.max(0.5, s.releaseAt - 1.0)); });
  await look(`/tmp/out/strafe-${level}-run.png`);
  await page.evaluate(() => window.__fastForward(1.25));
  await look(`/tmp/out/strafe-${level}-fire.png`);
}
await b.close();
