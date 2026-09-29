import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';
import { PLAN } from './edinburgh_plan.js';

/**
 * Edinburgh Castle, on Castle Rock.
 *
 * Built from the survey: every building is the outline the city bake has for
 * it, taken apart into the wings a roof can go on (tools/edinburgh_plan.py),
 * at its real place on the summit and its real size in plan. The survey puts
 * Crown Square where it is — the Palace east, the Great Hall south, the Queen
 * Anne Building west and the War Memorial north — the New Barracks along the
 * south-west edge, the Hospital's U and the Governor's House at the west end,
 * the Portcullis Gate and Argyle Tower on the north approach and the Gatehouse
 * at the head of the Esplanade. The Half Moon Battery is not in the survey; it
 * stands where it stands, against the Palace's east end with its arc over the
 * Esplanade.
 *
 * Heights are the survey's by a third again, and the roofs are Scottish: steep
 * slate between crow-stepped gables with a chimney stack on each. A roof here
 * can only be stepped — the solver's stones turn about the vertical and nothing
 * else — and a crow-stepped gable is a stepped gable, so this is the one roof
 * in the world where that is the right answer rather than a compromise.
 *
 * The rock is the level, and nothing flattens it. Every wall is carried down to
 * the ground the bake has under it — measured by the plan tool, not written by
 * hand — so where the summit falls away the masonry shows as the retaining wall
 * it is: the Barracks and the Queen Anne Building over the Grassmarket, the
 * Half Moon over the Esplanade, the curtain along the rim over the gardens.
 * The old castle was laid half as big again as its plan, about the origin, and
 * carried down to depths picked for the plan it no longer had: the Barracks'
 * far corner stood over the edge of the crag on nothing.
 *
 * What is below the summit is footings, and is not scored: a player cannot be
 * asked to shoot away masonry that is inside the rock.
 *
 * Grey-brown Craigleith sandstone (ASHLAR) and near-black slate (SCOTSLATE).
 */

const HEIGHT = 1.3;          // the survey's heights, by this
const STOREY = 4.2;
const WALL = 1.6;            // above ground
const FOOT = 2.4;            // below it
const BATTER = 0.07;         // a footing widens this much per metre down
const PITCH = 52 * Math.PI / 180;
const WALK = 1.4;            // the curtain's wall-walk over the summit
const PARAPET = 1.5;         // a tower's
const BREAST = 1.0;          // a wall-walk's: a man's eye is over it, his body is not
const MERLON = 0.9;          // and the merlons on it
const CRENEL = 3.2;          // merlon to merlon along a curtain or a battery
const HM_CRENEL = 4.0;       // and round the Half Moon, by arc length

const ASH = M.ASHLAR, SLATE = M.SCOTSLATE;

/** Eaves height of a wing over the summit. */
const eavesOf = (w) => {
  if (w.kind === 'battery') return 5.5;
  if (w.kind === 'chapel') return 5.0;
  if (w.kind === 'tower') return Math.round(w.h * HEIGHT * 1.35);
  // A wing's roof is part of its surveyed height: the eaves are under it.
  return Math.max(STOREY * 2, Math.round((w.h * HEIGHT - w.wid * 0.35) / STOREY) * STOREY);
};

const PALACE = PLAN.wings.find((w) => w.name === 'Royal Palace');
const GATE = PLAN.wings.find((w) => w.name === 'Gatehouse');
const ARGYLE = PLAN.wings.find((w) => w.name === 'Argyle Battery');
const TOWER = { x: 36.5, z: 41.5, size: 8.5, found: PALACE.found, top: eavesOf(PALACE) + 16 };
const DRUMS = [{ x: 78.2, z: 6.5 }, { x: 79.6, z: 16.0 }].map((d) => ({ ...d, r: 3.2, top: eavesOf(GATE) + 6 }));
const HM = PLAN.halfmoon;
const HM_DECK = 8.0;
const HM_RP = HM.r + 1.4;    // the Half Moon's parapet, centre line
/** The gaps in a battlemented run L long, as distances along it from its middle. */
const crenels = (L) => {
  const out = [];
  for (let u = -L / 2 + CRENEL; u < L / 2 - 0.8; u += CRENEL) out.push(u);
  return out;
};
/** The gaps round the Half Moon's parapet, as angles in radians. */
const hmGaps = () => {
  const out = [];
  const a0 = HM.a0 * Math.PI / 180, a1 = HM.a1 * Math.PI / 180;
  for (let a = a0 + HM_CRENEL / HM_RP; a < a1 - 0.5 * HM_CRENEL / HM_RP; a += HM_CRENEL / HM_RP) out.push(a);
  return out;
};

