// What one unit of each kind costs the GPU: a level at the phone's tier,
// one of every ground unit deployed, each model loaded, and per kind the
// triangles and the meshes (draw calls) its group draws, crew included.
// The question a big battery asks: five hundred guns at that price each.
// `drawn` is what the unit draws from where the camera is (the far model
// beyond LOD_DIST), `lowTris` the far model's own count.
//   node tools/unitcost.mjs [level=windsor] [tier=low]
import { chromium } from 'playwright';
const level = process.argv[2] || 'windsor', tier = process.argv[3] || 'low';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
page.on('console', (m) => { if (m.text().includes(' beyond ')) console.log(m.text()); });
await page.addInitScript((t) => { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const kinds = ['m240', 'at4', 'gustaf', 'rpg32', 'javelin', 'm120', 'm119', 'm777', 'm109', 'stryker', 'm270', 'm142'];
await page.evaluate((kinds) => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  let i = 0;
  for (let a = 0; a < 720 && i < kinds.length; a += 9) {
    const rad = 220 + (a % 90);
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad, p = new T.Vector3(x, window.terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    const n0 = B.units.length + B.pending.length;
    B.deploy(kinds[i], p);
    if (B.units.length + B.pending.length > n0) i++;
  }
}, kinds);
for (let k = 0; k < 40; k++) { await page.evaluate(() => window.__fastForward(1, 1 / 30)); await page.waitForTimeout(400); }
const out = await page.evaluate(() => {
  const res = {};
  for (const u of window.battle.units) {
    let tris = 0, meshes = 0, inst = 0;
    u.group.traverse((m) => {
      if (!m.isMesh || !m.visible) return;
      const g = m.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
      tris += n * (m.isInstancedMesh ? m.count : 1); meshes++; if (m.isInstancedMesh) inst++;
    });
    let lo = 0;
    u.modelLo?.traverse((m) => { if (m.isMesh) { const g = m.geometry; lo += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    res[u.def.id] = { drawn: Math.round(tris), meshes, far: !!u.lodFar, lowTris: Math.round(lo), camDist: Math.round(window.engine.camera.position.distanceTo(u.pos)), state: u.state };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
