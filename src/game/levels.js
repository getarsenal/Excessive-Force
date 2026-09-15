import * as THREE from 'three';
import { buildElizabethTower, buildPalaceWing } from '../structure/landmarks/bigben.js';
import { buildTajMahal, buildTajMosque } from '../structure/landmarks/tajmahal.js';
import { buildEiffelTower, buildChaillotWing } from '../structure/landmarks/eiffel.js';
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
 * for the level to be won.
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
    target: 'ELIZABETH TOWER',
    subtitle: 'Elizabeth Tower · Westminster',
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
    winSecondary: { integrity: 0.42 },
    brief: 'Undercut one face and the whole tower goes over that way.',
  },

  agra: {
    id: 'agra',
    terrain: 'agra',
    name: 'Taj Mahal, Agra',
    target: 'TAJ MAHAL',
    subtitle: 'Taj Mahal · Agra',
    cityExcludeRadius: 190,   // the complex is wide; keep OSM buildings clear
    camera: { yaw: 0.35, pitch: 0.34, distance: 290, height: 34 },
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
    win: { integrity: 0.42, heightFrac: 0.30 },
    brief: 'The dome stands on four piers. Shelling the shell only makes holes.',
  },

  paris: {
    id: 'paris',
    terrain: 'paris',
    name: 'Eiffel Tower, Paris',
    target: 'EIFFEL TOWER',
    subtitle: 'Tour Eiffel · Champ de Mars',
    // The tower's own piers are 125 m apart and the Champ de Mars is open
    // ground for three hundred metres beyond that; the city starts where the
    // park ends.
    cityExcludeRadius: 210,
    contextExclude: 180,
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
    winSecondary: { integrity: 0.45 },
    brief: 'It stands on four legs and nothing else. Cut one and it falls that way.',
  },

  giza: {
    id: 'giza',
    terrain: 'giza',
    name: 'Great Pyramids, Giza',
    target: 'GREAT PYRAMID',
    subtitle: 'Pyramid of Khufu · Giza Plateau',
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
    // A pyramid cannot topple, so height is meaningless and the whole measure
    // is how much of it is left. The bar is low because grinding two and a
    // half million cubic metres of limestone to nothing is not a game.
    win: { integrity: 0.55, heightFrac: 0.62 },
    brief: 'Nothing here can topple. Open the casing and break what the chambers hang on.',
  },
};

export const DEFAULT_LEVEL = 'westminster';

/** Pick a level from `?level=`, falling back to the default. */
export function resolveLevel() {
  let id = DEFAULT_LEVEL;
  try {
    const q = new URLSearchParams(window.location.search).get('level');
    if (q && LEVELS[q]) id = q;
  } catch { /* no location in some embeds */ }
  return LEVELS[id];
}

export function levelOrigin(terrain) {
  const y = terrain.heightAt(0, 0);
  return new THREE.Vector3(0, y, 0);
}
