import * as THREE from 'three';
import { totalStars, operationsState } from './operations.js';

/**
 * Nose art.
 *
 * Every bomber that went to war in 1944 went with a name and a girl painted
 * under the cockpit, and a row of little bombs behind her for every mission
 * it came back from. The strike aircraft here carry the same: one of the
 * pieces the player has earned, a different one each sortie, and the tally —
 * a bomb for every landmark brought down, a red skull for every warlord.
 *
 * The art is drawn, not loaded: a seated pin-up in the mud-flap style, as a
 * silhouette through a smooth closed curve, in four colourways; and the
 * cartoon bombs that were the other half of the genre. Period-cheeky, never
 * more than a swimsuit, and as much a joke about the war as the rest of the
 * game is.
 */

export const ART = [
  // Every piece is a painting: the picture carries its own lettering, so
  // only the tally is drawn under it. The colours are what each one was
  // before it was painted, kept for the drawn fallback if a picture fails.
  { id: 'demeanor', name: 'Miss Demeanor', kind: 'pin', img: 'assets/noseart/demeanor.jpg', skin: '#e8c4a0', hair: '#962328', suit: '#cd2832', need: { wins: 1 }, how: 'Win a battle' },
  { id: 'damsel', name: 'Collateral Damsel', kind: 'pin', img: 'assets/noseart/damsel.jpg', skin: '#f0cfae', hair: '#e8c35a', suit: '#24407a', need: { stars: 6 }, how: '6 stars' },
  { id: 'beer', name: 'Hold My Beer', kind: 'bomb', img: 'assets/noseart/beer.jpg', body: '#3c4a2a', need: { bosses: 1 }, how: 'Beat a boss' },
  { id: 'deductible', name: 'Tax Deductible', kind: 'pin', img: 'assets/noseart/deductible.jpg', skin: '#d9a77f', hair: '#3b2416', suit: '#2f6b3a', need: { stars: 15 }, how: '15 stars' },
  { id: 'trigger', name: 'Trigger Happy', kind: 'bomb', img: 'assets/noseart/trigger.jpg', body: '#3c4a2a', need: { wins: 10 }, how: 'Win ten battles' },
  { id: 'renewal', name: 'Urban Renewal', kind: 'hardhat', img: 'assets/noseart/renewal.jpg', body: '#5a5f63', need: { bosses: 2 }, how: 'Beat two bosses' },
  { id: 'refunds', name: 'No Refunds', kind: 'pin', img: 'assets/noseart/refunds.jpg', skin: '#efd2b6', hair: '#141414', suit: '#f2f2ee', dots: '#c8202c', need: { stars: 30 }, how: '30 stars' },
  { id: 'actofgod', name: 'Act of God', kind: 'halo', img: 'assets/noseart/actofgod.jpg', body: '#2e3338', need: { stars: 50 }, how: '50 stars' },
  { id: 'exwife', name: "Buck's Ex-Wife", kind: 'pin', img: 'assets/noseart/exwife.jpg', skin: '#e2b896', hair: '#b4361a', suit: '#141414', need: { bosses: 4 }, how: 'Beat four bosses' },
  { id: 'sender', name: 'Return to Sender', kind: 'dice', img: 'assets/noseart/sender.jpg', need: { stars: 80 }, how: '80 stars' },
  { id: 'service', name: 'Thank You For Your Service', kind: 'pin', img: 'assets/noseart/service.jpg', skin: '#e8c4a0', hair: '#e8c35a', suit: '#b22234', stars: true, need: { finale: 1 }, how: 'Take the Great Wall' },
];

/** What this commander has, from the record. */
export function warStats(prog) {
  const st = operationsState(prog);
  return {
    wins: Object.values(prog).filter((r) => r?.won).length,
    stars: totalStars(prog),
    bosses: st.bossesDown,
    finale: prog.greatwall?.won ? 1 : 0,
  };
}
export function unlockedArt(prog) {
  const s = warStats(prog);
  return ART.filter((a) => Object.entries(a.need).every(([k, v]) => (s[k] || 0) >= v));
}

// ── Drawing ──────────────────────────────────────────────────────────────

/** A closed Catmull-Rom curve through the points, traced into the path. */
function smooth(ctx, pts, sx, sy, ox, oy) {
  const n = pts.length;
  const P = (i) => pts[(i + n) % n];
  ctx.moveTo(ox + P(0)[0] * sx, oy + P(0)[1] * sy);
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(ox + c1x * sx, oy + c1y * sy, ox + c2x * sx, oy + c2y * sy, ox + p2[0] * sx, oy + p2[1] * sy);
  }
  ctx.closePath();
}

