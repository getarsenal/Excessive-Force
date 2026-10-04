// The tower that comes apart without being shot at. A battery on free fire
// (nothing designated), the tower never targeted, and everything that
// reaches the tower logged: every blast whose radius touches it, where, from
// what, and the moment a lean arms (band, height, ratio, what armed it).
//
//   node tools/slicerepro.mjs [level=tutorial] [seconds=240] [guns=8]
import { chromium } from 'playwright';
const level = process.argv[2] || 'tutorial';
const secs = +(process.argv[3] || 240), guns = +(process.argv[4] || 8);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 240)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1000);
const r = await page.evaluate(async ([secs, guns]) => {
  const B = window.battle, T = window.THREE, ff = window.__fastForward;
  window.__tutorial?.finish?.('skipped');
  const P = B.primary, o = P.origin || { x: 0, z: 0 };
  const log = [];
  const t = () => Math.round(B.elapsed * 10) / 10;
  // Bounding box of the primary's live stones.
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9;
  for (let i = 0; i < P.count; i++) {
    x0 = Math.min(x0, P.px[i] - P.hx[i]); x1 = Math.max(x1, P.px[i] + P.hx[i]);
    z0 = Math.min(z0, P.pz[i] - P.hz[i]); z1 = Math.max(z1, P.pz[i] + P.hz[i]); y1 = Math.max(y1, P.py[i]);
  }
  const box = { x0, x1, z0, z1, y1, gy: P.groundY };
  // Every blast that reaches the tower.
  const ex = P.explode.bind(P);
  P.explode = (c, lethal, radius, power, opts = {}) => {
    const dx = Math.max(x0 - c.x, 0, c.x - x1), dz = Math.max(z0 - c.z, 0, c.z - z1);
    const d = Math.hypot(dx, dz);
    const before = P.aliveCount ?? null;
    const res = ex(c, lethal, radius, power, opts);
    if (d < radius + 1) log.push(`${t()} BLAST at (${c.x.toFixed(1)},${(c.y - P.groundY).toFixed(1)},${c.z.toFixed(1)}) d=${d.toFixed(1)} r=${radius?.toFixed?.(1)} p=${Math.round(power)} src=${opts.source || opts.kind || opts.from || '?'} ${new Error().stack.split('\n').slice(2, 5).map((s) => s.trim().replace(/^at /, '').replace(/\(.*\/src\//, '(').slice(0, 60)).join(' < ')}`);
    return res;
  };
  // Free fire: guns down, nothing designated.
  B.freeBuild = true; B.unlockAll = true;
  let placed = 0;
  for (let k = 0; k < 200 && placed < guns; k++) {
    const a = k * 0.37, rr = 110 + (k % 5) * 18;
    const q = new T.Vector3(o.x + Math.sin(a) * rr, 0, o.z + Math.cos(a) * rr);
    q.y = B.terrain.heightAt(q.x, q.z);
    if (B.validPlacement(q).ok && await B.deploy(placed % 3 === 2 ? 'm777' : 'm119', q)) placed++;
  }
  B.target = null;
  let leaned = null, lastBand = null;
  const leanStr = () => {
    const L = P.lean;
    return L ? `band ${L.band} y=${(L.pivotY - P.groundY).toFixed(1)} ang ${(L.angle * 57.3).toFixed(2)} ratio ${L.ratio?.toFixed(2)} tip ${L.tip?.toFixed(2)} reach ${L.reachOut?.toFixed(2)} comH ${L.comH?.toFixed(1)} committed ${!!L.committed}` : null;
  };
  for (let s = 0; s < secs * 2; s++) {
    ff(0.5, 0.05);
    if (B.target) { log.push(`${t()} target set?! ${B.targetLabel}`); B.target = null; }
    const L = P.lean;
    if (L && L.band !== lastBand) { log.push(`${t()} LEAN ARMED ${leanStr()}`); lastBand = L.band; }
    if (L && (s % 4 === 0)) log.push(`${t()}   lean ${leanStr()}`);
    if (!L && lastBand !== null) { log.push(`${t()} lean gone; standing ${P.standingHeight().toFixed(1)} integ ${P.monumentIntegrity?.toFixed(3)}`); lastBand = null; }
    if (B.state !== 'playing') { log.push(`${t()} state ${B.state}`); break; }
  }
  return { box, placed, units: B.units.length, standing: P.standingHeight(), peak: P.peakLean, integ: P.monumentIntegrity, log: log.slice(0, 400) };
}, [secs, guns]);
console.log(JSON.stringify({ ...r, log: undefined }));
console.log(r.log.join('\n'));
console.log(JSON.stringify({ errors }));
await b.close();
