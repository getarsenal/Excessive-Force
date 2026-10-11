// The howitzers at HIGH ANGLE: each of the M119, M777 and Paladin put on the
// ground, taken in the hand, switched to high angle, the ring laid on the
// landmark's middle, and fired. Prints, per gun, the lay's readout numbers
// (range, spread, elevation), every round's impact time and miss distance,
// and for the Paladin whether its MRSI string landed together.
//   node tools/highangleprobe.mjs [level=westminster] [port=5177]   GUNS=m119,m777,m109 SHOTS=4
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.argv[3] || process.env.TT_PORT || 5177;
const guns = (process.env.GUNS || 'm119,m777,m109').split(',');
const shots = +(process.env.SHOTS || 4);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const out = await page.evaluate(async ({ guns, shots }) => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.airlift = false; B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  if (B.garrison) B.garrison.fireEnabled = false;
  const res = [];
  const impacts = [];
  const prev = B._onImpact.bind(B);
  B._onImpact = (hit) => { if (hit.proj?.spot || hit.proj?.hand) impacts.push({ t: B.elapsed, p: hit.point.clone ? hit.point.clone() : hit.point }); return prev(hit); };
  const cam = window.__engine.camera.position, bear = Math.atan2(cam.x - o.x, cam.z - o.z);
  let k = 0;
  for (const id of guns) {
    let u = null;
    for (let r = 380; r < 700 && !u; r += 40) {
      for (let a = -0.6; a <= 0.6 && !u; a += 0.2) {
        const x = o.x + Math.sin(bear + a + k) * r, z = o.z + Math.cos(bear + a + k) * r;
        u = await B.deploy(id, new T.Vector3(x, window.terrain.heightAt(x, z), z));
      }
    }
    k += 0.25;
    if (!u) { res.push({ id, error: 'no ground' }); continue; }
    for (let i = 0; i < 40 && u.state !== 'ready'; i++) window.__fastForward(0.5, 1 / 30);
    B.startLay(u);
    const L = B.lay;
    const ok = B.setLayIndirect(true);
    // The ring on the landmark's middle: bearing, then range.
    const aim = new T.Vector3(o.x, B.terrain.heightAt(o.x, o.z), o.z);
    const yaw = Math.atan2(aim.x - L.from.x, aim.z - L.from.z);
    B.layTurn(yaw - L.yaw, 0);
    L.rangeWant = Math.hypot(aim.x - L.from.x, aim.z - L.from.z);
    B.layTurn(0, 0);
    const read = { id, indirect: L.indirect, ok, range: Math.round(L.range), want: Math.round(L.rangeWant), elevDeg: +(L.elev * 57.3).toFixed(1), spread: +B.laySpread(L).toFixed(1), tof: +L.tof.toFixed(1), from: L.from.toArray().map((v) => +v.toFixed(1)), pos: u.pos.toArray().map((v) => +v.toFixed(1)), ground: +B.terrain.heightAt(L.from.x, L.from.z).toFixed(1), vel: L.vel ? L.vel.toArray().map((v) => +v.toFixed(1)) : null, pts: L.pts.length };
    const fired = [];
    for (let s = 0; s < shots; s++) {
      for (let i = 0; i < 60 && !(u.cooldown <= 0 && u.state === 'ready'); i++) window.__fastForward(0.25, 1 / 30);
      const n0 = impacts.length, t0 = B.elapsed;
      const f = B.handFire();
      fired.push({ fired: f, spread: +B.laySpread(L).toFixed(1), adjust: L.adjust });
      for (let i = 0; i < 160 && impacts.length < n0 + (id === 'm109' ? 3 : 1); i++) window.__fastForward(0.25, 1 / 30);
      const mine = impacts.slice(n0);
      fired[s].lands = mine.map((m) => ({ t: +(m.t - t0).toFixed(2), miss: +Math.hypot(m.p.x - L.impact.x, m.p.z - L.impact.z).toFixed(1) }));
    }
    read.shots = fired;
    B.endLay();
    res.push(read);
  }
  return res;
}, { guns, shots });
for (const r of out) {
  console.log(r.id, JSON.stringify({ indirect: r.indirect, range: r.range, want: r.want, elev: r.elevDeg, spread: r.spread, tof: r.tof, from: r.from, pos: r.pos, ground: r.ground, vel: r.vel, pts: r.pts, error: r.error }));
  for (const s of r.shots || []) console.log('   ', JSON.stringify(s));
}
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close();
