import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';
import { PLAN } from './hohensalzburg_plan.js';

/**
 * Hohensalzburg, on the Festungsberg over Salzburg.
 *
 * Built from the survey, as Edinburgh is: every building of the fortress is
 * the outline the city bake has for it, fitted with the rectangle that holds
 * it (tools/hohensalzburg_plan.py), at its real place on the rock, its real
 * size and its real bearing. The Hoher Stock in the middle, the tallest block
 * on the rock, with the kitchen ranges against it and the Inner Bastion's gun
 * deck beside it; the Reckturm and the bell tower on the south rim; the
 * Hasengraben armoury and the salt store at the west end toward the Scharte;
 * the workhouse, the granary and the gunsmith along the north side over the
 * town; the Great Armoury, the haulage house of the Reisszug and the
 * Buergermeister tower at the east end over the Nonnberg; St George's church
 * and the Kuenburg turret on the south.
 *
 * The survey's heights are a storey or two everywhere, so the heights are
 * written in the plan tool: the Hoher Stock at six storeys, the ranges at two
 * to three, the Reckturm thirty-three metres to its eaves.
 *
 * The rock is the level, as on Castle Rock: the bake cuts the Festungsberg as
 * a crag with the summit level at the courtyards, and every wall is carried
 * down to meet the ground the bake has under it. Where a building stands on
 * the edge its footing is the cliff-top wall; the Buergermeister tower, down
 * the east slope, stands on forty-odd metres of its own masonry. A curtain
 * runs round the rim wherever there is no building on the edge to be the
 * wall. What is below the summit is footings, and is not scored.
 *
 * White lime render over rubble (TILE reads as it), terracotta roofs (BRICK),
 * grey dolomite footings (GRANITE).
 */

const STOREY = 4.2;
const WALL = 1.5;            // above the summit
const FOOT = 2.4;            // below it
const BATTER = 0.07;         // a footing widens this much per metre down
const WALK = 3.0;            // the curtain's wall-walk over the summit
const BREAST = 1.0;          // a wall-walk's: a man's eye is over it, his body is not
const MERLON = 0.9;
const CRENEL = 3.2;
const TOWER_PITCH = 62 * Math.PI / 180;

const RENDER = M.TILE, ROOF = M.BRICK, ROCK = M.GRANITE;

const C = PLAN.centre;

/** Local frame of a wing: u along the ridge, v across it. */
const frame = (w) => {
  const ux = Math.sin(w.ry), uz = Math.cos(w.ry);
  return {
    ux, uz, vx: uz, vz: -ux,
    at: (u, v) => [w.cx + u * ux + v * uz, w.cz + u * uz - v * ux],
    local: (x, z) => [(x - w.cx) * ux + (z - w.cz) * uz, (x - w.cx) * uz - (z - w.cz) * ux],
  };
};

const round = (w) => w.kind === 'round';
const square = (w) => w.kind === 'tower';

/** Is (x, z) on the footprint of any wing, with a margin? */
const onBuilding = (x, z, m = 1.0) => {
  for (const w of PLAN.wings) {
    if (round(w)) { if (Math.hypot(x - w.cx, z - w.cz) < w.len / 2 + m) return true; continue; }
    const [u, v] = frame(w).local(x, z);
    if (Math.abs(u) < w.len / 2 + m && Math.abs(v) < w.wid / 2 + m) return true;
  }
  return false;
};

/** Which long side of a wing faces away from the middle of the summit: +1 or -1 in v. */
const outwardSide = (w) => {
  const [, v] = frame(w).local(C.x, C.z);
  return v > 0 ? -1 : 1;
};

/** A tower's roof rise, from its side. */
const towerRoof = (w) => (w.len / 2) * Math.tan(TOWER_PITCH);

const RECK = PLAN.wings.find((w) => w.name === 'Reckturm');

/** The gaps in a battlemented run L long, as distances along it from its middle. */
const crenels = (L) => {
  const out = [];
  for (let u = -L / 2 + CRENEL; u < L / 2 - 0.8; u += CRENEL) out.push(u);
  return out;
};

