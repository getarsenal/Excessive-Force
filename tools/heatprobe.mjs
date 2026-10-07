// The barrel heat on the held guns: a machine gun laid and FIRE held, the
// heat read every half second until the gun locks and the lock lifts; then
// the gunship's 30 mm the same from the gunner's seat. Prints the trace,
// the bursts fired before the lock, the lock's length, and the trigger's
// classes while locked.
//   node tools/heatprobe.mjs [level=westminster]
import { chromium } from 'playwright';
const [level = 'westminster'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.text().startsWith('[heat]')) console.log(m.text()); });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  if (B.garrison) B.garrison.fireEnabled = false;
  if (B.sams) B.sams.sites.forEach((st) => { st.alive = false; });
  B.setTarget(new T.Vector3(o.x, B.originGround + 6, o.z), 'tower');
  const feed = []; const oe = B.onEvent; B.onEvent = (k, d) => { if (k === 'overheat') feed.push(k); return oe.call(B, k, d); };
  const tick = (sec) => { for (let k = 0; k < sec * 4; k++) { window.__fastForward(0.25, 1 / 30); window.__frame(); } };
  const btn = () => document.getElementById('lay-fire');
  const hold = async (H, label) => {
    const trace = []; let bursts = 0, lockedAt = -1, freedAt = -1, lockClasses = '', lockLabel = '';
    const ob = B._handBurst.bind(B), os = B.seatFire.bind(B);
    B._handBurst = (u, L) => { const ok = ob(u, L); if (ok) bursts++; return ok; };
    B.seatFire = () => { const ok = os(); if (ok) bursts++; return ok; };
    window.__lay.hold(true);
    for (let t = 0; t < 16; t += 0.5) {
      tick(0.5); await new Promise((r) => setTimeout(r, 2));
      console.log('[heat] ' + label + ' t=' + t + ' heat=' + H.heat.toFixed(2) + ' over=' + H.over.toFixed(1)); trace.push(`${t.toFixed(1)}:${H.heat.toFixed(2)}${H.over > 0 ? '!' : ''}`);
      if (H.over > 0 && lockedAt < 0) { lockedAt = t; lockClasses = btn().className; lockLabel = btn().textContent.trim(); }
      if (lockedAt >= 0 && H.over <= 0 && freedAt < 0) freedAt = t;
    }
    window.__lay.hold(false);
    B._handBurst = ob; B.seatFire = os;
    return { label, bursts, lockedAt, freedAt, lockClasses, lockLabel, heatAfterLock: freedAt >= 0 ? +H.heat.toFixed(2) : null, trace };
  };
  // The machine gun.
  let u = null;
  for (const rad of [180, 220, 260]) for (let a = 0; a < 360 && !u; a += 20) {
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    B.deploy('m240', p); u = B.units[B.units.length - 1];
  }
  for (let k = 0; k < 80 && u.state !== 'ready'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  console.log('[heat] mg ready'); window.__lay.enter(u);
  for (let k = 0; k < 40 && (u.burstLeft > 0 || u.cooldown > 0); k++) { window.__fastForward(0.2, 1 / 30); }
  const mg = await hold(B.lay, 'm240');
  window.__lay.exit(); window.__frame();
  // The gunship's 30 mm.
  const target = new T.Vector3(o.x, B.originGround + 6, o.z);
  const s = B.callStrike('ac130', target);
  console.log('[heat] called ' + !!s);
  if (!s) return { mg, gun: null, overheatEvents: feed.length };
  for (let k = 0; k < 120 && s.loiter.phase !== 'station'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 5)); if (k % 20 === 0) console.log('[heat] phase ' + s.loiter.phase + ' k=' + k); }
  console.log('[heat] on station ' + s.loiter.phase); window.__seat.enter(s); window.__frame();
  window.__seat.switch(); window.__frame();
  const S = B.seat;
  const w = B.seatWeapons(s)[S.weapon];
  const gun = await hold(S, `ac130 ${w.name}${w.hold ? ' (hold)' : ''}`);
  window.__seat.exit(); window.__frame();
  return { mg, gun, overheatEvents: feed.length };
});
console.log(JSON.stringify(r, null, 1));
console.log(JSON.stringify({ errors }));
await b.close();
