// One check from the suite, alone, the way the harness loads the level (the
// clock held, the tier forced), with every shell's impact recorded: where it
// burst, how far above the ground, and whether it touched the landmark.
// For chasing a single failure without the fifty around it.
//   TEST="shells actually reach" node tools/onetest.mjs <level> [port=5178]   TT_TIER=low
import { chromium } from 'playwright';
const level = process.argv[2] || 'rio', port = process.argv[3] || process.env.TT_PORT || 5178;
const match = process.env.TEST || 'shells actually reach';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript((tier) => { try { localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.suite', '1'); } catch {} }, process.env.TT_TIER || 'low');
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const out = await page.evaluate((match) => {
  const B = window.battle, T = window.terrain;
  const hits = [];
  const orig = B._onImpact.bind(B);
  B._onImpact = (hit) => {
    const p = hit.point, owner = hit.owner || hit.collider?.parent?.() || null;
    hits.push({ y: +(p.y - T.heightAt(p.x, p.z)).toFixed(1), at: [+p.x.toFixed(0), +p.y.toFixed(0), +p.z.toFixed(0)], kind: hit.proj?.kind, struct: !!(hit.structure || hit.chunk !== undefined || hit.owner?.structure) });
    return orig(hit);
  };
  const res = window.__runTest(match);
  const units = B.units.map((u) => [u.def.id, +u.pos.x.toFixed(0), +u.pos.y.toFixed(0), +u.pos.z.toFixed(0)]);
  return { res, hits: hits.slice(0, 20), units, target: B.target ? B.target.toArray().map((v) => +v.toFixed(0)) : null, origin: B.primary.origin.toArray().map((v) => +v.toFixed(0)) };
}, match);
console.log(JSON.stringify(out.res));
// DIAG=1: for the first gun, the shot the battle would choose and why.
if (process.env.DIAG) {
  console.log('diag', JSON.stringify(await page.evaluate(async () => {
    const B = window.battle, T = window.terrain, P = await import('/src/game/projectiles.js');
    const u = B.units.find((x) => x.alive && x.def.projectile);
    if (!u || !B.target) return { none: true };
    const p = u.def.projectile, from = B._muzzle(u), aim = B.target;
    const low = P.solveArc(from, aim, p.speed, p.gravity, false);
    const clear = (v) => B._trajectoryClear(from, v, p.gravity);
    const lofted = P.solveBallistic(from, aim, p.speed, p.gravity, 9.0, clear);
    const el = (v) => (v ? +(Math.atan2(v.y, Math.hypot(v.x, v.z)) * 57.3).toFixed(1) : null);
    const dx = aim.x - from.x, dz = aim.z - from.z, dl = Math.hypot(dx, dz);
    const prof = [0, 2, 4, 8, 16, 32, 64].map((d) => +(T.heightAt(from.x + dx / dl * d, from.z + dz / dl * d) - from.y).toFixed(1));
    return { speed: p.speed, muzzleAboveGround: +(from.y - T.heightAt(from.x, from.z)).toFixed(1), lowEl: el(low), lowClear: low ? clear(low) : null,
      loftedEl: el(lofted?.vel), barrelMax: u.barrelB ? +(u.barrelB.max * 57.3).toFixed(1) : null, groundAhead: prof, range: +dl.toFixed(0), rise: +(aim.y - from.y).toFixed(0), hold: u.hold || null };
  })));
}
console.log('target', JSON.stringify(out.target), 'origin', JSON.stringify(out.origin), 'units', JSON.stringify(out.units));
for (const h of out.hits) console.log('  impact', JSON.stringify(h));
console.log('errors', JSON.stringify(errors));
await b.close();
