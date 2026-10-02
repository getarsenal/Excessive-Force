/**
 * The rank insignia, drawn: the United States Army's own, in a 48-unit box.
 *
 * Enlisted chevrons are filled bands with their ends cut square on one line,
 * and on every grade with rockers the lowest chevron and the top rocker meet
 * at their outer ends, closing the space the senior NCO's device sits in —
 * as they do on the sleeve. The specialist is the eagle on a green spade
 * shield. Officers are pin metal: bevelled bars, the oak leaf with its lobes
 * and veins, the colonel's eagle with its wings out and the shield on its
 * breast, faceted stars.
 *
 * A grade with a supplied picture in `public/assets/ranks/<id>.png` (listed
 * in RANK_ICONS) is shown as that picture instead.
 */

/**
 * The rank icons that have been supplied, by grade id, in
 * `public/assets/ranks/<id>.png`. A rank listed here is shown as its picture;
 * one that is not is drawn. Add the id when its file goes in.
 */
export const RANK_ICONS = new Set([]);

const METAL = {
  gold: { hi: '#fbe39a', mid: '#e4b54a', lo: '#b07f22', line: '#5a3e0c' },
  silver: { hi: '#f7f9fb', mid: '#d3d8de', lo: '#9aa2ab', line: '#4b525a' },
};

const f = (v) => (Math.round(v * 100) / 100).toString();
const pt = (x, y) => `${f(x)} ${f(y)}`;

// Every drawing that needs a gradient gets its own ids, so two insignia on
// one page never share (or lose) a definition.
let uid = 0;

/** A vertical metal gradient, light at the top. */
function grad(id, m) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1">`
    + `<stop offset="0" stop-color="${m.hi}"/><stop offset="0.48" stop-color="${m.mid}"/>`
    + `<stop offset="1" stop-color="${m.lo}"/></linearGradient>`;
}

/** A five-pointed star, faceted: each point split into a lit and a shaded half. */
function star(cx, cy, r, m, outline = true) {
  const P = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.4 : r;
    P.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let s = '';
  if (outline) s += `<path d="M${P.map((p) => pt(p[0], p[1])).join(' L')} Z" fill="${m.line}" stroke="${m.line}" stroke-width="${f(r * 0.16)}" stroke-linejoin="round"/>`;
  for (let k = 0; k < 10; k++) {
    const a = P[k], b = P[(k + 1) % 10];
    // The light falls from the upper left: facets facing it are bright.
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    const lit = (-mx - my) > 0;
    s += `<path d="M${pt(cx, cy)} L${pt(a[0], a[1])} L${pt(b[0], b[1])} Z" fill="${lit ? m.hi : (k % 2 ? m.lo : m.mid)}" stroke="${lit ? m.hi : (k % 2 ? m.lo : m.mid)}" stroke-width="0.15"/>`;
  }
  return s;
}

/** A bevelled bar: a raised rectangle of pin metal. */
function bar(x, y, w, h, m, id) {
  const b = Math.min(w, h) * 0.16;
  return `<rect x="${f(x - 0.5)}" y="${f(y - 0.5)}" width="${f(w + 1)}" height="${f(h + 1)}" rx="1.4" fill="${m.line}"/>`
    + `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="1" fill="${m.lo}"/>`
    + `<path d="M${pt(x, y + h)} L${pt(x, y)} L${pt(x + w, y)} L${pt(x + w - b, y + b)} L${pt(x + b, y + b)} L${pt(x + b, y + h - b)} Z" fill="${m.hi}"/>`
    + `<rect x="${f(x + b)}" y="${f(y + b)}" width="${f(w - 2 * b)}" height="${f(h - 2 * b)}" fill="url(#${id})"/>`;
}

/**
 * A laurel or olive spray along an arc: leaves set alternately either side of
 * a stem, from `a0` to `a1` (radians) round (cx, cy).
 */
