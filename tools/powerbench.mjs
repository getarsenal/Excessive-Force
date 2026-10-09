// The battery's question, asked the same way of two builds: a phone at the
// phone's tier (an iPhone's agent and screen, the battery saver as it comes),
// a level loaded, the live loop stopped, and then frame after frame driven by
// hand through the real frame (`window.__frame`) in four scenes — quiet, a
// camera pan, a battery deployed and firing, the tower's base blown out —
// with each frame's draw timed to the GPU's finish (`gl.finish`; in the
// software rasteriser that is the vertex and fragment work itself), its
// triangles and draw calls counted across every pass, and whether the
// shadow map was redrawn. Then the page: how many elements wear a frosted
// backdrop filter, how many animations run forever, and what the audio
// does when the page is hidden.
//
//   PORTS=5178:before,5177:after RUNS=3 FRAMES=60 node tools/powerbench.mjs [level=westminster]
//   -> /tmp/out/powerbench/<label>-run<k>.json; python3 tools/powerstats.py reads them.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const level = process.argv[2] || 'westminster';
const PORTS = (process.env.PORTS || '5178:before,5177:after').split(',').map((s) => { const [p, l] = s.split(':'); return { port: +p, label: l || p }; });
const RUNS = +(process.env.RUNS || 3), FRAMES = +(process.env.FRAMES || 60), DSF = +(process.env.DSF || 2);
const TIER = process.env.TIER || 'medium';
const OUT = process.env.OUT || '/tmp/out/powerbench';
mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function run({ port, label }, k) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true, userAgent: UA });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript((tier) => { try {
    localStorage.setItem('tt.quality', tier); localStorage.setItem('tt.autostart', '1');
    localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done');
  } catch {} }, TIER);
  await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
  await page.waitForTimeout(2000);
  // The page as a player has it, before anything is driven: the HUD's
  // frosted panels and the animations that never end.
  const dom = await page.evaluate(() => {
    const frosted = [...document.querySelectorAll('body *')].filter((e) => {
      const s = getComputedStyle(e), f = s.backdropFilter || s.webkitBackdropFilter;
      return f && f !== 'none' && e.getClientRects().length;
    }).length;
    const forever = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity);
    return { frosted, forever: forever.length, foreverNames: [...new Set(forever.map((a) => a.animationName || a.id || '?'))] };
  });
  // Stop the live loop: the next frame it asks for is never given, and the
  // frames from here on are the harness's own.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(800);
  const meta = await page.evaluate(() => {
    const E = window.__engine, R = E.renderer, gl = R.getContext();
    window.testMenu.timeScale = (1 / 30) / 0.05;   // a frame is a thirtieth of a second of game, as on the saver
    R.info.autoReset = false;
    const real = E.render.bind(E), px = new Uint8Array(4);
    E.render = () => {
      const shadow = R.shadowMap.enabled && (R.shadowMap.autoUpdate || R.shadowMap.needsUpdate);
      R.info.reset();
      const t0 = performance.now();
      real();
      gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      window.__last = { renderMs: performance.now() - t0, tris: R.info.render.triangles, calls: R.info.render.calls, shadow };
    };
    return { buffer: R.getDrawingBufferSize(new window.THREE.Vector2()).toArray(), dpr: R.getPixelRatio(), quality: window.quality.id, shadowMapSize: window.quality.shadowMapSize, lean: document.body.classList.contains('lean') };
  });
  const frames = [];
  const drive = async (scene, n, before) => {
    for (let i = 0; i < n; i++) {
      const r = await page.evaluate((pre) => {
        if (pre === 'pan') { const R = window.rig; R.desiredTarget.x += 4; R.target.x += 4; }
        window.__last = null;
        const t0 = performance.now();
        window.__frame();
        const frameMs = performance.now() - t0;
        return { frameMs, ...(window.__last || {}), awake: window.physics.awakeCount };
      }, before);
      if (r.renderMs != null) frames.push({ scene, i, ...r });
    }
  };
  await drive('quiet', FRAMES);
  await drive('pan', FRAMES, 'pan');
  await page.evaluate(() => { const R = window.rig; R.desiredTarget.x -= 4 * 1e3; R.target.x -= 4 * 1e3; });
  await page.evaluate(() => { window.rig.desiredTarget.copy(window.battle.primary.origin); window.rig.target.copy(window.battle.primary.origin); });
  const placed = await page.evaluate(() => {
    const B = window.battle, T = window.THREE, o = B.primary.origin;
    B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
    B.setTarget(new T.Vector3(o.x, B.originGround + 25, o.z), 'tower');
    let n = 0;
    for (const rad of [240, 300]) for (let a = 0; a < 360 && n < 6; a += 30) {
      const x = o.x + Math.cos(a * Math.PI / 180) * rad, z = o.z + Math.sin(a * Math.PI / 180) * rad;
      const p = new T.Vector3(x, window.terrain.heightAt(x, z), z);
      if (!B.validPlacement(p, null).ok) continue;
      const before = B.units.length + B.pending.length;
      B.deploy('m777', p);
      if (B.units.length + B.pending.length > before) n++;
    }
    window.__fastForward(12, 1 / 30);   // set up, laid, and firing before the count starts
    return n;
  });
  await drive('battery', FRAMES);
  await page.evaluate(() => {
    // Charges on the tower's four walls at two heights: some eighty stones
    // out and as many bodies falling (the tower is hollow, so a charge at
    // its middle finds nothing).
    const B = window.battle, st = B.primary, o = st.origin;
    for (const h of [3, 9]) for (const [dx, dz] of [[7, 0], [-7, 0], [0, 7], [0, -7]]) st.explode({ x: o.x + dx, y: B.originGround + h, z: o.z + dz }, 4, 9, 60000, { dir: { x: 0, y: 0.1, z: 1 }, kinetic: 0.8 });
    st.stabilityDirty = true;
  });
  await drive('collapse', FRAMES);
  // The page put away: what is the sound doing?
  const hidden = await page.evaluate(async () => {
    // Started as a tap would start it, so there is a context to put away.
    try { await window.audio.unlock(); } catch { /* none */ }
    const shown = window.audio?.ctx?.state || 'none';
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 400));
    return { audioShown: shown, audioState: window.audio?.ctx?.state || 'none' };
  });
  const out = { label, port, run: k, level, meta, dom, hidden, placed, errors, frames };
  writeFileSync(`${OUT}/${label}-run${k}.json`, JSON.stringify(out));
  const by = (s) => frames.filter((f) => f.scene === s);
  const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; };
  console.log(`${label} run${k} ${JSON.stringify(meta)} frosted ${dom.frosted} forever ${dom.forever} audio ${hidden.audioShown}->${hidden.audioState} when hidden guns ${placed} errors ${errors.length}`);
  for (const s of ['quiet', 'pan', 'battery', 'collapse']) {
    const f = by(s);
    console.log(`  ${s.padEnd(9)} n ${f.length}  render med ${med(f.map((x) => x.renderMs)).toFixed(1)} ms  tris med ${Math.round(med(f.map((x) => x.tris)) / 1000)}k  shadow ${f.filter((x) => x.shadow).length}/${f.length}  awake med ${med(f.map((x) => x.awake))}`);
  }
  await ctx.close();
}
// Interleaved, so whatever the machine is doing drifts over both builds alike.
for (let k = 0; k < RUNS; k++) for (const p of (k % 2 ? PORTS.slice().reverse() : PORTS)) await run(p, k);
await b.close();
