import * as THREE from 'three';

/**
 * A gun's barrel, cut out of its model so it can be laid and can recoil.
 *
 * The guns are loaded as one baked mesh a material (`flattenModel`), which
 * left every barrel frozen at whatever elevation the model was built at (the
 * M119 at twenty-nine degrees, the M777 at fourteen, the M109 level) while
 * its shells went out at whatever the solution said, from a hand-set point
 * that missed the barrel's end by up to a metre and a half. Here the barrel
 * is found in the model itself and given its own pivot:
 *
 *   the tip     the centre of the most forward metal above the hull's
 *               lower quarter (a barrel, not a bumper), or near `tipY`
 *   the axis    the elevation, of every degree from -10 to 75, along which
 *               the most of the model's surface (by area) lies within the
 *               tube's radius behind the tip, or `elev` if the gun says;
 *               it is also the rest elevation
 *   the pivot   `len` metres back along the axis: the trunnions
 *   the tube    every triangle all of whose corners lie within `r` of the
 *               axis (or a line `down` under it, for a cradle that hangs
 *               below the tube) between `back` behind the pivot and the tip
 *               (`rb` over the last `brake` metres, for the muzzle brake)
 *
 * The tube's triangles are moved into a group named `barrel` at the pivot,
 * the rest stay where they were. A clone of the model (every gun of a type)
 * shares the geometry and carries its own barrel to turn. The measures ride
 * on the wrapper's `userData.barrel` as plain numbers, in the wrapper's
 * frame: `pivot`, `axis`, `right` (the elevation axis), `tip` (from the
 * pivot), `rest` (radians), and the spec.
 *
 * Positions are in the wrapper's frame; `modelYaw` is how the unit turns the
 * wrapper inside its group, so "forward" here is the unit's forward.
 */
