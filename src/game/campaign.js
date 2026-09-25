import { LEVELS, LEVEL_ORDER } from './levels.js';
import { loadProgress } from '../ui/levelselect.js';

/**
 * The campaign.
 *
 * Nine contracts, in one order, each one a country on the map. The order is not
 * decoration: the arsenal opens up as contracts are closed, so London is fought
 * with light guns and Egypt with whatever is left of the air force, and a
 * player who arrives at the Great Pyramid with an AT4 has been sent there by
 * the game rather than by their own bad idea.
 *
 * The first five contracts each release a rung of the arsenal and the last four
 * release nothing, because by then there is nothing left to hand over. That is
 * deliberate: the back half of the campaign is not harder because the guns are
 * bigger on the other side, it is harder because a leaning tower, nine towers on
 * one podium, a shell vault over water and a statue on a mountain cannot be
 * solved by bringing more.
 *
 * Two things are tracked and they are not the same. `tt.progress` already knows
 * which levels have been won and what the best run was; that is the record of
 * play and it belongs to the level. This knows which *contracts* are closed and
 * which of their objectives were met, which is the record of the campaign and
 * belongs to the map. Keeping them apart means replaying a finished contract
 * can improve a score without the map pretending the war is still on.
 */

const KEY = 'tt.campaign';

/**
 * Where each contract is, and what the client wants.
 *
 * Coordinates are the landmark's own, not the capital's: the fire starts at the
 * building and runs out to the border from there, so Giza burns from the
 * pyramids up the Nile rather than from a dot on Cairo.
 *
 * `lx`/`ly` push the label off its own pin, in map units. London and Paris are
 * three hundred and forty kilometres apart, which at the width of a phone is
 * four pixels, and the two names printed straight through each other.
 */
