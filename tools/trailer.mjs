// The trailer, cut from the game itself.
//
// Playwright drives the real game a frame at a time: the page's clock is
// faked so every driven frame is exactly 1/FPS of game time whatever the
// box can render, the HUD is hidden, and each shot scripts a battle beat
// through the hooks the probes use (deploy, setTarget, callStrike, explode,
// the lift) with the camera on rails between two poses. Frames are read
// off the canvas as JPEGs, title cards are plain HTML screenshotted at the
// same size, and ffmpeg (ffmpeg-static) assembles the cut over the game's
// own menu track. Nothing to edit by hand.
//
//   node tools/trailer.mjs                     -> /tmp/out/trailer/trailer-720x1280.mp4
//   W=1080 H=1920 node tools/trailer.mjs       the phone cut at full size
//   W=1920 H=1080 node tools/trailer.mjs       the wide cut
//   ONLY=opener,stupa node tools/trailer.mjs   a few shots, to look at one
//   FPS=30 QUALITY=medium MUSIC=public/assets/audio/menu.mp3
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const W = +(process.env.W || 720), H = +(process.env.H || 1280);
const FPS = +(process.env.FPS || 30);
const port = process.env.TT_PORT || 5177;
const QUALITY = process.env.QUALITY || 'medium';
const OUT = process.env.OUT || '/tmp/out/trailer';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const MUSIC = process.env.MUSIC || 'public/assets/audio/menu.mp3';
const portrait = H > W;

