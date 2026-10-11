import * as THREE from 'three';

/**
 * The town's own landmarks: the churches, mosques, shrines and stations the
 * survey names around the one the player came to knock down.
 *
 * Every surveyed building was laid up as its outline extruded to its height,
 * so Westminster Abbey was a six-metre slab the shape of the Abbey, the
 * forty-five mosques round Hagia Sophia were forty-five flat roofs, and
 * Waterloo was a shed with no shed. The survey says what each of them is
 * (`kind`, and a name), and what a church is has a silhouette anyone knows
 * from four hundred metres: a pitched roof down the nave and a tower at the
 * west end. A mosque is a dome and a minaret. So each such building keeps its
 * walls and gets what stands on them, in the manner of the city it is in:
 *
 * - Gothic (London, Paris, Cologne, Sydney): a steep slate roof down the long
 *   axis, a west tower with a spire and pinnacles; twin towers on anything
 *   cathedral-sized.
 * - Romanesque (Pisa): a low terracotta roof and a free-standing campanile.
 * - Orthodox (Moscow): a tent-roofed bell tower and onion domes, gold and green.
 * - Byzantine (Athens): a cross of tiled roofs and a drum with a low dome.
 * - Ottoman (Istanbul): a great lead dome on a drum, half-domes falling away
 *   from it, and pencil minarets, four on the great mosques.
 * - Islamic (the Gulf, India, Egypt, Malaysia): a dome and a minaret.
 * - Japanese (Himeji): a heavy hipped roof with deep eaves, and a red torii.
 * - Stations everywhere: a barrel vault of glass over the platforms.
 *
 * What is added burns with its building (it is laid while `props.plot` names
 * it), and what stands up — towers, minarets, domes — goes into
 * `plot.extra`, which `citybodies.js` turns into colliders, so a minaret
 * stops a shell as well as the hall under it does.
 */

// Which manner a level builds in. A level not listed takes the default by
// kind: a church is Gothic, a mosque is Islamic.
const STYLE = {
  westminster: 'gothic', paris: 'gothic', cologne: 'gothic', sydney: 'gothic', towerbridge: 'gothic',
  edinburgh: 'gothic', budapest: 'gothic', atomium: 'gothic', neuschwanstein: 'gothic', montstmichel: 'gothic',
  pisa: 'romanesque', florence: 'romanesque', colosseum: 'romanesque', sagrada: 'romanesque', segovia: 'romanesque', pena: 'romanesque',
  moscow: 'orthodox',
  athens: 'byzantine',
  istanbul: 'ottoman',
  agra: 'islamic', giza: 'islamic', dubai: 'islamic', petronas: 'islamic', hassan: 'islamic', kuwait: 'islamic', karnak: 'islamic',
  himeji: 'japanese', tokyotower: 'japanese',
};

// What each manner is made of: walls (for towers and drums), the roof, and
// the domes. Colours only; the forms are below.
const PALETTE = {
  gothic: { stone: 0xc2b494, roof: 0x4f565c, spire: 0x59636a },
  romanesque: { stone: 0xe4ddcc, roof: 0xa8553a, spire: 0xa8553a },
  orthodox: { stone: 0xeee6d6, roof: 0x5f8f7a, gold: 0xd9a93a, green: 0x3f7a5f },
  byzantine: { stone: 0xb98a62, roof: 0xa8553a, dome: 0xa8553a },
  ottoman: { stone: 0xd8d0c0, dome: 0x7d858c, roof: 0x7d858c },
  islamic: { stone: 0xece6d8, dome: 0xe8e2d2, green: 0x3d8a5a, roof: 0xb8b0a0 },
  japanese: { roof: 0x3a3c42, wood: 0x7a3a2a, torii: 0xc23a2a },
};

// Strong words only. "St" and "Saint" name half of London — hotels, schools,
// a café — and a spire on the Sofitel is worse than no spire at all.
const CHURCH = /church|chiesa|église|eglise|cathédrale|cathedral|kirche|\bdom\b|собор|церковь|храм|ναός|άγιος|αγία|άγιοι|παναγία|chapel|chapelle|abbey|abbaye|basilica|basilique|kapelle|münster|duomo|battistero|igreja|iglesia|minster/i;
const NOT_CHURCH = /school|hotel|café|cafe|house|hall\b|primary|college|hospital|court|centre|center|office|club|station|museum|apartments|flats|mansions/i;
const MOSQUE = /cami|masjid|mosque|mescid|جامع|مسجد|surau|mosquée/i;
const SHRINE = /神社|八幡|宮|寺|shrine|temple/i;
const STATION = /railway station|rail station|hauptbahnhof|bahnhof|gare\b|stazione|вокзал|garı|estación/i;

