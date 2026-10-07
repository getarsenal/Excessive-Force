// The mortar in the player's hands: an M120 team put down near the tower,
// LAY, the elevation read (never under forty-five degrees), the muzzle
// checked to be the top of the tube at that elevation, the live crew's parts
// present and the round rising over the reload, FIRE, the impact against
// the drawn point, DONE, the baked team back.
//   node tools/mortarprobe.mjs [level=westminster] [kind=m120]  -> /tmp/out/mortar-{laid,loaded}.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const [level = 'westminster', kind = 'm120'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const laid = await page.evaluate((kind) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  if (B.garrison) B.garrison.fireEnabled = false;   // the probe is about the mortar, not the garrison's mortars
  const o = B.primary.origin;
  B.setTarget(new T.Vector3(o.x, B.originGround + 20, o.z), 'tower');
  let u = null;
  for (const rad of [160, 200, 240, 280]) for (let a = 0; a < 360 && !u; a += 30) {
    const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    if (!B.validPlacement(p, null).ok) continue;
    B.deploy(kind, p); u = B.units[B.units.length - 1];
  }
  if (!u) return { noUnit: true };
  for (let k = 0; k < 60 && u.state !== 'ready'; k++) window.__fastForward(0.5, 1 / 30);
  // The crew's own first shot: where it leaves from, and how steep.
  let crewFrom = null, crewElev = null; const fire = B.projectiles.fire.bind(B.projectiles);
  B.projectiles.fire = (o2) => { if (o2.owner === u && !crewFrom) { crewFrom = [o2.pos.x, o2.pos.y, o2.pos.z].map((v) => +v.toFixed(2)); crewElev = +Math.atan2(o2.vel.y, Math.hypot(o2.vel.x, o2.vel.z)).toFixed(3); } return fire(o2); };
  for (let k = 0; k < 40 && !crewFrom; k++) window.__fastForward(0.5, 1 / 30);
  B.projectiles.fire = fire;
  const crewMuzzleRel = crewFrom ? [crewFrom[0] - u.pos.x, crewFrom[1] - u.pos.y, crewFrom[2] - u.pos.z].map((v) => +v.toFixed(2)) : null;
  window.__lay.enter(u);
  const L = B.lay;
  const live = u.live ? { parts: Object.keys(u.live).filter((k) => ['tube', 'round', 'gunner', 'loader'].includes(k)), tubeRot: +u.live.tube.rotation.x.toFixed(3), roundVisible: u.live.round.visible, hiddenBaked: u.live.hidden.every((c) => !c.visible) } : null;
  return { def: u.def.id, mortar: !!u.def.projectile.mortar, crewFrom, crewMuzzleRel, crewElevDeg: crewElev != null ? Math.round(crewElev * 180 / Math.PI) : null,
    lay: L && { elevDeg: Math.round(L.elev * 180 / Math.PI), range: Math.round(L.range), masonry: L.masonry, blocked: L.blocked, muzzleRel: [L.from.x - u.pos.x, L.from.y - u.pos.y, L.from.z - u.pos.z].map((v) => +v.toFixed(2)) }, live, cooldown: +u.cooldown.toFixed(1) };
}, kind);
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/out/mortar-laid.png' });
// Try to lay flat: the elevation must refuse to go under forty-five degrees.
const flat = await page.evaluate(() => { const B = window.battle; for (let i = 0; i < 80; i++) B.layTurn(0, -0.05); const L = B.lay; return { elevDeg: Math.round(L.elev * 180 / Math.PI), muzzleY: +(L.from.y - L.unit.pos.y).toFixed(2), tubeRot: +(L.unit.live?.tube.rotation.x ?? 0).toFixed(3) }; });
// Back up high, then the loader over the reload: the round's place at a few points of the clock.
const loading = await page.evaluate(() => {
  const B = window.battle, L = B.lay, u = L.unit; for (let i = 0; i < 40; i++) B.layTurn(0, 0.03);
  const seen = [];
  u.cooldown = L.reloadTotal = 6;
  for (let k = 0; k < 7; k++) { window.__fastForward(1, 1 / 30); const A = u.live; seen.push({ cooldown: +u.cooldown.toFixed(1), round: A ? [A.round.visible, ...A.round.position.toArray().map((v) => +v.toFixed(2))] : null, loaderY: A ? +A.loader.position.y.toFixed(2) : null }); }
  return { elevDeg: Math.round(L.elev * 180 / Math.PI), seen };
});
await page.screenshot({ path: '/tmp/out/mortar-loaded.png' });
const fired = await page.evaluate(() => {
  const B = window.battle, L = B.lay, u = L.unit;
  B._layArc(); const pred = L.impact.clone(); const from = L.from.clone();
  const impacts = []; const oi = B._onImpact.bind(B);
  B._onImpact = (hit) => { if (hit.proj.hand) impacts.push({ offPred: +hit.point.distanceTo(pred).toFixed(1), y: +hit.point.y.toFixed(1) }); return oi(hit); };
  let leftFrom = null; const fire = B.projectiles.fire.bind(B.projectiles);
  B.projectiles.fire = (o) => { leftFrom = +new window.THREE.Vector3(o.pos.x, o.pos.y, o.pos.z).distanceTo(from).toFixed(2); return fire(o); };
  const ok = window.__lay.fire();
  B.projectiles.fire = fire;
  const roundAfter = u.live ? u.live.round.visible : null;
  for (let k = 0; k < 20 && !impacts.length; k++) window.__fastForward(1, 1 / 30);
  B._onImpact = oi;
  return { ok, leftFrom, roundAfter, impacts, shots: B.handShots };
});
const done = await page.evaluate(() => { const B = window.battle, u = (B.lay && B.lay.unit) || B.units[B.units.length - 1]; const alive = u ? u.alive : null, n = B.units.length; window.__lay.exit(); if (!u) return { noUnit: true, units: n }; return { units: n, alive, lay: !!B.lay, live: !!u.live, bakedVisible: u.group.children.every((c) => c.visible), children: u.group.children.length }; });
console.log(JSON.stringify({ laid, flat, loading, fired, done, errors }, null, 1));
await b.close();