export const THEATRES = [
  {
    id: 'westminster',
    iso: 'GBR',
    lx: -52, ly: -30,
    city: 'LONDON',
    lon: -0.1246, lat: 51.4994,
    no: 1,
    title: 'THE CLOCK',
    brief: 'Ninety-six metres of Anston stone on four walls and a hollow shaft. '
      + 'The client wants it in the river. Open one face and it will go that way '
      + 'on its own.',
    unlocks: ['m109'],
    unlockLine: 'Paladin self-propelled howitzer released',
  },
  {
    id: 'paris',
    iso: 'FRA',
    lx: 44, ly: 26,
    city: 'PARIS',
    lon: 2.2945, lat: 48.8584,
    no: 2,
    title: 'FOUR LEGS',
    brief: 'Seven thousand tonnes of wrought iron standing on nothing but its '
      + 'own piers. It will not be shelled down like masonry — it has to be cut. '
      + 'Take a leg and it falls towards the gap.',
    unlocks: ['f15'],
    unlockLine: 'Close air support released',
  },
  {
    id: 'agra',
    iso: 'IND',
    lx: 46, ly: -22,
    city: 'AGRA',
    lon: 78.0421, lat: 27.1751,
    no: 3,
    title: 'THE DOME',
    brief: 'A marble shell on four piers over a terrace the size of a parade '
      + 'ground. Nothing here topples. The dome has to be broken, and the piers '
      + 'under it are the only thing holding the roof up.',
    unlocks: ['m142'],
    unlockLine: 'HIMARS released',
  },
  {
    id: 'giza',
    iso: 'EGY',
    lx: -14, ly: 34,
    city: 'GIZA',
    lon: 31.1342, lat: 29.9792,
    no: 4,
    title: 'THE MOUNTAIN',
    brief: 'Two and a third million cubic metres of limestone that has stood for '
      + 'four and a half thousand years. It cannot fall over. There is nothing to '
      + 'undercut and nothing to topple: it comes down by being removed.',
    unlocks: ['m270'],
    unlockLine: 'M270 rocket artillery released',
  },
  {
    id: 'chichen',
    iso: 'MEX',
    lx: -48, ly: 30,
    city: 'CHICHEN ITZA',
    lon: -88.5687, lat: 20.6829,
    no: 5,
    title: 'THE ONE INSIDE',
    brief: 'Nine limestone terraces the Maya raised over a pyramid they had '
      + 'already finished. Cut into the flank and you are not opening a core, you '
      + 'are opening the older building — and the top of the new one is standing '
      + 'on its roof.',
    unlocks: ['b1'],
    unlockLine: 'Heavy bomber on call',
  },
  {
    id: 'pisa',
    iso: 'ITA',
    lx: 30, ly: 58,
    city: 'PISA',
    lon: 10.3966, lat: 43.7230,
    no: 6,
    title: 'ALREADY FALLING',
    brief: 'Eighty-nine metres of marble that has been going over for eight '
      + 'hundred years and has not arrived. It is bent rather than tilted: the '
      + 'part that overhangs is the part the masons corrected, and it is the '
      + 'only part of the tower that is safe.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'sydney',
    iso: 'AUS',
    lx: -62, ly: 22,
    city: 'SYDNEY',
    lon: 151.2153, lat: -33.8568,
    no: 7,
    title: 'ONE ROAD IN',
    brief: 'Fourteen concrete shells on a headland with water on three sides. '
      + 'There is no mass here and nothing above the roof, so shelling the '
      + 'roof achieves a hole in the roof. An arch dies at its haunches, and '
      + 'the haunches are at deck level behind the glass.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'moscow',
    iso: 'RUS',
    lx: 44, ly: -22,
    city: 'MOSCOW',
    lon: 37.6231, lat: 55.7525,
    no: 8,
    title: 'NINE OF THEM',
    brief: 'Nine churches on one basement, and no single cut wins: every tower '
      + 'here is its own column of brick standing on its own square of '
      + 'foundation, and dropping the middle one leaves eight watching. What '
      + 'they share is underneath them.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'rio',
    iso: 'BRA',
    lx: 46, ly: 24,
    city: 'RIO DE JANEIRO',
    lon: -43.2105, lat: -22.9519,
    no: 9,
    title: 'OPEN ARMS',
    brief: 'Seven hundred metres up, and the part everybody shoots weighs '
      + 'nothing. The arms are twenty-eight metres of concrete carrying only '
      + 'themselves; take both and the statue stands exactly as it did. What '
      + 'holds it up is two legs into a chapel with a door in it.',
    unlocks: [],
    unlockLine: 'The board is clear',
  },
  // ── The third five. Nothing new is released here either: the arsenal is
  // complete by contract five, and these are the contracts it was for.
  {
    id: 'athens',
    iso: 'GRC',
    lx: -44, ly: 22,
    city: 'ATHENS',
    lon: 23.7266, lat: 37.9715,
    no: 10,
    title: 'MARBLE ORDER',
    brief: 'Forty-six columns and a stone lintel across the top of every pair. '
      + 'Nothing here is fixed to anything: the drums sit on the drums and the '
      + 'beams sit on the capitals, and it has stood on friction for two and a '
      + 'half thousand years. Take the columns from under a corner and the '
      + 'corner comes down with the roof it carried.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'istanbul',
    iso: 'TUR',
    lx: 44, ly: -22,
    city: 'ISTANBUL',
    lon: 28.9801, lat: 41.0086,
    no: 11,
    title: 'HOLY WISDOM',
    brief: 'A dome fifty metres up on four arches, and it has fallen in twice. '
      + 'What holds it is not the arches but the half-domes and the buttresses '
      + 'leaning in against them from outside; open one side and the thrust '
      + 'has nowhere to go.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'cologne',
    iso: 'DEU',
    lx: 44, ly: -20,
    city: 'COLOGNE',
    lon: 6.9583, lat: 50.9413,
    no: 12,
    title: 'TWIN SPIRES',
    brief: 'Two stone spires a hundred and fifty metres high, hollow, pierced, '
      + 'and standing on nothing but their own piers. Gothic stone is stone '
      + 'doing as little work as it can get away with: cut a pier and the '
      + 'spire above it follows.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'himeji',
    iso: 'JPN',
    lx: 44, ly: 22,
    city: 'HIMEJI',
    lon: 134.6939, lat: 34.8394,
    no: 13,
    title: 'WHITE HERON',
    brief: 'Six storeys of timber and plaster on a sloping stone base on a hill. '
      + 'The base cannot be shot down; the keep on it can, and it is top-heavy '
      + 'by design. It goes over the way you lean it.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'petronas',
    iso: 'MYS',
    lx: 38, ly: 26,
    city: 'KUALA LUMPUR',
    lon: 101.7117, lat: 3.1579,
    no: 14,
    title: 'TWIN BILLING',
    brief: 'Two four-hundred-metre towers on concrete cores, joined halfway up '
      + 'by a bridge that is tied to neither of them. It sits on bearings and '
      + 'slides, because the towers sway apart on a windy afternoon. Shoot it '
      + 'and it costs them nothing. Both towers are the contract.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'dubai',
    iso: 'ARE',
    lx: 46, ly: 20,
    city: 'DUBAI',
    lon: 55.2744, lat: 25.1972,
    no: 15,
    title: 'THE NEEDLE',
    brief: 'Half a kilometre of concrete core and glass, stepping back as it '
      + 'climbs. Everything above a setback stands on the setback under it; '
      + 'take the core at one and the tower above it is a free body with a '
      + 'long way to fall.',
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'potala',
    iso: 'CHN',
    lx: -46, ly: -26,
    city: 'LHASA',
    lon: 91.1172, lat: 29.6578,
    no: 16,
    title: 'THE RED HILL',
    brief: 'Four hundred and fifty metres of battered wall, four metres thick '
      + 'at the head and bonded to a rock outcrop three and a half kilometres '
      + 'up. Nothing here leans and nothing here goes over. The white palace '
      + 'is a curtain of quarters; the red one in the middle is the contract.',
    unlocks: [],
    unlockLine: 'The board is clear',
  },
  {
    id: 'colosseum',
    iso: 'ITA',
    lx: 40, ly: 26,
    city: 'ROME',
    lon: 12.4922, lat: 41.8902,
    no: 17,
    title: "BREAD AND CIRCUSES",
    brief: "An ellipse of travertine arches, three storeys high and eighty piers round. Where the cavea has gone the outer wall stands alone and two piers are all that hold a bay. Bring the ring down; the arena floor is not the contract.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'towerbridge',
    iso: 'GBR',
    lx: 44, ly: 26,
    city: 'LONDON',
    lon: -0.0761, lat: 51.5076,
    no: 18,
    title: "DRAWBRIDGE",
    brief: "Two granite-clad towers on piers in the Thames, tied by the walkways and carrying the side spans. The bascules between them weigh nothing you are paid for. Drop a tower and everything on it goes in the river.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'florence',
    iso: 'ITA',
    lx: -70, ly: -14,
    city: 'FLORENCE',
    lon: 11.2560, lat: 43.7731,
    no: 19,
    title: "IL DUOMO",
    brief: "The biggest brick dome ever raised, on a drum on four piers, held in by three apses. It will not topple; it has to be opened. Take a tribune and the drum spreads.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'segovia',
    iso: 'ESP',
    lx: -80, ly: 10,
    city: 'SEGOVIA',
    lon: -4.1180, lat: 40.9479,
    no: 20,
    title: "DRY STONE",
    brief: "Twenty thousand granite blocks and no mortar, in two tiers of arches sixty metres high. Every pier braces the two beside it. Take one and the chain unzips to the next wide pier.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'atomium',
    iso: 'BEL',
    lx: 44, ly: -10,
    city: 'BRUSSELS',
    lon: 4.3414, lat: 50.8949,
    no: 21,
    title: "SPLIT THE ATOM",
    brief: "Nine steel spheres on the edges of a cube standing on a point. The spheres are the weight; the tubes, the column and three bipods are the structure. Cut what carries and the molecule comes down.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'tokyotower',
    iso: 'JPN',
    lx: 44, ly: 22,
    city: 'TOKYO',
    lon: 139.7454, lat: 35.6586,
    no: 22,
    title: "RISING SUN",
    brief: "Three hundred and thirty metres of orange lattice on four legs, with the observatory at a hundred and fifty. Cut a leg and it goes toward the cut. The mass is low, so the fall is decided low.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'budapest',
    iso: 'HUN',
    lx: 44, ly: 22,
    city: 'BUDAPEST',
    lon: 19.0457, lat: 47.5070,
    no: 23,
    title: "HOUSE DIVIDED",
    brief: "Three hundred metres of Gothic limestone along the Danube with a dome on sixteen piers over the hall. The wings are mass and not the contract. Open the drum and the dome comes down through the hall.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'sagrada',
    iso: 'ESP',
    lx: 44, ly: 20,
    city: 'BARCELONA',
    lon: 2.1744, lat: 41.4036,
    no: 24,
    title: "UNFINISHED BUSINESS",
    brief: "Eighteen hollow stone spires on a nave, the tallest over the crossing on four columns. Every spire stands on four piers. Take two under the Jesus tower and it comes through the roof.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'edinburgh',
    iso: 'GBR',
    lx: 44, ly: -8,
    city: 'EDINBURGH',
    lon: -3.1998, lat: 55.9486,
    no: 25,
    title: "CASTLE ROCK",
    brief: "A fortress on a volcanic plug eighty metres over the town, sheer on three sides. The Half Moon Battery is a retaining wall holding the palace up; undercut it and the palace goes onto the Esplanade. The One O'Clock Gun shoots back.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'neuschwanstein',
    iso: 'DEU',
    lx: 44, ly: 14,
    city: 'SCHWANGAU',
    lon: 10.7497, lat: 47.5576,
    no: 26,
    title: "FAIRYTALE ENDING",
    brief: "A white limestone castle along a ridge above a gorge, its two towers on the corners of the Palas. The towers go over the way you lean them. The rock under the west wall is the way in.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'montstmichel',
    iso: 'FRA',
    lx: -110, ly: -8,
    city: 'MONT-SAINT-MICHEL',
    lon: -1.5114, lat: 48.6360,
    no: 27,
    title: "HIGH WATER",
    brief: "An abbey on an eighty-metre rock in a bay the tide covers. The church stands on crypts built out on the flanks. Break a crypt and the nave above it goes down the face.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'pena',
    iso: 'PRT',
    lx: -60, ly: 24,
    city: 'SINTRA',
    lon: -9.3906, lat: 38.7876,
    no: 28,
    title: "ROMANTIC RUIN",
    brief: "A red and yellow palace on a crag in the Sintra forest, with a round bastion on the cliff edge. The palace leans on the bastion. Take the bastion's footing and the terrace follows.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'hassan',
    iso: 'MAR',
    lx: -90, ly: 20,
    city: 'CASABLANCA',
    lon: -7.6326, lat: 33.6082,
    no: 29,
    title: "CALL TO PRAYER",
    brief: "The tallest minaret in the world on the corner of a prayer hall built out over the Atlantic. The hall roof is beams on seventy-eight columns. The minaret stands on the hall's corner piers.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'kuwait',
    iso: 'KWT',
    lx: 44, ly: 20,
    city: 'KUWAIT CITY',
    lon: 48.0028, lat: 29.3899,
    no: 30,
    title: "WATER TOWERS",
    brief: "Three concrete needles on a cape, two of them carrying spheres of water and restaurants. The spheres are the weight and the shafts are slender. Cut a shaft below its sphere.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'karnak',
    iso: 'EGY',
    lx: 44, ly: 20,
    city: 'LUXOR',
    lon: 32.6572, lat: 25.7188,
    no: 31,
    title: "HYPOSTYLE",
    brief: "A hundred and thirty-four sandstone columns under architraves and roof slabs, with pylons at each end. The lintels are the load path. Kick a column out and its two lintels come down and the next column carries a cantilever.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'forbidden',
    iso: 'CHN',
    lx: 44, ly: 20,
    city: 'BEIJING',
    lon: 116.3907, lat: 39.9159,
    no: 32,
    title: "SUPREME HARMONY",
    brief: "Three timber halls under yellow-glazed roofs on one white marble terrace. The terrace is ground and cannot be shot down. The halls are top-heavy by design and go over the way you lean them.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'gyeongbok',
    iso: 'KOR',
    lx: 44, ly: 16,
    city: 'SEOUL',
    lon: 126.9771, lat: 37.5786,
    no: 33,
    title: "THRONE ROOM",
    brief: "A throne hall with a two-tier grey roof on a granite terrace, in a courtyard ringed by cloisters. The terrace stands; the hall on it does not. The gate is scored with it.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'watarun',
    iso: 'THA',
    lx: 44, ly: 22,
    city: 'BANGKOK',
    lon: 100.4888, lat: 13.7438,
    no: 34,
    title: "TEMPLE OF DAWN",
    brief: "A seventy-metre prang encrusted in porcelain, with four satellites, on the west bank of the Chao Phraya. It is solid and has to be quarried. Undercut a terrace and that side's skin sheds.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'shwedagon',
    iso: 'MMR',
    lx: -90, ly: 8,
    city: 'YANGON',
    lon: 96.1496, lat: 16.7984,
    no: 35,
    title: "SIXTY TONS OF GOLD",
    brief: "A gilded brick stupa a hundred metres tall on a hill over Yangon, with sixty-four small stupas round its foot. It does not fall; it is quarried. The small stupas and the halls are the finesse.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'angkor',
    iso: 'KHM',
    lx: 44, ly: 22,
    city: 'SIEM REAP',
    lon: 103.8670, lat: 13.4125,
    no: 36,
    title: "TEMPLE MOUNTAIN",
    brief: "Five towers in quincunx on a pyramid base inside three galleries and a moat. The towers stand on the bakan's corner piers. The galleries are lintels over columns, and the stone is in them.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'borobudur',
    iso: 'IDN',
    lx: 44, ly: 24,
    city: 'MAGELANG',
    lon: 110.2037, lat: -7.6079,
    no: 37,
    title: "STONE MANDALA",
    brief: "Two million blocks of andesite in nine terraces with seventy-two bell stupas on the round ones. It is a hill with a stone skin. What scores is the top, not the hill.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'tikal',
    iso: 'GTM',
    lx: 44, ly: -10,
    city: 'TIKAL',
    lon: -89.6234, lat: 17.2218,
    no: 38,
    title: "ROOF COMB",
    brief: "A forty-seven-metre pyramid in nine terraces with a shrine and a hollow roof comb on top, facing its twin across the plaza. The comb stands on the shrine's back wall. Shoot its base and it topples whole.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'teotihuacan',
    iso: 'MEX',
    lx: -110, ly: 10,
    city: 'TEOTIHUACAN',
    lon: -98.8437, lat: 19.6925,
    no: 39,
    title: "CITY OF THE GODS",
    brief: "Two hundred and twenty metres square and sixty-five high in five tiers of rubble faced in stone. Nothing here falls over; it is quarried. There is a tunnel under the centre.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'machupicchu',
    iso: 'PER',
    lx: 44, ly: 20,
    city: 'MACHU PICCHU',
    lon: -72.5450, lat: -13.1631,
    no: 40,
    title: "LOST CITY",
    brief: "A citadel of dry ashlar on a saddle ridge four hundred metres over the Urubamba. Nothing is tall; the terraces are retaining walls and the temples stand on them. Work the retaining walls.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
  {
    id: 'greatwall',
    iso: 'CHN',
    lx: 44, ly: -14,
    city: 'BADALING',
    lon: 116.0200, lat: 40.3597,
    no: 41,
    title: "THE WALL",
    brief: "Five hundred metres of wall along a ridge crest with five watchtowers. The wall is full of rubble and will not topple. The towers do, and they are the contract.",
    unlocks: [],
    unlockLine: 'Nothing new — you have it all',
  },
];

/** The contract for a level id, if that level is one. */
export function theatreOf(id) {
  return THEATRES.find((t) => t.id === id) || null;
}

/**
 * The objectives on a contract.
 *
 * One that has to be met and two that pay. The optional pair are deliberately
 * pulling in opposite directions — one rewards going in hard and fast, the other
 * rewards not losing anything — so a run cannot casually satisfy both and the
 * player has to come back and fight it a different way.
 */
export function objectivesFor(id) {
  const lv = LEVELS[id];
  if (!lv) return [];
  return [
    {
      key: 'primary',
      label: lv.victory === 'Eiffel-down' ? 'Bring the tower down'
        : lv.traits && lv.traits.topples === false ? 'Break the structure'
          : 'Bring it down',
      test: (s, won) => !!won,
    },
    {
      key: 'quick',
      label: 'Finish inside eight minutes',
      test: (s) => s && s.time > 0 && s.time <= 480,
    },
    {
      key: 'clean',
      label: 'Finish without losing a gun',
      test: (s) => s && s.unitsLost === 0,
    },
  ];
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return (v && typeof v === 'object') ? v : {};
  } catch { return {}; }
}

