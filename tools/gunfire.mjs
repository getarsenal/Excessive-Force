// A real shot from each gun against the barrel it leaves: every cannon put
// down on the range and fired at the bullet trap (and once laid by hand), the
// launch captured, and printed: how far the shell starts from the barrel's
// drawn end, and the angle between the shell's flight and the barrel's line.
//   node tools/gunfire.mjs [kinds=m119,m777,m109,stryker]
import { chromium } from 'playwright';
const kinds = (process.argv[2] || 'm119,m777,m109,stryker').split(',');
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(async (kinds) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  const shots = [];
  const of = B.projectiles.fire.bind(B.projectiles);
  B.projectiles.fire = (o) => { shots.push({ pos: o.pos.clone(), vel: o.vel.clone(), owner: o.owner }); return of(o); };
  const out = [];
  let x = -120;
  const target = B.primary?.origin ? new T.Vector3(B.primary.origin.x, B.originGround + 6, B.primary.origin.z) : new T.Vector3(0, 10, -560);
  for (const kind of kinds) {
    x += 50;
    const p = new T.Vector3(x, terrain.heightAt(x, 30), 30);
    B.deploy(kind, p); const u = B.units[B.units.length - 1];
    for (let k = 0; k < 120 && !(u.model && u.state === 'ready'); k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
    const measure = (label) => {
      const s = shots.filter((q) => q.owner === u).pop();
      if (!s) return { label, fired: false };
      // The barrel's end and line as drawn, in the world, at the moment of the shot (recoil aside).
      const rt = u.recoilT; u.recoilT = 0; B._updateBarrel(u, 0); u.group.updateMatrixWorld(true);
      const BB = u.barrelB;
      const tip = new T.Vector3().fromArray(BB.tip).applyQuaternion(u.barrel.quaternion).add(u.barrel.position);
      u.model.localToWorld(tip);
      const axis = new T.Vector3().fromArray(BB.axis).applyQuaternion(u.barrel.quaternion);
      const q = new T.Quaternion(); u.model.getWorldQuaternion(q); axis.applyQuaternion(q).normalize();
      u.recoilT = rt;
      const ang = axis.angleTo(s.vel.clone().normalize()) * 180 / Math.PI;
      return { label, fromTip: +s.pos.distanceTo(tip).toFixed(2), angleDeg: +ang.toFixed(1), elevDeg: +(Math.atan2(s.vel.y, Math.hypot(s.vel.x, s.vel.z)) * 57.3).toFixed(1) };
    };
    // The crew's own shot at the trap.
    u.yaw = Math.atan2(target.x - u.pos.x, target.z - u.pos.z); u.group.rotation.y = u.yaw;
    u.cooldown = 0; B._fireOne(u, target.clone());
    const crew = measure('crew');
    // Laid by hand at twelve degrees.
    window.__lay.enter(u); const L = B.lay; B.layTurn(0, 0.21 - L.elev); u.cooldown = 0; B.handFire();
    const hand = measure('hand');
    window.__lay.exit();
    out.push({ kind, crew, hand });
  }
  return out;
}, kinds);
for (const row of r) console.log(JSON.stringify(row));
await b.close();