export function splitBarrel(wrapper, spec, modelYaw = 0) {
  wrapper.updateMatrixWorld(true);
  const toUnit = new THREE.Matrix4().makeRotationY(modelYaw);
  const toWrap = new THREE.Matrix4().makeRotationY(-modelYaw);
  // Every mesh's geometry in the wrapper's frame, non-indexed.
  const meshes = [];
  wrapper.traverse((o) => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    meshes.push({ src: o, g });
  });
  if (!meshes.length) return null;
  // Points in the unit's frame (forward +z), for the measures.
  const v = new THREE.Vector3();
  const pts = [];
  for (const { g } of meshes) {
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(toUnit); pts.push(v.x, v.y, v.z); }
  }
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 3) { minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
  // The tip: the most forward metal near the tip's height if the gun says
  // where that is (`tipY`, metres over the ground: a cage of slat armour or
  // a bumper can stand further forward than the muzzle), else above the
  // hull's lower quarter.
  const okY = spec.tipY != null
    ? (y) => Math.abs(y - minY - spec.tipY) < (spec.tipTol ?? 0.45)
    : (y) => y > minY + (maxY - minY) * 0.25;
  const tip = new THREE.Vector3();
  if (spec.tip) tip.fromArray(spec.tip);   // a launcher's face, measured, where no rule finds it
  else {
    let fz = -Infinity;
    for (let i = 0; i < pts.length; i += 3) if (okY(pts[i + 1])) fz = Math.max(fz, pts[i + 2]);
    let n = 0;
    for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] > fz - 0.2 && okY(pts[i + 1])) { tip.x += pts[i]; tip.y += pts[i + 1]; tip.z += pts[i + 2]; n++; }
    if (!n) return null;
    tip.multiplyScalar(1 / n);
  }
  // The axis: of every elevation from ten below to seventy-five above, the
  // line back from the tip that the most of the model's surface lies along,
  // within the tube's radius, from half a metre to most of the barrel's
  // length back. Weighted by area, not by vertex: a tube is a few long faces
  // and a sight is a hundred small ones.
  const tris = [];
  for (const { g } of meshes) {
    const a = g.attributes.position;
    const A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i + 2 < a.count; i += 3) {
      A.fromBufferAttribute(a, i).applyMatrix4(toUnit); Bv.fromBufferAttribute(a, i + 1).applyMatrix4(toUnit); C.fromBufferAttribute(a, i + 2).applyMatrix4(toUnit);
      const area = e1.subVectors(Bv, A).cross(e2.subVectors(C, A)).length() / 2;
      if (area < 1e-5) continue;
      tris.push((A.x + Bv.x + C.x) / 3, (A.y + Bv.y + C.y) / 3, (A.z + Bv.z + C.z) / 3, area);
    }
  }
  let slope = 0, best = -1;
  const rq = (spec.r * 1.25) ** 2, tMax = Math.max(1.2, (spec.len ?? spec.region?.pivotT ?? 4) * 0.85);
  const lo = spec.elev != null ? spec.elev : -10, hi = spec.elev != null ? spec.elev : 75;
  for (let deg = lo; deg <= hi; deg += 1) {
    const e = deg * Math.PI / 180, ay = Math.sin(e), az = Math.cos(e);
    let c = 0;
    for (let i = 0; i < tris.length; i += 4) {
      const dx = tris[i] - tip.x, dy = tris[i + 1] - tip.y, dz = tris[i + 2] - tip.z;
      const t = -(dy * ay + dz * az);
      if (t < 0.4 || t > tMax) continue;
      if (dx * dx + dy * dy + dz * dz - t * t < rq) c += tris[i + 3];
    }
    if (c > best) { best = c; slope = Math.tan(e); }
  }
  const axisU = new THREE.Vector3(0, slope, 1).normalize();
  // The trunnions: `len` back along the line, or, for a gun that says where
  // its parts meet the carriage (`region`), that far back and that far under.
  const upU = new THREE.Vector3(0, axisU.z, -axisU.y);
  const R = spec.region;
  const pivotU = R
    ? tip.clone().addScaledVector(axisU, -R.pivotT).addScaledVector(upU, R.pivotU)
    : tip.clone().addScaledVector(axisU, -spec.len);
  // Into the wrapper's frame.
  const pivot = pivotU.clone().applyMatrix4(toWrap);
  const axis = axisU.clone().applyMatrix4(toWrap).normalize();
  const tipW = tip.clone().applyMatrix4(toWrap);
  const right = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
  // The tube's triangles.
  const r2 = spec.r * spec.r, rb2 = (spec.rb ?? spec.r) * (spec.rb ?? spec.r);
  const brakeFrom = (spec.len ?? 0) - (spec.brake ?? 0.7);
  const d = new THREE.Vector3();
  // The cut's centre line can sit `down` below the barrel's own axis, square
  // to it: a gun whose cradle and recoil cylinders hang under the tube (the
  // M777) elevates them together.
  const up = new THREE.Vector3().crossVectors(right, axis).normalize();
  const c0 = pivot.clone().addScaledVector(up, -(spec.down ?? 0));
  const upW = upU.clone().applyMatrix4(toWrap).normalize();
  // A band round the line instead of a tube (`region`): from the muzzle back
  // to the trunnions, no higher than `top` over the line and no lower than a
  // floor that falls from `lo[0]` to `lo[1]` (metres back, metres under),
  // and no wider than `side` either way; for a cradle whose tubes run down
  // and back to the carriage, as the M777's do.
  const inRegion = R && ((x, y, z) => {
    d.set(x - tipW.x, y - tipW.y, z - tipW.z);
    const t = -d.dot(axis), u = d.dot(upW), sd = Math.abs(d.dot(right));
    if (t < -0.4 || t > (R.tMax ?? R.pivotT + 0.15) || sd > R.side || u > R.top) return false;
    const [[t0, u0], [t1, u1]] = R.lo;
    const k = THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1);
    return u > u0 + (u1 - u0) * k;
  });
  const inTube = inRegion || ((x, y, z) => {
    d.set(x - c0.x, y - c0.y, z - c0.z);
    const t = d.dot(axis);
    if (t < -(spec.back ?? 0.5) || t > spec.len + 0.4) return false;
    const rr = d.lengthSq() - t * t;
    return rr < (t > brakeFrom ? rb2 : r2);
  });
  const barrel = new THREE.Group();
  barrel.name = 'barrel';
  barrel.position.copy(pivot);
  const hull = new THREE.Group();
  hull.name = 'hull';
  // The tube alone runs back on the recoil when the gun has a mantlet that
  // does not (`region.recoilTo`: metres back from the muzzle where the tube
  // goes into it): those triangles hang on a child of the barrel, `tube`.
  const recoilTo = R?.recoilTo;
  const tube = recoilTo != null ? new THREE.Group() : null;
  if (tube) { tube.name = 'tube'; barrel.add(tube); }
  const tOf = (x, y, z) => -((x - tipW.x) * axis.x + (y - tipW.y) * axis.y + (z - tipW.z) * axis.z);
  let cut = 0;
  for (const { src, g } of meshes) {
    const pos = g.attributes.position;
    const tri = pos.count / 3;
    // 0 the hull, 1 the barrel, 2 the tube that recoils within it.
    const keepB = new Uint8Array(tri);
    let nb = 0;
    for (let t = 0; t < tri; t++) {
      let all = true, back = -Infinity;
      for (let k = 0; k < 3 && all; k++) { const i = t * 3 + k; all = inTube(pos.getX(i), pos.getY(i), pos.getZ(i)); back = Math.max(back, tOf(pos.getX(i), pos.getY(i), pos.getZ(i))); }
      if (all) { keepB[t] = tube && back < recoilTo ? 2 : 1; nb++; }
    }
    cut += nb;
    const part = (want, shift) => {
      let count = 0;
      for (let t = 0; t < tri; t++) if (keepB[t] === want) count += 3;
      if (!count) return null;
      const out = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const s = attr.itemSize, arr = new attr.array.constructor(count * s);
        let w = 0;
        for (let t = 0; t < tri; t++) {
          if (keepB[t] !== want) continue;
          for (let k = 0; k < 3; k++) { const i = t * 3 + k; for (let c = 0; c < s; c++) arr[w++] = attr.array[i * s + c]; }
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, s, attr.normalized));
      }
      if (shift) out.translate(-pivot.x, -pivot.y, -pivot.z);
      out.computeBoundingSphere();
      const m = new THREE.Mesh(out, src.material);
      m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow;
      return m;
    };
    const h = part(0, false); if (h) hull.add(h);
    const bm = part(1, true); if (bm) barrel.add(bm);
    const tm = tube && part(2, true); if (tm) tube.add(tm);
  }
  if (!cut) return null;
  // The model is rebuilt as the hull and the barrel on its pivot.
  const keep = wrapper.children.slice();
  for (const c of keep) wrapper.remove(c);
  wrapper.add(hull);
  wrapper.add(barrel);
  const rest = Math.atan(slope);
  wrapper.userData.barrel = {
    pivot: pivot.toArray(), axis: axis.toArray(), right: right.toArray(),
    tip: tipW.clone().sub(pivot).toArray(), rest, cut,
    recoil: spec.recoil ?? 0.6, min: spec.min ?? -0.05, max: spec.max ?? 1.2,
    // Where it settles with nothing to shoot at, and a launcher's cells.
    ready: spec.ready ?? THREE.MathUtils.clamp(0.12, spec.min ?? -0.05, spec.max ?? 1.2), cells: spec.cells || null,
  };
  return wrapper.userData.barrel;
}