/** What a plot is, as far as its silhouette goes; null for an ordinary building. */
export function classify(p, levelId) {
  const kind = p.kind || '', name = p.name || '';
  const style = STYLE[levelId];
  if (kind === 'train_station' || (STATION.test(name) && p.w * p.d > 1500)) return p.w * p.d > 1200 ? 'station' : null;
  if (kind === 'mosque' || MOSQUE.test(name)) return style === 'ottoman' ? 'ottoman' : 'islamic';
  if (kind === 'synagogue' || /synagog|синагог/i.test(name)) return null;
  if (kind === 'shrine' || (style === 'japanese' && (kind === 'religious' || kind === 'temple' || SHRINE.test(name)))) return 'japanese';
  // Giza's temples are four and a half thousand years old: ruins, not churches.
  if (levelId === 'giza') return null;
  const christian = kind === 'church' || kind === 'cathedral' || kind === 'chapel'
    || ((kind === 'religious' || kind === 'yes' || !kind) && CHURCH.test(name) && !NOT_CHURCH.test(name));
  if (christian || kind === 'religious') {
    if (style === 'ottoman' || style === 'islamic') return christian ? 'byzantine' : style;
    if (style === 'japanese') return null;
    return style && style !== 'islamic' ? style : 'gothic';
  }
  return null;
}

/**
 * The height a building of this kind should stand to at least. The survey's
 * heights are guesses where nobody measured, and a guess of six metres for
 * Westminster Abbey is a slab, not a church. Applied before the walls go up.
 */
export function minHeight(kind, name, w, d, levelId) {
  const c = classify({ kind, name, w, d }, levelId);
  if (!c || c === 'station') return 0;
  const S = Math.min(w, d);
  return Math.min(c === 'japanese' ? 9 : 26, Math.max(7, S * 0.7));
}

/**
 * And at most this tall at the eaves. Where the survey measured a mosque or
 * a church it measured to the top of the dome or the spire, and the walls
 * were extruded all the way up: the Blue Mosque was a seventy-one-metre slab
 * the shape of its own plan. The walls stop where walls stop and the dome and
 * the towers (which this pass builds) carry the rest of the height.
 */
export function maxHeight(kind, name, w, d, levelId) {
  const c = classify({ kind, name, w, d }, levelId);
  if (!c || c === 'station') return Infinity;
  const S = Math.min(w, d);
  if (c === 'japanese') return 12;
  // Under a dome the walls are low: the hall is the dome.
  if (c === 'ottoman' || c === 'islamic' || c === 'byzantine') return Math.max(9, Math.min(20, S * 0.32));
  return Math.max(10, Math.min(30, S * 0.55));
}

// ── Geometry ───────────────────────────────────────────────────────────────

