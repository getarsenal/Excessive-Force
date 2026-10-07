// The Range, driven: the light in the hall, then a machine gun and a gun on
// the firing line, laid and fired at the paper, the poppers, the gongs and
// the shack, the drones engaged, and the board read back.
//   node tools/rangeprobe.mjs [light|fire]  -> /tmp/out/range-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/out', { recursive: true });
const mode = process.argv[2] || 'fire';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.goto(`http://localhost:${port}/?level=range`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const light = await page.evaluate(() => {
  const E = window.__engine, s = E.scene;
  return { sun: +E.sun.intensity.toFixed(2), sunPos: E.sun.position.toArray().map((v) => Math.round(v)), shadow: E.sun.castShadow, hemi: +E.hemi.intensity.toFixed(2), amb: +E.ambient.intensity.toFixed(2),
    fog: s.fog ? { type: s.fog.constructor.name, density: s.fog.density, near: s.fog.near, far: s.fog.far, color: s.fog.color.getHexString() } : null,
    exposure: +E.renderer.toneMappingExposure.toFixed(2), range: !!window.__range, targets: window.__range?.targets.length, blocks: window.__range?.shack.blocks.length, drones: window.__range?.drones.length,
    sandbox: !!window.battle.level.sandbox, free: window.battle.freeBuild, cam: window.rig.camera.position.toArray().map((v) => Math.round(v)) };
});
console.log(JSON.stringify({ light }));
await page.screenshot({ path: '/tmp/out/range-open.png' });
if (mode === 'light') {
  for (const [tag, fn] of [['nosun', () => { window.__engine.sun.intensity = 0; }], ['sun6', () => { window.__engine.sun.intensity = 6; }], ['noshell', () => { window.__engine.sun.intensity = 1.7; window.__range.group.children[0].visible = false; }]]) {
    await page.evaluate(fn); await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/out/range-${tag}.png` });
  }
  console.log(JSON.stringify({ errors })); await b.close(); process.exit(0);
}
// Fire: an M240 and a Stryker on the line, the MG laid on the drones (auto) and the paper, the Stryker on the poppers and the shack.
const r = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, R = window.__range, terrain = window.terrain, o = R.origin;
  B.airlift = false; B.invulnerable = true;
  const at = (x, z) => new T.Vector3(o.x + x, terrain.heightAt(o.x + x, o.z + z), o.z + z);
  const dep = (kind, x, z) => { const p = at(x, z); const ok = B.validPlacement(p, null); if (!ok.ok) return { kind, placed: false, why: ok.reason }; B.deploy(kind, p); return { kind, placed: true, u: B.units[B.units.length - 1] }; };
  const mg = dep('m240', -66, 12), st = dep('stryker', -22, 14), gun = dep('m777', 22, 16);
  for (let k = 0; k < 40; k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 10)); }
  const out = { mg: mg.why, st: st.why, gun: gun.why, score0: { ...R.score } };
  const fireAt = async (u, target, n = 3) => {
    if (!u) return null;
    window.__lay.enter(u);
    const L = B.lay; if (!L) return 'nolay';
    // Lay the sight on the target point by yaw/elevation search: turn to it, then walk elevation until the drawn impact is nearest.
    const tp = target.clone();
    L.yaw = Math.atan2(tp.x - L.from.x, tp.z - L.from.z); B.layTurn(0, 0);
    let bestE = L.elev, bestD = Infinity;
    for (let e = -0.05; e < 0.5; e += 0.004) { B.layTurn(0, e - L.elev); const d = L.impact.distanceTo(tp); if (d < bestD) { bestD = d; bestE = e; } }
    B.layTurn(0, bestE - L.elev);
    const res = { off: +bestD.toFixed(1), fired: 0 };
    for (let i = 0; i < n; i++) {
      u.cooldown = 0; u.burstLeft = 0;
      if (B.handFire()) res.fired++;
      // A machine gun is held on for a second; anything else is one round.
      if (u.def.mg) B.trigger = true;
      for (let k = 0; k < 30; k++) { if (k === 10) B.trigger = false; window.__fastForward(0.1, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
      B.trigger = false;
    }
    window.__lay.exit();
    return res;
  };
  const tgt = (kind, i) => R.targets.filter((t) => t.kind === kind)[i].hitbox.pos;
  out.paper = await fireAt(mg.u, tgt('paper', 0), 2);
  out.popper = await fireAt(st.u, tgt('popper', 0), 2);
  out.gong = await fireAt(st.u, tgt('gong', 0), 2);
  out.shack = await fireAt(gun.u, R.shack.centre, 2);
  // Did the blocks actually fly? The furthest from home, right after the shots.
  out.shackFlung = +Math.max(0, ...R.shack.blocks.map((b) => { if (!b.body || b.body.__removed) return 0; const t = b.body.translation(); return Math.hypot(t.x - b.home.x, t.y - b.home.y, t.z - b.home.z); })).toFixed(1);
  // The MG left to itself for ten seconds: does it engage the drones?
  const k0 = R.score.hits;
  for (let k = 0; k < 100; k++) { window.__fastForward(0.1, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  out.autoHits = R.score.hits - k0;
  out.score = { ...R.score };
  out.shackMoved = R.shack.blocks.filter((b) => b.moved).length;
  out.rebuilding = R.shack.rebuilding;
  // Wait for the rebuild.
  for (let k = 0; k < 150 && !(R.shack.built && R.shack.blocks.every((b) => !b.moved)); k++) { window.__fastForward(0.2, 1 / 30); await new Promise((r) => setTimeout(r, 5)); }
  out.rebuilt = R.shack.built; out.shacks = R.score.shacks;
  out.state = B.state; out.units = B.units.filter((u) => u.alive).length; out.money = B.money;
  out.board = document.getElementById('range-board')?.textContent;
  return out;
});
console.log(JSON.stringify(r));
await page.screenshot({ path: '/tmp/out/range-fired.png' });
console.log(JSON.stringify({ errors }));
await b.close();
