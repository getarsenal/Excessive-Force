// The white dots on the guns: an M777 and an M119 shot from twenty metres at
// phone pixel density, the near-white outlier pixels on them counted, then
// the same shot with each suspect switched off in turn.
//   node tools/sparkleprobe.mjs [level=westminster] -> /tmp/out/sparkle-*.png
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** A PNG, 8-bit RGB or RGBA, not interlaced: what a screenshot is. */
function readPng(buf) {
  let p = 8, w = 0, h = 0, ch = 4; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ch = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 1; }
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = ch, stride = w * bpp, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++], line = Buffer.from(raw.subarray(q, q + stride)); q += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b2 = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b2; else if (f === 3) v += (a + b2) >> 1;
      else if (f === 4) { const pa = Math.abs(b2 - c), pb = Math.abs(a - c), pc = Math.abs(a + b2 - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b2 : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, i = x * bpp; out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = bpp === 4 ? line[i + 3] : 255; }
    prev = line;
  }
  return { width: w, height: h, data: out };
}
mkdirSync('/tmp/out', { recursive: true });
const level = process.argv[2] || 'westminster';
const port = process.env.TT_PORT || 5177;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1.5 });
const TIER = process.env.TIER || 'low';
await page.addInitScript((__tier) => { try { localStorage.setItem('tt.quality', __tier); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} }, TIER);
await page.goto(`http://localhost:${port}/?level=${level}&dist=${process.env.DIST || 120}&pitch=${process.env.PITCH || 0.6}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
await page.waitForTimeout(1200);
const setup = await page.evaluate(() => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true;
  // A gun on the ground, whatever the SAMs do to the lift: candidates round
  // the target, tried until one is standing and ready.
  const place = (id) => {
    for (let tries = 0; tries < 12; tries++) {
      let put = false;
      for (let k = 0; k < 400 && !put; k++) {
        const a = Math.random() * Math.PI * 2, rad = 300 + Math.random() * 120;
        const x = o.x + Math.cos(a) * rad, z = o.z + Math.sin(a) * rad;
        const p = new T.Vector3(x, terrain.heightAt(x, z), z);
        if (!B.validPlacement(p, null).ok) continue;
        const before = B.units.length + B.pending.length;
        B.deploy(id, p);
        put = B.units.length + B.pending.length > before;
      }
      const n0 = B.units.filter((u) => u.alive && u.def.id === id).length;
      for (let s = 0; s < 70 && !B.units.some((u) => u.alive && u.def.id === id && u.state === 'ready' && u.model); s++) window.__fastForward(1, 1 / 30);
      if (B.units.some((u) => u.alive && u.def.id === id && u.state === 'ready' && u.model)) return true;
      void n0;
    }
    return false;
  };
  const got = [place('m777'), place('m119')];
  for (const u of B.units) { u.age = 40; u.dugIn = true; u.handHeld = true; }   // sandbag rings too; held, so no firing and no smoke in the lens
  window.__fastForward(1, 1 / 30);
  const u = B.units.find((x) => x.alive && x.model) || B.units.find((x) => x.alive);
  if (!u) return { units: [], got };
  const mats = new Map();
  for (const q of B.units) q.group.traverse((m) => { if (m.isMesh) for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (mm) mats.set(mm, { type: mm.type, metal: mm.metalness, rough: mm.roughness, env: mm.envMapIntensity, map: !!mm.map, flat: mm.flatShading }); });
  // The camera: twenty metres off the first gun, looking at it, the sun behind the camera.
  const R = window.rig; R.enabled = false;
  const D = +(new URLSearchParams(location.search).get('dist') || 120), P = +(new URLSearchParams(location.search).get('pitch') || 0.6);   // ?dist=&pitch= on the URL
  R.target.copy(u.pos).setY(u.pos.y + 1.5); R.desiredTarget.copy(R.target); R.distance = R.desiredDistance = D; R.pitch = R.desiredPitch = P; R.yaw = R.desiredYaw = 0.8;
  for (let k = 0; k < 10; k++) R.update(0.1);
  document.body.classList.add('clear-view');
  return { got, units: B.units.map((q) => q.def.id), materials: [...mats.values()], env: !!window.__engine.scene.environment, exposure: window.__engine.renderer.toneMappingExposure, tone: window.__engine.renderer.toneMapping };
});
const shot = async (name) => {
  await page.evaluate(() => { for (let k = 0; k < 3; k++) window.__frame(); });
  await page.waitForTimeout(300);
  const path = `/tmp/out/sparkle-${name}.png`;
  await page.screenshot({ path, timeout: 420000 });
  const png = readPng(readFileSync(path));
  // Near-white pixels in the middle of the frame (where the gun is), isolated: brighter than all four neighbours by a margin.
  let white = 0, sparks = 0, dots = 0, rims = 0;
  const { width: W, height: H, data } = png;
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  for (let y = Math.floor(H * 0.3); y < H * 0.8; y++) for (let x = Math.floor(W * 0.15); x < W * 0.85; x++) {
    const i = (y * W + x) * 4; const l = lum(i);
    if (l > 170) { const n = [lum(i - 4), lum(i + 4), lum(i - W * 4), lum(i + W * 4)]; if (n.every((v) => l - v > 40)) dots++; if (l > 235) { white++; if (n.every((v) => l - v > 60)) sparks++; if (n.some((v) => v < 110)) rims++; } }
  }
  const r = { name, white, sparks, dots, rims };
  console.error(JSON.stringify(r));
  return r;
};
const out = { setup, shots: [] };
out.shadows = await page.evaluate(() => { const E = window.__engine; return { enabled: E.renderer.shadowMap.enabled, type: E.renderer.shadowMap.type, size: E.sun?.shadow?.mapSize?.x, bias: E.sun?.shadow?.bias, normalBias: E.sun?.shadow?.normalBias, radius: E.sun?.shadow?.radius }; });
out.bloom = await page.evaluate(() => { const E = window.__engine; return E.bloom ? { enabled: E.bloom.enabled, threshold: E.bloom.threshold, strength: E.bloom.strength, radius: E.bloom.radius } : null; });
out.shots.push(await shot('asis'));
const unitMats = `(fn) => { const B = window.battle; const seen = new Set(); for (const q of B.units) q.group.traverse((m) => { if (!m.isMesh) return; for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (mm && !seen.has(mm)) { seen.add(mm); fn(mm, m); } }); return seen.size; }`;
// No environment: the sky's reflection off the metal, or not.
await page.evaluate(() => { const E = window.__engine; E.__env = E.scene.environment; E.scene.environment = null; });
out.shots.push(await shot('noenv'));
await page.evaluate(() => { const E = window.__engine; E.scene.environment = E.__env; });
// No specular at all: the same colour and map on a Lambert material.
out.lambert = await page.evaluate(`(${unitMats})((mm, m) => { if (!mm.isMeshStandardMaterial) return; const T = window.THREE; const L = new T.MeshLambertMaterial({ color: mm.color, map: mm.map, side: mm.side, transparent: mm.transparent, opacity: mm.opacity }); mm.__swap = L; m.__orig = m.material; m.material = Array.isArray(m.material) ? m.material.map((x) => x.__swap || x) : L; })`);
out.shots.push(await shot('lambert'));
await page.evaluate(() => { const B = window.battle; for (const q of B.units) q.group.traverse((m) => { if (m.__orig) { m.material = m.__orig; delete m.__orig; } }); });
// Matte: metalness nought, roughness one, specular on.
await page.evaluate(`(${unitMats})((mm) => { if (mm.metalness == null) return; mm.__m = mm.metalness; mm.__r = mm.roughness; mm.metalness = 0; mm.roughness = 1; })`);
out.shots.push(await shot('matte'));
await page.evaluate(`(${unitMats})((mm) => { if (mm.__m != null) { mm.metalness = mm.__m; mm.roughness = mm.__r; } })`);
// Hard normals: every face its own, so no interpolated normal ever leans away from the eye.
out.hardnormals = await page.evaluate(() => { const B = window.battle; const seen = new Set(); for (const q of B.units) q.group.traverse((m) => { if (!m.isMesh || seen.has(m.geometry)) return; seen.add(m.geometry); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.computeVertexNormals(); m.__geo = m.geometry; m.geometry = g; }); return seen.size; });
out.shots.push(await shot('hardnormals'));
await page.evaluate(() => { const B = window.battle; for (const q of B.units) q.group.traverse((m) => { if (m.__geo) { m.geometry = m.__geo; delete m.__geo; } }); });
if (out.shadows.enabled) {
  await page.evaluate(() => { const E = window.__engine; E.setShadows(false); });
  out.shots.push(await shot('noshadow'));
  await page.evaluate(() => { const E = window.__engine; E.setShadows(true); });
}
if (out.bloom?.enabled) {
  await page.evaluate(() => { const E = window.__engine; E.bloom.enabled = false; });
  out.shots.push(await shot('nobloom'));
  await page.evaluate(() => { const E = window.__engine; E.bloom.enabled = true; });
}
console.log(JSON.stringify(out, null, 1));
await b.close();
