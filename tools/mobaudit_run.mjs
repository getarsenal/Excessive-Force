// Mobile layout audit: the real game at phone and tablet viewports, portrait
// and landscape, every HUD state screenshotted and measured through the DOM.
//
//   node tools/mobaudit_run.mjs [viewport-id ...]   -> /tmp/out/mobaudit/
//
// Writes <vp>-<screen>.png and <vp>-<screen>.json per state, and
// summary.json with every measurement, for mobaudit_report.mjs to tabulate.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/out/mobaudit';
fs.mkdirSync(OUT, { recursive: true });
const port = process.env.TT_PORT || 5177;
const level = process.env.TT_LEVEL || 'westminster';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const VIEWPORTS = [
  { id: 'iphone15pro-portrait', w: 393, h: 852, dpr: 3, ua: IPHONE_UA, insets: { top: 59, bottom: 34, left: 0, right: 0 }, rotate: true, rotInsets: { top: 0, bottom: 21, left: 59, right: 59 } },
  { id: 'iphone15pro-landscape', w: 852, h: 393, dpr: 3, ua: IPHONE_UA, insets: { top: 0, bottom: 21, left: 59, right: 59 } },
  { id: 'pixel8-portrait', w: 412, h: 915, dpr: 2.625, ua: ANDROID_UA, insets: { top: 48, bottom: 24, left: 0, right: 0 }, rotate: true, rotInsets: { top: 0, bottom: 24, left: 48, right: 48 } },
  { id: 'pixel8-landscape', w: 915, h: 412, dpr: 2.625, ua: ANDROID_UA, insets: { top: 0, bottom: 24, left: 48, right: 48 } },
  { id: 'android-small-portrait', w: 360, h: 780, dpr: 3, ua: ANDROID_UA, insets: { top: 32, bottom: 24, left: 0, right: 0 }, rotate: true, rotInsets: { top: 0, bottom: 24, left: 32, right: 32 } },
  { id: 'ipadmini-portrait', w: 744, h: 1133, dpr: 2, ua: IPAD_UA, insets: { top: 24, bottom: 20, left: 0, right: 0 }, rotate: true, rotInsets: { top: 24, bottom: 20, left: 0, right: 0 } },
  { id: 'ipadmini-landscape', w: 1133, h: 744, dpr: 2, ua: IPAD_UA, insets: { top: 24, bottom: 20, left: 0, right: 0 } },
];
const only = process.argv.slice(2);
const todo = only.length ? VIEWPORTS.filter((v) => only.includes(v.id)) : VIEWPORTS;