const BODY = [[74, 41], [81, 47], [82, 53], [78, 58], [76, 65], [79, 72], [90, 71], [102, 63], [108, 65],
  [112, 74], [116, 86], [119, 94], [128, 97], [127, 100], [116, 100], [110, 92], [103, 79], [96, 77],
  [92, 84], [104, 91], [126, 94], [147, 97], [147, 100], [120, 101], [90, 101], [67, 101], [58, 97],
  [56, 88], [59, 78], [61, 70], [55, 79], [48, 90], [43, 98], [38, 98], [39, 94], [46, 84], [54, 68],
  [60, 57], [64, 48], [67, 43]];
const HAIR = [[63, 23], [71, 21], [79, 25], [80, 31], [75, 28], [69, 30], [67, 37], [64, 44], [59, 47], [55, 43], [58, 33]];
const SUIT = [[70, 47], [78, 46], [82, 52], [78, 58], [76, 65], [79, 72], [86, 73], [80, 84], [68, 88], [59, 86], [58, 76], [61, 66], [65, 54]];

function drawPin(ctx, a, ox, oy, s) {
  ctx.lineJoin = 'round';
  const fill = (pts, col) => { ctx.beginPath(); smooth(ctx, pts, s, s, ox, oy); ctx.fillStyle = col; ctx.fill(); };
  // A dark keyline round the whole figure, the way the sign-writers did it.
  ctx.save();
  ctx.beginPath(); smooth(ctx, BODY, s, s, ox, oy); ctx.arc(ox + 71 * s, oy + 32 * s, 8 * s, 0, Math.PI * 2);
  ctx.lineWidth = 3 * s; ctx.strokeStyle = 'rgba(20,16,12,0.9)'; ctx.stroke();
  ctx.restore();
  fill(BODY, a.skin);
  ctx.beginPath(); ctx.arc(ox + 71 * s, oy + 32 * s, 8 * s, 0, Math.PI * 2); ctx.fillStyle = a.skin; ctx.fill();
  fill(HAIR, a.hair);
  fill(SUIT, a.suit);
  if (a.dots) {
    ctx.fillStyle = a.dots;
    for (const [x, y] of [[67, 55], [73, 62], [64, 70], [71, 78], [77, 69], [62, 81]]) {
      ctx.beginPath(); ctx.arc(ox + x * s, oy + y * s, 1.6 * s, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (a.stars) {
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of [[66, 58], [72, 66], [64, 76]]) star(ctx, ox + x * s, oy + y * s, 2.4 * s);
  }
  // Lips and an eye.
  ctx.fillStyle = '#c0202c';
  ctx.beginPath(); ctx.ellipse(ox + 77.5 * s, oy + 35.5 * s, 1.5 * s, 0.9 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1210';
  ctx.beginPath(); ctx.ellipse(ox + 75.5 * s, oy + 30 * s, 1.1 * s, 0.6 * s, -0.3, 0, Math.PI * 2); ctx.fill();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

/** A cartoon bomb: fins, a grin, and whatever it is wearing. */
function drawBomb(ctx, a, ox, oy, s) {
  const cx = ox + 95 * s, cy = oy + 62 * s;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-0.35);
  ctx.lineWidth = 3 * s; ctx.strokeStyle = '#141210';
  // Fins.
  ctx.fillStyle = a.body;
  ctx.beginPath(); ctx.moveTo(-34 * s, -10 * s); ctx.lineTo(-54 * s, -22 * s); ctx.lineTo(-54 * s, 22 * s); ctx.lineTo(-34 * s, 10 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Body.
  ctx.beginPath(); ctx.ellipse(0, 0, 40 * s, 22 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(6 * s, -10 * s, 22 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
  // Face.
  ctx.fillStyle = '#fff';
  for (const ex of [10, 22]) { ctx.beginPath(); ctx.ellipse(ex * s, -5 * s, 4.2 * s, 5.4 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#141210';
  for (const ex of [11.5, 23.5]) { ctx.beginPath(); ctx.arc(ex * s, -4 * s, 2 * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath(); ctx.arc(16 * s, 4 * s, 9 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(12 * s, 11 * s, 3 * s, 2.5 * s); ctx.fillRect(17 * s, 11 * s, 3 * s, 2.5 * s);
  // What it wears.
  if (a.kind === 'hardhat') {
    ctx.fillStyle = '#f2c230'; ctx.lineWidth = 2.2 * s;
    ctx.beginPath(); ctx.ellipse(14 * s, -18 * s, 16 * s, 9 * s, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(-4 * s, -19 * s, 36 * s, 3 * s);
  } else if (a.kind === 'halo') {
    ctx.strokeStyle = '#f2d24a'; ctx.lineWidth = 2.6 * s;
    ctx.beginPath(); ctx.ellipse(14 * s, -32 * s, 14 * s, 4 * s, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    // A cigar, for a bomb that has seen some things.
    ctx.fillStyle = '#6b3d1f'; ctx.fillRect(22 * s, 9 * s, 14 * s, 3.4 * s);
    ctx.fillStyle = '#ff7a2a'; ctx.fillRect(35 * s, 9 * s, 2.4 * s, 3.4 * s);
  }
  ctx.restore();
}

function drawDice(ctx, ox, oy, s) {
  const die = (x, y, rot, pips) => {
    ctx.save(); ctx.translate(ox + x * s, oy + y * s); ctx.rotate(rot);
    ctx.fillStyle = '#f4f1e6'; ctx.strokeStyle = '#141210'; ctx.lineWidth = 2.6 * s;
    const r = 18 * s;
    ctx.beginPath(); ctx.roundRect(-r, -r, 2 * r, 2 * r, 5 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c0202c';
    for (const [px, py] of pips) { ctx.beginPath(); ctx.arc(px * s, py * s, 3.4 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };
  die(78, 60, -0.3, [[0, 0]]);
  die(118, 66, 0.25, [[0, 0]]);
}

const TEX = new Map();
const IMG = new Map();

/** A painted piece's picture, loading; the first ask starts it. */
function artImage(art) {
  if (IMG.has(art.id)) return IMG.get(art.id);
  const im = new Image();
  im.decoding = 'async';
  im.src = art.img;
  IMG.set(art.id, im);
  return im;
}
// Started at load, so the first sortie's airframe has its picture ready
// rather than taking off blank and painting itself a second later.
if (typeof document !== 'undefined') for (const a of ART) if (a.img) artImage(a);

/**
 * The painted picture onto the texture's canvas: fitted above the tally
 * row with its edges feathered into the airframe's own paint, so it reads
 * as a panel painted on the skin rather than a photograph stuck to it.
 */
function drawPainted(ctx, im, tex, fallback) {
  const paint = () => {
    const H = 278, W = Math.min(500, Math.round(H * im.naturalWidth / im.naturalHeight));
    const x = 256 - W / 2, y = 2;
    ctx.save();
    ctx.clearRect(0, 0, 512, H + 4);
    ctx.beginPath(); ctx.roundRect(x, y, W, H, 26); ctx.clip();
    ctx.drawImage(im, x, y, W, H);
    // Feather: keep the middle, let the rim go.
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(256, y + H / 2, H * 0.30, 256, y + H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.72, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, W, H);
    ctx.restore();
    if (tex) tex.needsUpdate = true;
  };
  if (im.complete && im.naturalWidth) paint();
  else if (im.complete) fallback?.();
  else {
    im.addEventListener('load', paint, { once: true });
    if (fallback) im.addEventListener('error', fallback, { once: true });
  }
}

/**
 * The art as a texture, with the tally under it: `wins` little bombs and
 * `bosses` red skulls. Transparent round the figure, so it sits on any
 * paint.
 */
export function artTexture(art, wins = 0, bosses = 0) {
  if (typeof document === 'undefined') return null;
  const key = `${art.id}:${Math.min(24, wins)}:${Math.min(8, bosses)}`;
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const ctx = c.getContext('2d');
  const s = 2.4, ox = 30, oy = -10;
  // The drawn version: the silhouette in the piece's colours and the name
  // in sign-writer's script, cream on a dark keyline. What every piece was
  // before it was painted, and what it falls back to if its picture does
  // not arrive.
  const drawn = () => {
    if (art.kind === 'pin') drawPin(ctx, art, ox, oy, s);
    else if (art.kind === 'dice') drawDice(ctx, ox, oy, s);
    else drawBomb(ctx, art, ox, oy, s);
    ctx.font = `italic bold ${art.name.length > 18 ? 40 : 52}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 9; ctx.strokeStyle = '#141210';
    ctx.strokeText(art.name, 256, 268);
    ctx.fillStyle = '#f6d66a';
    ctx.fillText(art.name, 256, 268);
  };
  const painted = art.img ? artImage(art) : null;
  if (!painted) drawn();
  // The tally.
  const n = Math.min(24, wins), k = Math.min(8, bosses);
  let x = 256 - ((n + k) * 18) / 2;
  for (let i = 0; i < k; i++, x += 18) skull(ctx, x + 8, 298);
  for (let i = 0; i < n; i++, x += 18) tallyBomb(ctx, x + 8, 298);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (painted) drawPainted(ctx, painted, tex, () => { drawn(); tex.needsUpdate = true; });
  TEX.set(key, tex);
  return tex;
}

function tallyBomb(ctx, x, y) {
  ctx.fillStyle = '#141210';
  ctx.beginPath(); ctx.ellipse(x, y, 4, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 4, y - 11, 8, 3);
  ctx.fillStyle = '#f6d66a'; ctx.fillRect(x - 1, y - 2, 2, 4);
}
function skull(ctx, x, y) {
  ctx.fillStyle = '#c0202c';
  ctx.beginPath(); ctx.arc(x, y - 1, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 4, y + 3, 8, 5);
  ctx.fillStyle = '#141210';
  ctx.beginPath(); ctx.arc(x - 2.4, y - 1, 1.7, 0, Math.PI * 2); ctx.arc(x + 2.4, y - 1, 1.7, 0, Math.PI * 2); ctx.fill();
}

/** A picture of the art for the collection screen. */
export function artDataUrl(art) {
  // A painted piece is shown whole, lettering and all.
  if (art.img) return art.img;
  const t = artTexture(art, 0, 0);
  return t?.image?.toDataURL ? t.image.toDataURL('image/png') : '';
}

// ── On the aircraft ──────────────────────────────────────────────────────

const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

/**
 * Paint a piece on both sides of an airframe's nose, under the cockpit.
 * The airframes are built nose along +Z; where the skin is, is found by
 * casting in from either side a fifth of the way back from the nose, at the
 * height where the body is widest.
 */
export function paintNoseArt(group, art, wins, bosses) {
  const tex = artTexture(art, wins, bosses);
  if (!tex) return;
  // Measured in the airframe's own frame, wherever it happens to be: the
  // panel is placed in that frame, and a model already moved or turned (in
  // the hangar it is stood on the apron first) measured in the world's put
  // the art beside it rather than on it.
  const parent = group.parent;
  if (parent) parent.remove(group);
  const pos = group.position.clone(), quat = group.quaternion.clone(), scl = group.scale.clone();
  group.position.set(0, 0, 0); group.quaternion.identity(); group.scale.set(1, 1, 1);
  try { paintInPlace(group, tex); } finally {
    group.position.copy(pos); group.quaternion.copy(quat); group.scale.copy(scl);
    if (parent) parent.add(group);
    group.updateMatrixWorld(true);
  }
}

function paintInPlace(group, tex) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const L = box.max.z - box.min.z;
  // An airframe can say where its panel is (`userData.noseArt`: z, y, w).
  // A helicopter needs to: its rotor discs reach far past the nose, so a
  // fifth of the way back from the front of its box is the nose cone.
  const hint = group.userData.noseArt || null;
  const z = hint?.z ?? (box.max.z - L * 0.2);
  const meshes = [];
  group.traverse((o) => { if (o.isMesh && o.name !== 'noseart') meshes.push(o); });
  let best = null;
  const ys = hint?.y !== undefined ? [hint.y] : Array.from({ length: 9 }, (_, k) => box.min.y + (box.max.y - box.min.y) * (0.25 + k * 0.05));
  for (const y of ys) {
    _ray.set(_o.set(box.max.x + 5, y, z), _d.set(-1, 0, 0));
    const hit = _ray.intersectObjects(meshes, false)[0];
    if (hit && Math.abs(hit.point.x) < (box.max.x - box.min.x) * 0.3 && (!best || hit.point.x > best.x)) best = { x: hit.point.x, y };
  }
  if (!best) return;
  const w = hint?.w ?? Math.max(1.4, L * 0.115), h = w * 0.625;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(side * (best.x + 0.04), best.y - h * 0.08, z);
    m.rotation.y = side * Math.PI / 2;
    m.name = 'noseart';
    group.add(m);
  }
}

// What this battle's aircraft carry: set once at the start from the record.
const FLEET = { list: [], wins: 0, bosses: 0 };
export function setFleetArt(list, wins, bosses) { FLEET.list = list; FLEET.wins = wins; FLEET.bosses = bosses; }

/**
 * Which piece each type of aircraft wears, chosen in the hangar: airframe
 * kind to art id, or nothing for a different piece every sortie.
 */
const CHOICE_KEY = 'tt.noseart';
export function artChoice() {
  try { return JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}') || {}; } catch { return {}; }
}
export function setArtChoice(kind, id) {
  const c = artChoice();
  if (id) c[kind] = id; else delete c[kind];
  try { localStorage.setItem(CHOICE_KEY, JSON.stringify(c)); } catch { /* private mode */ }
}

/**
 * Paint a sortie's airframe: the piece the commander chose for this type of
 * aircraft in the hangar if it is one they have earned, otherwise one of
 * the pieces earned, at random.
 */
export function decorate(group, kind = null) {
  if (!FLEET.list.length || !group) return;
  const want = kind ? artChoice()[kind] : null;
  const art = (want && FLEET.list.find((a) => a.id === want)) || FLEET.list[(Math.random() * FLEET.list.length) | 0];
  try { paintNoseArt(group, art, FLEET.wins, FLEET.bosses); } catch { /* a frame with no skin to paint */ }
}