/** What the garrison, the flag and the level record read (world metres). */
export const HOHENSALZBURG = {
  plan: PLAN,
  walk: WALK,
  frame,
  onBuilding,
  outwardSide,
  storey: STOREY,
  tags: ['hoherstock', 'reckturm', 'hasengraben', 'arbeitshaus', 'zeughaus', 'georg', 'curtain'],
  // The flag flies from the top of the Reckturm.
  flag: { x: RECK.cx, y: RECK.eaves + towerRoof(RECK) + 0.6, z: RECK.cz },
  top: { x: RECK.cx, y: RECK.eaves + towerRoof(RECK), z: RECK.cz },
};

export function buildHohensalzburg(quality) {
  const B = new BlockList();
  B.joint = JOINT;
  // The same stone from high up: a phone and a desktop lay the fortress alike, give or take.
  const s = Math.max(1.0, Math.min(quality.blockScale ?? 1.55, 1.6)) * 0.95;
  const stone = 1.8 * s;
  const course = 1.15 * s;
  const coarse = 2.4;
  // Everything a wing lays is lifted by its base: an outwork down the slope
  // is built from its own ground, not from the summit's.
  let lift = 0;

  /** Equal courses between two heights, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };
  /** Footing courses coarse, the face's own courses from just under the summit up. */
  const layers = (y0, y1, fn) => {
    const split = Math.min(y1, -2.0);
    if (split > y0 + 0.5) courses(y0, split, course * coarse, (y, h, c) => fn(y, h, c, true));
    courses(Math.max(y0, split), y1, course, (y, h, c) => fn(y, h, c, false));
  };

  /** A straight run of stones from u0 to u1 along the frame's u, at v, `thick` across. */
  const run = (F, ry, u0, u1, v, y, h, thick, st, mat, stagger) => {
    const len = u1 - u0;
    if (len < 0.2) return;
    const n = Math.max(1, Math.round(len / st));
    const seg = len / n;
    const cuts = [0];
    if (stagger && n > 1) { for (let i = 0; i < n; i++) cuts.push((i + 0.5) * seg); cuts.push(len); }
    else for (let i = 1; i <= n; i++) cuts.push(i * seg);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const l = cuts[i + 1] - cuts[i];
      if (l < 0.15) continue;
      const [x, z] = F.at(u0 + (cuts[i] + cuts[i + 1]) / 2, v);
      B.add(x, y + h / 2 + lift, z, B.shrink(thick / 2), B.shrink(h / 2), B.shrink(l / 2), mat, ry);
    }
  };
  /** The same across: a run along v at u. */
  const runV = (F, ry, v0, v1, u, y, h, thick, st, mat, stagger) => {
    const len = v1 - v0;
    if (len < 0.2) return;
    const n = Math.max(1, Math.round(len / st));
    const seg = len / n;
    const cuts = [0];
    if (stagger && n > 1) { for (let i = 0; i < n; i++) cuts.push((i + 0.5) * seg); cuts.push(len); }
    else for (let i = 1; i <= n; i++) cuts.push(i * seg);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const l = cuts[i + 1] - cuts[i];
      if (l < 0.15) continue;
      const [x, z] = F.at(u, v0 + (cuts[i] + cuts[i + 1]) / 2);
      B.add(x, y + h / 2 + lift, z, B.shrink(l / 2), B.shrink(h / 2), B.shrink(thick / 2), mat, ry);
    }
  };
  /** [a, b] with the holes taken out of it, as the pieces left. */
  const pieces = (a, b, holes) => {
    let out = [[a, b]];
    for (const [h0, h1] of holes) {
      const next = [];
      for (const [p0, p1] of out) {
        if (h1 <= p0 || h0 >= p1) { next.push([p0, p1]); continue; }
        if (h0 > p0) next.push([p0, h0]);
        if (h1 < p1) next.push([h1, p1]);
      }
      out = next;
    }
    return out;
  };
  /**
   * A rectangular course of wall, L along u by W across, corners bonded course
   * by course; `holes` are window openings laid as gaps between piers.
   */
  const rect = (F, ry, L, W, t, y, h, st, mat, c, holes = null) => {
    const odd = c % 2 === 1;
    const su = odd ? L / 2 - t : L / 2;
    const sv = odd ? W / 2 : W / 2 - t;
    for (const side of [-1, 1]) {
      for (const [a, b] of pieces(-su, su, holes ? holes.u : [])) run(F, ry, a, b, side * (W / 2 - t / 2), y, h, t, st, mat, odd);
      for (const [a, b] of pieces(-sv, sv, holes ? holes.v : [])) runV(F, ry, a, b, side * (L / 2 - t / 2), y, h, t, st, mat, odd);
    }
  };
  /** The window lines of a face `half` long: every 3.6 m from the middle, clear of the corners. */
  const windowLines = (half) => {
    const out = [];
    for (let k = -Math.floor((half - 2.4) / 3.6); k * 3.6 <= half - 2.4; k++) out.push([k * 3.6 - 0.6, k * 3.6 + 0.6]);
    return out;
  };
  const windowRow = (y) => {
    const f = Math.floor(y / STOREY) * STOREY;
    return y - f > 1.0 && y - f < 3.4 && y > 1.0;
  };

  // ── Footings: everything under the summit, one unscored section.
  B.section('footings', () => {
    for (const w of PLAN.wings) {
      const base = w.base ?? 0;
      if (w.found >= base - 0.5) continue;
      if (round(w)) {
        layers(w.found, base, (y, h, c, rough) => {
          const grow = BATTER * (base - y);
          B.polyRing(w.cx, w.cz, BlockList.circle(w.len / 2 + grow, 10, (c % 2) * 0.31), FOOT + grow, y, h, stone * (rough ? 1.6 : 1), ROCK);
        });
        continue;
      }
      const F = frame(w);
      layers(w.found, base, (y, h, c, rough) => {
        const grow = BATTER * (base - y);
        rect(F, w.ry, w.len + grow * 2, w.wid + grow * 2, Math.min(FOOT + grow, w.wid / 2), y, h, stone * (rough ? coarse : 1), ROCK, c);
      });
    }
  });

  // ── The buildings.

  /** A tiled roof between two gables: each course of tile a slab down each side, stepped in. */
  function gableRoof(F, ry, L, W, eaves, pitch) {
    const rc = Math.max(0.7, course * 0.8);
    const step = rc / Math.tan(pitch);
    const sw = Math.max(1.5, step * 2.1);
    const t = WALL;
    let c = 0;
    let half = W / 2 + 0.45;         // the eaves stand a little proud of the wall
    let y = eaves;
    while (half > sw * 0.75) {
      for (const side of [-1, 1]) run(F, ry, -L / 2 + t, L / 2 - t, side * (half - sw / 2), y, rc, sw, stone * 1.6, ROOF, c % 2);
      // The gables, rendered, rising with the roof.
      for (const end of [-1, 1]) runV(F, ry, -half, half, end * (L / 2 - t / 2), y, rc, t, stone, RENDER, c % 2);
      half -= step; y += rc; c++;
    }
    run(F, ry, -L / 2 + t, L / 2 - t, 0, y, rc, Math.max(0.8, half * 2 + 0.2), stone * 1.6, ROOF, c % 2);
    for (const end of [-1, 1]) runV(F, ry, -half, half, end * (L / 2 - t / 2), y, rc, t, stone, RENDER, 0);
    return y + rc;
  }

  /** A square tower's tall tiled pyramid, ring by ring, and a knob on top. */
  function pyramid(F, ry, side, eaves) {
    const rc = Math.max(0.7, course * 0.8);
    const step = rc / Math.tan(TOWER_PITCH);
    let half = side / 2 + 0.4, y = eaves, c = 0;
    while (half > 1.1) {
      const t = Math.min(half, Math.max(1.2, step * 2.2));
      rect(F, ry, half * 2, half * 2, t, y, rc, stone * 1.4, ROOF, c);
      half -= step; y += rc; c++;
    }
    const [x, z] = F.at(0, 0);
    B.add(x, y + 0.6 + lift, z, Math.max(0.4, half * 0.8), 0.6, Math.max(0.4, half * 0.8), ROOF, ry);
    return y + 1.2;
  }

  const wing = (w) => {
    lift = w.base ?? 0;
    try { wingAt(w); } finally { lift = 0; }
  };
  const wingAt = (w) => {
    const F = frame(w);
    const L = w.len, W = w.wid, t = WALL;
    const eaves = w.eaves;
    if (round(w)) {
      const r = w.len / 2;
      const holes = (x, y, z) => {
        if (!windowRow(y - lift) || y - lift > eaves - 1) return false;
        const a = Math.atan2(z - w.cz, x - w.cx);
        return Math.abs(Math.sin(a * 2)) < 0.22;
      };
      B.openings(holes, () => {
        courses(0, eaves, course, (y, h, c) => B.polyRing(w.cx, w.cz, BlockList.circle(r, 10, (c % 2) * 0.31), Math.min(WALL + 0.2, r * 0.45), y + lift, h, stone, RENDER));
      });
      // A floor at each storey, and the cone.
      for (let f = STOREY; f < eaves - 1.5; f += STOREY) B.add(w.cx, f - 0.3 + lift, w.cz, r - WALL + 0.05, 0.3, r - WALL + 0.05, RENDER, 0);
      let rr = r + 0.4, y = eaves + lift;
      while (rr > 0.5) { B.drum(w.cx, w.cz, y, y + 0.6, rr, Math.min(rr, 1.0), 0.6, 1.3, ROOF); y += 0.6; rr -= 0.6 / Math.tan(TOWER_PITCH); }
      return;
    }
    const kind = w.kind;
    if (kind === 'wall') {
      // A thick wall with a walk on it and a breastwork on the outer side.
      courses(0, eaves, course, (y, h, c) => run(F, w.ry, -L / 2, L / 2, 0, y, h, W, stone, RENDER, c % 2));
      const out = outwardSide(w);
      courses(eaves, eaves + BREAST, BREAST, (y, h) => run(F, w.ry, -L / 2, L / 2, out * (W / 2 - 0.45), y, h, 0.9, stone, RENDER, false));
      return;
    }
    const gate = kind === 'gate';
    const holes = kind === 'bastion' ? null : { u: windowLines(L / 2), v: windowLines(W / 2) };
    // The gate passage, through the long faces.
    const passage = (x, y, z) => {
      if (!gate || y - lift > 4.4) return false;
      const [u] = F.local(x, z);
      return Math.abs(u) < 1.9;
    };
    B.openings(passage, () => {
      courses(0, eaves, course, (y, h, c) => {
        rect(F, w.ry, L, W, t, y, h, stone, RENDER, c, holes && windowRow(y + h / 2) ? holes : null);
        // Cross walls in a long range, every eighteen metres, between windows.
        const bays = Math.floor(L / 18);
        for (let k = 1; k <= bays; k++) {
          const u = Math.round((-L / 2 + (L * k) / (bays + 1) - 1.8) / 3.6) * 3.6 + 1.8;
          runV(F, w.ry, -W / 2 + t, W / 2 - t, u, y, h, t, stone, RENDER, c % 2);
        }
      });
      // A floor round the inside at each storey, its top on the storey line:
      // what a man at a window stands on.
      if (kind !== 'bastion' && kind !== 'chapel') {
        for (let f = STOREY; f < eaves - 1.5; f += STOREY) {
          rect(F, w.ry, L - t * 2 + 0.1, W - t * 2 + 0.1, Math.min(2.6, W / 2 - t - 0.6), f - 0.6, 0.6, stone * 1.3, RENDER, 0);
        }
      }
    });
    if (kind === 'bastion') {
      // A gun deck on the walls and a breastwork round it, merlons on the outer face.
      const deck = eaves;
      courses(deck - 0.8, deck, 0.8, (y, h) => {
        const n = Math.max(1, Math.round(L / 2.0));
        for (let k = 0; k < n; k++) runV(F, w.ry, -W / 2, W / 2, -L / 2 + (k + 0.5) * (L / n), y, h, L / n, 99, RENDER, false);
      });
      const out = outwardSide(w);
      courses(deck, deck + BREAST, BREAST, (y, h) => {
        run(F, w.ry, -L / 2, L / 2, out * (W / 2 - 0.5), y, h, 1.0, stone, RENDER, false);
        runV(F, w.ry, -W / 2, W / 2 - 1.0, -L / 2 + 0.5, y, h, 1.0, stone, RENDER, false);
        runV(F, w.ry, -W / 2, W / 2 - 1.0, L / 2 - 0.5, y, h, 1.0, stone, RENDER, false);
      });
      for (let u = -L / 2 + CRENEL / 2; u < L / 2 - 0.8; u += CRENEL) {
        run(F, w.ry, u - 0.7, u + 0.7, out * (W / 2 - 0.5), deck + BREAST, MERLON, 1.0, 99, RENDER, false);
      }
      crenels(L).forEach((u, i) => {
        if (i % 4 !== 1) return;
        const [x, z] = F.at(u, out * (W / 2 - 2.4));
        cannon(x, z, deck, F.vx * out, F.vz * out);
      });
      return;
    }
    if (square(w)) { pyramid(F, w.ry, L, eaves); return; }
    gableRoof(F, w.ry, L, W, eaves, w.pitch * Math.PI / 180);
  };

  /** An iron gun on its carriage at (x, z), the barrel pointing along (dx, dz). */
  function cannon(x, z, y, dx, dz) {
    const ry = Math.atan2(dx, dz);
    B.add(x, y + 0.35 + lift, z, 0.7, 0.35, 0.9, M.IRON, ry);
    B.add(x + dx * 0.9, y + 0.95 + lift, z + dz * 0.9, 0.26, 0.26, 1.6, M.IRON, ry);
  }

  for (const tag of HOHENSALZBURG.tags) {
    if (tag === 'curtain') continue;
    B.section(tag, () => { for (const w of PLAN.wings) if (w.tag === tag) wing(w); });
  }

  // ── The curtain: round the rim of the summit wherever no building on the
  // edge is the wall, carried down to the rock, a walk on it and a
  // battlemented breastwork on the outer side.
  B.section('curtain', () => {
    const P = PLAN.curtain;
    const t = 2.6;
    B.openings((x, _y, z) => onBuilding(x, z, 1.2), () => {
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const dx = b.x - a.x, dz = b.z - a.z;
        const L = Math.hypot(dx, dz);
        if (L < 0.5) continue;
        const ry = Math.atan2(dx, dz);
        const F = frame({ cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, ry });
        const [, vo] = F.local(C.x, C.z);
        const out = vo > 0 ? -1 : 1;
        layers(Math.min(a.found, b.found), WALK, (y, h, c, rough) => {
          const grow = y < 0 ? BATTER * -y : 0;
          run(F, ry, -L / 2 - 0.8, L / 2 + 0.8, out * grow / 2, y, h, t + grow, stone * (rough ? coarse : 1), y < 0 ? ROCK : RENDER, c % 2);
        });
        run(F, ry, -L / 2 - 0.4, L / 2 + 0.4, out * (t / 2 - 0.5), WALK, BREAST, 1.0, stone, RENDER, i % 2);
        for (let u = CRENEL / 2; u < L / 2 + 0.2; u += CRENEL) {
          for (const sgn of [-1, 1]) run(F, ry, sgn * u - 0.7, sgn * u + 0.7, out * (t / 2 - 0.5), WALK + BREAST, MERLON, 1.0, 99, RENDER, false);
        }
      }
    });
  });

  return B;
}