// ── The DOM audit, run inside the page ───────────────────────────────────
function auditInPage(opts) {
  const W = innerWidth, H = innerHeight;
  const ins = opts.insets;
  const sel = (el) => {
    if (el.id) return '#' + el.id;
    let s = el.tagName.toLowerCase();
    const cls = [...el.classList].filter((c) => !/^(on|in|open|selected|armed|us|enemy|hot|primary)$/.test(c)).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const p = el.parentElement;
    if (p && p.id) s = '#' + p.id + ' > ' + s;
    else if (p && p.classList.length) s = '.' + p.classList[0] + ' > ' + s;
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22);
    return t ? `${s} "${t}"` : s;
  };
  const opacityOf = (el) => {
    let o = 1, e = el, n = 0;
    while (e && e !== document.documentElement && n++ < 12) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; }
    return o;
  };
  // The part of an element's box that its scroll/overflow ancestors let
  // through, and whether any of them cut it (a row further down a list is
  // not clipped by the screen, it is behind a scroll).
  const clipRect = (el) => {
    let r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom, cut = false;
    let e = el.parentElement, n = 0;
    while (e && e !== document.documentElement && n++ < 30) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const a = e.getBoundingClientRect();
        const l2 = Math.max(left, a.left), t2 = Math.max(top, a.top), r2 = Math.min(right, a.right), b2 = Math.min(bottom, a.bottom);
        if (l2 !== left || t2 !== top || r2 !== right || b2 !== bottom) cut = true;
        left = l2; top = t2; right = r2; bottom = b2;
      }
      e = e.parentElement;
    }
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top), cut };
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (opacityOf(el) < 0.05) return false;
    const c = clipRect(el);
    if (c.width <= 0 || c.height <= 0) return false;
    return true;
  };
  // Can a finger actually land on it: the element under its own centre.
  const reachable = (el, c) => {
    const x = Math.min(W - 1, Math.max(0, (c.left + c.right) / 2)), y = Math.min(H - 1, Math.max(0, (c.top + c.bottom) / 2));
    const hit = document.elementFromPoint(x, y);
    return !!hit && (el.contains(hit) || hit.contains(el));
  };
  const box = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const inter = (a, b) => {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y;
  };

  // Interactive elements.
  const ISEL = 'button, a[href], input, select, textarea, summary, [role="button"], .unit-card, .ef-row, .tt-item, .tt-row, .dock-btn, [data-act]';
  const inter_els = [...document.querySelectorAll(ISEL)].filter((el) => visible(el) && getComputedStyle(el).pointerEvents !== 'none');
  const all = inter_els.map((el) => { const c = clipRect(el); return { el, sel: sel(el), r: el.getBoundingClientRect(), c, reach: reachable(el, c) }; });
  // Behind a scroll (a list row below the fold) is not a layout fault; a
  // control under a modal is not one either. Measured: what a finger can reach.
  const targets = all.filter((t) => t.reach);
  const occluded = all.filter((t) => !t.reach && !t.c.cut).map((t) => ({ sel: t.sel, box: box(t.r) }));
  const scrolled = all.filter((t) => !t.reach && t.c.cut).length;
  const small = targets.filter((t) => t.r.width < 44 || t.r.height < 44).map((t) => ({ sel: t.sel, box: box(t.r) }));
  // Clipped: the element's own box runs off the screen, and no scroll
  // container is responsible for it.
  const clipped = all.filter((t) => !t.c.cut && (t.r.left < -1 || t.r.top < -1 || t.r.right > W + 1 || t.r.bottom > H + 1))
    .map((t) => ({ sel: t.sel, box: box(t.r), offscreen: (t.r.right <= 0 || t.r.bottom <= 0 || t.r.left >= W || t.r.top >= H) }));
  const safe = targets.filter((t) => t.c.top < ins.top || t.c.bottom > H - ins.bottom || t.c.left < ins.left || t.c.right > W - ins.right)
    .map((t) => ({ sel: t.sel, box: box(t.r), zone: [t.c.top < ins.top && 'top', t.c.bottom > H - ins.bottom && 'bottom', t.c.left < ins.left && 'left', t.c.right > W - ins.right && 'right'].filter(Boolean).join('+') }));
  // Overlapping interactive elements (neither contains the other).
  const ioverlaps = [];
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ar = inter(a.c, b.c);
    if (ar > 4) ioverlaps.push({ a: a.sel, b: b.sel, area: Math.round(ar), boxA: box(a.r), boxB: box(b.r) });
  }
  // Panels overlapping each other.
  const PSEL = ['#topbar', '#bossbar', '#dock', '#drawer-units', '#drawer-strikes', '#drawer-orders', '#targetcard', '#loiters', '#unit-card', '#feed', '#comcard', '.bark', '#survey-btn', '#survey-key', '#prompt', '#clip-btn', '#status', '#test-btn', '#restore-btn', '#unit-tip', '.tt-wire', '.tt-top', '.tt-menu', '.tt-side', '.ef-top', '.ef-banner', '.ef-go', '.ef-back', '.ef-resume', '.ef-foot'];
  const panels = [];
  for (const s of PSEL) for (const el of document.querySelectorAll(s)) if (visible(el)) panels.push({ el, sel: s, r: el.getBoundingClientRect() });
  // The dock container spans the whole width; use the union of its buttons.
  const dockBtns = [...document.querySelectorAll('.dock-btn')].filter(visible).map((b) => b.getBoundingClientRect());
  let dockRect = null;
  if (dockBtns.length) dockRect = { left: Math.min(...dockBtns.map((r) => r.left)), right: Math.max(...dockBtns.map((r) => r.right)), top: Math.min(...dockBtns.map((r) => r.top)), bottom: Math.max(...dockBtns.map((r) => r.bottom)) };
  for (const p of panels) if (p.sel === '#dock' && dockRect) p.r = dockRect;
  const poverlaps = [];
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
    const a = panels[i], b = panels[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ar = inter(a.r, b.r);
    if (ar > 4) poverlaps.push({ a: a.sel, b: b.sel, area: Math.round(ar), boxA: box(a.r), boxB: box(b.r) });
  }
  // Small text.
  const small_text = [], seen = new Map();
  let under12 = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim()) continue;
    const el = node.parentElement;
    if (!el || !visible(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) under12++;
    if (fs < 11) {
      const s = sel(el);
      const k = s.replace(/ ".*"$/, '') + '@' + fs.toFixed(1);
      if (!seen.has(k)) { seen.set(k, 1); small_text.push({ sel: s, px: +fs.toFixed(1) }); } else seen.set(k, seen.get(k) + 1);
    }
  }
  for (const t of small_text) t.n = seen.get(t.sel.replace(/ ".*"$/, '') + '@' + t.px.toFixed(1));
  // Horizontal scroll.
  const se = document.scrollingElement || document.documentElement;
  const hscroll = { doc: se.scrollWidth > W + 1, docW: se.scrollWidth, body: document.body.scrollWidth > W + 1 };
  for (const s of ['#title', '#worldmap', '.ef-body', '.tt-shell']) {
    const el = document.querySelector(s); if (el && visible(el)) hscroll[s] = el.scrollWidth > el.clientWidth + 1;
  }
  // Canvas.
  const c = document.getElementById('game-canvas');
  const cr = c ? c.getBoundingClientRect() : null;
  const canvas = c ? { bufW: c.width, bufH: c.height, cssW: Math.round(cr.width), cssH: Math.round(cr.height), inner: [W, H], dpr: devicePixelRatio,
    pr: window.engine?.renderer?.getPixelRatio?.(), aspect: window.engine?.camera?.aspect } : null;
  // Dock vs target.
  let dockTarget = null;
  if (dockRect && window.engine && window.battle && window.THREE) {
    const pts = [];
    const g = window.battle.originGround || 0;
    const hText = document.getElementById('hud-height')?.textContent || '';
    const hh = parseFloat(hText) || 60;
    for (const [n, y] of [['base', g + 2], ['mid', g + hh / 2], ['top', g + hh]]) {
      const v = new window.THREE.Vector3(0, y, 0).project(window.engine.camera);
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      const dr = [...document.querySelectorAll('.drawer')].filter(visible).map((d) => d.getBoundingClientRect());
      pts.push({ n, x: Math.round(sx), y: Math.round(sy), onScreen: v.z < 1 && sx >= 0 && sx <= W && sy >= 0 && sy <= H,
        underDock: sx >= dockRect.left && sx <= dockRect.right && sy >= dockRect.top && sy <= dockRect.bottom,
        underDrawer: dr.some((r) => sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) });
    }
    dockTarget = { dock: box(dockRect), dockBottomGap: Math.round(H - dockRect.bottom), btn: dockBtns.map(box), pts };
  }
  // Drawer overflow.
  const drawers = {};
  for (const id of ['drawer-units', 'drawer-strikes', 'drawer-orders']) {
    const d = document.getElementById(id); if (!d || !visible(d)) continue;
    const bar = d.querySelector('.cardbar');
    const r = d.getBoundingClientRect();
    drawers[id] = { box: box(r), offBottom: Math.round(r.bottom - H), offTop: Math.round(-r.top),
      barScrollW: bar?.scrollWidth, barClientW: bar?.clientWidth, barOverflows: bar ? bar.scrollWidth > bar.clientWidth + 1 : null,
      cards: bar ? bar.children.length : null, cardW: bar?.firstElementChild ? Math.round(bar.firstElementChild.getBoundingClientRect().width) : null,
      cardH: bar?.firstElementChild ? Math.round(bar.firstElementChild.getBoundingClientRect().height) : null,
      overDock: dockRect ? Math.round(inter(r, dockRect)) : null };
  }
  // Top bar legibility.
  const tb = {};
  const tbEl = document.getElementById('topbar');
  if (tbEl && visible(tbEl)) {
    tb.box = box(tbEl.getBoundingClientRect());
    for (const s of ['.tb-value', '.tb-label', '.tb-target-name', '.tb-sub', '.integrity-pct', '.tb-income', '.objectives']) {
      const el = tbEl.querySelector(s); if (el && visible(el)) tb[s] = +parseFloat(getComputedStyle(el).fontSize).toFixed(1);
    }
    const nm = tbEl.querySelector('.tb-target-name');
    if (nm) tb.nameTruncated = nm.scrollWidth > nm.clientWidth + 1;
    tb.rows = Math.round(tbEl.getBoundingClientRect().height);
  }
  // End card.
  let endcard = null;
  const ecn = document.getElementById('ec-next');
  if (ecn && visible(ecn)) {
    const r = ecn.getBoundingClientRect();
    const sc = document.querySelector('#endcard .ec-scroll');
    endcard = { next: box(r), inThumbReach: r.top >= H * 0.6, scrollOverflows: sc ? sc.scrollHeight > sc.clientHeight + 1 : null,
      scrollH: sc?.scrollHeight, scrollClient: sc?.clientHeight };
  }
  // Comcard / bark / feed vs dock & drawers.
  const vsDock = {};
  for (const s of ['#comcard', '.bark', '#feed', '#prompt', '#unit-card', '#targetcard', '#survey-btn', '#clip-btn']) {
    const el = document.querySelector(s); if (!el || !visible(el)) continue;
    let r = el.getBoundingClientRect();
    if (s === '#feed') { const ls = [...el.querySelectorAll('.feed-line')]; if (!ls.length) continue; const rs = ls.map((l) => l.getBoundingClientRect()); r = { left: Math.min(...rs.map((q) => q.left)), right: Math.max(...rs.map((q) => q.right)), top: Math.min(...rs.map((q) => q.top)), bottom: Math.max(...rs.map((q) => q.bottom)) }; r.width = r.right - r.left; r.height = r.bottom - r.top; }
    const dr = [...document.querySelectorAll('.drawer')].filter(visible).map((d) => d.getBoundingClientRect());
    vsDock[s] = { box: box(r), overDock: dockRect ? Math.round(inter(r, dockRect)) : 0, overDrawer: Math.round(dr.reduce((m, d) => Math.max(m, inter(r, d)), 0)),
      offBottom: Math.round(r.bottom - H), offRight: Math.round(r.right - W), offLeft: Math.round(-r.left), offTop: Math.round(-r.top) };
  }
  return { W, H, insets: ins, counts: { interactive: targets.length, occluded: occluded.length, scrolled, small: small.length, ioverlaps: ioverlaps.length, poverlaps: poverlaps.length, clipped: clipped.length, safe: safe.length, smallText: small_text.reduce((a, t) => a + t.n, 0), under12 },
    small, clipped, safe, ioverlaps, poverlaps, occluded, small_text, hscroll, canvas, dockTarget, drawers, tb, endcard, vsDock };
}