function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
}

/** Whether the player has asked for every contract to be open at once. */
export function freeDeploy() {
  return read().free === true;
}
export function setFreeDeploy(on) {
  const v = read();
  v.free = !!on;
  write(v);
}

/**
 * The state of the war, as the map draws it.
 *
 * A contract is `down` once its level has been won — read from the level
 * record rather than from anything here, so a win registered before the
 * campaign existed still counts and the map is never behind the game.
 */
export function campaignState() {
  const prog = loadProgress();
  const saved = read();
  const free = saved.free === true;
  let openedNext = false;
  const list = THEATRES.map((t) => {
    const rec = prog[t.id] || {};
    const down = !!rec.won;
    return {
      ...t,
      down,
      runs: rec.runs || 0,
      bestScore: rec.bestScore || 0,
      bestTime: rec.bestTime ?? null,
      met: (saved.met && saved.met[t.id]) || {},
      open: false,
    };
  });
  for (const t of list) {
    if (t.down) { t.open = true; continue; }
    if (free) { t.open = true; continue; }
    if (!openedNext) { t.open = true; openedNext = true; }
  }
  const done = list.filter((t) => t.down).length;
  return { list, done, total: list.length, free, next: list.find((t) => !t.down) || null };
}

/** The contracts closed before this one, which is what decides the arsenal. */
function closedCount() {
  const prog = loadProgress();
  return THEATRES.filter((t) => prog[t.id]?.won).length;
}