/** Local frame of a wing: u along the ridge, v across it. */
const frame = (w) => {
  const ux = Math.sin(w.ry), uz = Math.cos(w.ry);
  return {
    ux, uz, vx: uz, vz: -ux,
    at: (u, v) => [w.cx + u * ux + v * uz, w.cz + u * uz - v * ux],
    local: (x, z) => [(x - w.cx) * ux + (z - w.cz) * uz, (x - w.cx) * uz - (z - w.cz) * ux],
  };
};

/** Is (x, z) on the footprint of any wing, the tower or the drums, with a margin? */
const onBuilding = (x, z, m = 1.0) => {
  for (const w of PLAN.wings) {
    const [u, v] = frame(w).local(x, z);
    if (Math.abs(u) < w.len / 2 + m && Math.abs(v) < w.wid / 2 + m) return true;
  }
  if (Math.abs(x - TOWER.x) < TOWER.size / 2 + m && Math.abs(z - TOWER.z) < TOWER.size / 2 + m) return true;
  return DRUMS.some((d) => Math.hypot(x - d.x, z - d.z) < d.r + m);
};

/** Inside the Palace tower's square. */
const inTower = (x, z) => Math.abs(x - TOWER.x) < TOWER.size / 2 + 0.1 && Math.abs(z - TOWER.z) < TOWER.size / 2 + 0.1;

/** Inside the Half Moon's D. */
const inHalfMoon = (x, z, m = 0) => x > HM.back - m && z > HM.arc[0].z - m && z < HM.arc[HM.arc.length - 1].z + m
  && (x < HM.cx || Math.hypot(x - HM.cx, z - HM.cz) < HM.r + m);

/** What the garrison, the flag and the level record read (world metres). */
export const EDINBURGH = {
  scale: 1,
  plan: PLAN,
  tower: TOWER,
  drums: DRUMS,
  halfmoon: { ...HM, deck: HM_DECK },
  walk: WALK,
  eavesOf,
  frame,
  onBuilding,
  gun: { x: PLAN.points.gun.x, z: PLAN.points.gun.z },
  // The flag flies from the Palace tower.
  flag: { x: TOWER.x, y: TOWER.top + PARAPET + 0.4, z: TOWER.z },
};

