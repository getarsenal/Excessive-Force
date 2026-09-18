import * as THREE from 'three';
import { buildElizabethTower, buildPalaceWing } from '../structure/landmarks/bigben.js';
import { buildTajMahal, buildTajMosque } from '../structure/landmarks/tajmahal.js';
import { buildEiffelTower, buildChaillotWing } from '../structure/landmarks/eiffel.js';
import { buildElCastillo, buildTempleOfWarriors } from '../structure/landmarks/chichen.js';
import { buildCampanile, buildDuomo, buildBaptistery }
  from '../structure/landmarks/pisa.js';
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
    // with it: the camera sits back far enough to hold 192 m of masonry, and
    // the city keeps clear of a palace with twice the footprint.
    cityExcludeRadius: 150,
    camera: { yaw: -0.78, pitch: 0.40, distance: 430, height: 84 },
    structures: (quality) => [
      { key: 'tower', blocks: buildElizabethTower(quality), primary: true,
        required: true, label: 'ELIZABETH TOWER' },
      { key: 'wing', blocks: buildPalaceWing(quality),
        required: true, label: 'PALACE WING' },
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
    cityExcludeRadius: 420,   // keep OSM buildings off the charbagh
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
    palette: {
      urban: new THREE.Color(0xbdb096),
      urbanAlt: new THREE.Color(0xa79a80),
      park: new THREE.Color(0x3f5b30),
      parkAlt: new THREE.Color(0x4e6b34),
      road: new THREE.Color(0x6a6152),
      bank: new THREE.Color(0xc8bb9c),
      bed: new THREE.Color(0x55603f),
      dry: new THREE.Color(0xd6cbb0),
    },
    // The Great Plaza is open ground for two hundred metres in every
    // direction, and the Temple of the Warriors stands at the far side of it.
    cityExcludeRadius: 300,
    contextExclude: 300,
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
    cityExcludeRadius: 330,
    contextExclude: 300,
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
    traits: { windows: true, river: false, topples: true },
    unlockScale: 2,
    brief: 'It is bent, not tilted. The overhang at the top is the part they corrected.',
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
    cityExcludeRadius: 460,
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
export const LEVEL_ORDER = ['westminster', 'paris', 'agra', 'giza', 'chichen', 'pisa'];

/** One line on the target-select card, saying what kind of problem this is. */
export const LEVEL_BLURB = {
  westminster: 'A hollow tower on four walls. Undercut one face and it goes over that way.',
  paris: 'Three hundred metres of iron on four legs. Cut one and it falls towards it.',
  agra: 'A dome on four piers over a marble terrace. It will not topple; it has to be broken.',
  giza: 'Two and a third million cubic metres of limestone. Nothing here falls over.',
  chichen: 'A pyramid built over an older pyramid. The skin is not the building.',
  pisa: 'Eighty-nine metres already falling. The part that overhangs is the part that is safe.',
};

/** Ordered level records, for menus. */
export function levelList() {
  return LEVEL_ORDER.filter((id) => LEVELS[id]).map((id) => LEVELS[id]);
}

export function levelOrigin(terrain) {
  const y = terrain.heightAt(0, 0);
  return new THREE.Vector3(0, y, 0);
}
