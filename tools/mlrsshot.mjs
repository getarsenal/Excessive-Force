// The rocket launchers as deployed: which way each vehicle faces the target,
// where its rockets leave from, and a photograph of each from the side as it
// fires.
//
//   node tools/mlrsshot.mjs [level] [ids=m270,m142]   -> /tmp/out/mlrs-<id>.png
import { chromium } from 'playwright';
const [level = 'westminster', ids = 'm270,m142'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const id of ids.split(',')) {
  const page = await b.newPage({ viewport: { width: 1000, height: 600 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.addInitScript(() => { try {
    localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
  await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  const info = await page.evaluate(async (id) => {
    const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
    B.unlockAll = true; B.freeBuild = true; B.airlift = false; B.airborne.auto = false;
    B.garrison.fireEnabled = false; B.invulnerable = true;
    ff(2);
    const o = B.primary.origin;
    let at = null;
    for (let k = 0; k < 64 && !at; k++) {
      const a = 2.2 + k * 0.4, r = 520 + (k % 4) * 60;
      const q = new THREE.Vector3(o.x + Math.sin(a) * r, 0, o.z + Math.cos(a) * r);
      q.y = window.terrain.heightAt(q.x, q.z);
      if (B.validPlacement(q, window.UNITS_BY_ID?.[id]).ok) at = q;
    }
    if (!at) return { err: 'no ground' };
    const n0 = B.units.length;
    await B.deploy(id, at);
    const u = B.units[n0];
    if (!u) return { err: 'not deployed' };
    for (let k = 0; k < 200 && !(u.model && u.model.children?.length); k++) await new Promise((r) => setTimeout(r, 100));
    window.__u = u;
    return { id, ready: !!u.model };
  }, id);
  console.log(JSON.stringify(info));
  if (info.err) { await page.close(); continue; }
  const shoot = async (tag, side) => {
    const where = await page.evaluate((side) => {
      const B = window.battle, r = window.rig, u = window.__u, o = B.primary.origin, THREE = window.THREE;
      r.target.set(u.pos.x, u.pos.y + 2, u.pos.z); r.desiredTarget.copy(r.target);
      const toT = Math.atan2(o.x - u.pos.x, o.z - u.pos.z);
      r.yaw = r.desiredYaw = toT + Math.PI + side;
      r.pitch = r.desiredPitch = 0.3; r.distance = r.desiredDistance = 24;
      for (let k = 0; k < 40; k++) r.update(0.1);
      document.body.classList.add('clear-view');
      const cam = B.camera; cam.updateMatrixWorld();
      const p = (v) => { const q = v.clone().project(cam); return Math.round((q.x + 1) * 500); };
      const ahead = new THREE.Vector3(o.x - u.pos.x, 0, o.z - u.pos.z).normalize().multiplyScalar(8).add(u.pos);
      return { vehicleX: p(u.pos), towardTargetX: p(ahead) };
    }, side);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/out/mlrs-${id}-${tag}.png`, timeout: 120000 });
    console.log(id, tag, 'target is to the', where.towardTargetX > where.vehicleX ? 'RIGHT' : 'LEFT', JSON.stringify(where));
  };
  await shoot('rest', Math.PI / 2);
  const info2 = await page.evaluate(async (id) => {
    const B = window.battle, THREE = window.THREE, ff = window.__fastForward, u = window.__u, o = B.primary.origin;
    B.setTarget(o.clone().setY(o.y + 10), 'probe');
    // Catch the first rockets as they leave.
    const fired = [];
    const orig = B.projectiles.fire.bind(B.projectiles);
    B.projectiles.fire = (o2) => { if (fired.length < 3) fired.push({ pos: o2.pos.clone(), vel: o2.vel.clone() }); return orig(o2); };
    for (let k = 0; k < 400 && fired.length < 2; k++) ff(0.1);
    const toT = new THREE.Vector3(o.x - u.pos.x, 0, o.z - u.pos.z).normalize();
    // The model's own forward (+Z after its yaw), the way it is drawn.
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(u.group.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    // Where the vehicle's mass sits along the line to the target: cab end or
    // pod end. The bounding box of the model split in two halves along the
    // target line; the launch point says which half the pod is in.
    const box = new THREE.Box3().setFromObject(u.model || u.group);
    const c = box.getCenter(new THREE.Vector3());
    const out = fired.map((f) => ({
      launchAlong: +((f.pos.x - c.x) * toT.x + (f.pos.z - c.z) * toT.z).toFixed(2),
      launchUp: +(f.pos.y - box.min.y).toFixed(2),
      velToTarget: +((f.vel.x * toT.x + f.vel.z * toT.z) / Math.hypot(f.vel.x, f.vel.z)).toFixed(2),
    }));
    return { id, dist: Math.round(u.pos.distanceTo(o)), facingDotTarget: +fwd.dot(toT).toFixed(2), fired: out,
      size: box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(1)) };
  }, id);
  console.log(JSON.stringify(info2));
  await shoot('aimed', Math.PI / 2);
  await page.close();
}
await b.close();