/**
 * Which weapons the campaign has released.
 *
 * The towed guns are issued from the start — a contract nobody can open is not
 * a campaign, it is a wall, and the Elizabeth Tower is thirty-two thousand
 * stones to be got through with what you are given. Each of the first five
 * contracts releases the next rung, and the four after them release nothing,
 * because Chichen Itza is the contract you come out of holding everything.
 * This gate sits *on top of* the per-level unlock: a weapon has to be released
 * by the campaign and earned inside the level, which is why turning up at the
 * Great Pyramid with rockets still means working up to them.
 */
export function releasedUnits() {
  const out = new Set(['at4', 'gustaf', 'rpg32', 'javelin', 'm119', 'm777']);
  const prog = loadProgress();
  for (const t of THEATRES) {
    if (!prog[t.id]?.won) continue;
    for (const u of t.unlocks) out.add(u);
  }
  return out;
}

export function isReleased(unitId) {
  // Anything the campaign has no opinion about stays available, so adding a
  // weapon to the arsenal never silently removes it from every level.
  if (!THEATRES.some((t) => t.unlocks.includes(unitId))) return true;
  return releasedUnits().has(unitId);
}

/**
 * Which country is owed a fire, and marking that it has had one.
 *
 * The burn plays exactly once: the first time the map is opened after the
 * contract closed. Replaying a finished level does not set the country alight
 * again, and neither does coming back to the menu a second time — it is already
 * black by then, and a country that catches fire every time you look at it is a
 * screensaver rather than a result.
 */
