// Scaffold a level: every stub in every table, so mapcheck's list is short.
//
//   node tools/newmap.mjs <id> "<Landmark>, <City>" <lat> <lon> --iso XXX --city CITY \
//        --nation "Nation" --code xx [--template potala] [--wild]
//
// A level touches eleven places — the terrain bake table, a landmark module,
// the level record, the campaign contract, the officer, the stand-off script,
// the flag, the blurb, the running order, the fleet, the portrait manifest —
// and the only tool that knew all eleven was `mapcheck`, which tells you
// afterwards what you forgot. This is its inverse: it writes a marked stub
// into each, then runs mapcheck so the list that remains is the real work —
// the bakes, the masonry, the words, the picture.
//
// Everything it writes is marked `TODO(<id>)` where a human number or a line
// of prose is wanted. It does not bake, build or invent; it wires.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--wild'].includes(argv[i - 1])));
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const [id, fullName, latS, lonS] = pos;
if (!id || !fullName || !latS || !lonS || !/^[a-z][a-z0-9]*$/.test(id)) {
  console.error('usage: node tools/newmap.mjs <id> "<Landmark>, <City>" <lat> <lon> --iso XXX --city CITY --nation "Nation" --code xx [--template potala] [--wild]');
  process.exit(2);
}
const lat = Number(latS), lon = Number(lonS);
const iso = opt('iso', 'XXX'), city = opt('city', 'CITY').toUpperCase(), nation = opt('nation', 'Nation');
const code = opt('code', id.slice(0, 2)), template = opt('template', 'potala');
const wild = argv.includes('--wild');
const [landmark, town] = fullName.split(',').map((s) => s.trim());
const Cap = id[0].toUpperCase() + id.slice(1);
const CONST = id.toUpperCase();

const edits = [];
const patch = (file, fn) => {
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`no anchor found in ${file}`);
  writeFileSync(file, after);
  edits.push(file);
};
const insertBefore = (src, anchor, text, after = 0) => {
  const at = src.indexOf(anchor, after);
  if (at < 0) throw new Error(`anchor not found: ${anchor.slice(0, 40)}`);
  return src.slice(0, at) + text + src.slice(at);
};
const closerAfter = (src, start, closer) => {
  const s = src.indexOf(start);
  if (s < 0) throw new Error(`start not found: ${start}`);
  const c = src.indexOf(`\n${closer}`, s);
  if (c < 0) throw new Error(`closer not found after ${start}`);
  return c + 1;
};
const guard = (file, needle) => {
  if (readFileSync(file, 'utf8').includes(needle)) { console.error(`${file} already has ${needle}; refusing to scaffold twice`); process.exit(1); }
};
guard('src/game/levels.js', `  ${id}: {`);
guard('tools/bake_terrain.py', `"${id}":`);

// 1. The ground: tools/bake_terrain.py
patch('tools/bake_terrain.py', (s) => {
  const at = closerAfter(s, 'LEVELS = {', '}');
  return s.slice(0, at) + `    "${id}": {
        "name": "${landmark}, ${town}",
        "lat": ${lat},
        "lon": ${lon},
        "span": 900.0,               # TODO(${id}) half-width; the town should reach the edge
        "zoom": 14,
        # TODO(${id}) one of: "river": {...} | "sea": {...} | nothing. And "peak" for a
        # summit, with "top" the size of the REAL summit (run tools/survey.py first).
        "parks": [],
    },
` + s.slice(at);
});
if (wild) patch('tools/bake_overture.py', (s) => s.replace(/WILD_COVER = \{([^}]*)\}/, (m, inner) => `WILD_COVER = {${inner.trim()}, "${id}"}`));