// ── Drive ─────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const summary = {};

for (const vp of todo) {
  const t0 = Date.now();
  console.log(`\n== ${vp.id} ${vp.w}x${vp.h} @${vp.dpr}`);
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true, userAgent: vp.ua });
  await ctx.addInitScript(() => { try {
    if (!sessionStorage.getItem('probe.init')) {
      sessionStorage.setItem('probe.init', '1');
      localStorage.clear();
      localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
      localStorage.setItem('tt.tutorial', 'done');
      localStorage.setItem('tt.progress', JSON.stringify({ westminster: { runs: 1, won: true }, paris: { runs: 2, won: true } }));
      localStorage.setItem('tt.ops', JSON.stringify({ stars: { westminster: 7, paris: 3 } }));
    }
  } catch {} });
  const page = await ctx.newPage();
  // Real notch and home-indicator insets, so env(safe-area-inset-*) resolves
  // as it does on the device rather than to zero.
  const cdp = await ctx.newCDPSession(page);
  let curInsets = vp.insets;
  const setInsets = async (ins) => { curInsets = ins; await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: ins.top, left: ins.left, bottom: ins.bottom, right: ins.right } }).catch((e) => console.log('  insets failed', e.message.slice(0, 80))); };
  await setInsets(vp.insets);
  // The software rasteriser draws a frame a second or so, and every CSS
  // transition and rAF-gated class waits on it. Snap to the resting state
  // so a measurement 600 ms after a tap is of the finished layout.
  const snap = () => page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' }).catch(() => {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  const rec = {};
  const shot = async (name, extra = {}) => {
    const vw = page.viewportSize();
    const a = await page.evaluate(auditInPage, { insets: curInsets }).catch((e) => ({ error: e.message }));
    a.viewport = vw; Object.assign(a, extra);
    rec[name] = a;
    const file = `${OUT}/${vp.id}-${name}.png`;
    await page.screenshot({ path: file, fullPage: false }).catch((e) => console.log('  shot failed', e.message));
    fs.writeFileSync(`${OUT}/${vp.id}-${name}.json`, JSON.stringify(a, null, 1));
    const c = a.counts || {};
    console.log(`  ${name.padEnd(16)} ${vw.width}x${vw.height} small=${c.small} iovl=${c.ioverlaps} povl=${c.poverlaps} clip=${c.clipped} safe=${c.safe} txt<11=${c.smallText}` +
      (a.hscroll?.doc ? ' HSCROLL' : '') + (a.canvas ? ` canvas ${a.canvas.bufW}x${a.canvas.bufH} css ${a.canvas.cssW}x${a.canvas.cssH}` : ''));
    return a;
  };

  // The other engineer's edits reload the page through Vite mid-run. Every
  // stage checks the battle is still there, reloads it if not, and is
  // written to be re-runnable.
  const loadBattle = async () => {
    await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 420000 });
    await snap();
    await page.waitForTimeout(1800);
  };
  const inBattle = () => page.evaluate(() => !!(window.battle && window.hud && document.getElementById('loading')?.style.display === 'none')).catch(() => false);
  const stage = async (name, fn) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!(await inBattle())) { console.log(`  [${name}] battle gone; reloading`); await loadBattle(); }
        await fn();
        return;
      } catch (e) {
        console.log(`  [${name}] attempt ${attempt} failed: ${e.message.split('\n')[0].slice(0, 120)}`);
        await page.waitForTimeout(1500);
      }
    }
  };
  const deployAndCards = async () => {
    const placed = await page.evaluate(() => {
      const B = window.battle, T = window.THREE, terrain = window.terrain;
      B.money = 99999;
      B.setTarget(new T.Vector3(0, B.originGround + 30, 0), 'tower');
      let unit = B.units.find((u) => u.alive) || null;
      if (!unit) outer: for (const rad of [60, 80, 100, 120, 150, 190, 230]) for (let a = 0; a < 360; a += 20) {
        const x = Math.cos(a * Math.PI / 180) * rad, z = Math.sin(a * Math.PI / 180) * rad;
        const p = new T.Vector3(x, terrain.heightAt(x, z), z);
        if (!B.validPlacement(p, null).ok) continue;
        const before = B.units.length + B.pending.length;
        B.deploy('m240', p);
        if (B.units.length + B.pending.length > before) { unit = B.units[B.units.length - 1] || B.pending[B.pending.length - 1]; break outer; }
      }
      return { ok: !!unit, units: B.units.length, pending: B.pending.length };
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const B = window.battle;
      const u = B.units.find((u) => u.alive) || B.units[0];
      if (u) window.unitCard.show(u);
      window.__comcard?.say('us', 'Battery, this is Buck. Walk it onto the tower and keep it there.');
      const b = window.__barks; if (b) { b.quiet = 0; b.cool = {}; const c = B.units.find((u) => u.alive && u.crew); if (c) b.say('idle', c); }
      window.hud.feed('TARGET: TOWER', 'big'); window.hud.feed('M240B EMPLACED', ''); window.hud.feed('DEFENDER DOWN', 'good');
    });
    await page.waitForTimeout(900);
    return placed;
  };

  try {
    // ── Battle ──
    if (process.env.TT_ONLY !== 'title') {
    await loadBattle();
    await stage('hud-idle', () => shot('hud-idle'));
    for (const d of ['units', 'strikes', 'orders']) {
      await stage(`drawer-${d}`, async () => {
        await page.evaluate((d) => { if (window.hud.openDrawer !== d) window.hud.setDrawer(d); }, d);
        await page.waitForFunction((d) => document.getElementById(`drawer-${d}`)?.classList.contains('on'), d, { timeout: 15000 }).catch(() => console.log('  drawer never opened', d));
        await page.waitForTimeout(400);
        await shot(`drawer-${d}`);
      });
    }
    await stage('cards', async () => {
      await page.evaluate(() => window.hud.setDrawer(null));
      await page.waitForTimeout(400);
      const placed = await deployAndCards();
      await shot('cards', { placed });
    });
    // Orientation change mid-session.
    if (vp.rotate) {
      await stage('rotated', async () => {
        const before = await page.evaluate(() => { const c = document.getElementById('game-canvas'); return { bufW: c.width, bufH: c.height, inner: [innerWidth, innerHeight] }; });
        await page.setViewportSize({ width: vp.h, height: vp.w });
        await setInsets(vp.rotInsets || vp.insets);
        await page.waitForTimeout(1500);
        if (!(await inBattle())) throw new Error('reloaded during rotation');
        await deployAndCards();
        await shot('rotated', { before });
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await setInsets(vp.insets);
        await page.waitForTimeout(1200);
        await shot('rotated-back', { before });
      });
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await setInsets(vp.insets);
    }
    // Pause, through the real button.
    await stage('pause', async () => {
      await page.evaluate(() => { window.__comcard?.hide(); window.unitCard?.hide(); });
      const paused = await page.evaluate(() => !document.getElementById('menu').hidden);
      if (!paused) await page.locator('#dock-menu').tap({ timeout: 5000 }).catch(() => page.evaluate(() => window.hud.onPause(true)));
      await page.waitForTimeout(700);
      await shot('pause');
      await page.evaluate(() => { const d = document.querySelector('#menu .menu-settings'); if (d) d.open = true; });
      await page.waitForTimeout(400);
      await shot('pause-settings');
      await page.evaluate(() => { const d = document.querySelector('#menu .menu-settings'); if (d) d.open = false; });
      await page.locator('#menu-resume').tap({ timeout: 5000 }).catch(() => page.evaluate(() => window.hud.onPause(false)));
      await page.waitForTimeout(500);
    });
    // End of battle report.
    await stage('endcard', async () => {
      await page.evaluate(() => {
        const B = window.battle;
        if (!document.body.classList.contains('ended')) window.__recordAndEnd({ ...B.summary(), score: 12000, time: 300, shotsFired: 20, spent: 9000, unitsLost: 0, leverage: 3, strikes: 0 });
      });
      await page.waitForFunction(() => { const b = document.getElementById('ec-next'); return b && b.getBoundingClientRect().height > 0 && getComputedStyle(b).opacity !== '0'; }, null, { timeout: 30000 }).catch(() => console.log('  endcard never showed'));
      await page.waitForTimeout(1500);
      await shot('endcard');
      await page.evaluate(() => { const m = document.querySelector('#endcard .ec-more'); if (m) m.open = true; });
      await page.waitForTimeout(400);
      await shot('endcard-more');
    });
    }

    // ── Title, door, list, dossier ──
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 300000 });
        await page.waitForSelector('#title .tt-menu', { timeout: 120000 }).catch(() => {});
        await snap();
        await page.waitForTimeout(3000);
        await shot('title');
        await page.locator('#title [data-act="campaign"]').first().tap({ timeout: 8000 }).catch(async (e) => { console.log('  campaign tap failed', e.message.slice(0, 80)); await page.evaluate(() => document.querySelector('#title [data-act="campaign"]')?.click()); });
        await page.waitForSelector('#worldmap .ef', { timeout: 60000 });
        await page.waitForTimeout(2500);
        // The front door is only shown when there is a next contract to
        // present; otherwise CAMPAIGN lands on the map and its list.
        let view = await page.evaluate(() => document.querySelector('#worldmap .ef')?.dataset.view);
        if (view === 'door') {
          await shot('door');
          await page.evaluate(() => document.getElementById('ef-tomap')?.click());
          await page.waitForTimeout(2000);
          view = await page.evaluate(() => document.querySelector('#worldmap .ef')?.dataset.view);
        } else console.log(`  no door view (landed on ${view})`);
        await shot('list', { view });
        await page.evaluate(() => { document.getElementById('ef-list')?.scrollIntoView({ block: 'start' }); });
        await page.waitForTimeout(600);
        await shot('list-scrolled');
        const ok = await page.evaluate(() => { const r = document.querySelector('.ef-row:not(.locked)'); if (!r) return false; r.scrollIntoView({ block: 'center' }); r.click(); return true; });
        if (!ok) console.log('  no open row to tap');
        await page.waitForTimeout(1800);
        await shot('dossier', { view: await page.evaluate(() => document.querySelector('#worldmap .ef')?.dataset.view) });
        // Doctrine and records, for completeness.
        await page.evaluate(() => document.getElementById('ef-back')?.click());
        await page.waitForTimeout(800);
        await page.evaluate(() => document.getElementById('ef-gear')?.click());
        await page.waitForTimeout(1200);
        await shot('records', { view: await page.evaluate(() => document.querySelector('#worldmap .ef')?.dataset.view) });
        break;
      } catch (e) { console.log(`  [title flow] attempt ${attempt} failed: ${e.message.split('\n')[0].slice(0, 120)}`); }
    }
  } catch (e) {
    console.log('  FAILED', e.message.slice(0, 300));
    rec.error = e.message.slice(0, 300);
    await page.screenshot({ path: `${OUT}/${vp.id}-FAILED.png` }).catch(() => {});
  }
  rec.errors = errors;
  summary[vp.id] = rec;
  fs.writeFileSync(`${OUT}/summary${process.env.TT_ONLY === 'title' ? '-title' : ''}.json`, JSON.stringify(summary, null, 1));
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(0)}s, page errors ${errors.length}`);
  await ctx.close();
}
await browser.close();
