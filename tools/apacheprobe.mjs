// An Apache on station, its chin gun followed while it works: the turret's
// yaw and the barrel's elevation sampled through the fight, and a picture
// from close on the chin with the gun laid off the nose.
//   node tools/apacheprobe.mjs [level=westminster]  -> /tmp/out/apache-gun.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 240)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1');
} catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, ff = window.__fastForward;
  B.unlockAll = true; B.freeBuild = true;
  const o = B.primary.origin;
  B.callStrike('ah64', new T.Vector3(o.x, B.terrain.heightAt(o.x, o.z), o.z));
  let s = null;
  for (let k = 0; k < 600; k++) {
    ff(0.1, 0.05);
    s = B.air.sorties.find((x) => x.loiter && !x.loiter.orbit);
    if (s) s.hp = 1e9;            // the probe is about the gun, not the flak
    if (s && s.loiter.phase === 'station' && s.loiter.time > 3) break;
  }
  if (!s) return { none: true };
  const gun = s.model.userData.gun;
  const samples = [];
  for (let k = 0; k < 120; k++) {
    s.hp = 1e9;
    ff(0.1, 0.05);
    if (k % 6 === 0) samples.push([+(gun.rotation.y * 57.3).toFixed(0), +(gun.userData.pitch.rotation.x * 57.3).toFixed(0), s.loiter.gunAim ? 1 : 0]);
  }
  // Lay it well off the nose so the picture shows it can.
  const m = s.model;
  const side = new T.Vector3(-14, -18, 10).applyMatrix4(m.matrixWorld);
  s.loiter.gunAim = side; s.loiter.gunAimFor = 30;
  for (let k = 0; k < 20; k++) { s.hp = 1e9; ff(0.1, 0.05); }
  const p = m.getWorldPosition(new T.Vector3());
  return { phase: s.loiter.phase, kills: s.kills, samples, p: [p.x, p.y, p.z], yaw: m.rotation.y, gunYaw: +(gun.rotation.y * 57.3).toFixed(0), gunEl: +(gun.userData.pitch.rotation.x * 57.3).toFixed(0) };
});
console.log(JSON.stringify(r));
if (r.p) {
  await page.evaluate(([x, y, z, yaw]) => {
    const R = window.rig;
    R.target.set(x, y - 0.5, z); R.desiredTarget.copy(R.target);
    R.distance = R.desiredDistance = 11; R.pitch = R.desiredPitch = -0.05;
    R.yaw = R.desiredYaw = yaw - 0.9;
    R.minDistance = 4;
    for (let k = 0; k < 20; k++) R.update(0.1);
    document.body.classList.add('clear-view');
  }, [...r.p, r.yaw]);
  await page.keyboard.press('p');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/out/apache-gun.png' });
}
console.log(JSON.stringify({ errors }));
await b.close();
