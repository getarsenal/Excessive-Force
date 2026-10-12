// What the town costs a frame, bucket by bucket: how many cells each merge
// is in, how many of them the camera sees, and the triangles drawn and
// skipped — at the level's own camera and at a fight camera low over the
// guns. The draw-call side of chunking the town (world/detail.js
// `mergeChunked`): a cell that is never culled is a draw call for nothing.
//
//   TIER=low node tools/townprobe.mjs boudhanath
//   TT_PORT=5178 node tools/townprobe.mjs boudhanath     # another build
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const tier = process.env.TIER || 'low';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
await page.addInitScript((tier) => { try {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);

const census = async (label) => {
  const r = await page.evaluate(() => {
    const eng = window.__engine, cam = eng.camera, T = window.THREE;
    for (let k = 0; k < 2; k++) window.__frame();
    cam.updateMatrixWorld();
    const fr = new T.Frustum();
    const m = new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    fr.setFromProjectionMatrix(m);
    const ctx = eng.scene.getObjectByName('context');
    const by = new Map();
    ctx.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const key = o.name || o.parent?.name || '?';
      let r = by.get(key);
      if (!r) by.set(key, r = { meshes: 0, seen: 0, tris: 0, drawn: 0, culled: 0 });
      r.meshes++; r.tris += tris;
      const vis = !o.frustumCulled || (g.boundingSphere || g.computeBoundingSphere() || g.boundingSphere) && fr.intersectsObject(o);
      if (vis) { r.seen++; r.drawn += tris; } else r.culled += tris;
    });
    eng.renderer.info.autoReset = false; eng.renderer.info.reset(); window.__frame();
    const inf = eng.renderer.info;
    const rows = [...by.entries()].map(([k, v]) => ({ bucket: k, ...v })).sort((a, b) => b.tris - a.tris);
    return { calls: inf.render.calls, tris: inf.render.triangles, rows };
  });
  console.log(`\n== ${label}: ${r.calls} calls, ${(r.tris / 1000).toFixed(0)}k triangles drawn`);
  console.log('bucket'.padEnd(14), 'meshes seen'.padStart(12), 'tris'.padStart(8), 'drawn'.padStart(8), 'culled'.padStart(8));
  let drawn = 0, culled = 0;
  for (const x of r.rows) {
    drawn += x.drawn; culled += x.culled;
    console.log(x.bucket.padEnd(14), `${x.meshes}/${x.seen}`.padStart(12), `${(x.tris / 1000).toFixed(0)}k`.padStart(8),
      `${(x.drawn / 1000).toFixed(0)}k`.padStart(8), `${(x.culled / 1000).toFixed(0)}k`.padStart(8));
  }
  console.log(`town drawn ${(drawn / 1000).toFixed(0)}k, culled ${(culled / 1000).toFixed(0)}k`);
  return r;
};

await census("level camera");
// A fight camera: low, close in on the guns' side of the building, as a
// player holds it while laying a battery.
await page.evaluate(() => {
  const B = window.battle, rig = window.__rig;
  const o = B.primary.origin;
  rig.focus(o.clone().add(new window.THREE.Vector3(0, 6, 110)), 70);
  rig.desiredPitch = rig.pitch = 0.42;
  rig.desiredYaw = rig.yaw = 0;
  rig.update?.(5);
  for (let k = 0; k < 20; k++) window.__frame();
});
await census("fight camera (70 m out, pitched 0.42)");

// The burn still finds every building: gut twenty and check that each one's
// pieces were folded in meshes whose spheres hold the building.
const burn = await page.evaluate(() => {
  const B = window.battle, cf = B.cityFire;
  const ctx = window.__engine.scene.getObjectByName('context');
  const plots = (ctx.userData.plots || []).filter((p) => !p.burnt && p.h > 3);
  const out = { tried: 0, found: 0, stray: 0, folded: 0, meshes: cf?.meshes?.length ?? 0 };
  if (!cf) return out;
  const V = new window.THREE.Vector3();
  for (let i = 0; i < Math.min(20, plots.length); i++) {
    const p = plots[Math.floor(i * plots.length / 20)];
    let hit = 0, stray = 0, folded = 0;
    cf.burn(p, 1, 99);
    for (const m of cf.meshes) {
      const r = m.userData.plotRanges?.get(p.index);
      if (!r) continue;
      hit++;
      const sph = m.geometry.boundingSphere;
      if (m.frustumCulled && sph && sph.distanceToPoint(V.set(p.x, p.base, p.z)) > 1) stray++;
      const pos = m.geometry.attributes.position;
      for (const [s, n] of r) for (let k = s; k < s + n; k++) if (Math.abs(pos.getX(k) - p.x) < 1e-3 && Math.abs(pos.getZ(k) - p.z) < 1e-3) folded++;
    }
    out.tried++; if (hit) out.found++; out.stray += stray; out.folded += folded;
  }
  return out;
});
console.log(`\nburn: ${burn.found}/${burn.tried} buildings found in ${burn.meshes} city meshes, ${burn.folded} vertices folded, ${burn.stray} ranges in a mesh whose sphere does not hold the building`);
await b.close();
