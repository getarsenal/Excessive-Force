// Is this level wired? Every table and file a map touches, checked for its
// entry, so that a level which loads and plays is not shipped without a
// contract on the campaign map or with a portrait path that has a typo.
//
//   node tools/mapcheck.mjs <id> [<id>...]      (no ids: every level in LEVEL_ORDER)
//
// It judges connection, not quality: whether the map exists everywhere it
// has to, not whether it is any good. Exit 1 if anything is missing.
import { existsSync, readFileSync } from 'node:fs';
import { LEVELS, LEVEL_ORDER, LEVEL_BLURB } from '../src/game/levels.js';
import { THEATRES } from '../src/game/campaign.js';
import { CAST, DEFENDER_OF, STANDOFF } from '../src/game/cast.js';
import { FLAG_SITES } from '../src/world/flags.js';
import { UNITS_BY_ID } from '../src/game/units.js';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : LEVEL_ORDER;
const world = JSON.parse(readFileSync('public/assets/world.json', 'utf8'));
const isos = new Set(world.map((w) => w.i));
const bakePy = readFileSync('tools/bake_terrain.py', 'utf8');
const overPy = readFileSync('tools/bake_overture.py', 'utf8');
const wildCover = (overPy.match(/WILD_COVER\s*=\s*\{([^}]*)\}/) || [, ''])[1];
let bad = 0;

for (const id of ids) {
  const miss = [];
  const warn = [];
  const need = (ok, what) => { if (!ok) miss.push(what); };
  const note = (ok, what) => { if (!ok) warn.push(what); };

  const lv = LEVELS[id];
  need(lv, 'LEVELS entry (src/game/levels.js)');
  need(LEVEL_ORDER.includes(id), 'in LEVEL_ORDER');
  need(LEVEL_BLURB[id], 'LEVEL_BLURB line');
  if (lv) {
    for (const k of ['name', 'place', 'target', 'subtitle', 'victory', 'brief', 'camera', 'structures', 'garrison', 'precinct', 'cityExcludeRadius']) {
      need(lv[k] != null, `level record field \`${k}\``);
    }
    note(lv.palette || lv.terrain === 'westminster' || lv.terrain === 'paris', 'no `palette` (London ground)');
    const structs = typeof lv.structures === 'function' ? null : lv.structures;
    if (structs) need(structs.some((s) => s.primary), 'a primary structure');
  }

  // The ground and the town.
  const terrain = (lv && lv.terrain) || id;
  for (const f of [`${terrain}_height.png`, `${terrain}_mask.png`, `${terrain}_far.png`, `${terrain}.json`]) {
    need(existsSync(`public/assets/terrain/${f}`), `public/assets/terrain/${f}`);
  }
  need(existsSync(`public/assets/city/${terrain}.json`), `public/assets/city/${terrain}.json (Overture bake)`);
  need(new RegExp(`^\\s{4}"${terrain}":\\s*\\{`, 'm').test(bakePy), `tools/bake_terrain.py LEVELS["${terrain}"]`);
  if (existsSync(`public/assets/terrain/${terrain}.json`)) {
    const meta = JSON.parse(readFileSync(`public/assets/terrain/${terrain}.json`, 'utf8'));
    need(meta.farSpan, 'terrain json has farSpan (re-run bake_overture)');
    note(!(meta.coastline && meta.farWater === 0), 'coastal bake with 0% far water');
  }
  if (lv && lv.setting && (lv.setting.hinterland === 'forest' || lv.setting.hinterland === 'jungle')) {
    note(wildCover.includes(`"${terrain}"`), `hinterland is ${lv.setting.hinterland} but not in bake_overture WILD_COVER`);
  }

  // The contract.
  const t = THEATRES.find((k) => k.id === id);
  need(t, 'THEATRES contract (src/game/campaign.js)');
  if (t) {
    for (const k of ['iso', 'city', 'lon', 'lat', 'no', 'title', 'brief', 'unlocks', 'unlockLine']) {
      need(t[k] != null, `contract field \`${k}\``);
    }
    need(isos.has(t.iso), `iso ${t.iso} in public/assets/world.json`);
    need(t.no === LEVEL_ORDER.indexOf(id) + 1, `contract no ${t.no} = LEVEL_ORDER position ${LEVEL_ORDER.indexOf(id) + 1}`);
    for (const u of t.unlocks || []) need(UNITS_BY_ID[u], `unlock unit '${u}' exists`);
    if (lv) {
      const dLon = Math.abs(t.lon - (lv.lon ?? t.lon)), dLat = Math.abs(t.lat - (lv.lat ?? t.lat));
      note(dLon < 0.05 && dLat < 0.05, 'contract lon/lat differ from the level');
    }
  }

  // The officer and the words.
  const who = DEFENDER_OF[id];
  need(who, 'DEFENDER_OF entry');
  const c = who && CAST[who];
  if (who) need(c, `CAST.${who}`);
  if (c) {
    need(existsSync(`public/${c.file}`), `portrait ${c.file}`);
    need(Array.isArray(c.colours) && c.colours.length === 3, 'three flag colours');
    need(c.rank && c.name && c.nation, 'rank, name, nation');
  }
  const so = STANDOFF[id];
  need(so && so.length >= 3, 'STANDOFF script (3 beats)');
  if (so) {
    need(so[0].who === 'us' && so[so.length - 1].who === 'us', 'stand-off opens and closes with the US');
    note(so.every((l) => l.line.length <= 110), 'a stand-off line over 110 characters');
  }
  need(existsSync('docs/SCRIPTS.md') && readFileSync('docs/SCRIPTS.md', 'utf8').includes(`\`${id}\``), 'docs/SCRIPTS.md section');

  // The flag and the photograph.
  need(FLAG_SITES[id] && FLAG_SITES[id].length, 'FLAG_SITES entry');
  need(existsSync(`public/assets/recon/${id}.jpg`), `public/assets/recon/${id}.jpg (node tools/recon.mjs ${id})`);

  const ok = miss.length === 0;
  if (!ok) bad++;
  console.log(`${id.padEnd(12)} ${ok ? 'wired' : `MISSING ${miss.length}`}${warn.length ? `  (${warn.length} note${warn.length > 1 ? 's' : ''})` : ''}`);
  for (const m of miss) console.log(`    - ${m}`);
  for (const w of warn) console.log(`    ~ ${w}`);
}
process.exit(bad ? 1 : 0);
