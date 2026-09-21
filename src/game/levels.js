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
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: true, river: false, topples: false },
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
    setting: { haze: { colour: 0xe0d6c2, density: 0.00030 } },
    cityExcludeRadius: 130,
    contextExclude: 130,
    // Far back and high: the tower is half a kilometre even at this scale.
    camera: { yaw: 0.60, pitch: 0.22, distance: 900, height: 250 },
    structures: (quality) => [
      { key: 'burj', blocks: buildBurjKhalifa(quality), primary: true,
        required: true, label: 'BURJ KHALIFA' },
    ],
    garrison: (g, origin, groundY) => { populateBurjKhalifa(g, origin, groundY); },
    precinct: { boundary: 'none', ground: 'lawn', ornament: 'none' },
    traits: { windows: true, river: false, topples: true },
    unlockScale: 1,
    brief: 'Everything above a setback stands on the setback under it. Take the core at one.',
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
  'athens', 'istanbul', 'cologne', 'himeji', 'dubai'];

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
  dubai: 'Half a kilometre of concrete core and glass in setbacks. Everything above a cut is a free body.',
};

/** Ordered level records, for menus. */
export function levelList() {
  return LEVEL_ORDER.filter((id) => LEVELS[id]).map((id) => LEVELS[id]);
}

export function levelOrigin(terrain) {
  const y = terrain.heightAt(0, 0);
  return new THREE.Vector3(0, y, 0);
}
