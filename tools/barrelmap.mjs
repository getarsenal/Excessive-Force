// A gun's metal mapped round its barrel's line: in metre bins back from the
// muzzle (t), the spread of points square to the line, up (u) and across
// (s), of everything within two metres of it, for placing a barrel's cut and
// its trunnions where the model's own parts say they are.
//   node tools/barrelmap.mjs <kind> [elevDeg]
import { chromium } from 'playwright';
const kind = process.argv[2] || 'm777', elevArg = process.argv[3];
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 } });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.evaluate(([v, b2]) => { globalThis.__SMAX = v; globalThis.__BIN = b2; }, [process.env.SMAX || 2, process.env.BIN || 2]);
const rows = await page.evaluate(async ([kind, elevArg]) => {
  const B = window.battle, T = window.THREE;
  B.freeBuild = true; B.unlockAll = true;
  B.deploy(kind, new T.Vector3(0, window.terrain.heightAt(0, 30), 30)); const u = B.units[B.units.length - 1];
  for (let k = 0; k < 120 && !u.model; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
  u.cooldown = 1e9; u.yaw = 0; u.group.rotation.y = 0;
  if (u.barrelB) { u.barrelElev = u.barrelB.rest; u.recoilT = 0; B._updateBarrel(u, 0); }
  u.group.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(u.group.matrixWorld).invert();
  const pts = []; const v = new T.Vector3();
  u.model.traverse((m) => { if (!m.isMesh) return; const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); pts.push(v.x, v.y, v.z); } });
  // The muzzle: the model's tip as the barrel module found it, in the unit's frame.
  const BB = u.barrelB, my = u.model.rotation.y;
  const tipW = new T.Vector3().fromArray(BB.tip).add(new T.Vector3().fromArray(BB.pivot)).applyAxisAngle(new T.Vector3(0, 1, 0), my);
  const e = (elevArg != null ? +elevArg : BB.rest * 57.2958) * Math.PI / 180;
  const ax = new T.Vector3(0, Math.sin(e), Math.cos(e)), up = new T.Vector3(0, Math.cos(e), -Math.sin(e));
  const bins = {};
  for (let i = 0; i < pts.length; i += 3) {
    const dx = pts[i] - tipW.x, dy = pts[i + 1] - tipW.y, dz = pts[i + 2] - tipW.z;
    const t = -(dy * ax.y + dz * ax.z), uu = dy * up.y + dz * up.z, s = dx;
    if (t < -0.3 || t > 11 || Math.abs(uu) > 2 || Math.abs(s) > +(globalThis.__SMAX ?? 2)) continue;
    const k = Math.floor(t * (+(globalThis.__BIN ?? 2))) / (+(globalThis.__BIN ?? 2));
    const bn = bins[k] || (bins[k] = { n: 0, u: [9, -9], s: [9, -9], hist: {} });
    bn.n++; bn.u[0] = Math.min(bn.u[0], uu); bn.u[1] = Math.max(bn.u[1], uu); bn.s[0] = Math.min(bn.s[0], s); bn.s[1] = Math.max(bn.s[1], s);
    const h = (Math.round(uu * 5) / 5).toFixed(1); bn.hist[h] = (bn.hist[h] || 0) + 1;
  }
  return Object.keys(bins).map(Number).sort((a, b) => a - b).map((k) => {
    const bn = bins[k];
    const h = Object.keys(bn.hist).map(Number).sort((a, b) => b - a).map((q) => `${q}:${bn.hist[q.toFixed(1)]}`).join(' ');
    return `t ${k.toFixed(1)} n ${bn.n} u ${bn.u[0].toFixed(2)}..${bn.u[1].toFixed(2)} s ${bn.s[0].toFixed(2)}..${bn.s[1].toFixed(2)} | ${h}`;
  });
}, [kind, elevArg]);
console.log(rows.join('\n'));
await b.close();
