import * as THREE from 'three';
import { buildElizabethTower, buildPalaceWing } from '../structure/landmarks/bigben.js';
import { buildLondonEye } from '../structure/landmarks/eye.js';
import { buildTajMahal, buildTajMosque } from '../structure/landmarks/tajmahal.js';
import { buildEiffelTower, buildChaillotWing } from '../structure/landmarks/eiffel.js';
import { buildElCastillo, buildTempleOfWarriors } from '../structure/landmarks/chichen.js';
import { buildCampanile, buildDuomo, buildBaptistery }
  from '../structure/landmarks/pisa.js';
import { buildOperaHouse } from '../structure/landmarks/sydney.js';
import { buildSaintBasils, buildKremlinWall } from '../structure/landmarks/moscow.js';
import { buildRedeemer } from '../structure/landmarks/rio.js';
import { buildParthenon, populateParthenon } from '../structure/landmarks/parthenon.js';
import { buildHagiaSophia, populateHagiaSophia } from '../structure/landmarks/hagiasophia.js';
import { buildCologneCathedral, populateCologneCathedral } from '../structure/landmarks/cologne.js';
import { buildHimejiKeep, populateHimejiKeep } from '../structure/landmarks/himeji.js';
import { buildBurjKhalifa, populateBurjKhalifa } from '../structure/landmarks/burj.js';
import { buildGreatPyramid, buildKhafre, buildMenkaure, buildSphinx }
  from '../structure/landmarks/giza.js';
import { buildPetronasTowers, populatePetronasTowers } from '../structure/landmarks/petronas.js';
import { buildPotalaPalace, populatePotalaPalace, buildChortenGate, populateChortenGate }
  from '../structure/landmarks/potala.js';
import { buildColosseum, populateColosseum } from '../structure/landmarks/colosseum.js';
import { buildTowerbridge, populateTowerbridge } from '../structure/landmarks/towerbridge.js';
import { buildFlorence, populateFlorence } from '../structure/landmarks/florence.js';
import { buildSegovia, populateSegovia } from '../structure/landmarks/segovia.js';
import { buildAtomium, populateAtomium } from '../structure/landmarks/atomium.js';
import { buildTokyotower, populateTokyotower } from '../structure/landmarks/tokyotower.js';
import { buildBudapest, populateBudapest } from '../structure/landmarks/budapest.js';
import { buildSagrada, populateSagrada } from '../structure/landmarks/sagrada.js';
import { buildEdinburgh, populateEdinburgh, EDINBURGH } from '../structure/landmarks/edinburgh.js';
import { buildNeuschwanstein, populateNeuschwanstein } from '../structure/landmarks/neuschwanstein.js';
import { buildMontstmichel, populateMontstmichel } from '../structure/landmarks/montstmichel.js';
import { buildPena, populatePena } from '../structure/landmarks/pena.js';
import { buildHassan, populateHassan } from '../structure/landmarks/hassan.js';
import { buildKuwait, populateKuwait } from '../structure/landmarks/kuwait.js';
import { buildKarnak, populateKarnak } from '../structure/landmarks/karnak.js';
import { buildForbidden, populateForbidden } from '../structure/landmarks/forbidden.js';
import { buildGyeongbok, populateGyeongbok } from '../structure/landmarks/gyeongbok.js';
import { buildWatarun, populateWatarun } from '../structure/landmarks/watarun.js';
import { buildShwedagon, populateShwedagon } from '../structure/landmarks/shwedagon.js';
import { buildAngkor, populateAngkor } from '../structure/landmarks/angkor.js';
import { buildBorobudur, populateBorobudur } from '../structure/landmarks/borobudur.js';
import { buildTikal, populateTikal } from '../structure/landmarks/tikal.js';
import { buildTeotihuacan, populateTeotihuacan } from '../structure/landmarks/teotihuacan.js';
import { buildMachupicchu, populateMachupicchu } from '../structure/landmarks/machupicchu.js';
import { buildGreatwall, populateGreatwall } from '../structure/landmarks/greatwall.js';

/**
 * Par.
 *
 * Every level record carries `par: { rounds, spend, minutes, leverage }`, and
 * the four marks on the end card are won independently against it. Closing a
 * contract stops being interesting the first time; closing it in nine rounds
 * when it took forty is the whole reason to open one twice, and a record that
 * only remembers *that* it was closed cannot tell a player they have got
 * better.
 *
 * Where the numbers come from, so that moving one is an argument about play
 * and not about arithmetic:
 *
 *  - `rounds` is the undercut line the suite already measures — a 155 mm
 *    round into the lowest scored stone on one face, over and over. Giza
 *    takes eighty of those to shift seven and a half per cent of the
 *    monument, Istanbul eighty for half of it, Chichen Itza eighty for all of
 *    it; par is what that rate implies for a win, rounded to a number a
 *    player can hold in their head. A machine aiming perfectly is not a
 *    person, so there is slack in it.
 *  - `spend` is six guns of the tier the campaign has released by then: the
 *    M119 at Westminster, the M777 by Agra, the Paladin by Sydney, MLRS by
 *    Istanbul, HIMARS by Kuala Lumpur. Coming in under it means a leaner
 *    force, not a longer battle.
 *  - `minutes` is `rounds` at a battery's real cadence, about two seconds a
 *    round, rounded up.
 *  - `leverage` is how much masonry comes down for every tonne actually shot,
 *    and it is the only one of the four that rewards firing *less*.
 *
 *    It is derived rather than tuned, because the two ends of it are known.
 *    Winning by quarrying alone means shelling away ninety per cent of the
 *    monument, which is a leverage of about 1.1; a cut at the foot of one face
 *    that puts the thing over measures between 68x (the Eiffel Tower, won in
 *    forty-one rounds) and 200x (the Elizabeth Tower, over in nine). There is
 *    no overlap, so par sits well clear of the grind and well under the cut: 6
 *    means most of the landmark came down on its own, and no amount of
 *    patience reaches it.
 *
 *    The exception is the four levels whose `traits.topples` is false. Chichen
 *    Itza, Giza, Istanbul and the Potala are won by quarrying — a pyramid has
 *    no cantilever in it and every stone is already sitting on a wider one —
 *    so the ceiling there is genuinely low and par is 2. Asking six of Giza
 *    would be asking the level to stop being Giza.
 *
 *    These are the numbers in this file most likely to move once people have
 *    played them, which is the same thing the rounds and the clock were.
 *
 * These are a first cut from measurement, and they are the numbers most
 * likely in this file to need moving once people have actually played the
 * levels. That is fine: they are three integers in one place.
 *
 * There is deliberately no `kind: puzzle | siege` beside them. It was going
 * to be here, and it earns nothing — par already says which a level is (forty
 * rounds at Pisa, six hundred at Giza), and `brief` already says it in words.
 */

/**
 * Level registry.
 *
 * A level is a real place plus a list of structures to raise on it. Everything
 * else — destruction, stability, the garrison, the economy, the camera — is
 * generic, so adding a landmark means writing one builder and one entry here,
 * plus its coordinates in `tools/bake_terrain.py`.
 *
 * `primary` marks the landmark the level is named after — the one the height
 * and lean readouts track. `required` marks a structure that has to come down
 * for the level to be won. `victory` is the line the end card leads with when
 * it is.
 *
 * Every structure holding a garrison is required. A wing full of defenders that
 * could be ignored entirely was a strange thing to put in front of a player:
 * it shot at them the whole match and then took no part in whether they had
 * finished. If it is worth defending it is worth destroying.
 */

