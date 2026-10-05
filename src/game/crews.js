/**
 * The crews, by name.
 *
 * A gun that is a gun is a counter; a gun that is PFC Dwayne Mercer's gun is
 * somebody, and the player notices when Mercer's crew earns its third chevron
 * and minds when the counter-battery finds it. Every gun and team that lands
 * gets a crew chief with a name, a rank that follows the crew's chevrons, and
 * at sergeant a nickname — earned, not issued.
 */

const FIRST = ['Dwayne', 'Tyrell', 'Bobby', 'Marcus', 'Jimmy', 'Hector', 'Luis', 'Kyle', 'Brandon', 'Earl',
  'Darnell', 'Cody', 'Ray', 'Tony', 'Wes', 'Travis', 'Andre', 'Manny', 'Jesse', 'Chuck', 'Denise', 'Maria',
  'Tasha', 'Kim', 'Rosa', 'Shonda', 'Becky', 'Lupe', 'Dottie', 'Frankie'];
const LAST = ['Mercer', 'Kowalski', 'Washington', 'Delgado', 'O\'Malley', 'Nguyen', 'Jackson', 'Petrie',
  'Ramirez', 'Boone', 'Hutchins', 'Lefevre', 'Okafor', 'Sorensen', 'Bishop', 'Calloway', 'Duvall', 'Ferris',
  'Grady', 'Haskins', 'Ibarra', 'Jankowski', 'Kincaid', 'Lomax', 'Mabry', 'Novak', 'Pruitt', 'Quintero', 'Strickland', 'Tatum'];
const NICK = ['Two-Tons', 'Doc', 'Leroy', 'Boom-Boom', 'Preacher', 'Tex', 'Hollywood', 'Sparky', 'Deadeye',
  'Mad Dog', 'Tiny', 'Biscuit', 'Gravel', 'Rooster', 'Wrecking Ball', 'Hammer', 'Professor', 'Lucky',
  'Grandma', 'Thunder', 'Dentist', 'Landlord', 'Pastor', 'Real Estate', 'Bulldozer', 'Insurance', 'Brick'];
const RANKS = ['PVT', 'PFC', 'CPL', 'SGT'];

let seq = 0;
const pick = (a, n) => a[n % a.length];

/** A new crew chief for a unit. */
export function newCrew() {
  // Spread out rather than random, so two guns landed together are never
  // both Mercer.
  const n = seq++ + Math.floor(Math.random() * 997);
  return { first: pick(FIRST, n * 7 + 3), last: pick(LAST, n * 13 + 5), nick: pick(NICK, n * 11 + 1) };
}

/** How a crew chief is addressed, at the unit's current chevrons. */
export function crewName(unit, { short = false } = {}) {
  const c = unit.crew;
  if (!c) return '';
  const r = RANKS[Math.max(0, Math.min(3, unit.rank || 0))];
  if (short) return `${r}. ${c.last.toUpperCase()}`;
  const nick = (unit.rank || 0) >= 3 ? ` "${c.nick}"` : '';
  return `${r}. ${c.first}${nick} ${c.last}`;
}
