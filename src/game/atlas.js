import * as THREE from 'three';
import { PLACES, TUTORIAL_PLACE } from './atlas_places.js';
import { SPECS } from './atlas_specs.js';
import { buildKit, layoutKit, populateKit } from '../structure/landmarks/kit.js';

/**
 * The catalogue: fifty-nine levels made from data.
 *
 * The first forty-one levels are each a module, a record and a row in eight
 * tables, written by hand. These are the same things generated from three
 * sources: where the place is (`atlas_places.js`), what the building is
 * (`atlas_specs.js`, built by the landmark kit), and what is said about it
 * (the words below). Every table the game reads a level from — the level
 * records, the running order, the campaign's contracts, the officers, the
 * stand-offs, the flags — takes its rows for these from here, so a level is
 * one line in each of those three files and nothing anywhere else.
 */

// ── The weather and the ground, by climate ───────────────────────────────

const C = (h) => new THREE.Color(h);
const CLIMES = {
  temperate: {
    palette: [0xa9a49a, 0x948d82, 0x466a33, 0x5b7f3c, 0x3a3c40, 0xa89b7c, 0x33473f, 0xb9b096],
    haze: { colour: 0xc8ccd0, density: 0.00024 }, ground: 'lawn',
  },
  mediterranean: {
    palette: [0xc9bfa6, 0xb3a58a, 0x6b7a44, 0x7f8a4a, 0x6a655d, 0xc8bb98, 0x5c6a58, 0xd8cba6],
    haze: { colour: 0xd8d3c4, density: 0.00021 }, ground: 'paving',
  },
  alpine: {
    palette: [0x8e9670, 0x7a845e, 0x3a5c30, 0x476b38, 0x6a665e, 0x9a9c80, 0x3a5652, 0x9aa075],
    haze: { colour: 0xc4d2df, density: 0.00014 }, ground: 'lawn',
  },
  nordic: {
    palette: [0xa7a59f, 0x918e88, 0x44603a, 0x506d40, 0x45474b, 0x9e998a, 0x2f4650, 0xb0ab9c],
    haze: { colour: 0xc6d0d8, density: 0.00022 }, ground: 'lawn',
  },
  subtropical: {
    palette: [0xb0aa9a, 0x9a9383, 0x4d6b38, 0x5d7c40, 0x3e3f42, 0xa89f86, 0x3a5550, 0xb9b29c],
    haze: { colour: 0xd0d4d6, density: 0.00030 }, ground: 'paving',
  },
  tropical: {
    palette: [0x7d8468, 0x6a7358, 0x35542a, 0x436530, 0x3c3c3e, 0x8d8a6e, 0x3a5a4e, 0x8f9470],
    haze: { colour: 0xd7dde0, density: 0.00032 }, ground: 'lawn', roofPitch: 0,
  },
  highland: {
    palette: [0xc0b49c, 0xa89a80, 0x6f6c46, 0x7d764e, 0x585552, 0xc8bb9a, 0x4d6a63, 0xb09a74],
    haze: { colour: 0xc9d6e2, density: 0.00016 }, ground: 'paving', roofPitch: 0.18,
  },
  desert: {
    palette: [0xd6c9ad, 0xc2b193, 0x6f8a4c, 0x7f9a55, 0x4c4a48, 0xdccaa2, 0x3c6b73, 0xe3d5b2],
    haze: { colour: 0xe3d6bb, density: 0.00026 }, ground: 'paving', roofPitch: 0,
  },
  steppe: {
    palette: [0xbdb39c, 0xa69c85, 0x6a7445, 0x78804c, 0x4f4d4a, 0xc2b697, 0x3f5a60, 0xcfc3a1],
    haze: { colour: 0xd6d6cf, density: 0.00020 }, ground: 'paving', roofPitch: 0,
  },
};
const PAL_KEYS = ['urban', 'urbanAlt', 'park', 'parkAlt', 'road', 'bank', 'bed', 'dry'];

/** Wild ground round a remote site: the bake's WILD_COVER keeps the same list. */
const WILD = { bran: 'forest', kinkakuji: 'forest', prambanan: 'jungle', yamoussoukro: 'jungle' };

/** The boats on the water, where there is water. */
const FLEET = {
  kronborg: ['fishing', 'ferry', 'yacht'], stockholm: ['ferry', 'yacht', 'rowing'], trakai: ['rowing', 'rowing'],
  belem: ['fishing', 'ferry', 'yacht'], helsinki: ['ferry', 'yacht', 'fishing'], chillon: ['rowing', 'yacht'],
  winterpalace: ['river-cruise', 'river-cruise'], ulm: ['rowing'], hohensalzburg: ['rowing'], malbork: ['rowing'],
  windsor: ['thames-sail', 'rowing'], nidaros: ['fishing'], frontenac: ['ferry', 'cruiser'], cntower: ['ferry', 'yacht'],
  skytower: ['ferry', 'yacht', 'yacht'], gatewayindia: ['ferry', 'fishing', 'dhow'], lotustower: ['fishing', 'fishing'],
  flametowers: ['ferry', 'yacht'], shanghaitower: ['river-cruise', 'ferry', 'rhine-barge'], landmark81: ['sampan', 'ferry'],
  juche: ['rowing'], cartagena: ['fishing', 'yacht'], kinkakuji: ['rowing'],
};

// ── The officers who have not appeared before ────────────────────────────

/**
 * A flag as a list of drawing steps, fractions of the cloth:
 *   ['h', colours, weights?]  horizontal bands      ['v', colours]  vertical bands
 *   ['nordic', cross, border?]  an off-centre cross ['tri', colour, depth]  a hoist triangle
 *   ['rect', colour, x, y, w, h]  ['disc', colour, x, y, r]  ['star', colour, x, y, r]
 */