function spray(cx, cy, r, a0, a1, n, size, m) {
  const dirn = a1 > a0 ? 1 : -1;
  let d = '';
  for (let k = 0; k <= 16; k++) {
    const a = a0 + (a1 - a0) * (k / 16);
    d += `${k ? 'L' : 'M'}${pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r)} `;
  }
  let s = `<path d="${d}" fill="none" stroke="${m.line}" stroke-width="${f(size * 0.3)}" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="${m.lo}" stroke-width="${f(size * 0.16)}" stroke-linecap="round"/>`;
  const leaf = (x, y, ang, lit) => {
    // A pointed leaf from its base at (x, y) along `ang`.
    const L = size * 1.25, w = size * 0.42, c = Math.cos(ang), sn = Math.sin(ang);
    const tx = x + c * L, ty = y + sn * L, mx = x + c * L * 0.45, my = y + sn * L * 0.45;
    return `<path d="M${pt(x, y)} Q${pt(mx - sn * w, my + c * w)} ${pt(tx, ty)} Q${pt(mx + sn * w, my - c * w)} ${pt(x, y)} Z" fill="${lit ? m.hi : m.mid}" stroke="${m.line}" stroke-width="${f(size * 0.09)}" stroke-linejoin="round"/>`;
  };
  // Pairs of leaves either side of the stem, pointing on along it, and one
  // at the tip.
  for (let k = 0; k < n; k++) {
    const a = a0 + (a1 - a0) * ((k + 0.35) / n);
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    const tang = a + dirn * Math.PI / 2;
    s += leaf(px, py, tang - 0.62, true) + leaf(px, py, tang + 0.62, false);
  }
  const pxe = cx + Math.cos(a1) * r, pye = cy + Math.sin(a1) * r;
  s += leaf(pxe, pye, a1 + dirn * Math.PI / 2, true);
  return s;
}

/**
 * The eagle, in its own frame round (0, 0), about 100 wide for the spread
 * wings and 60 for the raised. Head turned to its right (the viewer's left),
 * the shield on its breast, the olive branch in its right talon and the
 * arrows in its left. `wings` is 'spread' (the colonel's pin) or 'raised'
 * (the specialist's and the coat of arms).
 */
