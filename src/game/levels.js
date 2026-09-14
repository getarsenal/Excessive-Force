import * as THREE from 'three';
import { buildElizabethTower, buildPalaceWing } from '../structure/landmarks/bigben.js';
import { buildTajMahal, buildTajMosque } from '../structure/landmarks/tajmahal.js';

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
    cityExcludeRadius: 70,
    camera: { yaw: -0.78, pitch: 0.40, distance: 235, height: 42 },
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
    win: { integrity: 0.30, heightFrac: 0.34 },
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
    win: { integrity: 0.42, heightFrac: 0.30 },
    brief: 'The dome stands on four piers. Shelling the shell only makes holes.',
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
