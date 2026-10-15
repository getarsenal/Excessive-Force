// The lasgun: calls LASER and then LANCE on a line through the landmark's
// foot, steps the fight through each beam, and prints what each cut:
// bites, stones, men, the beam's foot at the start and the end. `SHOT=1`
// photographs the LANCE mid-walk from the studio's side with the HUD off
// (/tmp/out/laser-<level>.jpg).
//   node tools/laserprobe.mjs [level=westminster] [low|medium]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const [level = 'westminster', tier = 'medium'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const SHOT = !!process.env.SHOT;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 200)); });
await page.addInitScript((tier) => { try { localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
for (const kind of ['laser', 'lance']) {
  const r = await page.evaluate(async ({ kind, SHOT }) => {
    const B = window.battle, T = window.THREE, o = B.primary.origin, rig = window.__rig;
    B.invulnerable = true; B.freeBuild = true; B.unlockAll = true; if (B.garrison) B.garrison.fireEnabled = false;
    B.airborne.auto = false; B.assault.auto = false;
    const stones = () => B.structures.reduce((n, s) => n + s.destroyedCount, 0);
    const killed0 = B.defendersKilled, stones0 = stones();
    // A line through the foot of the building, across the camera's look.
    const dx = o.x - B.camera.position.x, dz = o.z - B.camera.position.z, l = Math.hypot(dx, dz) || 1;
    const sx = -dz / l, sz = dx / l;
    const from = new T.Vector3(o.x - sx * 40, 0, o.z - sz * 40), to = new T.Vector3(o.x + sx * 40, 0, o.z + sz * 40);
    from.y = window.terrain.heightAt(from.x, from.z); to.y = window.terrain.heightAt(to.x, to.z);
    // Drawn, not straight: a hook through the foot, out and back round.
    const mid = new T.Vector3(o.x + dz / l * 30, 0, o.z - dx / l * 30);
    const beam = B.callStrike(kind, from, { path: [from, mid, to] });
    if (!beam) return { kind, error: 'not called' };
    const foot0 = beam.foot.clone();
    let t = 0, peakY = -1e9;
    const dur = beam.dur + 0.5;
    while (t < dur && !beam.done) {
      window.__fastForward(0.1, 1 / 60); t += 0.1;
      if (!beam.done) peakY = Math.max(peakY, beam.foot.y);
    }
    return { kind, bites: beam.bites, stones: stones() - stones0, men: B.defendersKilled - killed0, destroyedOnBeam: beam.destroyed || 0,
      foot0: foot0.toArray().map((v) => +v.toFixed(1)), foot1: beam.foot.toArray().map((v) => +v.toFixed(1)), peakY: +peakY.toFixed(1),
      beamsLeft: B.orbital.beams.length, money: B.money };
  }, { kind });
  console.log(JSON.stringify(r));
}
if (SHOT) {
  // The picture: a LANCE on open ground beside the building, the camera on
  // the beam from the side, wide and then close, each frame drawn and read
  // in one task (the drawing buffer is not kept between tasks).
  await page.evaluate(() => {
    const B = window.battle, T = window.THREE, o = B.primary.origin;
    document.getElementById('ui').style.visibility = 'hidden';
    const from = new T.Vector3(o.x + 60, 0, o.z - 40), to = new T.Vector3(o.x + 60, 0, o.z + 60);
    from.y = window.terrain.heightAt(from.x, from.z); to.y = window.terrain.heightAt(to.x, to.z);
    const mid = new T.Vector3(o.x + 95, 0, o.z + 10);
    const beam = B.callStrike('lance', from, { path: [from, mid, to] });
    window.__laserBeam = beam;
    let t = 0; while (t < beam.charge + beam.B.walk * 0.4) { window.__fastForward(0.1, 1 / 60); t += 0.1; }
  });
  const frame = (dist, pitch, up) => page.evaluate(({ dist, pitch, up }) => {
    const T = window.THREE, rig = window.__rig, E = window.__engine, beam = window.__laserBeam;
    rig.target.copy(beam.foot).add(new T.Vector3(0, up, 0)); rig.desiredTarget.copy(rig.target);
    rig.distance = rig.desiredDistance = dist; rig.pitch = rig.desiredPitch = pitch; rig.yaw = rig.desiredYaw = 2.2;
    if (E.renderScale !== 1) E.setRenderScale(1);
    window.__frame();
    return document.querySelector('canvas').toDataURL('image/jpeg', 0.9);
  }, { dist, pitch, up });
  for (const [name, dist, pitch, up] of [['', 140, 0.22, 15], ['-close', 42, 0.1, 9]]) {
    let data = null;
    for (let k = 0; k < 4; k++) { data = await frame(dist, pitch, up); await page.waitForTimeout(60); }
    writeFileSync(`/tmp/out/laser-${level}${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
    console.log(`/tmp/out/laser-${level}${name}.jpg`);
  }
}
await b.close();