function eagle(m, wings, detail = true) {
  const line = m.line, sw = detail ? 0.7 : 1.1;
  let s = '';
  const W = [];
  if (wings === 'spread') {
    // Long primaries swept out and up, stacked: each laid over the one below.
    for (let i = 6; i >= 0; i--) {
      const rx = -9 - i * 0.4, ry = -12 + i * 3.1;
      const a = ((24 - i * 5) * Math.PI) / 180, L = 41 - i * 4.2;
      const tx = rx - Math.cos(a) * L, ty = ry - Math.sin(a) * L;
      const cx = (rx + tx) / 2, cy = (ry + ty) / 2 - 2.4;
      W.push({ d: `M${pt(rx, ry)} Q${pt(cx, cy)} ${pt(tx, ty)}`, w: 4.6 });
    }
  } else {
    // Raised: the feathers fan from the shoulder, near upright inside to
    // near level at the outer edge, the longest at the top of the wing.
    for (let i = 8; i >= 0; i--) {
      const rx = -6 - i * 1.3, ry = -6 + i * 1.45;
      const a = ((-97 - i * 10.5) * Math.PI) / 180, L = 22 - i * 1.25;
      const tx = rx + Math.cos(a) * L, ty = ry + Math.sin(a) * L;
      const bend = 2.2;
      const cx = (rx + tx) / 2 + Math.sin(a) * bend, cy = (ry + ty) / 2 - Math.cos(a) * bend;
      W.push({ d: `M${pt(rx, ry)} Q${pt(cx, cy)} ${pt(tx, ty)}`, w: 5.4 });
    }
  }
  const wing = () => {
    let w = '';
    for (const q of W) w += `<path d="${q.d}" fill="none" stroke="${line}" stroke-width="${f(q.w + sw * 1.6)}" stroke-linecap="round"/>`
      + `<path d="${q.d}" fill="none" stroke="${m.mid}" stroke-width="${f(q.w)}" stroke-linecap="round"/>`
      + (detail ? `<path d="${q.d}" fill="none" stroke="${m.hi}" stroke-width="${f(q.w * 0.32)}" stroke-linecap="round" transform="translate(0 -0.9)"/>` : '');
    // The coverts: the short feathers over the roots of the long ones.
    if (wings === 'spread') {
      w += `<path d="M-5 -15 C-11 -19 -22 -21 -30 -17 C-27 -12 -19 -6 -8 -1 Z" fill="${m.mid}" stroke="${line}" stroke-width="${sw}"/>`;
      if (detail) for (let k = 0; k < 4; k++) w += `<path d="M${pt(-10 - k * 5, -16.5 + k * 0.3)} q2 3.2 -1 6.4" fill="none" stroke="${line}" stroke-width="0.5"/>`;
    } else {
      w += `<path d="M-4 -9 C-8 -15 -14 -15 -17 -10 C-17 -5 -12 0 -5 3 Z" fill="${m.mid}" stroke="${line}" stroke-width="${sw}"/>`;
      if (detail) for (let k = 0; k < 3; k++) w += `<path d="M${pt(-8 - k * 3.2, -12 + k * 1.2)} q1.6 2.6 -0.6 5" fill="none" stroke="${line}" stroke-width="0.45"/>`;
    }
    return w;
  };
  s += wing() + `<g transform="scale(-1 1)">${wing()}</g>`;
  // Tail: a fan under the shield.
  const ty0 = wings === 'spread' ? 9 : 10;
  for (let k = -2; k <= 2; k++) {
    s += `<path d="M${pt(k * 0.8, ty0)} L${pt(k * 2.6, ty0 + 9)}" stroke="${line}" stroke-width="${f(2.9 + sw)}" stroke-linecap="round"/>`
      + `<path d="M${pt(k * 0.8, ty0)} L${pt(k * 2.6, ty0 + 9)}" stroke="${m.mid}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  // Body and neck.
  s += `<path d="M-7 -12 C-9 -4 -8 6 0 12 C8 6 9 -4 7 -12 C4 -16 -4 -16 -7 -12 Z" fill="${m.mid}" stroke="${line}" stroke-width="${sw}"/>`;
  // Legs, the olive branch and the arrows.
  const gy = wings === 'spread' ? 16 : 14;
  if (wings === 'spread') {
    // Branch out to the left, arrows out to the right, level with the talons.
    let br = `<path d="M-5 ${gy} Q-22 ${gy + 1.4} -40 ${gy - 0.6}" fill="none" stroke="${line}" stroke-width="2.2" stroke-linecap="round"/>`
      + `<path d="M-5 ${gy} Q-22 ${gy + 1.4} -40 ${gy - 0.6}" fill="none" stroke="${m.lo}" stroke-width="1.2" stroke-linecap="round"/>`;
    for (let k = 0; k < 9; k++) {
      const x = -12 - k * 3.4, y = gy + 0.4 - k * 0.08, side = k % 2 ? 1 : -1;
      const ang = 180 + side * 32;
      br += `<ellipse cx="${f(x - 1.2)}" cy="${f(y + side * 1.5)}" rx="2.4" ry="0.95" transform="rotate(${ang} ${f(x - 1.2)} ${f(y + side * 1.5)})" fill="${k % 2 ? m.mid : m.hi}" stroke="${line}" stroke-width="0.4"/>`;
    }
    br += `<ellipse cx="-41" cy="${gy - 0.6}" rx="2.6" ry="1.1" fill="${m.hi}" stroke="${line}" stroke-width="0.4"/>`;
    let ar = '';
    for (let k = -1; k <= 1; k++) {
      const y0 = gy + k * 1.1, y1 = gy + k * 2.2;
      ar += `<path d="M2 ${f(y0)} L38 ${f(y1)}" stroke="${line}" stroke-width="1.6" stroke-linecap="round"/>`
        + `<path d="M2 ${f(y0)} L38 ${f(y1)}" stroke="${m.mid}" stroke-width="0.8" stroke-linecap="round"/>`;
      ar += `<path d="M${pt(33, y1 - 0.3)} l6 ${f(-1.4 + k * 0.4)} M${pt(35, y1 - 0.2)} l5 ${f(-1.4 + k * 0.4)} M${pt(33, y1 + 0.3)} l6 ${f(1.4 + k * 0.4)} M${pt(35, y1 + 0.2)} l5 ${f(1.4 + k * 0.4)}" stroke="${m.hi}" stroke-width="0.7" stroke-linecap="round"/>`;
    }
    s += br + ar;
  } else {
    // Raised wings: the branch hangs down to the left, the arrows to the right.
    let br = `<path d="M-4 ${gy} Q-12 ${gy + 1} -20 ${gy - 5}" fill="none" stroke="${line}" stroke-width="1.8" stroke-linecap="round"/>`;
    for (let k = 0; k < 6; k++) {
      const t = (k + 1) / 7, x = -4 - 16 * t, y = gy + Math.sin(t * Math.PI) * 0.8 - 5 * t * t, side = k % 2 ? 1 : -1;
      br += `<ellipse cx="${f(x)}" cy="${f(y + side * 1.6)}" rx="2.3" ry="1" transform="rotate(${f(-25 + side * 40)} ${f(x)} ${f(y + side * 1.6)})" fill="${k % 2 ? m.mid : m.hi}" stroke="${line}" stroke-width="0.4"/>`;
    }
    br += `<ellipse cx="-20.6" cy="${gy - 5.6}" rx="2.4" ry="1.1" transform="rotate(-40 -20.6 ${gy - 5.6})" fill="${m.hi}" stroke="${line}" stroke-width="0.4"/>`;
    let ar = '';
    for (let k = -1; k <= 1; k++) {
      const ex = 20 + k * 1.2, ey = gy - 4.5 + k * 1.6;
      ar += `<path d="M3 ${gy} L${pt(ex, ey)}" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>`
        + `<path d="M3 ${gy} L${pt(ex, ey)}" stroke="${m.mid}" stroke-width="0.7" stroke-linecap="round"/>`
        + `<path d="M${pt(ex - 2.2, ey + 0.2)} l2.8 -1.6 M${pt(ex - 2.2, ey + 0.4)} l2.4 1.8" stroke="${m.hi}" stroke-width="0.7" stroke-linecap="round"/>`;
    }
    s += br + ar;
  }
  // Talons.
  for (const x of [-4.5, 4.5]) {
    s += `<path d="M${pt(x * 0.8, gy - 6)} L${pt(x, gy - 0.5)}" stroke="${line}" stroke-width="2.6" stroke-linecap="round"/>`
      + `<path d="M${pt(x * 0.8, gy - 6)} L${pt(x, gy - 0.5)}" stroke="${m.mid}" stroke-width="1.6" stroke-linecap="round"/>`
      + `<path d="M${pt(x - 1.6, gy + 1.2)} q1.6 -2.2 3.2 0" fill="none" stroke="${line}" stroke-width="0.8"/>`;
  }
  // The shield on the breast: a plain chief over thirteen pales.
  const shield = 'M-7.5 -9 H7.5 V1.5 C7.5 7 4 10 0 12.5 C-4 10 -7.5 7 -7.5 1.5 Z';
  s += `<path d="${shield}" fill="${m.hi}" stroke="${line}" stroke-width="${f(sw * 1.1)}"/>`;
  s += `<path d="M-7.5 -9 H7.5 V-4.4 H-7.5 Z" fill="${m.mid}" stroke="${line}" stroke-width="${f(sw * 0.8)}"/>`;
  if (detail) {
    for (let k = 1; k <= 3; k++) s += `<path d="M-6.6 ${f(-9 + k * 1.15)} H6.6" stroke="${m.lo}" stroke-width="0.35"/>`;
    for (let k = -3; k <= 3; k++) {
      const x = k * 2.05, ax = Math.abs(x) / 7.5;
      const yb = 1.5 + (12.5 - 1.5) * (1 - ax * ax) - 1.1;
      s += `<path d="M${pt(x, -3.6)} V${f(yb)}" stroke="${m.lo}" stroke-width="1"/>`;
    }
  } else {
    for (let k = -1; k <= 1; k++) s += `<path d="M${pt(k * 3.2, -3.6)} V${f(9 - Math.abs(k) * 2.4)}" stroke="${m.lo}" stroke-width="1.4"/>`;
  }
  // The head, turned to the viewer's left, the hooked beak open a little.
  const hy = wings === 'spread' ? -13 : -10;
  s += `<path d="M5 ${hy + 3} C5.5 ${hy - 3} 3.5 ${hy - 8.5} -1.5 ${hy - 9} C-4.5 ${hy - 9.3} -6.8 ${hy - 8} -8 ${hy - 6.3} L-11.6 ${hy - 5.2} C-11.4 ${hy - 3.6} -10.2 ${hy - 3.2} -9 ${hy - 3.6} L-8.2 ${hy - 3.8} C-7.4 ${hy - 2.6} -6.4 ${hy - 1} -6 ${hy + 3} Z" fill="${m.hi}" stroke="${line}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  if (detail) {
    s += `<path d="M-11.4 ${hy - 4.6} Q-9.6 ${hy - 4.2} -8.2 ${hy - 4.8}" fill="none" stroke="${line}" stroke-width="0.4"/>`
      + `<path d="M-4.6 ${hy - 2} Q-1 ${hy - 1} 2 ${hy - 4}" fill="none" stroke="${m.lo}" stroke-width="0.5"/>`
      + `<path d="M-3.8 ${hy} Q0 ${hy + 1} 3.4 ${hy - 1}" fill="none" stroke="${m.lo}" stroke-width="0.5"/>`;
  }
  s += `<circle cx="-5.2" cy="${hy - 6}" r="${detail ? 0.85 : 1.1}" fill="${line}"/>`;
  return s;
}

