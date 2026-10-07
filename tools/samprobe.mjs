// An infantry rocket team against a SAM compound on flat ground: the team is
// put down with a clear line to a launcher, the battery's target is laid on
// the launcher, and the fight is stepped until the launcher is wrecked or
// the clock runs out. Prints what the rounds hit, how many it took, and the
// same for the radar.
//   node tools/samprobe.mjs [level=westminster] [kind=at4]
import { chromium } from 'playwright';
const [level = 'westminster', kind = 'at4'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(async (kind) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  const S = B.sams;
  if (!S || !S.launchers.length) return { noSams: true };
  const res = { kind, launchers: S.launchers.length, bodies: S.bodies.length, sites: S.sites.length, tries: [] };
  // The hits on the way: what each round met.
  const hits = []; const oi = B._onImpact.bind(B);
  B._onImpact = (h) => { if (!h.proj.hostile) hits.push({ owner: h.owner ? (h.owner.sam || h.owner.def?.id || 'stone/other') : null, structureHit: h.structureHit, d: +Math.hypot(h.point.x - res.lx, h.point.z - res.lz).toFixed(1) }); return oi(h); };
  for (const l of S.launchers) {
    if (!l.alive) continue;
    res.lx = l.x; res.lz = l.z;
    // A spot a hundred metres out, level with the launcher, that the placement rules allow.
    let u = null, spot = null;
    for (let a = 0; a < 360 && !u; a += 15) for (const r of [70, 90, 110, 130, 150]) {
      const x = l.x + Math.cos(a * Math.PI / 180) * r, z = l.z + Math.sin(a * Math.PI / 180) * r;
      const p = new T.Vector3(x, terrain.heightAt(x, z), z);
      if (Math.abs(p.y - l.y) > 3) continue;
      if (!B.validPlacement(p, null).ok) continue;
      // A clear line from the shoulder to the launcher: the first collider on it must be the launcher's own.
      const from = { x, y: p.y + 1.3, z }, to = { x: l.x, y: l.y + 2.4, z: l.z };
      const dd = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z); const dir = { x: (to.x - from.x) / dd, y: (to.y - from.y) / dd, z: (to.z - from.z) / dd };
      const first = B.physics.castRay(from, dir, dd + 2);
      if (first && !(first.owner && first.owner.sam)) continue;
      B.deploy(kind, p); u = B.units[B.units.length - 1]; spot = p; break;
    }
    if (!u) { res.tries.push({ launcher: [l.x, l.z].map(Math.round), noSpot: true }); continue; }
    for (let k = 0; k < 90 && u.state !== 'ready'; k++) window.__fastForward(0.5, 1 / 30);
    B.setTarget(new T.Vector3(l.x, l.y + 2.4, l.z), 'tower');
    const hp0 = l.hp, n0 = hits.length;
    let shots = 0; const fired = B._fireOne.bind(B); B._fireOne = (unit, aim, o) => { const ok = fired(unit, aim, o); if (ok && unit === u) shots++; return ok; };
    for (let k = 0; k < 120 && l.alive; k++) window.__fastForward(0.5, 1 / 30);
    B._fireOne = fired;
    const aim = B.aimFor(u); res.tries.push({ launcher: [l.x, l.z].map(Math.round), range: Math.round(spot.distanceTo(new T.Vector3(l.x, l.y, l.z))), hp0, hp: Math.round(l.hp), dead: !l.alive, shots, state: u.state, hold: u.hold, cooldown: +u.cooldown.toFixed(1), aim: aim ? [aim.x, aim.y, aim.z].map(Math.round) : null, autoEngage: B.autoEngage, defRange: u.def.range, minRange: u.def.minRange, hits: hits.slice(n0).slice(0, 12) });
    B.removeUnit(u);
    if (res.tries.length >= 2) break;
  }
  // And the radar of the first compound, from the gap side.
  const site = S.sites[0]; const Rd = site?.radar;
  if (Rd?.alive) {
    res.lx = Rd.x; res.lz = Rd.z;
    let u = null, spot = null; const gy = terrain.heightAt(Rd.x, Rd.z);
    for (let a = 0; a < 360 && !u; a += 15) for (const r of [100, 130]) {
      const x = Rd.x + Math.cos(a * Math.PI / 180) * r, z = Rd.z + Math.sin(a * Math.PI / 180) * r;
      const p = new T.Vector3(x, terrain.heightAt(x, z), z);
      if (Math.abs(p.y - gy) > 3 || !B.validPlacement(p, null).ok) continue;
      const from = { x, y: p.y + 1.3, z }, to = { x: Rd.x, y: gy + 6, z: Rd.z };
      const dd = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z); const dir = { x: (to.x - from.x) / dd, y: (to.y - from.y) / dd, z: (to.z - from.z) / dd };
      const first = B.physics.castRay(from, dir, dd + 2);
      if (first && !(first.owner && first.owner.sam)) continue;
      B.deploy(kind, p); u = B.units[B.units.length - 1]; spot = p; break;
    }
    if (u) {
      for (let k = 0; k < 90 && u.state !== 'ready'; k++) window.__fastForward(0.5, 1 / 30);
      B.setTarget(new T.Vector3(Rd.x, gy + 6, Rd.z), 'tower');
      const n0 = hits.length; let shots = 0; const fired = B._fireOne.bind(B); B._fireOne = (unit, aim, o) => { const ok = fired(unit, aim, o); if (ok && unit === u) shots++; return ok; };
      for (let k = 0; k < 120 && Rd.alive; k++) window.__fastForward(0.5, 1 / 30);
      B._fireOne = fired;
      res.radar = { dead: !Rd.alive, hp: Math.round(Rd.hp), shots, hits: hits.slice(n0).slice(0, 10) };
    }
  }
  B._onImpact = oi;
  return res;
}, kind);
console.log(JSON.stringify({ level, out, errors: errors.slice(0, 5) }, null, 1));
await b.close();
