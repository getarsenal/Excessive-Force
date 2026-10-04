// The win waits for the drop: launch the counter-attack, bring the building
// down, and check the level holds until the last man of the drop is gone.
//
// Then that the survivors walled in by the town walk out into the open, and
// that each one left carries a marker.
//
//   node tools/holdprobe.mjs [level=versailles]
import { chromium } from 'playwright';
const level = process.argv[2] || 'versailles';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const r = await page.evaluate(async () => {
  const B = window.battle, ff = window.__fastForward, out = {}, THREE = window.THREE;
  B.airborne.auto = false; B.assault.auto = false; B.invulnerable = true;
  B.unlockAll = true; B.freeBuild = true; B.airlift = false;
  // A battery on one side, so there is a side for a man to be hidden from.
  { const S = B.primary; let placed = 0;
    for (let k = 0; k < 200 && placed < 4; k++) {
      const a = 2.2 + k * 0.13, r = 420 + (k % 4) * 20;
      const q = new THREE.Vector3(S.origin.x + Math.sin(a) * r, 0, S.origin.z + Math.cos(a) * r);
      q.y = window.terrain.heightAt(q.x, q.z);
      if (B.validPlacement(q).ok) { await B.deploy('m119', q); placed++; }
    }
    out.guns = placed; }
  B.garrison.fireEnabled = false;
  const ev = []; const say = B.onEvent; B.onEvent = (k, d) => { if (['winheld', 'dropsleft', 'win', 'flushed'].includes(k)) ev.push([k, d.left ?? d.n ?? '', Math.round(B.elapsed)]); return say(k, d); };
  ff(2);
  B.assault.launch();
  ff(6);
  out.outstandingInbound = B.assault.outstanding;
  for (const ob of B.objectives) { const S = ob.structure; for (let i = 0; i < S.count; i++) if (S.isAlive(i)) S.destroyChunk(i); }
  ff(8);
  out.stateWhileInbound = B.state;
  let t = 0; while (B.assault.state === 'inbound' && t < 120) { ff(2); t += 2; }
  ff(8);
  out.landed = Math.round(B.elapsed);
  out.stateAfterLanding = B.state; out.left = B.assault.outstanding;
  const wave = B.garrison.defenders.filter((d) => d.pool === 'wave' && d.alive);
  const before = wave.map((d) => d.pos.clone());
  out.walking = wave.filter((d) => d.walk).length;
  ff(60);
  out.moved = wave.filter((d, i) => d.alive && d.pos.distanceTo(before[i]) > 3).length;
  out.stillWalking = wave.filter((d) => d.walk).length;
  out.events = ev.filter((e) => e[0] !== 'dropsleft'); out.landedAt = window.__landedAt;
  return out;
});
await page.waitForTimeout(2500);
r.marked = await page.evaluate(() => window.__hunt.shown);
r.alive = await page.evaluate(() => window.battle.garrison.defenders.filter((d) => d.alive && (d.pool === 'wave' || d.pool === 'air')).length);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
r.stateCleared = await page.evaluate(() => {
  const B = window.battle;
  for (const d of B.garrison.defenders) if (d.pool === 'wave' || d.pool === 'air') d.alive = false;
  window.__fastForward(2);
  return B.state;
});
console.log(JSON.stringify({ level, ...r, errors }));
await b.close();
