// Where each gun's round starts against where its barrel ends. Every cannon
// is put down on the range facing down the lanes; its model's vertices are
// taken into the gun's own frame (x right, y up, z forward), and the barrel's
// tip is the centre of the vertices within `TIP` metres of the most forward
// point that stand above the hull's mid-height (a barrel, not a bumper). The
// round's start is battle._muzzle(u), the point every shell, flash and puff of
// muzzle dust leaves from. Prints both and the gap, and the rest elevation of
// the barrel (from its last metre and a half), which is what a shot fired at
// any other elevation is visibly not doing.
//   node tools/muzzlecheck.mjs [kinds=m119,m777,m109,stryker]
import { chromium } from 'playwright';
const kinds = (process.argv[2] || 'm119,m777,m109,stryker').split(',');
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const r = await page.evaluate(async (kinds) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true;
  const out = [];
  let x = -120;
  for (const kind of kinds) {
    x += 45;
    const p = new T.Vector3(x, terrain.heightAt(x, 25), 25);
    B.deploy(kind, p); const u = B.units[B.units.length - 1];
    for (let k = 0; k < 120 && !(u.model && u.state === 'ready'); k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
    // Face down the lanes (-z), as a laid gun would; the crew stood down and
    // the barrel (when it has its own, barrel.js) laid level, so the most
    // forward metal is its muzzle.
    u.cooldown = 1e9;
    u.yaw = Math.PI; u.group.rotation.y = u.yaw;
    if (u.barrelB) { u.barrelElev = u.barrelWant = 0; u.recoilT = 0; B._updateBarrel(u, 0); }
    u.group.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(u.group.matrixWorld).invert();
    const pts = [];
    const v = new T.Vector3();
    (u.model || u.group).traverse((m) => {
      if (!m.isMesh || !m.visible) return;
      const a = m.geometry.attributes.position;
      const step = Math.max(1, Math.floor(a.count / 40000));
      for (let i = 0; i < a.count; i += step) { v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); pts.push(v.x, v.y, v.z); }
    });
    let maxZ = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < pts.length; i += 3) { maxZ = Math.max(maxZ, pts[i + 2]); minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
    // Group rotation y = PI makes model +z point to world -z; in the group's frame forward is +z.
    const midY = (minY + maxY) / 2;
    const TIP = 0.25;
    let n = 0, tx = 0, ty = 0, tz = 0;
    // The gun's own hint where something else stands further forward than the muzzle (the Stryker's slat cage).
    const hint = u.def.barrel?.tipY, okY = (y) => hint != null ? Math.abs(y - minY - hint) < (u.def.barrel.tipTol ?? 0.45) : y > minY + (maxY - minY) * 0.25;
    let fz = -1e9; for (let i = 0; i < pts.length; i += 3) if (okY(pts[i + 1])) fz = Math.max(fz, pts[i + 2]);
    for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] > fz - TIP && okY(pts[i + 1])) { tx += pts[i]; ty += pts[i + 1]; tz += pts[i + 2]; n++; }
    tx /= n; ty /= n; tz /= n;
    // The barrel's rest elevation: the centre of its section a metre and a half back from the tip.
    let n2 = 0, bx = 0, by = 0, bz = 0;
    for (let i = 0; i < pts.length; i += 3) { const dz = tz - pts[i + 2]; if (dz > 1.3 && dz < 1.7 && Math.abs(pts[i] - tx) < 0.35 && Math.abs(pts[i + 1] - (ty - dz * 0.2)) < 0.9) { bx += pts[i]; by += pts[i + 1]; bz += pts[i + 2]; n2++; } }
    by /= n2 || 1; bz /= n2 || 1;
    const elevDeg = n2 ? Math.atan2(ty - by, tz - bz) * 180 / Math.PI : null;
    // The round's start, in the same frame.
    const m = B._muzzle(u).applyMatrix4(inv);
    out.push({ kind, model: u.def.model, len: u.def.modelLength, tip: [tx, ty, tz].map((q) => +q.toFixed(2)), muzzle: [m.x, m.y, m.z].map((q) => +q.toFixed(2)), gap: +Math.hypot(m.x - tx, m.y - ty, m.z - tz).toFixed(2), restElevDeg: elevDeg == null ? null : +elevDeg.toFixed(1), def: u.def.muzzle, box: { y: [+minY.toFixed(2), +maxY.toFixed(2)], z: +maxZ.toFixed(2) } });
  }
  return out;
}, kinds);
for (const row of r) console.log(JSON.stringify(row));
await b.close();
