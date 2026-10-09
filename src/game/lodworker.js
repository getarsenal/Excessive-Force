/**
 * The far model's arithmetic, off the main thread (units.js `lightModel`).
 *
 * The M777 and the HIMARS are a hundred and sixty thousand triangles and
 * more; welding and simplifying one is half a second of work, which on the
 * page is half a second of frozen battle at the start of every level. Here
 * it costs the frame nothing.
 *
 * In: positions (and colours, for a model painted by vertex), the index
 * if there is one, and the error allowed in the mesh's own units. Out: the
 * welded positions (and colours) and the simplified index.
 */
import { MeshoptSimplifier } from 'meshoptimizer';

/** Weld vertices equal in position (and colour) to four decimals: the simplifier needs the topology. */
function weld(pos, cols, index) {
  const n = pos.length / 3;
  const map = new Map();
  const remap = new Uint32Array(n);
  const P = [], C = [];
  const q = (v) => Math.round(v * 1e4);
  for (let i = 0; i < n; i++) {
    let key = `${q(pos[i * 3])},${q(pos[i * 3 + 1])},${q(pos[i * 3 + 2])}`;
    if (cols) key += `|${q(cols[i * 3])},${q(cols[i * 3 + 1])},${q(cols[i * 3 + 2])}`;
    let j = map.get(key);
    if (j === undefined) {
      j = P.length / 3;
      map.set(key, j);
      P.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      if (cols) C.push(cols[i * 3], cols[i * 3 + 1], cols[i * 3 + 2]);
    }
    remap[i] = j;
  }
  const src = index || Uint32Array.from({ length: n }, (_, i) => i);
  const ix = new Uint32Array(src.length);
  for (let k = 0; k < src.length; k++) ix[k] = remap[src[k]];
  return { pos: new Float32Array(P), cols: cols ? new Float32Array(C) : null, ix };
}

self.onmessage = async (e) => {
  const { id, pos, cols, index, err } = e.data;
  try {
    await MeshoptSimplifier.ready;
    const w = weld(pos, cols, index);
    const idx = w.cols
      ? MeshoptSimplifier.simplifyWithAttributes(w.ix, w.pos, 3, w.cols, 3, [0.5, 0.5, 0.5], null, 0, err, ['ErrorAbsolute', 'Prune'])[0]
      : MeshoptSimplifier.simplify(w.ix, w.pos, 3, 0, err, ['ErrorAbsolute', 'Prune'])[0];
    const out = { id, pos: w.pos, cols: w.cols, idx };
    self.postMessage(out, [w.pos.buffer, idx.buffer].concat(w.cols ? [w.cols.buffer] : []));
  } catch (x) {
    self.postMessage({ id, error: String(x) });
  }
};
