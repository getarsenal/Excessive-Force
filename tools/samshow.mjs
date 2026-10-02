// The SAM battery, photographed and counted: the launchers and radar on
// their site, a missile climbing on its curve with its trail behind it, a
// kill and a miss, and then N strike runs flown through the battery to count
// how many come back.
//
//   node tools/samshow.mjs [level=westminster] [runs=20]   -> /tmp/out/sam-<level>-<n>.png
import { chromium } from 'playwright';
const [level = 'westminster', runsArg = '20'] = process.argv.slice(2);
const runs = Number(runsArg);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 680 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const snap = (tag) => page.screenshot({ path: `/tmp/out/sam-${level}-${tag}.png`, timeout: 180000 }).catch(() => {});
const look = (x, y, z, dist, pitch, yaw) => page.evaluate(([x, y, z, dist, pitch, yaw]) => {
  const r = window.rig;
  r.target.set(x, y, z); r.desiredTarget.copy(r.target);
  r.distance = r.desiredDistance = dist; r.pitch = r.desiredPitch = pitch;
  if (yaw !== null) r.yaw = r.desiredYaw = yaw;
  for (let k = 0; k < 30; k++) r.update(0.1);
}, [x, y, z, dist, pitch, yaw]);

const info = await page.evaluate(() => {
  const B = window.battle;
  document.body.classList.add('clear-view');
  B.unlockAll = true; B.freeBuild = true; B.airborne.auto = false; B.garrison.fireEnabled = false;
  const S = B.sams;
  if (!S) return { sams: false };
  window.__ev = [];
  const prev = S.onEvent;
  S.onEvent = (k, d) => { window.__ev.push(k); prev(k, d); };
  return { sams: true, launchers: S.launchers.map((l) => [Math.round(l.x), Math.round(l.z)]), radar: !!S.radar };
});
console.log(JSON.stringify(info));
if (!info.sams) { await b.close(); process.exit(1); }
const [lx, lz] = info.launchers[0];
const ly = await page.evaluate(([x, z]) => window.terrain.heightAt(x, z), [lx, lz]);
await look(lx, ly + 4, lz, 60, 0.32, null);
await page.waitForTimeout(1500);
await snap('1-site');

// A kill, watched: the battery is told this one comes down.
await page.evaluate(() => {
  const B = window.battle, o = B.primary.origin;
  B.sams.since = 5;
  const aim = o.clone(); aim.y = B.primary.groundY + 20;
  window.__s = B.callStrike('f15', aim);
});
// Fly until the missile is up and climbing.
await page.evaluate(() => { for (let k = 0; k < 400; k++) { window.__fastForward(1 / 30, 1 / 30); if (window.battle.sams.missiles.some((m) => m.t > 2.2)) break; } });
const m1 = await page.evaluate(() => { const m = window.battle.sams.missiles[0]; return m ? [m.pos.x, m.pos.y, m.pos.z] : null; });
console.log('missile', m1 && m1.map(Math.round));
if (m1) { await look(m1[0], m1[1] - 40, m1[2], 520, 0.12, null); await page.waitForTimeout(1200); await snap('2-climb'); }
await page.evaluate(() => { for (let k = 0; k < 300; k++) { window.__fastForward(1 / 30, 1 / 30); if (!window.battle.sams.missiles.length || window.__s.downed) break; } });
const d = await page.evaluate(() => { const s = window.__s; return s && s.model ? [s.model.position.x, s.model.position.y, s.model.position.z, !!s.downed] : null; });
console.log('target', d);
if (d) { await look(d[0], d[1] - 30, d[2], 420, 0.1, null); await page.waitForTimeout(1200); await snap('3-hit'); }
await page.evaluate(() => window.__fastForward(8, 1 / 30));
await snap('4-after');

// And the count: runs flown one after another through a fresh battery.
const tally = await page.evaluate((runs) => {
  const B = window.battle, S = B.sams, o = B.primary.origin;
  let launched = 0, killed = 0, missed = 0;
  const count = () => {
    for (const k of window.__ev.splice(0)) {
      if (k === 'samlaunch') launched++;
      else if (k === 'samkill') killed++;
      else if (k === 'sammiss') missed++;
    }
  };
  window.__fastForward(20, 1 / 30); count(); launched = killed = missed = 0;
  let flown = 0;
  for (let r = 0; r < runs; r++) {
    // A fresh battery each time it runs dry, so the count is about the odds
    // and not about the eight rounds.
    for (const l of S.launchers) { l.alive = true; l.rounds = 4; l.cool = 0; }
    S.quiet = false;
    B.elapsed = 10;
    const aim = o.clone(); aim.x += (Math.random() - 0.5) * 120; aim.z += (Math.random() - 0.5) * 120;
    aim.y = B.primary.groundY + 10;
    B.callStrike('f15', aim);
    flown++;
    window.__fastForward(30, 1 / 20);
    count();
  }
  return { flown, launched, killed, missed };
}, runs);
console.log(JSON.stringify(tally));
await b.close();
