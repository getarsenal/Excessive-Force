import { chromium } from 'playwright';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${process.env.TT_LEVEL || 'range'}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  const p = new T.Vector3(-22, terrain.heightAt(-22, 20), 20);
  B.deploy('m240', p); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  window.__lay.enter(u); window.__frame();
});
const sample = async (tag, fn) => {
  const r = await page.evaluate(async ([tag, src]) => {
    const E = window.__engine, T = window.THREE;
    let view = null; E.scene.traverse((o) => { if (o.userData && o.userData.belt) view = o; });
    const fn = new Function('view', 'E', 'T', src); fn(view, E, T);
    window.__frame();
    await new Promise((r) => requestAnimationFrame(r));
    // Read the canvas right after our own render so the buffer is fresh.
    const cam = window.rig.camera;
    E.composer ? E.composer.render() : E.renderer.render(E.scene, cam);
    const gl = E.renderer.getContext(); const c = E.renderer.domElement;
    const px = (x, y) => { const d = new Uint8Array(4); gl.readPixels(Math.round(x * c.width / innerWidth), Math.round(c.height - y * c.height / innerHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, d); return [d[0], d[1], d[2]]; };
    return { tag, body: px(196, 640), left: px(80, 700), barrel: px(196, 520), floor: px(60, 540) };
  }, [tag, fn]);
  console.log(JSON.stringify(r));
};
page.on('console', (m) => { if (m.text().startsWith('[v]')) console.log(m.text()); });
const plane = (d, h, w) => `view.visible = false; for (const m of (window.__pl || [])) E.scene.remove(m); window.__pl = []; const cam = window.rig.camera; const f = new T.Vector3(0,0,-1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
  const g = new T.PlaneGeometry(${w}, ${w}).rotateX(-Math.PI/2); const m = new T.Mesh(g, new T.MeshStandardMaterial({color: 0x808080})); m.position.copy(cam.position).addScaledVector(f, ${d}); m.position.y -= ${h}; m.frustumCulled = false; E.scene.add(m); window.__pl.push(m);`;
await sample('p d0.35 h0.20', plane(0.35, 0.2, 0.3));
await sample('p d0.25 h0.08', plane(0.25, 0.08, 0.2));
await sample('p d0.20 h0.06', plane(0.2, 0.06, 0.15));
await sample('p d0.20 h0.06 big', plane(0.2, 0.06, 0.6));
await sample('p d0.60 h0.20', plane(0.6, 0.2, 0.6));
await b.close();