// ── The shot list. `setup` runs in the page when the shot starts, with the
// battle (B), THREE (T), the landmark's origin (o), its ground (g) and the
// terrain, and returns the point the camera's poses are measured from.
// `pre` is game time run before the first captured frame (or `until`, a
// condition polled each frame, then `pre` more); `cam` is two poses, each
// an offset from the focus, a distance, a yaw and a pitch, eased between
// over the shot; `follow` tracks a moving thing instead.
const SHOTS = [
  { id: 'opener', level: 'tutorial', secs: 6, pre: 2.0,
    // One tap on the smokestack's foot and it is down inside ten seconds.
    setup: `
      B.airlift = false; B.invulnerable = true; B.freeBuild = true; B.unlockAll = true;
      if (B.garrison) B.garrison.fireEnabled = false;
      const s = B.primary, of = [];
      for (let i = 0; i < s.count; i++) if (s.tagOf[i] === 'stack') of.push(i);
      let cx = 0, cz = 0, ylo = Infinity, yhi = -Infinity;
      for (const i of of) { cx += s.px[i]; cz += s.pz[i]; ylo = Math.min(ylo, s.py[i]); yhi = Math.max(yhi, s.py[i]); }
      cx /= of.length || 1; cz /= of.length || 1;
      const yaw = window.__level?.camera?.yaw ?? 0.5;
      const sx = Math.cos(yaw), sz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
      let placed = 0;
      for (let k = 0; placed < 4 && k < 40; k++) {
        const r = -150 - placed * 14, f = 40 + (k % 3) * 10;
        const x = o.x + fx * f + sx * r, z = o.z + fz * f + sz * r;
        if (await B.deploy('m777', new T.Vector3(x, terrain.heightAt(x, z), z))) placed++;
      }
      B.setTarget(new T.Vector3(cx, ylo + 2, cz), 'stack');
      return { focus: [cx, (ylo + yhi) * 0.5, cz], yaw };`,
    cam: { from: { at: [0, -6, 0], dist: 95, yaw: 0.9, pitch: 0.16 }, to: { at: [0, -14, 0], dist: 70, yaw: 0.55, pitch: 0.2 } } },

  { card: { lines: ['ONE TAP.'], secs: 1.4 } },

  { id: 'battery', level: 'westminster', secs: 4.5, pre: 3.5,
    // A line of M777s on the embankment opening up on the Palace.
    setup: `
      B.airlift = false; B.invulnerable = true; B.freeBuild = true; B.unlockAll = true;
      const yaw = window.__level?.camera?.yaw ?? 0.5;
      const sx = Math.cos(yaw), sz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
      let placed = 0, mx = 0, mz = 0;
      for (let k = 0; placed < 8 && k < 60; k++) {
        const r = -70 + k * 12, f = 230 + (k % 2) * 8;
        const x = o.x + fx * f + sx * r, z = o.z + fz * f + sz * r;
        if (await B.deploy('m777', new T.Vector3(x, terrain.heightAt(x, z), z))) { placed++; mx += x; mz += z; }
      }
      mx /= placed || 1; mz /= placed || 1;
      B.setTarget(new T.Vector3(o.x, g + 28, o.z), 'palace');
      return { focus: [mx, terrain.heightAt(mx, mz) + 2, mz], yaw };`,
    cam: { from: { at: [0, 0, 0], dist: 42, yaw: 2.6, pitch: 0.1 }, to: { at: [0, 2, 0], dist: 52, yaw: 3.5, pitch: 0.14 } } },

  { id: 'lift', level: 'westminster', secs: 4.5, pre: 7, until: 'B.air && B.air.sorties.some((s) => s.model && s.def?.id !== "b1")',
    // Sixteen guns under sixteen Chinooks, over the river.
    setup: `
      B.airlift = true; B.invulnerable = true; B.freeBuild = true; B.unlockAll = true;
      let placed = 0;
      for (let tries = 0; tries < 600 && placed < 16; tries++) {
        const a = Math.random() * Math.PI * 2, rad = 160 + Math.random() * 120;
        const x = o.x + Math.cos(a) * rad, z = o.z + Math.sin(a) * rad;
        const p = new T.Vector3(x, terrain.heightAt(x, z), z);
        if (!B.validPlacement(p, null).ok) continue;
        const before = B.pending.length;
        B.deploy('m777', p);
        if (B.pending.length > before) placed++;
      }
      if (B.package) B._launch();
      return { focus: [o.x, g, o.z] };`,
    follow: 'sortie',
    cam: { from: { at: [0, -4, 0], dist: 48, yaw: -0.4, pitch: 0.22 }, to: { at: [0, -8, 0], dist: 64, yaw: 0.5, pitch: 0.3 } } },

  { card: { lines: ['REAL LANDMARKS.', 'REAL GROUND.'], secs: 1.6 } },

  { id: 'moab', level: 'westminster', secs: 5.5, pre: 1.5, until: 'B.air && B.air.sorties.some((s) => s.released)',
    // The B-1 over the Palace. The white-out is the shot.
    setup: `
      B.invulnerable = true; B.freeBuild = true; B.unlockAll = true;
      B.callStrike('b1', new T.Vector3(o.x, g, o.z));
      return { focus: [o.x, g + 20, o.z] };`,
    cam: { from: { at: [0, 0, 0], dist: 380, yaw: 0.6, pitch: 0.32 }, to: { at: [0, 10, 0], dist: 440, yaw: 0.9, pitch: 0.36 } } },

  { id: 'stupa', level: 'boudhanath', secs: 6, pre: 0.4,
    // The dome's foot cut on one side; the stupa comes down stone by stone.
    setup: `
      B.invulnerable = true; B.freeBuild = true; B.unlockAll = true;
      if (B.garrison) B.garrison.fireEnabled = false;
      const s = B.primary;
      let ylo = Infinity, rad = 0, n = 0;
      for (let i = 0; i < s.count; i++) if (s.tagOf[i] === 'dome') { ylo = Math.min(ylo, s.py[i]); }
      for (let i = 0; i < s.count; i++) if (s.tagOf[i] === 'dome' && s.py[i] < ylo + 3) { rad += Math.hypot(s.px[i] - o.x, s.pz[i] - o.z); n++; }
      rad = n ? rad / n : 40;
      const a0 = 0.6;
      for (let k = -2; k <= 2; k++) {
        const a = a0 + k * 0.22;
        s.explode({ x: o.x + Math.cos(a) * rad, y: ylo + 2.5, z: o.z + Math.sin(a) * rad }, 3, 16, 26000, { dir: { x: Math.cos(a), y: 0.1, z: Math.sin(a) }, kinetic: 0.9 });
      }
      s.stabilityDirty = true;
      return { focus: [o.x, ylo + 18, o.z], a0, rad };`,
    cam: { from: { at: [0, 0, 0], dist: 150, yaw: 0.6 - 0.5, pitch: 0.2 }, to: { at: [0, 6, 0], dist: 120, yaw: 0.6 + 0.45, pitch: 0.26 } } },

  { card: { lines: ['FREEDOM,', 'DELIVERED.'], sub: 'getarsenal.app', secs: 3, logo: true } },
];

