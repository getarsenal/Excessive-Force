// How much the battle screen says, on a phone: a real fight, stepped by the
// harness's fast-forward a battle-second at a time (the crews' clock with it)
// so a software renderer can get through five minutes of it —
// three guns and an MG team on the tower, an air strike, an Apache — with
// every message channel hooked (feed, status, prompt, the generals' card,
// the crews' barks, popups, stamps, the news) and the screen sampled for
// how much of it is text. Prints the per-channel counts and rate per
// battle-minute, the busiest ten seconds, and the largest box seen.
//   node tools/chatterprobe.mjs [level=westminster] [battle-seconds=300]
//   -> /tmp/out/chatter/t<sec>.png every 20 s, /tmp/out/chatter/log.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const level = process.argv[2] || 'westminster';
const SECS = +(process.argv[3] || 300);
const OUT = '/tmp/out/chatter'; mkdirSync(OUT, { recursive: true });
const port = process.env.TT_PORT || 5177;
const W = +(process.env.W || 393), H = +(process.env.H || 852);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.addInitScript(() => { try {
  localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
  localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1');
} catch {} });
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, hud = window.hud;
  const log = window.__chat = [];
  const t = () => +(B.elapsed || 0).toFixed(1);
  const wrap = (obj, fn, ch, txt = (a) => a[0]) => {
    if (!obj || !obj[fn]) return;
    const f = obj[fn].bind(obj);
    obj[fn] = (...a) => { log.push({ t: t(), ch, text: String(txt(a) ?? '').slice(0, 90) }); return f(...a); };
  };
  wrap(hud, 'feed', 'feed'); wrap(hud, 'status', 'status'); wrap(hud, 'showPrompt', 'prompt');
  wrap(hud, 'popup', 'popup'); wrap(hud, 'stamp', 'stamp'); wrap(hud, 'milestone', 'milestone', () => '');
  if (window.__comcard) wrap(window.__comcard, 'say', 'general', (a) => a[1]);
  const bk = window.__barks;
  if (bk) {
    const f = bk.say.bind(bk);
    bk.say = (kind, near) => { const before = bk.until; f(kind, near); if (bk.until !== before) log.push({ t: t(), ch: 'bark', text: bk.el.textContent.slice(0, 90) }); };
  }
  B.freeBuild = true; B.money = Math.max(B.money, 60000);
  const was = B.unlockAll; B.unlockAll = true;
  const o = B.primary.origin;
  B.setTarget(new T.Vector3(o.x, B.originGround + 25, o.z), 'tower');
  let n = 0;
  for (const id of ['m777', 'm119', 'm777', 'm240']) {
    outer: for (const rad of [140, 170, 200, 240, 280]) for (let a = 200; a < 560; a += 23) {
      const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
      const p = new T.Vector3(x, terrain.heightAt(x, z), z);
      if (!B.validPlacement(p, null).ok) continue;
      const before = B.units.length + B.pending.length;
      B.deploy(id, p);
      if (B.units.length + B.pending.length > before) { n++; break outer; }
    }
  }
  B.unlockAll = was;
  window.__placed = n;
});
const samples = [];
let struck = 0;
for (let sec = 0; sec < SECS; sec++) {
  const st = await page.evaluate(() => {
    window.__fastForward(1, 1 / 30);
    window.__barks?.update(1);
    window.hud.update(1);
    return window.battle.state;
  });
  if (sec % 3 === 0) {
    await page.waitForTimeout(250);
    samples.push(await page.evaluate(() => {
      const vis = (el) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width * r.height > 0 ? r : null; };
      const boxes = [];
      const add = (name, el) => { const r = vis(el); if (r) boxes.push({ name, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim().slice(0, 60) }); };
      document.querySelectorAll('#feed .feed-line').forEach((e) => add('feed', e));
      add('status', document.getElementById('status')); add('prompt', document.getElementById('prompt'));
      add('general', document.getElementById('comcard')); add('bark', document.querySelector('.bark'));
      document.querySelectorAll('.popup, .stamp, .hud-stamp, .newsflash, .nf').forEach((e) => add(e.className.split(' ')[0], e));
      return { t: +(window.battle.elapsed || 0).toFixed(1), boxes, area: boxes.reduce((s, r) => s + r.w * r.h, 0) / (innerWidth * innerHeight) };
    }));
  }
  if (sec % 30 === 0) await page.screenshot({ path: `${OUT}/t${String(sec).padStart(3, '0')}.png` });
  const call = (id) => page.evaluate((id) => { const B = window.battle, T = window.THREE, o = B.primary.origin; const u = B.unlockAll; B.unlockAll = true; B.callStrike(id, new T.Vector3(o.x, B.terrain.heightAt(o.x, o.z), o.z)); B.unlockAll = u; }, id);
  if (!struck && sec > 40) { struck = 1; await call('f15'); }
  if (struck === 1 && sec > 90) { struck = 2; await call('ah64'); }
  if (st !== 'playing') break;
}
const log = await page.evaluate(() => window.__chat);
const placed = await page.evaluate(() => window.__placed);
const end = samples[samples.length - 1]?.t || 1;
const by = {};
for (const e of log) by[e.ch] = (by[e.ch] || 0) + 1;
let busiest = { n: 0 };
for (const e of log) { const n = log.filter((x) => x.t >= e.t && x.t < e.t + 10 && x.ch !== 'popup').length; if (n > busiest.n) busiest = { n, at: e.t }; }
const big = samples.flatMap((s) => s.boxes.map((x) => ({ ...x, t: s.t }))).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 5);
const maxArea = Math.max(...samples.map((s) => s.area));
const meanArea = samples.reduce((a, s) => a + s.area, 0) / samples.length;
writeFileSync(`${OUT}/log.json`, JSON.stringify({ log, samples }, null, 1));
console.log(JSON.stringify({ level, placed, battleSeconds: end, perMinute: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +(v / end * 60).toFixed(1)])), counts: by, busiest10s: busiest, textAreaMean: +(meanArea * 100).toFixed(1) + '%', textAreaMax: +(maxArea * 100).toFixed(1) + '%', biggest: big, errors }, null, 1));
console.log(log.filter((e) => e.ch !== 'popup').map((e) => `${e.t}\t${e.ch}\t${e.text}`).join('\n'));
await b.close();