const NEW_OFFICERS = {
  cz: { rank: 'Armádní generál', name: 'Vojtěch Kolář', nation: 'Czechia', colours: ['#11457e', '#ffffff', '#d7141a'],
    flag: [['h', ['#ffffff', '#d7141a']], ['tri', '#11457e', 0.5]] },
  at: { rank: 'General', name: 'Leopold Habsbrecher', nation: 'Austria', colours: ['#c8102e', '#ffffff', '#c8102e'],
    flag: [['h', ['#c8102e', '#ffffff', '#c8102e']]] },
  pl: { rank: 'Generał broni', name: 'Kazimierz Wróblewski', nation: 'Poland', colours: ['#ffffff', '#dc143c', '#dc143c'],
    flag: [['h', ['#ffffff', '#dc143c']]] },
  ro: { rank: 'General de armată', name: 'Vlad Tepeșescu', nation: 'Romania', colours: ['#002b7f', '#fcd116', '#ce1126'],
    flag: [['v', ['#002b7f', '#fcd116', '#ce1126']]] },
  dk: { rank: 'General', name: 'Holger Brandt', nation: 'Denmark', colours: ['#c8102e', '#ffffff', '#c8102e'],
    flag: [['h', ['#c8102e']], ['nordic', '#ffffff']] },
  se: { rank: 'General', name: 'Gustav Lindqvist', nation: 'Sweden', colours: ['#006aa7', '#fecc00', '#006aa7'],
    flag: [['h', ['#006aa7']], ['nordic', '#fecc00']] },
  is: { rank: 'Skipherra', name: 'Ragnar Þórsson', nation: 'Iceland', colours: ['#02529c', '#ffffff', '#dc1e35'],
    flag: [['h', ['#02529c']], ['nordic', '#dc1e35', '#ffffff']] },
  lt: { rank: 'Generolas', name: 'Algirdas Vaitkus', nation: 'Lithuania', colours: ['#fdb913', '#006a44', '#c1272d'],
    flag: [['h', ['#fdb913', '#006a44', '#c1272d']]] },
  no: { rank: 'General', name: 'Sigurd Haugen', nation: 'Norway', colours: ['#ba0c2f', '#ffffff', '#00205b'],
    flag: [['h', ['#ba0c2f']], ['nordic', '#00205b', '#ffffff']] },
  fi: { rank: 'Kenraali', name: 'Aarne Virtanen', nation: 'Finland', colours: ['#ffffff', '#002f6c', '#ffffff'],
    flag: [['h', ['#ffffff']], ['nordic', '#002f6c']] },
  ch: { rank: 'Korpskommandant', name: 'Urs Bättig', nation: 'Switzerland', colours: ['#da291c', '#ffffff', '#da291c'],
    flag: [['h', ['#da291c']], ['rect', '#ffffff', 0.42, 0.2, 0.16, 0.6], ['rect', '#ffffff', 0.3, 0.4, 0.4, 0.2]] },
  rs: { rank: 'Generál', name: 'Dragan Petrović', nation: 'Serbia', colours: ['#c6363c', '#0c4076', '#ffffff'],
    flag: [['h', ['#c6363c', '#0c4076', '#ffffff']]] },
  tw: { rank: 'Shàngjiàng', name: 'Lin Chih-ming', nation: 'Taiwan', colours: ['#fe0000', '#000095', '#ffffff'],
    flag: [['h', ['#fe0000']], ['rect', '#000095', 0, 0, 0.5, 0.5], ['disc', '#ffffff', 0.25, 0.25, 0.1]] },
  vn: { rank: 'Đại tướng', name: 'Trần Văn Long', nation: 'Vietnam', colours: ['#da251d', '#ffff00', '#da251d'],
    flag: [['h', ['#da251d']], ['star', '#ffff00', 0.5, 0.5, 0.3]] },
  np: { rank: 'Pradhan Senapati', name: 'Bikram Thapa', nation: 'Nepal', colours: ['#dc143c', '#003893', '#ffffff'],
    flag: [['h', ['#003893']], ['rect', '#dc143c', 0.04, 0.05, 0.8, 0.9], ['disc', '#ffffff', 0.3, 0.72, 0.12]] },
  kp: { rank: 'Chasu', name: 'Pak Chol-su', nation: 'North Korea', colours: ['#024fa2', '#ed1c27', '#ffffff'],
    flag: [['h', ['#024fa2', '#ffffff', '#ed1c27', '#ffffff', '#024fa2'], [4, 1, 11, 1, 4]], ['disc', '#ffffff', 0.35, 0.5, 0.17], ['star', '#ed1c27', 0.35, 0.5, 0.15]] },
  pk: { rank: 'General', name: 'Tariq Rana', nation: 'Pakistan', colours: ['#01411c', '#ffffff', '#01411c'],
    flag: [['v', ['#ffffff', '#01411c', '#01411c', '#01411c']], ['disc', '#ffffff', 0.62, 0.5, 0.22], ['disc', '#01411c', 0.67, 0.44, 0.2], ['star', '#ffffff', 0.74, 0.36, 0.07]] },
  lk: { rank: 'General', name: 'Nimal Perera', nation: 'Sri Lanka', colours: ['#8d153a', '#ffbe29', '#00534e'],
    flag: [['h', ['#ffbe29']], ['rect', '#00534e', 0.04, 0.06, 0.12, 0.88], ['rect', '#eb7400', 0.17, 0.06, 0.12, 0.88], ['rect', '#8d153a', 0.33, 0.06, 0.63, 0.88]] },
  kz: { rank: 'Armiya generaly', name: 'Nurlan Abenov', nation: 'Kazakhstan', colours: ['#00afca', '#fec50c', '#00afca'],
    flag: [['h', ['#00afca']], ['disc', '#fec50c', 0.5, 0.45, 0.16]] },
  uz: { rank: 'General-polkovnik', name: 'Rustam Yusupov', nation: 'Uzbekistan', colours: ['#0099b5', '#ffffff', '#1eb53a'],
    flag: [['h', ['#0099b5', '#ce1126', '#ffffff', '#ce1126', '#1eb53a'], [10, 1, 10, 1, 10]]] },
  az: { rank: 'General-polkovnik', name: 'Elçin Məmmədov', nation: 'Azerbaijan', colours: ['#0092bc', '#e4002b', '#00af66'],
    flag: [['h', ['#0092bc', '#e4002b', '#00af66']], ['disc', '#ffffff', 0.48, 0.5, 0.11], ['disc', '#e4002b', 0.51, 0.5, 0.09]] },
  ir: { rank: 'Sarlashkar', name: 'Dariush Farahani', nation: 'Iran', colours: ['#239f40', '#ffffff', '#da0000'],
    flag: [['h', ['#239f40', '#ffffff', '#da0000']]] },
  sa: { rank: 'Fariq Awwal', name: 'Nawaf Al-Harbi', nation: 'Saudi Arabia', colours: ['#006c35', '#ffffff', '#006c35'],
    flag: [['h', ['#006c35']], ['rect', '#ffffff', 0.2, 0.62, 0.6, 0.05]] },
  lb: { rank: 'Imad', name: 'Karim Haddad', nation: 'Lebanon', colours: ['#ee161f', '#ffffff', '#00a651'],
    flag: [['h', ['#ee161f', '#ffffff', '#ffffff', '#ee161f']], ['star', '#00a651', 0.5, 0.52, 0.2]] },
  iq: { rank: 'Fariq Awwal', name: 'Salim Al-Jubouri', nation: 'Iraq', colours: ['#ce1126', '#ffffff', '#000000'],
    flag: [['h', ['#ce1126', '#ffffff', '#000000']]] },
  ci: { rank: "Général de corps d'armée", name: 'Yao Kouassi', nation: "Côte d'Ivoire", colours: ['#f77f00', '#ffffff', '#009e60'],
    flag: [['v', ['#f77f00', '#ffffff', '#009e60']]] },
  ca: { rank: 'General', name: 'Doug McAllister', nation: 'Canada', colours: ['#d80621', '#ffffff', '#d80621'],
    flag: [['v', ['#d80621', '#ffffff', '#ffffff', '#d80621']], ['star', '#d80621', 0.5, 0.5, 0.26]] },
  cu: { rank: 'General de Cuerpo de Ejército', name: 'Osvaldo Céspedes', nation: 'Cuba', colours: ['#002a8f', '#ffffff', '#cf142b'],
    flag: [['h', ['#002a8f', '#ffffff', '#002a8f', '#ffffff', '#002a8f']], ['tri', '#cf142b', 0.45], ['star', '#ffffff', 0.15, 0.5, 0.13]] },
  ar: { rank: 'Teniente General', name: 'Facundo Albarracín', nation: 'Argentina', colours: ['#74acdf', '#ffffff', '#f6b40e'],
    flag: [['h', ['#74acdf', '#ffffff', '#74acdf']], ['disc', '#f6b40e', 0.5, 0.5, 0.1]] },
  co: { rank: 'General', name: 'Andrés Restrepo', nation: 'Colombia', colours: ['#fcd116', '#003893', '#ce1126'],
    flag: [['h', ['#fcd116', '#003893', '#ce1126'], [2, 1, 1]]] },
  nz: { rank: 'Lieutenant General', name: 'Hamish Te Rangi', nation: 'New Zealand', colours: ['#012169', '#ffffff', '#c8102e'],
    flag: [['h', ['#012169']], ['rect', '#ffffff', 0, 0.2, 0.5, 0.1], ['rect', '#ffffff', 0.2, 0, 0.1, 0.5], ['rect', '#c8102e', 0, 0.22, 0.5, 0.06], ['rect', '#c8102e', 0.22, 0, 0.06, 0.5],
      ['star', '#c8102e', 0.75, 0.3, 0.07], ['star', '#c8102e', 0.68, 0.55, 0.07], ['star', '#c8102e', 0.82, 0.5, 0.06], ['star', '#c8102e', 0.75, 0.8, 0.07]] },
};