// ── Helpers.
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const pad = (n) => String(n).padStart(5, '0');
mkdirSync(`${OUT}/frames`, { recursive: true });
for (const f of readdirSync(`${OUT}/frames`)) rmSync(`${OUT}/frames/${f}`);
let frameNo = 0;
const timeline = [];

const cardHtml = (c) => `<!doctype html><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap');
  html,body{margin:0;width:${W}px;height:${H}px;background:#0b0907;overflow:hidden}
  .w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(H * 0.012)}px;
     background:radial-gradient(ellipse at 50% 60%, #2a1a0e 0%, #0b0907 65%)}
  .l{font:700 ${Math.round(Math.min(W, H) * 0.11)}px/1.05 Oswald, Impact, sans-serif;letter-spacing:.08em;color:#f3ede4;text-transform:uppercase;text-align:center;
     text-shadow:0 2px 0 #3a2210, 0 0 40px rgba(255,138,72,.35)}
  .l.o{color:#ff8a48}
  .s{margin-top:${Math.round(H * 0.03)}px;font:500 ${Math.round(Math.min(W, H) * 0.045)}px/1 Oswald, sans-serif;letter-spacing:.3em;color:#c9b9a4}
  .g{position:absolute;inset:0;background:repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 2px, transparent 2px 4px);pointer-events:none}
  .bar{position:absolute;left:0;right:0;height:${Math.round(H * 0.012)}px;background:#ff8a48}
  .bar.t{top:${Math.round(H * 0.07)}px}.bar.b{bottom:${Math.round(H * 0.07)}px}
</style><div class="w">${c.logo ? '<div class="bar t"></div><div class="bar b"></div>' : ''}
  ${c.lines.map((l, i) => `<div class="l${c.logo && i === 1 ? ' o' : ''}">${l}</div>`).join('')}
  ${c.sub ? `<div class="s">${c.sub}</div>` : ''}</div><div class="g"></div>`;

async function renderCard(browser, c) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(cardHtml(c));
  await page.waitForTimeout(600);
  const first = `${OUT}/frames/${pad(frameNo)}.jpg`;
  await page.screenshot({ path: first, type: 'jpeg', quality: 92 });
  const n = Math.round(c.secs * FPS);
  for (let k = 1; k < n; k++) copyFileSync(first, `${OUT}/frames/${pad(frameNo + k)}.jpg`);
  timeline.push({ id: `card: ${c.lines.join(' ')}`, from: frameNo / FPS, secs: c.secs });
  frameNo += n;
  await page.close();
}

