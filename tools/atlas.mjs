// The catalogued maps' ground: writes a terrain-bake entry for every place in
// `src/game/atlas_places.js` into `tools/bake_terrain.py`, between markers, so
// re-running it replaces the block rather than adding to it.
//
//   node tools/atlas.mjs            write the entries
//   node tools/atlas.mjs --ids      print the ids, one line, for the bakes
//
// Every catalogued map is 900 m each way at zoom 15, with the landmark's pad
// levelled under it. A city's DEM is a surface model, so it gets the automatic
// ceiling; a hill site keeps its hill.
import { readFileSync, writeFileSync } from 'node:fs';
import { PLACES } from '../src/game/atlas_places.js';

if (process.argv.includes('--ids')) {
  console.log(PLACES.map((p) => p.id).join(' '));
  process.exit(0);
}

// `--scripts`: the catalogue's stand-offs into docs/SCRIPTS.md, between
// markers, with the English of every line that is not in English.
if (process.argv.includes('--scripts')) {
  const { ATLAS_STANDOFF } = await import('../src/game/atlas.js');
  const { CAST } = await import('../src/game/cast.js');
  const EN = {
    milan: 'The Duomo was never finished. And you will not finish it.',
    stvitus: 'They built this cathedral for six hundred years. You will not knock it down in an afternoon.',
    ulm: 'Einstein was born here. Not even he could save your arithmetic.',
    brandenburg: 'This gate survived Napoleon. It will survive an American with cannons too.',
    stephansdom: 'The Steffl has seen two sieges. You are only the third.',
    hohensalzburg: 'Nine hundred years, and nobody got in. You will not even get up the hill.',
    versailles: 'The Sun King built this to dazzle Europe. You are just a tourist.',
    chambord: 'Two staircases that never meet. Like you and victory.',
    seville: 'Columbus is buried here. Not even dead has he surrendered.',
    alhambra: 'The Alhambra is poetry in stone. All you can read is a firing map.',
    malbork: 'The Teutonic Knights built it, we rebuilt it. We will rebuild it after you too.',
    warsaw: 'They say the best view is from the top of it, because from there you cannot see it.',
    bran: 'Vlad never lived here. But we will bury you here.',
    bucharest: 'It has more rooms than you have shells.',
    kronborg: 'Holger the Dane sleeps in the cellar. He wakes when Denmark is in danger.',
    stockholm: 'You will not find assembly instructions for taking this apart.',
    hallgrimskirkja: 'We have no army. We have a church and a great deal of wind.',
    trakai: 'Vytautas the Great lived here. He did not like guests.',
    winterpalace: 'This palace survived a revolution. It will survive you.',
    belem: 'From here we set out to discover the world. All you have discovered is the wrong way.',
    nidaros: 'Saint Olav lies here. He was a Viking king before he was a saint.',
    helsinki: 'In the Winter War we did not give in. We will not now either.',
    chillon: 'Switzerland is neutral. But not that neutral.',
    saintsava: 'We built this church for a hundred years. You will not knock it down in a day.',
    taipei101: 'This building has stood through typhoons and earthquakes. What are you?',
    shanghaitower: 'Shanghai Tower twists a hundred and twenty degrees against the typhoons. You cannot twist it.',
    wildgoose: 'Xuanzang walked for seventeen years to fetch the scriptures. You will not last seventeen minutes.',
    landmark81: 'This is the tallest building in Vietnam. You cannot make it any shorter.',
    boudhanath: 'This stupa has come through many earthquakes. You are only one more.',
    victoriamemorial: 'This marble is from the quarry that built the Taj Mahal. It will last the same.',
    hawamahal: 'The wind goes straight through the Palace of Winds. So will your shells.',
    redfort: 'These walls have seen the Mughals, the British and independence. You are nothing.',
    gatewayindia: 'This gate is for going out, not for coming in.',
    osaka: 'This castle has burned many times. Every time, we rebuilt it.',
    kinkakuji: 'The Golden Pavilion burned once. There will not be a second time.',
    juche: 'Our tower stands forever.',
    monas: 'That gold belongs to the people of Indonesia.',
    prambanan: 'This temple has come through earthquakes and volcanoes.',
    minarpakistan: 'This minar is the symbol of the nation\'s resolve.',
    bayterek: 'Nobody can take the egg of Samruk.',
    registan: 'Ulugh Beg taught the stars here.',
    flametowers: 'This is the land of fire. We are not afraid of fire.',
    azadi: 'This tower is built of eight thousand stones. You cannot move even one.',
    kingdomcentre: 'This tower carries a bridge in the sky.',
    baalbek: 'These stones are bigger than your tank.',
    ur: 'This is three thousand seven hundred years older than your country.',
    djoser: 'Imhotep built this before anyone knew how.',
    yamoussoukro: "This basilica is bigger than St Peter's in Rome.",
    frontenac: 'I remember. You, we will forget.',
    capitolio: 'Our Capitol is taller than yours. And prettier.',
    bellasartes: 'The Palace has sunk four metres. It has never surrendered.',
    teatroamazonas: 'Even Caruso wanted to sing here.',
    obelisco: 'Hey, the Obelisco belongs to everyone in Buenos Aires.',
    cartagena: 'Blas de Lezo defended us here with one leg, one arm and one eye.',
  };
  const out = PLACES.map((P) => {
    const c = CAST[P.code];
    const so = ATLAS_STANDOFF[P.id];
    const tr = EN[P.id] ? ` *(${EN[P.id]})*` : '';
    return `## ${c.nation} — ${P.city}, ${P.landmark}\n\nDefender: **${c.rank} ${c.name}**, ${c.nation}. Level id \`${P.id}\`.\n\n`
      + `- US: ${so[0].line}\n- ${P.code.toUpperCase()}: ${so[1].line}${tr}\n- US: ${so[2].line}\n`;
  }).join('\n');
  const file = 'docs/SCRIPTS.md';
  const A = '<!-- atlas: generated by tools/atlas.mjs --scripts -->\n', Z = '<!-- end atlas -->\n';
  let s = readFileSync(file, 'utf8');
  const a = s.indexOf(A);
  s = a >= 0 ? s.slice(0, a) + A + '\n' + out + '\n' + s.slice(s.indexOf(Z, a)) : s.trimEnd() + '\n\n' + A + '\n' + out + '\n' + Z;
  writeFileSync(file, s);
  console.log(`atlas: ${PLACES.length} stand-offs in ${file}`);
  process.exit(0);
}

