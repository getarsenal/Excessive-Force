// The small effects, one at a time in front of the camera: each set off
// through the game's own path where there is one, then photographed after
// `at` seconds.
//
//   node tools/fxshow.mjs [level=westminster] [names=water,ring,cookoff,surge,cars,marker]
//     -> /tmp/out/fx-<name>.png
import { chromium } from 'playwright';
const [level = 'westminster', names = 'water,ring,cookoff,surge,cars,marker'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.evaluate(() => {
  const B = window.battle; B.unlockAll = true; B.freeBuild = true; B.airborne.auto = false; B.garrison.fireEnabled = false;
  document.body.classList.add('clear-view');
});
for (const name of names.split(',')) {
  const r = await page.evaluate(async (name) => {
    const B = window.battle, THREE = window.THREE, ff = window.__fastForward, F = window.fx.flourish, t = window.terrain;
    const o = B.primary.origin, rig = window.rig;
    const look = (p, dist, pitch = 0.35, yaw = null) => {
      rig.target.set(p.x, p.y, p.z); rig.desiredTarget.copy(rig.target);
      rig.distance = rig.desiredDistance = dist; rig.pitch = rig.desiredPitch = pitch;
      if (yaw != null) rig.yaw = rig.desiredYaw = yaw;
      for (let k = 0; k < 30; k++) rig.update(0.1);
    };
    // Open ground, and the nearest water, out from the monument.
    const ground = () => {
      for (let k = 0; k < 120; k++) {
        const a = k * 0.6, rr = 160 + (k % 6) * 40;
        const q = new THREE.Vector3(o.x + Math.sin(a) * rr, 0, o.z + Math.cos(a) * rr);
        q.y = t.heightAt(q.x, q.z);
        if (!t.isWater(q.x, q.z) && B.validPlacement(q).ok) return q;
      }
      return o.clone();
    };
    const water = () => {
      for (let rr = 220; rr < 900; rr += 20) for (let a = 0; a < 6.28; a += 0.2) {
        const q = new THREE.Vector3(o.x + Math.sin(a) * rr, 0, o.z + Math.cos(a) * rr);
        if (t.isWater(q.x, q.z) && t.isWater(q.x + 12, q.z) && t.isWater(q.x - 12, q.z)) { q.y = t.heightAt(q.x, q.z); return q; }
      }
      return null;
    };
    let at = 0.6, info = {};
    if (name === 'water') {
      const q = water();
      if (!q) return { err: 'no water' };
      const hit = { point: q.clone(), proj: { warhead: { fx: 1.6, radius: 6 }, kind: 'arc' }, groundHit: true, structureHit: false };
      info.splashed = B._splash(hit, hit.proj.warhead);
      look(new THREE.Vector3(q.x, t.waterLevel + 15, q.z), 110, 0.3);
      at = 0.9;
    } else if (name === 'ring') {
      const q = ground(); q.y += 2.5;
      const dir = new THREE.Vector3(1, 0.5, 0.3).normalize();
      window.fx.muzzleFlash(q, dir, 1.6);
      F.smokeRing(q, dir, 1.6);
      F.muzzleDust(q, dir, q.y - 2.5, 1.6);
      look(new THREE.Vector3(q.x + 10, q.y + 6, q.z + 3), 60, 0.12);
      at = 1.2;
    } else if (name === 'cookoff') {
      const q = ground();
      const { crack } = await import('/src/core/synth.js');
      F.cookOff(q.x, q.y, q.z, 8, null, crack);
      window.fx.detonate(q.clone().setY(q.y + 0.6), 1.2, { ground: true, groundY: q.y });
      look(new THREE.Vector3(q.x, q.y + 6, q.z), 55, 0.2);
      at = 3.2;
    } else if (name === 'surge') {
      const q = ground();
      F.surge(q.x, q.y, q.z, 2);
      look(new THREE.Vector3(q.x, q.y + 20, q.z), 320, 0.3);
      at = 4;
    } else if (name === 'cars') {
      const L = B.life;
      const cars = L?.cars?.cars || [];
      const live = cars.filter((c) => c.at && !c.wreck);
      if (!live.length) return { err: 'no traffic', cars: cars.length };
      const c = live[Math.floor(live.length / 2)].at;
      const q = new THREE.Vector3(c.x, c.y, c.z);
      B._streetBlast(q, 30, true);
      info.wrecks = cars.filter((k) => k.wreck).length;
      info.stopped = cars.filter((k) => k.stopped).length;
      look(new THREE.Vector3(q.x, q.y + 4, q.z), 80, 0.45);
      at = 0.5;
    } else if (name === 'marker') {
      const q = ground();
      F.markerSmoke(q, 20);
      look(new THREE.Vector3(q.x, q.y + 12, q.z), 90, 0.2);
      at = 3;
    }
    ff(at, 1 / 30);
    for (let k = 0; k < 3; k++) rig.update(0.1);
    return info;
  }, name);
  // Cars move on real frames, not the held clock.
  if (name === 'cars') await page.waitForTimeout(4000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/out/fx-${name}.png`, timeout: 180000 });
  console.log(name, JSON.stringify(r));
}
await b.close();