/**
 * The garrison, posted on things that are there, where they can shoot out:
 * a man in a gap of the curtain's breastwork every few stretches, the Inner
 * Bastion's gaps, riflemen and machine guns at the windows of the ranges on
 * the rim facing out over it, snipers in the top storey of the towers, and
 * mortars dug in the courtyards.
 */
export function populateHohensalzburg(g, origin, groundY) {
  const K = HOHENSALZBURG;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const face = (dx, dz) => Math.atan2(dx, dz);

  // The curtain: the middle of every third stretch that is built and looks
  // out over open ground.
  const P = K.plan.curtain;
  let n = 0;
  for (let i = 1; i < P.length; i += 3) {
    const a = P[i], b = P[(i + 1) % P.length];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (K.onBuilding(mx, mz, 6)) continue;
    const F = K.frame({ cx: mx, cz: mz, ry: Math.atan2(b.x - a.x, b.z - a.z) });
    const [, vo] = F.local(C.x, C.z);
    const out = vo > 0 ? -1 : 1;
    let boxed = false;
    for (const dist of [6, 12, 18]) {
      for (const side of [-0.6, 0, 0.6]) {
        const [fx, fz] = F.at(side * dist, out * dist);
        if (K.onBuilding(fx, fz, 1)) boxed = true;
      }
    }
    if (boxed) continue;
    const [x, z] = F.at(0, out * 0.1);
    g.place(n % 4 === 1 ? 'mg' : n % 7 === 3 ? 'at' : 'rifleman', V(x, WALK + 0.05, z), face(F.vx * out, F.vz * out), 3, { cover: 'trench' });
    n++;
  }

  // Windows: every range on the rim (its footing goes down the cliff), on the
  // side facing out over it, on the first floor.
  for (const w of K.plan.wings) {
    if (w.kind !== 'hall' || w.found > -8 || w.len < 12) continue;
    const F = K.frame(w);
    const out = outwardSide(w);
    const count = Math.max(1, Math.min(3, Math.floor(w.len / 14)));
    for (let k = 0; k < count; k++) {
      const f = (k + 0.5) / count;
      const u = Math.round((f - 0.5) * (w.len - 6) / 3.6) * 3.6;
      const [x, z] = F.at(u, out * (w.wid / 2 - WALL - 0.6));
      g.place(k === 1 ? 'mg' : 'rifleman', V(x, (w.base ?? 0) + STOREY + 0.05, z), face(F.vx * out, F.vz * out), 3, { cover: 'window' });
    }
  }

  // The Hoher Stock's top floor, all four sides: it looks over everything.
  {
    const w = K.plan.wings.find((x) => x.name === 'Hoher Stock');
    const F = K.frame(w);
    const top = Math.floor((w.eaves - 1.5) / STOREY) * STOREY;
    for (const [du, dv] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const [x, z] = F.at(du * (w.len / 2 - WALL - 0.6) + (dv ? 1.8 * 0 : 0), dv * (w.wid / 2 - WALL - 0.6));
      const dx = F.ux * du + F.vx * dv, dz = F.uz * du + F.vz * dv;
      g.place(du ? 'mg' : 'sniper', V(x, top + 0.05, z), face(dx, dz), 3, { cover: 'window' });
    }
  }

  // Snipers in the top storey of the tall towers, looking out from the summit.
  for (const w of K.plan.wings) {
    if (w.kind !== 'tower' || w.eaves < 16 || w.found < -20) continue;
    const top = Math.floor((w.eaves - 1.5) / STOREY) * STOREY;
    let dx = w.cx - C.x, dz = w.cz - C.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const r = w.len / 2 - WALL - 0.6;
    g.place('sniper', V(w.cx + dx * r, (w.base ?? 0) + top + 0.05, w.cz + dz * r), face(dx, dz), 3, { cover: 'window' });
  }

  // Mortars in the courtyards, dug in.
  for (const p of Object.values(K.plan.points)) {
    g.place('mortar', V(p.x, p.y + 0.3, p.z), 0, 20, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
