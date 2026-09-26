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
import { buildEdinburgh, populateEdinburgh } from '../structure/landmarks/edinburgh.js';
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
    name: 'COLOSSEUM',
    place: 'Rome',
    target: 'COLOSSEUM',
    subtitle: 'Colosseum, Rome',
    victory: 'TODO(colosseum) THE LINE THE END CARD LEADS WITH',
    // TODO(colosseum) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(colosseum) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(colosseum) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(colosseum) the postcard angle
    structures: (quality) => [
      { key: 'colosseum', blocks: buildColosseum(quality), primary: true, required: true, label: 'COLOSSEUM' },
    ],
    garrison: (g, origin, groundY) => populateColosseum(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(colosseum)
    traits: { windows: false, river: false, topples: true },           // TODO(colosseum)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(colosseum) from the suite's undercut
    brief: 'TODO(colosseum) one sentence: what the player has to find out about this building.',
  },
  towerbridge: {
    id: 'towerbridge',
    terrain: 'towerbridge',
    lat: 51.5076, lon: -0.0761,
    name: 'TOWER BRIDGE',
    place: 'London',
    target: 'TOWER BRIDGE',
    subtitle: 'Tower Bridge, London',
    victory: 'TODO(towerbridge) THE LINE THE END CARD LEADS WITH',
    // TODO(towerbridge) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(towerbridge) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(towerbridge) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(towerbridge) the postcard angle
    structures: (quality) => [
      { key: 'towerbridge', blocks: buildTowerbridge(quality), primary: true, required: true, label: 'TOWER BRIDGE' },
    ],
    garrison: (g, origin, groundY) => populateTowerbridge(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(towerbridge)
    traits: { windows: false, river: false, topples: true },           // TODO(towerbridge)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(towerbridge) from the suite's undercut
    brief: 'TODO(towerbridge) one sentence: what the player has to find out about this building.',
  },
  florence: {
    id: 'florence',
    terrain: 'florence',
    lat: 43.77313, lon: 11.256,
    name: 'FLORENCE CATHEDRAL',
    place: 'Florence',
    target: 'FLORENCE CATHEDRAL',
    subtitle: 'Florence Cathedral, Florence',
    victory: 'TODO(florence) THE LINE THE END CARD LEADS WITH',
    // TODO(florence) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(florence) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(florence) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(florence) the postcard angle
    structures: (quality) => [
      { key: 'florence', blocks: buildFlorence(quality), primary: true, required: true, label: 'FLORENCE CATHEDRAL' },
    ],
    garrison: (g, origin, groundY) => populateFlorence(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(florence)
    traits: { windows: false, river: false, topples: true },           // TODO(florence)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(florence) from the suite's undercut
    brief: 'TODO(florence) one sentence: what the player has to find out about this building.',
  },
  segovia: {
    id: 'segovia',
    terrain: 'segovia',
    lat: 40.94795, lon: -4.11798,
    name: 'AQUEDUCT OF SEGOVIA',
    place: 'Segovia',
    target: 'AQUEDUCT OF SEGOVIA',
    subtitle: 'Aqueduct of Segovia, Segovia',
    victory: 'TODO(segovia) THE LINE THE END CARD LEADS WITH',
    // TODO(segovia) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(segovia) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(segovia) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(segovia) the postcard angle
    structures: (quality) => [
      { key: 'segovia', blocks: buildSegovia(quality), primary: true, required: true, label: 'AQUEDUCT OF SEGOVIA' },
    ],
    garrison: (g, origin, groundY) => populateSegovia(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(segovia)
    traits: { windows: false, river: false, topples: true },           // TODO(segovia)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(segovia) from the suite's undercut
    brief: 'TODO(segovia) one sentence: what the player has to find out about this building.',
  },
  atomium: {
    id: 'atomium',
    terrain: 'atomium',
    lat: 50.89494, lon: 4.34144,
    name: 'ATOMIUM',
    place: 'Brussels',
    target: 'ATOMIUM',
    subtitle: 'Atomium, Brussels',
    victory: 'TODO(atomium) THE LINE THE END CARD LEADS WITH',
    // TODO(atomium) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(atomium) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(atomium) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(atomium) the postcard angle
    structures: (quality) => [
      { key: 'atomium', blocks: buildAtomium(quality), primary: true, required: true, label: 'ATOMIUM' },
    ],
    garrison: (g, origin, groundY) => populateAtomium(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(atomium)
    traits: { windows: false, river: false, topples: true },           // TODO(atomium)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(atomium) from the suite's undercut
    brief: 'TODO(atomium) one sentence: what the player has to find out about this building.',
  },
  tokyotower: {
    id: 'tokyotower',
    terrain: 'tokyotower',
    lat: 35.65858, lon: 139.74543,
    name: 'TOKYO TOWER',
    place: 'Tokyo',
    target: 'TOKYO TOWER',
    subtitle: 'Tokyo Tower, Tokyo',
    victory: 'TODO(tokyotower) THE LINE THE END CARD LEADS WITH',
    // TODO(tokyotower) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(tokyotower) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(tokyotower) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(tokyotower) the postcard angle
    structures: (quality) => [
      { key: 'tokyotower', blocks: buildTokyotower(quality), primary: true, required: true, label: 'TOKYO TOWER' },
    ],
    garrison: (g, origin, groundY) => populateTokyotower(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(tokyotower)
    traits: { windows: false, river: false, topples: true },           // TODO(tokyotower)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(tokyotower) from the suite's undercut
    brief: 'TODO(tokyotower) one sentence: what the player has to find out about this building.',
  },
  budapest: {
    id: 'budapest',
    terrain: 'budapest',
    lat: 47.50704, lon: 19.04569,
    name: 'HUNGARIAN PARLIAMENT',
    place: 'Budapest',
    target: 'HUNGARIAN PARLIAMENT',
    subtitle: 'Hungarian Parliament, Budapest',
    victory: 'TODO(budapest) THE LINE THE END CARD LEADS WITH',
    // TODO(budapest) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(budapest) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(budapest) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(budapest) the postcard angle
    structures: (quality) => [
      { key: 'budapest', blocks: buildBudapest(quality), primary: true, required: true, label: 'HUNGARIAN PARLIAMENT' },
    ],
    garrison: (g, origin, groundY) => populateBudapest(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(budapest)
    traits: { windows: false, river: false, topples: true },           // TODO(budapest)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(budapest) from the suite's undercut
    brief: 'TODO(budapest) one sentence: what the player has to find out about this building.',
  },
  sagrada: {
    id: 'sagrada',
    terrain: 'sagrada',
    lat: 41.40363, lon: 2.17435,
    name: 'SAGRADA FAMILIA',
    place: 'Barcelona',
    target: 'SAGRADA FAMILIA',
    subtitle: 'Sagrada Familia, Barcelona',
    victory: 'TODO(sagrada) THE LINE THE END CARD LEADS WITH',
    // TODO(sagrada) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(sagrada) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(sagrada) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(sagrada) the postcard angle
    structures: (quality) => [
      { key: 'sagrada', blocks: buildSagrada(quality), primary: true, required: true, label: 'SAGRADA FAMILIA' },
    ],
    garrison: (g, origin, groundY) => populateSagrada(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(sagrada)
    traits: { windows: false, river: false, topples: true },           // TODO(sagrada)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(sagrada) from the suite's undercut
    brief: 'TODO(sagrada) one sentence: what the player has to find out about this building.',
  },
  edinburgh: {
    id: 'edinburgh',
    terrain: 'edinburgh',
    lat: 55.94862, lon: -3.1998,
    name: 'EDINBURGH CASTLE',
    place: 'Edinburgh',
    target: 'EDINBURGH CASTLE',
    subtitle: 'Edinburgh Castle, Edinburgh',
    victory: 'TODO(edinburgh) THE LINE THE END CARD LEADS WITH',
    // TODO(edinburgh) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(edinburgh) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(edinburgh) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(edinburgh) the postcard angle
    structures: (quality) => [
      { key: 'edinburgh', blocks: buildEdinburgh(quality), primary: true, required: true, label: 'EDINBURGH CASTLE' },
    ],
    garrison: (g, origin, groundY) => populateEdinburgh(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(edinburgh)
    traits: { windows: false, river: false, topples: true },           // TODO(edinburgh)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(edinburgh) from the suite's undercut
    brief: 'TODO(edinburgh) one sentence: what the player has to find out about this building.',
  },
  neuschwanstein: {
    id: 'neuschwanstein',
    terrain: 'neuschwanstein',
    lat: 47.55757, lon: 10.74972,
    name: 'NEUSCHWANSTEIN CASTLE',
    place: 'Schwangau',
    target: 'NEUSCHWANSTEIN CASTLE',
    subtitle: 'Neuschwanstein Castle, Schwangau',
    victory: 'TODO(neuschwanstein) THE LINE THE END CARD LEADS WITH',
    // TODO(neuschwanstein) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(neuschwanstein) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(neuschwanstein) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(neuschwanstein) the postcard angle
    structures: (quality) => [
      { key: 'neuschwanstein', blocks: buildNeuschwanstein(quality), primary: true, required: true, label: 'NEUSCHWANSTEIN CASTLE' },
    ],
    garrison: (g, origin, groundY) => populateNeuschwanstein(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(neuschwanstein)
    traits: { windows: false, river: false, topples: true },           // TODO(neuschwanstein)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(neuschwanstein) from the suite's undercut
    brief: 'TODO(neuschwanstein) one sentence: what the player has to find out about this building.',
  },
  montstmichel: {
    id: 'montstmichel',
    terrain: 'montstmichel',
    lat: 48.63601, lon: -1.51141,
    name: 'MONT-SAINT-MICHEL',
    place: 'Normandy',
    target: 'MONT-SAINT-MICHEL',
    subtitle: 'Mont-Saint-Michel, Normandy',
    victory: 'Michel, Ma Belle',
    // A granite rock in a tidal bay: grey stone village, salt-marsh green on
    // the polders, the sands a pale grey-fawn and the sea a cold grey-green.
    palette: {
      urban: new THREE.Color(0xb3ab99),
      urbanAlt: new THREE.Color(0x9e957f),
      park: new THREE.Color(0x6d7f4a),
      parkAlt: new THREE.Color(0x7a8c52),
      road: new THREE.Color(0x6a665f),
      bank: new THREE.Color(0xc2b89a),
      bed: new THREE.Color(0x5a6e6a),
      dry: new THREE.Color(0xcfc6a8),
    },
    // Water to every horizon at high tide, and Channel air: cool, damp,
    // never quite clear.
    setting: {
      hinterland: 'harbour',
      haze: { colour: 0xc8d2d8, density: 0.00020 },
    },
    // The abbey's own outlines lie within forty metres of the summit and are
    // rebuilt here at 1.3; the village — seventy houses, hotels and towers
    // the survey has by name — begins seventy metres out on the south-east
    // benches and is kept, on its own streets, inside its own ramparts.
    cityExcludeRadius: 70,
    contextExclude: 65,
    // A summit. The bake's rock is the floor and nothing is flattened; the
    // church, the crypts and the Merveille carry their footings down to
    // meet it, thirty-six metres under the nave floor on the north face.
    groundLevel: 'bake',
    padRadius: 0,
    // From the bay to the south-south-west, low, the way it is seen from the
    // causeway: the village up the rock, the Merveille's flank, the spire.
    camera: { yaw: -0.35, pitch: 0.10, distance: 700, height: 30 },
    structures: (quality) => [
      { key: 'montstmichel', blocks: buildMontstmichel(quality), primary: true, required: true, label: 'MONT-SAINT-MICHEL' },
    ],
    garrison: (g, origin, groundY) => populateMontstmichel(g, origin, groundY),
    // The church, its spire and the Merveille: not the crypts under them,
    // which are the trick, and not the lodgings.
    scoreTags: ['church', 'spire', 'merveille'],
    precinct: { boundary: 'none', ground: 'paving', ornament: 'none' },
    // Walls founded in a rock: nothing here goes over as a whole. The church
    // comes off its crypts a part at a time.
    traits: { windows: true, river: false, topples: false },
    unlockScale: 3,
    par: { rounds: 120, spend: 18000, minutes: 7, leverage: 2 },
    brief: 'The church stands on the summit only at its nave; the choir and the north transept stand on crypts built out over the rock. Break a crypt and the church above it goes down the face.',
  },

  pena: {
    id: 'pena',
    terrain: 'pena',
    lat: 38.78762, lon: -9.39058,
    name: 'PENA PALACE',
    place: 'Sintra',
    target: 'PENA PALACE',
    subtitle: 'Pena Palace, Sintra',
    victory: 'The Pena Drops',
    // The Serra de Sintra: granite under a wet Atlantic forest, moss and
    // fern on every wall, the town's stone a grey-green. Nothing here is a
    // desert colour.
    palette: {
      urban: new THREE.Color(0x7c8a5c),
      urbanAlt: new THREE.Color(0x66744a),
      park: new THREE.Color(0x3d5a2e),
      parkAlt: new THREE.Color(0x4a6a35),
      road: new THREE.Color(0x6b655e),
      bank: new THREE.Color(0x8a8a6a),
      bed: new THREE.Color(0x35452c),
      dry: new THREE.Color(0x8d9367),
    },
    // Forest to every horizon, closing in past the palace's own crag; a thin
    // sea mist, because the Atlantic is ten kilometres west and the serra
    // makes its own weather.
    setting: {
      hinterland: 'forest', canopy: 2.4, canopyFrom: 110,
      haze: { colour: 0xc6d2d6, density: 0.00016 },
    },
    // The fifteen outlines the survey finds within a hundred and twenty
    // metres are the palace's own parts, all rebuilt here at 1.8; the
    // bastion stands a hundred metres out at the south-west corner.
    cityExcludeRadius: 130,
    contextExclude: 120,
    // A summit. The bake's crag is the floor, nothing is flattened, and the
    // terrace carries its own footing twenty-six metres down to meet the rock
    // where the ridge falls away at either end.
    groundLevel: 'bake',
    padRadius: 0,
    // From the south-east and low, the Cruz Alta view: the bastion and the
    // yellow palace in front, the red monastery and the clock tower behind.
    camera: { yaw: 0.80, pitch: 0.15, distance: 420, height: 30 },
    structures: (quality) => [
      { key: 'pena', blocks: buildPena(quality), primary: true, required: true, label: 'PENA PALACE' },
    ],
    garrison: (g, origin, groundY) => populatePena(g, origin, groundY),
    // The palace, not the terrace it stands on.
    scoreTags: ['monastery', 'chapel', 'newpalace', 'gate', 'clocktower', 'bastion'],
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    par: { rounds: 70, spend: 12000, minutes: 5, leverage: 6 },
    brief: 'The round bastion stands on the cliff on its own footing and the palace leans on it. Undercut the bastion and it goes down the west face alone.',
  },

  hassan: {
    id: 'hassan',
    terrain: 'hassan',
    lat: 33.60822, lon: -7.63262,
    name: 'HASSAN II MOSQUE',
    place: 'Casablanca',
    target: 'HASSAN II MOSQUE',
    subtitle: 'Hassan II Mosque, Casablanca',
    victory: 'Last Call to Prayer',
    // The white city on the Atlantic: pale render and limewash under
    // everything, the corniche's watered green, and a cold grey-green sea.
    palette: {
      urban: new THREE.Color(0xd9d2c2),
      urbanAlt: new THREE.Color(0xc4bba8),
      park: new THREE.Color(0x5f7f48),
      parkAlt: new THREE.Color(0x6e8c50),
      road: new THREE.Color(0x4e4c49),
      bank: new THREE.Color(0xcfc4a8),
      bed: new THREE.Color(0x35585e),
      dry: new THREE.Color(0xe0d8c4),
    },
    // Ocean on two sides, the medina and the port to the east and the new
    // town's towers to the south-east. Flat roofs.
    setting: {
      hinterland: 'harbour',
      downtown: { x: 1000, z: 1100, radius: 520, peak: 115 },
      haze: { colour: 0xc9d3d8, density: 0.00020 },
      roofPitch: 0,
    },
    // The survey has the whole platform as one outline; the hall and its
    // apron reach a hundred and seventy metres from the origin at the far
    // corner, and the city begins beyond the esplanade.
    cityExcludeRadius: 190,
    contextExclude: 180,
    // From the corniche to the south-west, low, the way it is photographed:
    // the minaret at the near corner, the hall running away along the sea.
    camera: { yaw: -0.75, pitch: 0.12, distance: 720, height: 60 },
    structures: (quality) => [
      { key: 'hassan', blocks: buildHassan(quality), primary: true, required: true, label: 'HASSAN II MOSQUE' },
    ],
    garrison: (g, origin, groundY) => populateHassan(g, origin, groundY),
    // The minaret and the hall; not the esplanade.
    scoreTags: ['minaret', 'hall', 'roof', 'beams', 'columns'],
    precinct: { boundary: 'none', ground: 'paving', ornament: 'none', river: 'quay' },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    par: { rounds: 80, spend: 15000, minutes: 5, leverage: 6 },
    brief: 'The minaret stands on four piers at the hall\'s corner, with an arch through every face. The piers are the fight; the hall is what it falls on.',
  },

  kuwait: {
    id: 'kuwait',
    terrain: 'kuwait',
    lat: 29.38988, lon: 48.0028,
    name: 'KUWAIT TOWERS',
    place: 'Kuwait City',
    target: 'KUWAIT TOWERS',
    subtitle: 'Kuwait Towers, Kuwait City',
    victory: 'Sphere Today, Gone Tomorrow',
    // The Gulf shore: pale sand under everything, the corniche's watered
    // green, roads black and new, and the sea a made turquoise. Dubai's
    // ground, a shade paler.
    palette: {
      urban: new THREE.Color(0xd6c9ad),
      urbanAlt: new THREE.Color(0xc2b193),
      park: new THREE.Color(0x6f8a4c),
      parkAlt: new THREE.Color(0x7f9a55),
      road: new THREE.Color(0x4c4a48),
      bank: new THREE.Color(0xdccaa2),
      bed: new THREE.Color(0x3c6b73),
      dry: new THREE.Color(0xe3d5b2),
    },
    // Sea on three sides and the city's towers along the bay to the
    // south-west. Nothing here pitches a roof.
    setting: {
      hinterland: 'harbour',
      downtown: { x: -1100, z: 700, radius: 520, peak: 210 },
      haze: { colour: 0xd9d6cc, density: 0.00022 },
      roofPitch: 0,
    },
    // The three stand alone on the point: within a hundred and twenty metres
    // the survey has only the towers' own footprints and the ticket office.
    cityExcludeRadius: 110,
    contextExclude: 100,
    // From the corniche to the south-west, the way every photograph has
    // them: the two balls overlapping, the needle behind, the Gulf beyond.
    camera: { yaw: -0.60, pitch: 0.12, distance: 520, height: 90 },
    structures: (quality) => [
      { key: 'kuwait', blocks: buildKuwait(quality), primary: true, required: true, label: 'KUWAIT TOWERS' },
    ],
    garrison: (g, origin, groundY) => populateKuwait(g, origin, groundY),
    // The towers, not the plaza they stand on.
    scoreTags: ['tower1', 'tower2', 'tower3', 'spheres'],
    precinct: { boundary: 'none', ground: 'paving', ornament: 'none', river: 'quay' },
    // No floors a man stands in; the spheres are solid here. The shafts
    // go over the way they are cut.
    traits: { windows: false, river: false, topples: true },
    unlockScale: 1,
    par: { rounds: 45, spend: 9000, minutes: 4, leverage: 6 },
    brief: 'The mass is the balls and the shafts are slender. Cut a shaft below its sphere and the sphere comes down whole.',
  },

  karnak: {
    id: 'karnak',
    terrain: 'karnak',
    lat: 25.71877, lon: 32.65721,
    name: 'KARNAK TEMPLE',
    place: 'Luxor',
    target: 'KARNAK TEMPLE',
    subtitle: 'Karnak Temple, Luxor',
    victory: 'Amun Down',
    // The Nile valley in Upper Egypt: Giza's sand and dust with the green of
    // the irrigated strip along the river instead of the plateau's scrub,
    // and the silt-brown Nile itself. The air is the desert's, warm and thick.
    palette: {
      urban: new THREE.Color(0xc9b48a),
      urbanAlt: new THREE.Color(0xb49b72),
      park: new THREE.Color(0x6f8a48),
      parkAlt: new THREE.Color(0x849a4c),
      road: new THREE.Color(0x4a443c),
      bank: new THREE.Color(0xd2bd92),
      bed: new THREE.Color(0x6a6b4a),
      dry: new THREE.Color(0xe0cda0),
    },
    setting: { haze: { colour: 0xe3d3b4, density: 0.00028 }, roofPitch: 0 },
    // At twice life the temple runs from the Third Pylon to the First: three
    // hundred and sixty metres east to west, two hundred and twenty-six wide.
    // The survey has nothing here but the six-metre stubs Overture keeps for
    // the ruins, and the precinct of Amun is a kilometre across in life, so
    // the radius clears the whole of it and the town stays where it is.
    cityExcludeRadius: 320,
    contextExclude: 300,
    // From the south-east, low, the way the Sacred Lake sees it: the Second
    // Pylon's towers, the nave columns riding over the side roof with the
    // clerestory between, and the First Pylon closing the far end.
    camera: { yaw: 0.95, pitch: 0.11, distance: 480, height: 40 },
    structures: (quality) => [
      { key: 'karnak', blocks: buildKarnak(quality), primary: true, required: true, label: 'KARNAK TEMPLE' },
    ],
    garrison: (g, origin, groundY) => populateKarnak(g, origin, groundY),
    // The hall and its two pylons. The Great Court and the First Pylon are
    // the approach, and the bar does not move for them.
    scoreTags: ['columns', 'architraves', 'clerestory', 'roof', 'pylon2', 'pylon3'],
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },
    // A colonnade has no windows to post men in and nothing on it topples:
    // the columns are cut and the roof comes down on the roof below.
    traits: { windows: false, river: true, topples: false },
    // A million cubic metres of sandstone, most of it in two pylons.
    unlockScale: 6,
    par: { rounds: 110, spend: 16000, minutes: 6, leverage: 2 },
    brief: 'The architraves are the load path. Cut a column and its two beams and the roof on them come down; cut a tall one and the nave roof lands on the aisles.',
  },

  forbidden: {
    id: 'forbidden',
    terrain: 'forbidden',
    lat: 39.91593, lon: 116.39069,
    name: 'FORBIDDEN CITY',
    place: 'Beijing',
    target: 'FORBIDDEN CITY',
    subtitle: 'Forbidden City, Beijing',
    victory: 'TODO(forbidden) THE LINE THE END CARD LEADS WITH',
    // TODO(forbidden) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(forbidden) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(forbidden) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(forbidden) the postcard angle
    structures: (quality) => [
      { key: 'forbidden', blocks: buildForbidden(quality), primary: true, required: true, label: 'FORBIDDEN CITY' },
    ],
    garrison: (g, origin, groundY) => populateForbidden(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(forbidden)
    traits: { windows: false, river: false, topples: true },           // TODO(forbidden)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(forbidden) from the suite's undercut
    brief: 'TODO(forbidden) one sentence: what the player has to find out about this building.',
  },
  gyeongbok: {
    id: 'gyeongbok',
    terrain: 'gyeongbok',
    lat: 37.57859, lon: 126.97705,
    name: 'GYEONGBOKGUNG',
    place: 'Seoul',
    target: 'GYEONGBOKGUNG',
    subtitle: 'Gyeongbokgung, Seoul',
    victory: 'TODO(gyeongbok) THE LINE THE END CARD LEADS WITH',
    // TODO(gyeongbok) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(gyeongbok) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(gyeongbok) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(gyeongbok) the postcard angle
    structures: (quality) => [
      { key: 'gyeongbok', blocks: buildGyeongbok(quality), primary: true, required: true, label: 'GYEONGBOKGUNG' },
    ],
    garrison: (g, origin, groundY) => populateGyeongbok(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(gyeongbok)
    traits: { windows: false, river: false, topples: true },           // TODO(gyeongbok)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(gyeongbok) from the suite's undercut
    brief: 'TODO(gyeongbok) one sentence: what the player has to find out about this building.',
  },
  watarun: {
    id: 'watarun',
    terrain: 'watarun',
    lat: 13.74378, lon: 100.48885,
    name: 'WAT ARUN',
    place: 'Bangkok',
    target: 'WAT ARUN',
    subtitle: 'Wat Arun, Bangkok',
    victory: 'TODO(watarun) THE LINE THE END CARD LEADS WITH',
    // TODO(watarun) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(watarun) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(watarun) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(watarun) the postcard angle
    structures: (quality) => [
      { key: 'watarun', blocks: buildWatarun(quality), primary: true, required: true, label: 'WAT ARUN' },
    ],
    garrison: (g, origin, groundY) => populateWatarun(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(watarun)
    traits: { windows: false, river: false, topples: true },           // TODO(watarun)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(watarun) from the suite's undercut
    brief: 'TODO(watarun) one sentence: what the player has to find out about this building.',
  },
  shwedagon: {
    id: 'shwedagon',
    terrain: 'shwedagon',
    lat: 16.79845, lon: 96.14957,
    name: 'SHWEDAGON PAGODA',
    place: 'Yangon',
    target: 'SHWEDAGON PAGODA',
    subtitle: 'Shwedagon Pagoda, Yangon',
    victory: 'TODO(shwedagon) THE LINE THE END CARD LEADS WITH',
    // TODO(shwedagon) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(shwedagon) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(shwedagon) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(shwedagon) the postcard angle
    structures: (quality) => [
      { key: 'shwedagon', blocks: buildShwedagon(quality), primary: true, required: true, label: 'SHWEDAGON PAGODA' },
    ],
    garrison: (g, origin, groundY) => populateShwedagon(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(shwedagon)
    traits: { windows: false, river: false, topples: true },           // TODO(shwedagon)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(shwedagon) from the suite's undercut
    brief: 'TODO(shwedagon) one sentence: what the player has to find out about this building.',
  },
  angkor: {
    id: 'angkor',
    terrain: 'angkor',
    lat: 13.41253, lon: 103.86699,
    name: 'ANGKOR WAT',
    place: 'Siem Reap',
    target: 'ANGKOR WAT',
    subtitle: 'Angkor Wat, Siem Reap',
    victory: 'TODO(angkor) THE LINE THE END CARD LEADS WITH',
    // TODO(angkor) palette and setting for anywhere that is not a temperate river city
    //   (copy the nearest neighbour's and change what differs).
    cityExcludeRadius: 120,          // TODO(angkor) read tools/survey.py: what does this delete?
    contextExclude: 110,
    // TODO(angkor) on a summit: groundLevel: 'bake' and padRadius: 0.
    camera: { yaw: 0.05, pitch: 0.12, distance: 320, height: 30 },   // TODO(angkor) the postcard angle
    structures: (quality) => [
      { key: 'angkor', blocks: buildAngkor(quality), primary: true, required: true, label: 'ANGKOR WAT' },
    ],
    garrison: (g, origin, groundY) => populateAngkor(g, origin, groundY),
    precinct: { boundary: 'none', ground: 'sand', ornament: 'none' },   // TODO(angkor)
    traits: { windows: false, river: false, topples: true },           // TODO(angkor)
    par: { rounds: 60, spend: 8000, minutes: 4, leverage: 6 },         // TODO(angkor) from the suite's undercut
    brief: 'TODO(angkor) one sentence: what the player has to find out about this building.',
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
