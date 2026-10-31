/**
 * The field works up close and from a gun line: a trench bay at 25 m and
 * 120 m and a gun pit at 25 m, framed from the garrison's own positions.
 *
 *   node tools/worksshot.mjs [level] [out dir]
 */
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', out = process.argv[3] || '/tmp/out/works';
import { mkdirSync } from 'fs';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
await page.addInitScript(() => { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}${process.env.QS ? '&' + process.env.QS : ''}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
await page.evaluate(() => window.hud.setClearView(true));
// A bay: the works mesh vertices cluster on the bays; pick the cluster
// nearest the camera's side of the landmark.
const spots = await page.evaluate(() => {
  const g = window.engine.scene.getObjectByName('fieldworks');
  const pts = [];
  g.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 97) pts.push([p.getX(i), p.getY(i), p.getZ(i)]);
  });
  const r = window.rig;
  const cx = Math.sin(r.yaw) * 200, cz = Math.cos(r.yaw) * 200;
  pts.sort((a, b) => Math.hypot(a[0] - cx, a[2] - cz) - Math.hypot(b[0] - cx, b[2] - cz));
  return { bay: pts[0], yaw: r.yaw };
});
const shoot = async (name, d, pitch) => {
  await page.evaluate(([p, d, pi, ya]) => {
    const r = window.rig;
    r.target.set(p[0], p[1], p[2]); r.desiredTarget.copy(r.target);
    r.yaw = r.desiredYaw = ya; r.pitch = r.desiredPitch = pi; r.distance = r.desiredDistance = d;
  }, [spots.bay, d, pitch, spots.yaw]);
  await page.waitForTimeout(3500);
  try { await page.screenshot({ path: `${out}/${level}-${name}.png`, timeout: 120000 }); console.log('wrote', `${out}/${level}-${name}.png`); } catch { console.log(name, 'screenshot timed out'); }
};
await shoot('near', 25, 0.45);
await shoot('far', 120, 0.35);
await b.close();