const OPEN = '    # --- atlas: generated by tools/atlas.mjs, do not edit by hand ---\n';
const CLOSE = '    # --- end atlas ---\n';
const body = PLACES.map((p) => {
  const pad = p.pad || 70;
  return `    "${p.id}": {
        "name": "${p.landmark.replace(/"/g, '\\"')}, ${p.city}",
        "lat": ${p.lat},
        "lon": ${p.lon},
        "span": 900.0,
        "zoom": 15,${p.hill ? '' : '\n        "ceiling": "auto",'}
        "parks": [],
        "flatten": [[0, 0, [${pad}, ${pad}], 30${p.padH != null ? `, ${p.padH}` : ''}]],
    },
`;
}).join('');

const file = 'tools/bake_terrain.py';
let s = readFileSync(file, 'utf8');
const a = s.indexOf(OPEN);
if (a >= 0) {
  const b = s.indexOf(CLOSE, a);
  s = s.slice(0, a) + OPEN + body + s.slice(b);
} else {
  const end = s.indexOf('\n}\n', s.indexOf('LEVELS = {')) + 1;
  s = s.slice(0, end) + OPEN + body + CLOSE + s.slice(end);
}
writeFileSync(file, s);
console.log(`atlas: ${PLACES.length} terrain entries in ${file}`);
