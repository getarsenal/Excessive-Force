// The M240 teams as the player sees them: three placed between the opening
// camera and the building, the garrison live, photographed mid-burst from
// the level's own camera.
//
//   node tools/mgshot.mjs <level>      -> /tmp/out/mg-<level>.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
page.on('console', (m) => { if (m.text().startsWith('cam ')) console.log(m.text()); });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.suite', '1'); } catch {} });
await page.addInitScript((d) => { window.__mgDist = d; }, process.env.DIST || 220);
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const info = await page.evaluate(async () => {
  const B = window.battle, THREE = window.THREE, ff = window.__fastForward;
  B.unlockAll = true; B.freeBuild = true; B.airlift = false; B.airborne.auto = false;
  B.invulnerable = true;
  ff(2);
  const o = B.primary.origin, cam = B.camera.position;
  window.__cam0 = cam.clone();
  // Along the line from the building to the camera, a third of the way out,
  // and either side of it.
  let dx = cam.x - o.x, dz = cam.z - o.z;
  const l = Math.hypot(dx, dz); dx /= l; dz /= l;
  let n = 0;
  for (const [f, side] of [[0.38, 0], [0.42, 25], [0.42, -25], [0.5, 50], [0.5, -50]]) {
    if (n >= 3) break;
    const q = new THREE.Vector3(o.x + dx * l * f - dz * side, 0, o.z + dz * l * f + dx * side);
    q.y = window.terrain.heightAt(q.x, q.z);
    if (!B.validPlacement(q).ok) continue;
    await B.deploy('m240', q);
    n++;
  }
  ff(3);
  // Mid-burst: step until a team has rounds in the air.
  for (let k = 0; k < 80; k++) {
    ff(0.1);
    const live = B.tracerFX.ptracers.length;
    if (live >= 3) return { placed: n, playerTracers: live, all: B.tracerFX.tracers.length, camDist: Math.round(l) };
  }
  const g = B.garrison, from = new THREE.Vector3();
  const why = B.units.filter((u) => u.def.id === 'm240').map((u) => {
    from.copy(u.pos).y += 0.6;
    let inRange = 0, seen = 0, city = 0;
    for (const d of g.defenders) {
      if (!d.alive || d.pos.distanceTo(u.pos) > u.def.range) continue;
      inRange++;
      if (B.cityBlocker && B.cityBlocker.blocks(from, d.muzzle)) { city++; continue; }
      if (B._mgSees(from, d)) seen++;
    }
    return { state: u.state, idle: u.idle, alive: u.alive, burstLeft: u.burstLeft, cooldown: +(u.cooldown || 0).toFixed(2),
      dist: Math.round(Math.hypot(u.pos.x - o.x, u.pos.z - o.z)), inRange, blockedByTown: city, seen };
  });
  return { placed: n, playerTracers: 0, all: B.tracerFX.tracers.length, camDist: Math.round(l), why };
});
console.log(JSON.stringify(info));
await page.evaluate(() => document.body.classList.add('clear-view'));
await page.waitForTimeout(400);
await page.screenshot({ path: `/tmp/out/mg-${level}.png` });
// Then looking at the first team at the level's own zoom, as a player
// watching his gun would, and a few bursts later.
await page.evaluate(() => {
  const B = window.battle, r = window.rig;
  const u = B.units.find((x) => x.def.id === 'm240');
  if (!u) return;
  r.target.set(u.pos.x, u.pos.y, u.pos.z); r.desiredTarget.copy(r.target);
  r.distance = r.desiredDistance = +(window.__mgDist || 220);
  const c0 = window.__cam0;
  r.yaw = r.desiredYaw = Math.atan2(c0.x - u.pos.x, c0.z - u.pos.z);
  for (let k = 0; k < 40; k++) r.update(0.1);
});
await page.waitForTimeout(2500);
const seen = await page.evaluate(() => {
  const B = window.battle, THREE = window.THREE;
  for (let k = 0; k < 120; k++) { window.__fastForward(0.05); if (B.tracerFX.ptracers.length >= 2) break; }
  for (let k = 0; k < 10; k++) window.rig.update(0.1);
  const cam = B.camera, v = new THREE.Vector3();
  cam.updateMatrixWorld();
  console.log('cam', cam.position.toArray().map(Math.round).join(','), 'rig target', window.rig.target.toArray().map(Math.round).join(','), 'dist', window.rig.distance, 'units', B.units.length);
  return B.tracerFX.ptracers.map((t) => {
    v.copy(t.from).addScaledVector(t.dir, Math.min(t.t * t.speed, t.end)).project(cam);
    return { x: Math.round((v.x + 1) * 640), y: Math.round((1 - v.y) * 360), d: Math.round(t.from.distanceTo(cam.position)), mesh: B.tracerFX.playerMesh.count };
  });
});
console.log('player rounds in the air, on screen at:', JSON.stringify(seen));
await page.waitForTimeout(200);
if (seen.length) {
  const x = Math.max(0, Math.min(1280 - 480, seen[0].x - 240)), y = Math.max(0, Math.min(720 - 270, seen[0].y - 135));
  await page.screenshot({ path: `/tmp/out/mg-${level}-crop.png`, clip: { x, y, width: 480, height: 270 } });
}
await page.screenshot({ path: `/tmp/out/mg-${level}-team.png` });
await b.close();
