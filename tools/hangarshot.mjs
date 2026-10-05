// Every airframe on its own, lit and framed the same, from three sides: the
// design pass's contact sheet. Builds them with the game's own code in a
// loaded page (the builders need a document for their painted skins).
//
//   node tools/hangarshot.mjs [eagle,lancer,...] [-> /tmp/out/hangar/<kind>-{side,front,quarter,below}.png]
//
// Kinds: warthog eagle gbu28 lancer apache ghostrider tomahawk hercules chinook.
// Also prints each one's box, triangle count and the nose-art panel the game
// found on it (see noseart.js paintNoseArt), or NONE if it could not.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const kinds = (process.argv[2] || 'warthog,eagle,gbu28,lancer,apache,ghostrider,tomahawk,hercules,chinook').split(',');
const port = process.env.TT_PORT || 5177;
const OUT = process.env.OUT || '/tmp/out/hangar';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.addInitScript(() => { try { localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1'); localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.tutorial', 'done'); } catch {} });
await page.goto(`http://localhost:${port}/?level=westminster`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none' && window.battle, null, { timeout: 400000 });
const out = await page.evaluate(async (kinds) => {
  const THREE = window.THREE, R = window.engine.renderer;
  const air = await import('/src/game/aircraft.js');
  const nose = await import('/src/game/noseart.js');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb3c8);
  scene.add(new THREE.HemisphereLight(0xe6eef8, 0x6a6258, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.0); sun.position.set(-3, 5, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(4, 2.5, -3); scene.add(rim);
  const under = new THREE.DirectionalLight(0xe8eef4, 0.9); under.position.set(-2, -5, 3); scene.add(under);
  const W = 1200, H = 760;
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 4000);
  // `name=/src/game/airframes/eagle.js#makeEagle` builds from a module of
  // its own, freshly imported: how a builder is looked at before it is wired
  // into aircraft.js. `#makeHercules:gunship` passes { gunship: true }.
  const build = async (spec) => {
    const [k, modfn] = spec.split('=');
    if (modfn) {
      const [mod, fnspec] = modfn.split('#');
      const [fn, opt] = (fnspec || 'default').split(':');
      const m = await import(`${mod}?v=${Date.now()}`);
      return opt ? m[fn]({ [opt]: true }) : m[fn]();
    }
    if (k === 'hercules') return air.makeHercules();
    if (k === 'chinook') return air.makeChinook();
    if (k === 'gbu28') return air.makeAirframe({ aircraft: { kind: 'eagle', store: 'gbu28' } });
    return air.makeAirframe({ aircraft: { kind: k } });
  };
  const res = {};
  const px = new Uint8Array(W * H * 4);
  const shot = () => {
    R.setRenderTarget(rt); R.setClearColor(0x9fb3c8, 1); R.clear(); R.render(scene, cam);
    R.readRenderTargetPixels(rt, 0, 0, W, H, px); R.setRenderTarget(null);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const id = c.getContext('2d').createImageData(W, H);
    for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    c.getContext('2d').putImageData(id, 0, 0);
    return c.toDataURL('image/png');
  };
  for (const spec of kinds) {
    const k = spec.split('=')[0];
    let obj;
    try { obj = await build(spec); } catch (e) { res[k] = { error: String(e).slice(0, 200) }; continue; }
    // Paint the first nose art on it, the way a sortie is.
    const art = nose.ART[0];
    let panel = 'NONE';
    try { nose.paintNoseArt(obj, art, 3, 1); const m = obj.getObjectByName('noseart'); if (m) panel = `${m.position.x.toFixed(2)},${m.position.y.toFixed(2)},${m.position.z.toFixed(2)} w${m.geometry.parameters.width.toFixed(2)}`; } catch (e) { panel = 'ERR ' + String(e).slice(0, 80); }
    obj.traverse((m) => { if (m.isMesh && m.material?.transparent && m.material.opacity < 0.5 && m.name !== 'noseart') m.visible = false; });
    scene.add(obj); obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    let tris = 0; obj.traverse((m) => { if (m.isMesh && m.geometry) { const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    const r = Math.max(size.x, size.y, size.z) * 0.5;
    const d = r / Math.tan((24 / 2) * Math.PI / 180) * 0.78;
    const views = { side: [1, 0.12, 0.05], front: [0.15, 0.1, 1], quarter: [0.75, 0.42, 0.62], below: [0.6, -0.5, 0.55] };
    const imgs = {};
    for (const [name, [x, y, z]] of Object.entries(views)) {
      const v = new THREE.Vector3(x, y, z).normalize().multiplyScalar(d);
      cam.position.copy(c).add(v); cam.lookAt(c); cam.updateProjectionMatrix();
      imgs[name] = shot();
    }
    scene.remove(obj);
    res[k] = { box: [size.x, size.y, size.z].map((v) => +v.toFixed(2)), tris: Math.round(tris), panel, imgs };
  }
  return res;
}, kinds);
for (const [k, r] of Object.entries(out)) {
  if (r.error) { console.log(`${k}: ERROR ${r.error}`); continue; }
  for (const [n, d] of Object.entries(r.imgs)) writeFileSync(`${OUT}/${k}-${n}.png`, Buffer.from(d.split(',')[1], 'base64'));
  console.log(`${k}: box ${r.box.join('x')} tris ${r.tris} noseart ${r.panel}`);
}
await b.close();
