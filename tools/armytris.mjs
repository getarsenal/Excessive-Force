// What a big battery costs the GPU a frame, on a phone: n guns put down
// round the building (M777-heavy, as a player's late battery is), the models
// loaded, and every pass of one frame counted (triangles and draw calls)
// from the level's own camera and from high and wide over the ring, with
// and without the guns drawn.
//   node tools/armytris.mjs [level=saintsava] [n=240] [tier=low]
import { chromium } from 'playwright';
const [level = 'saintsava', nStr = '240', tier = 'low'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.text().includes(' beyond ')) console.log(m.text()); });
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const placed = await page.evaluate((n) => {
  const tm = window.testMenu, B = window.battle;
  B.airlift = false; B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  if (B.garrison) B.garrison.fireEnabled = false;
  const kinds = ['m777', 'm777', 'm777', 'm119', 'm109', 'm120'];
  let placed = 0;
  for (let i = 0; placed < n && i < n * 3; i++) placed += tm.spawnAt(kinds[i % kinds.length], 1, (i * 2.39996) % (Math.PI * 2), 170 + (i % 5) * 35);
  return placed;
}, +nStr);
// Let the models load and the guns settle; hold fire so the count is the guns'.
for (let k = 0; k < 30; k++) { await page.evaluate(() => { for (const u of window.battle.units) u.cooldown = 99; window.__fastForward(0.5, 1 / 30); }); await page.waitForTimeout(300); }
const count = () => page.evaluate(() => {
  const E = window.__engine, I = E.renderer.info, B = window.battle;
  const frame = () => { const a = I.autoReset; I.autoReset = false; I.reset(); for (const u of B.units) if (u.modelLo) B._lod(u); E.render(); const r = { tris: I.render.triangles, calls: I.render.calls }; I.autoReset = a; return r; };
  const withGuns = frame();
  for (const u of B.units) u.group.visible = false;
  const without = frame();
  for (const u of B.units) u.group.visible = true;
  const lod = [0, 0, 0]; for (const u of B.units) if (u.alive) lod[u.lodFar | 0]++;
  return { withGuns, without, guns: { tris: withGuns.tris - without.tris, calls: withGuns.calls - without.calls }, lodLevels: lod, camDist: Math.round(E.camera.position.distanceTo(B.primary.origin)) };
});
console.log('placed', placed);
console.log('level camera ', JSON.stringify(await count()));
await page.evaluate(() => { const o = window.battle.primary.origin; window.__rig.focus(o.clone().setY(o.y + 10), 650); window.__rig.update?.(1); window.__frame?.(); });
console.log('high and wide', JSON.stringify(await count()));
await b.close();
