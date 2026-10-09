import * as THREE from 'three';
import { makeAirframe, makeHercules, makeChinook } from '../game/aircraft.js';
import { ART, unlockedArt, warStats, paintNoseArt, artChoice, setArtChoice } from '../game/noseart.js';
import { feedback } from './feedback.js';
import { TracerFX } from '../fx/tracers.js';
import { menuMusic } from './music.js';
import { power } from '../core/power.js';

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

/**
 * What each airframe shoots on the range. The Apache's chin gun is a turret
 * (`turret`), laid by the same law the sortie lays it by. Every other gun is
 * fixed in the airframe, so the aircraft is swung on its stand to lay it, the
 * way a real one is jacked and turned to harmonise its gun on a butt. `at` and
 * `dir` are the muzzle in the airframe's own frame (`port` reads it from the
 * airframe's `userData.gunPort`); `side` turns the aircraft so the guns out of
 * its port side face down the lane, `lane` and `scale` move the boards and
 * make them vehicle-sized for a gunship, and `cam`/`look` frame the range. A gun too fast to hear round by round (`tone`) is heard as the note
 * its rate makes, which is what a GAU-8 or an M61 sounds like. Only the M230
 * throws its brass overboard: the GAU-8 and the M61 keep theirs, and the
 * gunship's fall inside it.
 */
