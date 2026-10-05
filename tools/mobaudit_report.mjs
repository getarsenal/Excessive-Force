// Tabulate /tmp/out/mobaudit/summary.json from mobaudit_run.mjs.
//   node tools/mobaudit_report.mjs            -> markdown on stdout
import fs from 'node:fs';
const S = JSON.parse(fs.readFileSync('/tmp/out/mobaudit/summary.json', 'utf8'));
const SCREENS = ['title', 'door', 'list', 'list-scrolled', 'dossier', 'hud-idle', 'drawer-units', 'drawer-strikes', 'drawer-orders', 'cards', 'cards2', 'rotated', 'rotated-back', 'pause', 'pause-settings', 'endcard', 'endcard-more'];
const fmt = (b) => b ? `${b.w}x${b.h}@${b.x},${b.y}` : '';
const uniq = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); if (!m.has(k)) m.set(k, x); } return [...m.values()]; };

console.log('## Findings per viewport\n');
console.log('| viewport | screens | small targets (<44) | interactive overlaps | panel overlaps | clipped | safe-area | text <11px | hscroll |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [vp, rec] of Object.entries(S)) {
  let small = [], iov = [], pov = [], clip = [], safe = [], txt = 0, n = 0, hs = false;
  for (const sc of SCREENS) {
    const a = rec[sc]; if (!a || a.error) continue; n++;
    small.push(...a.small.map((x) => ({ ...x, sc }))); iov.push(...a.ioverlaps.map((x) => ({ ...x, sc }))); pov.push(...a.poverlaps.map((x) => ({ ...x, sc })));
    clip.push(...a.clipped.map((x) => ({ ...x, sc }))); safe.push(...a.safe.map((x) => ({ ...x, sc }))); txt = Math.max(txt, a.counts.smallText);
    if (a.hscroll?.doc) hs = true;
  }
  const us = uniq(small, (x) => x.sel.replace(/ ".*"$/, '')), uc = uniq(clip, (x) => x.sel.replace(/ ".*"$/, '')), usf = uniq(safe, (x) => x.sel.replace(/ ".*"$/, ''));
  const ui = uniq(iov, (x) => x.a.replace(/ ".*"$/, '') + '|' + x.b.replace(/ ".*"$/, '')), up = uniq(pov, (x) => x.a + '|' + x.b);
  console.log(`| ${vp} | ${n} | ${us.length} distinct (${small.length} hits) | ${ui.length} | ${up.length} | ${uc.length} | ${usf.length} | ${txt} max/screen | ${hs ? 'YES' : 'no'} |`);
}

