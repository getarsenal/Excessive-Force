// The gunner's view the way a phone shows it: three guns of a kind deployed
// twenty to fifty metres apart (no airlift), the first laid, the picture
// taken at the phone's pixel density with the HUD left on, then the same
// view with every gun forced to its full model, so a difference between the
// two is the far model's doing. Counts the isolated near-white specks on the
// guns either way.
//   KIND=m109 node tools/layshot.mjs [level=windsor] -> /tmp/out/layshot-<kind>-{lod,full}.png
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const level = process.argv[2] || 'windsor', kind = process.env.KIND || 'm109';
const port = process.env.TT_PORT || 5177;
mkdirSync('/tmp/out', { recursive: true });
function readPng(buf) {
  let p = 8, w = 0, h = 0, ch = 4; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ch = data[9] === 6 ? 4 : 3; }
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++], line = Buffer.from(raw.subarray(q, q + stride)); q += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, i = x * ch; out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = 255; }
    prev = line;
  }
  return { w, h, data: out };
}
const specks = (png) => {
  const { w, h, data } = png; let n = 0;
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  for (let y = Math.floor(h * 0.35); y < h * 0.75; y++) for (let x = 2; x < w - 2; x++) {
    const i = (y * w + x) * 4, l = lum(i);
    if (l < 200) continue;
    const nb = [lum(i - 8), lum(i + 8), lum(i - w * 8), lum(i + w * 8)];
    if (nb.every((v) => l - v > 50)) n++;
  }
  return n;
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); localStorage.setItem('tt.autostart', '1'); } catch {} });
await page.addStyleTag({ content: '' }).catch(() => {});
await page.goto(`http://localhost:${port}/?level=${level}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle && window.hud, null, { timeout: 400000 });
await page.waitForTimeout(1200);
await page.addStyleTag({ content: '#promotion, .promo, [class*="promot"], #crate-open, .crate-open { display: none !important; }' });
const setup = await page.evaluate(async (kind) => {
  const B = window.battle, T = window.THREE, terrain = window.terrain, o = B.primary.origin;
  B.freeBuild = true; B.unlockAll = true; B.invulnerable = true; B.airlift = false;
  if (B.garrison) B.garrison.fireEnabled = false;
  const got = [];
  for (let a = 0; a < 360 && got.length < 1; a += 7) {
    const x = o.x + Math.cos(a * Math.PI / 180) * 190, z = o.z + Math.sin(a * Math.PI / 180) * 190;
    const p = new T.Vector3(x, terrain.heightAt(x, z), z);
    const u = await B.deploy(kind, p);
    if (!u) continue;
    got.push(u);
    // Two more ahead of it toward the target, as the screenshot has them.
    const dir = new T.Vector3(o.x - x, 0, o.z - z).normalize(), side = new T.Vector3(dir.z, 0, -dir.x);
    for (const [f, s] of [[30, -14], [52, 16], [40, 28], [64, -20]]) {
      const q = p.clone().addScaledVector(dir, f).addScaledVector(side, s); q.y = terrain.heightAt(q.x, q.z);
      if (!B.validPlacement(q, null).ok) continue;
      const v = await B.deploy(kind, q); if (v) got.push(v);
    }
  }
  for (let k = 0; k < 60 && !got.every((u) => u.model && u.state === 'ready'); k++) { window.__fastForward(0.5, 1 / 30); await new Promise((r) => setTimeout(r, 20)); }
  for (const u of B.units) { u.handHeld = true; }
  window.__lay.enter(got[0]);
  // Laid low, twelve degrees, as the screenshot has it: the guns ahead in
  // the frame and the barrel under the eye, not across it.
  B.lay.elev = 0.21; B.layTurn(0, 0);
  for (let k = 0; k < 4; k++) { window.__fastForward(1 / 30, 1 / 30); window.__frame(); }
  return { n: got.length, dist: got.slice(1).map((u) => Math.round(u.pos.distanceTo(window.__engine.camera.position))), far: got.map((u) => u.lodFar) };
}, kind);
console.log('setup', JSON.stringify(setup));
const shot = async (name) => {
  await page.evaluate(() => { for (let k = 0; k < 2; k++) window.__frame(); });
  const path = `/tmp/out/layshot-${kind}-${name}.png`;
  await page.screenshot({ path, timeout: 600000 });
  return { name, specks: specks(readPng(readFileSync(path))), path };
};
const lod = await shot('lod');
await page.evaluate(() => {
  // Every gun on its full model, the far copies out of the picture.
  const B = window.battle;
  B._lod = () => {};
  for (const u of B.units) if (u.modelLo) { u.modelLo.visible = false; u.model.visible = true; u.lodFar = false; }
});
const full = await shot('full');
console.log(JSON.stringify({ lod, full }));
await b.close();
