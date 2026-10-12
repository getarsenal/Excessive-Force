// Is anything left hanging in the sky after a collapse? A level, a big
// battery round it (M777-heavy, as a player's late one is), the fight run
// until the building is down, and then every loose piece that is more than
// fifteen metres above the ground under it: welded section or single stone,
// fixed (frozen) or moving, asleep or not, how fast, and whether it moved
// in the next five seconds. A photograph from the level's camera.
//   node tools/hangprobe.mjs [level=landmark81] [guns=200] [seconds=120] [tier=low]
import { chromium } from 'playwright';
const [level = 'landmark81', nStr = '200', secStr = '120', tier = 'low'] = process.argv.slice(2);
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/trap|recursive|fault|error/i.test(t) && !/CERT/.test(t)) console.log('console:', t.slice(0, 200)); });
await page.addInitScript((t) => { try { localStorage.setItem('tt.quality', t); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} }, tier);
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const placed = await page.evaluate((n) => {
  const tm = window.testMenu, B = window.battle;
  B.airlift = false; B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.holdEnd = true;
  window.physics.setBudget(180); window.physics.setBudget = () => {};   // the phone's, held: the live frame loop's governor would put it back
  const kinds = ['m777', 'm777', 'm777', 'm119', 'm109', 'm120'];
  let placed = 0;
  for (let i = 0; placed < n && i < n * 3; i++) placed += tm.spawnAt(kinds[i % kinds.length], 1, (i * 2.39996) % (Math.PI * 2), 170 + (i % 5) * 35);
  return placed;
}, +nStr);
console.log('placed', placed);
const survey = () => page.evaluate(() => {
  const P = window.physics, T = window.terrain, R = window.RAPIER;
  const out = { hanging: 0, fixed: 0, moving: 0, asleep: 0, stones: 0, sections: 0, members: 0, highest: 0, examples: [] };
  for (const s of window.structures) {
    const seen = new Set();
    const look = (body, kind, members) => {
      if (!body || body.__removed) return;
      const t = body.translation();
      const g = T.heightAt(t.x, t.z);
      const up = t.y - g;
      if (up < 15) return;
      out.hanging++; out.members += members; out.highest = Math.max(out.highest, Math.round(up));
      if (kind === 'stone') out.stones++; else out.sections++;
      const fixed = body.bodyType() === 1;   // Rapier: 0 dynamic, 1 fixed
      if (fixed) out.fixed++; else if (body.isSleeping()) out.asleep++; else out.moving++;
      if (out.examples.length < 8) { const v = body.linvel(); out.examples.push({ kind, members, up: Math.round(up), fixed, asleep: !fixed && body.isSleeping(), v: +Math.hypot(v.x, v.y, v.z).toFixed(2), frozen: !!body.__frozen, supGround: !!body.__supGround, y: Math.round(t.y) }); }
    };
    for (const isl of s.islands.values()) look(isl.body, 'section', isl.members.length);
    for (let i = 0; i < s.count; i++) {
      if (!(s.flags[i] & 1)) continue;
      const bd = s.bodyOf?.[i];
      if (bd && !seen.has(bd)) { seen.add(bd); look(bd, 'stone', 1); }
    }
  }
  out.integrity = +window.battle.primary.monumentIntegrity.toFixed(3);
  out.dyn = P.dynamicSet.size; out.frozenList = P.frozen?.length; out.frozenLow = P.frozenLow || 0; out.culled = P.rubbleCulled || 0;
  out.dead = !!P.dead;
  return out;
});
for (let t = 0; t < +secStr; t += 15) {
  await page.evaluate(() => window.__fastForward(15, 1 / 30));
  const s = await survey();
  console.log(`t+${t + 15}`, JSON.stringify({ integrity: s.integrity, dyn: s.dyn, hanging: s.hanging, fixed: s.fixed, asleep: s.asleep, moving: s.moving, highest: s.highest, frozenLow: s.frozenLow, culled: s.culled, dead: s.dead }));
}
const a = await survey();
console.log('hanging now   ', JSON.stringify(a));
// How far each hanging piece falls in the next five seconds, guns silent.
const fall = await page.evaluate(() => {
  const P = window.physics, T = window.terrain, before = new Map();
  for (const body of P.dynamicSet) { const t = body.translation(); if (t.y - T.heightAt(t.x, t.z) > 15) before.set(body, t.y); }
  const fixedHigh = [];
  for (const body of P.frozen || []) { if (body.__removed) continue; const t = body.translation(); const up = t.y - T.heightAt(t.x, t.z); if (up > 15) fixedHigh.push({ up: Math.round(up), supGround: !!body.__supGround, n: body.numColliders() }); }
  for (const u of window.battle.units) u.cooldown = 999;
  const t0 = window.battle.elapsed;
  window.__fastForward(5, 1 / 30);
  const drops = [];
  const bins = {};
  for (const [body, y] of before) {
    if (body.__removed) continue;
    const d = y - body.translation().y; drops.push(d);
    const up = y - T.heightAt(body.translation().x, body.translation().z);
    const k = up > 150 ? '>150m' : up > 50 ? '50-150m' : '15-50m';
    const b = bins[k] || (bins[k] = { n: 0, still: 0, fell: 0 });
    b.n++; if (Math.abs(d) < 0.5) b.still++; else if (d > 0) b.fell++;
  }
  for (const body of P.frozen || []) { if (body.__removed) continue; const t = body.translation(); const up = t.y - T.heightAt(t.x, t.z); const k = up > 150 ? '>150m' : up > 50 ? '50-150m' : up > 15 ? '15-50m' : null; if (k) { const b = bins[k] || (bins[k] = { n: 0, still: 0, fell: 0 }); b.frozen = (b.frozen || 0) + 1; } }
  drops.sort((x, y) => x - y);
  const q = (p) => drops.length ? +drops[Math.floor(p * (drops.length - 1))].toFixed(1) : null;
  return { bins, simSeconds: +(window.battle.elapsed - t0).toFixed(2), tracked: before.size, still: drops.filter((d) => Math.abs(d) < 0.5).length, dropP10: q(0.1), dropP50: q(0.5), dropP90: q(0.9), fixedHigh: fixedHigh.length, fixedHighSample: fixedHigh.slice(0, 6) };
});
console.log('next 5 s      ', JSON.stringify(fall));
await page.evaluate(() => { window.__frame?.(); });
await page.screenshot({ path: `/tmp/out/hang-${level}.png`, timeout: 600000 }).catch(() => {});
await b.close();
