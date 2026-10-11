// REMATCH: three guns put down by hand and one of them sold, then the end
// card's REMATCH, then the new load stepped until the plan is through. Prints
// the plan carried over, where each gun stood the first time and where it
// stands now, and how long each took to be back.
//   node tools/rematchprobe.mjs [level=westminster] [port=5178]
import { chromium } from 'playwright';
const level = process.argv[2] || 'westminster', port = process.argv[3] || process.env.TT_PORT || 5178;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
const ready = () => page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await ready();
await page.waitForTimeout(1000);
const first = await page.evaluate(async () => {
  const B = window.battle, T = window.THREE, o = B.primary.origin;
  B.invulnerable = true; B.airlift = false; B.money = 1e6; B.unlockAll = true;
  if (B.garrison) B.garrison.fireEnabled = false;
  const kinds = ['m119', 'm240', 'm119'], placed = [];
  for (let a = 0; a < 720 && placed.length < kinds.length; a += 17) {
    const r = 170 + (a % 90), x = o.x + Math.cos(a / 57.3) * r, z = o.z + Math.sin(a / 57.3) * r;
    const u = await B.deploy(kinds[placed.length], new T.Vector3(x, window.terrain.heightAt(x, z), z));
    if (u) placed.push(u);
  }
  B.sellUnit(placed[1]);
  return { placed: placed.map((u) => [u.def.id, +u.pos.x.toFixed(1), +u.pos.z.toFixed(1)]), plan: window.__rematch().plan, label: (window.hud.showEnd ? 'ok' : '') };
});
console.log('first fight: placed', JSON.stringify(first.placed), '· plan after selling one', first.plan);
// The end card's button, as a player presses it.
await page.evaluate(() => window.hud.onRestart({ rematch: true }));
await page.waitForTimeout(1500);
await ready();
await page.waitForTimeout(500);
const second = await page.evaluate(async () => {
  const B = window.battle;
  // The plan waits on the bar's unlocks and the money as a player would; the
  // probe opens both so what is measured is the placing.
  B.invulnerable = true; B.unlockAll = true; B.money = 1e6;
  if (B.garrison) B.garrison.fireEnabled = false;
  const t0 = B.elapsed, back = [];
  const start = window.__rematch();
  for (let k = 0; k < 240 && window.__rematch().queue; k++) {
    window.__fastForward(0.25, 1 / 30);
    // The frame loop is where the plan is worked; under fast-forward, here.
    await new Promise((r) => requestAnimationFrame(r));
  }
  for (let k = 0; k < 360; k++) { window.__fastForward(0.25, 1 / 30); if (B.units.length >= start.total) break; await new Promise((r) => setTimeout(r, 2)); }
  const pending = B.pending.map((d) => ({ id: d.def.id, lost: !!d.lost, at: [+d.pos.x.toFixed(1), +d.pos.z.toFixed(1)] }));
  for (const u of B.units) back.push([u.def.id, +u.pos.x.toFixed(1), +u.pos.z.toFixed(1)]);
  return { start, end: window.__rematch(), back, pending, sorties: B.air?.sorties.length, seconds: +(B.elapsed - t0).toFixed(1), airlift: B.airlift };
});
console.log('rematch: carried', JSON.stringify(second.start), '→', JSON.stringify(second.end), 'in', second.seconds, 'game s, airlift', second.airlift);
console.log('back on the ground', JSON.stringify(second.back), '· still in the lift', JSON.stringify(second.pending), '· sorties', second.sorties);
const same = first.placed.filter((_, i) => i !== 1).every(([id, x, z]) => second.back.some(([i2, x2, z2]) => i2 === id && Math.hypot(x - x2, z - z2) < 0.5));
console.log('every kept gun on its mark:', same, '· the sold one left out:', !second.back.some(([id]) => id === 'm240'));
console.log('errors', JSON.stringify(errors));
await b.close();