/** The flag the game already draws for a nation it already has. */
const OLD_PATTERN = {
  it: 'italy', de: 'germany', fr: 'tricolore', es: 'spain', ru: 'russia', pt: 'portugal', uk: 'union', cn: 'china',
  in: 'india', jp: 'japan', id: 'indonesia', eg: 'egypt', mx: 'mexico', br: 'brazil',
};

/** Draw a flag spec into a canvas context. */
export function drawFlagSpec(ctx, w, h, spec) {
  for (const op of spec) {
    const [k] = op;
    if (k === 'h' || k === 'v') {
      const cols = op[1], wt = op[2] || cols.map(() => 1);
      const tot = wt.reduce((a, b) => a + b, 0);
      let at = 0;
      cols.forEach((c, i) => {
        const f = wt[i] / tot;
        ctx.fillStyle = c;
        if (k === 'h') ctx.fillRect(0, Math.floor(at * h), w, Math.ceil(f * h) + 1);
        else ctx.fillRect(Math.floor(at * w), 0, Math.ceil(f * w) + 1, h);
        at += f;
      });
    } else if (k === 'nordic') {
      const [, cross, border] = op;
      const cx = w * 0.36, t = h * 0.2, b = border ? h * 0.08 : 0;
      if (border) { ctx.fillStyle = border; ctx.fillRect(cx - t / 2 - b, 0, t + 2 * b, h); ctx.fillRect(0, h / 2 - t / 2 - b, w, t + 2 * b); }
      ctx.fillStyle = cross; ctx.fillRect(cx - t / 2, 0, t, h); ctx.fillRect(0, h / 2 - t / 2, w, t);
    } else if (k === 'tri') {
      ctx.fillStyle = op[1];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * op[2], h / 2); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    } else if (k === 'rect') {
      ctx.fillStyle = op[1]; ctx.fillRect(op[2] * w, op[3] * h, op[4] * w, op[5] * h);
    } else if (k === 'disc') {
      ctx.fillStyle = op[1]; ctx.beginPath(); ctx.arc(op[2] * w, op[3] * h, op[4] * h, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'star') {
      const [, c, x, y, r] = op;
      ctx.fillStyle = c; ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = (i % 2 ? 0.42 : 1) * r * h;
        ctx.lineTo(x * w + Math.cos(a) * rr, y * h + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
  }
}

/** Pattern drawers for the new nations, by the name the flag sites use. */
export const ATLAS_PATTERNS = Object.fromEntries(Object.entries(NEW_OFFICERS).map(([code, o]) => [`atlas-${code}`, (ctx, w, h) => drawFlagSpec(ctx, w, h, o.flag)]));
// The home flag, for Boot Camp: thirteen stripes and the canton.
ATLAS_PATTERNS.usa = (ctx, w, h) => drawFlagSpec(ctx, w, h, [
  ['h', Array.from({ length: 13 }, (_, i) => (i % 2 ? '#ffffff' : '#b22234'))],
  ['rect', '#3c3b6e', 0, 0, 0.4, 7 / 13],
]);

const slug = (s) => s.toLowerCase().replace(/ł/g, 'l').replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const ATLAS_CAST = Object.fromEntries(Object.entries(NEW_OFFICERS).map(([code, o]) => [code, {
  id: code, file: `assets/characters/${code}-${slug(o.rank)}.png`,
  rank: o.rank, name: o.name, nation: o.nation, side: 'right', colours: o.colours,
}]));

// ── What is said ─────────────────────────────────────────────────────────

/**
 * Per level: the victory line, the contract's title, the one-line blurb, the
 * brief, and the stand-off — the American, the defender in his own language,
 * the American.
 */
const WORDS = {
  tutorial: ['Qualified', 'BOOT CAMP',
    'A range tower and a container yard in the Mojave. Learn the controls here.',
    'The range control tower at Fort Irwin and the container yard round it. A light garrison and money for everything: bring the tower down.',
    "Welcome to Fort Irwin, son. Hundred and ten in the shade and there ain't no shade. Knock that tower down.", "Yes, General.", "And if you scratch my Humvee you're walking home."],
  milan: ['Ciao, Duomo', 'THE MARBLE MOUNTAIN',
    'A marble nave between four aisles, the spire over the crossing. The aisle roofs are where the guns are.',
    'Six centuries of marble: a nave and four aisles under a flat roof walk, the crossing spire with the Madonnina on it. The aisle roofs are the gun platforms; the crossing piers hold the spire.',
    "Is this the fashion place? I'm wearing camo. Camo is always in season.", 'Il Duomo non è mai stato finito. E tu non finirai lui.', "Italian's just English with more hand stuff. Watch my hands, pal. Fire!"],
  stvitus: ['Vitus Interruptus', 'THE CASTLE CATHEDRAL',
    'A Gothic cathedral inside Prague Castle: twin west spires and a great south tower with an onion crown.',
    'The cathedral of Prague Castle on its hill: twin west spires, a nave and aisles, and the great south tower with its copper crown standing over the transept.',
    "Prague! I've been here before. Bachelor party. Don't remember the church. Remember the bar.", "Tady se vyhazovali lidé z oken, Američane. Máme to v krvi.", "He's pointing at a window. Why's he pointing at a window? Weird guy. Light it up."],
  ulm: ['Steeple Chase', 'THE TALLEST STEEPLE',
    'The tallest church steeple in the world, on one west tower. Everything else is a nave.',
    'A hundred and sixty-one metres of openwork spire on a single tower at the west end, and a low nave and aisles behind it. The tower is the problem and the prize.',
    "Tallest church in the world, and I never heard of the town. Ulm. Sounds like a noise my stomach makes.", 'Einstein wurde hier geboren. Nicht einmal er könnte deine Rechnung retten.', "Einstein! Him I know. E equals MC Hammer. Boys, it's hammer time."],
  brandenburg: ['Gate Crashers', 'THE GATE',
    'Twelve columns under an attic and the Quadriga, a guardhouse either side. Cut the columns.',
    'Twelve sandstone columns in two rows carry the entablature, the attic and the Quadriga; the guardhouses either side are the only rooms. Take the columns and the attic comes down on the passages.',
    "Didn't one of our presidents tell somebody to tear something down around here? I'm a man who follows orders.", "Euer Präsident hat hier gesagt: Reißen Sie diese Mauer nieder. Das Tor hat er nicht gemeint.", "He keeps saying 'Mauer'. That's German for 'more', right? More it is."],
  stephansdom: ['Stephan Out', 'THE STEFFL',
    'A hall church under a tiled roof as tall as its walls, and a south tower of a hundred and thirty-six metres.',
    'Three naves of equal height under one enormous tiled roof, twin towers at the west front, and the Steffl, the great south tower, standing beside the choir.',
    "Nice roof. Real fancy. Guten Tag, Germany!", "Wir sind Österreicher, keine Deutschen. Merk dir das, bevor du stirbst.", "Austria, Australia, whatever. Where are the kangaroos? No kangaroos? Fire."],
  hohensalzburg: ['The Hills Are Alive', 'THE HIGH FORTRESS',
    'A white fortress along a crag over Salzburg: a ring of walls and towers round the prince-archbishops\' palace.',
    'Nine hundred years of walls on the Festungsberg: a curtain round the crag with towers at its corners and the Hoher Stock palace in the middle. Nobody ever took it by force.',
    "Is this the Sound of Music place? I'm gonna climb every mountain. Nah, too steep. I'll shell it from here.", "Die Festungsbahn kostet sechzehn Euro, Amerikaner. Für dich ist sie heute gesperrt.", "I heard 'euro'. I don't do euros. I pay in freedom, and freedom comes in 155-millimetre."],
  versailles: ['Let Them Eat Rubble', "THE SUN KING'S HOUSE",
    'The palace and its two wings round the Marble Court. Long, low, and every window a firing slot.',
    'The corps de logis, the two wings round the Marble Court and the chapel: seven hundred rooms and two thousand windows, three storeys under a flat roof behind the balustrade.',
    "Two thousand windows and not one air conditioner. Classic France.", "Même Marie-Antoinette avait plus de cervelle que toi. Et elle a perdu la tête.", "Marie Antoinette! Let them eat cake! See, I know history. Boys, bring the cake. The exploding kind."],
  chambord: ['Château Down', 'THE ROOFSCAPE',
    'A square keep with four round towers inside a walled court, a skyline of cones on the roof.',
    'The donjon is a square of four round towers with the lantern of the double staircase rising from its roof, inside a rectangle of walls with a round tower at each corner.',
    "Four hundred rooms? What is this, a Holiday Inn? Does it do the waffle machine?", 'Deux escaliers qui ne se croisent jamais. Comme toi et la victoire.', "I heard 'escalier'. Escalators? They got escalators? Changes nothing. Still blowing it up."],
  seville: ['Giralda Down', 'THE GIRALDA',
    'The largest Gothic cathedral in the world is one flat-roofed hall. The Giralda stands at its corner.',
    'A hundred and sixteen metres of Gothic hall, five naves wide, under a flat stone roof, with the Giralda, the old minaret, rising a hundred metres at its north-east corner.',
    "Biggest cathedral in Spain. Or Mexico. One of those.", 'Colón está enterrado aquí. Ni muerto se ha rendido.', "Colón? Like the... nope. Not saying it. Boys, just get it over with."],
  alhambra: ['Alhambra Cadabra', 'THE RED FORT OF GRANADA',
    "A walled citadel along a ridge: the Alcazaba's towers, the Comares tower, the palace of Charles V.",
    'Red walls and towers along the Sabika hill: the Alcazaba at the west end with its watchtower, the Comares tower over the Nasrid palaces, and the square palace of Charles V.',
    "Red castle, lotta fountains, zero parking. I hate it already.", 'La Alhambra es poesía en piedra. Tú solo sabes leer mapas de tiro.', "Poesía? Poetry? Roses are red, your fort is too, and in ten minutes it's rubble. That rhymes enough."],
  malbork: ['Knight Knight', 'THE TEUTONIC CASTLE',
    'The largest brick castle ever built: two courts of steep-roofed ranges and a square tower.',
    "The High Castle's four ranges round their courtyard with the main tower at the corner, and the Middle Castle's longer court beside it. Brick all the way through.",
    "Biggest brick castle on Earth. Who counts bricks? Actually, how many bricks? Somebody count the bricks.", 'Krzyżacy go zbudowali, my go odbudowaliśmy. Odbudujemy i po tobie.', "Way too many consonants in that. Way too many. Boys, knock a few out."],
  warsaw: ['Culture Shock', 'THE PALACE OF CULTURE',
    'A stepped tower of setbacks and a spire, on a skirt of wings and corner towers.',
    'A stepped central tower with setbacks and a gilded spire, two hundred and thirty-seven metres of it, on a base of wings and corner towers. Big, heavy and very square.',
    "A gift from Moscow, huh? Shoulda kept the receipt.", 'Mówią, że najlepszy widok jest z jego szczytu, bo stamtąd go nie widać.', "Everybody's laughing. Why's everybody laughing? Was that about me? Fire everything."],
  bran: ['Stake Out', "DRACULA'S CASTLE",
    'A white castle with red roofs on its own rock in a mountain pass, all towers and turrets.',
    "A small castle on its own rock over the Bran pass: a white-walled court under red roofs, a round tower and two square ones. Take the rock's edge and the walls go with it.",
    "Dracula's house! I brought garlic, a crucifix and fourteen tons of high explosive. Covering all the bases.", 'Vlad nu a locuit niciodată aici. Dar pe tine te vom îngropa aici.', "Bleh, bleh, I vant to suck your blood. Yeah, I do the accent too, pal."],
  bucharest: ['Parliament Adjourned', 'THE HOUSE OF THE PEOPLE',
    'The heaviest building in the world: marble ranges round a court and a core rising over them.',
    'The heaviest building ever built: four marble ranges round an inner court and a core rising seventy metres over them, a thousand rooms. It will not fall over. It has to be taken apart.',
    "Heaviest building on Earth, and it's sinking. Reminds me of my uncle Earl.", 'Are mai multe camere decât ai tu obuze.', "Didn't understand him. Didn't need to. His face said 'please don't'. My face says 'oh, I will'."],
  kronborg: ['Something Is Rotten', "HAMLET'S CASTLE",
    'Four ranges round a court on the sound, copper spires on the towers, bastions under them.',
    'The Renaissance castle at Helsingør: four sandstone ranges round a courtyard under green copper roofs and spires, on the bastions that command the Øresund.',
    "This is Hamlet's castle, right? Hamlet. The cigar guy. My kinda guy.", 'Holger Danske sover i kælderen. Han vågner, når Danmark er i fare.', "Danish? Like the pastry? I could eat. Somebody get me a Danish and a fire mission."],
  stockholm: ['Stockholm Syndrome', 'THE ROYAL PALACE',
    'A great square palace round an inner court, two wings reaching for the water. Six hundred rooms.',
    'The royal palace on Stadsholmen: four ranges round a courtyard and two wings on the harbour side, flat roofs behind a balustrade, six hundred rooms.',
    "Six hundred rooms. Bet they came flat-packed.", 'Du hittar ingen monteringsanvisning för att riva det här.', "Bork bork bork. I watched the Muppets, pal. I know exactly what you said."],
  hallgrimskirkja: ['Basalt and Battery', 'THE ORGAN PIPES',
    'A concrete tower stepped like basalt columns, wings falling away either side, on a hill over Reykjavík.',
    'Seventy-four metres of concrete tower with stepped wings like columns of cooled lava, and the nave behind. The wings lean on the tower; the tower stands alone.',
    "That's a church? Looks like a pipe organ fell on a rocket.", 'Við höfum engan her. Við höfum kirkju og mikinn vind.', "Iceland, Greenland, whichever one's the green one, it ain't this one. Fire!"],
  trakai: ['Island Hopper', 'THE ISLAND CASTLE',
    'A red-brick castle on an island: a walled bailey, and a palace round its court with the donjon.',
    "The island castle of the Grand Dukes: a brick curtain round the outer bailey with round towers, and the ducal palace round its own court with the donjon over the gate.",
    "Castle on a lake. Real romantic. I'm gonna ruin it like I ruined my honeymoon.", 'Vytautas Didysis čia gyveno. Jis nemėgo svečių.', "I think he just told me to get off his lawn. Buddy, I'm about to rearrange your lawn."],
  winterpalace: ['Winter Is Coming Down', 'THE WINTER PALACE',
    'A green and white quadrangle on the Neva, two hundred metres of it, round a great court.',
    'Fifteen hundred rooms in four ranges round the Great Court, three storeys of windows behind white columns, green all the way round.',
    "Winter Palace. It's July, pal. Rename it.", "Твои туристы платят здесь двадцать долларов за вход. Ты заплатишь дороже.", "I heard 'dollars'. Nobody haggles with Buck Hollister. Put it on the tab, boys."],
  belem: ['Belém Me Up', 'THE RIVER TOWER',
    'A white bastion and tower in the Tagus, turreted and balconied, where the explorers sailed from.',
    'A Manueline fortress in the river: the bastion with its watchtower turrets and the five-storey tower behind it. Small, dense, and standing in the water.',
    "Is this a castle or a sandcastle? Either way the tide's coming in, and the tide is me.", 'Daqui partimos para descobrir o mundo. Tu só descobriste o caminho errado.', "Something about explorers? Columbus, right? We already gave that guy a day off. Moving on."],
  salisbury: ['Spire Fall', 'THE TALLEST SPIRE IN ENGLAND',
    'A long, low cathedral with double transepts, and the tallest spire in England over the crossing.',
    'Nave, aisles, transepts and a hundred and twenty-three metres of spire on four crossing piers that were never meant to carry it, and bend under it to this day.',
    "Big pointy church in a field full of sheep. Real exciting, England.", "Do mind the spire, old chap. Constable painted it, and he'd be terribly cross.", "Constable? You calling the cops on me? Go ahead, pal. I'll wait."],
  windsor: ['Windsor Knot Standing', 'THE ROUND TOWER',
    'The oldest occupied castle in the world: the Round Tower on its mound and the Upper Ward round it.',
    "The Round Tower on its motte, the Upper Ward's walls and towers, the state apartments and St George's. Nine hundred years in continuous use.",
    "Knock knock! Is the Queen home? Tell her the colonies stopped by.", 'His Majesty is not at home, and if he were, he would not receive you.', "His Majesty? What happened to the Queen? ...Oh. Well. Awkward. Fire anyway."],
  nidaros: ['Nidaros Nada', "THE PILGRIMS' CATHEDRAL",
    "Norway's national sanctuary in green soapstone: twin west towers and a spire over the crossing.",
    'The northernmost medieval cathedral, over the grave of St Olav: a west front of two towers, a nave and aisles, and the crossing spire, in grey-green soapstone.',
    "Norway, Sweden, Denmark. Pick one, pal. I'm shelling all three eventually.", 'Olav den hellige ligger her. Han var vikingkonge før han ble helgen.', "I heard 'Viking'. Minnesota's got a football team called that. They stink. So does this church."],
  helsinki: ['Helsinki Sunk', 'THE WHITE CATHEDRAL',
    'A white Greek cross with a green dome and four small ones, on a stair above Senate Square.',
    'The cathedral on its podium over Senate Square: a white Greek cross of four arms, the drum and green dome in the middle and a small dome on each corner.',
    "It's July and it's still cold. What kind of country is this? Get me a sweater and a howitzer.", 'Talvisodassa emme antaneet periksi. Emme anna nytkään.', "That language is all vowels. Aaa-eee-ooo. Here's some vowels for ya: KA-BOOM."],
  chillon: ['Chillon Out', 'THE LAKE CASTLE',
    'A castle on a rock in Lake Geneva: walls with round towers, a square keep, halls under red roofs.',
    'The castle on its island rock off Veytaux: a ring of walls and round towers, the square keep in the middle and the great halls either side under red roofs.',
    "A castle on a lake with mountains behind it. Looks like the lid of a chocolate box.", "La Suisse est neutre, général. Pas à ce point-là.", "Switzerland. Neutral. So you won't shoot back? Perfect. Best deal I've made all week."],
  saintsava: ['Sava Nothing', 'THE WHITE TEMPLE',
    'One of the largest Orthodox churches in the world: a white Greek cross and a green dome over it.',
    'A white Greek cross of four arms round a central drum, the green copper dome seventy metres over the floor, and small domes at the corners.',
    "Biggest church in the Balkans. I don't know where the Balkans are, but I'm in 'em, so let's go.", 'Ovaj hram smo gradili sto godina. Nećeš ga srušiti za jedan dan.', "Okay, I got nothing. Not one word. Could've been a recipe. Blow it up."],
  taipei101: ['101 Down', 'THE BAMBOO TOWER',
    'Eight flared segments stacked like bamboo on a tapered base, the spire over them.',
    "Five hundred metres of stacked segments, each flaring outward, on a tapering base, with a damper in the top that holds it still in a typhoon. It won't hold still for this.",
    "A skyscraper made of stacked-up flowerpots. Somebody's grandma designed this.", '這棟樓扛過颱風和地震，你又算什麼？', "Typhoon? I heard typhoon. Typhoon Buck, category five. Batten down."],
  shanghaitower: ['Shang-High and Dry', 'THE SUPERTALL',
    'Six hundred metres of glass tapering as it rises, over the Huangpu.',
    'The tallest building in China: a round glass tower tapering from its podium to a crown six hundred metres up. Most of it is the concrete core, and that is the target.',
    "It's all twisted up like a wet towel. What's it trying to do, dance?", '上海中心扭转了一百二十度来抵御台风。你扭不动它。', "Didn't get a word, but it sounded like a threat and I love a threat. Twist THIS."],
  wildgoose: ['Wild Goose Chased', 'THE WILD GOOSE PAGODA',
    'A seven-storey brick pagoda on a platform, stepping in storey by storey.',
    'Seven storeys of brick built for the scriptures Xuanzang carried back from India, stepping in with each storey, on its square platform.',
    "Wild Goose Pagoda. I hunt geese in Arkansas, pal. This is my thing.", '玄奘走了十七年去取经。你撑不过十七分钟。', "He's counting. He's counting at me. Nobody counts at me. Fire!"],
  landmark81: ['Landmark Lowered', 'THE BUNDLE',
    'Glass tubes of different heights bundled round a core: the tallest building in Vietnam.',
    'Four hundred and sixty metres of glass tubes bundled round a core like bamboo stalks, each stopping at its own height, on the Saigon River.',
    "Eighty-one floors and I bet the elevator's broken. Nah. I'll bring the top floor down to me.", 'Đây là tòa nhà cao nhất Việt Nam. Anh không làm nó thấp đi được đâu.', "Pho? Did he say pho? I'll take a large. And a fire mission on the eighty-first floor."],
  boudhanath: ['Stupa Stupor', 'THE GREAT STUPA',
    'A white dome on three terraces and a gilded tower painted with the Buddha\'s eyes. Solid.',
    "One of the largest stupas in the world: three square terraces, a white dome, the harmika with its painted eyes and the gilded spire of thirteen steps. Solid; it must be quarried.",
    "Why's the building looking at me? Stop looking at me, building.", 'यो स्तूपले धेरै भूकम्प सहेको छ। तिमी अर्को एउटा भूकम्प मात्र हौ।', "Namaste to you too, pal. Nama-stay outta my way."],
  victoriamemorial: ['Not Amused', 'THE WHITE MEMORIAL',
    'White marble round a central dome with the Angel of Victory on it, domed towers at the corners.',
    'The marble memorial on the Maidan: a central dome with the bronze Angel of Victory, four wings and four domed corner towers, in the same stone as the Taj.',
    "A big white palace for Queen Victoria. Like the underwear store? Classy.", 'यह संगमरमर उसी खान का है जिससे ताजमहल बना। यह भी वैसे ही टिकेगा।', "The Taj? I heard Taj. Did the Taj. Got the T-shirt. Want the T-shirt? No? Fire."],
  hawamahal: ['Blown Away', 'THE PALACE OF WINDS',
    'Five storeys of pink sandstone screen and nine hundred windows, one room deep.',
    'Nine hundred and fifty-three windows in a pink sandstone screen five storeys high and barely a room deep, stepping in to the top. All face, no body.',
    "It's a pink wall with holes in it. Somebody put a lotta work into a very fancy fence.", 'हवा महल से हवा आर-पार जाती है। तुम्हारे गोले भी निकल जाएंगे।', "Hawa? Hawaii? No. This is not Hawaii. Hawaii is ours. This is getting shelled."],
  redfort: ['Fort Knocks', 'THE RED FORT',
    'Red sandstone ramparts with domed pavilions, the Lahori Gate between its towers, and a pillared hall.',
    'The Mughal fort\'s red sandstone ramparts with octagonal domed towers, the Lahori Gate between its two towers, and the columned Hall of Public Audience inside.',
    "Big red fort. Red's my favourite colour. It's the colour of what happens next.", 'इन दीवारों ने मुग़ल, अंग्रेज़ और आज़ादी सब देखे हैं। तुम कुछ नहीं हो।', "Mughal? Like a mogul? A big shot? Buddy, I'm the big shot here."],
  gatewayindia: ['Gateway Out', 'THE GATEWAY',
    'A basalt arch on the Mumbai waterfront, four turrets at its corners and halls either side.',
    'The arch on Apollo Bunder: twenty-six metres of yellow basalt with a pointed central opening, four octagonal turrets at its corners and a hall on each side.',
    "A big arch on the water. A gateway to what? The water? So it's a door to nothing.", 'यह द्वार अंदर आने के लिए नहीं, बाहर जाने के लिए है।', "Everybody keeps making speeches at me. Nobody ever brings snacks. Fire!"],
  osaka: ['Castle Crashers', 'THE GOLDEN KEEP',
    'A five-roofed keep of white walls and green roofs on a battered stone base.',
    "The keep of Hideyoshi's castle on its sheer stone base: five tiers of white walls under green copper roofs, the fish on the ridge in gold. The base stands; the keep does not.",
    "It's a castle with an elevator in it. That's cheating. I respect it, but that's cheating.", 'この城は何度も燃えた。そのたびに建て直した。', "Arigato. That's the only one I know, so I'm saying it back. Arigato. Fire."],
  kinkakuji: ['Gold Rush', 'THE GOLDEN PAVILION',
    'Three storeys in gold leaf over a pond. Small, light and very shiny.',
    'A three-storey pavilion over the Mirror Pond, the upper two covered in gold leaf, the phoenix on the roof. Small, and one of the most famous buildings in Japan.',
    "A gold house on a pond. Somebody's showing off, and for once it isn't me.", '金閣は一度燃えた。二度目はない。', "I think he bowed at me. Do I bow back? I'm bowing back. Now get down, it's gonna get loud."],
  juche: ['Torch Song', 'THE TOWER OF THE IDEA',
    'A granite obelisk a hundred and seventy metres high with a red torch on top, over the Taedong.',
    'A tapered granite obelisk in seventy tiers on a base over the river, with a twenty-metre red torch on its summit.',
    "Big stone candle. Somebody tell the guy with the haircut I'm here.", '우리 탑은 영원히 선다.', "Five words. That's it? This guy's even worse at small talk than me."],
  monas: ['Flameout', 'THE NATIONAL MONUMENT',
    'A marble obelisk with a gilded flame, rising from a cup-shaped plinth in Merdeka Square.',
    'A hundred and thirty-two metres of marble obelisk on a stepped cup in the middle of Merdeka Square, crowned with a flame of gold leaf.',
    "Fifty kilos of gold on a stick, and they just leave it up there? Anybody could take it. Like me.", 'Emas itu milik rakyat Indonesia.', "'Emas'... sounds like Xmas. Merry Christmas, pal. It's coming down the chimney."],
  prambanan: ['Shiva Me Timbers', 'THE SHIVA TEMPLE',
    'A stepped shrine forty-seven metres high among four smaller temples on a terrace. Solid stone.',
    'The central Shiva temple, forty-seven metres of stepped andesite, among its companion shrines on the inner terrace. Solid stone; quarried, not toppled.',
    "A bunch of pointy temples next to a volcano. Who picks a spot like this? A crazy person, that's who.", 'Candi ini selamat dari gempa bumi dan gunung berapi.', "Sounded like a no. I don't take no. I take yes, and pictures of the rubble."],
  minarpakistan: ['Minar Setback', 'THE MINAR',
    'A tapering white tower on four platforms, a gallery round its shaft and a dome on top.',
    'Sixty-two metres of tapering tower faced in marble on four platforms, with a gallery two thirds of the way up and a dome on the top.',
    "A tall pointy thing in a park. Is that a rocket? Tell me that's not a rocket.", 'یہ مینار قوم کے عزم کی علامت ہے۔', "Okay. Big speech, lotta feelings, real moving. Now move."],
  lotustower: ['Lotus Position', 'THE LOTUS',
    'A concrete shaft with a lotus bud of a pod near the top: the tallest tower in South Asia.',
    'Three hundred and fifty metres of concrete: a podium, a slender shaft, the bulb of the lotus bud near the top, and the mast.',
    "A giant purple flower on a stick. Whoever green-lit this, I like 'em.", 'A lotus grows out of the mud, General. It does not fall back into it.', "Mud? I love mud. I've been in mud since Fort Benning. Let's get muddy."],
  bayterek: ['Egg Drop', 'THE POPLAR',
    'A white trunk with a golden ball in its crown: the egg of the bird of legend.',
    'A hundred and five metres of white trunk holding up a golden ball twenty-two metres across: the egg the bird Samruk laid in the tree of life.',
    "A golden egg on a stick. I'm making an omelette.", 'Самұрықтың жұмыртқасын ешкім ала алмайды.', "Kazakhstan. Borat, right? Very nice. High five. Now get down."],
  registan: ['Madrasa Mayhem', 'THE SQUARE',
    'Three madrasas round a square: tall portals, minarets at their corners, a blue dome.',
    "Ulugh Beg's madrasa, Sher-Dor and Tilya-Kori round the Registan: three great portals with minarets at their corners, their courts behind, and Tilya-Kori's dome.",
    "Three schools on one square. Class dismissed.", "Ulug'bek bu yerda yulduzlardan dars bergan.", "Whatever he said, the tiles are real pretty. Somebody take a picture for my wife before we start."],
  flametowers: ['Flame Out', 'THE FLAMES',
    'Three glass towers shaped like flames over the Caspian, the tallest a hundred and eighty metres.',
    "Three curved glass towers in the shape of flames, the land of fire's own emblem, on the hill over Baku Bay. Their tops are pointed and hollow.",
    "Three towers shaped like fire. I brought the real thing.", 'Bu torpaq odlar yurdudur. Biz oddan qorxmuruq.', "He keeps saying 'od'. Odd? Yeah, they're odd. Odd-looking towers. Let's fix that."],
  azadi: ['Arch Nemesis', 'THE FREEDOM TOWER',
    'A white marble arch forty-five metres high: a pointed vault between two splayed legs, a room in the crown.',
    'Eight thousand blocks of white marble in a pointed arch on two splayed legs, with a museum in the crown above the vault. The legs carry everything.',
    "It's a giant upside-down Y. Why? What's the Y for? Y are we here?", 'این برج از هشت هزار سنگ ساخته شده. تو یکی را هم نمی‌توانی تکان بدهی.', "He said 'hazar'. That's hazard. He's warning me about a hazard. Pal, I AM the hazard."],
  kingdomcentre: ['Bottle Opened', 'THE BOTTLE OPENER',
    'A tapering glass tower with a parabolic hole through its top and a skybridge over the gap.',
    "Three hundred metres of glass tapering to an arch, the hole through the top spanned by a skybridge. The arch's two legs hold the top up.",
    "Everybody calls it the bottle opener. Let's crack one open.", 'هذا البرج يحمل جسراً في السماء.', "Hot. So hot. Whatever that was, say it in the shade next time. Fire!"],
  baalbek: ['Bacchus Off', 'THE TEMPLE OF BACCHUS',
    'A Roman temple on a high podium, ringed by nineteen-metre columns. Columns and a roof.',
    'The temple of Bacchus at Heliopolis: a peristyle of Corinthian columns nineteen metres tall round the cella, on a podium five metres high. No windows, only columns.',
    "The Romans built this for the god of wine. Pour one out, boys.", 'هذه الحجارة أكبر من دبّابتك.', "He's pointing at the rocks. Yeah, they're big rocks. I got big rocks too, pal, and mine explode."],
  ur: ['Ur Done', 'THE ZIGGURAT',
    'A mud-brick ziggurat of two stages with a shrine on top. Four thousand years old.',
    'The Great Ziggurat of Ur-Nammu: two stages of mud brick faced in fired brick, a shrine on top and a gate before it. Solid and wide: quarry it.',
    "Somebody stacked a pile of mud bricks in the desert and called it holy. Looks like my nephew's sandcastle.", 'هذا أقدم من بلدك بثلاثة آلاف وسبعمئة سنة.', "Too long, didn't listen. Boys, kick over the sandcastle."],
  djoser: ['Step Down', 'THE STEP PYRAMID',
    'The first pyramid: six steps of stone, and the colonnade of the enclosure. Solid.',
    "Imhotep's step pyramid at Saqqara, the oldest stone building of its size: six stepped stages of limestone and the colonnade of the entrance hall. Solid; quarry it.",
    "The first pyramid? It's got steps. Real pyramids are smooth. This is a knock-off.", 'إمحوتب بنى هذا قبل أن يعرف أحد كيف.', "Imhotep! The Mummy guy! I've seen that movie six times. Boys, it's cursed, shoot faster."],
  yamoussoukro: ['Basilica Blast', 'THE BASILICA',
    "A domed basilica bigger than St Peter's in the middle of the savanna, a colonnade before it.",
    "Our Lady of Peace: a dome of a hundred and fifty-eight metres on its drum, four arms, and a colonnade in front. Bigger than St Peter's and very far from Rome.",
    "A giant church in the middle of the jungle. Did somebody lose a bet?", 'Cette basilique est plus grande que Saint-Pierre de Rome.', "Peter? Who's Peter? Is Peter here? Peter, come out, I just want to talk. And shell."],
  cntower: ['CN Ya Later', 'THE TOWER',
    'A concrete shaft with the main pod and the SkyPod on it and a mast on top.',
    'Five hundred and fifty-three metres: a tapering concrete shaft, the main pod with its glass floor three hundred and forty metres up, the SkyPod above it, and the mast.',
    "Canada. America's hat. And this is the pointy bit on top of the hat.", "Sorry, but you'll have to take your boots off before you come in, eh.", "Take my boots off? In Canada? It's freezing. Boots stay on. Fire!"],
  frontenac: ['Check Out Time', 'THE CHÂTEAU',
    'A hotel in a castle\'s clothes: brick wings under steep copper roofs, turrets, and the central tower.',
    'The most photographed hotel in the world: brick wings under steep green copper roofs, turrets on the corners and the central tower, on the cliff over the St Lawrence.',
    "A castle that's a hotel. Do I get points? I'd like to be a gold member.", 'Je me souviens. Toi, on va t\'oublier.', "Why's he speaking French? Is this France? Somebody told me this was Canada. Somebody's fired."],
  capitolio: ['Capitol Punishment', 'THE CAPITOL',
    'A long white hall with a portico in the middle and a dome ninety metres over it.',
    'The Capitolio in Havana: two long wings, the portico on its stair, and the dome ninety-two metres over the rotunda. Taller than the one in Washington.',
    "Hey, that's our Capitol. You copied our Capitol. And made it taller? That's just rude.", 'Nuestro Capitolio es más alto que el suyo. Y más bonito.', "'Más bonito'? More bonito? Isn't that a fish? You calling me a fish?"],
  bellasartes: ['Fine Arts Finished', 'THE PALACE OF FINE ARTS',
    'A white marble palace with a golden dome and domed corners, sinking into the old lakebed.',
    'Carrara marble on the soft bed of Lake Texcoco, sunk four metres since it was built: the central dome in orange and gold tile, four domed corner towers and the wings between.',
    "It's sinking into the ground all by itself. I'm basically a volunteer here.", 'El Palacio se ha hundido cuatro metros. Nunca se ha rendido.', "Palacio, patio, whatever. Pal, I don't care if it's a patio, it's coming down."],
  teatroamazonas: ['Curtain Call', 'THE OPERA IN THE JUNGLE',
    'A pink opera house in the rainforest under a dome of thirty-six thousand coloured tiles.',
    'An opera house in the middle of the Amazon, built with rubber money: the pink hall, the portico in front, and the dome of coloured tiles over the auditorium.',
    "An opera house in the Amazon. Who's coming to this? Monkeys? Monkeys in tuxedos?", 'Até o Caruso quis cantar aqui.', "Caruso? Sounds like a car. Park the car and duck, pal."],
  obelisco: ['Obelisk-o', 'THE OBELISK',
    'A white obelisk sixty-seven metres high in the middle of the widest avenue in the world.',
    'A sixty-seven metre obelisk in the Plaza de la República, one room inside and a window at the top. Slender, tall and all alone.',
    "They copied the Washington Monument and made it smaller. Bold move, Argentina.", 'Che, el Obelisco es de todos los porteños.', "Che? Like the T-shirt guy? My nephew's got that shirt. He's an idiot too."],
  cartagena: ['San Felipe Flipped', 'THE CASTLE OF SAN FELIPE',
    'The greatest Spanish fortress in the Americas: bastions stepping up a hill, barracks on top.',
    'Castillo San Felipe de Barajas on the hill of San Lázaro: bastions stepping up in terraces, the barracks and sentry boxes on top. It has never been taken.',
    "Big stone fort in the tropics. It's humid. Why is everything I conquer humid?", 'Blas de Lezo nos defendió aquí con una pierna, un brazo y un ojo.', "He's pointing at his leg, his arm and his eye. Don't know what it means. Don't like it. Fire!"],
  skytower: ['Sky Fall', 'THE SKY TOWER',
    'The tallest free-standing structure in the Southern Hemisphere: a shaft, a pod and a mast.',
    'Three hundred and twenty-eight metres: a slender concrete shaft, the observation pod near the top and the mast above it. People jump off it for fun.',
    "People jump off this thing on a rubber band for fun. You people are nuts.", "Mate, the whole country's shaky. She'll be right.", "Wait. You're not Australian? Then who've I been yelling at this whole time?"],
};

// ── The generated tables ─────────────────────────────────────────────────

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LAYOUT = {};
const layoutOf = (id) => (LAYOUT[id] ||= layoutKit(SPECS[id]));

function levelRecord(P, i) {
  const spec = SPECS[P.id];
  const W = WORDS[P.id];
  const cl = CLIMES[P.clime];
  const L = layoutOf(P.id);
  const w = L.box.x1 - L.box.x0, d = L.box.z1 - L.box.z0, H = L.top.y;
  const target = P.landmark.toUpperCase();
  const reach = Math.hypot(Math.max(Math.abs(L.box.x0), Math.abs(L.box.x1)), Math.max(Math.abs(L.box.z0), Math.abs(L.box.z1)));
  const windows = L.posts.some((q) => q.kind === 'window');
  const setting = { haze: cl.haze, clime: P.clime };
  if (cl.roofPitch != null) setting.roofPitch = cl.roofPitch;
  if (WILD[P.id]) setting.hinterland = WILD[P.id];
  else if (P.coast) setting.hinterland = 'harbour';
  // Every level carries boats; the router puts them only on water it can
  // navigate, so a dry map shows none and a wet one is never empty.
  setting.fleet = FLEET[P.id] || (P.clime === 'tropical' ? ['sampan', 'country-boat'] : ['rowing', 'river-cruise']);
  const stones = 5000;
  return {
    id: P.id,
    terrain: P.id,
    lat: P.lat, lon: P.lon,
    name: target,
    place: P.city,
    target,
    subtitle: `${P.landmark}, ${P.city}`,
    victory: W[0],
    palette: Object.fromEntries(PAL_KEYS.map((k, j) => [k, C(cl.palette[j])])),
    setting,
    cityExcludeRadius: Math.round(spec.clear ?? reach + 30),
    contextExclude: Math.round((spec.clear ?? reach + 30) - 12),
    camera: {
      yaw: spec.yaw ?? 0.45,
      pitch: 0.12,
      distance: Math.round(clamp(Math.max(w, d) * 1.5 + H * 0.9, 260, 820)),
      // High enough to see over the town: a supertall in a business district
      // has towers of its own round it, and a camera at a third of its height
      // looked at the side of the nearest one.
      // Capped, but not below half a supertall: at 240 m the top of the
      // Shanghai Tower was out of the top of the opening frame.
      height: Math.round(clamp(Math.max(H * (H > 150 ? 0.6 : 0.35), clamp(Math.max(w, d) * 1.5 + H * 0.9, 260, 820) * 0.2), 30, Math.max(240, H * 0.52))),
    },
    structures: (quality) => [
      { key: P.id, blocks: buildKit(spec, quality), primary: true, required: true, label: target },
    ],
    garrison: (g, origin, groundY) => populateKit(L, g, origin, groundY, P.garrison || {}),
    scoreTags: L.tags,
    precinct: { boundary: 'none', ground: cl.ground, ornament: 'none' },
    // Every catalogued building is won by breaking it, not by leaning it:
    // the kit lays hollow walls on wide footings, and what goes over goes
    // over as part of taking it apart. The river and the lines-blocked tests
    // are about hand-made precincts and openwork these do not have.
    // A solid mass (a stupa's dome on its terraces) holds round a shell hole
    // rather than dropping loose stone; its spec says so.
    traits: { windows, river: false, topples: false, remote: !!P.remote, opaque: false, ...(spec.sheds === false ? { sheds: false } : {}) },
    unlockScale: 1,
    par: { rounds: Math.round(40 + stones / 150), spend: 14000, minutes: 5, leverage: 2 },
    brief: W[3],
    ...(P.startMoney ? { startMoney: P.startMoney } : {}),
    ...(P.unlockAll ? { unlockAll: true } : {}),
    ...(P.freeBuild ? { freeBuild: true } : {}),
    ...(P.intros === false ? { intros: false } : {}),
    ...(P.fieldWorksShare != null ? { fieldWorksShare: P.fieldWorksShare } : {}),
    ...(P.aim ? { tutorialAim: { x: P.aim.x * spec.S, y: P.aim.y * spec.S, z: P.aim.z * spec.S } } : {}),
    // A pad the bake declared land is levelled to its own height, not to the
    // water round it.
    ...(P.padH != null ? { groundLevel: 'bake' } : {}),
    atlas: i,
  };
}

/** Level records, keyed by id, in catalogue order. */
export const ATLAS_LEVELS = Object.fromEntries(PLACES.map((P, i) => [P.id, levelRecord(P, i)]));
export const ATLAS_ORDER = PLACES.map((P) => P.id);
/** Boot Camp: a level record like the rest, outside the campaign's order. */
export const TUTORIAL_LEVEL = levelRecord(TUTORIAL_PLACE, -1);
export const ATLAS_BLURB = Object.fromEntries(PLACES.map((P) => [P.id, WORDS[P.id][2]]));

/** Contracts, numbered from `first`. */
export function atlasContracts(first) {
  return PLACES.map((P, i) => ({
    id: P.id,
    iso: P.iso,
    lx: i % 2 ? -110 : 40, ly: i % 2 ? 10 : -14,
    city: P.city.toUpperCase(),
    lon: P.lon, lat: P.lat,
    no: first + i,
    title: WORDS[P.id][1],
    brief: WORDS[P.id][3],
    unlocks: [],
    unlockLine: 'Nothing new — the arsenal is what it is',
  }));
}

export const ATLAS_DEFENDER_OF = Object.fromEntries(PLACES.map((P) => [P.id, P.code]));

export const ATLAS_STANDOFF = Object.fromEntries(PLACES.map((P) => {
  const W = WORDS[P.id];
  return [P.id, [{ who: 'us', line: W[4] }, { who: P.code, line: W[5] }, { who: 'us', line: W[6] }]];
}));

export const ATLAS_FLAG_SITES = Object.fromEntries([...PLACES, TUTORIAL_PLACE].map((P) => {
  const L = layoutOf(P.id);
  const pattern = OLD_PATTERN[P.code] || (P.code === 'us' ? 'usa' : `atlas-${P.code}`);
  return [P.id, [{ key: P.id, x: L.top.x, y: L.top.y, z: L.top.z, pattern, w: 9, h: 6, pole: 10 }]];
}));
