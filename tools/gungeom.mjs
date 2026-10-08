// A gun model's shape in its unit's frame (x right, y up, z forward): for
// each half-metre slice along z, the height range of the metal above the
// hull's lower quarter, and the highest and most forward points. For
// finding where a barrel is when the obvious rules (most forward, highest)
// find something else.
//   node tools/gungeom.mjs <kind>
import { chromium } from 'playwright';
const kind = process.argv[2] || 'm777';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(async (kind) => {
  const B = window.battle, T = window.THREE;
  const def = window.UNITS ? null : null;
  const u0 = B.units.length;
  B.freeBuild = true; B.unlockAll = true;
  const p = new T.Vector3(0, window.terrain.heightAt(0, 30), 30);
  B.deploy(kind, p); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 120 && !u.model; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
  u.yaw = 0; u.group.rotation.y = 0; u.barrel && (u.barrelElev = u.barrelB.rest, B._updateBarrel(u, 0));
  u.group.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(u.group.matrixWorld).invert();
  let rowsH = []; const pts = []; const v = new T.Vector3();
  u.model.traverse((m) => { if (!m.isMesh) return; const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); pts.push([v.x, v.y, v.z]); } });
  let maxY = -1e9, maxZ = -1e9, top = null, front = null;
  for (const q of pts) { if (q[1] > maxY) { maxY = q[1]; top = q; } if (q[2] > maxZ) { maxZ = q[2]; front = q; } }
  const slices = {};
  for (const q of pts) { const k = Math.floor(q[2] * 2) / 2; const s = slices[k] || (slices[k] = { lo: 1e9, hi: -1e9, n: 0, xs: [1e9, -1e9] }); s.lo = Math.min(s.lo, q[1]); s.hi = Math.max(s.hi, q[1]); s.n++; s.xs[0] = Math.min(s.xs[0], q[0]); s.xs[1] = Math.max(s.xs[1], q[0]); }
  const rows = Object.keys(slices).map(Number).sort((a, b) => b - a).map((k) => `z ${k.toFixed(1)}: y ${slices[k].lo.toFixed(2)}..${slices[k].hi.toFixed(2)} x ${slices[k].xs[0].toFixed(2)}..${slices[k].xs[1].toFixed(2)} n ${slices[k].n}`);
  const zf = +(globalThis.__ZF ?? 3.6);
  const hist = {};
  for (const q of pts) if (q[2] > zf) { const k = (Math.round(q[1] * 10) / 10).toFixed(1); const h = hist[k] || (hist[k] = { n: 0, z: -1e9, x: [1e9, -1e9] }); h.n++; h.z = Math.max(h.z, q[2]); h.x[0] = Math.min(h.x[0], q[0]); h.x[1] = Math.max(h.x[1], q[0]); }
  rowsH = Object.keys(hist).sort((a, b) => b - a).map((k) => `y ${k}: n ${hist[k].n} zmax ${hist[k].z.toFixed(2)} x ${hist[k].x[0].toFixed(2)}..${hist[k].x[1].toFixed(2)}`);
  return { rowsH, top: top.map((q) => +q.toFixed(2)), front: front.map((q) => +q.toFixed(2)), barrel: u.barrelB ? { rest: +(u.barrelB.rest * 57.3).toFixed(1), pivot: u.barrelB.pivot.map((q) => +q.toFixed(2)), tip: u.barrelB.tip.map((q) => +q.toFixed(2)) } : null, rows };
}, kind);
console.log(JSON.stringify({ top: r.top, front: r.front, barrel: r.barrel }));
console.log(process.env.HIST ? r.rowsH.join('\n') : r.rows.join('\n'));
await b.close();