// 2. The masonry: a module with the standard shape.
const modPath = `src/structure/landmarks/${id}.js`;
if (!existsSync(modPath)) {
  writeFileSync(modPath, `import * as THREE from 'three';
import { BlockList, JOINT, MATERIALS as M } from '../builder.js';

/**
 * ${landmark}, ${town}.
 *
 * TODO(${id}) Reference figures, with sources: plan from tools/survey.py, elevation
 * from photographs. Then the proportion table (docs/maps/${id}.md) before a number
 * below is typed.
 *
 * What kind of problem it is (cantilever / lattice / shell / mountain), and
 * the twist the player has to find: TODO(${id})
 */

// Scale above life, chosen before the constants; everything derives from it.
const S = 1.0;                       // TODO(${id})
const STONE_FINENESS = 2.0;
// One batter for every face if this stands on a hill; metres in per metre up.
const BATTER = 0.0;

// Real metres, scaled once at the end. TODO(${id}): from the survey.
const PLAN = { w: 60.0, d: 40.0, h: 50.0 };
const WALL = 3.0;

/** Half-width of a battered wall at height y, given its width at its top. */
const wAt = (wTop, top, y) => wTop + 2 * BATTER * (top - y);

/** What the garrison, the flag and the level record read. */
export const ${CONST} = {
  scale: S,
  plan: { w: PLAN.w * S, d: PLAN.d * S, h: PLAN.h * S },
  /** Rooflines a man can be posted on, low to high. */
  galleries: [PLAN.h * S],
  flag: { x: 0, y: (PLAN.h + 1.0) * S, z: 0 },
};

export function build${Cap}(quality) {
  const B = new BlockList();
  B.joint = JOINT / S;
  const s = Math.min(quality.blockScale, 1.3) * STONE_FINENESS;
  const stone = 1.2 * s;
  const course = 1.5 * s;
  /** Equal courses, never a sliver. */
  const courses = (y0, y1, nominal, fn) => {
    const n = Math.max(1, Math.round((y1 - y0) / nominal));
    const ch = (y1 - y0) / n;
    for (let c = 0; c < n; c++) fn(y0 + c * ch, ch, c);
  };

  // TODO(${id}) the building. A placeholder so the level loads and the harness runs.
  B.section('body', () => {
    courses(0, PLAN.h, course, (y, h, c) => {
      B.ring(0, 0, wAt(PLAN.w, PLAN.h, y), wAt(PLAN.d, PLAN.h, y), WALL, y, h, stone, M.LIMESTONE, c % 2 ? 0.5 : 0);
    });
    B.slab(0, PLAN.h + course * 0.3, 0, PLAN.w - WALL, course * 0.6, PLAN.d - WALL, stone, M.LIMESTONE);
  });

  B.scaleAll(S);
  return B;
}

/** The garrison, every position read from the constants above. */
export function populate${Cap}(g, origin, groundY) {
  const K = ${CONST};
  const V = (x, y, z) => new THREE.Vector3(origin.x + x, groundY + y, origin.z + z);
  // TODO(${id}) post men where the building has a floor under them and a view out.
  for (const sx of [-1, 1]) {
    g.place('rifleman', V(sx * (K.plan.w / 2 - 3), K.galleries[0] + 1.0, 0), sx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, { cover: 'roof' });
  }
}
`);
  edits.push(modPath);
}

// 3. The level record, the running order, the blurb.
patch('src/game/levels.js', (s) => {
  // Import beside the last landmark import.
  const lastImport = s.lastIndexOf("from '../structure/landmarks/");
  const lineEnd = s.indexOf('\n', lastImport) + 1;
  s = s.slice(0, lineEnd) + `import { build${Cap}, populate${Cap} } from '../structure/landmarks/${id}.js';\n` + s.slice(lineEnd);
  // The record, before the table closes.
  s = insertBefore(s, '};\n\nexport const DEFAULT_LEVEL', `  ${id}: {
    id: '${id}',
    terrain: '${id}',
    lat: ${lat}, lon: ${lon},
    name: '${landmark.toUpperCase()}',
    place: '${town}',
    target: '${landmark.toUpperCase()}',
    subtitle: '${landmark}, ${town}',
    victory: 'TODO(${id}) THE LINE THE END CARD LEADS WITH',
    // TODO(${id}) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(${id}) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(${id}) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(${id}) the postcard angle
    structures: (quality) => [
      { key: '${id}', blocks: build${Cap}(quality), primary: true, required: true, label: '${landmark.toUpperCase()}' },
    ],
    garrison: (g, origin, groundY) => populate${Cap}(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(${id})
    traits: { windows: false, river: false, topples: true },           // TODO(${id})
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(${id}) from the suite's undercut
    brief: 'TODO(${id}) one sentence: what the player has to find out about this building.',
  },
`);
  // Running order.
  s = s.replace(/(export const LEVEL_ORDER = \[[\s\S]*?)\];/, (m, body) => `${body.replace(/\s*$/, '')}, '${id}'];`);
  // Blurb.
  const at = closerAfter(s, 'export const LEVEL_BLURB = {', '};');
  s = s.slice(0, at) + `  ${id}: 'TODO(${id}) one line on the target-select card: what kind of problem this is.',\n` + s.slice(at);
  return s;
});

// 4. The contract.
const order = readFileSync('src/game/levels.js', 'utf8').match(/export const LEVEL_ORDER = \[([\s\S]*?)\];/)[1].split(',').filter((x) => x.trim()).length;
patch('src/game/campaign.js', (s) => {
  const at = closerAfter(s, 'export const THEATRES = [', '];');
  return s.slice(0, at) + `  {
    id: '${id}',
    iso: '${iso}',
    lx: 0, ly: 0,                    // TODO(${id}) label offset on the campaign map
    city: '${city}',
    lon: ${lon.toFixed(4)}, lat: ${lat.toFixed(4)},
    no: ${order},
    title: 'TODO(${id}) THE CONTRACT TITLE',
    brief: 'TODO(${id}) three sentences: the place, what it is made of, what the player is paid for.',
    unlocks: [],
    unlockLine: 'TODO(${id})',
  },
` + s.slice(at);
});

