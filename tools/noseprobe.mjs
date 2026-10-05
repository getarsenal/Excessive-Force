// Nose art and the boss splash, looked at. Boots a boss level with a record
// that has earned most of the art, photographs the splash, then calls an
// F-15 and stops the world with the jet in frame to photograph its nose.
//
//   node tools/noseprobe.mjs [level=moscow] [unit=f15]   -> /tmp/out/nose-*.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'moscow';
const unit = process.argv[3] || 'f15';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 240)));
await page.addInitScript(() => { try {
  localStorage.clear();
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done');
  const won = ['westminster', 'paris', 'pisa', 'agra', 'giza', 'chichen', 'athens', 'istanbul', 'colosseum', 'sydney', 'rio'];
  localStorage.setItem('tt.progress', JSON.stringify(Object.fromEntries(won.map((id) => [id, { runs: 1, won: true }]))));
  localStorage.setItem('tt.ops', JSON.stringify({ stars: Object.fromEntries(won.map((id) => [id, 7])) }));
} catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/out/nose-1-start.png' });
console.log(JSON.stringify(await page.evaluate(() => ({ boss: !!window.battle.boss, threat: window.battle.threat,
  splash: !!document.getElementById('bossintro'), bar: !document.getElementById('bossbar')?.hidden }))));
const r = await page.evaluate(async (unit) => {
  const B = window.battle, T = window.THREE, ff = window.__fastForward;
  B.unlockAll = true; B.freeBuild = true;
  const o = B.primary.origin;
  B.callStrike(unit, new T.Vector3(o.x, B.terrain.heightAt(o.x, o.z), o.z));
  let s = null;
  for (let k = 0; k < 200; k++) {
    ff(0.1, 0.05);
    s = B.air.sorties.find((x) => x.model && !x.lift);
    if (s) {
      const p = s.model.getWorldPosition(new T.Vector3());
      if (Math.hypot(p.x - o.x, p.z - o.z) < 900) break;
    }
  }
  if (!s) return { none: true };
  const p = s.model.getWorldPosition(new T.Vector3());
  let art = 0; s.model.traverse((m) => { if (m.name === 'noseart') art++; });
  return { p: [p.x, p.y, p.z], art, yaw: s.model.rotation.y };
}, unit);
console.log(JSON.stringify(r));
if (r.p) {
  // Hold the world still and put the camera beside the nose.
  await page.evaluate(([x, y, z, yaw]) => {
    window.__noseHold = true;
    const tm = window.__testMenu || null; if (tm) tm.paused = true;
    const R = window.rig;
    R.target.set(x, y, z); R.desiredTarget.copy(R.target);
    R.distance = R.desiredDistance = 26; R.pitch = R.desiredPitch = 0.05;
    R.yaw = R.desiredYaw = yaw + Math.PI / 2 - 0.35;
    R.minDistance = 5;
    for (let k = 0; k < 20; k++) R.update(0.1);
    document.body.classList.add('clear-view');
  }, [...r.p, r.yaw]);
  await page.keyboard.press('p');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/out/nose-2-jet.png' });
}
console.log(JSON.stringify({ errors }));
await b.close();