/** The oak leaf: a lobed leaf on a short stem, the midrib a raised ridge. */
function oakLeaf(m) {
  // Sinuses up the right side, base to tip, and the lobe tip beyond each;
  // the left mirrors it. Four lobes a side, widest above the middle.
  const S = [{ y: 39, sx: 1.6 }, { y: 32, sx: 3.4 }, { y: 24.5, sx: 3.6 }, { y: 17, sx: 3.2 }, { y: 10.5, sx: 2.4 }];
  const P = [null, { x: 11.5, y: 34.5 }, { x: 15.5, y: 27.5 }, { x: 16, y: 19.5 }, { x: 12.5, y: 12 }];
  const half = (sgn) => {
    const X = (dx) => 24 + sgn * dx;
    let d = `M${pt(24, 40.5)} L${pt(X(S[0].sx), S[0].y)}`;
    for (let k = 1; k < S.length; k++) {
      const a = S[k - 1], b = S[k], p = P[k];
      // Out of the sinus below, round the lobe and back into the next.
      d += ` C${pt(X(a.sx + 3.5), a.y - 0.2)} ${pt(X(p.x + 0.6), p.y + 3.4)} ${pt(X(p.x), p.y)}`;
      d += ` C${pt(X(p.x - 0.5), p.y - 3)} ${pt(X(b.sx + 4.2), b.y + 2)} ${pt(X(b.sx), b.y)}`;
    }
    // The rounded end lobe.
    d += ` C${pt(X(7.5), 9.5)} ${pt(X(6.5), 2.5)} ${pt(24, 2.2)} Z`;
    return d;
  };
  let s = `<path d="M23 39 L22 46.5 L26 46.5 L25 39 Z" fill="${m.lo}" stroke="${m.line}" stroke-width="0.6"/>`;
  // Outline first, then the lit half and the shaded half meeting on the rib.
  s += `<path d="${half(-1)}" fill="${m.line}" stroke="${m.line}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="${half(1)}" fill="${m.line}" stroke="${m.line}" stroke-width="1.6" stroke-linejoin="round"/>`;
  s += `<path d="${half(-1)}" fill="${m.hi}"/><path d="${half(1)}" fill="${m.mid}"/>`;
  // Veins: the midrib and one out to each lobe.
  let v = `<path d="M24 41 L24 5" stroke="${m.line}" stroke-width="1" stroke-linecap="round"/>`;
  for (let k = 1; k < S.length; k++) {
    const p = P[k], vy = (S[k - 1].y + S[k].y) / 2 + 2.2;
    for (const sgn of [-1, 1]) {
      v += `<path d="M${pt(24, vy)} Q${pt(24 + sgn * p.x * 0.45, p.y + 0.8)} ${pt(24 + sgn * (p.x - 2.6), p.y + 0.3)}" fill="none" stroke="${sgn < 0 ? m.lo : m.line}" stroke-width="0.6" stroke-linecap="round"/>`;
    }
  }
  v += `<path d="M24 9 Q26.5 6.5 26.8 4.5 M24 9 Q21.5 6.5 21.2 4.5" fill="none" stroke="${m.line}" stroke-width="0.5" opacity="0.6"/>`;
  return s + v;
}

