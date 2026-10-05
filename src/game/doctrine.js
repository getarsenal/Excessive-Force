import { totalStars } from './operations.js';

/**
 * Doctrine: what the stars buy.
 *
 * A star is a measure of how well a battle was fought, and a measure that
 * buys nothing is a number on a screen. So every star earned is a point to
 * spend here, on five branches of three ranks each, and spending is never
 * final: a point taken back out of one branch goes straight into another,
 * which is what makes going back for a third star on an old battle worth an
 * evening — the player is not grinding, they are buying the next rank of
 * whatever their way of fighting needs.
 *
 * Fifty points fill the tree; the campaign has a hundred and twenty-three
 * stars in it and the side operations another hundred and seventy, so for
 * most of a first run through the choice bites.
 */

export const BRANCHES = [
  {
    id: 'guns', name: 'ARTILLERY', icon: '⌖',
    ranks: [
      { cost: 2, line: 'Reload 6% faster' },
      { cost: 3, line: 'Groups 10% tighter' },
      { cost: 5, line: 'Reload 18% faster' },
    ],
  },
  {
    id: 'air', name: 'AIR POWER', icon: '✈',
    ranks: [
      { cost: 2, line: 'Strikes cost 10% less' },
      { cost: 3, line: 'Strikes cost 20% less' },
      { cost: 5, line: 'One free strike every battle' },
    ],
  },
  {
    id: 'log', name: 'LOGISTICS', icon: '$',
    ranks: [
      { cost: 2, line: 'Start with $300 more' },
      { cost: 3, line: 'Income 15% higher' },
      { cost: 5, line: 'Start with $900 more' },
    ],
  },
  {
    id: 'crew', name: 'CREWS', icon: '✦',
    ranks: [
      { cost: 2, line: 'Guns 15% tougher' },
      { cost: 3, line: 'Guns 30% tougher' },
      { cost: 5, line: 'Every crew starts a veteran' },
    ],
  },
  {
    id: 'intel', name: 'INTELLIGENCE', icon: '◎',
    ranks: [
      { cost: 2, line: 'Half again per man killed' },
      { cost: 3, line: 'Enemy fire 10% weaker' },
      { cost: 5, line: 'Enemy fire 20% weaker' },
    ],
  },
];

const KEY = 'tt.doctrine';

/** Ranks bought in each branch, `{ guns: 2, air: 0, ... }`. */
export function doctrine() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return Object.fromEntries(BRANCHES.map((b) => [b.id, Math.max(0, Math.min(3, v[b.id] | 0))]));
  } catch { return Object.fromEntries(BRANCHES.map((b) => [b.id, 0])); }
}
function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } }

export function spentPoints(d = doctrine()) {
  let n = 0;
  for (const b of BRANCHES) for (let r = 0; r < d[b.id]; r++) n += b.ranks[r].cost;
  return n;
}
/** Points to spend: every star held, less what is already in the tree. */
export function freePoints(prog) { return totalStars(prog) - spentPoints(); }

/** Buy the next rank in a branch, if the points are there. */
export function buyRank(id, prog) {
  const d = doctrine();
  const b = BRANCHES.find((x) => x.id === id);
  if (!b || d[id] >= 3) return false;
  if (freePoints(prog) < b.ranks[d[id]].cost) return false;
  d[id]++;
  save(d);
  return true;
}
/** Take a branch's ranks back out: free, any time. */
export function refund(id) {
  const d = doctrine();
  d[id] = 0;
  save(d);
}

/** Put the tree into a battle. */
export function applyDoctrine(battle, garrison) {
  const d = doctrine();
  const r = (id, k) => d[id] >= k;
  if (r('guns', 1)) battle.reloadScale *= r('guns', 3) ? 0.82 : 0.94;
  if (r('guns', 2)) battle.dispersionScale *= 0.9;
  if (r('air', 1)) battle.strikeScale = r('air', 2) ? 0.8 : 0.9;
  if (r('air', 3)) battle.strikeCredits = (battle.strikeCredits || 0) + 1;
  if (r('log', 1)) battle.money += r('log', 3) ? 900 : 300;
  if (r('log', 2)) battle.incomeScale *= 1.15;
  if (r('crew', 1)) battle.unitHealthScale = r('crew', 2) ? 1.3 : 1.15;
  if (r('crew', 3)) battle.startRank = 1;
  if (r('intel', 1)) battle.bountyScale = 1.5;
  if (r('intel', 2)) garrison.damageScale *= r('intel', 3) ? 0.8 : 0.9;
  return d;
}
