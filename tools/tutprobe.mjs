// Boot Camp, walked end to end the way a player would: the GOT IT buttons
// pressed, the real cards tapped, the rings on the map clicked where they
// are drawn. Prints each step as it is reached and how it was cleared, and
// photographs a handful of them.
//
//   node tools/tutprobe.mjs [tier=low]   -> /tmp/out/tut-*.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const tier = process.argv[2] || 'low';
fs.mkdirSync('/tmp/out', { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 240)));
await page.addInitScript((tier) => { try {
  localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.removeItem('tt.tutorial'); localStorage.removeItem('tt.suite'); } catch {} }, tier);
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=tutorial`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForFunction(() => window.__tutorial?.root, null, { timeout: 120000 });
const setup = await page.evaluate(() => {
  const B = window.battle;
  B.airborne.auto = false; B.assault.auto = false;
  const t = window.__tutorial;
  return { steps: t.steps.map((s) => s.title), sams: B.sams?.sites.length || 0, hq: !!B.hq, training: !!B.sams?.training };
});
console.log(JSON.stringify(setup));

const state = () => page.evaluate(() => {
  const t = window.__tutorial;
  if (!t?.root) return { over: true };
  const s = t.steps[t.i];
  const ring = t.ring.hidden ? null : t.ring.getBoundingClientRect();
  const ring2 = t.ring2.hidden ? null : t.ring2.getBoundingClientRect();
  return { i: t.i, title: s?.title, ch: t.root.querySelector('.tut-ch').textContent, talking: t.talking,
    ok: !t.root.querySelector('.tut-ok').hidden,
    ring: ring && { x: ring.x + ring.width / 2, y: ring.y + ring.height / 2 },
    ring2: ring2 && { x: ring2.x + ring2.width / 2, y: ring2.y + ring2.height / 2 } };
});
const ff = (s, dt = 0.1) => page.evaluate(([s, dt]) => window.__fastForward(s, dt), [s, dt]);
const hush = async () => {
  for (let k = 0; k < 6; k++) {
    const t = await state();
    if (!t.talking) return;
    await page.click('.tut-gen-ok').catch(() => {});
    await page.waitForTimeout(150);
  }
};
const SHOTS = new Set(['TARGET', 'M119 HOWITZER', 'A BATTERY', 'FIRE MODE', 'GOLD DIAMONDS', 'TAKE IT OUT', 'FREE STRIKE', 'COMMAND POST', 'DROPS']);
const log = { push: (l) => console.log(l), join: () => '' };
let last = -1, tries = 0;
for (let guard = 0; guard < 140; guard++) {
  await hush();
  await page.waitForTimeout(250);
  const s = await state();
  if (s.over) break;
  if (s.i !== last) {
    last = s.i; tries = 0;
    log.push(`${s.i + 1} ${s.ch} / ${s.title}`);
    if (SHOTS.has(s.title)) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/tmp/out/tut-${String(s.i + 1).padStart(2, '0')}-${s.title.toLowerCase().replace(/\W+/g, '-')}.png` });
    }
  } else if (++tries > 6) { log.push(`  STUCK on ${s.title}: skip step`); await page.evaluate(() => window.__tutorial.next()); continue; }
  const t = s.title;
  // The software renderer runs a few frames a second: after acting, wait
  // for the step to take it before acting again (a second tap on UNITS
  // shuts the drawer the first one opened).
  const moved = () => page.waitForFunction((i) => !window.__tutorial?.root || window.__tutorial.i !== i || window.__tutorial.talking,
    s.i, { timeout: 6000 }).catch(() => {});
  if (s.ok) { await page.click('.tut-ok', { timeout: 3000 }).catch(() => {}); await moved(); continue; }
  switch (t) {
    case 'LOOK AROUND': {
      const x = 400, y = 470;   // clear of the card in the middle
      await page.mouse.move(x, y); await page.mouse.down();
      for (let k = 1; k <= 12; k++) await page.mouse.move(x + k * 22, y);
      await page.mouse.up();
      break;
    }
    case 'ZOOM': for (let k = 0; k < 6; k++) { await page.mouse.move(550, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(60); } break;
    case 'UNITS': await page.click('#dock-units', { timeout: 4000 }).catch(() => log.push('  click missed')); break;
    case 'M119 HOWITZER': await page.click('#buildbar .unit-card[data-id="m119"]', { timeout: 4000 }).catch(() => log.push('  click missed')); break;
    case 'M240 MG': await page.click('#buildbar .unit-card[data-id="m240"]').catch(() => {});
      await page.waitForTimeout(200);
      // Down by the first gun.
      await page.evaluate(() => {
        const B = window.battle, T = window.THREE, u = B.units[0] || { pos: B.pending[0].pos };
        for (let k = 0; k < 24; k++) {
          const p = new T.Vector3(u.pos.x + Math.sin(k) * (14 + k), 0, u.pos.z + Math.cos(k) * (14 + k));
          p.y = B.terrain.heightAt(p.x, p.z);
          if (B.validPlacement(p).ok) { B.deploy('m240', p); if (B.pending.some((d) => d.def?.id === 'm240')) break; }
        }
      });
      await ff(30);
      break;
    case 'DEPLOY': case 'YOUR GUNS': case 'DESIGNATE':
      if (s.ring) await page.mouse.click(s.ring.x, s.ring.y);
      else log.push(`  no ring on ${t}`);
      if (t === 'DEPLOY') await ff(1);
      break;
    case 'AIRLIFT': case 'INBOUND': await ff(8); break;
    case 'A BATTERY':
      if (s.ring && s.ring2) {
        await page.mouse.move(s.ring.x, s.ring.y); await page.mouse.down();
        for (let k = 1; k <= 10; k++) await page.mouse.move(s.ring.x + (s.ring2.x - s.ring.x) * k / 10, s.ring.y + (s.ring2.y - s.ring.y) * k / 10);
        await page.mouse.up();
      } else log.push('  battery rings off screen');
      await ff(30);
      log.push(`  guns: ${await page.evaluate(() => window.battle.units.filter((u) => u.alive).length + '+' + window.battle.pending.length)}`);
      break;
    case 'SURVEY': case 'SURVEY OFF': await page.click('#survey-btn', { timeout: 4000 }).catch(() => log.push('  click missed')); break;
    case 'ORDERS': await page.click('#dock-orders', { timeout: 4000 }).catch(() => log.push('  click missed')); break;
    case 'FIRE MODE': await page.click('#orders-modes [data-mode="area"]', { timeout: 4000 }).catch(() => log.push('  click missed')); break;
    case 'SMOKE': await page.click('#orders-smoke', { timeout: 4000 }).catch(() => log.push('  click missed')); break;
    case 'TAKE IT OUT': {
      // Tap the launcher's ring (the guns lay on it), then let them work.
      if (s.ring) await page.mouse.click(s.ring.x, s.ring.y);
      const tgt = await page.evaluate(() => window.battle.target ? window.battle.targetLabel || 'set' : null);
      log.push(`  designated: ${tgt}`);
      const hp = () => page.evaluate(() => { const B = window.battle, st = B.sams.sites[0];
        return `units ${B.units.filter((u) => u.alive).length}+${B.pending.length} hp ${st.launchers.map((l) => Math.round(l.hp)).join('/')} radar ${Math.round(st.radar?.hp ?? -1)} tgt ${B.target ? [B.target.x, B.target.y, B.target.z].map(Math.round) : '-'} l0 ${[st.launchers[0].x, st.launchers[0].y, st.launchers[0].z].map(Math.round)}`; });
      log.push('  ' + await hp());
      for (let k = 0; k < 4; k++) { await ff(10); log.push('  ' + await hp()); }
      const down = await page.evaluate(() => window.battle.sams.sites[0].down);
      if (!down) await page.evaluate(() => {   // the guns' work, finished
        const B = window.battle, st = B.sams.sites[0], T = window.THREE;
        for (const l of st.launchers) if (l.alive) B._samBlast(new T.Vector3(l.x, l.y, l.z), 8, 9000);
        if (st.radar?.alive) B._samBlast(new T.Vector3(st.radar.x, B.terrain.heightAt(st.radar.x, st.radar.z), st.radar.z), 8, 9000);
      });
      log.push(`  site down by guns: ${down}`);
      await ff(0.5);
      break;
    }
    case 'FREE STRIKE': {
      if (await page.evaluate(() => document.getElementById('drawer-strikes')?.hidden !== false)) await page.click('#dock-strikes', { timeout: 4000 }).catch(() => log.push('  click missed'));
      await page.waitForTimeout(400);
      const free = await page.$$eval('#strikebar .unit-card.free', (a) => a.map((e) => e.dataset.id));
      log.push(`  free cards: ${free.join(',')}`);
      if (free.length) {
        await page.click(`#strikebar .unit-card.free[data-id="${free.includes('f15') ? 'f15' : free[0]}"]`, { timeout: 4000 }).catch(() => log.push('  click missed'));
        await page.waitForTimeout(200);
        await page.mouse.click(550, 330);
      }
      await ff(1);
      break;
    }
    case 'COMMAND POST':
      if (s.ring) await page.mouse.click(s.ring.x, s.ring.y);
      await ff(20);
      await page.evaluate(() => { const B = window.battle, h = B.hq; if (h?.alive) B._samBlast(new window.THREE.Vector3(h.x, h.y, h.z), 40, 90000); });
      await ff(0.5);
      break;
    case 'BRING IT DOWN': {
      // The tower's fall is the suite's business; here only that a win ends it.
      await page.evaluate(() => { window.battle.state = 'won'; });
      await page.waitForTimeout(1500);
      break;
    }
    default: log.push(`  no driver for ${t}`); await ff(2);
  }
  await moved();
}
const end = await page.evaluate(() => ({ told: [...(window.__tutorial._told || [])], state: window.battle.state, seen: localStorage.getItem('tt.tutorial'),
  comms: window.battle.commsDown, credits: window.battle.strikeCredits }));
console.log(JSON.stringify({ end, errors }));
await b.close();
