// The cars, photographed: a stretch of kerb with its parked row and the
// traffic going past, from close (twelve metres) and from a playing distance
// (ninety), on a phone. Writes /tmp/out/cars/<level>-near.png and -far.png.
//   node tools/carshot.mjs [level=westminster] [port=5177]
import { chromium } from 'playwright';
import fs from 'node:fs';
const level = process.argv[2] || 'westminster', port = process.argv[3] || process.env.TT_PORT || 5177;
const out = '/tmp/out/cars';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 852, height: 480 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript((tier) => { try { localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, process.env.TIER || 'low');
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.addStyleTag({ content: '#ui, #hud, .hud, #topbar, #dock { display: none !important; }' });
for (const [name, dist, pitch] of [['near', 12, 0.32], ['far', 90, 0.6]]) {
  const info = await page.evaluate(({ dist, pitch }) => {
    const T = window.THREE, scene = window.__engine.scene, rig = window.__rig;
    // A parked car: the paint bucket's first vertex near a road, else the traffic.
    let at = null;
    const traffic = scene.getObjectByName('traffic');
    if (traffic && traffic.count) {
      const m = new T.Matrix4(); traffic.getMatrixAt(Math.floor(traffic.count / 3), m);
      at = new T.Vector3().setFromMatrixPosition(m);
    }
    if (!at) return { error: 'no car found' };
    rig.desiredTarget.copy(at); rig.target?.copy?.(at);
    rig.desiredDistance = dist; rig.distance = dist;
    rig.desiredPitch = pitch; rig.pitch = pitch;
    if (window.__frame) for (let k = 0; k < 4; k++) window.__frame();
    return { at: at.toArray().map((v) => +v.toFixed(1)), tris: window.__engine.renderer.info.render.triangles };
  }, { dist, pitch });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${level}-${name}.png` });
  console.log(name, JSON.stringify(info));
}
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close();
