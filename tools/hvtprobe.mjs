// The high-value targets: the SAM compounds and the command post, counted,
// shot at and photographed. How many 105 and 155 rounds a launcher takes on
// and off target, what a compound wrecked pays (a free strike), what the
// command post does when it goes (comms cut), and pictures of both.
//
//   node tools/hvtprobe.mjs [level=westminster]   -> /tmp/out/hvt-<level>-*.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'medium'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const look = (x, y, z, dist, pitch, yaw = null) => page.evaluate(([x, y, z, dist, pitch, yaw]) => {
  const r = window.rig;
  r.target.set(x, y, z); r.desiredTarget.copy(r.target);
  r.distance = r.desiredDistance = dist; r.pitch = r.desiredPitch = pitch;
  if (yaw !== null) r.yaw = r.desiredYaw = yaw;
  for (let k = 0; k < 30; k++) r.update(0.1);
}, [x, y, z, dist, pitch, yaw]);
const info = await page.evaluate(() => {
  const B = window.battle, S = B.sams, g = B.garrison;
  B.airborne.auto = false; B.assault.auto = false;
  document.body.classList.add('clear-view');
  return {
    sites: S ? S.sites.map((s) => ({ x: Math.round(s.x), z: Math.round(s.z), y: s.y, r: s.r, launchers: s.launchers.length, radar: !!s.radar })) : [],
    hq: B.hq ? { x: Math.round(B.hq.x), z: Math.round(B.hq.z), y: B.hq.y } : null,
    guards: g.defenders.filter((d) => d.pool === 'hvt').length,
    guardTypes: g.defenders.filter((d) => d.pool === 'hvt').reduce((a, d) => ({ ...a, [d.type]: (a[d.type] || 0) + 1 }), {}),
  };
});
console.log(JSON.stringify(info));
const s0 = info.sites[0];
if (s0) {
  await look(s0.x, s0.y + 3, s0.z, 95, +(process.env.PITCH || 0.5), null);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.body.classList.remove('clear-view'));
  await page.screenshot({ path: `/tmp/out/hvt-${level}-site.png` });
  await page.evaluate(() => document.body.classList.add('clear-view'));
}
if (info.hq) {
  await look(info.hq.x, info.hq.y + 3, info.hq.z, 60, 0.42, null);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/out/hvt-${level}-hq.png` });
}
const r = await page.evaluate(() => {
  const B = window.battle, S = B.sams, THREE = window.THREE, out = {};
  const ev = [];
  const say = B.onEvent;
  if (!S) return { none: true };
  // How many rounds of each, square on and two metres off, from inside the ring.
  const rounds = (power, off, radius) => {
    const l = S.launchers.find((x) => x.alive && x.site);
    if (!l) return null;
    const keep = l.hp;
    let n = 0;
    while (l.hp > 0 && n < 50) { l.hp -= S.blast ? 0 : 0; n++;
      const p = new THREE.Vector3(l.x + off, l.y, l.z);
      const dmg = (power / 60) * Math.pow(1 - Math.min(1, off / (radius + 4)), 1.2);
      l.hp -= dmg;
    }
    l.hp = keep;
    return n;
  };
  out.m119Square = rounds(3400, 0, 5.25); out.m119Off2 = rounds(3400, 2, 5.25);
  out.m777Square = rounds(6400, 0, 8.25);
  // A real wreck of the first compound by blasts, to see the reward.
  const st = S.sites[0];
  const credits0 = B.strikeCredits;
  for (const l of st.launchers) B._samBlast(new THREE.Vector3(l.x, l.y, l.z), 8, 9000);
  out.afterLaunchers = { credits: B.strikeCredits, down: st.down };
  B._samBlast(new THREE.Vector3(st.radar.x, B.terrain.heightAt(st.radar.x, st.radar.z), st.radar.z), 8, 9000);
  out.afterRadar = { credits: B.strikeCredits - credits0, down: st.down };
  const f15 = window.__UNITS_BY_ID ? null : null;
  out.f15Cost = B.costOf({ strike: true, cost: 100000 });
  out.b1Cost = B.costOf({ strike: true, cost: 400000 });
  // The command post.
  if (B.hq) {
    const h = B.hq;
    B._samBlast(new THREE.Vector3(h.x, h.y, h.z), 9, 3400);
    out.hqAfterOne = Math.round(h.hp);
    B._samBlast(new THREE.Vector3(h.x, h.y, h.z), 40, 90000);
    window.__fastForward(0.2);
    out.hq = { alive: h.alive, commsDown: B.commsDown, garrisonComms: B.garrison.commsDown };
  }
  return out;
});
console.log(JSON.stringify(r));
await page.waitForTimeout(800);
const feed = await page.evaluate(() => [...document.querySelectorAll('#feed .feed-item, #feed div')].slice(-8).map((e) => e.textContent));
console.log(JSON.stringify({ feed, errors }));
await b.close();
