// The M240's flash from the gunner's eye: a burst fired, a frame caught
// mid-burst, the hot pixels in the middle of the picture counted — once as
// the hand's flash is, once scaled back up to the field's for comparison.
import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.text().startsWith('[flash]')) console.log(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const hot = async (tag) => {
  const r = await page.evaluate(() => {
    const c = window.__engine.renderer.domElement;
    const w = c.width, h = c.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(c, 0, 0);
    const d = g.getImageData(Math.floor(w * 0.2), Math.floor(h * 0.3), Math.floor(w * 0.6), Math.floor(h * 0.4)).data;
    let hotN = 0, n = d.length / 4, lum = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; lum += l; if (d[i] > 235 && d[i + 1] > 215 && d[i + 2] > 180) hotN++; }
    return { hot: +(100 * hotN / n).toFixed(2), lum: Math.round(lum / n) };
  });
  console.log(JSON.stringify({ tag, ...r }));
  await page.screenshot({ path: `/tmp/out/flash-${tag}.png`, timeout: 120000 }).catch(() => {});
};
await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  const p = new T.Vector3(-22, terrain.heightAt(-22, 20), 20);
  B.deploy('m240', p); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  window.__lay.enter(u);
  for (let k = 0; k < 40 && (u.burstLeft > 0 || u.cooldown > 0); k++) window.__fastForward(0.2, 1 / 30);
  B.layTurn(0, 0);
  window.__frame();
  window.__u = u;
});
await hot('quiet');
await page.evaluate(() => {
  const B = window.battle;
  window.__lay.fire();
  // Two rounds in, the flash of the last fresh.
  window.__fastForward(0.09, 1 / 60);
  window.__frame();
  console.log('[flash] flashes ' + B.tracerFX.flashes.length + ' sizes ' + B.tracerFX.flashes.map((f) => f.size.toFixed(2) + '/' + f.gain + '/' + f.minPx).join(' '));
});
await hot('hand');
await page.evaluate(() => {
  const B = window.battle;
  for (const f of B.tracerFX.flashes) { f.size *= 5; f.gain = 1; f.minPx = 3; f.t = 0.01; f.life = 0.072; }
  B.tracerFX.update(0); window.__engine.renderer.render(window.__engine.scene, window.rig.camera);
});
await hot('field');
await b.close();
