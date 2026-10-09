// Where a frame's triangles come from: the level as loaded, every visible
// mesh's triangles (times its instance count) summed by the scene's
// top-level groups and by material, with what of it casts shadows, how much
// falls inside the camera's frustum, and the draw calls. The phone's
// question is how much geometry goes through the GPU twice a frame (the view
// and the shadow map) and what of it the player can actually see.
//   TIER=medium node tools/triprobe.mjs [level=westminster]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await page.addInitScript((tier) => { try {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
} catch {} }, process.env.TIER || 'medium');
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const T = window.THREE, eng = window.__engine, cam = eng.camera, scene = eng.scene;
  cam.updateMatrixWorld();
  const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const groups = {}, mats = {};
  let total = 0, shadow = 0, inView = 0, meshes = 0;
  const tri = (m) => {
    const g = m.geometry; if (!g) return 0;
    const n = g.index ? g.index.count : (g.attributes.position?.count || 0);
    let t = n / 3;
    if (g.drawRange && g.drawRange.count !== Infinity) t = Math.min(t, g.drawRange.count / 3);
    if (m.isInstancedMesh) t *= m.count;
    else if (g.isInstancedBufferGeometry) t *= (g.instanceCount ?? 1);
    return t;
  };
  const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  // A top-level group, and under it the child the mesh hangs from, by name or kind.
  const nm = (p) => p.name || p.type + (p.userData?.kind ? ':' + p.userData.kind : '');
  const top = (o) => { let p = o, c = o; while (p.parent && p.parent !== scene) { c = p; p = p.parent; } return nm(p) + (p === o ? '' : ' / ' + (o.name || nm(c === p ? o : c)) + (o.geometry?.name ? ' [' + o.geometry.name + ']' : '')); };
  scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !visible(o)) return;
    const t = tri(o); if (!t) return;
    meshes++;
    total += t;
    let seen = true;
    if (o.frustumCulled && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!o.isInstancedMesh) seen = fr.intersectsSphere(s); }
    if (seen) inView += t;
    if (o.castShadow) shadow += t;
    const k = top(o);
    const G = groups[k] || (groups[k] = { tris: 0, meshes: 0, shadowTris: 0 });
    G.tris += t; G.meshes++; if (o.castShadow) G.shadowTris += t;
    const mk = (Array.isArray(o.material) ? o.material[0] : o.material)?.type || '?';
    mats[mk] = (mats[mk] || 0) + t;
  });
  eng.renderer.info.reset?.();
  eng.render();
  const info = eng.renderer.info.render;
  const out = Object.entries(groups).sort((a, b) => b[1].tris - a[1].tris).slice(0, 40).map(([k, v]) => `${k.padEnd(34)} ${String(Math.round(v.tris / 1000)).padStart(6)}k tris  ${String(v.meshes).padStart(4)} meshes  shadow ${Math.round(v.shadowTris / 1000)}k`);
  return { quality: window.quality.id, dpr: eng.renderer.getPixelRatio(), buffer: eng.renderer.getDrawingBufferSize(new T.Vector2()).toArray(), shadowMap: eng.renderer.shadowMap.enabled, autoUpdate: eng.renderer.shadowMap.autoUpdate, meshes, total: Math.round(total), inView: Math.round(inView), shadowCasters: Math.round(shadow), frameCalls: info.calls, frameTris: info.triangles, mats, out };
});
console.log(JSON.stringify({ ...r, out: undefined }, null, 1));
console.log(r.out.join('\n'));
await b.close();
