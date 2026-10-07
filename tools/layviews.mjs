// The gunner's eye on every weapon a player can lay: each kind put down near
// the tower, LAY, a screenshot, and a measure of how much of the middle of
// the picture is the weapon's own model (rays from the camera over the
// central part of the view against the unit's meshes, within ten metres),
// plus whether the muzzle and the drawn impact are on the screen.
//   node tools/layviews.mjs [level=westminster] [kinds=all]  -> /tmp/out/layview-<kind>.png, -zoom.png
// Each kind is also zoomed through its sight (`def.sight.zoom`) and shot
// again, and the trigger pulled: a gun's round, the machine gun's burst
// (tracers fired), the Javelin's missile, each counted.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const [level = 'westminster', kindsArg = 'all'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const kinds = await page.evaluate((arg) => {
  const B = window.battle; B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  if (B.garrison) B.garrison.fireEnabled = false;
  const o = B.primary.origin; B.setTarget(new window.THREE.Vector3(o.x, B.originGround + 20, o.z), 'tower');
  const all = window.UNITS ? window.UNITS : null;
  return arg === 'all' ? null : arg.split(',');
}, kindsArg);
const list = kinds || ['m240', 'at4', 'gustaf', 'rpg32', 'javelin', 'm120', 'm119', 'm777', 'm109', 'stryker'];   // everything canLay allows
const out = [];
for (const kind of list) {
  const r = await page.evaluate(async (kind) => {
    const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
    let u = null;
    for (const rad of [180, 220, 260, 300]) for (let a = 0; a < 360 && !u; a += 20) {
      const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
      const p = new T.Vector3(x, terrain.heightAt(x, z), z);
      if (!B.validPlacement(p, null).ok) continue;
      B.deploy(kind, p); u = B.units[B.units.length - 1];
    }
    if (!u) return { kind, noUnit: true };
    // Ready, and with a model that can be measured (a vehicle's loads).
    const measurable = () => { const bx = new T.Box3().setFromObject(u.model || u.group); return Number.isFinite(bx.max.y) && bx.max.y - u.pos.y > 0.5; };
    for (let k = 0; k < 80 && (u.state !== 'ready' || !measurable()); k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 50)); }
    window.__lay.enter(u);
    // A working lay, not a search for stone that ran out of elevation: a gun
    // over open sights at four degrees, a mortar as the solve left it. The
    // lay's own solution is kept for the zoomed shot.
    const L = B.lay;
    window.__layElev0 = L.elev;
    if (!u.def.projectile.mortar && !u.def.mg && u.def.projectile.kind !== 'topattack') B.layTurn(0, 0.07 - L.elev);
    window.__frame();
    const cam = window.rig.camera;
    // Rays over the central three fifths of the view, against the unit's own meshes.
    const meshes = []; u.group.traverse((m) => { if (m.isMesh && m.visible) meshes.push(m); });
    const ray = new T.Raycaster(); ray.far = 12;
    let n = 0, own = 0;
    for (let i = 0; i < 11; i++) for (let j = 0; j < 11; j++) {
      const nx = -0.6 + 1.2 * (i / 10), ny = -0.6 + 1.2 * (j / 10);
      ray.setFromCamera({ x: nx, y: ny }, cam);
      n++; if (ray.intersectObjects(meshes, false).length) own++;
    }
    const proj = (v) => { const q = v.clone().project(cam); return { x: Math.round((q.x + 1) / 2 * innerWidth), y: Math.round((1 - q.y) / 2 * innerHeight), on: Math.abs(q.x) < 1 && Math.abs(q.y) < 1 && q.z < 1 }; };
    const box = new T.Box3().setFromObject(u.model || u.group); const inside = box.containsPoint(cam.position);
    const res = { kind, model: u.def.model, len: u.def.modelLength, eye: { offGun: +cam.position.distanceTo(u.pos).toFixed(1), up: +(cam.position.y - u.pos.y).toFixed(2), inside, modelTop: +(box.max.y - u.pos.y).toFixed(2) }, ownFrac: +(own / n).toFixed(2), muzzle: proj(L.from), impact: proj(L.impact), elevDeg: Math.round(L.elev * 180 / Math.PI), range: Math.round(L.range), masonry: L.masonry };
    return res;
  }, kind);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/out/layview-${kind}.png`, timeout: 240000 }).catch((e) => { r.shotErr = String(e).slice(0, 80); });
  if (!r.noUnit) {
    // Through the sight, and the trigger pulled.
    const z = await page.evaluate(async () => {
      const B = window.battle, L = B.lay, u = L.unit;
      if (!u.def.projectile.mortar) B.layTurn(0, window.__layElev0 - L.elev);
      // A machine gun taken mid-burst finishes the crew's burst first.
      for (let k = 0; k < 40 && (u.burstLeft > 0 || u.cooldown > 0); k++) { window.__fastForward(0.2, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
      window.__lay.zoom(1);
      window.__frame();
      const cam = window.rig.camera;
      const q = L.impact.clone().project(cam);
      const centred = Math.hypot(q.x, q.y) < 0.03;
      const tr0 = B.tracerFX?.fired || 0, pr0 = B.projectiles?.list?.length ?? B.projectiles?.active?.length ?? -1;
      const fired = B.handFire();
      // The burst goes out over its own interval.
      for (let k = 0; k < 20; k++) { window.__fastForward(0.1, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
      return { mag: window.__lay.mag(), fov: +cam.fov.toFixed(1), centred, fired, tracers: (B.tracerFX?.fired || 0) - tr0, shots: B.shotsFired, hand: B.handShots, sight: u.def.sight?.kind, fire: document.getElementById('lay-fire')?.textContent, hidden: document.getElementById('lay-zoom')?.hidden };
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/out/layview-${kind}-zoom.png`, timeout: 240000 }).catch((e) => { z.shotErr = String(e).slice(0, 80); });
    r.zoom = z;
  }
  await page.evaluate(() => { const B = window.battle; const u = B.lay?.unit; window.__lay.exit(); if (u) B.removeUnit(u); });
  out.push(r);
  console.log(JSON.stringify(r));
}
console.log(JSON.stringify({ errors }));
await b.close();