const GUNS = {
  apache: { guns: [
    { name: 'M230 · 30 MM', key: '30 MM', turret: true, rpm: 625, rounds: 1200, look: 'chaingun', spread: 0.006, hole: 0.05, brass: true, crack: 900 },
  ] },
  warthog: { cam: [5.5, 13, -26], look: [-1.5, 0.5, 22], guns: [
    { name: 'GAU-8 · 30 MM', key: '30 MM', at: [0.2, -0.36, 8.8], rpm: 3900, rounds: 1174, look: 'gau8', spread: 0.0045, hole: 0.05, tone: 65 },
  ] },
  eagle: { guns: [
    { name: 'M61 · 20 MM', key: '20 MM', port: true, rpm: 6000, rounds: 510, look: 'gau8', spread: 0.006, hole: 0.035, tone: 100 },
  ] },
  ghostrider: { side: true, lane: -12, scale: 1.6, cam: [-9, 19, -30], look: [1, 1.5, 40], guns: [
    { name: 'GAU-23 · 30 MM', key: '30 MM', at: [3.8, -0.55, 6.2], dir: [1, 0, 0], rpm: 200, rounds: 500, look: 'chaingun', spread: 0.003, hole: 0.05, crack: 520 },
    { name: 'M102 · 105 MM', key: '105', at: [4.85, -0.45, -5.6], dir: [1, 0, 0], rpm: 10, rounds: 100, look: 'at', spread: 0.002, shell: true },
  ] },
};

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
      <button class="hg-wpn" type="button" hidden aria-label="Change gun"></button>
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
    boards.push({ g: b, face, wob: 0, holes: [], down: 0, ang: 0, q0: b.quaternion.clone() });
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
  const _qx = new THREE.Quaternion(), _xAxis = new THREE.Vector3(1, 0, 0);

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
  // The stand: `tilt` pitches the aircraft on it, `pivot` turns it; a
  // fixed gun is laid by both.
  const tilt = new THREE.Group(); scene.add(tilt);
  const pivot = new THREE.Group(); tilt.add(pivot);
  pivot.rotation.order = 'YXZ';
  const fireBtn = host.querySelector('.hg-fire'), ammoEl = host.querySelector('.hg-ammo'), hintEl = host.querySelector('.hg-hint');
  const wpnBtn = host.querySelector('.hg-wpn');
  const live = { aim: null, firing: false, hits: 0, range: false, rk: 0, shake: 0, gi: 0 };
  // The guns of the aircraft on the stand, each with its own belt.
  let arms = null, kit = null, baseYaw = 0;
  const later = [];
  const muzzleFor = (m, d) => {
    if (d.turret) return m.userData.gun?.userData.muzzle || null;
    const o = new THREE.Object3D();
    const at = d.port ? m.userData.gunPort : null;
    if (at) o.position.set(at.x, at.y, at.z); else o.position.fromArray(d.at);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().fromArray(d.dir || [0, 0, 1]));
    m.add(o);
    return o;
  };
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
    stopFire();
    pivot.rotation.set(0, 0, 0); tilt.rotation.set(0, 0, 0);
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
    kit = GUNS[k] || null;
    arms = kit ? kit.guns.map((d) => ({ d, rounds: d.rounds, reload: 0, next: 0, muzzle: muzzleFor(model, d) })).filter((a) => a.muzzle) : null;
    if (arms && !arms.length) arms = null;
    live.gi = 0;
    baseYaw = kit?.side ? -Math.PI / 2 : 0;
    pivot.rotation.y = baseYaw;
    range.position.z = kit?.lane || 0;
    range.scale.setScalar(kit?.scale || 1);
    range.updateMatrixWorld(true);
    fireBtn.hidden = !arms; ammoEl.hidden = !arms; wpnBtn.hidden = !arms || arms.length < 2;
    hintEl.textContent = arms ? 'TAP A TARGET · HOLD FIRE' : 'DRAG TO TURN · PINCH TO ZOOM';
    live.aim = arms ? boards[1].face.getWorldPosition(new THREE.Vector3()) : null;
    live.range = false;
    if (arms?.some((a) => a.d.shell)) loadBoom();
    updateAmmo();
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
      if (kit?.cam) { _rangeAt.fromArray(kit.cam); _rangeLook.fromArray(kit.look); }
      else { _rangeAt.set(radius * 0.5, radius * 0.9 + 1.5, -radius * 2.0); _rangeLook.set(-1.5, 0.5, 22); }
      camera.position.lerp(_rangeAt, live.rk);
      _look.lerp(_rangeLook, live.rk);
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
    if (!arms) return;
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
    if (!arms) return;
    try { fireBtn.setPointerCapture?.(e.pointerId); } catch { /* a synthetic press */ }
    live.firing = true;
    const arm = arms[live.gi];
    const now = performance.now();
    if (arm.next < now) arm.next = now;
    if (arm.d.tone && arm.reload <= 0) startTone(arm.d.tone);
    // Swing round behind the aircraft so the range is in the picture.
    if (!live.range) { live.range = true; cam.spin = false; }
    fireBtn.classList.add('on');
  };
  function stopFire() { live.firing = false; fireBtn.classList.remove('on'); stopTone(); idleAt = performance.now() + 6000; }
  wpnBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!arms || arms.length < 2) return;
    stopFire();
    live.gi = (live.gi + 1) % arms.length;
    feedback.emit('select');
    updateAmmo();
  });
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
  function updateAmmo() {
    const arm = arms?.[live.gi];
    if (!arm) return;
    ammoEl.querySelector('b').textContent = arm.reload > 0 ? 'WINCHESTER' : String(arm.rounds);
    ammoEl.classList.toggle('dry', arm.reload > 0);
    ammoEl.querySelector('i').textContent = arm.d.name;
    ammoEl.querySelector('u').textContent = `${live.hits} HIT${live.hits === 1 ? '' : 'S'}`;
    if (arms.length > 1) wpnBtn.textContent = arms[(live.gi + 1) % arms.length].d.key;
  }
  // A fixed gun: the aircraft turns and pitches on its stand until the
  // muzzle's line is on the point, half a radian either way and a tenth up
  // or down, which is as far as a stand goes.
  const _want = new THREE.Vector3();
  const swing = (arm, at, dt) => {
    tilt.updateMatrixWorld(true);
    arm.muzzle.getWorldPosition(_from);
    arm.muzzle.getWorldQuaternion(_q);
    _dir.set(0, 0, 1).applyQuaternion(_q);
    _want.copy(at).sub(_from);
    let dy = Math.atan2(_want.x, _want.z) - Math.atan2(_dir.x, _dir.z);
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = Math.atan2(_want.y, Math.hypot(_want.x, _want.z)) - Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z));
    const k = Math.min(1, dt * 2.2);
    pivot.rotation.y = THREE.MathUtils.clamp(pivot.rotation.y + dy * k, baseYaw - 0.5, baseYaw + 0.5);
    tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x - dp * k, -0.1, 0.1);
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
  const fireRound = (arm) => {
    if (arm.rounds <= 0) return;
    const d = arm.d;
    arm.rounds--;
    tilt.updateMatrixWorld(true);
    arm.muzzle.getWorldPosition(_from);
    arm.muzzle.getWorldQuaternion(_q);
    _dir.set(0, 0, 1).applyQuaternion(_q);
    // The gun's spread: a few milliradians, the round's own scatter on top.
    _dir.x += (Math.random() - 0.5) * d.spread * 2; _dir.y += (Math.random() - 0.5) * d.spread * 2; _dir.z += (Math.random() - 0.5) * d.spread * 2;
    _dir.normalize();
    ray.set(_from, _dir); ray.far = 260;
    const hit = ray.intersectObjects(shootables, false)[0];
    const to = hit ? hit.point.clone() : _from.clone().addScaledVector(_dir, 260);
    tracers.fire(_from.clone(), to, { look: d.look }, !!hit);
    if (d.shell) {
      // The 105: a shell, not a bullet. It lands when it gets there, blows
      // over every board within a few metres and shakes the camera.
      const at = to.clone();
      later.push({ t: _from.distanceTo(at) / 210, fn: () => {
        tracers.impact(at, 0xffc070, 22, 2.6, true);
        tracers.impact(at, 0x9c8f7c, 16, 1.8, true);
        let down = 0;
        for (const b of boards) {
          if (b.face.getWorldPosition(_local).distanceTo(at) < 6) { b.down = 3.5; down++; }
        }
        if (down) live.hits += down;
        live.shake = 1;
        boom(0.9);
        updateAmmo();
      } });
    } else if (hit) {
      const board = boards.find((b) => b.face === hit.object);
      if (board && board.ang < 0.3) {
        live.hits++;
        board.wob = 1;
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.scale.setScalar((d.hole || 0.045) / 0.045);
        const p = board.face.worldToLocal(hit.point.clone());
        hole.position.set(p.x, p.y, 0.045);
        board.face.add(hole);
        board.holes.push(hole);
        if (board.holes.length > 90) { const o = board.holes.shift(); board.face.remove(o); }
      }
    }
    if (d.brass) {
      // Brass out of the side of the gun.
      const c = cases[caseNext] || (cases[caseNext] = { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: 0, rest: false });
      model.userData.gun.getWorldPosition(c.p); c.p.y -= 0.2;
      c.v.set((Math.random() - 0.5) * 2.4, -0.5 - Math.random(), (Math.random() - 0.5) * 1.2);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); c.w = 12 + Math.random() * 10; c.rest = false;
      caseNext = (caseNext + 1) % BRASS;
      brass.count = Math.max(brass.count, cases.length);
    }
    live.shake = Math.min(1, live.shake + (d.shell ? 0.5 : d.tone ? 0.04 : 0.18));
    if (d.shell) boom(0.6);
    else if (!d.tone) shot(d.crack || 900);
    if (arm.rounds <= 0) {
      arm.reload = 2.2;
      stopTone();
      if (arms[live.gi] === arm) { live.firing = false; fireBtn.classList.remove('on'); }
    }
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
  const shot = (crack = 900) => {
    if (!menuMusic.enabled) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const len = Math.floor(actx.sampleRate * 0.09);
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const n = actx.createBufferSource(); n.buffer = buf;
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = crack + Math.random() * crack * 0.33; bp.Q.value = 0.8;
      const g = actx.createGain(); g.gain.value = 0.32;
      n.connect(bp).connect(g).connect(actx.destination);
      n.start(t);
      const o = actx.createOscillator(), og = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      og.gain.setValueAtTime(0.28, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(og).connect(actx.destination); o.start(t); o.stop(t + 0.12);
    } catch { /* no audio */ }
  };

  // A gun too fast to hear round by round is heard as the note of its
  // rate: a saw at sixty-five cycles is a GAU-8, at a hundred an M61.
  let tone = null;
  function startTone(hz) {
    if (!menuMusic.enabled || tone) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
      const o2 = actx.createOscillator(); o2.type = 'square'; o2.frequency.value = hz * 0.5;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.7;
      const g2 = actx.createGain(); g2.gain.value = 0.35;
      const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.05);
      o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(actx.destination);
      o.start(t); o2.start(t);
      tone = { o, o2, g };
    } catch { tone = null; }
  }
  function stopTone() {
    if (!tone) return;
    try {
      const t = actx.currentTime;
      tone.g.gain.cancelScheduledValues(t);
      tone.g.gain.setValueAtTime(Math.max(0.0001, tone.g.gain.value), t);
      tone.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      tone.o.stop(t + 0.15); tone.o2.stop(t + 0.15);
    } catch { /* already stopped */ }
    tone = null;
  }
  // The 105 is the game's own cannon recording, fetched when the gunship is
  // first put on the stand.
  let boomBuf = null, boomLoading = false;
  function loadBoom() {
    if (boomLoading) return;
    boomLoading = true;
    fetch('assets/cannon.mp3').then((r) => r.arrayBuffer()).then((b) => {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      return actx.decodeAudioData(b);
    }).then((b) => { boomBuf = b; }).catch(() => { /* the synthetic one will do */ });
  }
  function boom(gain) {
    if (!menuMusic.enabled) return;
    try {
      if (!boomBuf) { shot(160); return; }
      const n = actx.createBufferSource(); n.buffer = boomBuf;
      n.playbackRate.value = 0.85 + Math.random() * 0.1;
      const g = actx.createGain(); g.gain.value = gain;
      n.connect(g).connect(actx.destination); n.start();
    } catch { /* no audio */ }
  }

  let raf = 0, last = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    // Thirty frames on the battery saver, as in a battle: a turning
    // aircraft and its tracers need no more, and a 120 Hz phone was drawing
    // the whole fleet four times as often as that.
    if (power.saver && now - last < 1000 / 30 - 3) return;
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!cam.spin && !drag && !pointers.size && now > idleAt && !live.firing) { cam.spin = true; live.range = false; }
    if (cam.spin) cam.yaw += dt * 0.22;
    // On the range: glide round to just behind the aircraft's shoulder.
    live.rk += ((live.range ? 1 : 0) - live.rk) * Math.min(1, dt * 2.5);
    const arm = arms?.[live.gi];
    if (arm && live.aim) {
      if (arm.d.turret) layGun(model, model.userData.gun, live.aim, dt);
      else swing(arm, live.aim, dt);
    }
    if (arm && live.firing && arm.reload <= 0) {
      // As many rounds as the gun's rate owes by now, a frame's worth at a
      // time; a stall does not bank them.
      const iv = 60000 / arm.d.rpm;
      if (arm.next < now - 250) arm.next = now;
      for (let n = 0; n < 14 && now >= arm.next && arm.rounds > 0; n++) { arm.next += iv; fireRound(arm); }
      updateAmmo();
    }
    if (arms) for (const a of arms) if (a.reload > 0 && (a.reload -= dt) <= 0) { a.rounds = a.d.rounds; updateAmmo(); }
    for (let i = later.length - 1; i >= 0; i--) if ((later[i].t -= dt) <= 0) { const f = later[i].fn; later.splice(i, 1); f(); }
    for (const b of boards) {
      // A board blown over lies there a few seconds, then the range crew
      // stands it back up.
      if (b.down > 0) b.down -= dt;
      const want = b.down > 0 ? 1.45 : 0;
      b.ang += (want - b.ang) * Math.min(1, dt * (want ? 9 : 2.5));
      b.g.quaternion.copy(b.q0).multiply(_qx.setFromAxisAngle(_xAxis, -b.ang));
    }
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
      stopTone();
      try { actx?.close(); } catch { /* already closed */ }
      tracers.clear?.();
      ro?.disconnect();
      renderer.dispose();
      scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m?.map?.dispose?.(); m?.dispose?.(); } } });
      host.innerHTML = '';
    },
  };
}
