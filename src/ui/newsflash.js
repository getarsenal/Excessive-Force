/**
 * The news.
 *
 * When the landmark comes down the world finds out, and the world finds out
 * from a rolling news channel: a red BREAKING tab sliding in at the bottom
 * of the screen, the headline in capitals, and the ticker under it running
 * the follow-ups. The figures in the ticker are the run's own — what it
 * cost, how long it took, how many rounds — and the rest is what a news
 * desk says about a disaster it has had four seconds to prepare for.
 *
 * Shown in the seven seconds between the fall and the report card, and
 * taken away when the card comes up.
 */

const DESKS = ['GNN', 'WORLD NEWS 24', 'GLOBAL WIRE', 'NEWS ONE'];

const QUIPS = [
  'INSURERS DESCRIBE CLAIM AS "AMBITIOUS"',
  'LOCAL PIGEONS SEEK NEW ACCOMMODATION',
  'TOURIST BOARD REVISING BROCHURE',
  'PARKING ENFORCEMENT SUSPENDED IN AREA "FOR NOW"',
  'EXPERTS: "IT WAS NOT SUPPOSED TO DO THAT"',
  'GIFT SHOP REPORTS RECORD SALES OF POSTCARDS',
  'STRUCTURAL ENGINEERS ASK FOR A MINUTE',
  'WEATHER: CLEAR, WITH OCCASIONAL MASONRY',
  'MAP PUBLISHERS CALLED IN FOR EMERGENCY MEETING',
  'NEIGHBOURS COMPLAIN OF NOISE',
  'COMMANDER DECLINES TO COMMENT, ORDERS LUNCH',
  'TRAFFIC: AVOID THE AREA, AND THE AREA NEXT TO IT',
];

function money(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let el = null;

/**
 * @param {object} level   the level record
 * @param {object} sum     battle.summary()
 * @param {object} extra   { burnt, claim } — buildings burnt out, the bill
 */
export function newsflash(level, sum, extra = {}) {
  try { if (localStorage.getItem('tt.suite') === '1') return; } catch { /* private mode */ }
  if (!el) {
    el = document.createElement('div');
    el.id = 'newsflash';
    document.body.appendChild(el);
  }
  const target = (level.target || level.name || 'LANDMARK').toUpperCase();
  const place = (level.place || level.name || '').toUpperCase();
  const mins = Math.max(1, Math.round((sum?.time || 60) / 60));
  const facts = [];
  if (sum?.spent) facts.push(`COST OF OPERATION ESTIMATED AT ${money(sum.spent)}`);
  if (extra.claim) facts.push(`DAMAGE PUT AT ${money(extra.claim)}`);
  if (sum?.shotsFired) facts.push(`${sum.shotsFired.toLocaleString()} ROUNDS FIRED`);
  if (extra.burnt) facts.push(`${extra.burnt} CITY BLOCKS BURNT OUT`);
  if (sum?.defendersKilled) facts.push(`GARRISON LOSSES: ${sum.defendersKilled.toLocaleString()}`);
  facts.push(`ALL OVER IN ${mins} MINUTE${mins > 1 ? 'S' : ''}`);
  const tick = shuffle([...facts, ...shuffle([...QUIPS]).slice(0, 4)]).join('   ◆   ');
  const desk = DESKS[Math.floor(Math.random() * DESKS.length)];
  el.innerHTML = `<div class="nf-tag"><b>BREAKING</b><i>${desk}</i></div>
    <div class="nf-body"><div class="nf-head"></div><div class="nf-tick"><span></span></div></div>
    <div class="nf-live">LIVE</div>`;
  el.querySelector('.nf-head').textContent = `${target} DESTROYED${place ? ` · ${place}` : ''}`;
  el.querySelector('.nf-tick span').textContent = tick;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

export function hideNewsflash() {
  if (el) el.classList.remove('on');
}