async function renderShot(browser, sh) {
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.addInitScript((q) => { try {
    localStorage.setItem('tt.quality', q); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0');
    localStorage.setItem('tt.tutorial', 'done'); } catch {} }, QUALITY);
  page.on('pageerror', (e) => console.log('  page error:', String(e).slice(0, 160)));
  await page.goto(`http://localhost:${port}/?level=${sh.level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.__frame, null, { timeout: 400000 });
  await page.waitForTimeout(1500);
  // The page's clock is ours from here: `performance.now` advances only
  // when a frame is driven, so each frame is exactly 1/FPS of game time.
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    let fake = performance.now();
    performance.now = () => fake;
    window.__tick = (ms) => { fake += ms; };
    const B = window.battle; B.airborne.auto = false; B.assault.auto = false;
    for (const id of ['ui']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
    document.querySelectorAll('.feed, #feed, .barks, #barks').forEach((e) => { e.style.visibility = 'hidden'; });
  });
  const info = await page.evaluate(async (src) => {
    const B = window.battle, T = window.THREE, terrain = window.terrain;
    const o = B.primary.origin, g = B.originGround;
    const fn = new Function('B', 'T', 'terrain', 'o', 'g', `return (async () => { ${src} })();`);
    return await fn(B, T, terrain, o, g);
  }, sh.setup);
  console.log(`  ${sh.id}: set up on ${sh.level}`, JSON.stringify(info).slice(0, 120));
  // The frame is read in the same call that draws it: a read in a later
  // call came after the compositor had taken the drawing buffer, and on
  // Westminster every frame read back black.
  const step = async (cam, capture = false) => {
    return await page.evaluate(([ms, cam, focus, follow, capture]) => {
      window.__tick(ms);
      const rig = window.__rig, B = window.battle, T = window.THREE;
      let f = new T.Vector3(...focus);
      if (follow === 'sortie') {
        const s = (B.air?.sorties || []).find((s) => s.model && s.def?.id !== 'b1') || (B.air?.sorties || [])[0];
        if (s?.model) f = s.model.position.clone();
      }
      if (cam) {
        rig.target.set(f.x + cam.at[0], f.y + cam.at[1], f.z + cam.at[2]);
        rig.desiredTarget.copy(rig.target);
        rig.distance = rig.desiredDistance = cam.dist;
        rig.yaw = rig.desiredYaw = cam.yaw;
        rig.pitch = rig.desiredPitch = cam.pitch;
      }
      // Full size every frame: the governor sheds pixels when a frame runs
      // long, and on a slow box every driven frame runs long.
      const e = window.__engine;
      if (e && e.renderScale !== 1) e.setRenderScale(1);
      window.__frame();
      return capture ? document.querySelector('canvas').toDataURL('image/jpeg', 0.9) : null;
    }, [1000 / FPS, cam, info.focus, sh.follow || null, capture]);
  };
  const lerpCam = (t) => {
    const k = ease(t), a = sh.cam.from, b = sh.cam.to;
    return { at: a.at.map((v, i) => v + (b.at[i] - v) * k), dist: a.dist + (b.dist - a.dist) * k, yaw: a.yaw + (b.yaw - a.yaw) * k, pitch: a.pitch + (b.pitch - a.pitch) * k };
  };
  // Run up to the beat: a condition, then the pre-roll, neither captured.
  if (sh.until) {
    const cond = new Function('B', `return !!(${sh.until});`);
    let waited = 0;
    while (waited < 60 && !(await page.evaluate((src) => new Function('B', src)(window.battle), `return !!(${sh.until});`))) {
      await step(lerpCam(0)); waited += 1 / FPS;
    }
    console.log(`  ${sh.id}: condition met after ${waited.toFixed(1)} s`);
    void cond;
  }
  for (let t = 0; t < sh.pre; t += 1 / FPS) await step(lerpCam(0));
  const n = Math.round(sh.secs * FPS);
  const start = frameNo;
  for (let k = 0; k < n; k++) {
    const data = await step(lerpCam(k / Math.max(1, n - 1)), true);
    writeFileSync(`${OUT}/frames/${pad(frameNo)}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
    frameNo++;
  }
  timeline.push({ id: sh.id, from: start / FPS, secs: sh.secs });
  console.log(`  ${sh.id}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await page.close();
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
console.log(`trailer ${W}x${H} @ ${FPS} fps, quality ${QUALITY}`);
for (const sh of SHOTS) {
  if (sh.card) { if (!ONLY) await renderCard(browser, sh.card); continue; }
  if (ONLY && !ONLY.has(sh.id)) continue;
  await renderShot(browser, sh);
}
await browser.close();

// ── The cut.
const ffmpeg = require('ffmpeg-static');
const out = `${OUT}/trailer-${W}x${H}.mp4`;
const total = frameNo / FPS;
const args = ['-y', '-framerate', String(FPS), '-i', `${OUT}/frames/%05d.jpg`];
if (existsSync(MUSIC)) args.push('-i', MUSIC, '-shortest', '-af', `afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, total - 2.5).toFixed(2)}:d=2.5`, '-c:a', 'aac', '-b:a', '160k');
// The canvas is drawn at the game's render scale, so the frames are not
// exactly W by H and may be odd; the encoder wants the size even.
args.push('-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
execFileSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`\n${out}  (${total.toFixed(1)} s, ${frameNo} frames)`);
for (const t of timeline) console.log(`  ${t.from.toFixed(1).padStart(5)} s  ${t.secs.toFixed(1)} s  ${t.id}`);
