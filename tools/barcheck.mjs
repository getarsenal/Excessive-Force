// The demolition bar against the unlock cards: brings the objective down a
// few stones at a time and, at every step, checks that each released weapon
// is unlocked exactly when the number on the bar has reached the number on
// its card, and that the fill's edge is where the number says.
//
//   node tools/barcheck.mjs [level=bucharest]   -> /tmp/out/bar-<level>.png
import { chromium } from 'playwright';
const level = process.argv[2] || 'bucharest';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
  localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const bad = [];
let steps = 0, opened = new Set();
const quoted = new Map();
for (let round = 0; round < 60; round++) {
  const r = await page.evaluate(() => {
    const B = window.battle;
    B.airborne.auto = false; B.assault.auto = false;
    // A few stones off the objective, then let the HUD draw.
    const S = B.objectives[0].structure;
    let n = Math.max(1, Math.round(S.count * 0.0025));
    for (let i = 0; i < S.count && n > 0; i++) if (S.isAlive(i)) { S.destroyChunk(i); n--; }
    window.__fastForward(0.2);
    return B.objectiveProgress;
  });
  // The HUD draws on the next frames, which are slow in software: wait for
  // the fill to arrive, then a few frames more for the cards.
  await page.waitForFunction((d) => Math.abs(parseFloat(document.getElementById('hud-integrity').style.width) - d * 100) < 0.05, r, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => new Promise((res) => { let n = 0; const f = () => (++n > 4 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const s = await page.evaluate(() => {
    const B = window.battle;
    const shown = parseInt(document.getElementById('hud-integrity-pct').textContent, 10);
    const fill = parseFloat(document.getElementById('hud-integrity').style.width);
    const cards = [...document.querySelectorAll('#buildbar .unit-card, #strikebar .unit-card')].map((c) => {
      const lock = c.querySelector('.uc-lock');
      return { id: c.dataset.id, locked: c.classList.contains('locked'), sealed: c.classList.contains('sealed'),
        txt: lock ? lock.textContent : '' };
    });
    return { shown, fill, done: B.objectiveProgress, cards, state: B.state };
  });
  steps++;
  if (Math.abs(s.fill - s.done * 100) > 0.6) bad.push(`fill ${s.fill} vs done ${(s.done * 100).toFixed(2)}`);
  if (s.shown > s.done * 100 + 1e-6) bad.push(`shown ${s.shown}% above done ${(s.done * 100).toFixed(2)}`);
  for (const c of s.cards) {
    const m = /AT (\d+)%/.exec(c.txt);
    if (c.sealed) continue;
    if (c.locked && m && s.shown >= +m[1]) bad.push(`${c.id} says AT ${m[1]}% and is locked at ${s.shown}%`);
    // And the other way: open before the bar has reached its number.
    if (c.locked && m) quoted.set(c.id, +m[1]);
    if (!c.locked && quoted.has(c.id) && s.shown < quoted.get(c.id)) bad.push(`${c.id} opened at ${s.shown}% before its ${quoted.get(c.id)}%`);
    if (!c.locked) opened.add(c.id);
  }
  if (s.done > 0.3 || s.state !== 'playing') break;
}
await page.screenshot({ path: `/tmp/out/bar-${level}.png`, clip: { x: 0, y: 0, width: 430, height: 220 } });
const final = await page.evaluate(() => [document.getElementById('hud-integrity-pct').textContent, document.getElementById('hud-integrity').style.width]);
console.log(JSON.stringify({ level, steps, final, opened: [...opened].length, bad: bad.slice(0, 10), nbad: bad.length, errors }));
await b.close();
