import * as THREE from 'three';
import { makeAirframe, makeHercules, makeChinook } from '../game/aircraft.js';
import { ART, unlockedArt, warStats, paintNoseArt, artChoice, setArtChoice } from '../game/noseart.js';
import { feedback } from './feedback.js';

/**
 * The hangar.
 *
 * Where the player actually gets to look at the fleet. In a fight an
 * aircraft is a shape crossing the sky for four seconds at three hundred
 * metres; here it stands on the apron in front of the hangar, lit from the
 * open doors, turning slowly, and can be turned by hand and pulled in close.
 * Under it, the pieces of nose art the commander has earned: tap one and it
 * is painted on this airframe, here and in every sortie it flies from now on.
 * One choice per type, kept in the record (see noseart.js); RANDOM is the
 * old behaviour, a different piece each sortie.
 *
 *   hangarStage(host, { prog })  →  { destroy }
 *
 * Its own small renderer rather than the game's: the title screen has no
 * level loaded, and a canvas the width of a sheet at a pixel ratio of 1.5 is
 * cheap enough to leave running while the sheet is up.
 */

export const FLEET_KINDS = [
  { kind: 'warthog', name: 'A-10C', full: 'Thunderbolt II' },
  { kind: 'eagle', name: 'F-15E', full: 'Strike Eagle' },
  { kind: 'lancer', name: 'B-1B', full: 'Lancer' },
  { kind: 'apache', name: 'AH-64E', full: 'Apache' },
  { kind: 'ghostrider', name: 'AC-130J', full: 'Ghostrider' },
  { kind: 'hercules', name: 'C-130J', full: 'Hercules · the airlift' },
  { kind: 'chinook', name: 'CH-47F', full: 'Chinook · the sling lift' },
];

function build(kind) {
  if (kind === 'hercules') return makeHercules();
  if (kind === 'chinook') return makeChinook();
  return makeAirframe({ aircraft: { kind } });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** The concrete, drawn once: slabs, joints, a taxi line, oil where the engines stand. */
function apronTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6f7378'; g.fillRect(0, 0, S, S);
  // Grain.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // Expansion joints.
  g.strokeStyle = 'rgba(30,32,36,0.55)'; g.lineWidth = 3;
  for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * S / 4, 0); g.lineTo(k * S / 4, S); g.stroke(); g.beginPath(); g.moveTo(0, k * S / 4); g.lineTo(S, k * S / 4); g.stroke(); }
  // Stains.
  for (let i = 0; i < 14; i++) {
    const r = 10 + Math.random() * 40;
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
    rg.addColorStop(0, 'rgba(20,18,16,0.35)'); rg.addColorStop(1, 'rgba(20,18,16,0)');
    g.save(); g.translate(Math.random() * S, Math.random() * S); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(22, 22);
  t.anisotropy = 4;
  return t;
}