/** Triangles to an indexed geometry with flat normals and a uv channel, so it merges with the boxes. */
function fromTris(list) {
  const n = list.length * 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(n);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let k = 0;
  for (const t of list) {
    a.fromArray(t[0]); b.fromArray(t[1]); c.fromArray(t[2]);
    e1.subVectors(b, a); e2.subVectors(c, a);
    const nn = e1.cross(e2).normalize();
    for (const p of t) {
      pos.set(p, k * 3);
      nor[k * 3] = nn.x; nor[k * 3 + 1] = nn.y; nor[k * 3 + 2] = nn.z;
      idx[k] = k;
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** A gabled roof over a w (x) by l (z) rectangle, ridge along z, eaves `over` out. */
function gableRoof(w, l, y0, rise, over = 0.4) {
  const x0 = -w / 2 - over, x1 = w / 2 + over, z0 = -l / 2 - over * 0.5, z1 = l / 2 + over * 0.5, yt = y0 + rise;
  return fromTris([
    [[x0, y0, z0], [0, yt, z1], [0, yt, z0]], [[x0, y0, z0], [x0, y0, z1], [0, yt, z1]],
    [[x1, y0, z0], [0, yt, z0], [0, yt, z1]], [[x1, y0, z0], [0, yt, z1], [x1, y0, z1]],
    [[-w / 2, y0, z0], [0, yt, z0], [w / 2, y0, z0]], [[-w / 2, y0, z1], [w / 2, y0, z1], [0, yt, z1]],
  ]);
}

/** A hipped roof (a pyramid stretched over the rectangle, the ridge along z). */
function hipRoof(w, l, y0, rise, over = 1.2) {
  const x0 = -w / 2 - over, x1 = w / 2 + over, z0 = -l / 2 - over, z1 = l / 2 + over;
  const r = Math.max(0, (l - w) / 2), yt = y0 + rise;
  const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1], P = [0, yt, -r], Q = [0, yt, r];
  return fromTris([[A, P, B], [C, Q, D], [B, P, Q], [B, Q, C], [D, Q, P], [D, P, A]]);
}

function boxG(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; }
function pyramid(side, h, x, y, z) { const g = new THREE.ConeGeometry(side * 0.7071, h, 4, 1); g.rotateY(Math.PI / 4); g.translate(x, y + h / 2, z); return g; }
function cone(r, h, x, y, z, seg = 8) { const g = new THREE.ConeGeometry(r, h, seg, 1); g.translate(x, y + h / 2, z); return g; }
function cyl(r, h, x, y, z, seg = 10) { const g = new THREE.CylinderGeometry(r, r, h, seg, 1); g.translate(x, y + h / 2, z); return g; }
function dome(r, x, y, z, squash = 1) {
  const g = new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return g;
}
function onion(r, x, y, z) {
  const P = [];
  const prof = [[0, 0], [0.8, 0.05], [1.0, 0.35], [0.95, 0.6], [0.6, 0.95], [0.25, 1.25], [0.08, 1.55], [0, 1.7]];
  for (const [a, b] of prof) P.push(new THREE.Vector2(a * r, b * r));
  const g = new THREE.LatheGeometry(P, 10);
  g.translate(x, y, z);
  return g;
}
/** A half-cylinder vault along z, springing from y0. */
function vault(w, l, y0) {
  const g = new THREE.CylinderGeometry(w / 2, w / 2, l, 14, 1, true, -Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

// ── The builder ────────────────────────────────────────────────────────────

/**
 * Lay what stands on each notable plot into the detail props. `plots` are
 * `buildContext`'s; returns counts by manner for the load log.
 */
export function addNotables(props, plots, levelId) {
  const counts = {};
  for (let pi = 0; pi < plots.length; pi++) {
    const p = plots[pi];
    if (!p.real || (!p.kind && !p.name)) continue;
    const c = classify(p, levelId);
    if (!c) continue;
    // A building the survey made enormous is one it guessed at; leave it be
    // rather than put a spire on a hundred-and-forty-metre surau.
    if (p.h > 48 && c !== 'station') continue;   // (maxHeight keeps the walls of the ones it knows under this)
    const along = p.d >= p.w;                     // the long axis is local z
    const L = Math.max(p.w, p.d), S = Math.min(p.w, p.d);
    if (S < 6 || L < 9) continue;
    const eave = p.eave ?? (p.base + p.h);
    const parts = [];                             // [bucket, geometry, colour]
    const extra = [];                             // solids, in the local frame: [x, z, w, d, y0, y1]
    const P = PALETTE[c] || PALETTE.gothic;
    const add = (key, g, hex) => parts.push([key, g, hex]);

    if (c === 'gothic' || c === 'romanesque') {
      const rise = c === 'gothic' ? S * 0.55 : S * 0.28;
      add(c === 'gothic' ? 'dark' : 'paint', gableRoof(S, L, eave, rise, 0.3), P.roof);
      const big = L > 55;
      // A parish tower is twenty to thirty metres over the roof; an abbey's
      // west front forty. Measured from the eaves.
      const T = Math.max(4.5, Math.min(12, S * (big ? 0.36 : 0.42)));
      const Ht = Math.max(10, Math.min(big ? 40 : 24, L * 0.45));
      const zEnd = -L / 2 + T / 2;
      const towers = big ? [[-S / 2 + T / 2, zEnd], [S / 2 - T / 2, zEnd]] : [[0, zEnd]];
      if (c === 'romanesque') {
        // The campanile stands beside the church, not on it.
        const cx = S / 2 + T * 0.75, cz = L / 4;
        add('stone', boxG(T, eave - p.base + Ht, T, cx, p.base, cz), P.stone);
        add('paint', pyramid(T * 1.1, T * 0.9, cx, eave + Ht, cz), P.spire);
        extra.push([cx, cz, T, T, p.base, eave + Ht]);
      } else {
        for (const [tx, tz] of towers) {
          add('stone', boxG(T, Ht, T, tx, eave, tz), P.stone);
          // The belfry openings: dark slots high on each face.
          for (const [ox, oz, w2, d2] of [[0, T / 2 + 0.03, T * 0.5, 0.06], [0, -T / 2 - 0.03, T * 0.5, 0.06], [T / 2 + 0.03, 0, 0.06, T * 0.5], [-T / 2 - 0.03, 0, 0.06, T * 0.5]]) {
            add('dark', boxG(w2, Ht * 0.18, d2, tx + ox, eave + Ht * 0.72, tz + oz), 0x2a2c30);
          }
          if (!big) add('dark', pyramid(T * 0.92, T * 1.9, tx, eave + Ht, tz), P.spire);
          for (const [qx, qz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            add('stone', pyramid(T * 0.16, T * (big ? 0.7 : 0.45), tx + qx * T * 0.42, eave + Ht, tz + qz * T * 0.42), P.stone);
          }
          extra.push([tx, tz, T, T, eave, eave + Ht + (big ? 0 : T * 1.9)]);
        }
      }
      // A crossing flèche on the big ones.
      if (big && c === 'gothic') add('dark', pyramid(S * 0.12, S * 1.1, 0, eave + rise * 0.9, L * 0.15), P.spire);
    } else if (c === 'orthodox') {
      add('paint', gableRoof(S, L, eave, S * 0.3, 0.2), P.roof);
      const r = Math.max(2, Math.min(6, S * 0.2));
      const drum = r * 1.4;
      add('stone', cyl(r * 0.85, drum, 0, eave + S * 0.2, L * 0.1, 10), P.stone);
      add('metal', onion(r, 0, eave + S * 0.2 + drum, L * 0.1), P.gold);
      extra.push([0, L * 0.1, r * 2, r * 2, eave, eave + S * 0.2 + drum + r * 1.7]);
      if (L > 18) {
        for (const [qx, qz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const x = qx * S * 0.28, z = L * 0.1 + qz * S * 0.28;
          add('stone', cyl(r * 0.45, drum * 0.8, x, eave + S * 0.15, z, 8), P.stone);
          add('paint', onion(r * 0.55, x, eave + S * 0.15 + drum * 0.8, z), P.green);
        }
      }
      // The bell tower at the west end, under a tent roof.
      const T = Math.max(4, Math.min(9, S * 0.4)), Ht = Math.max(12, Math.min(30, L * 0.6));
      add('stone', boxG(T, Ht, T, 0, eave, -L / 2 + T / 2), P.stone);
      add('paint', pyramid(T * 0.95, T * 2.0, 0, eave + Ht, -L / 2 + T / 2), P.green);
      add('metal', onion(T * 0.16, 0, eave + Ht + T * 2.0, -L / 2 + T / 2), P.gold);
      extra.push([0, -L / 2 + T / 2, T, T, eave, eave + Ht + T * 2]);
    } else if (c === 'byzantine') {
      add('paint', gableRoof(S, L, eave, S * 0.22, 0.25), P.roof);
      const g = gableRoof(S * 0.7, S * 1.15, eave, S * 0.2, 0.25); g.rotateY(Math.PI / 2);
      add('paint', g, P.roof);
      const r = Math.max(2.2, Math.min(7, S * 0.26));
      add('stone', cyl(r, r * 1.1, 0, eave + S * 0.1, 0, 12), P.stone);
      add('paint', dome(r * 1.02, 0, eave + S * 0.1 + r * 1.1, 0, 0.75), P.dome);
      extra.push([0, 0, r * 2, r * 2, eave, eave + S * 0.1 + r * 1.9]);
    } else if (c === 'ottoman' || c === 'islamic') {
      const great = c === 'ottoman' && L > 38;
      const r = Math.max(3, Math.min(c === 'ottoman' ? 22 : 10, S * (c === 'ottoman' ? 0.36 : 0.3)));
      const drumH = r * (c === 'ottoman' ? 0.5 : 0.35);
      add('stone', cyl(r * 1.02, drumH, 0, eave, 0, 16), P.stone);
      add('paint', dome(r, 0, eave + drumH, 0, c === 'ottoman' ? 0.8 : 1.0), P.dome);
      add('metal', cone(r * 0.08, r * 0.45, 0, eave + drumH + r * (c === 'ottoman' ? 0.8 : 1.0), 0, 6), 0xd9a93a);
      extra.push([0, 0, r * 2, r * 2, eave, eave + drumH + r]);
      if (c === 'ottoman') {
        // Half-domes falling away along the long axis, and small domes at the corners.
        for (const s of [-1, 1]) {
          if (L > S * 1.15) add('paint', dome(r * 0.62, 0, eave, s * r * 1.05, 0.7), P.dome);
          for (const qx of [-1, 1]) add('paint', dome(r * 0.28, qx * r * 0.95, eave, s * r * 0.95, 0.85), P.dome);
        }
      }
      // Minarets: pencil-thin with a cap, at the corners.
      const mh = Math.max(22, Math.min(c === 'ottoman' ? 64 : 42, L * (great ? 1.05 : 0.9))) + (eave - p.base) * 0.2;
      let spots = great ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : (c === 'ottoman' && L > 22 ? [[1, -1], [-1, -1]] : [[1, -1]]);
      // The Blue Mosque has six, which is the thing everyone knows about it.
      if (/sultanahmet|sultan ahmet camii$/i.test(p.name || '')) spots = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, -2.2], [-1, -2.2]];
      for (const [qx, qz] of spots) {
        const x = qx * (S / 2 + 1.8), z = Math.abs(qz) > 1 ? Math.sign(qz) * (L / 2 + 14) : qz * (L / 2 - 1.5);
        const mr = c === 'ottoman' ? 1.1 : 1.4;
        add('stone', cyl(mr, mh, x, p.base, z, 8), P.stone);
        add('stone', cyl(mr * 1.6, 0.6, x, p.base + mh * 0.72, z, 8), P.stone);
        if (c === 'ottoman') add('paint', cone(mr * 1.05, mh * 0.2, x, p.base + mh, z, 8), P.dome);
        else { add('paint', dome(mr * 1.15, x, p.base + mh, z), P.green); }
        extra.push([x, z, mr * 2.4, mr * 2.4, p.base, p.base + mh * (c === 'ottoman' ? 1.2 : 1.05)]);
      }
    } else if (c === 'japanese') {
      const r1 = Math.min(S * 0.42, 5);
      add('dark', hipRoof(S, L, eave, r1, Math.min(2.0, S * 0.18)), P.roof);
      if (L > 14) add('dark', hipRoof(S * 0.55, L * 0.55, eave + r1 * 0.85, r1 * 0.7, 0.8), P.roof);
      // The torii, out in front of the short end.
      const tz = -L / 2 - 7, tw = Math.max(4, S * 0.5), th = Math.max(4.5, tw * 0.95);
      for (const s of [-1, 1]) add('paint', cyl(0.28, th, s * tw / 2, p.base, tz, 8), P.torii);
      add('paint', boxG(tw + 1.6, 0.45, 0.6, 0, p.base + th, tz), P.torii);
      add('dark', boxG(tw + 2.4, 0.3, 0.8, 0, p.base + th + 0.45, tz), 0x2a2a2e);
      add('paint', boxG(tw, 0.3, 0.4, 0, p.base + th - 1.1, tz), P.torii);
    } else if (c === 'station') {
      // The train shed: a glass vault over the long axis.
      add('glass', vault(S * 0.96, L * 0.96, eave), 0x7d8f9a);
      for (const s of [-1, 1]) {
        const g = new THREE.CircleGeometry(S * 0.48, 14, 0, Math.PI);
        g.translate(0, eave, s * L * 0.48);
        add('stone', g, 0xb8ae9a);
      }
      extra.push([0, 0, S * 0.9, L * 0.9, eave, eave + S * 0.45]);
    }

    if (!parts.length) continue;
    counts[c] = (counts[c] || 0) + 1;
    // Into the world: the long axis along local z, then the plot's own turn.
    const turn = (along ? 0 : Math.PI / 2) + (p.yaw || 0);
    const prev = props.plot;
    props.plot = pi;
    for (const [key, g, hex] of parts) {
      if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.rotateY(turn);
      g.translate(p.x, 0, p.z);
      props.add(key, g, hex, 0.94 + ((pi * 37) % 13) / 100);
    }
    props.plot = prev;
    const ct = Math.cos(turn), st = Math.sin(turn);
    p.extra = (p.extra || []).concat(extra.map(([x, z, w, d, y0, y1]) => ({
      // The same turn BoxGeometry.rotateY gives: x' = x cos + z sin, z' = -x sin + z cos.
      x: p.x + x * ct + z * st, z: p.z - x * st + z * ct, w, d, y0, y1, yaw: turn,
    })));
  }
  return counts;
}