/**
 * The chevrons and rockers. All the band ends are cut square on the two
 * verticals x = 5 and x = 43; the lowest chevron's lower edge and the top
 * rocker's upper edge leave those verticals at the same point, so the two
 * bands touch and close the space between them.
 */
function stripes(n, r, dev, id) {
  const m = METAL.gold;
  const X0 = 5, X1 = 43, HW = 19, R = 9.6, D = 7.4, T = 3.1, G = 1.2;
  const kc = Math.hypot(1, R / HW), tvC = T * kc, pC = (T + G) * kc;
  const kr = Math.hypot(1, (2 * D) / HW), tvR = T * kr, pR = (T + G) * kr;
  // Height above and below the meeting line, to centre the whole.
  const up = R + tvC + (n - 1) * pC, down = r ? D + T + (r - 1) * (T + G) : 0;
  const yE = 24 + (up - down) / 2;
  let s = '';
  const band = (d) => `<path d="${d}" fill="url(#${id})" stroke="${m.line}" stroke-width="0.75" stroke-linejoin="miter"/>`;
  for (let k = 0; k < n; k++) {
    const yb = yE - k * pC, yt = yb - tvC; // the band's lower and upper edge at the ends
    s += band(`M${pt(X0, yt)} L${pt(24, yt - R)} L${pt(X1, yt)} L${pt(X1, yb)} L${pt(24, yb - R)} L${pt(X0, yb)} Z`);
    s += `<path d="M${pt(X0 + 1.2, yt + 0.9)} L${pt(24, yt - R + 0.95)} L${pt(X1 - 1.2, yt + 0.9)}" fill="none" stroke="${m.hi}" stroke-width="0.6" stroke-linejoin="miter" opacity="0.85"/>`;
  }
  for (let j = 0; j < r; j++) {
    const yt = yE + j * pR, yb = yt + tvR;
    // The lower edge's control point is moved so the band keeps its
    // thickness at the middle as well as the ends.
    // At the middle each rocker sits one band and one gap below the last,
    // as at the ends; a plain vertical shift would open the middle gaps.
    const ctT = yE + 2 * D + j * (2 * (T + G) - pR), ctB = ctT + (2 * T - tvR);
    s += band(`M${pt(X0, yt)} Q${pt(24, ctT)} ${pt(X1, yt)} L${pt(X1, yb)} Q${pt(24, ctB)} ${pt(X0, yb)} Z`);
    s += `<path d="M${pt(X0 + 1.2, yt + 1.1)} Q${pt(24, ctT + 0.9)} ${pt(X1 - 1.2, yt + 1.1)}" fill="none" stroke="${m.hi}" stroke-width="0.6" opacity="0.85"/>`;
  }
  // The device, in the space the bands close round.
  const cy = yE - R / 2 + D / 2 + 0.6;
  if (dev === 'diamond') {
    s += `<path d="M${pt(24, cy - 6.4)} L${pt(28.4, cy)} L${pt(24, cy + 6.4)} L${pt(19.6, cy)} Z" fill="${m.line}" stroke="${m.line}" stroke-width="1.2" stroke-linejoin="round"/>`
      + `<path d="M${pt(24, cy - 6.4)} L${pt(28.4, cy)} L24 ${f(cy)} Z" fill="${m.mid}"/><path d="M${pt(24, cy - 6.4)} L${pt(19.6, cy)} L24 ${f(cy)} Z" fill="${m.hi}"/>`
      + `<path d="M${pt(19.6, cy)} L${pt(24, cy + 6.4)} L24 ${f(cy)} Z" fill="${m.mid}"/><path d="M${pt(28.4, cy)} L${pt(24, cy + 6.4)} L24 ${f(cy)} Z" fill="${m.lo}"/>`;
  } else if (dev === 'star') {
    s += star(24, cy + 0.4, 6.4, m);
  } else if (dev === 'wreath') {
    s += spray(24, cy + 0.4, 6.4, Math.PI * 0.6, Math.PI * 1.38, 3, 2.1, m)
      + spray(24, cy + 0.4, 6.4, Math.PI * 0.4, -Math.PI * 0.38, 3, 2.1, m)
      + star(24, cy + 0.2, 4.2, m);
  } else if (dev === 'eagle') {
    s += star(13.6, cy + 0.6, 3.4, m) + star(34.4, cy + 0.6, 3.4, m)
      + `<g transform="translate(24 ${f(cy + 0.6)}) scale(0.25)">${eagle(m, 'raised', false)}</g>`;
  }
  return s;
}

