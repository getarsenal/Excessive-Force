/**
 * Par as the game is played now.
 *
 * Every level record carries a `par` measured against one perfect gun
 * undercutting one face (see the note at the top of levels.js): the rounds
 * that cut takes, six guns of the tier, two seconds a round, and the
 * leverage a cut that topples the thing reaches. That is the floor of what
 * the level can be done in, and it was being asked of players as par. A
 * battle now is a battery of a dozen guns and an air strike or two, paid for
 * by the masonry coming down, and on the Taj Mahal a win that took 8:29 and
 * twelve thousand rounds held none of the four marks; the bot sweep of
 * October 2026 (docs/par/README.md) fired 1.7 to 18.5 times par's rounds
 * wherever it won at all.
 *
 * So the records keep the measured floor, and par is that floor with room
 * for a person: four times the rounds (a battery laid on the load path, not
 * one gun), five times the spend (a battery and a strike, not a quarry of
 * MOABs), half as long again on the clock. Leverage stays as measured,
 * because it is the one mark a bigger battery cannot buy. A deliberate run
 * takes two of the four and the star; all four is mastery; a run that
 * throws everything at it takes the clock at most.
 */
export const PAR_SCALE = { rounds: 4, spend: 5, minutes: 1.5 };

const nice = (v, step) => Math.max(step, Math.round(v / step) * step);

/** The four marks for a level, or null for a level with no par. */
export function parOf(level) {
  const p = level?.par;
  if (!p) return null;
  const rounds = p.rounds * PAR_SCALE.rounds;
  return {
    rounds: nice(rounds, rounds >= 1000 ? 50 : 10),
    spend: nice(p.spend * PAR_SCALE.spend, 1000),
    minutes: Math.ceil(p.minutes * PAR_SCALE.minutes),
    leverage: p.leverage,
    base: p,
  };
}

/** Money as a mark says it: $40k, $1.2M, $850. */
export function shortMoney(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e4) return `$${Math.round(v / 1000)}k`;
  return `$${Math.round(v).toLocaleString()}`;
}
