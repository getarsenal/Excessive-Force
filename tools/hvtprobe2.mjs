// The second batch of high-value targets, exercised: the SAMs firing on the
// airlift, the ammo depot, the enemy battery, the checkpoint and its truck
// columns, the general's convoy, radar-first and the kill streak's fire
// mission. Pictures of the depot, the battery, the checkpoint and the convoy.
//
//   node tools/hvtprobe2.mjs [level=westminster]   -> /tmp/out/hvt2-<level>-*.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 240)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.removeItem('tt.suite'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const look = (p, dist, pitch) => page.evaluate(([x, y, z, dist, pitch]) => {
  const r = window.rig;
  r.target.set(x, y, z); r.desiredTarget.copy(r.target);
  r.distance = r.desiredDistance = dist; r.pitch = r.desiredPitch = pitch;
  for (let k = 0; k < 30; k++) r.update(0.1);
}, [p.x, p.y + 2, p.z, dist, pitch]);
const shot = async (p, tag, dist = 70, pitch = 0.6) => {
  if (!p) return;
  await look(p, dist, pitch);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/out/hvt2-${level}-${tag}.png` });
};

const where = await page.evaluate(() => {
  const B = window.battle, H = B.hv;
  B.airborne.auto = false; B.assault.auto = false;
  document.body.classList.add('clear-view');
  const p = (o) => (o ? { x: o.x, y: o.y, z: o.z } : null);
  return {
    depot: p(H?.depot), checkpoint: p(H?.checkpoint), battery: p(H?.batterySite),
    guns: H?.guns?.length || 0, route: H?.columns?.route ? Math.round(H.columns.length) : 0,
  };
});
console.log('sited', JSON.stringify(where));
await shot(where.depot, 'depot');
await shot(where.battery, 'battery', 80);
await shot(where.checkpoint, 'checkpoint', 50);

const r = await page.evaluate(async () => {
  const B = window.battle, H = B.hv, S = B.sams, THREE = window.THREE, ff = window.__fastForward, g = B.garrison;
  const out = {}, ev = [];
  const say = B.onEvent;
  B.onEvent = (k, d) => { ev.push(k); return say(k, d); };
  const hvSay = H.onEvent;
  H.onEvent = (k, d) => { ev.push(k); return hvSay(k, d); };
  S.onEvent = ((f) => (k, d) => { ev.push(k); return f(k, d); })(S.onEvent);
  B.unlockAll = true; B.freeBuild = true;
  B.garrison.fireEnabled = false;

  // 1. The airlift under the SAMs: an M777 by Chinook and an AT4 team by C-130,
  //    with the battery told that the next missile kills.
  const o = B.primary.origin;
  let placed = 0;
  for (let k = 0; k < 80 && placed < 2; k++) {
    const a = 2.0 + k * 0.17, rr = 420 + (k % 4) * 25;
    const q = new THREE.Vector3(o.x + Math.sin(a) * rr, 0, o.z + Math.cos(a) * rr);
    q.y = B.terrain.heightAt(q.x, q.z);
    if (B.validPlacement(q).ok && await B.deploy(placed === 0 ? 'm777' : 'at4', q)) placed++;
  }
  out.pendingBefore = B.pending.length;
  S.since = 20;
  for (let k = 0; k < 600 && B.pending.length; k++) { ff(0.1, 0.1); if (ev.includes('liftdown')) S.since = 0; }
  out.liftdown = ev.filter((e) => e === 'liftdown').length;
  out.samOnLift = ev.filter((e) => e === 'samlaunch').length;
  out.pendingAfter = B.pending.length;
  out.unitsAfter = B.units.filter((u) => u.alive).length;

  // 2. The depot.
  if (H.depot) {
    B._samBlast(new THREE.Vector3(H.depot.x, H.depot.y, H.depot.z), 30, 90000);
    ff(0.2);
    out.depot = { alive: H.depot.alive, supplyRof: g.supplyRof, tubeRof: g.tubeRof };
  }
  // 3. The battery: are the guns firing, then kill them.
  if (H.guns?.length) {
    B.garrison.fireEnabled = true;
    const m0 = g.mortarsFired;
    ff(40, 0.1);
    out.batteryFired = g.mortarsFired - m0;
    B.garrison.fireEnabled = false;
    for (const d of H.guns) B._samBlast(d.pos.clone(), 20, 90000), g.splash(d.pos.clone(), 20, 90000);
    ff(0.2);
    out.battery = { up: H.batteryUp, reloadFactor: B.reloadFactor };
  }
  // 4. Columns and the general: the bar a third of the way.
  Object.defineProperty(B, 'objectiveProgress', { get() { return 0.4; }, configurable: true });
  H.columns.next = 0;
  ff(1, 0.1);
  out.generalState = H.general.state;
  out.columnsSent = H.columns.sent;
  // The general's car, hit where it is.
  const car = H.general.convoy?.vehicles.find((v) => v.kind === 'car');
  if (car) {
    ff(6, 0.1);
    B._samBlast(new THREE.Vector3(car.x, car.y, car.z), 6, 9000);
    out.general = H.general.state;
  }
  ff(180, 0.1);
  out.columnMen = g.defenders.filter((d) => d.pool === 'column' && d.alive).length;
  // 5. Radar first, on a compound still whole.
  const site = S.sites.find((st) => !st.down && st.radar?.alive && st.launchers.every((l) => l.alive));
  if (site) B._samBlast(new THREE.Vector3(site.radar.x, B.terrain.heightAt(site.radar.x, site.radar.z), site.radar.z), 6, 20000);
  // 6. The streak: two more kills quickly.
  const p0 = B.projectiles.list.length;
  if (H.checkpoint) B._samBlast(new THREE.Vector3(H.checkpoint.x, H.checkpoint.y, H.checkpoint.z), 30, 90000);
  if (B.hq?.alive) B._samBlast(new THREE.Vector3(B.hq.x, B.hq.y, B.hq.z), 40, 90000);
  out.missionQueued = H.mission.length;
  ff(14, 0.05);
  out.missionLeft = H.mission.length;
  out.events = [...new Set(ev)].filter((e) => !/^(bounty|stamp|samlaunch|sammiss|samhit|flak|underfire)$/.test(e));
  delete B.objectiveProgress;
  return out;
});
console.log(JSON.stringify(r));
const conv = await page.evaluate(() => {
  const c = window.battle.hv?.convoys?.find((x) => x.name === 'column');
  const v = c?.vehicles?.[0];
  return v ? { x: v.x, y: v.y, z: v.z } : null;
});
await shot(conv, 'column', 45, 0.5);
console.log(JSON.stringify({ errors }));
await b.close();