export function hangarStage(host, { prog } = {}) {
  const choice = artChoice();
  const earned = unlockedArt(prog);
  const stats = warStats(prog);
  const earnedIds = new Set(earned.map((a) => a.id));
  let kind = FLEET_KINDS[0].kind;

  host.innerHTML = `
    <div class="hg-view"><canvas class="hg-canvas"></canvas>
      <div class="hg-name"><b></b><i></i></div>
      <div class="hg-hint">DRAG TO TURN · PINCH TO ZOOM</div>
    </div>
    <div class="hg-chips" role="tablist">${FLEET_KINDS.map((f) => `<button class="hg-chip" type="button" role="tab" data-kind="${f.kind}">${f.name}</button>`).join('')}</div>
    <div class="hg-k">NOSE ART ON THIS AIRFRAME</div>
    <div class="hg-art">
      <button class="hg-piece random" type="button" data-art=""><span class="hg-dice">?</span><i>RANDOM</i></button>
      ${ART.map((a) => earnedIds.has(a.id)
        ? `<button class="hg-piece" type="button" data-art="${a.id}"><img src="${a.img}" alt=""><i>${esc(a.name)}</i></button>`
        : `<span class="hg-piece locked" title="${esc(a.how)}"><span class="hg-lock">?</span><i>${esc(a.how)}</i></span>`).join('')}
    </div>`;

  const canvas = host.querySelector('.hg-canvas');
  const view = host.querySelector('.hg-view');
  const nameEl = host.querySelector('.hg-name b'), fullEl = host.querySelector('.hg-name i');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x151a21);
  scene.fog = new THREE.Fog(0x151a21, 60, 160);
  scene.add(new THREE.HemisphereLight(0xdfe8f4, 0x4a4540, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.position.set(-22, 30, 34); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8fb8ff, 1.1); rim.position.set(30, 14, -30); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe2c0, 0.5); fill.position.set(25, 6, 30); scene.add(fill);

  // The apron, and the hangar behind it: a dark box open towards the camera,
  // its doors run back, a strip light along the lintel.
  const apron = new THREE.Mesh(new THREE.CircleGeometry(90, 48), new THREE.MeshStandardMaterial({ map: apronTexture(), roughness: 0.95, metalness: 0.02 }));
  apron.rotation.x = -Math.PI / 2; apron.receiveShadow = true; scene.add(apron);
  // The hangar: a wide shed well behind the spot, its doors run back to the
  // ends so the opening is dark, a strip light along the lintel, the
  // corrugations drawn as ribs. Far enough back that it is a backdrop, not
  // a wall beside the aircraft.
  const shed = new THREE.MeshStandardMaterial({ color: 0x343b44, roughness: 0.85, metalness: 0.15 });
  const shedDark = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 1 });
  const H = 24, D = 60, Wd = 130, Z = -75;
  const body = new THREE.Mesh(new THREE.BoxGeometry(Wd, H, D), shed);
  body.position.set(0, H / 2, Z - D / 2); body.receiveShadow = true; scene.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(Wd / 2, Wd / 2, D, 24, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2c333b, roughness: 0.9 }));
  roof.scale.set(1, 0.22, 1); roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI; roof.position.set(0, H, Z - D / 2);
  // The half-cylinder points up once turned onto its side; the scale flattens it to a low vault.
  roof.rotation.set(-Math.PI / 2, 0, 0); roof.scale.set(1, 1, 0.22); roof.position.set(0, H, Z - D / 2); scene.add(roof);
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 0.62, H * 0.84), shedDark);
  opening.position.set(0, H * 0.42, Z + 0.06); scene.add(opening);
  for (const sx of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.19, H * 0.86, 0.5), new THREE.MeshStandardMaterial({ color: 0x4a525b, roughness: 0.8, metalness: 0.3 }));
    door.position.set(sx * Wd * 0.405, H * 0.43, Z + 0.4); scene.add(door);
    for (let k = 0; k < 5; k++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.4, H * 0.86, 0.3), shed);
      rib.position.set(sx * (Wd * 0.405 - Wd * 0.085 + k * Wd * 0.042), H * 0.43, Z + 0.75); scene.add(rib);
    }
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.64, 1.6, 1.4), new THREE.MeshStandardMaterial({ color: 0x3d444d, roughness: 0.7 }));
  lintel.position.set(0, H * 0.86, Z + 0.7); scene.add(lintel);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.6, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
  strip.position.set(0, H * 0.86 - 1.1, Z + 1.0); scene.add(strip);
  const glow = new THREE.PointLight(0xffe9c4, 60, 90, 1.6); glow.position.set(0, H * 0.7, Z + 6); scene.add(glow);
  // A yellow taxi line up to the spot.
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 60), new THREE.MeshStandardMaterial({ color: 0xd9b43a, roughness: 0.9 }));
  line.rotation.x = -Math.PI / 2; line.position.set(0, 0.02, 30); scene.add(line);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  const pivot = new THREE.Group(); scene.add(pivot);
  let model = null, radius = 10;
  const cam = { yaw: 0.65, pitch: 0.28, dist: 1.0, spin: true };

  const setArt = (group) => {
    const id = choice[kind];
    const art = id ? earned.find((a) => a.id === id) : null;
    [...group.children].forEach((m) => { if (m.name === 'noseart') group.remove(m); });
    if (art) paintNoseArt(group, art, stats.wins, stats.bosses);
    host.querySelectorAll('.hg-piece').forEach((b) => b.classList.toggle('on', (b.dataset.art || '') === (id || '')));
  };

  const show = (k) => {
    kind = k;
    if (model) { pivot.remove(model); model.traverse((m) => { if (m.isMesh) { m.geometry?.dispose?.(); } }); }
    model = build(k);
    model.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    // The props and rotors are built with their blur discs for flight; on the
    // apron they would be a dark smear, so they stay out.
    model.traverse((m) => { if (m.isMesh && m.material?.transparent && m.material.opacity < 0.5) m.visible = false; });
    pivot.add(model);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    // Held just clear of the apron, the way a display model sits on its
    // stand: these airframes are built flying, gear up, and flat on the
    // concrete they read as a belly landing.
    model.position.set(-c.x, -box.min.y + 0.6 + size.y * 0.08, -c.z);
    radius = Math.max(size.x, size.z) * 0.5 + size.y * 0.3;
    pivot.position.set(0, 0, 0);
    setArt(model);
    const f = FLEET_KINDS.find((x) => x.kind === k);
    nameEl.textContent = f.name; fullEl.textContent = f.full;
    host.querySelectorAll('.hg-chip').forEach((b) => { b.classList.toggle('on', b.dataset.kind === k); b.setAttribute('aria-selected', b.dataset.kind === k ? 'true' : 'false'); });
    cam.dist = 1.0;
  };

  const resize = () => {
    const w = Math.max(200, view.clientWidth), h = Math.max(160, view.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const place = () => {
    const d = radius / Math.tan(camera.fov * 0.5 * Math.PI / 180) * 0.82 * cam.dist;
    const y = Math.sin(cam.pitch) * d, r = Math.cos(cam.pitch) * d;
    camera.position.set(Math.sin(cam.yaw) * r, Math.max(1.2, y) + radius * 0.25, Math.cos(cam.yaw) * r);
    camera.lookAt(0, radius * 0.22, 0);
  };

  // Turning by hand: a drag turns the camera round the aircraft, a wheel or
  // a pinch pulls it in. Spinning on its own resumes a few seconds after.
  let drag = null, lastPinch = 0, idleAt = 0;
  const pointers = new Map();
  const onDown = (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY }; cam.spin = false; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) cam.dist = Math.max(0.45, Math.min(2.2, cam.dist * (lastPinch / d)));
      lastPinch = d; drag = null; return;
    }
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.008;
    cam.pitch = Math.max(-0.05, Math.min(1.2, cam.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) lastPinch = 0; if (!pointers.size) { drag = null; idleAt = performance.now() + 4000; } };
  const onWheel = (e) => { e.preventDefault(); cam.dist = Math.max(0.45, Math.min(2.2, cam.dist * Math.exp(e.deltaY * 0.0015))); cam.spin = false; idleAt = performance.now() + 4000; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  host.addEventListener('click', (e) => {
    const chip = e.target.closest('.hg-chip');
    if (chip) { feedback.emit('open'); show(chip.dataset.kind); return; }
    const piece = e.target.closest('.hg-piece:not(.locked)');
    if (piece) {
      const id = piece.dataset.art || null;
      choice[kind] = id;
      setArtChoice(kind, id);
      feedback.emit('select');
      if (model) setArt(model);
    }
  });

  let raf = 0, last = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!cam.spin && !drag && !pointers.size && now > idleAt) cam.spin = true;
    if (cam.spin) cam.yaw += dt * 0.22;
    if (canvas.clientWidth !== renderer.domElement.width / renderer.getPixelRatio() | 0) resize();
    place();
    renderer.render(scene, camera);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(view);
  resize();
  show(kind);
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      renderer.dispose();
      scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m?.map?.dispose?.(); m?.dispose?.(); } } });
      host.innerHTML = '';
    },
  };
}