// 5. The officer, the defender, the stand-off.
patch('src/game/cast.js', (s) => {
  let at = closerAfter(s, 'export const CAST = {', '};');
  s = s.slice(0, at) + `  ${code}: {
    id: '${code}', file: 'assets/characters/${code}-officer.png',   // TODO(${id}) the rank in the file name
    rank: 'TODO(${id})', name: 'TODO(${id})', nation: '${nation}', side: 'right',
    colours: ['#888888', '#cccccc', '#888888'],                   // TODO(${id}) three flag colours
  },
` + s.slice(at);
  at = closerAfter(s, 'export const DEFENDER_OF = {', '};');
  s = s.slice(0, at) + `  ${id}: '${code}',\n` + s.slice(at);
  at = closerAfter(s, 'export const STANDOFF = {', '};');
  s = s.slice(0, at) + `  ${id}: [
    { who: 'us', line: 'TODO(${id}) the ultimatum.' },
    { who: '${code}', line: 'TODO(${id}) the refusal, in the defender\\'s own language.' },
    { who: 'us', line: 'TODO(${id}) the last word.' },
  ],
` + s.slice(at);
  return s;
});

// 6. The flag.
patch('src/world/flags.js', (s) => {
  const lastImport = s.lastIndexOf("from '../structure/landmarks/");
  const lineEnd = s.indexOf('\n', lastImport) + 1;
  s = s.slice(0, lineEnd) + `import { ${CONST} } from '../structure/landmarks/${id}.js';\n` + s.slice(lineEnd);
  const at = closerAfter(s, 'export const FLAG_SITES = {', '};');
  return s.slice(0, at) + `  ${id}: [{ key: '${id}', ...${CONST}.flag, pattern: 'TODO(${id})', w: 9, h: 6, pole: 10 }],\n` + s.slice(at);
});

// 7. The fleet.
patch('src/world/craft.js', (s) => {
  const at = closerAfter(s, 'export const FLEETS = {', '};');
  return s.slice(0, at) + `  ${id}: [],   // TODO(${id}) the boats of the place, if it has water\n` + s.slice(at);
});

// 8. The script, the portrait slot, the proportion table.
patch('docs/SCRIPTS.md', (s) => s.replace(/\s*$/, '') + `

## ${nation} — ${town}, ${landmark} *(draft)*

Defender: **TODO(${id}) Rank Name**, ${nation}. Level id \`${id}\`.

- US: TODO(${id}) the ultimatum.
- ${code.toUpperCase()}: TODO(${id}) the refusal in the defender's language. *(translation)*
- US: TODO(${id}) the last word.
`);
const manifestPath = 'public/assets/characters/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.enemies[id] = {
  id: `${code}-officer`, file: `${code}-officer.png`, nation, defends: `the ${landmark}`,
  look: `TODO(${id}) the officer's uniform, rank insignia and bearing, for the artist.`,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
edits.push(manifestPath);
mkdirSync('docs/maps', { recursive: true });
const tablePath = `docs/maps/${id}.md`;
if (!existsSync(tablePath)) {
  writeFileSync(tablePath, `# ${landmark}, ${town} — the proportion table

Filled in from three reference photographs and \`python3 tools/survey.py ${id}\`
before the builder is written; checked against \`node tools/blocks.mjs ${id}\` and
\`node tools/postcard.mjs ${id}\` after.

| | The real thing | Built |
|---|---|---|
| Plan, from the survey | TODO x TODO m | |
| Height from the ground the camera stands on | TODO m | |
| Taller than wide? | | |
| The bottom third is | | |
| Dominant surface colour (as a material) | | |
| Where the eye goes | | |
| Outbuildings the survey names, and which are built | | |

Kind of problem: TODO. The twist: TODO.
`);
  edits.push(tablePath);
}

console.log(`scaffolded ${id} into:\n  ${[...new Set(edits)].join('\n  ')}\n`);
console.log('what mapcheck still wants:');
try { execSync(`node tools/mapcheck.mjs ${id}`, { stdio: 'inherit' }); } catch { /* expected: bakes, recon, portrait */ }
console.log(`\nnext: fill the TODO(${id}) marks, then\n  python3 tools/bake_overture.py ${id}\n  python3 tools/survey.py ${id}\n  node tools/blocks.mjs ${id}\n  node tools/recon.mjs ${id}`);
