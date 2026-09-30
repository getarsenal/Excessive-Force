/**
 * The damage bill: what the after-action card says the insurers will be
 * asked for.
 *
 * Priced from what the run actually did, so a surgical kill and a carpet of
 * B-1s come to different sums: the landmark by the tonne of masonry that
 * came down, the town by the building burnt out, and the defenders' kit by
 * the post. Rates are round and plausible rather than researched: a tonne of
 * cut and dressed historic stone, carved, laid and listed, replaced by hand,
 * is tens of thousands; a gutted city block is millions.
 *
 * Buck reads the total and has an opinion about it, graded by size.
 */
const PER_TONNE = 22000;          // the landmark, replaced by hand
const PER_BUILDING = 6.5e6;       // a city building burnt out to its shell
const PER_DEFENDER = 180000;      // a post: the man, his kit, the paperwork

const QUIPS = [
  // under a hundred million
  [1e8, [
    "That's a rounding error. Put it on the office card.",
    'Cheaper than a stealth bomber\'s toilet seat.',
    "I've had bar tabs that looked worse.",
  ]],
  // under a billion
  [1e9, [
    'Nine figures. Tell the auditors it was a training exercise.',
    'Somebody in accounting just fainted. Good.',
    "Bill it to the building. It started it.",
  ]],
  // under ten billion
  [1e10, [
    "Ten figures, baby. Now THAT's a line item.",
    "Tell 'em we'll pay in freedom. Very strong currency.",
    'Frame the invoice. Hang it in the officers\' mess.',
  ]],
  [Infinity, [
    "Eleven figures. They'll name a recession after us.",
    "That's not a bill, that's a GDP.",
    "Send it to the UN. They love paperwork.",
  ]],
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** The bill for a finished run: line items, total, and Buck's view of it. */
export function damageBill(summary, { burnt = 0 } = {}) {
  const items = [
    ['Landmark', Math.max(0, summary.score || 0) * PER_TONNE],
    ['City blocks', Math.max(0, burnt) * PER_BUILDING],
    ['Enemy positions', Math.max(0, summary.defendersKilled || 0) * PER_DEFENDER],
  ].filter(([, v]) => v > 0);
  const total = items.reduce((a, [, v]) => a + v, 0);
  const quip = pick(QUIPS.find(([cap]) => total < cap)[1]);
  return { items, total, quip };
}

/** $4.2 BILLION, $310 MILLION, $86,000: three significant figures at most. */
export function money(v) {
  const unit = [[1e12, 'TRILLION'], [1e9, 'BILLION'], [1e6, 'MILLION']].find(([n]) => v >= n);
  if (!unit) return `$${Math.round(v).toLocaleString()}`;
  const x = v / unit[0];
  return `$${x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : x.toFixed(2).replace(/0$/, '').replace(/\.$/, '')} ${unit[1]}`;
}
