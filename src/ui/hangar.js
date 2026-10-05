import * as THREE from 'three';
import { makeAirframe, makeHercules, makeChinook } from '../game/aircraft.js';
import { ART, unlockedArt, warStats, paintNoseArt, artChoice, setArtChoice } from '../game/noseart.js';
import { feedback } from './feedback.js';
import { TracerFX } from '../fx/tracers.js';
import { menuMusic } from './music.js';

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

/** A target board: plywood, the rings, a stencilled silhouette. */
function targetTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c8ab7a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,60,30,${0.05 + Math.random() * 0.08})`; g.fillRect(0, Math.random() * S, S, 1 + Math.random() * 2); }
  g.fillStyle = '#2c2a26';
  g.beginPath(); g.arc(128, 70, 30, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(58, 250); g.quadraticCurveTo(64, 110, 128, 104); g.quadraticCurveTo(192, 110, 198, 250); g.closePath(); g.fill();
  g.strokeStyle = '#e8e2d2'; g.lineWidth = 3;
  for (const r of [22, 46, 70]) { g.beginPath(); g.arc(128, 150, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#d23a2a'; g.beginPath(); g.arc(128, 150, 9, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
      <div class="hg-ammo" hidden><b>1200</b><i>ROUNDS</i><u>0 HITS</u></div>
      <button class="hg-fire" type="button" hidden aria-label="Fire the gun">FIRE</button>
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

  // ── The range ─────────────────────────────────────────────────────────
  // Out in front of the spot, three target boards on posts and a sandbag
  // berm behind them: what an aircraft with a gun gets to shoot at here.
  const range = new THREE.Group(); scene.add(range);
  const boardTex = targetTexture();
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.92 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const holeGeo = new THREE.CircleGeometry(0.045, 8);
  const boards = [];
  for (const [x, z] of [[-9, 30], [0, 34], [9, 30]]) {
    const b = new THREE.Group();
    const face = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.0, 0.08), boardMat);
    face.position.y = 2.7; face.castShadow = true;
    b.add(face);
    for (const px of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, 0.14), postMat);
      post.position.set(px, 1.2, -0.08); post.castShadow = true; b.add(post);
    }
    b.position.set(x, 0, z);
    b.lookAt(0, 0, 0);
    range.add(b);
    boards.push({ g: b, face, wob: 0, holes: [] });
  }
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 3; j++) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 3, 8), bagMat);
      bag.rotation.z = Math.PI / 2;
      bag.position.set(-16 + i * 1.25 + (j % 2) * 0.6, 0.3 + j * 0.52, 40);
      bag.castShadow = true; range.add(bag);
    }
  }
  const shootables = [...boards.map((b) => b.face), apron];

  // Brass and links: thrown out of the gun, bouncing on the concrete and
  // staying there in a growing pile.
  const BRASS = 320;
  const brass = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.11, 6),
    new THREE.MeshStandardMaterial({ color: 0xc9a046, roughness: 0.35, metalness: 0.85 }), BRASS);
  brass.count = 0; brass.frustumCulled = false; brass.castShadow = false;
  brass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(brass);
  const cases = [];
  let caseNext = 0;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  const tracers = new TracerFX(scene, { name: 'high' });
  tracers.setCamera(camera);
  const pivot = new THREE.Group(); scene.add(pivot);
  const fireBtn = host.querySelector('.hg-fire'), ammoEl = host.querySelector('.hg-ammo'), hintEl = host.querySelector('.hg-hint');
  const live = { aim: null, firing: false, next: 0, rounds: 1200, hits: 0, range: false, rk: 0, shake: 0, reload: 0 };
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
    const gun = model.userData.gun;
    fireBtn.hidden = !gun; ammoEl.hidden = !gun;
    hintEl.textContent = gun ? 'TAP A TARGET · HOLD FIRE' : 'DRAG TO TURN · PINCH TO ZOOM';
    live.aim = gun ? boards[1].face.getWorldPosition(new THREE.Vector3()) : null;
    live.firing = false; live.range = false;
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
    _look.set(0, radius * 0.22, 0);
    // On the range the camera stands off the tail on the right shoulder and
    // looks down the lane, so the gun, the stream and the boards are all in
    // the one picture.
    if (live.rk > 0.001) {
      camera.position.lerp(_rangeAt.set(radius * 0.5, radius * 0.9 + 1.5, -radius * 2.0), live.rk);
      _look.lerp(_rangeLook.set(-1.5, 0.5, 22), live.rk);
    }
    camera.lookAt(_look);
  };
  const _look = new THREE.Vector3(), _rangeAt = new THREE.Vector3(), _rangeLook = new THREE.Vector3();

  // Turning by hand: a drag turns the camera round the aircraft, a wheel or
  // a pinch pulls it in. Spinning on its own resumes a few seconds after.
  let drag = null, lastPinch = 0, idleAt = 0;
  const pointers = new Map();
  let press = null;
  const onDown = (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY }; press = { x: e.clientX, y: e.clientY }; } cam.spin = false; try { canvas.setPointerCapture?.(e.pointerId); } catch { /* a synthetic press */ } };
  const ray = new THREE.Raycaster();
  const aimAtScreen = (x, y) => {
    if (!model?.userData.gun) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(shootables, false)[0];
    if (hit) { live.aim = hit.point.clone(); feedback.emit('tick'); }
  };
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
    // A tap on the range lays the gun; a drag turns away from it.
    if (live.range && press && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 7) {
      live.range = false;
      // Take the orbit up from where the range shot stood, not where it left off.
      cam.yaw = Math.atan2(camera.position.x, camera.position.z);
    }
    if (live.range) return;
    cam.yaw -= (e.clientX - drag.x) * 0.008;
    cam.pitch = Math.max(-0.05, Math.min(1.2, cam.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    if (press && pointers.size === 1 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 7) aimAtScreen(e.clientX, e.clientY);
    press = null;
    pointers.delete(e.pointerId); if (pointers.size < 2) lastPinch = 0; if (!pointers.size) { drag = null; idleAt = performance.now() + 4000; } };
  const onWheel = (e) => { e.preventDefault(); cam.dist = Math.max(0.45, Math.min(2.2, cam.dist * Math.exp(e.deltaY * 0.0015))); cam.spin = false; idleAt = performance.now() + 4000; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const startFire = (e) => {
    e.preventDefault();
    if (!model?.userData.gun) return;
    try { fireBtn.setPointerCapture?.(e.pointerId); } catch { /* a synthetic press */ }
    live.firing = true;
    // Swing round behind the aircraft so the range is in the picture.
    if (!live.range) { live.range = true; cam.spin = false; }
    fireBtn.classList.add('on');
  };
  const stopFire = () => { live.firing = false; fireBtn.classList.remove('on'); idleAt = performance.now() + 6000; };
  fireBtn.addEventListener('pointerdown', startFire);
  fireBtn.addEventListener('pointerup', stopFire);
  fireBtn.addEventListener('pointercancel', stopFire);
  fireBtn.addEventListener('lostpointercapture', stopFire);
  fireBtn.addEventListener('contextmenu', (e) => e.preventDefault());

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

  const _local = new THREE.Vector3(), _from = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Quaternion();
  const updateAmmo = () => {
    ammoEl.querySelector('b').textContent = live.reload > 0 ? 'WINCHESTER' : String(live.rounds);
    ammoEl.querySelector('u').textContent = `${live.hits} HIT${live.hits === 1 ? '' : 'S'}`;
  };
  // The same law the sortie lays its gun by (AirWing._layGun): turret on
  // its ring, barrel in its cradle, inside the M230's arcs.
  const layGun = (m, gun, at, dt) => {
    m.updateMatrixWorld(true);
    m.worldToLocal(_local.copy(at));
    const dx = _local.x - gun.position.x, dy = _local.y - gun.position.y, dz = _local.z - gun.position.z;
    const yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -1.92, 1.92);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.19, 1.05);
    const k = Math.min(1, dt * 4);
    gun.rotation.y += (yaw - gun.rotation.y) * k;
    gun.userData.pitch.rotation.x += (pitch - gun.userData.pitch.rotation.x) * k;
  };
  const fireRound = (gun) => {
    if (live.rounds <= 0) return;
    live.rounds--;
    model.updateMatrixWorld(true);
    const muzzle = gun.userData.muzzle;
    muzzle.getWorldPosition(_from);
    muzzle.getWorldQuaternion(_q);
    _dir.set(0, 0, 1).applyQuaternion(_q);
    // The M230's spread: a few milliradians, more as the barrel heats.
    _dir.x += (Math.random() - 0.5) * 0.012; _dir.y += (Math.random() - 0.5) * 0.012; _dir.z += (Math.random() - 0.5) * 0.012;
    _dir.normalize();
    ray.set(_from, _dir); ray.far = 260;
    const hit = ray.intersectObjects(shootables, false)[0];
    const to = hit ? hit.point.clone() : _from.clone().addScaledVector(_dir, 260);
    tracers.fire(_from.clone(), to, { look: 'chaingun' }, !!hit);
    if (hit) {
      const board = boards.find((b) => b.face === hit.object);
      if (board) {
        live.hits++;
        board.wob = 1;
        const hole = new THREE.Mesh(holeGeo, holeMat);
        const p = board.face.worldToLocal(hit.point.clone());
        hole.position.set(p.x, p.y, 0.045);
        board.face.add(hole);
        board.holes.push(hole);
        if (board.holes.length > 90) { const o = board.holes.shift(); board.face.remove(o); }
      }
    }
    // Brass out of the side of the gun.
    const c = cases[caseNext] || (cases[caseNext] = { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: 0, rest: false });
    gun.getWorldPosition(c.p); c.p.y -= 0.2;
    c.v.set((Math.random() - 0.5) * 2.4, -0.5 - Math.random(), (Math.random() - 0.5) * 1.2);
    c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); c.w = 12 + Math.random() * 10; c.rest = false;
    caseNext = (caseNext + 1) % BRASS;
    brass.count = Math.max(brass.count, cases.length);
    live.shake = Math.min(1, live.shake + 0.18);
    shot();
    if (live.rounds <= 0) { live.reload = 2.2; live.firing = false; fireBtn.classList.remove('on'); }
    updateAmmo();
  };
  const _m4 = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
  const stepBrass = (dt) => {
    if (!cases.length) return;
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      if (!c.rest) {
        c.v.y -= 9.81 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w * dt; c.r.z += c.w * 0.7 * dt;
        if (c.p.y <= 0.016) {
          c.p.y = 0.016;
          if (Math.abs(c.v.y) < 0.6) { c.rest = true; c.r.x = Math.PI / 2; c.r.z = 0; }
          c.v.y = -c.v.y * 0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.w *= 0.5;
        }
      }
      _m4.compose(c.p, _qq.setFromEuler(c.r), _one);
      brass.setMatrixAt(i, _m4);
    }
    brass.instanceMatrix.needsUpdate = true;
  };
  // A round: a crack of noise over a short low thump, the gun's own.
  let actx = null;
  const shot = () => {
    if (!menuMusic.enabled) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const len = Math.floor(actx.sampleRate * 0.09);
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const n = actx.createBufferSource(); n.buffer = buf;
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 300; bp.Q.value = 0.8;
      const g = actx.createGain(); g.gain.value = 0.32;
      n.connect(bp).connect(g).connect(actx.destination);
      n.start(t);
      const o = actx.createOscillator(), og = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      og.gain.setValueAtTime(0.28, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(og).connect(actx.destination); o.start(t); o.stop(t + 0.12);
    } catch { /* no audio */ }
  };

  let raf = 0, last = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!cam.spin && !drag && !pointers.size && now > idleAt && !live.firing) { cam.spin = true; live.range = false; }
    if (cam.spin) cam.yaw += dt * 0.22;
    // On the range: glide round to just behind the aircraft's shoulder.
    live.rk += ((live.range ? 1 : 0) - live.rk) * Math.min(1, dt * 2.5);
    const gun = model?.userData.gun;
    if (gun && live.aim) layGun(model, gun, live.aim, dt);
    if (gun && live.firing && now >= live.next && live.reload <= 0) { live.next = now + 100; fireRound(gun); }
    if (live.reload > 0 && (live.reload -= dt) <= 0) { live.rounds = 1200; updateAmmo(); }
    stepBrass(dt);
    for (const b of boards) { if (b.wob > 0) { b.wob = Math.max(0, b.wob - dt * 3); b.face.rotation.x = Math.sin(now * 0.05) * b.wob * 0.05; } }
    tracers.update(dt);
    if (live.shake > 0) live.shake = Math.max(0, live.shake - dt * 4);
    if (canvas.clientWidth !== renderer.domElement.width / renderer.getPixelRatio() | 0) resize();
    place();
    if (live.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0).multiplyScalar(live.shake * 0.08));
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
      live.firing = false;
      try { actx?.close(); } catch { /* already closed */ }
      tracers.clear?.();
      ro?.disconnect();
      renderer.dispose();
      scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m?.map?.dispose?.(); m?.dispose?.(); } } });
      host.innerHTML = '';
    },
  };
}
