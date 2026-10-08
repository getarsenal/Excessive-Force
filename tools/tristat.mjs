// The triangles of a gun's model that touch a box (unit frame: x right, y
// up, z forward), with their own extents: for finding why a cut leaves a
// part behind (a face that runs on past the band, a panel shared with the hull).
//   BOX=x0,x1,y0,y1,z0,z1 node tools/tristat.mjs <kind>
import { chromium } from 'playwright';
const kind = process.argv[2] || 'm270';
const box = (process.env.BOX || '-1.3,1.3,2.25,2.45,-3.4,-0.8').split(',').map(Number);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(async ([kind, box]) => {
  const B = window.battle, T = window.THREE;
  B.freeBuild = true; B.unlockAll = true;
  B.deploy(kind, new T.Vector3(0, window.terrain.heightAt(0, 30), 30)); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 120 && !u.model; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
  u.cooldown = 1e9; u.yaw = 0; u.group.rotation.y = 0; u.group.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(u.group.matrixWorld).invert();
  const out = []; const v = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const inBox = (p) => p.x > box[0] && p.x < box[1] && p.y > box[2] && p.y < box[3] && p.z > box[4] && p.z < box[5];
  u.model.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry, a = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : a.count;
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(a, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      if (!v.some(inBox)) continue;
      const mn = [0, 1, 2].map((c) => Math.min(...v.map((q) => q.getComponent(c)))), mx = [0, 1, 2].map((c) => Math.max(...v.map((q) => q.getComponent(c))));
      out.push({ part: m.parent?.name || '', min: mn.map((q) => +q.toFixed(2)), max: mx.map((q) => +q.toFixed(2)) });
    }
  });
  const big = out.filter((t) => (t.max[2] - t.min[2]) > 1 || (t.max[1] - t.min[1]) > 0.8).slice(0, 25);
  const parts = {}; for (const t of out) parts[t.part] = (parts[t.part] || 0) + 1;
  return { n: out.length, big, parts, sample: out.filter((t) => t.part === 'hull').slice(0, 8) };
}, [kind, box]);
console.log('triangles touching the box: ' + r.n);
console.log(JSON.stringify(r.parts)); for (const t of r.big.concat(r.sample)) console.log(JSON.stringify(t));
await b.close();
