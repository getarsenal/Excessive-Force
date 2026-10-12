// The garrison from 120 m and from 30 m, with the near and far figure counts
// (defenders.js `meshFar`): node tools/garrisonshot.mjs [level]
import { chromium } from 'playwright';
const level = process.argv[2] || 'boudhanath';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:5177/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(3000);
for (const [name, dist, dz] of [['far', 120, 60], ['near', 30, 70]]) {
  await page.evaluate(([dist, dz]) => {
    const B = window.battle, rig = window.__rig, o = B.primary.origin;
    B.airborne.auto = false; B.assault.auto = false;
    document.getElementById('ui')?.style.setProperty('visibility', 'hidden');
    rig.focus(o.clone().add(new window.THREE.Vector3(0, 4, dz)), dist);
    rig.desiredPitch = rig.pitch = 0.25; rig.desiredYaw = rig.yaw = 0; rig.update?.(5);
    for (let k = 0; k < 10; k++) window.__frame();
  }, [dist, dz]);
  const n = await page.evaluate(() => ({ near: window.battle.garrison.mesh.count, far: window.battle.garrison.meshFar?.count ?? null }));
  try { await page.screenshot({ path: `/tmp/out/town/garrison-${name}.png`, timeout: 120000 }); } catch { console.log('screenshot timed out: rasteriser busy'); }
  console.log(name, JSON.stringify(n));
}
await b.close();
