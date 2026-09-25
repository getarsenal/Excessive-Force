// Is the water right? Every level's sheet, bed, mask and boats, measured.
//
//   node tools/wateraudit.mjs <id> [<id>...]        (dev server on 5177; TT_PORT to change)
//
// For each level, against the live game:
//   poke      share of wet cells whose bed stands above the water surface — must be 0
//   pits      dry cells inside the playfield more than a metre below the surface
//   comps     wet bodies over half a hectare, and how many reach the map edge
//   specks    wet bodies under half a hectare (mask noise)
//   plots     buildings whose centre is on water (wharves excluded)
//   boats     positions over 24 half-second steps that are mask-dry, on ground
//             above the waterline, or inside a building — all must be 0
//
// This is the probe that found the Klang's sampans sitting on mud a metre and
// a half above the sheet, and that the low tier's coarsen was undoing the fix.
// Run it on a new map before trusting its water, and after any change to
// terrain.js, the bake or the boat router.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
for (const lvl of process.argv.slice(2)) {
  const page = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('tt.quality', 'low'); localStorage.setItem('tt.autostart', '1');
      localStorage.setItem('tt.intros', '0'); localStorage.setItem('tt.opening', '0'); localStorage.setItem('tt.suite', '1');
    } catch {}
  });
  try {
    await page.goto(`http://localhost:${process.env.TT_PORT || 5177}/?level=${lvl}`, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 400000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const c = window.testMenu.ctx, t = c.terrain, n = t.size, span = t.span, wl = t.waterLevel;
      const cell = 2 * span / (n - 1);
      const out = { waterLevel: +wl.toFixed(2), hasWater: t.hasWater, openSea: !!t.openSea };
      // 1. Land poking through the sheet / pits below the waterline.
      let wet = 0, poke = 0, pits = 0; const pokeAt = [], pitAt = [];
      for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
        const i = v * n + u, w = t.mask[i * 3] > 0.5, h = t.heights[i];
        const x = -span + u * cell, z = span - v * cell;
        if (w) { wet++; if (h > wl + 0.4) { poke++; if (pokeAt.length < 3) pokeAt.push([x | 0, z | 0, +(h - wl).toFixed(1)]); } }
        else if (h < wl - 1.0 && Math.hypot(x, z) < span * 0.95) { pits++; if (pitAt.length < 3) pitAt.push([x | 0, z | 0, +(wl - h).toFixed(1)]); }
      }
      out.wetPct = +(100 * wet / (n * n)).toFixed(1);
      out.pokePct = wet ? +(100 * poke / wet).toFixed(2) : 0; out.pokeAt = pokeAt;
      out.pitCells = pits; out.pitAt = pitAt;
      // 2. The sheet: one flat level?
      const ys = [];
      c.water?.traverse?.((o) => { if (o.isMesh && o.geometry?.attributes?.position) { const a = o.geometry.attributes.position.array; for (let k = 1; k < a.length; k += 3 * 97) ys.push(a[k] + (o.position?.y || 0)); } });
      if (c.water?.isMesh && !ys.length) { const a = c.water.geometry.attributes.position.array; for (let k = 1; k < a.length; k += 3 * 97) ys.push(a[k] + c.water.position.y); }
      if (ys.length) out.sheetY = [+Math.min(...ys).toFixed(2), +Math.max(...ys).toFixed(2)];
      // 3. Connected wet components in the playfield; does the biggest reach the edge?
      const seen = new Uint8Array(n * n); const comps = [];
      for (let s = 0; s < n * n; s++) {
        if (seen[s] || t.mask[s * 3] <= 0.5) continue;
        let size = 0, edge = false; const st = [s]; seen[s] = 1;
        while (st.length) { const i = st.pop(); size++; const v = (i / n) | 0, u = i % n;
          if (u === 0 || v === 0 || u === n - 1 || v === n - 1) edge = true;
          for (const [du, dv] of [[1,0],[-1,0],[0,1],[0,-1]]) { const uu = u + du, vv = v + dv; if (uu < 0 || vv < 0 || uu >= n || vv >= n) continue; const j = vv * n + uu; if (!seen[j] && t.mask[j * 3] > 0.5) { seen[j] = 1; st.push(j); } } }
        comps.push({ ha: +(size * cell * cell / 1e4).toFixed(1), edge });
      }
      comps.sort((a, b) => b.ha - a.ha);
      out.components = comps.filter((k) => k.ha >= 0.5).slice(0, 6);
      out.islandsUnder0_5ha = comps.filter((k) => k.ha < 0.5).length;
      // 4. Buildings whose centre is on water.
      const plots = c.cityGroup?.userData?.plots || [];
      const inPlot = (x, z) => plots.some((p) => {
        if (p.pts) { let inside = false; const P = p.pts; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const xi = P[i][0] ?? P[i].x, zi = P[i][1] ?? P[i].z, xj = P[j][0] ?? P[j].x, zj = P[j][1] ?? P[j].z; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside; } return inside; }
        const cx = p.x ?? p.cx, cz = p.z ?? p.cz, w = p.w, d = p.d; if (cx == null || w == null) return false;
        const a = -(p.yaw ?? p.rot ?? 0), dx = x - cx, dz = z - cz; const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
        return Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2; });
      let onWater = 0; const onWaterAt = [];
      for (const p of plots) { if (p.wharf) continue; const cx = p.x ?? p.cx, cz = p.z ?? p.cz; if (cx == null) continue; if (t.isWater(cx, cz)) { onWater++; if (onWaterAt.length < 3) onWaterAt.push([cx | 0, cz | 0]); } }
      out.plots = plots.length; out.plotsOnWater = onWater; out.plotsOnWaterAt = onWaterAt;
      // 5. Boats: mask-dry, ground above the waterline, or inside a building.
      const life = c.life; if (life?.boats) {
        let seenB = 0, dryMask = 0, highGround = 0, inBuilding = 0; const bad = [];
        for (let step = 0; step < 24; step++) { life.update(0.5);
          for (const bm of life.boats.meshes.values()) { const a = bm.instanceMatrix.array;
            for (let i = 0; i < bm.count; i++) { const o = i * 16; if (a[o] === 0) continue; seenB++;
              const x = a[o + 12], z = a[o + 14]; const k = bm.name.replace('craft-', '');
              if (!t.isWater(x, z)) { dryMask++; if (bad.length < 4) bad.push(['mask', k, x | 0, z | 0]); }
              else if (t.heightAt(x, z) > wl - 0.3) { highGround++; if (bad.length < 4) bad.push(['ground', k, x | 0, z | 0, +(t.heightAt(x, z) - wl).toFixed(1)]); }
              else if (inPlot(x, z)) { inBuilding++; if (bad.length < 4) bad.push(['building', k, x | 0, z | 0]); } } } }
        out.boats = { n: life.boats.boats.length, seen: seenB, dryMask, highGround, inBuilding, bad };
      } else out.boats = null;
      return out;
    });
    console.log(lvl.padEnd(12), JSON.stringify(r), errs.length ? `ERR ${errs[0]}` : '');
  } catch (e) { console.log(lvl.padEnd(12), 'FAILED', String(e).slice(0, 120)); }
  await page.close();
}
await b.close();