export function buildEdinburgh(quality) {
  const B = new BlockList();
  B.joint = JOINT;
  // The same stone from high up: a phone and a desktop lay the castle alike, give or take.
  const s = Math.max(1.0, Math.min(quality.blockScale, 1.4)) * 0.95;
  const stone = 1.8 * s;
  const course = 1.15 * s;
  const coarse = 2.4;

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

  /** A straight run of stones from (u0) to (u1) along the frame's u, at v, `thick` across. */
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
      B.add(x, y + h / 2, z, B.shrink(thick / 2), B.shrink(h / 2), B.shrink(l / 2), mat, ry);
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
      B.add(x, y + h / 2, z, B.shrink(l / 2), B.shrink(h / 2), B.shrink(thick / 2), mat, ry);
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
   * by course. `holes` are window openings: on the long sides as intervals of
   * u, on the ends as intervals of v. A window is laid as a gap between two
   * piers rather than cut out of whatever stone happens to be there, which
   * missed more windows than it made: the stones are longer than the windows.
   */
  const rect = (F, ry, L, W, t, y, h, st, mat, c, holes = null) => {
    const odd = c % 2 === 1;
    // Odd courses: the ends run through; even: the sides do.
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

  // ── Footings: everything under the summit, one unscored section.
  B.section('footings', () => {
    for (const w of PLAN.wings) {
      const F = frame(w);
      B.openings((x, _y, z) => w.tag === 'palace' && inTower(x, z), () => {
        layers(w.found, 0, (y, h, c, rough) => {
          const grow = BATTER * (0 - y);
          rect(F, w.ry, w.len + grow * 2, w.wid + grow * 2, FOOT + grow, y, h, stone * (rough ? coarse : 1), ASH, c);
        });
      });
    }
    // The palace tower and the gate drums go down with the buildings they are part of.
    const T = frame({ cx: TOWER.x, cz: TOWER.z, ry: 0 });
    layers(TOWER.found, 0, (y, h, c, rough) => rect(T, 0, TOWER.size, TOWER.size, FOOT, y, h, stone * (rough ? coarse : 1), ASH, c));
    for (const d of DRUMS) {
      layers(GATE.found - 2, 0, (y, h, c, rough) => B.polyRing(d.x, d.z, BlockList.circle(d.r, 10, (c % 2) * 0.31), FOOT, y, h, stone * (rough ? 1.6 : 1), ASH));
    }
  });

  // ── The buildings.
  const windowRow = (y) => {
    // A window from a metre over each floor to two and a half over it.
    const f = Math.floor(y / STOREY) * STOREY;
    return y - f > 1.0 && y - f < 3.4 && y > 1.0;
  };
  const wing = (w) => {
    const F = frame(w);
    const eaves = eavesOf(w);
    const L = w.len, W = w.wid, t = WALL;
    const gates = w.kind === 'gate' || w.kind === 'tower';
    // Windows: one every 3.6 m along each face, clear of the corners.
    const holes = w.kind === 'battery' ? null : { u: windowLines(L / 2), v: windowLines(W / 2) };
    // The gate passage: through the long faces for the Gatehouse, the ends for the Argyle Tower.
    const passage = (x, y, z) => {
      if (!gates || y > 4.6) return false;
      const [u, v] = F.local(x, z);
      return w.kind === 'gate' ? Math.abs(u) < 1.9 : Math.abs(v) < 1.7;
    };
    const own = (x, z) => w.tag === 'palace' && inTower(x, z);
    B.openings((x, y, z) => passage(x, y, z) || own(x, z), () => {
      courses(0, eaves, course, (y, h, c) => {
        rect(F, w.ry, L, W, t, y, h, stone, ASH, c, holes && windowRow(y + h / 2) ? holes : null);
        // Cross walls in a long range, every eighteen metres or so, and always
        // between two windows rather than across one.
        const bays = Math.floor(L / 18);
        for (let k = 1; k <= bays; k++) {
          const u = Math.round((-L / 2 + (L * k) / (bays + 1) - 1.8) / 3.6) * 3.6 + 1.8;
          runV(F, w.ry, -W / 2 + t, W / 2 - t, u, y, h, t, stone, ASH, c % 2);
        }
      });
      // A floor round the inside at each storey, its top exactly on the storey:
      // what a man at a window stands on, and his eye at the window.
      if (w.kind !== 'battery') {
        for (let f = STOREY; f < eaves - 1.5; f += STOREY) {
          rect(F, w.ry, L - t * 2 + 0.1, W - t * 2 + 0.1, Math.min(2.6, W / 2 - t - 0.6), f - 0.6, 0.6, stone * 1.3, ASH, 0);
        }
      }
    });
    if (w.kind === 'battery') {
      // A flat gun platform on the walls, and a parapet round it with embrasures on the outer face.
      const deck = eaves;
      // The platform: slabs across from wall to wall, two metres wide.
      courses(deck - 0.8, deck, 0.8, (y, h) => {
        const n = Math.max(1, Math.round(L / 2.0));
        for (let k = 0; k < n; k++) runV(F, w.ry, -W / 2, W / 2, -L / 2 + (k + 0.5) * (L / n), y, h, L / n, 99, ASH, false);
      });
      const outer = outwardSide(w);
      // A breastwork round three sides and merlons on the outer one; the men
      // and the guns stand in the gaps (see `crenels`).
      courses(deck, deck + BREAST, BREAST, (y, h) => {
        run(F, w.ry, -L / 2, L / 2, outer * (W / 2 - 0.5), y, h, 1.0, stone, ASH, false);
        runV(F, w.ry, -W / 2, W / 2 - 1.0, -L / 2 + 0.5, y, h, 1.0, stone, ASH, false);
        runV(F, w.ry, -W / 2, W / 2 - 1.0, L / 2 - 0.5, y, h, 1.0, stone, ASH, false);
      });
      for (let u = -L / 2 + CRENEL / 2; u < L / 2 - 0.8; u += CRENEL) {
        run(F, w.ry, u - 0.7, u + 0.7, outer * (W / 2 - 0.5), deck + BREAST, MERLON, 1.0, 99, ASH, false);
      }
      // Guns in every fourth gap from the second.
      crenels(L).forEach((u, i) => {
        if (i % 4 !== 1) return;
        const [x, z] = F.at(u, outer * (W / 2 - 2.4));
        cannon(x, z, deck, F.vx * outer, F.vz * outer);
      });
      return;
    }
    gableRoof(F, w.ry, L, W, eaves, w.kind !== 'chapel');
  };

  /** Which long side of a wing faces away from the middle of the castle: +1 or -1 in v. */
  function outwardSide(w) {
    const F = frame(w);
    const [, v] = F.local(0, 20);
    return v > 0 ? -1 : 1;
  }

  /** An iron gun on its carriage at (x, z), the barrel pointing along (dx, dz). */
  function cannon(x, z, y, dx, dz) {
    const ry = Math.atan2(dx, dz);
    B.add(x, y + 0.35, z, 0.7, 0.35, 0.9, M.IRON, ry);
    B.add(x + dx * 0.9, y + 0.95, z + dz * 0.9, 0.26, 0.26, 1.6, M.IRON, ry);
  }

  /**
   * A steep slate roof between two crow-stepped gables, a stack on each gable.
   * Each course of slate is a slab down each side stepped in over the one below
   * and resting half on it; the gables rise course by course with it and stand
   * a hand proud of the slates, which is what makes the steps.
   */
  function gableRoof(F, ry, L, W, eaves, chimneys) {
    const rc = Math.max(0.7, course * 0.8);
    const step = rc / Math.tan(PITCH);
    const sw = Math.max(1.5, step * 2.1);
    const t = WALL;
    let c = 0;
    let half = W / 2 + 0.35;         // outer edge of the slates, from the ridge line
    let y = eaves;
    while (half > sw * 0.75) {
      for (const side of [-1, 1]) {
        run(F, ry, -L / 2 + t, L / 2 - t, side * (half - sw / 2), y, rc, sw, stone * 1.6, SLATE, c % 2);
      }
      // The gables, a step proud of the roof on either side.
      for (const end of [-1, 1]) {
        runV(F, ry, -(half + 0.25), half + 0.25, end * (L / 2 - t / 2), y, rc, t, stone, ASH, c % 2);
      }
      half -= step; y += rc; c++;
    }
    // The ridge.
    run(F, ry, -L / 2 + t, L / 2 - t, 0, y, rc, Math.max(0.8, half * 2 + 0.2), stone * 1.6, SLATE, c % 2);
    for (const end of [-1, 1]) {
      runV(F, ry, -(half + 0.25), half + 0.25, end * (L / 2 - t / 2), y, rc, t, stone, ASH, 0);
      if (chimneys) {
        const [x, z] = F.at(end * (L / 2 - t / 2), 0);
        B.add(x, y + rc + 1.2, z, 1.4, 1.2, t / 2 - 0.05, ASH, ry);
      }
    }
  }

  const tags = ['palace', 'greathall', 'memorial', 'barracks', 'hospital', 'governor', 'chapel', 'argyle', 'gatehouse'];
  for (const tag of tags) {
    B.section(tag, () => {
      for (const w of PLAN.wings) if (w.tag === tag) wing(w);
      if (tag === 'palace') palaceTower();
      if (tag === 'gatehouse') for (const d of DRUMS) drum(d);
    });
  }

  /** The Palace tower: square, a parapet walk, a bartizan at each corner. */
  function palaceTower() {
    const T = frame({ cx: TOWER.x, cz: TOWER.z, ry: 0 });
    const n = TOWER.size;
    courses(0, TOWER.top, course, (y, h, c) => rect(T, 0, n, n, WALL, y, h, stone, ASH, c));
    // The roof of it, which men stand on.
    courses(TOWER.top - 0.9, TOWER.top, 0.9, (y, h) => {
      for (let k = 0; k < 3; k++) runV(T, 0, -n / 2 + WALL, n / 2 - WALL, -n / 2 + WALL + (k + 0.5) * (n - 2 * WALL) / 3, y, h, (n - 2 * WALL) / 3, 99, ASH, false);
    });
    courses(TOWER.top, TOWER.top + BREAST, BREAST, (y, h, c) => rect(T, 0, n + 0.6, n + 0.6, 0.9, y, h, stone * 0.8, ASH, c));
    // Bartizans: little round turrets on the corners, with cones.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const bx = TOWER.x + sx * (n / 2 - 0.9), bz = TOWER.z + sz * (n / 2 - 0.9);
      courses(TOWER.top, TOWER.top + 2.6, course * 0.75, (y, h, c) => B.polyRing(bx, bz, BlockList.circle(1.2, 6, c * 0.5), 0.9, y, h, 1.2, ASH));
      let r = 1.5, y = TOWER.top + 2.6;
      while (r > 0.35) { B.drum(bx, bz, y, y + 0.55, r, Math.min(r, 0.8), 0.55, 1.0, SLATE); y += 0.55; r -= 0.32; }
    }
  }

  /** A round tower at the gate, battlemented. */
  function drum(d) {
    courses(0, d.top, course, (y, h, c) => B.polyRing(d.x, d.z, BlockList.circle(d.r, 10, (c % 2) * 0.31), WALL, y, h, stone, ASH));
    courses(d.top - 0.8, d.top, 0.8, (y, h) => B.slab(d.x, y + h / 2, d.z, d.r * 1.5, h, d.r * 1.5, stone * 1.2, ASH));
    courses(d.top, d.top + BREAST, BREAST, (y, h, c) => B.polyRing(d.x, d.z, BlockList.circle(d.r + 0.2, 12, c * 0.26), 0.8, y, h, stone * 0.8, ASH));
  }

  // ── The Half Moon: the arc and its returns carried down to the rock, the
  // fill walls inside, the gun deck on them and the parapet round it.
  B.section('halfmoon', () => {
    const arc = HM.arc;
    const n0 = arc[0], n1 = arc[arc.length - 1];
    // The outline, arc first, then the returns and the back wall against the Palace.
    const pts = [...arc.map((p) => [p.x, p.z, p.found]),
      [HM.back, n1.z, n1.found], [HM.back, n0.z, PALACE.found], [n0.x, n0.z, n0.found]];
    const straight = (a, b, y, h, t, st, c) => {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      const F = frame({ cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, ry: Math.atan2(dx, dz) });
      // Stones overlap the joint at each vertex by half the thickness.
      run(F, Math.atan2(dx, dz), -L / 2 - t * 0.35, L / 2 + t * 0.35, 0, y, h, t, st, ASH, c % 2);
    };
    const t = 4.0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const found = Math.min(a[2], b[2]);
      layers(found, HM_DECK, (y, h, c, rough) => {
        const grow = y < 0 ? BATTER * -y : 0;
        straight(a, b, y, h, t + grow, stone * (rough ? coarse : 1), c);
      });
    }
    // The fill: walls across the D every six metres, carrying the deck.
    for (let x = HM.back + 6; x < HM.cx + HM.r - 3; x += 6) {
      const zc = x < HM.cx ? HM.r : Math.sqrt(Math.max(0, HM.r * HM.r - (x - HM.cx) ** 2));
      const z0 = n0.z + t / 2, z1 = Math.min(n1.z, HM.cz + zc) - t / 2;
      if (z1 - z0 < 3) continue;
      const F = frame({ cx: x, cz: (z0 + z1) / 2, ry: 0 });
      layers(HM.found, HM_DECK - 1.0, (y, h, c, rough) => run(F, 0, -(z1 - z0) / 2, (z1 - z0) / 2, 0, y, h, 1.8, stone * (rough ? coarse : 1), ASH, c % 2));
    }
    // The deck: slabs from fill wall to fill wall.
    B.openings((x, _y, z) => !inHalfMoon(x, z, -t * 0.4), () => {
      for (let x = HM.back + 3; x < HM.cx + HM.r; x += 6) {
        for (let z = n0.z + 1; z < n1.z; z += 2.2) {
          B.add(x, HM_DECK - 0.5, z, 3.4, 0.5, 1.05, ASH, 0);
        }
      }
    });
    // The parapet on the arc: a breastwork and merlons on it, every four
    // metres, the men and the guns in the gaps.
    for (let i = 0; i + 1 < arc.length; i++) {
      const a = arc[i], b = arc[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz);
      const nx = (a.x + b.x) / 2 - HM.cx, nz = (a.z + b.z) / 2 - HM.cz, nl = Math.hypot(nx, nz);
      const F = frame({ cx: (a.x + b.x) / 2 + (nx / nl) * 1.4, cz: (a.z + b.z) / 2 + (nz / nl) * 1.4, ry: Math.atan2(dx, dz) });
      run(F, Math.atan2(dx, dz), -L / 2 - 0.3, L / 2 + 0.3, 0, HM_DECK, BREAST, 1.2, stone, ASH, i % 2);
    }
    const gaps = hmGaps();
    const step = HM_CRENEL / HM_RP;
    for (const g of gaps) {
      const a = g - step / 2;
      B.add(HM.cx + Math.cos(a) * HM_RP, HM_DECK + BREAST + MERLON / 2, HM.cz + Math.sin(a) * HM_RP,
        0.6, MERLON / 2, 0.95, ASH, Math.atan2(-Math.sin(a), Math.cos(a)));
    }
    gaps.forEach((a, i) => {
      if (i % 4 !== 2) return;
      cannon(HM.cx + Math.cos(a) * (HM.r - 1.6), HM.cz + Math.sin(a) * (HM.r - 1.6), HM_DECK, Math.cos(a), Math.sin(a));
    });
  });

  // ── The curtain: round the rim from the Half Moon, through south, west and
  // north, to the head of the Esplanade, wherever there is no building on the
  // edge to be the wall. Between the ranges on the south side it is what
  // turns their footings into one rampart instead of a row of fins.
  B.section('curtain', () => {
    const P = PLAN.curtain;
    const t = 3.0;
    B.openings((x, _y, z) => onBuilding(x, z, 1.2) || inHalfMoon(x, z, 3), () => {
      for (let i = 0; i + 1 < P.length; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const L = Math.hypot(dx, dz);
        const ry = Math.atan2(dx, dz);
        const F = frame({ cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, ry });
        // Outward is away from the middle of the summit.
        const [, vo] = F.local(0, 0);
        const out = vo > 0 ? -1 : 1;
        layers(Math.min(a.found, b.found), WALK, (y, h, c, rough) => {
          const grow = y < 0 ? BATTER * -y : 0;
          run(F, ry, -L / 2 - 0.8, L / 2 + 0.8, out * grow / 2, y, h, t + grow, stone * (rough ? coarse : 1), ASH, c % 2);
        });
        // The parapet on the outer edge: breast-high, merlons on it, a gap
        // in the middle of every stretch where a man stands.
        run(F, ry, -L / 2 - 0.4, L / 2 + 0.4, out * (t / 2 - 0.5), WALK, BREAST, 1.0, stone, ASH, i % 2);
        for (let u = CRENEL / 2; u < L / 2 + 0.2; u += CRENEL) {
          for (const sgn of [-1, 1]) run(F, ry, sgn * u - 0.7, sgn * u + 0.7, out * (t / 2 - 0.5), WALK + BREAST, MERLON, 1.0, 99, ASH, false);
        }
      }
    });
  });

  return B;
}