export function pendingBurn() {
  const seen = read().burnt || {};
  const prog = loadProgress();
  const t = THEATRES.find((k) => prog[k.id]?.won && !seen[k.iso]);
  return t ? t.iso : null;
}

export function markBurnSeen(iso) {
  const v = read();
  v.burnt = v.burnt || {};
  v.burnt[iso] = true;
  write(v);
}

/**
 * Record how a contract went.
 *
 * Objectives are sticky: a player who finishes fast on one run and clean on the
 * next has met both, which is the only reading that makes coming back worth
 * anything.
 */
export function recordTheatre(id, won, summary) {
  const t = theatreOf(id);
  if (!t) return null;
  const v = read();
  v.met = v.met || {};
  const met = v.met[id] || {};
  for (const o of objectivesFor(id)) {
    if (met[o.key]) continue;
    // Only a winning run can satisfy anything: eight minutes of shelling that
    // left the building standing is not a fast run, it is a failed one.
    if (won && o.test(summary, won)) met[o.key] = true;
  }
  v.met[id] = met;
  write(v);
  return met;
}

/** What closing this contract has just released, for the after-action card. */
export function releaseNoteFor(id) {
  const t = theatreOf(id);
  if (!t) return null;
  const at = LEVEL_ORDER.indexOf(id);
  const nextId = LEVEL_ORDER[at + 1];
  return {
    unlockLine: t.unlockLine,
    next: nextId ? theatreOf(nextId) : null,
  };
}
