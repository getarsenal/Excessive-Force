// Can the player tell a machine gun is hitting anything? An M240 laid by
// hand on a man it can see, FIRE held in short bursts, and after each the
// gunner's tally (hits, men down, pinned), the hit marker's classes, the gun's
// card count (rounds on target of rounds fired) and the men drawn lying where
// they fell; then the crew left to fire on its own and the same counted.
// Photographs the sight mid-stream to /tmp/out/mghit-*.png.
//   node tools/mghitprobe.mjs [level=westminster]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
mkdirSync('/tmp/out', { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text().slice(0, 240)); });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const setup = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  if (B.garrison) B.garrison.fireEnabled = false;
  const g = B.garrison;
  // A spot with a man in the open in plain sight, inside the gun's reach.
  for (const rad of [90, 130, 170, 210]) for (let a = 0; a < 360; a += 15) {
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    const from = p.clone(); from.y += 0.6;
    const d = g.defenders.filter((d) => d.alive && !d.def.indirect && d.pos.distanceTo(p) < 240 && B._mgSees(from, d))
      .sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    if (!d) continue;
    B.deploy('m240', p);
    const u = B.units[B.units.length - 1];
    for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
    window.__u = u; window.__d = d;
    return { at: [Math.round(x), Math.round(z)], man: d.def.key, cover: d.cover || 'open', dist: Math.round(d.pos.distanceTo(p)) };
  }
  return null;
});
console.log('setup', JSON.stringify(setup));
if (!setup) { console.log('no spot'); await b.close(); process.exit(1); }
const rounds = [];
for (let burst = 0; burst < 4; burst++) {
  const r = await page.evaluate(async (burst) => {
    const B = window.battle, u = window.__u;
    if (!B.lay) window.__lay.enter(u);
    const L = B.lay;
    // Lay on the nearest man it can see.
    const from = B._muzzle(u);
    const d = B.garrison.defenders.filter((d) => d.alive && !d.def.indirect && B._mgSees(from, d))
      .sort((a, b) => a.pos.distanceTo(from) - b.pos.distanceTo(from))[0];
    if (!d) return { none: true };
    const v = d.muzzle.clone().sub(from);
    L.yaw = Math.atan2(v.x, v.z); L.elev = Math.atan2(v.y, Math.hypot(v.x, v.z));
    B.layTurn(0, 0);
    let marks = 0, kills = 0;
    const hit = document.getElementById('lay-hit');
    window.__lay.hold(true);
    for (let k = 0; k < 24; k++) {
      window.__fastForward(1 / 15, 1 / 30); window.__frame();
      if (hit.classList.contains('on')) marks++;
      if (hit.classList.contains('kill')) kills++;
      await new Promise((r) => setTimeout(r, 2));
    }
    window.__lay.hold(false);
    for (let k = 0; k < 6; k++) { window.__fastForward(0.25, 1 / 30); window.__frame(); }
    const g = B.garrison;
    const lying = g.defenders.filter((x) => !x.alive && !x.gone && x.diedAt != null).length;
    return { burst, dist: Math.round(d.pos.distanceTo(from)), impactOff: +L.impact.distanceTo(d.muzzle).toFixed(1), rounds: L.rounds, hitN: L.hitN || 0, killN: L.killN || 0,
      spot: document.getElementById('lay-spot').textContent, spotCls: document.getElementById('lay-spot').className, markFrames: marks, killFrames: kills,
      card: `${u.mgHits || 0}/${u.mgRounds || 0}`, lying, drawn: g.mesh.count, alive: g.aliveCount };
  }, burst);
  console.log(JSON.stringify(r));
  rounds.push(r);
  if (burst === 1) {
    await page.evaluate(async () => { const B = window.battle; window.__lay.hold(true); for (let k = 0; k < 8; k++) { window.__fastForward(1 / 15, 1 / 30); window.__frame(); } });
    await page.screenshot({ path: '/tmp/out/mghit-sight.png' });
    await page.evaluate(() => window.__lay.hold(false));
  }
}
// The crew on its own, and the men falling seen from the map.
const auto = await page.evaluate(async () => {
  const B = window.battle, u = window.__u;
  window.__lay.exit(); window.__frame();
  const h0 = u.mgHits || 0, r0 = u.mgRounds || 0, k0 = u.kills || 0;
  for (let k = 0; k < 60; k++) { window.__fastForward(0.25, 1 / 30); if (k % 4 === 0) window.__frame(); await new Promise((r) => setTimeout(r, 2)); }
  const g = B.garrison;
  return { hits: (u.mgHits || 0) - h0, rounds: (u.mgRounds || 0) - r0, kills: (u.kills || 0) - k0,
    lying: g.defenders.filter((x) => !x.alive && !x.gone && x.diedAt != null).length, drawn: g.mesh.count, alive: g.aliveCount };
});
console.log('auto', JSON.stringify(auto));
console.log('errors', JSON.stringify(errors));
await b.close();