/**
 * The garrison, posted on things that are there, where they can shoot out:
 * a man in a gap between merlons on the curtain's walk every few stretches,
 * the Half Moon's gaps, the Argyle Battery's gaps, snipers over the breastwork
 * of the Palace tower and the Gatehouse drums, riflemen at the first-floor
 * windows of the ranges on the edge of the rock — standing on the floor behind
 * the window, eye at the sill — and mortars dug in on Crown Square.
 */
export function populateEdinburgh(g, origin, groundY) {
  const K = EDINBURGH;
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  const face = (dx, dz) => Math.atan2(dx, dz);

  // The curtain: the gap in the middle of every third stretch that is built,
  // half a metre behind the breastwork.
  const P = K.plan.curtain;
  let n = 0;
  for (let i = 1; i + 1 < P.length; i += 3) {
    const a = P[i], b = P[i + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (K.onBuilding(mx, mz, 7) || inHalfMoon(mx, mz, 6)) continue;
    const F = K.frame({ cx: mx, cz: mz, ry: Math.atan2(b.x - a.x, b.z - a.z) });
    const [, vo] = F.local(0, 0);
    const out = vo > 0 ? -1 : 1;
    // Not where the wall runs across a courtyard with a range in front of it:
    // a fan out along his line of fire must be clear of the buildings.
    let boxed = false;
    for (const dist of [6, 12, 18]) {
      for (const side of [-0.6, 0, 0.6]) {
        const [fx, fz] = F.at(side * dist, out * dist);
        if (K.onBuilding(fx, fz, 1)) boxed = true;
      }
    }
    if (boxed) continue;
    const [x, z] = F.at(0, out * 0.1);
    g.place(n % 4 === 1 ? 'mg' : 'rifleman', V(x, K.walk + 0.05, z), face(F.vx * out, F.vz * out), 3, { cover: 'trench' });
    n++;
  }

  // The Half Moon: in the gaps, on the wall-head behind the breastwork.
  const kinds = ['rifleman', 'mg', 'rifleman', 'at', 'rifleman', 'mg', 'rifleman', 'rifleman', 'at'];
  hmGaps().forEach((a, i) => {
    if (i % 4 === 2 || i % 2 === 1) return;             // the guns' gaps, and every other one
    const type = kinds[(i / 2) % kinds.length | 0];
    g.place(type, V(HM.cx + Math.cos(a) * (HM.r + 0.2), HM_DECK + 0.05, HM.cz + Math.sin(a) * (HM.r + 0.2)), face(Math.cos(a), Math.sin(a)), 3, { cover: 'trench' });
  });

  // The Argyle Battery's gaps, facing north over the gardens.
  {
    const w = ARGYLE, F = K.frame(w);
    const [, vo] = F.local(0, 20);
    const out = vo > 0 ? -1 : 1;
    crenels(w.len).forEach((u, i) => {
      if (i % 4 === 1 || i % 2 === 1) return;
      const [x, z] = F.at(u, out * (w.wid / 2 - 1.4));
      g.place(i === 2 ? 'mg' : i === 6 ? 'at' : 'rifleman', V(x, eavesOf(w) + 0.05, z), face(F.vx * out, F.vz * out), 3, { cover: 'trench' });
    });
  }

  // Snipers on the Palace tower and on the Gatehouse drums.
  const T = K.tower;
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0]]) {
    g.place('sniper', V(T.x + dx * 2.2, T.top + 0.05, T.z + dz * 2.2), face(dx, dz), 3, { cover: 'roof' });
  }
  for (const d of K.drums) {
    g.place('sniper', V(d.x + 0.9, d.top + 0.05, d.z), face(1, 0), 3, { cover: 'roof' });
  }

  // Windows: the ranges on the edge of the rock, each on the side that looks
  // out over it and on a floor that clears what is in front — the Great Hall
  // over the south cliff, the Queen Anne's south end over the Grassmarket
  // clear of the Prison, the Barracks over the Grassmarket, the Hospital over
  // the gardens and the War Museum's west end over the western defences,
  // clear of the Barracks.
  const POSTS = [
    { name: 'Great Hall', dir: [0, 1], floor: 1 },
    { name: 'Queen Anne Building', dir: [-1, 0], floor: 1, from: 0.62 },
    { name: 'New Barracks', dir: [-0.8, 0.6], floor: 1 },
    { name: 'Hospital, north', dir: [0, -1], floor: 1 },
    { name: 'War Museum', dir: [0, 1], floor: 1, to: 0.45 },
  ];
  for (const post of POSTS) {
    const w = K.plan.wings.find((x) => x.name === post.name);
    if (!w) continue;
    const F = K.frame(w);
    const out = F.vx * post.dir[0] + F.vz * post.dir[1] > 0 ? 1 : -1;
    const count = Math.max(2, Math.min(4, Math.floor(w.len / 10)));
    for (let k = 0; k < count; k++) {
      // On a window: they are every 3.6 m along the face from its middle.
      const f0 = post.from ?? 0, f1 = post.to ?? 1;
      const f = f0 + (f1 - f0) * (k + 0.5) / count;
      const u = Math.round((f - 0.5) * (w.len - 6) / 3.6) * 3.6;
      const [x, z] = F.at(u, out * (w.wid / 2 - WALL - 0.6));
      if (inTower(x, z) || Math.hypot(x - T.x, z - T.z) < T.size) continue;
      g.place(k === 1 && post.name === 'New Barracks' ? 'mg' : 'rifleman', V(x, STOREY * post.floor + 0.05, z), face(F.vx * out, F.vz * out), 3, { cover: 'window' });
    }
  }

  // Mortars on Crown Square and in the yard by the Governor's House, dug in.
  for (const k of ['crown1', 'crown2', 'crown3', 'square']) {
    const p = K.plan.points[k];
    g.place('mortar', V(p.x, p.y + 0.3, p.z), 0, 20, { cover: 'ground', emplaced: true, sandbags: true });
  }
}
