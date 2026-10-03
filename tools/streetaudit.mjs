// What is wrong with a level's streets, counted: two carriageways that cross
// with no junction, a road lying along another, a street through a building,
// a street ending in the water, and the dead ends left inside the map.
//
//   node tools/streetaudit.mjs <level>... [--tier medium] [--shots DIR] [--dead] [--wet]
//
// One line a level, then the worst few of each fault with where they are.
// With --shots, a top-down picture of each worst case.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const levels = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const tier = opt('tier', 'medium'), shots = opt('shots', null);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
for (const level of levels) {
  const page = await b.newPage({ viewport: { width: 800, height: 600 } });
  await page.addInitScript((t) => { try {
    localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.suite', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
  await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.cityGroup, null, { timeout: 400000 });
  const r = await page.evaluate(() => {
    const net = window.cityGroup.userData.network, T = window.terrain;
    const plots = window.cityGroup.userData.plots || [];
    const W = { avenue: 13 / 2 + 4.4 + 0.8, street: 8.8 / 2 + 3.2 + 0.6, mews: 3 + 1.9 + 0.45 };
    const segs = [];
    net.edges.forEach((e, ei) => {
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const p = e.pts[i], q = e.pts[i + 1];
        segs.push({ ei, e, p, q, half: W[e.cls] || 6, x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), z0: Math.min(p.z, q.z), z1: Math.max(p.z, q.z) });
      }
    });
    const C = 30, grid = new Map();
    segs.forEach((s, si) => {
      for (let cx = Math.floor((s.x0 - 12) / C); cx <= Math.floor((s.x1 + 12) / C); cx++) {
        for (let cz = Math.floor((s.z0 - 12) / C); cz <= Math.floor((s.z1 + 12) / C); cz++) {
          const k = cx * 8192 + cz; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(si);
        }
      }
    });
    const near = (x, z, pad) => {
      const out = new Set();
      for (let cx = Math.floor((x - pad) / C); cx <= Math.floor((x + pad) / C); cx++) {
        for (let cz = Math.floor((z - pad) / C); cz <= Math.floor((z + pad) / C); cz++) for (const i of grid.get(cx * 8192 + cz) || []) out.add(i);
      }
      return out;
    };
    const cross = (a, b2) => {
      const d1x = a.q.x - a.p.x, d1z = a.q.z - a.p.z, d2x = b2.q.x - b2.p.x, d2z = b2.q.z - b2.p.z;
      const den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) return null;
      const t = ((b2.p.x - a.p.x) * d2z - (b2.p.z - a.p.z) * d2x) / den;
      const u = ((b2.p.x - a.p.x) * d1z - (b2.p.z - a.p.z) * d1x) / den;
      if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
      return { x: a.p.x + d1x * t, z: a.p.z + d1z * t };
    };
    const segDist = (x, z, s) => {
      const dx = s.q.x - s.p.x, dz = s.q.z - s.p.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.p.x) * dx + (z - s.p.z) * dz) / L2));
      return Math.hypot(x - s.p.x - dx * t, z - s.p.z - dz * t);
    };
    const shares = (e1, e2) => e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b;
    const crossings = [], along = [];
    const seenAlong = new Set();
    segs.forEach((s, si) => {
      if (s.e.bridge || s.e.bank) return;
      for (const sj of near((s.p.x + s.q.x) / 2, (s.p.z + s.q.z) / 2, Math.hypot(s.q.x - s.p.x, s.q.z - s.p.z) / 2 + 14)) {
        if (sj <= si) continue;
        const o = segs[sj];
        if (o.ei === s.ei || o.e.bridge || o.e.bank) continue;
        const c = cross(s, o);
        if (c && Math.hypot(c.x, c.z) < T.span) {
          crossings.push({ x: Math.round(c.x), z: Math.round(c.z), a: s.e.cls, b: o.e.cls });
          continue;
        }
        // Lying along: the midpoint of one inside the other's carriageway,
        // running the same way, and not two roads meeting at a junction.
        const mx = (s.p.x + s.q.x) / 2, mz = (s.p.z + s.q.z) / 2;
        const L = Math.hypot(s.q.x - s.p.x, s.q.z - s.p.z), L2 = Math.hypot(o.q.x - o.p.x, o.q.z - o.p.z);
        if (L < 4 || L2 < 4) continue;
        const dot = Math.abs(((s.q.x - s.p.x) * (o.q.x - o.p.x) + (s.q.z - s.p.z) * (o.q.z - o.p.z)) / (L * L2));
        if (dot < 0.9) continue;
        if (segDist(mx, mz, o) < (s.half + o.half) * 0.6) {
          if (shares(s.e, o.e)) {
            const n = [s.e.a, s.e.b].find((k) => k === o.e.a || k === o.e.b);
            const nd = net.nodes[n];
            if (nd && Math.hypot(mx - nd.x, mz - nd.z) < 25) continue;
          }
          const key = `${Math.min(s.ei, o.ei)}|${Math.max(s.ei, o.ei)}`;
          if (seenAlong.has(key)) continue;
          seenAlong.add(key);
          along.push({ x: Math.round(mx), z: Math.round(mz), a: s.e.cls, b: o.e.cls });
        }
      }
    });
    // Through a building: a carriageway centre point inside a plot.
    const through = [];
    const inPlot = (x, z, p) => {
      if (p.outline) {
        let inside = false;
        for (let i = 0, j = p.outline.length - 1; i < p.outline.length; j = i++) {
          const a = p.outline[i], q = p.outline[j];
          if ((a.z > z) !== (q.z > z) && x < (q.x - a.x) * (z - a.z) / (q.z - a.z) + a.x) inside = !inside;
        }
        return inside;
      }
      const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0), dx = x - p.x, dz = z - p.z;
      return Math.abs(dx * c - dz * s) < p.w / 2 - 0.5 && Math.abs(dx * s + dz * c) < p.d / 2 - 0.5;
    };
    const pg = new Map();
    plots.forEach((p, i) => { const k = Math.floor(p.x / C) * 8192 + Math.floor(p.z / C); let a = pg.get(k); if (!a) pg.set(k, a = []); a.push(i); });
    for (const s of segs) {
      if (s.e.bridge || s.e.bank) continue;
      const L = Math.hypot(s.q.x - s.p.x, s.q.z - s.p.z);
      for (let t = 0; t <= L; t += 4) {
        const x = s.p.x + (s.q.x - s.p.x) * t / (L || 1), z = s.p.z + (s.q.z - s.p.z) * t / (L || 1);
        const cx = Math.floor(x / C), cz = Math.floor(z / C);
        let hit = null;
        for (let ox = -1; ox <= 1 && !hit; ox++) for (let oz = -1; oz <= 1 && !hit; oz++) for (const i of pg.get((cx + ox) * 8192 + cz + oz) || []) if (inPlot(x, z, plots[i])) { hit = plots[i]; break; }
        if (hit) { through.push({ x: Math.round(x), z: Math.round(z), cls: s.e.cls }); break; }
      }
    }
    // Wet road and dead ends.
    let wet = 0; const wetAt = [];
    for (const s of segs) {
      if (s.e.bridge) continue;
      const mx = (s.p.x + s.q.x) / 2, mz = (s.p.z + s.q.z) / 2;
      if (T.isWater(mx, mz)) { wet++; if (wetAt.length < 6) wetAt.push({ x: Math.round(mx), z: Math.round(mz) }); }
    }
    const dead = net.nodes.filter((n) => n.links.length === 1 && Math.abs(n.x) < T.span - 70 && Math.abs(n.z) < T.span - 70);
    const uniq = (arr) => { const out = []; for (const a of arr) if (!out.some((o) => Math.hypot(o.x - a.x, o.z - a.z) < 20)) out.push(a); return out; };
    return { edges: net.edges.length, crossings: uniq(crossings), along: uniq(along), through: uniq(through), wet, wetAt,
      dead: dead.length, deadAt: dead.slice(0, 6).map((n) => ({ x: Math.round(n.x), z: Math.round(n.z) })) };
  });
  console.log(`${level}: ${r.edges} roads · ${r.crossings.length} crossings without a junction · ${r.along.length} lying along another · ${r.through.length} through a building · ${r.wet} wet pieces · ${r.dead} dead ends`);
  for (const k of ['crossings', 'along', 'through', 'wetAt', 'deadAt']) {
    if (r[k].length) console.log(`  ${k}: ${r[k].slice(0, 8).map((q) => `(${q.x},${q.z})${q.a ? ` ${q.a}/${q.b}` : q.cls ? ` ${q.cls}` : ''}`).join(' ')}`);
  }
  if (shots) {
    mkdirSync(shots, { recursive: true });
    const pick = [...r.crossings.slice(0, 2), ...r.along.slice(0, 2), ...r.through.slice(0, 2),
      ...(args.includes('--dead') ? r.deadAt.slice(0, 4) : []),
      ...(args.includes('--wet') ? r.wetAt.slice(0, 2) : [])];
    let k = 0;
    for (const q of pick) {
      await page.evaluate((q) => {
        window.hud?.setClearView?.(true);
        const R = window.rig, T = window.terrain;
        R.target.set(q.x, T.heightAt(q.x, q.z), q.z); R.desiredTarget.copy(R.target);
        R.yaw = R.desiredYaw = 0; R.pitch = R.desiredPitch = 1.2; R.distance = R.desiredDistance = 110;
      }, q);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${shots}/${level}-street-${k++}.png`, timeout: 120000 }).catch(() => {});
    }
  }
  await page.close();
}
await b.close();