/**
 * A rank's insignia: its supplied picture, or the drawing. `rank` carries
 * kind, n, r (rockers), dev (the senior NCO's device) and metal.
 */
export function insignia(rank, cls = 'ins') {
  if (rank && rank.id && RANK_ICONS.has(rank.id)) {
    return `<img class="${cls}" src="assets/ranks/${rank.id}.png" alt="" aria-hidden="true">`;
  }
  const m = METAL[rank.metal === 'silver' ? 'silver' : 'gold'];
  const id = `efi${++uid}`;
  const kind = rank.kind;
  let defs = '', body = '';
  if (kind === 'chev') {
    defs = grad(id, METAL.gold);
    body = stripes(rank.n || 0, rank.r || 0, rank.dev, id);
  } else if (kind === 'spc') {
    // The spade-shaped shield in Army green, the eagle on it in gold.
    const shield = 'M2.5 13.5 Q24 -0.5 45.5 13.5 C46 27 36 37 24 47 C12 37 2 27 2.5 13.5 Z';
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a6b52"/><stop offset="1" stop-color="#244a37"/></linearGradient>`;
    body = `<path d="${shield}" fill="url(#${id})" stroke="#132a1e" stroke-width="1"/>`
      + `<path d="M4.6 14.6 Q24 2 43.4 14.6" fill="none" stroke="#4f8468" stroke-width="0.7" opacity="0.8"/>`
      + `<g transform="translate(24 22) scale(0.56)">${eagle(METAL.gold, 'raised', true)}</g>`;
  } else if (kind === 'wo') {
    // Warrant officers: a silver bar with black squares across it, one to
    // four; the Chief Warrant Officer 5 has a black stripe down its length.
    const s = METAL.silver;
    defs = grad(id, s);
    body = bar(16.5, 5, 15, 38, s, id);
    if (rank.n >= 5) body += `<rect x="22.4" y="8" width="3.2" height="32" fill="#14171b"/>`;
    else {
      const gap = 32 / rank.n;
      for (let k = 0; k < rank.n; k++) body += `<rect x="20.2" y="${f(8 + gap * (k + 0.5) - 3.6)}" width="7.6" height="7.2" fill="#14171b"/>`;
    }
  } else if (kind === 'bar') {
    defs = grad(id, m);
    if (rank.n === 1) body = bar(18.5, 5, 11, 38, m, id);
    else {
      // The captain's bars: two, joined top and bottom like a ladder.
      body = `<rect x="16" y="9" width="16" height="2.2" fill="${m.lo}" stroke="${m.line}" stroke-width="0.5"/>`
        + `<rect x="16" y="36.8" width="16" height="2.2" fill="${m.lo}" stroke="${m.line}" stroke-width="0.5"/>`
        + bar(9, 5, 9, 38, m, id) + bar(30, 5, 9, 38, m, id);
    }
  } else if (kind === 'leaf') {
    body = oakLeaf(m);
  } else if (kind === 'eagle') {
    body = `<g transform="translate(24 25) scale(0.465)">${eagle(m, 'spread', true)}</g>`;
  } else if (kind === 'star') {
    const n = rank.n, gap = 46 / n;
    const r = Math.min(9.5, gap * 0.5);
    for (let k = 0; k < n; k++) body += star(1 + gap * (k + 0.5), 24.5, r, m);
  } else if (kind === 'fm' || kind === 'prestige') {
    // Five stars in a ring, as the General of the Army wore them; prestige
    // sets the ring in a laurel wreath.
    const g = METAL.gold;
    const rr = kind === 'prestige' ? 10.5 : 12.5, sr = kind === 'prestige' ? 4.6 : 5.6;
    if (kind === 'prestige') {
      body += spray(24, 25, 19.5, Math.PI * 0.58, Math.PI * 1.4, 7, 4.4, g)
        + spray(24, 25, 19.5, Math.PI * 0.42, -Math.PI * 0.4, 7, 4.4, g);
    }
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      body += star(24 + Math.cos(a) * rr, 25 + Math.sin(a) * rr, sr, g);
    }
  } else {
    body = `<circle cx="24" cy="24" r="7" fill="none" stroke="${m.mid}" stroke-width="2.4"/>`;
  }
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}