export const LEVELS = {
  westminster: {
    id: 'westminster',
    terrain: 'westminster',
    name: 'Westminster, London',
    place: 'Westminster, London',
    target: 'ELIZABETH TOWER',
    subtitle: 'Elizabeth Tower · Westminster',
    victory: 'London Ben has Fallen Down',
    // The tower is twice life size, so everything framed around it moves out
    // with it: the camera sits back far enough to hold 192 m of masonry.
    //
    // The city does not keep a radius clear any more. The Palace's own
    // footprint, with the precinct's margin, is what keeps the buildings off,
    // and a hundred and fifty metres round the origin on top of that threw
    // away seventeen of the twenty-four surveyed buildings within two hundred
    // metres — Portcullis House, the Treasury's corner, St Margaret's — and
    // left the tower standing in a paddock. Seventy is the tower's own
    // forecourt, and nothing more.
    cityExcludeRadius: 70,
    camera: { yaw: -0.78, pitch: 0.40, distance: 430, height: 84 },
    structures: (quality) => [
      { key: 'tower', blocks: buildElizabethTower(quality), primary: true,
        required: true, label: 'ELIZABETH TOWER' },
      { key: 'wing', blocks: buildPalaceWing(quality),
        required: true, label: 'PALACE WING' },
      // Across the river, where it is. Scenery: it comes down if you shoot it
      // and counts for nothing, and it gets no precinct, no garrison and no
      // trench belt of its own. Founded on Jubilee Gardens with the hub out
      // over the waterline, which is where the real one's is.
      { key: 'eye', blocks: buildLondonEye(quality), required: false, scenery: true,
        label: 'LONDON EYE', offset: { x: 404, z: -288 } },
    ],
    garrison: (g, origin, groundY) => {
      g.populateElizabethTower(origin, groundY);
      g.populatePalaceWing(origin, groundY);
    },
    // A tower is a cantilever: losing two thirds of its height is unambiguous.
    // What actually stands round the Palace of Westminster, so the precinct
    // reads as that place rather than as an apron of paving. Level data, not a
    // special case in the builder: the next map describes its own.
    precinct: {
      boundary: 'railings',       // ironwork on a stone plinth, and gate piers
      ground: 'lawn',             // green with paved walks, not bare stone
      ornament: 'statues',        // figures on plinths, the way a square has
      river: 'embankment',        // granite parapet, balustrade, sturgeon lamps
      obelisk: true,              // Cleopatra's Needle, on the bank
      pier: true,                 // Westminster Pier, moored on the river
    },
    // The wing is 170 m of three-storey masonry. It has no topple in it, so
    // height is meaningless here and the only honest measure is how much of it
    // is left — but it is also four times the tower's footprint and grinding
    // all of it down would be a chore, so the bar sits where the building has
    // plainly been gutted rather than where the last stone has gone.
    par: { rounds: 45, spend: 4200, minutes: 3, leverage: 6 },
    brief: 'Undercut one face and the whole tower goes over that way.',
  },

  agra: {
    id: 'agra',
    terrain: 'agra',
    name: 'Taj Mahal, Agra',
    place: 'Agra, Uttar Pradesh',
    target: 'TAJ MAHAL',
    subtitle: 'Taj Mahal · Agra',
    victory: 'Taj Ma-Fall',
    // The complex is 2.2x life size: a 210 m terrace with a dome 141 m over
    // it. Everything framed around it moves out with it.
    // The charbagh and the terrace are the landmarks' own footprint plus the
    // precinct's margin now; the radius on top of it only has to keep Taj
    // Ganj off the garden's south wall. Four hundred and twenty threw away
    // sixty-seven of the town's buildings that stand outside the gate.
    cityExcludeRadius: 320,
    contextExclude: 300,
    // From the garden, the way everyone has seen it: the charbagh in the
    // foreground and the Yamuna behind the dome.
    camera: { yaw: 3.30, pitch: 0.30, distance: 640, height: 78 },
    structures: (quality) => [
      { key: 'taj', blocks: buildTajMahal(quality), primary: true,
        required: true, label: 'TAJ MAHAL' },
      // The mosque and the jawab hold no garrison, so they are worth money and
      // nothing else — shoot them or leave them.
      { key: 'mosque', blocks: buildTajMosque(quality, -1) },
      { key: 'jawab', blocks: buildTajMosque(quality, 1) },
    ],
    garrison: (g, origin, groundY) => {
      g.populateTajMahal(origin, groundY);
    },
    // A dome is a compression shell, not a cantilever — it never topples the
    // way a tower does, so height is a poor measure here and the threshold
    // leans almost entirely on how much of it is still standing.
    // Scored on the monument only. The plinth is a 95 m solid terrace that
    // outweighs everything standing on it, and counting it would mean the dome
    // could fall with the readout barely moving.
    scoreTags: ['tomb', 'chamber', 'iwans', 'drum', 'dome', 'finial', 'chattris', 'minarets'],
    precinct: {
      boundary: 'sandstone',      // the red wall with its crenellated coping
      ground: 'charbagh',         // the quartered garden and its water channel
      ornament: 'pavilions',      // chattris on the terrace corners
      river: 'ghats',             // steps down to the Yamuna
    },
    // The Yamuna floodplain in the dry season. Agra is dust: the town's
    // ground is a warm ochre, the roads are grey under a film of it, the
    // Yamuna runs low between broad pale sandbanks over a muddy bed, and the
    // only strong green on the map is the watered garden. It had London's
    // ground — brick-dust paving, deep grass, black asphalt, a cold green
    // riverbed — for six maps.
    palette: {
      urban: new THREE.Color(0xc4ad82),
      urbanAlt: new THREE.Color(0xab9366),
      park: new THREE.Color(0x5c6e38),
      parkAlt: new THREE.Color(0x71803f),
      road: new THREE.Color(0x5a544a),
      bank: new THREE.Color(0xd8caa4),
      bed: new THREE.Color(0x5e6247),
      dry: new THREE.Color(0xdccb9e),
    },
    setting: {
      // Hot, dusty and low: the haze is warm and sits on the plain.
      haze: { colour: 0xd6c9ae, density: 0.00026 },
    },
    par: { rounds: 140, spend: 8000, minutes: 6, leverage: 6 },
    brief: 'The dome stands on four piers. Shelling the shell only makes holes.',
  },

  paris: {
    id: 'paris',
    terrain: 'paris',
    name: 'Eiffel Tower, Paris',
    place: 'Champ de Mars, Paris',
    target: 'EIFFEL TOWER',
    subtitle: 'Tour Eiffel · Champ de Mars',
    victory: 'Eiffel-down',
    // The tower's own piers are 125 m apart and the Champ de Mars is open
    // ground for three hundred metres beyond that; the city starts where the
    // park ends.
    cityExcludeRadius: 210,
    contextExclude: 180,
    // The Trocadéro view: across the Seine, the tower framed by the river
    // in the foreground rather than hidden behind the camera.
    camera: { yaw: 0.62, pitch: 0.30, distance: 560, height: 120 },
    structures: (quality) => [
      { key: 'eiffel', blocks: buildEiffelTower(quality), primary: true,
        required: true, label: 'EIFFEL TOWER' },
      { key: 'chaillot', blocks: buildChaillotWing(quality),
        required: true, label: 'PALAIS DE CHAILLOT' },
    ],
    garrison: (g, origin, groundY) => {
      g.populateEiffelTower(origin, groundY);
      g.populateChaillot(origin, groundY);
    },
    // A lattice is all cantilever and no shell: it has less than a tenth of
    // the Elizabeth Tower's mass holding up twice the height, so once it goes
    // it goes completely. The bar is set on height alone, and set high.
    scoreTags: ['legs', 'arches', 'first', 'second', 'shaft', 'summit'],
    precinct: {
      boundary: 'railings',       // the perimeter fence round the piers
      ground: 'lawn',             // the Champ de Mars, gravel walks and grass
      ornament: 'statues',
      river: 'embankment',        // the Seine's quais, walled the same way
      pier: true,                 // a bateau-mouche landing on the quai
    },
    par: { rounds: 40, spend: 6000, minutes: 3, leverage: 6 },
    brief: 'It stands on four legs and nothing else. Cut one and it falls that way.',
  },

  chichen: {
    id: 'chichen',
    terrain: 'chichen',
    name: 'El Castillo, Chichén Itzá',
    place: 'Chichén Itzá, Yucatán',
    target: 'EL CASTILLO',
    subtitle: 'Temple of Kukulcán · Chichén Itzá',
    victory: 'Step Pyramid, Step Down',
    // Limestone shelf under a jungle canopy. The default London ground — brick
    // dust and parkland — reads as the Home Counties with a pyramid in them,
    // and the Yucatán is pale rock with very dark green growing out of it.
    // Forest floor, not pale limestone. `urban` is the general ground colour
    // and on a map that is jungle with a clearing in it the general ground is
    // jungle — the green belongs here and not in the park channel of the mask,
    // which is what tells the city generator a block is a park.
    palette: {
      urban: new THREE.Color(0x5d6b3c),
      urbanAlt: new THREE.Color(0x4c5931),
      park: new THREE.Color(0x3f5b30),
      parkAlt: new THREE.Color(0x4e6b34),
      road: new THREE.Color(0x77705c),
      bank: new THREE.Color(0xc8bb9c),
      bed: new THREE.Color(0x55603f),
      dry: new THREE.Color(0x7a814d),
    },
    // The Great Plaza is open ground for two hundred metres in every
    // direction, and the Temple of the Warriors stands at the far side of it.
    // The other ruins — the Great Ball Court, El Caracol, the Nunnery — are
    // surveyed as buildings and stand two to three hundred metres from El
    // Castillo; as low stone boxes they read as what they are. Three hundred
    // metres clear kept all twenty-six of them off the site.
    cityExcludeRadius: 170,
    contextExclude: 170,
    camera: { yaw: 0.72, pitch: 0.30, distance: 330, height: 66 },
    structures: (quality) => [
      { key: 'castillo', blocks: buildElCastillo(quality), primary: true,
        required: true, label: 'EL CASTILLO' },
      { key: 'warriors', blocks: buildTempleOfWarriors(quality), required: true,
        label: 'TEMPLE OF THE WARRIORS', offset: { x: 150, z: -120 } },
    ],
    garrison: (g, origin, groundY, sites) => {
      g.populateElCastillo(origin, groundY);
      const w = sites && sites.warriors;
      if (w) g.populateTempleOfWarriors({ x: 0, y: w.groundY, z: 0 }, w.groundY);
    },
    // Scored on the two pyramids, inner and outer — the stairways and the
    // temple are the building, the colonnade across the plaza is not.
    scoreTags: ['castillo', 'inner', 'stairs', 'temple'],
    precinct: {
      boundary: 'none',           // the plaza has no wall, it has jungle
      ground: 'lawn',
      ornament: 'none',
    },
    // No windows to post men in, no river, and nothing that can be made to
    // fall over.
    // Forest to the horizon in every direction. There are no fields in the
    // Yucatan interior and no airfield: there is the site, the road, a village
    // on one side of it, and jungle.
    setting: {
      hinterland: 'jungle', canopy: 2.5, canopyFrom: 235,
      // Humid, and green with it: the Yucatan's horizon is forest haze.
      haze: { colour: 0xc6cbb0, density: 0.00031 },
    },
    traits: { windows: false, river: false, topples: false },
    // A twentieth of Khufu, so nothing like Giza's factor — but still a solid
    // mass rather than a hollow tower.
    unlockScale: 4,
    par: { rounds: 70, spend: 8000, minutes: 4, leverage: 2 },
    brief: 'There is an older pyramid inside this one, and the top of the new one is standing on it.',
  },

  pisa: {
    id: 'pisa',
    terrain: 'pisa',
    name: 'Torre di Pisa',
    place: 'Piazza dei Miracoli, Pisa',
    target: 'THE CAMPANILE',
    subtitle: 'Torre pendente · Piazza dei Miracoli',
    victory: 'It Finally Fell Over',
    // Tuscan brick and terracotta round a piazza of white marble, on the
    // alluvial silt of the Arno plain — which is the soft ground the whole
    // level is about.
    palette: {
      urban: new THREE.Color(0xc0a086),
      urbanAlt: new THREE.Color(0xa9805f),
      park: new THREE.Color(0x5f7040),
      parkAlt: new THREE.Color(0x6d7c46),
      road: new THREE.Color(0x77706a),
      bank: new THREE.Color(0xb6a98d),
      bed: new THREE.Color(0x60684a),
      dry: new THREE.Color(0xc8bda4),
    },
    // The Campo dei Miracoli is walled lawn from the Baptistery to the
    // Camposanto, and the city stops at the wall.
    // The Campo dei Miracoli is a lawn with the town hard against three
    // sides of it: the medieval wall to the north, houses on the south and
    // east within sixty metres of the Duomo. Three hundred and thirty metres
    // clear threw away three hundred and four of them and every street round
    // the piazza, and the tower stood on a bare plain.
    // And a hundred and fifty still cleared the east side, where the town
    // stands within sixty metres of the tower — Via Santa Maria and the
    // Arcivescovado — and left the streets to it ending in a bare ring. The
    // landmarks' own footprints and the Campo's wall keep the lawn clear;
    // this only needs to keep the tower's own fall clear.
    cityExcludeRadius: 70,
    contextExclude: 70,
    camera: { yaw: -0.40, pitch: 0.26, distance: 300, height: 58 },
    structures: (quality) => [
      { key: 'campanile', blocks: buildCampanile(quality), primary: true,
        required: true, label: 'CAMPANILE' },
      { key: 'duomo', blocks: buildDuomo(quality), required: true,
        label: 'DUOMO', offset: { x: -96, z: -40 } },
      // Not required, and not garrisoned. Every other map in the campaign
      // asks for everything on it; this one has a building the client did not
      // pay for, standing in plain sight, worth points and nothing else.
      { key: 'baptistery', blocks: buildBaptistery(quality),
        label: 'BAPTISTERY', offset: { x: -256, z: -40 } },
    ],
    garrison: (g, origin, groundY, sites) => {
      g.populateCampanile(origin, groundY);
      const d = sites && sites.duomo;
      if (d) g.populateDuomo({ x: 0, y: d.groundY, z: 0 }, d.groundY);
    },
    // The tower is a cantilever and it is already past vertical, so height is
    // the honest measure here the way it is at Westminster.
    scoreTags: ['shaft', 'loggias', 'belfry'],
    precinct: {
      boundary: 'wall',           // the Campo is walled on two sides
      ground: 'lawn',
      ornament: 'none',
    },
    // Tuscan summer: warm, dusty, and hazy over the plain.
    setting: { haze: { colour: 0xd9cfb4, density: 0.00027 } },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    par: { rounds: 35, spend: 6000, minutes: 3, leverage: 6 },
    brief: 'It is bent, not tilted. The overhang at the top is the part they corrected.',
  },

  sydney: {
    id: 'sydney',
    terrain: 'sydney',
    name: 'Sydney Opera House',
    place: 'Bennelong Point, Sydney',
    target: 'THE OPERA HOUSE',
    subtitle: 'Bennelong Point · Sydney Harbour',
    victory: 'Curtain Down',
    // Sydney sandstone and harbour water: pale gold ground, very dark green
    // on the Botanic Garden side, and nothing warm anywhere near the sea.
    palette: {
      urban: new THREE.Color(0xc3b291),
      urbanAlt: new THREE.Color(0xad9c78),
      park: new THREE.Color(0x3b5a33),
      parkAlt: new THREE.Color(0x4a6b38),
      road: new THREE.Color(0x6f6b64),
      bank: new THREE.Color(0xb0a486),
      bed: new THREE.Color(0x2c4348),
      dry: new THREE.Color(0xc7b998),
    },
    // Circular Quay is across the cove; nothing is built on the point but the
    // thing on the point.
    // The Opera House's own footprint and the building keep-out round it are
    // what hold the city off Bennelong Point. Three hundred metres on top of
    // that left nothing standing within three hundred metres of the shells —
    // Circular Quay East, the Toaster, the quay itself — and the harbour city
    // read as a monument on a bare headland.
    cityExcludeRadius: 160,
    contextExclude: 160,
    // Three-quarter from the south-west, over Circular Quay. Square on to the
    // mouths every shell shows its glass at once and the building reads as a
    // row of tents; from here the two groups overlap and you get the flanks
    // and the tips, which is the photograph everyone has seen.
    camera: { yaw: 2.16, pitch: 0.17, distance: 305, height: 40 },
    // One structure, not two. The shells stand on the deck and the deck stands
    // on the substructure — see the builder.
    structures: (quality) => [
      { key: 'opera', blocks: buildOperaHouse(quality), primary: true,
        required: true, label: 'OPERA HOUSE' },
    ],
    garrison: (g, origin, groundY) => {
      g.populateOperaHouse(origin, groundY);
    },
    scoreTags: ['haunches', 'shells', 'walls', 'deck'],
    precinct: {
      boundary: 'none',           // the boundary here is the harbour
      ground: 'paving',
      ornament: 'none',
      river: 'quay',
    },
    // The CBD, packed against the water on the far side of Sydney Cove, which
    // is what stands behind this building in every photograph ever taken of
    // it. No farms and no airfield: the hinterland here is harbour.
    setting: {
      hinterland: 'harbour',
      downtown: { x: -470, z: 150, radius: 440, peak: 235 },
      // Sea air: cool, and clear enough to see the far shore.
      haze: { colour: 0xc3d0d8, density: 0.00019 },
    },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    par: { rounds: 90, spend: 12000, minutes: 5, leverage: 6 },
    brief: 'A shell has no mass and nothing above it. Hit the haunches, not the crowns.',
  },

  moscow: {
    id: 'moscow',
    terrain: 'moscow',
    name: "Saint Basil's Cathedral",
    place: 'Red Square, Moscow',
    target: "SAINT BASIL'S",
    subtitle: 'Cathedral of the Intercession · Red Square',
    victory: 'Nine Down, None Left',
    // Red Square is red granite setts and the wall behind it is red brick;
    // the ground is winter, which here means not much green anywhere.
    palette: {
      urban: new THREE.Color(0xa08578),
      urbanAlt: new THREE.Color(0x8d7166),
      park: new THREE.Color(0x4a563c),
      parkAlt: new THREE.Color(0x56613f),
      road: new THREE.Color(0x716a66),
      bank: new THREE.Color(0x968b80),
      bed: new THREE.Color(0x475140),
      dry: new THREE.Color(0xa99c8e),
    },
    // Red Square is three hundred and thirty metres long and GUM stands on
    // the far side of it; two hundred and twenty keeps the square open and
    // lets the city come to its edge.
    cityExcludeRadius: 220,
    contextExclude: 220,
    camera: { yaw: 1.10, pitch: 0.26, distance: 215, height: 48 },
    structures: (quality) => [
      { key: 'basils', blocks: buildSaintBasils(quality), primary: true,
        required: true, label: "SAINT BASIL'S" },
      { key: 'kremlin', blocks: buildKremlinWall(quality), required: true,
        label: 'KREMLIN WALL', offset: { x: -150, z: 0 } },
    ],
    garrison: (g, origin, groundY, sites) => {
      g.populateSaintBasils(origin, groundY);
      // At the wall's own origin, a hundred and fifty metres west. Passed
      // (0, 0) once, and the wall's whole garrison was laid at the cathedral:
      // the twenty men on the rampart found no stone there and were dropped,
      // and one mortar crew snapped into the central church and fired up
      // through its tent roof.
      const k = sites && sites.kremlin;
      if (k) g.populateKremlinWall({ x: k.origin.x, y: k.groundY, z: k.origin.z }, k.groundY);
    },
    // Scored on the churches and on the basement they all stand on — the
    // gallery, the piers and the vaults are the building here as much as the
    // towers are, and more to the point than the bell tower.
    scoreTags: ['podium', 'chapels', 'tent'],
    precinct: {
      boundary: 'none',           // Red Square has no railing on it
      ground: 'paving',
      ornament: 'statues',
    },
    // Cold northern light, and more of it than a river valley gets.
    setting: { haze: { colour: 0xccd2d6, density: 0.00023 } },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    par: { rounds: 120, spend: 14000, minutes: 6, leverage: 6 },
    brief: 'Nine churches that do not touch. The only thing they share is underneath them.',
  },

  rio: {
    id: 'rio',
    terrain: 'rio',
    name: 'Christ the Redeemer',
    place: 'Corcovado, Rio de Janeiro',
    target: 'O REDENTOR',
    subtitle: 'Cristo Redentor · Corcovado',
    victory: 'He Put His Arms Down',
    // Tijuca rainforest on granite: almost nothing here is a built colour.
    // Tijuca. Every square metre of this map that is not rock or road is
    // rainforest, so the general ground colour is rainforest.
    palette: {
      urban: new THREE.Color(0x4e5c37),
      urbanAlt: new THREE.Color(0x3f4c2c),
      park: new THREE.Color(0x2f4a24),
      parkAlt: new THREE.Color(0x3a5a29),
      road: new THREE.Color(0x6b655e),
      bank: new THREE.Color(0x8a8a6a),
      bed: new THREE.Color(0x35452c),
      dry: new THREE.Color(0x6d7546),
    },
    // Nothing is built on the summit and nothing is going to be. The numbers
    // are large because the summit is: it has to be level far enough out for a
    // battery to have somewhere to stand, and a building on the lip of the
    // drop beyond it is a building with its roof at ground level.
    cityExcludeRadius: 430,
    contextExclude: 400,
    // High enough, and far enough back, to get the rim of the summit into the
    // frame. Level with the terraces the plateau runs to the horizon and the
    // most famous mountain in Brazil reads as a lawn.
    camera: { yaw: -0.79, pitch: 0.30, distance: 330, height: 44 },
    // One structure. The statue stands on the pedestal and the pedestal stands
    // on the terraces, and separate structures never learn about each other.
    structures: (quality) => [
      { key: 'redeemer', blocks: buildRedeemer(quality), primary: true,
        required: true, label: 'CRISTO REDENTOR' },
    ],
    garrison: (g, origin, groundY) => {
      g.populateRedeemer(origin, groundY);
    },
    // The Forte de Copacabana's twin 305 mm mounting, on the first bench
    // below the summit, behind the statue: a clearing in the forest, forty
    // metres under the terraces and a hundred and thirty out, the guns
    // facing away from the figure. It stood on the summit platform once,
    // fifty-five metres from the pedestal, and read as a piece of the
    // monument; it is a battery, and a battery has its own ground. The bench
    // is the bake's (`peak.shelves[0]`, 96 to 136 m) and this is the level
    // stretch of it on the west side. It turns slowly, drops two shells at a
    // time on the battery, and three rounds in four glance off it. See
    // `game/turret.js`.
    turret: { x: -124, z: -33, yaw: Math.atan2(-124, -33), scale: 1.25, minRange: 60 },
    // The arms are scored and they are worth what they weigh, which is the
    // lesson: shoot them off and watch the bar barely move.
    scoreTags: ['statue', 'arms', 'pedestal'],
    // Forest, not paving. A paved precinct here draws a hard pale disc across
    // the summit with the jungle stopping dead at its edge, which from the
    // air reads as a crop circle; the Corcovado is Tijuca rainforest right up
    // to the terrace steps.
    precinct: {
      boundary: 'none',
      ground: 'lawn',
      ornament: 'none',
    },
    // Tijuca, which is the largest urban rainforest in the world and covers
    // every slope on this map.
    setting: {
      hinterland: 'forest', canopy: 2.6, canopyFrom: 92,
      // Blue and thin. Seven hundred metres up you are over the haze looking
      // down through it, not standing in it.
      haze: { colour: 0xbcc9cf, density: 0.00013 },
    },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    par: { rounds: 55, spend: 11000, minutes: 4, leverage: 6 },
    brief: 'The arms are the whole silhouette and almost none of the building.',
  },

  giza: {
    id: 'giza',
    terrain: 'giza',
    name: 'Great Pyramids, Giza',
    place: 'Giza Plateau, Egypt',
    target: 'GREAT PYRAMID',
    subtitle: 'Pyramid of Khufu · Giza Plateau',
    victory: 'Pharaoh From Grace',
    // Khufu's base is 230 m square and Khafre stands 350 m away; the whole
    // plateau is kept clear and the town is pushed back to where Nazlet
    // el-Samman actually starts.
    //
    // Desert, not the Home Counties. The default ground palette is London —
    // brick dust, parkland, wet silt — and on the Giza plateau it drew a green
    // field with a pyramid standing in it. Sand, gravel, and the dark basalt
    // of the causeways instead.
    palette: {
      urban: new THREE.Color(0xc9b48a),
      urbanAlt: new THREE.Color(0xb49b72),
      park: new THREE.Color(0x8a7f52),
      parkAlt: new THREE.Color(0xa1904f),
      road: new THREE.Color(0x4a443c),
      bank: new THREE.Color(0xd2bd92),
      bed: new THREE.Color(0x6a6b4a),
      dry: new THREE.Color(0xe0cda0),
    },
    // The plateau stays open desert — that is the design — but the village
    // of Nazlet el-Semman stands at its north-east edge four hundred metres
    // from Khufu, and four hundred and sixty threw three hundred and eleven
    // of its houses away. The streets and the sand keep the wider radius.
    cityExcludeRadius: 380,
    contextExclude: 460,
    camera: { yaw: -0.55, pitch: 0.33, distance: 640, height: 130 },
    structures: (quality) => [
      { key: 'khufu', blocks: buildGreatPyramid(quality), primary: true,
        required: true, label: 'GREAT PYRAMID' },
      { key: 'khafre', blocks: buildKhafre(quality), required: true,
        label: 'KHAFRE', offset: { x: -350, z: 350 } },
      // Menkaure and the Sphinx hold no garrison: worth money, nothing else.
      { key: 'menkaure', blocks: buildMenkaure(quality),
        label: 'MENKAURE', offset: { x: -540, z: 600 } },
      { key: 'sphinx', blocks: buildSphinx(quality),
        label: 'SPHINX', offset: { x: 350, z: 350 } },
    ],
    garrison: (g, origin, groundY, sites) => {
      g.populateGreatPyramid(origin, groundY);
      // Khafre stands five hundred metres away across the plateau, on its own
      // ground, so its picket is posted from its own site rather than from the
      // level's origin.
      const k = sites && sites.khafre;
      if (k) g.populateKhafre(k.origin, k.groundY);
    },
    // Scored on the pyramid itself, not on the bedrock raft it stands on.
    scoreTags: ['pyramid', 'relieving', 'entrance'],
    precinct: {
      boundary: 'none',           // there is no wall on the plateau, only sand
      ground: 'sand',
      ornament: 'none',
    },
    // What this level is not.
    //
    // Most of the regression suite was written against a European river city
    // with a tower in it, and asserts things that are simply not true here: a
    // pyramid has no windows to post men in, the plateau has no river to wall,
    // and — the whole premise of the level — nothing on it can be made to fall
    // over. Those assertions read this rather than being quietly weakened for
    // everybody.
    traits: { windows: false, river: false, topples: false },
    // Unlocks are fractions of the mass on the map, and the mass here is two
    // and a third million cubic metres of limestone with two more pyramids
    // beside it. Unscaled, earning the RPG meant demolishing 0.6 % of that
    // with an AT4, so nothing past the two weakest weapons ever unlocked and
    // the level was, for the player, indestructible.
    unlockScale: 16,
    // A pyramid cannot topple, so height is meaningless and the whole measure
    // is how much of it is left. The bar is low because grinding two and a
    // half million cubic metres of limestone to nothing is not a game.
    // Ninety per cent, like everywhere else. Worth saying plainly: that is a
    // very long grind on two and a third million cubic metres of limestone,
    // and this is the level most likely to need its own number once it has
    // been played rather than measured.
    par: { rounds: 600, spend: 12000, minutes: 20, leverage: 2 },
    brief: 'Nothing here can topple. Open the casing and break what the chambers hang on.',
  },

  // ── The third five. Each a new nation and a new structural problem.
  athens: {
    id: 'athens',
    terrain: 'athens',
    name: 'Parthenon, Athens',
    place: 'The Acropolis, Athens',
    target: 'PARTHENON',
    subtitle: 'Parthenon · Acropolis',
    victory: 'Ruined. Again.',
    // Attic limestone and dust, dry olive scrub on the slopes, the city's
    // pale concrete beyond. No water on the map.
    palette: {
      urban: new THREE.Color(0xc9bfa6),
      urbanAlt: new THREE.Color(0xb3a58a),
      park: new THREE.Color(0x6b7a44),
      parkAlt: new THREE.Color(0x7f8a4a),
      road: new THREE.Color(0x6a655d),
      bank: new THREE.Color(0xc8bb98),
      bed: new THREE.Color(0x5c6a58),
      dry: new THREE.Color(0xd8cba6),
    },
    setting: { haze: { colour: 0xd8d3c4, density: 0.00021 } },
    // The rock: the town stops at the foot of the slopes, which the survey
    // already knows; this keeps the plateau itself clear.
    cityExcludeRadius: 170,
    // The bake cut the plateau to its real 156 m; the game's own pad must
    // level to that and not to the slopes round it.
    groundLevel: 'bake',
    contextExclude: 170,
    // From the north-west, the way you arrive through the Propylaea.
    camera: { yaw: 2.35, pitch: 0.30, distance: 380, height: 40 },
    structures: (quality) => [
      { key: 'parthenon', blocks: buildParthenon(quality), primary: true,
        required: true, label: 'PARTHENON' },
    ],
    garrison: (g, origin, groundY) => { populateParthenon(g, origin, groundY); },
    // The krepis is a solid platform three steps high and it is not the
    // monument; scored on what stands on it.
    scoreTags: ['columns', 'entablature', 'pediment', 'cella'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    traits: { windows: false, river: false, topples: true },
    par: { rounds: 70, spend: 10000, minutes: 4, leverage: 6 },
    brief: 'Nothing is fixed to anything. The drums sit on the drums and the beams sit on the columns.',
  },

  istanbul: {
    id: 'istanbul',
    terrain: 'istanbul',
    name: 'Hagia Sophia, Istanbul',
    place: 'Sultanahmet, Istanbul',
    target: 'HAGIA SOPHIA',
    subtitle: 'Ayasofya · Sultanahmet',
    victory: 'Holy Wisdom, Unholy Mess',
    // Ochre render and red tile on the first hill, grey Byzantine stone, the
    // Marmara a cold green-blue.
    palette: {
      urban: new THREE.Color(0xbfa98e),
      urbanAlt: new THREE.Color(0xa88f72),
      park: new THREE.Color(0x55703c),
      parkAlt: new THREE.Color(0x66804a),
      road: new THREE.Color(0x615c56),
      bank: new THREE.Color(0xb5a789),
      bed: new THREE.Color(0x2f4a4e),
      dry: new THREE.Color(0xcdbd9f),
    },
    setting: { hinterland: 'harbour', haze: { colour: 0xcfd3d4, density: 0.00022 } },
    cityExcludeRadius: 150,
    contextExclude: 150,
    // From Sultanahmet Square, the south-west, with the Marmara behind.
    camera: { yaw: 2.30, pitch: 0.28, distance: 420, height: 60 },
    structures: (quality) => [
      { key: 'sophia', blocks: buildHagiaSophia(quality), primary: true,
        required: true, label: 'HAGIA SOPHIA' },
    ],
    garrison: (g, origin, groundY) => { populateHagiaSophia(g, origin, groundY); },
    // The dome, the half-domes and what holds them; the aisles and the raft
    // are the base and would swamp the bar.
    scoreTags: ['dome', 'halfdomes', 'arches', 'piers', 'buttresses', 'minarets'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: true, river: false, topples: false },
    par: { rounds: 150, spend: 18000, minutes: 7, leverage: 2 },
    brief: 'The dome is held from outside. Open one side and the thrust has nowhere to go.',
  },

  cologne: {
    id: 'cologne',
    terrain: 'cologne',
    name: 'Kölner Dom, Cologne',
    place: 'Domplatte, Cologne',
    target: 'THE CATHEDRAL',
    subtitle: 'Kölner Dom · Domplatte',
    victory: 'Dom and Dommer',
    // Rhineland: slate roofs, pale grey stone, the Rhine a working green.
    palette: {
      urban: new THREE.Color(0xa9a49a),
      urbanAlt: new THREE.Color(0x948d82),
      park: new THREE.Color(0x466a33),
      parkAlt: new THREE.Color(0x5b7f3c),
      road: new THREE.Color(0x3a3c40),
      bank: new THREE.Color(0xa89b7c),
      bed: new THREE.Color(0x33473f),
      dry: new THREE.Color(0xb9b096),
    },
    setting: { haze: { colour: 0xc8ccd0, density: 0.00024 } },
    // From the south-west, up at the two spires with the nave running away
    // behind them. The origin is the south tower (see the builder), so the
    // camera looks at the west front, not the middle of the roof.
    camera: { yaw: -2.30, pitch: 0.22, distance: 560, height: 110 },
    structures: (quality) => [
      { key: 'dom', blocks: buildCologneCathedral(quality), primary: true,
        required: true, label: 'KÖLNER DOM' },
    ],
    garrison: (g, origin, groundY) => { populateCologneCathedral(g, origin, groundY); },
    // Scored on the building, not the raft it stands on.
    scoreTags: ['southspire', 'northspire', 'westfront', 'nave', 'transept', 'choir', 'crossing', 'apse', 'buttresses'],
    // The cathedral runs a hundred and ninety metres east of its origin; the
    // radius keeps the Domplatte and the station forecourt clear round the
    // towers, and the footprint keeps the town off the rest.
    cityExcludeRadius: 150,
    contextExclude: 150,
    // The Domplatte: paved, railed at its edge, with the statuary a cathedral
    // square has.
    precinct: { boundary: 'railings', ground: 'sand', ornament: 'statues' },
    traits: { windows: true, river: true, topples: true },
    par: { rounds: 100, spend: 16000, minutes: 5, leverage: 6 },
    brief: 'Gothic stone does as little work as it can. Cut a pier and the spire above it follows.',
  },

  himeji: {
    id: 'himeji',
    terrain: 'himeji',
    name: 'Himeji Castle, Himeji',
    place: 'Himeyama, Himeji',
    target: 'THE KEEP',
    subtitle: 'White Heron Castle · Himeyama',
    victory: 'Shogun Down',
    // A castle town: grey tile, white plaster, pine and the moat's dark water.
    palette: {
      urban: new THREE.Color(0xb5ad9e),
      urbanAlt: new THREE.Color(0x9d9486),
      park: new THREE.Color(0x4e6d3a),
      parkAlt: new THREE.Color(0x5f7d42),
      road: new THREE.Color(0x55555a),
      bank: new THREE.Color(0xb0a58a),
      bed: new THREE.Color(0x3f5548),
      dry: new THREE.Color(0xc3b89e),
    },
    setting: { haze: { colour: 0xd0d4cf, density: 0.00023 } },
    // The castle grounds inside the inner moat; the town begins outside them.
    cityExcludeRadius: 250,
    groundLevel: 'bake',
    contextExclude: 230,
    // From the south, up Otemae-dori, which is the view the town is built on.
    camera: { yaw: 0.10, pitch: 0.27, distance: 420, height: 70 },
    structures: (quality) => [
      { key: 'keep', blocks: buildHimejiKeep(quality), primary: true,
        required: true, label: 'THE KEEP' },
    ],
    garrison: (g, origin, groundY) => { populateHimejiKeep(g, origin, groundY); },
    // The stone bases are the ground, near enough, and are not the target.
    scoreTags: ['keep', 'westkeep', 'corridor'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: true, river: false, topples: true },
    par: { rounds: 60, spend: 14000, minutes: 4, leverage: 6 },
    brief: 'The stone base cannot be shot down. The keep on it is top-heavy by design.',
  },

  dubai: {
    id: 'dubai',
    terrain: 'dubai',
    name: 'Burj Khalifa, Dubai',
    place: 'Downtown Dubai',
    target: 'BURJ KHALIFA',
    subtitle: 'Burj Khalifa · Downtown Dubai',
    victory: 'Burj Ka-Boom',
    // Desert city: sand under everything, pale concrete, the lake a made
    // blue, the roads black and new.
    palette: {
      urban: new THREE.Color(0xd2c4a6),
      urbanAlt: new THREE.Color(0xbfae8c),
      park: new THREE.Color(0x6f8a4c),
      parkAlt: new THREE.Color(0x7f9a55),
      road: new THREE.Color(0x4c4a48),
      bank: new THREE.Color(0xdccaa2),
      bed: new THREE.Color(0x3c6b73),
      dry: new THREE.Color(0xe3d5b2),
    },
    // Nothing in the Gulf pitches a roof. It rains a handful of days a year
    // and it never snows, so the whole city — the towers, the blocks behind
    // them and the low buildings out towards the creek — is flat on top.
    setting: { haze: { colour: 0xe0d6c2, density: 0.00030 }, roofPitch: 0 },
    cityExcludeRadius: 130,
    contextExclude: 130,
    // Far back and high: the tower is two thirds of a kilometre.
    camera: { yaw: 0.60, pitch: 0.26, distance: 1250, height: 350 },
    structures: (quality) => [
      { key: 'burj', blocks: buildBurjKhalifa(quality), primary: true,
        required: true, label: 'BURJ KHALIFA' },
    ],
    garrison: (g, origin, groundY) => { populateBurjKhalifa(g, origin, groundY); },
    // The tower, not the podium round its foot.
    scoreTags: ['core', 'wings', 'spire'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 1,
    par: { rounds: 70, spend: 26000, minutes: 5, leverage: 6 },
    brief: 'Everything above a setback stands on the setback under it. Take the core at one.',
  },
  petronas: {
    id: 'petronas',
    terrain: 'petronas',
    name: 'Petronas Towers, Kuala Lumpur',
    place: 'KLCC, Kuala Lumpur',
    target: 'PETRONAS TOWERS',
    subtitle: 'Petronas Towers \u00b7 Kuala Lumpur',
    victory: 'Twin Billing',
    // Equatorial, and wet. Everything here grows: the ground between the
    // buildings is the green of a place that gets two and a half metres of
    // rain a year, the roads are dark and permanently damp, and the KLCC
    // park at the towers' feet is real jungle rather than municipal lawn.
    palette: {
      urban: new THREE.Color(0x7d8468),
      urbanAlt: new THREE.Color(0x6a7358),
      park: new THREE.Color(0x35542a),
      parkAlt: new THREE.Color(0x436530),
      road: new THREE.Color(0x3c3c3e),
      bank: new THREE.Color(0x8d8a6e),
      bed: new THREE.Color(0x3a5a4e),
      dry: new THREE.Color(0x8f9470),
    },
    // Three degrees off the equator. It rains most afternoons and it has
    // never once snowed, so nothing in this city pitches a roof; the haze is
    // the warm white of air holding all the water it can.
    setting: {
      haze: { colour: 0xd7dde0, density: 0.00032 },
      roofPitch: 0,
      canopy: 1.4,
    },
    cityExcludeRadius: 120,
    contextExclude: 120,
    // Both towers have to be in frame or the level is a tower level, and the
    // pair is two hundred metres wide before the first stone is laid.
    camera: { yaw: 0.72, pitch: 0.22, distance: 840, height: 235 },
    structures: (quality) => [
      { key: 'petronas', blocks: buildPetronasTowers(quality), primary: true,
        required: true, label: 'PETRONAS TOWERS' },
    ],
    garrison: (g, origin, groundY) => { populatePetronasTowers(g, origin, groundY); },
    // The towers, not the shopping centre they stand on — and the bridge is
    // scored with them, which is the trap: it is four per cent of the mass
    // and the first thing anybody shoots.
    scoreTags: ['tower-west', 'tower-east', 'skybridge'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 1,
    par: { rounds: 110, spend: 24000, minutes: 6, leverage: 6 },
    brief: 'The bridge is tied to neither tower. Taking it costs them nothing.',
  },
  potala: {
    id: 'potala',
    terrain: 'potala',
    name: 'Potala Palace, Lhasa',
    place: 'Marpo Ri, Lhasa',
    target: 'POTALA PALACE',
    subtitle: 'Potala Palace \u00b7 Marpo Ri',
    victory: 'The Red Palace Comes Down',
    // Three thousand six hundred metres up, on a hill of red rock in a dry
    // valley. Almost nothing here is green: the ground is gravel and dust
    // with willow and poplar along the water, the rock is the iron red the
    // hill is named for, and the built colour is lime-wash over rammed earth.
    palette: {
      urban: new THREE.Color(0xc0b49c),
      urbanAlt: new THREE.Color(0xa89a80),
      park: new THREE.Color(0x6f6c46),
      parkAlt: new THREE.Color(0x7d764e),
      road: new THREE.Color(0x585552),
      bank: new THREE.Color(0xc8bb9a),
      bed: new THREE.Color(0x4d6a63),
      dry: new THREE.Color(0xb09a74),
    },
    // Thin air over a dry valley. At three and a half kilometres there is a
    // third less atmosphere above you than at sea level, the light is hard,
    // and you can see the mountains on the far side of the Kyi Chu all day.
    // A sea-level haze here would put fog on a place famous for having none.
    setting: {
      hinterland: 'fields',
      haze: { colour: 0xc9d6e2, density: 0.00016 },
      roofPitch: 0.18,
    },
    // Lhasa comes up the lower slopes, which is what the place looks like:
    // the town runs right to the foot of Marpo Ri and a fair way up it, and
    // held off to the far corners the hill stood in a paddock. Pulled in with
    // the hill: Marpo Ri's base is now about two hundred and eighty metres out
    // instead of five hundred and seventy, and clearing to 430 left a ring of
    // bare gravel round the foot of it. Lhasa comes right up to the rock.
    cityExcludeRadius: 300,
    contextExclude: 285,
    // The bake cuts Marpo Ri to a ridge at 3782 m; the game's own pad must
    // level to that and not to the median of a ring that straddles the
    // summit's edge, which took twenty-one metres off the top and left a
    // step round the palace where the natural ground stood higher than the
    // ground the palace was standing on.
    groundLevel: 'bake',
    // And then: no pad at all. Every other level lets its monument flatten its
    // own footprint, and this one may not, because its footprint *is* the
    // summit. A four-hundred-metre palace levels a four-hundred-metre disc,
    // which on a hill two hundred metres across is the hill — measured on the
    // old bake, the ground did not vary by a metre from x -300 to +250, so the
    // famous hundred and thirty metres of rock were a cliff at the rim of a
    // car park and the palace stood in the middle of the car park.
    //
    // Instead the bake's own summit is the floor, and the palace carries its
    // retaining walls ninety metres down to meet the rock wherever it has
    // fallen away. That is the actual construction, and it is why the front of
    // the real building is a hundred metres of blank white wall with a
    // staircase zigzagging up it.
    padRadius: 0,
    // From the south and *low*, which is the whole difference. Every
    // photograph of this place is taken from the road at the foot looking up,
    // because that is the view the building was designed to be seen from: the
    // rock, then eighty metres of blank white wall with the stair cut across
    // it, then the wings, then the Red Palace riding over the top of them.
    //
    // The old camera stood nine hundred metres back at a quarter radian of
    // pitch, looking down on the roofs, and from up there a mountain fortress
    // is a floor plan. Three hundred and thirty-six metres of standing height
    // now, and the frame is filled by looking up at it rather than back from
    // it.
    camera: { yaw: 0.05, pitch: 0.10, distance: 700, height: 70 },
    structures: (quality) => [
      { key: 'potala', blocks: buildPotalaPalace(quality), primary: true,
        required: true, label: 'POTALA PALACE' },
      // The Pargo Kaling, on the second bench below the palace, where the
      // road through the saddle runs. Worth money, nothing else — and the one
      // thing on this mountain a player can put down inside a minute.
      { key: 'chorten', blocks: buildChortenGate(quality),
        label: 'CHÖRTEN GATE', offset: { x: -268, z: 296 } },
    ],
    garrison: (g, origin, groundY, sites) => {
      populatePotalaPalace(g, origin, groundY);
      const c = sites && sites.chorten;
      if (c) populateChortenGate(g, c.origin, c.groundY);
    },
    // The Red Palace and the gilded roofs on it. The white wings are a
    // curtain of living quarters and the bar does not move for them, which
    // is the whole trick of the level: the biggest thing in front of you is
    // not the thing you are being paid for.
    scoreTags: ['red', 'roofs'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    // Battered walls four metres thick bonded to a rock outcrop. Nothing
    // here leans and nothing here goes over; it comes down course by course
    // or it does not come down.
    //
    // And it does not shed. A hole in a wall this thick either holds or takes
    // a whole connected section down with it, and a section comes away as one
    // welded body rather than as loose stone — so there is no rubble here for
    // the recycler to freeze, which is a fact about rammed earth and not a
    // fault. `sheds` says so; the suite reads it.
    traits: { windows: true, river: false, topples: false, sheds: false },
    // Four million four hundred thousand cubic metres: the heaviest thing in
    // the campaign, half again as much as the Giza plateau, once the terraces
    // and the village on them were built as what they are. Unlocks are a
    // fraction of all the mass on the map, so unscaled an AT4 would earn a
    // two-hundredth of a per cent and nothing past the first two weapons
    // would ever come out of the depot. Giza carries sixteen on two point
    // eight million; this carries twenty-four on four point four.
    unlockScale: 24,
    par: { rounds: 190, spend: 34000, minutes: 9, leverage: 2 },
    brief: 'The white is not the building. The red one in the middle is the contract.',
  },
  colosseum: {
    id: 'colosseum',
    terrain: 'colosseum',
    lat: 41.89021, lon: 12.49223,
    name: 'Colosseum, Rome',
    place: 'Piazza del Colosseo, Rome',
    target: 'THE COLOSSEUM',
    subtitle: 'Anfiteatro Flavio \u00b7 Piazza del Colosseo',
    victory: 'Thumbs Down',
    // Rome: ochre and terracotta render, travertine, umbrella pines on the
    // Palatine and the Oppian, the Tiber a long way off. Warm and dusty.
    palette: {
      urban: new THREE.Color(0xc4a482),
      urbanAlt: new THREE.Color(0xad8560),
      park: new THREE.Color(0x5a6e3c),
      parkAlt: new THREE.Color(0x6a7a44),
      road: new THREE.Color(0x74706a),
      bank: new THREE.Color(0xb5a788),
      bed: new THREE.Color(0x5e6848),
      dry: new THREE.Color(0xcabb9f),
    },
    setting: { haze: { colour: 0xdccfb6, density: 0.00025 } },
    // The ring is 283 by 234 at this scale and the only surveyed building
    // within a hundred and twenty metres is the Colosseo itself; the piazza,
    // the Meta Sudans and the foot of the Oppian are open ground anyway. The
    // Arch of Constantine and the Temple of Venus and Roma stand beyond.
    cityExcludeRadius: 175,
    contextExclude: 165,
    // From the north-west, where the Via dei Fori Imperiali arrives: the
    // standing outer wall on the left, the break and the inner ring on the
    // right, and the whole ring in one frame.
    camera: { yaw: -2.30, pitch: 0.11, distance: 430, height: 34 },
    structures: (quality) => [
      { key: 'colosseum', blocks: buildColosseum(quality), primary: true, required: true, label: 'COLOSSEUM' },
    ],
    garrison: (g, origin, groundY) => populateColosseum(g, origin, groundY),
    // The cavea is a hill of rubble fill and is not the monument; the bar
    // moves for the two rings.
    scoreTags: ['outer', 'inner'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    // A ring nearly three hundred metres across does not go over; it is
    // broken bay by bay.
    traits: { windows: false, river: false, topples: false },
    par: { rounds: 110, spend: 15000, minutes: 6, leverage: 2 },
    brief: 'Eighty piers and nothing behind them. Kick two out and the bay above falls outward; where the seating still stands, it does not.',
  },
  towerbridge: {
    id: 'towerbridge',
    terrain: 'towerbridge',
    lat: 51.5076, lon: -0.0761,
    name: 'Tower Bridge, London',
    place: 'Tower Hill, London',
    target: 'TOWER BRIDGE',
    subtitle: 'Tower Bridge \u00b7 the Pool of London',
    victory: 'Drawbridge Down',
    // The default ground is London: brick dust, parkland, the Thames a wet
    // silt green. This is London.
    // The origin is on Tower Hill with the Tower of London fifty-seven
    // metres north of it; the survey has forty-five of its buildings within
    // a hundred and twenty metres, the White Tower and the Wakefield Tower
    // among them. The bridge's own footprint keeps the town off its deck;
    // this clears only the approach.
    cityExcludeRadius: 38,
    contextExclude: 38,
    // From the north bank downstream — St Katharine's — looking across at
    // the north tower with the bridge running away to Bermondsey behind it.
    camera: { yaw: -2.20, pitch: 0.12, distance: 400, height: 55 },
    structures: (quality) => [
      { key: 'towerbridge', blocks: buildTowerbridge(quality), primary: true, required: true, label: 'TOWER BRIDGE' },
    ],
    garrison: (g, origin, groundY) => populateTowerbridge(g, origin, groundY),
    // The towers and what ties them; the piers, the abutments and the decks
    // are the ground the fight is on.
    scoreTags: ['northtower', 'southtower', 'walkways'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none', river: 'embankment' },
    traits: { windows: true, river: true, topples: true },
    par: { rounds: 90, spend: 14000, minutes: 5, leverage: 6 },
    brief: 'The spans rest on the towers and the walkways tie them. Cut a pier and the tower, the walkway ends and both spans on it go into the river.',
  },
  florence: {
    id: 'florence',
    terrain: 'florence',
    lat: 43.77313, lon: 11.256,
    name: 'Santa Maria del Fiore, Florence',
    place: 'Piazza del Duomo, Florence',
    target: 'THE DUOMO',
    subtitle: 'Cattedrale di Santa Maria del Fiore \u00b7 Piazza del Duomo',
    victory: 'Dome, Sweet Dome',
    // Tuscany: ochre render and terracotta roofs packed tight round the
    // piazza, the Arno olive-green at the map's edge, cypress on the hills.
    palette: {
      urban: new THREE.Color(0xc2a07f),
      urbanAlt: new THREE.Color(0xa87e5c),
      park: new THREE.Color(0x5f7040),
      parkAlt: new THREE.Color(0x6d7c46),
      road: new THREE.Color(0x77706a),
      bank: new THREE.Color(0xb6a98d),
      bed: new THREE.Color(0x60684a),
      dry: new THREE.Color(0xc8bda4),
    },
    setting: { haze: { colour: 0xd9cfb4, density: 0.00027 } },
    // The piazza is tight: the survey has seventy-nine buildings within a
    // hundred and twenty metres, the Baptistery eighty metres west among
    // them. The cathedral's own footprint keeps the houses off its walls;
    // this only clears the piazza round the façade and lets the Baptistery
    // stand where it does.
    cityExcludeRadius: 62,
    contextExclude: 62,
    // From the south-east, over the roofs: the dome on the right with the
    // tribunes under it, the nave running away to the campanile and the
    // façade on the left. The origin is mid-nave, so the frame is centred on
    // the whole length of the building rather than on the dome.
    camera: { yaw: 0.72, pitch: 0.12, distance: 430, height: 64 },
    structures: (quality) => [
      { key: 'florence', blocks: buildFlorence(quality), primary: true, required: true, label: 'THE DUOMO' },
    ],
    garrison: (g, origin, groundY) => populateFlorence(g, origin, groundY),
    // The nave and the tribunes are where the men are; the bar moves for
    // the dome and what it stands on, and for Giotto's tower.
    scoreTags: ['dome', 'drum', 'lantern', 'crossing', 'campanile'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    // A shell: the dome comes down in a sheet, it does not go over.
    traits: { windows: true, river: false, topples: false },
    par: { rounds: 130, spend: 18000, minutes: 7, leverage: 2 },
    brief: 'The dome bears on the drum and the drum on eight piers. Take one corner out and the dome comes down in a sheet.',
  },
  segovia: {
    id: 'segovia',
    terrain: 'segovia',
    lat: 40.94795, lon: -4.11798,
    name: 'Aqueduct of Segovia',
    place: 'Plaza del Azoguejo, Segovia',
    target: 'THE AQUEDUCT',
    subtitle: 'Acueducto romano \u00b7 Plaza del Azoguejo',
    victory: 'Water Under the Bridge',
    // Castile at a thousand metres: grey granite, ochre render and red tile,
    // dry gold ground, holm oak on the slopes, the two rivers small and
    // green in their valleys.
    palette: {
      urban: new THREE.Color(0xc6ae8e),
      urbanAlt: new THREE.Color(0xad8f6a),
      park: new THREE.Color(0x6e7442),
      parkAlt: new THREE.Color(0x7d804a),
      road: new THREE.Color(0x6d6862),
      bank: new THREE.Color(0xc1b394),
      bed: new THREE.Color(0x56664c),
      dry: new THREE.Color(0xd2c39f),
    },
    // High, dry and clear: the meseta in September.
    setting: { hinterland: 'fields', haze: { colour: 0xd6d3c8, density: 0.00017 } },
    // The Azoguejo's houses stand hard against the aqueduct — the survey has
    // sixty-one within a hundred and twenty metres, the nearest thirty-six
    // metres off. The line's own footprint keeps them off the piers; this
    // clears only the plaza itself.
    cityExcludeRadius: 45,
    contextExclude: 45,
    // The ground under an aqueduct is not level, and the piers are founded
    // twenty-six metres down to meet whatever the bake has: no pad.
    groundLevel: 'bake',
    padRadius: 0,
    // From the plaza, the south-west side, low: the two tiers running across
    // the frame from the Plaza de Día Sanz to the Postigo.
    camera: { yaw: -0.73, pitch: 0.09, distance: 400, height: 30 },
    structures: (quality) => [
      { key: 'segovia', blocks: buildSegovia(quality), primary: true, required: true, label: 'AQUEDUCT' },
    ],
    garrison: (g, origin, groundY) => populateSegovia(g, origin, groundY),
    scoreTags: ['lowerpiers', 'lowerarches', 'upperpiers', 'upperarches', 'channel'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    traits: { windows: false, river: false, topples: true },
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },
    brief: 'An arcade shares its thrust. Take one pier and two arches go; the piers beside them are unbraced, and the chain unzips to the next wide one.',
  },
  atomium: {
    id: 'atomium',
    terrain: 'atomium',
    lat: 50.89494, lon: 4.34144,
    name: 'Atomium, Brussels',
    place: 'Heysel, Brussels',
    target: 'THE ATOMIUM',
    subtitle: 'Atomium \u00b7 Heysel Plateau',
    victory: 'Split the Atom',
    // Brabant in the north: brick and grey render, the Heysel's plane trees
    // and the Ossegem park, flat, damp and green. No water on the map.
    palette: {
      urban: new THREE.Color(0xb3a08c),
      urbanAlt: new THREE.Color(0x9b8470),
      park: new THREE.Color(0x4f7038),
      parkAlt: new THREE.Color(0x5e7d40),
      road: new THREE.Color(0x5e5d5c),
      bank: new THREE.Color(0xa89c86),
      bed: new THREE.Color(0x3f5648),
      dry: new THREE.Color(0xb9b3a0),
    },
    setting: { haze: { colour: 0xcfd4d8, density: 0.00026 } },
    // The Heysel is open ground: the survey has the Atomium and three sheds
    // within a hundred and twenty metres, and the exhibition halls beyond.
    // Two hundred metres of spheres wants the esplanade clear round it.
    cityExcludeRadius: 150,
    contextExclude: 140,
    // From the south-east, square on to a lower sphere, with the two upper
    // spheres either side of it and the whole molecule standing on its
    // one vertex.
    camera: { yaw: 1.36, pitch: 0.12, distance: 560, height: 95 },
    structures: (quality) => [
      { key: 'atomium', blocks: buildAtomium(quality), primary: true, required: true, label: 'ATOMIUM' },
    ],
    garrison: (g, origin, groundY) => populateAtomium(g, origin, groundY),
    // The pavilion is a shed; the molecule is the target.
    scoreTags: ['spheres', 'tubes', 'column', 'bipods'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    // Cut a bipod and it is a tower on one leg; cut the column and it goes.
    traits: { windows: false, river: false, topples: true },
    unlockScale: 1,
    par: { rounds: 50, spend: 8000, minutes: 4, leverage: 6 },
    brief: 'The mass is in the spheres and the spheres carry only themselves. The load runs down the column and three pairs of legs.',
  },
  tokyotower: {
    id: 'tokyotower',
    terrain: 'tokyotower',
    lat: 35.65858, lon: 139.74543,
    name: 'TOKYO TOWER',
    place: 'Tokyo',
    target: 'TOKYO TOWER',
    subtitle: 'Tokyo Tower, Tokyo',
    victory: 'Big in Japan, Flat in Minato',
    // Minato: grey concrete and glass, the parks of Shiba a dark green, the
    // roads black. A Japanese city, not a Japanese castle town: Himeji's
    // palette with the plaster and tile taken out of it.
    palette: {
      urban: new THREE.Color(0xb3b0aa),
      urbanAlt: new THREE.Color(0x9a9791),
      park: new THREE.Color(0x4a6838),
      parkAlt: new THREE.Color(0x5a7a40),
      road: new THREE.Color(0x4c4d51),
      bank: new THREE.Color(0xa9a48f),
      bed: new THREE.Color(0x3a4c4a),
      dry: new THREE.Color(0xbdb7a5),
    },
    setting: { haze: { colour: 0xd3d6d9, density: 0.00024 } },
    // FootTown is 76 m across and the feet reach 88; the survey's own rings
    // are the only things inside sixty metres, and the Shiba Koen office
    // blocks start at seventy. The old 120 deleted all thirty-seven of them.
    cityExcludeRadius: 62,
    contextExclude: 60,
    // From the south-east, where Zojoji's great hall stands in front of it:
    // the photograph everybody takes, the temple roof and the tower rising
    // orange behind it. Far enough back to hold 333 m looking up.
    camera: { yaw: 0.75, pitch: 0.14, distance: 480, height: 125 },
    structures: (quality) => [
      { key: 'tokyotower', blocks: buildTokyotower(quality), primary: true, required: true, label: 'TOKYO TOWER' },
    ],
    garrison: (g, origin, groundY) => populateTokyotower(g, origin, groundY),
    // The tower, not the building between its feet.
    scoreTags: ['legs', 'arches', 'cage', 'observatory', 'upper', 'antenna'],
    // Shiba Park: lawns and paths with a fence round the tower's own plot.
    precinct: { boundary: 'railings', ground: 'lawn', ornament: 'none' },
    // A lattice: no windows to post men in, and the bay is a kilometre off.
    traits: { windows: false, river: false, topples: true },
    par: { rounds: 40, spend: 6000, minutes: 3, leverage: 6 },
    brief: 'The weight is the observatory at 145 m, not the antenna. The fall is decided at the feet.',
  },
  budapest: {
    id: 'budapest',
    terrain: 'budapest',
    lat: 47.50704, lon: 19.04569,
    name: 'HUNGARIAN PARLIAMENT',
    place: 'Budapest',
    target: 'HUNGARIAN PARLIAMENT',
    subtitle: 'Hungarian Parliament, Budapest',
    victory: 'The House Is Not in Order',
    // Pest: ochre and grey render, red tile, the Danube a working green-grey.
    // Cologne's Rhineland palette warmed up: the same river light, yellower
    // stucco.
    palette: {
      urban: new THREE.Color(0xb9ab93),
      urbanAlt: new THREE.Color(0xa2927a),
      park: new THREE.Color(0x4c6c36),
      parkAlt: new THREE.Color(0x5e7e3e),
      road: new THREE.Color(0x45464a),
      bank: new THREE.Color(0xaea283),
      bed: new THREE.Color(0x33473f),
      dry: new THREE.Color(0xc2b598),
    },
    setting: { haze: { colour: 0xcdd1d4, density: 0.00023 } },
    // The survey has one building inside 120 m, and it is the Országház
    // itself; the House stands alone on its own bank with Kossuth tér east of
    // it. The building is 323 m long, so the radius is a margin round the
    // footprint, which the context builder measures, not a circle round it.
    cityExcludeRadius: 100,
    contextExclude: 90,
    // From the Buda embankment across the Danube, a little downstream: the
    // whole river front, the dome in the middle, the two spires beside it
    // and a pavilion at either end. The picture on every postcard.
    camera: { yaw: -1.30, pitch: 0.09, distance: 430, height: 48 },
    structures: (quality) => [
      { key: 'budapest', blocks: buildBudapest(quality), primary: true, required: true, label: 'HUNGARIAN PARLIAMENT' },
    ],
    garrison: (g, origin, groundY) => populateBudapest(g, origin, groundY),
    // The dome, the drum it stands on and the two spires beside it. The wings
    // are the mass of the building and they are not the contract.
    scoreTags: ['dome', 'drum', 'spires'],
    // Kossuth tér: paving, the embankment wall, the statues a parliament
    // square has.
    precinct: { boundary: 'railings', ground: 'lawn', ornament: 'statues', river: 'embankment' },
    // A shell: it never topples, it has to be broken; the suite must not
    // expect it to go over.
    traits: { windows: true, river: true, topples: false },
    par: { rounds: 110, spend: 16000, minutes: 5, leverage: 2 },
    brief: 'The wings are not the building. The dome stands on sixteen piers inside the hall.',
  },
  sagrada: {
    id: 'sagrada',
    terrain: 'sagrada',
    lat: 41.40363, lon: 2.17435,
    name: 'SAGRADA FAMILIA',
    place: 'Barcelona',
    target: 'SAGRADA FAMILIA',
    subtitle: 'Sagrada Familia, Barcelona',
    victory: 'Finished At Last',
    // The Eixample: ochre and cream render, terracotta roofs, plane trees,
    // dry Mediterranean light. Istanbul's warm palette with the sea taken
    // out of it.
    palette: {
      urban: new THREE.Color(0xc4ad8e),
      urbanAlt: new THREE.Color(0xad9573),
      park: new THREE.Color(0x587040),
      parkAlt: new THREE.Color(0x6a824a),
      road: new THREE.Color(0x5a5752),
      bank: new THREE.Color(0xb8a888),
      bed: new THREE.Color(0x3b4d4a),
      dry: new THREE.Color(0xcfbf9f),
    },
    setting: { haze: { colour: 0xd8d6cd, density: 0.00021 } },
    // The basilica fills its own Eixample block; the two squares either side
    // of it are the next blocks over, and the apartments start beyond them at
    // a hundred metres. The old 120 took every one of the forty buildings the
    // survey found, the school and the shop among them.
    cityExcludeRadius: 82,
    contextExclude: 76,
    // From the Placa de Gaudi across the pond, north-east of the church: the
    // Nativity front's four towers with Jesus and the Evangelists rising
    // behind them, which is the picture of the place.
    camera: { yaw: 2.15, pitch: 0.08, distance: 330, height: 70 },
    structures: (quality) => [
      { key: 'sagrada', blocks: buildSagrada(quality), primary: true, required: true, label: 'SAGRADA FAMILIA' },
    ],
    garrison: (g, origin, groundY) => populateSagrada(g, origin, groundY),
    // The eighteen towers. The nave is the hall they stand in.
    scoreTags: ['nativity', 'passion', 'evangelists', 'mary', 'jesus'],
    precinct: { boundary: 'railings', ground: 'lawn', ornament: 'statues' },
    traits: { windows: true, river: false, topples: true },
    par: { rounds: 70, spend: 12000, minutes: 4, leverage: 6 },
    brief: 'Every spire is a hollow cone on piers. The tallest stands on the four piers of the crossing.',
  },
  edinburgh: {
    id: 'edinburgh',
    terrain: 'edinburgh',
    lat: 55.94862, lon: -3.1998,
    name: 'EDINBURGH CASTLE',
    place: 'Edinburgh',
    target: 'EDINBURGH CASTLE',
    subtitle: 'Edinburgh Castle, Edinburgh',
    victory: 'Auld Reekie, Auld Rubble',
    // Edinburgh: grey-brown sandstone and slate under a north-sea sky, the
    // gardens below the rock a wet green, the roads dark. Cologne's grey
    // palette with the warmth taken out of the stone.
    palette: {
      urban: new THREE.Color(0x9e968a),
      urbanAlt: new THREE.Color(0x857d72),
      park: new THREE.Color(0x47683a),
      parkAlt: new THREE.Color(0x587a44),
      road: new THREE.Color(0x3d3f42),
      bank: new THREE.Color(0x9a927c),
      bed: new THREE.Color(0x35453f),
      dry: new THREE.Color(0xa89f8c),
    },
    setting: { haze: { colour: 0xc9ced2, density: 0.00026 } },
    // Every one of the twenty-four buildings the survey finds inside 120 m is
    // the castle: the Palace, the Great Hall, the Barracks, the Gatehouse and
    // the rest, which the builder lays itself. The Old Town begins at the foot
    // of the Esplanade two hundred metres east and stays.
    cityExcludeRadius: 200,
    contextExclude: 190,
    // The rock is the level. The bake cuts Castle Rock as a crag with the
    // summit at 130 m and no structure may flatten it: every wall carries its
    // own foundation down to meet the rock wherever the rock has fallen away,
    // which is what the Half Moon over the Esplanade and the Palace over the
    // southern cliff actually are.
    groundLevel: 'bake',
    padRadius: 0,
    // From Princes Street Gardens, north-east and eighty-five metres below:
    // the rock, the batteries along its rim, the Half Moon and the Palace
    // over it, looked up at. Nearly level, so the crag fills the frame.
    camera: { yaw: 2.55, pitch: 0.03, distance: 470, height: 18 },
    structures: (quality) => [
      { key: 'edinburgh', blocks: buildEdinburgh(quality), primary: true, required: true, label: 'EDINBURGH CASTLE' },
    ],
    garrison: (g, origin, groundY) => populateEdinburgh(g, origin, groundY),
    // The One O'Clock Gun on Mills Mount: the north rim of the summit, on the
    // castle's own level ground behind the battery wall, the gun facing north
    // over the gardens where the battery deploys.
    turret: { x: EDINBURGH.gun.x, z: EDINBURGH.gun.z, yaw: Math.PI, scale: 1.25, minRange: 60 },
    // The castle's buildings and the Half Moon; the batteries are the rim of
    // the rock and stay as ground.
    scoreTags: ['halfmoon', 'palace', 'greathall', 'chapel', 'gatehouse', 'barracks'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    // A fortress on a hill: walls bonded to the rock, nothing that leans.
    // It comes down course by course or it does not come down.
    traits: { windows: true, river: false, topples: false },
    unlockScale: 4,
    par: { rounds: 120, spend: 18000, minutes: 6, leverage: 2 },
    brief: 'The Half Moon is a retaining wall. Behind it is the fill the Palace stands on.',
  },
  neuschwanstein: {
    id: 'neuschwanstein',
    terrain: 'neuschwanstein',
    lat: 47.55757, lon: 10.74972,
    name: 'NEUSCHWANSTEIN CASTLE',
    place: 'Schwangau',
    target: 'NEUSCHWANSTEIN CASTLE',
    subtitle: 'Neuschwanstein Castle, Schwangau',
    victory: 'The Fairy Tale Is Over',
    // The Ammergau Alps: spruce forest on limestone, alpine meadow in the
    // valley, grey rock, the Alpsee's cold green. Rio's forest palette with
    // the tropics taken out: darker conifer greens, paler meadow, grey road.
    palette: {
      urban: new THREE.Color(0x8e9670),
      urbanAlt: new THREE.Color(0x7a845e),
      park: new THREE.Color(0x3a5c30),
      parkAlt: new THREE.Color(0x476b38),
      road: new THREE.Color(0x6a665e),
      bank: new THREE.Color(0x9a9c80),
      bed: new THREE.Color(0x3a5652),
      dry: new THREE.Color(0x9aa075),
    },
    // Forest to the horizon, closing in past the castle's own clearing, and
    // the thin blue haze of a thousand metres of altitude.
    setting: {
      hinterland: 'forest', canopy: 2.4, canopyFrom: 130,
      haze: { colour: 0xc4d2df, density: 0.00014 },
    },
    // The survey finds fourteen buildings inside 120 m and every one is the
    // castle or its restaurant and shop on the ridge; Hohenschwangau is a
    // kilometre away in the valley and stays.
    cityExcludeRadius: 120,
    contextExclude: 110,
    // A ridge, not a pad: the bake's summit is the floor, and every wall of
    // the castle carries its own footing down the flanks to meet the rock.
    // The Palas stands on sixty metres of it over the gorge.
    groundLevel: 'bake',
    padRadius: 0,
    // The Marienbrücke view, from the south-east over the gorge: the Palas
    // end-on with the round tower against it and the courtyard buildings
    // stepping down the ridge behind.
    camera: { yaw: 0.55, pitch: 0.10, distance: 480, height: 45 },
    structures: (quality) => [
      { key: 'neuschwanstein', blocks: buildNeuschwanstein(quality), primary: true, required: true, label: 'NEUSCHWANSTEIN CASTLE' },
    ],
    garrison: (g, origin, groundY) => populateNeuschwanstein(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    // Two slender towers on a big block: they go over the way they lean.
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    par: { rounds: 70, spend: 12000, minutes: 4, leverage: 6 },
    brief: 'Two slender towers on the corners of a big block. They go over the way they lean; the Palas is the counterweight.',
  },
  montstmichel: {
    id: 'montstmichel',
    terrain: 'montstmichel',
    lat: 48.63601, lon: -1.51141,
    name: 'MONT-SAINT-MICHEL',
    place: 'Normandy',
    target: 'MONT-SAINT-MICHEL',
    subtitle: 'Mont-Saint-Michel, Normandy',
    victory: 'TODO(montstmichel) THE LINE THE END CARD LEADS WITH',
    // TODO(montstmichel) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(montstmichel) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(montstmichel) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(montstmichel) the postcard angle
    structures: (quality) => [
      { key: 'montstmichel', blocks: buildMontstmichel(quality), primary: true, required: true, label: 'MONT-SAINT-MICHEL' },
    ],
    garrison: (g, origin, groundY) => populateMontstmichel(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(montstmichel)
    traits: { windows: false, river: false, topples: true },           // TODO(montstmichel)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(montstmichel) from the suite's undercut
    brief: 'TODO(montstmichel) one sentence: what the player has to find out about this building.',
  },
  pena: {
    id: 'pena',
    terrain: 'pena',
    lat: 38.78762, lon: -9.39058,
    name: 'PENA PALACE',
    place: 'Sintra',
    target: 'PENA PALACE',
    subtitle: 'Pena Palace, Sintra',
    victory: 'TODO(pena) THE LINE THE END CARD LEADS WITH',
    // TODO(pena) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(pena) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(pena) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(pena) the postcard angle
    structures: (quality) => [
      { key: 'pena', blocks: buildPena(quality), primary: true, required: true, label: 'PENA PALACE' },
    ],
    garrison: (g, origin, groundY) => populatePena(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(pena)
    traits: { windows: false, river: false, topples: true },           // TODO(pena)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(pena) from the suite's undercut
    brief: 'TODO(pena) one sentence: what the player has to find out about this building.',
  },
  hassan: {
    id: 'hassan',
    terrain: 'hassan',
    lat: 33.60822, lon: -7.63262,
    name: 'HASSAN II MOSQUE',
    place: 'Casablanca',
    target: 'HASSAN II MOSQUE',
    subtitle: 'Hassan II Mosque, Casablanca',
    victory: 'TODO(hassan) THE LINE THE END CARD LEADS WITH',
    // TODO(hassan) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(hassan) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(hassan) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(hassan) the postcard angle
    structures: (quality) => [
      { key: 'hassan', blocks: buildHassan(quality), primary: true, required: true, label: 'HASSAN II MOSQUE' },
    ],
    garrison: (g, origin, groundY) => populateHassan(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(hassan)
    traits: { windows: false, river: false, topples: true },           // TODO(hassan)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(hassan) from the suite's undercut
    brief: 'TODO(hassan) one sentence: what the player has to find out about this building.',
  },
  kuwait: {
    id: 'kuwait',
    terrain: 'kuwait',
    lat: 29.38988, lon: 48.0028,
    name: 'KUWAIT TOWERS',
    place: 'Kuwait City',
    target: 'KUWAIT TOWERS',
    subtitle: 'Kuwait Towers, Kuwait City',
    victory: 'TODO(kuwait) THE LINE THE END CARD LEADS WITH',
    // TODO(kuwait) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(kuwait) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(kuwait) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(kuwait) the postcard angle
    structures: (quality) => [
      { key: 'kuwait', blocks: buildKuwait(quality), primary: true, required: true, label: 'KUWAIT TOWERS' },
    ],
    garrison: (g, origin, groundY) => populateKuwait(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(kuwait)
    traits: { windows: false, river: false, topples: true },           // TODO(kuwait)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(kuwait) from the suite's undercut
    brief: 'TODO(kuwait) one sentence: what the player has to find out about this building.',
  },
  karnak: {
    id: 'karnak',
    terrain: 'karnak',
    lat: 25.71877, lon: 32.65721,
    name: 'KARNAK TEMPLE',
    place: 'Luxor',
    target: 'KARNAK TEMPLE',
    subtitle: 'Karnak Temple, Luxor',
    victory: 'TODO(karnak) THE LINE THE END CARD LEADS WITH',
    // TODO(karnak) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(karnak) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(karnak) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(karnak) the postcard angle
    structures: (quality) => [
      { key: 'karnak', blocks: buildKarnak(quality), primary: true, required: true, label: 'KARNAK TEMPLE' },
    ],
    garrison: (g, origin, groundY) => populateKarnak(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(karnak)
    traits: { windows: false, river: false, topples: true },           // TODO(karnak)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(karnak) from the suite's undercut
    brief: 'TODO(karnak) one sentence: what the player has to find out about this building.',
  },
  forbidden: {
    id: 'forbidden',
    terrain: 'forbidden',
    lat: 39.91593, lon: 116.39069,
    name: 'Forbidden City, Beijing',
    place: 'The Outer Court, Beijing',
    target: 'FORBIDDEN CITY',
    subtitle: 'The Three Great Halls \u00b7 Beijing',
    victory: 'Harmony Disturbed',
    // North China in a dry autumn: grey hutong tile, dust, and the thin
    // parkland of a city that gets its rain in one month. The moat and the
    // lakes are green-brown and still.
    palette: {
      urban: new THREE.Color(0xa39c91),
      urbanAlt: new THREE.Color(0x8f877c),
      park: new THREE.Color(0x5d7040),
      parkAlt: new THREE.Color(0x6b7d47),
      road: new THREE.Color(0x504e4c),
      bank: new THREE.Color(0xc2b48f),
      bed: new THREE.Color(0x4a5a50),
      dry: new THREE.Color(0xcbbfa3),
    },
    // Beijing's air: warm and dusty, and thick enough that the hills to the
    // west are a rumour.
    setting: { haze: { colour: 0xd9d0bf, density: 0.00030 } },
    // The survey has the whole Outer Court by name — the three halls, the
    // side gates, the flanking galleries — at life size, inside 120 m. The
    // builder lays the same halls at twice life on a terrace 460 m long, so
    // every one of them would stand inside the marble; the radius clears the
    // court and the town of grey courtyards begins beyond it.
    cityExcludeRadius: 380,
    contextExclude: 360,
    // From the south, across the Taihemen courtyard: the view up the three
    // flights of stairs to the Hall of Supreme Harmony that every photograph
    // of the place is taken from. Low, so the roofs stand against the sky
    // and the terrace is a base and not a plate.
    camera: { yaw: 0.16, pitch: 0.13, distance: 470, height: 38 },
    structures: (quality) => [
      { key: 'forbidden', blocks: buildForbidden(quality), primary: true, required: true, label: 'FORBIDDEN CITY' },
    ],
    garrison: (g, origin, groundY) => populateForbidden(g, origin, groundY),
    // The terrace is ground; the three halls are the contract.
    scoreTags: ['supreme', 'central', 'preserving'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    traits: { windows: true, river: false, topples: true },
    par: { rounds: 70, spend: 16000, minutes: 5, leverage: 6 },
    brief: 'The marble terrace cannot be shot down. The roofs are the heaviest part of the halls on it, and they go over the way you lean them.',
  },

  gyeongbok: {
    id: 'gyeongbok',
    terrain: 'gyeongbok',
    lat: 37.57859, lon: 126.97705,
    name: 'Gyeongbokgung, Seoul',
    place: 'Jongno, Seoul',
    target: 'GYEONGBOKGUNG',
    subtitle: 'Geunjeongjeon \u00b7 Seoul',
    victory: 'Throne Room Vacated',
    // Seoul in early autumn: grey-brown blocks and dark grey roofs, the
    // palace gardens and the wooded slope of Bugaksan behind, the stream
    // channels dark and shallow.
    palette: {
      urban: new THREE.Color(0xa8a39a),
      urbanAlt: new THREE.Color(0x958f85),
      park: new THREE.Color(0x4a6a3a),
      parkAlt: new THREE.Color(0x587a44),
      road: new THREE.Color(0x4e4e52),
      bank: new THREE.Color(0xb5aa8e),
      bed: new THREE.Color(0x3f5548),
      dry: new THREE.Color(0xc0b69c),
    },
    setting: { haze: { colour: 0xd4d8d6, density: 0.00025 } },
    // The survey names the whole palace at life size within 120 m —
    // Sajeongjeon, Gangnyeongjeon, Sujeongjeon, the gate — and the courtyard
    // built here at 2.2× is 275 by 300 m, so all of it would stand inside
    // the cloisters. Cleared to the cloister ring plus a street.
    cityExcludeRadius: 200,
    contextExclude: 190,
    // From the south, over Geunjeongmun, up the courtyard to the throne hall
    // with the mountain behind it: the view the palace was laid out for.
    camera: { yaw: 0.06, pitch: 0.11, distance: 400, height: 30 },
    structures: (quality) => [
      { key: 'gyeongbok', blocks: buildGyeongbok(quality), primary: true, required: true, label: 'GYEONGBOKGUNG' },
    ],
    garrison: (g, origin, groundY) => populateGyeongbok(g, origin, groundY),
    // The hall and the gate. The cloisters are the garrison's cover and the
    // terrace is ground; neither moves the bar.
    scoreTags: ['hall', 'gate'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    traits: { windows: true, river: false, topples: true },
    par: { rounds: 60, spend: 12000, minutes: 4, leverage: 6 },
    brief: 'The cloister ring is not the target and the terrace cannot fall; the hall and the gate are top-heavy and go over the way you lean them.',
  },

  watarun: {
    id: 'watarun',
    terrain: 'watarun',
    lat: 13.74378, lon: 100.48885,
    name: 'Wat Arun, Bangkok',
    place: 'Thonburi, Bangkok',
    target: 'WAT ARUN',
    subtitle: 'Temple of Dawn \u00b7 Chao Phraya',
    victory: 'Dawn Broken',
    // Bangkok: a low wet city on a brown river. Warm concrete and rust roofs,
    // hard green where anything is left to grow, and the Chao Phraya the
    // colour of tea.
    palette: {
      urban: new THREE.Color(0x9a927e),
      urbanAlt: new THREE.Color(0x847c6a),
      park: new THREE.Color(0x4a6a34),
      parkAlt: new THREE.Color(0x587a3c),
      road: new THREE.Color(0x45443f),
      bank: new THREE.Color(0x9c8f6e),
      bed: new THREE.Color(0x5a5a43),
      dry: new THREE.Color(0xa39a78),
    },
    // Fourteen degrees north and at sea level: the air is white with water.
    setting: { haze: { colour: 0xdcd8cc, density: 0.00034 }, canopy: 1.2 },
    // The wat's own halls — the ubosot 105 m south-west, the vihara 66 m
    // west, the two small chapels east — are surveyed at life size. The
    // prang at twice life fills 130 m, so the ring inside 80 m goes and the
    // ordination hall and the outer monastery stay where they are.
    cityExcludeRadius: 80,
    contextExclude: 75,
    // From the river, which is the only way anyone has ever seen it: the
    // ferry from Tha Tien, with the prang against the western sky.
    camera: { yaw: 1.45, pitch: 0.10, distance: 360, height: 60 },
    structures: (quality) => [
      { key: 'watarun', blocks: buildWatarun(quality), primary: true, required: true, label: 'WAT ARUN' },
    ],
    garrison: (g, origin, groundY) => populateWatarun(g, origin, groundY),
    precinct: { boundary: 'railings', ground: 'lawn', ornament: 'statues', river: 'ghats' },
    traits: { windows: false, river: true, topples: false },
    // Solid brick, twice life: a tenth of Khufu's mass and a good deal of it.
    unlockScale: 4,
    par: { rounds: 90, spend: 14000, minutes: 5, leverage: 2 },
    brief: 'A prang is solid and does not fall. The terraces at its foot carry the spire: undercut one side and that side comes down the steps.',
  },

  shwedagon: {
    id: 'shwedagon',
    terrain: 'shwedagon',
    lat: 16.79845, lon: 96.14957,
    name: 'Shwedagon Pagoda, Yangon',
    place: 'Singuttara Hill, Yangon',
    target: 'SHWEDAGON PAGODA',
    subtitle: 'The Golden Stupa \u00b7 Singuttara Hill',
    victory: 'Gold Standard Lowered',
    // Yangon: a wet green city of rust roofs and rain-stained concrete, the
    // lakes brown, everything that is not built on growing.
    palette: {
      urban: new THREE.Color(0x8a8468),
      urbanAlt: new THREE.Color(0x77704f),
      park: new THREE.Color(0x3d5c2c),
      parkAlt: new THREE.Color(0x4a6b33),
      road: new THREE.Color(0x4a4844),
      bank: new THREE.Color(0x9c9370),
      bed: new THREE.Color(0x4b5a3f),
      dry: new THREE.Color(0x9e9a6e),
    },
    // Monsoon air, white and heavy, and trees closing in past the town.
    setting: { haze: { colour: 0xdad9cf, density: 0.00030 }, canopy: 1.6 },
    // The platform is levelled by the bake, 285 by 243 m of it on the summit,
    // and the fifty shrines the survey has on it are built here as the
    // sixty-four small stupas and the four halls. The stupa at 1.3× fills
    // 150 m; the radius clears the platform and the town begins down the hill.
    cityExcludeRadius: 150,
    contextExclude: 140,
    groundLevel: 'bake',
    // From the south-east, from the foot of the hill, looking up at the
    // whole gold bell against the sky: the postcard from Kandawgyi.
    camera: { yaw: 0.55, pitch: 0.07, distance: 470, height: 75 },
    structures: (quality) => [
      { key: 'shwedagon', blocks: buildShwedagon(quality), primary: true, required: true, label: 'SHWEDAGON PAGODA' },
    ],
    garrison: (g, origin, groundY) => populateShwedagon(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    traits: { windows: false, river: false, topples: false },
    // Solid gilded brick, three hundred and seventy thousand cubic metres of
    // it: a sixth of Khufu, and the unlocks are scaled to that.
    unlockScale: 8,
    par: { rounds: 120, spend: 20000, minutes: 6, leverage: 2 },
    brief: 'The stupa is solid gilded brick and nothing about it falls. Quarry it from the terraces up; the small stupas and the halls are what shoot back.',
  },

  angkor: {
    id: 'angkor',
    terrain: 'angkor',
    lat: 13.41253, lon: 103.86699,
    name: 'Angkor Wat, Siem Reap',
    place: 'Angkor, Siem Reap',
    target: 'ANGKOR WAT',
    subtitle: 'The Temple-Mountain \u00b7 Angkor',
    victory: 'Quincunx Cancelled',
    // Forest floor and laterite: the ground under the canopy is red-brown
    // earth and dark green, the moat and the basins the colour of tea.
    palette: {
      urban: new THREE.Color(0x6a6a42),
      urbanAlt: new THREE.Color(0x5a5b38),
      park: new THREE.Color(0x3b5a2e),
      parkAlt: new THREE.Color(0x486a34),
      road: new THREE.Color(0x8a6a4a),
      bank: new THREE.Color(0xa8946a),
      bed: new THREE.Color(0x4e5a3c),
      dry: new THREE.Color(0x8b7d55),
    },
    // Jungle to the horizon in every direction, closing in past the moat.
    setting: {
      hinterland: 'jungle', canopy: 2.5, canopyFrom: 320,
      haze: { colour: 0xcdd2b8, density: 0.00030 },
    },
    // The survey has the three enclosures and the libraries, all built here
    // at 1.3× from the outer gallery to the causeway's end 280 m west, so
    // the whole of the real footprint is inside the masonry; the radius
    // clears it and the forest takes over beyond.
    cityExcludeRadius: 320,
    contextExclude: 300,
    // From the west, down the causeway: the five towers over the galleries,
    // which is the only picture of Angkor anyone has ever taken.
    camera: { yaw: -1.42, pitch: 0.08, distance: 560, height: 42 },
    structures: (quality) => [
      { key: 'angkor', blocks: buildAngkor(quality), primary: true, required: true, label: 'ANGKOR WAT' },
    ],
    garrison: (g, origin, groundY) => populateAngkor(g, origin, groundY),
    // The five towers and the pyramid they stand on. The galleries are the
    // garrison's cover and the terraces are ground.
    scoreTags: ['towers', 'bakan'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: false, river: false, topples: false },
    unlockScale: 4,
    par: { rounds: 100, spend: 18000, minutes: 6, leverage: 2 },
    brief: 'The galleries are lintels on pillars and come down a bay at a time. The towers are solid, and each stands on one corner pier of the pyramid.',
  },

  borobudur: {
    id: 'borobudur',
    terrain: 'borobudur',
    lat: -7.60788, lon: 110.20367,
    name: 'BOROBUDUR',
    place: 'Magelang',
    target: 'BOROBUDUR',
    subtitle: 'Borobudur, Magelang',
    victory: 'TODO(borobudur) THE LINE THE END CARD LEADS WITH',
    // TODO(borobudur) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(borobudur) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(borobudur) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(borobudur) the postcard angle
    structures: (quality) => [
      { key: 'borobudur', blocks: buildBorobudur(quality), primary: true, required: true, label: 'BOROBUDUR' },
    ],
    garrison: (g, origin, groundY) => populateBorobudur(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(borobudur)
    traits: { windows: false, river: false, topples: true },           // TODO(borobudur)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(borobudur) from the suite's undercut
    brief: 'TODO(borobudur) one sentence: what the player has to find out about this building.',
  },
  tikal: {
    id: 'tikal',
    terrain: 'tikal',
    lat: 17.2218, lon: -89.62339,
    name: 'TIKAL',
    place: 'Peten',
    target: 'TIKAL',
    subtitle: 'Tikal, Peten',
    victory: 'TODO(tikal) THE LINE THE END CARD LEADS WITH',
    // TODO(tikal) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(tikal) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(tikal) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(tikal) the postcard angle
    structures: (quality) => [
      { key: 'tikal', blocks: buildTikal(quality), primary: true, required: true, label: 'TIKAL' },
    ],
    garrison: (g, origin, groundY) => populateTikal(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(tikal)
    traits: { windows: false, river: false, topples: true },           // TODO(tikal)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(tikal) from the suite's undercut
    brief: 'TODO(tikal) one sentence: what the player has to find out about this building.',
  },
  teotihuacan: {
    id: 'teotihuacan',
    terrain: 'teotihuacan',
    lat: 19.69245, lon: -98.84366,
    name: 'PYRAMID OF THE SUN',
    place: 'Teotihuacan',
    target: 'PYRAMID OF THE SUN',
    subtitle: 'Pyramid of the Sun, Teotihuacan',
    victory: 'TODO(teotihuacan) THE LINE THE END CARD LEADS WITH',
    // TODO(teotihuacan) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(teotihuacan) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(teotihuacan) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(teotihuacan) the postcard angle
    structures: (quality) => [
      { key: 'teotihuacan', blocks: buildTeotihuacan(quality), primary: true, required: true, label: 'PYRAMID OF THE SUN' },
    ],
    garrison: (g, origin, groundY) => populateTeotihuacan(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(teotihuacan)
    traits: { windows: false, river: false, topples: true },           // TODO(teotihuacan)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(teotihuacan) from the suite's undercut
    brief: 'TODO(teotihuacan) one sentence: what the player has to find out about this building.',
  },
  machupicchu: {
    id: 'machupicchu',
    terrain: 'machupicchu',
    lat: -13.16313, lon: -72.54495,
    name: 'MACHU PICCHU',
    place: 'Cusco',
    target: 'MACHU PICCHU',
    subtitle: 'Machu Picchu, Cusco',
    victory: 'TODO(machupicchu) THE LINE THE END CARD LEADS WITH',
    // TODO(machupicchu) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(machupicchu) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(machupicchu) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(machupicchu) the postcard angle
    structures: (quality) => [
      { key: 'machupicchu', blocks: buildMachupicchu(quality), primary: true, required: true, label: 'MACHU PICCHU' },
    ],
    garrison: (g, origin, groundY) => populateMachupicchu(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(machupicchu)
    traits: { windows: false, river: false, topples: true },           // TODO(machupicchu)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(machupicchu) from the suite's undercut
    brief: 'TODO(machupicchu) one sentence: what the player has to find out about this building.',
  },
  greatwall: {
    id: 'greatwall',
    terrain: 'greatwall',
    lat: 40.35968, lon: 116.02005,
    name: 'GREAT WALL AT BADALING',
    place: 'Beijing',
    target: 'GREAT WALL AT BADALING',
    subtitle: 'Great Wall at Badaling, Beijing',
    victory: 'TODO(greatwall) THE LINE THE END CARD LEADS WITH',
    // TODO(greatwall) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(greatwall) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(greatwall) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(greatwall) the postcard angle
    structures: (quality) => [
      { key: 'greatwall', blocks: buildGreatwall(quality), primary: true, required: true, label: 'GREAT WALL AT BADALING' },
    ],
    garrison: (g, origin, groundY) => populateGreatwall(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(greatwall)
    traits: { windows: false, river: false, topples: true },           // TODO(greatwall)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(greatwall) from the suite's undercut
    brief: 'TODO(greatwall) one sentence: what the player has to find out about this building.',
  },
};

export const DEFAULT_LEVEL = 'westminster';

/**
 * The order the target-select screen lists them in, easiest first.
 *
 * Nothing is locked. Gating the new maps behind finishing the old ones would
 * hide most of the game from anybody opening it for the first time, and the
 * levels are not a difficulty curve so much as four different problems — a
 * cantilever, a dome, a lattice, and a mountain.
 */
export const LEVEL_ORDER = ['westminster', 'paris', 'agra', 'giza', 'chichen', 'pisa', 'sydney', 'moscow', 'rio',
  'athens', 'istanbul', 'cologne', 'himeji', 'petronas', 'dubai', 'potala', 'colosseum', 'towerbridge', 'florence', 'segovia', 'atomium', 'tokyotower', 'budapest', 'sagrada', 'edinburgh', 'neuschwanstein', 'montstmichel', 'pena', 'hassan', 'kuwait', 'karnak', 'forbidden', 'gyeongbok', 'watarun', 'shwedagon', 'angkor', 'borobudur', 'tikal', 'teotihuacan', 'machupicchu', 'greatwall'];

/** One line on the target-select card, saying what kind of problem this is. */
export const LEVEL_BLURB = {
  westminster: 'A hollow tower on four walls. Undercut one face and it goes over that way.',
  paris: 'Three hundred metres of iron on four legs. Cut one and it falls towards it.',
  agra: 'A dome on four piers over a marble terrace. It will not topple; it has to be broken.',
  giza: 'Two and a third million cubic metres of limestone. Nothing here falls over.',
  chichen: 'A pyramid built over an older pyramid. The skin is not the building.',
  pisa: 'Eighty-nine metres already falling. The part that overhangs is the part that is safe.',
  sydney: 'Fourteen shells on a headland with one road in. Arches, not walls.',
  moscow: 'Nine towers on one basement. No single cut wins; the basement is shared.',
  rio: 'Seven hundred metres up, and the part everyone shoots weighs nothing.',
  athens: 'Forty-six columns and a lintel over every pair. Kick the columns out and the roof comes with them.',
  istanbul: 'A dome fifty metres up on four arches, held from outside. Open one side and it thrusts out.',
  cologne: 'Two hollow stone spires on their piers. Cut a pier and the spire above it follows.',
  himeji: 'Six storeys of timber on a sloping stone base. The base stands; the keep goes over.',
  petronas: 'Two towers and a bridge that holds neither of them up. Both towers are the contract.',
  dubai: 'Half a kilometre of concrete core and glass in setbacks. Everything above a cut is a free body.',
  potala: 'Four hundred metres of battered wall on a red hill. The white is not the building.',
  colosseum: "An ellipse of eighty piers under three storeys of arches. Where the cavea is gone, two piers hold a bay.",
  towerbridge: "Two towers on piers in a river, tied by the walkways. Drop a pier and the spans on it go in the water.",
  florence: "The biggest brick dome ever raised, on a drum on four piers. It will not topple; open a tribune and it spreads.",
  segovia: "Two tiers of unmortared arches sixty metres high. Take one pier and the chain unzips to the next wide one.",
  atomium: "Nine steel spheres on the edges of a cube on a point. The spheres weigh; the tubes and bipods carry.",
  tokyotower: "Three hundred metres of orange lattice on four legs. Cut a leg and it falls toward it; the mass is low.",
  budapest: "A dome on sixteen piers over a hall, with three hundred metres of wings that are not the contract.",
  sagrada: "Eighteen hollow stone spires, each on four piers. The tallest stands over the crossing on four columns.",
  edinburgh: "A fortress on a volcanic plug. The Half Moon Battery is a retaining wall, and the palace stands on what it holds.",
  neuschwanstein: "A white castle along a ridge, two towers on the corners of one block. They go over the way you lean them.",
  montstmichel: "An abbey on a rock in a tidal bay. The church stands on crypts built out on the flanks; break one.",
  pena: "A red and yellow palace on a crag, leaning on a round bastion at the cliff edge.",
  hassan: "A two-hundred-metre minaret on the corner of a hall whose roof is beams on seventy-eight columns.",
  kuwait: "Three slender concrete shafts, two of them carrying spheres of water. Cut a shaft below its sphere.",
  karnak: "A hundred and thirty-four columns under lintels. Kick one out and the next carries a cantilever.",
  forbidden: "Three halls under yellow roofs on one marble terrace. The terrace stands; the halls are top-heavy and go over.",
  gyeongbok: "A throne hall under a two-tier roof on a granite terrace. The terrace stands; the hall does not.",
  watarun: "A seventy-metre prang encrusted in porcelain. Solid; quarry it, or undercut a terrace and shed its skin.",
  shwedagon: "A hundred metres of gilded brick on a hill. It does not fall. Sixty-four small stupas round it do.",
  angkor: "Five towers on a pyramid base inside three galleries and a moat. The towers stand on the corner piers.",
  borobudur: "Nine terraces of andesite with seventy-two bell stupas on top. A hill with a stone skin; the top is the score.",
  tikal: "A steep nine-terrace pyramid with a hollow roof comb on its shrine. Shoot the comb's base and it topples whole.",
  teotihuacan: "Sixty-five metres of rubble faced in stone, in five tiers. Nothing falls; there is a tunnel under the centre.",
  machupicchu: "Dry ashlar on a saddle ridge. Nothing is tall; the terraces hold the temples up.",
  greatwall: "Five hundred metres of wall along a ridge with five towers. The wall will not topple; the towers are the score.",
};

/** Ordered level records, for menus. */
export function levelList() {
  return LEVEL_ORDER.filter((id) => LEVELS[id]).map((id) => LEVELS[id]);
}

export function levelOrigin(terrain) {
  const y = terrain.heightAt(0, 0);
  return new THREE.Vector3(0, y, 0);
}
