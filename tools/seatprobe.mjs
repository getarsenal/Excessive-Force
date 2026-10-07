// The gunner's seat, driven: a gunship (or an Apache) called on the tower,
// the seat taken as it comes on station, the cross dragged, the 105 (or
// the rockets) fired, the 30 mm held; the hand-laid rounds counted and
// where they landed against the cross, and a picture through the sensor.
//   node tools/seatprobe.mjs [level=westminster] [kind=ac130|ah64]  -> /tmp/out/seat-<kind>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const [level = 'westminster', kind = 'ac130'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const r = await page.evaluate(async (kind) => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  if (B.garrison) B.garrison.fireEnabled = false;
  if (B.sams) B.sams.sites.forEach((st) => { st.alive = false; });
  const target = new T.Vector3(o.x, B.originGround + 6, o.z);
  B.setTarget(target, 'tower');
  const s = B.callStrike(kind, target);
  if (!s) return { called: false };
  const out = { called: true, btn: [] };
  // To station.
  for (let k = 0; k < 120 && s.loiter.phase !== 'station'; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 8)); }
  out.phase = s.loiter.phase;
  window.__frame();
  out.btn.push(!document.getElementById('seat-btn').hidden);
  out.seatable = B.seatable().length;
  window.__seat.enter(s);
  window.__frame();
  const S = B.seat;
  if (!S) return { ...out, seat: false };
  out.seat = true; out.hand = s.loiter.hand; out.sight = document.querySelector('#lay-sight')?.className; out.thermal = document.body.classList.contains('optics-thermal');
  out.fov = +window.rig.camera.fov.toFixed(1);
  const q = S.aim.clone().project(window.rig.camera);
  out.centred = Math.hypot(q.x, q.y) < 0.03;
  // Drag the cross forty metres and see it move on the ground; it stays
  // there, on open ground beside the tower, for the rounds to be measured on.
  const a0 = S.aim.clone();
  // Toward the aircraft, so the line from its guns to the cross is clear of the tower.
  const tw = new T.Vector3(s.model.position.x - a0.x, 0, s.model.position.z - a0.z).normalize();
  B.seatMove(tw.x * 40, tw.z * 40);
  out.moved = +S.aim.distanceTo(a0).toFixed(1);
  // Weapon one, twice, each round's fall against the cross at firing.
  const falls = []; const oi = B._onImpact.bind(B);
  B._onImpact = (hit) => { if (hit.proj.hand) falls.push(+hit.point.distanceTo(S.look).toFixed(1)); return oi(hit); };
  out.lookOff = +S.look.distanceTo(S.aim).toFixed(1);
  let fired = 0;
  for (let i = 0; i < 2; i++) {
    S.cooldown = 0;
    if (B.seatFire()) fired++;
    for (let k = 0; k < 40 && falls.length < i + 1; k++) { window.__fastForward(0.1, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  }
  out.fired = fired; out.falls = falls.slice();
  // The 30 mm, held for two seconds.
  window.__seat.switch();
  const tr0 = B.tracerFX?.fired || 0;
  window.__seat.hold(true);
  for (let k = 0; k < 20; k++) { window.__fastForward(0.1, 1 / 30); window.__frame(); await new Promise((r) => setTimeout(r, 5)); }
  window.__seat.hold(false);
  out.tracers = (B.tracerFX?.fired || 0) - tr0;
  out.weapon = document.getElementById('lay-wpn')?.textContent;
  out.read = document.getElementById('lay-read')?.textContent;
  B._onImpact = oi;
  // Back to the first weapon for the picture.
  window.__seat.switch();
  return out;
}, kind);
console.log(JSON.stringify(r));
await page.waitForTimeout(500);
await page.screenshot({ path: `/tmp/out/seat-${kind}.png`, timeout: 240000 }).catch((e) => console.log('shot: ' + String(e).slice(0, 80)));
const after = await page.evaluate(() => { const B = window.battle; window.__seat.exit(); window.__frame(); return { seat: !!B.seat, laying: document.body.classList.contains('laying'), thermal: document.body.classList.contains('optics-thermal'), rig: window.rig.enabled }; });
console.log(JSON.stringify({ after, errors }));
await b.close();