for (const [vp, rec] of Object.entries(S)) {
  console.log(`\n### ${vp}\n`);
  if (rec.error) console.log(`RUN ERROR: ${rec.error}\n`);
  const rows = [];
  for (const sc of SCREENS) {
    const a = rec[sc]; if (!a || a.error) continue;
    for (const x of a.small) rows.push(['small', sc, x.sel, fmt(x.box)]);
    for (const x of a.safe) rows.push([`safe:${x.zone}`, sc, x.sel, fmt(x.box)]);
    for (const x of a.clipped) rows.push([x.offscreen ? 'offscreen' : 'clipped', sc, x.sel, fmt(x.box)]);
    for (const x of a.ioverlaps) rows.push(['overlap', sc, `${x.a} × ${x.b}`, `${x.area}px² ${fmt(x.boxA)} / ${fmt(x.boxB)}`]);
    for (const x of a.poverlaps) rows.push(['panel-overlap', sc, `${x.a} × ${x.b}`, `${x.area}px² ${fmt(x.boxA)} / ${fmt(x.boxB)}`]);
  }
  const seen = new Set();
  console.log('| kind | screen | selector | box |');
  console.log('|---|---|---|---|');
  for (const r of rows) { const k = r[0] + r[2].replace(/ ".*?"/g, ''); if (seen.has(k)) continue; seen.add(k); console.log(`| ${r.join(' | ')} |`); }
  // Text.
  const t = new Map();
  for (const sc of SCREENS) for (const x of (rec[sc]?.small_text || [])) { const k = x.sel.replace(/ ".*"$/, ''); if (!t.has(k) || t.get(k).px > x.px) t.set(k, { ...x, sc }); }
  console.log(`\nText under 11px (${t.size} distinct): ` + [...t.values()].sort((a, b) => a.px - b.px).map((x) => `${x.sel.replace(/ ".*"$/, '')} ${x.px}px`).join('; '));
  // Measures.
  const idle = rec['hud-idle'], cards = rec.cards2 || rec.cards, du = rec['drawer-units'], ds = rec['drawer-strikes'], dor = rec['drawer-orders'], ec = rec.endcard, rot = rec.rotated, rb = rec['rotated-back'];
  if (idle?.tb) console.log(`\nTop bar: ${idle.tb.rows}px tall; fonts value ${idle.tb['.tb-value']} label ${idle.tb['.tb-label']} name ${idle.tb['.tb-target-name']} sub ${idle.tb['.tb-sub']} objectives ${idle.tb['.objectives']} pct ${idle.tb['.integrity-pct']}; name truncated ${idle.tb.nameTruncated}`);
  if (idle?.dockTarget) { const d = idle.dockTarget; console.log(`Dock: ${d.btn.length} buttons ${d.btn.map(fmt).join(' ')} gap-to-bottom ${d.dockBottomGap}px; target base ${d.pts[0].x},${d.pts[0].y} underDock=${d.pts[0].underDock} mid underDock=${d.pts[1].underDock}`); }
  for (const [n, d] of [['units', du], ['strikes', ds], ['orders', dor]]) { const x = d?.drawers?.[`drawer-${n}`]; if (x) console.log(`Drawer ${n}: ${fmt(x.box)} offBottom ${x.offBottom} overDock ${x.overDock}px² cards ${x.cards} card ${x.cardW}x${x.cardH} bar ${x.barClientW}/${x.barScrollW} overflows=${x.barOverflows}; target base underDrawer=${d.dockTarget?.pts[0].underDrawer} mid=${d.dockTarget?.pts[1].underDrawer}`); else console.log(`Drawer ${n}: NOT MEASURED`); }
  if (cards?.vsDock) for (const [k, v] of Object.entries(cards.vsDock)) console.log(`${k}: ${fmt(v.box)} overDock ${v.overDock}px² overDrawer ${v.overDrawer}px² off L/R/T/B ${v.offLeft}/${v.offRight}/${v.offTop}/${v.offBottom}`);
  if (cards?.placed) console.log(`unit placed: ${JSON.stringify(cards.placed)}`);
  if (ec?.endcard) console.log(`End card NEXT: ${fmt(ec.endcard.next)} inThumbReach(bottom 40%)=${ec.endcard.inThumbReach} scrollOverflows=${ec.endcard.scrollOverflows} (${ec.endcard.scrollH}/${ec.endcard.scrollClient})`);
  if (rot?.canvas) console.log(`Rotation: before ${JSON.stringify(rot.before)} -> rotated canvas ${rot.canvas.bufW}x${rot.canvas.bufH} css ${rot.canvas.cssW}x${rot.canvas.cssH} inner ${rot.canvas.inner} aspect ${rot.canvas.aspect?.toFixed(3)}; back ${rb?.canvas?.bufW}x${rb?.canvas?.bufH} css ${rb?.canvas?.cssW}x${rb?.canvas?.cssH}; rotated counts ${JSON.stringify(rot.counts)}; rotated tb ${JSON.stringify(rot.tb)}`);
  if (rot?.vsDock) for (const [k, v] of Object.entries(rot.vsDock)) console.log(`  rotated ${k}: ${fmt(v.box)} overDock ${v.overDock} overDrawer ${v.overDrawer}`);
  if (rot?.dockTarget) console.log(`  rotated dock: ${rot.dockTarget.btn.map(fmt).join(' ')} target base ${rot.dockTarget.pts[0].x},${rot.dockTarget.pts[0].y} underDock=${rot.dockTarget.pts[0].underDock}`);
  if (idle?.canvas) console.log(`Canvas idle: buf ${idle.canvas.bufW}x${idle.canvas.bufH} css ${idle.canvas.cssW}x${idle.canvas.cssH} dpr ${idle.canvas.dpr} pr ${idle.canvas.pr}`);
  const hs = SCREENS.filter((sc) => rec[sc]?.hscroll?.doc); if (hs.length) console.log(`HORIZONTAL SCROLL on: ${hs.join(', ')}`);
  console.log(`page errors: ${rec.errors?.length || 0} ${rec.errors?.slice(0, 2).join(' | ') || ''}`);
}
console.log('\n## Screenshots\n');
for (const f of fs.readdirSync('/tmp/out/mobaudit').filter((f) => f.endsWith('.png') && !f.startsWith('_')).sort()) console.log(`/tmp/out/mobaudit/${f}`);