const _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _t = new THREE.Vector3(), _ax = new THREE.Vector3();

/**
 * Lay a barrel group at `elev` (radians) and `recoil` metres back along its
 * own axis: the whole of it, or only its `tube` when it has a mantlet that
 * stays put.
 */
export function poseBarrel(barrel, B, elev, recoil = 0) {
  _a.fromArray(B.right);
  const dE = THREE.MathUtils.clamp(elev, B.min, B.max) - B.rest;
  barrel.quaternion.setFromAxisAngle(_a, dE);
  barrel.position.fromArray(B.pivot);
  const tube = barrel.userData.tube || (barrel.userData.tube = barrel.getObjectByName('tube') || null);
  if (tube) { tube.position.fromArray(B.axis).multiplyScalar(-recoil); return; }
  if (recoil) { _ax.fromArray(B.axis).applyQuaternion(barrel.quaternion); barrel.position.addScaledVector(_ax, -recoil); }
}

/** The tip of a barrel at `elev`, in the wrapper's frame, into `out`. */
export function barrelTip(B, elev, out = new THREE.Vector3()) {
  _a.fromArray(B.right);
  _q.setFromAxisAngle(_a, THREE.MathUtils.clamp(elev, B.min, B.max) - B.rest);
  return out.fromArray(B.tip).applyQuaternion(_q).add(_t.fromArray(B.pivot));
}
