import { getSeasonCapRules } from "../cap/constants";

/**
 * How a talent score converts to trade value, in cents.
 *
 * **This is deliberately NOT `scoreToCapFraction`.** That curve is capped at
 * 0.35 of the salary cap because *salaries* have a CBA maximum - a supermax is
 * as much as anyone can be paid. Trade value has no such ceiling, and reusing
 * the salary curve imposed one anyway: measured across the seeded league it
 * compressed the entire 70-99 rating range into a 6.2x spread, so a rating
 * point was worth 5.5x less at the top than in the middle, and the reigning
 * MVP priced at 0.94x a 78-rated 21-year-old. Two rotation players bought a
 * superstar. See docs/TRADE_AUDIT.md, T-P0-3.
 *
 * `scoreToCapFraction` is left untouched. It is shared with contract pricing,
 * and moving it once before compressed an 85-rated player from 16.1x to 11.9x
 * a 65-rated one and broke a CPU trade test - the two models need different
 * shapes, not one shape that half-serves both.
 *
 * **The parameters are fitted, not chosen.** Trade value has two places where
 * the real market gives a checkable ratio, and both are reproduced to within
 * a percent (`scripts/trade-curve-calibration.ts`, relative sq. error 5e-5):
 *
 *   - the #1 overall pick is worth ~8x the #30 pick (published draft-pick
 *     surplus-value charts differ on absolute numbers but agree closely here);
 *   - an MVP-tier player is worth ~3x the #1 overall pick (read off real
 *     superstar trades: a superstar returns roughly five first-rounders of
 *     mixed slot, and a #1 overall is worth roughly 1.7 mid-firsts).
 *
 * A single exponential cannot satisfy both. Fitted to the pick chart alone it
 * needs k=0.203, which then makes a 99 worth 360x a 70 - because the pick
 * chart's steepness is a local property of the narrow 71-82 band picks occupy,
 * not a global one. The required rate is ~0.20 around score 75 and ~0.04
 * around score 90, i.e. it must FALL with score. That is a logistic: the
 * original shape was right and only its ceiling was wrong.
 */
const STEEPNESS = 0.23;
const MIDPOINT = 85.4;

/**
 * The curve's asymptote, as a multiple of the salary cap. Expressed against
 * the cap rather than as a fixed sum so trade values inflate with the cap over
 * a long save, keeping picks, players and salaries commensurable in season 20
 * the way they are in season 1.
 *
 * Set so the #1 overall pick holds at ~$45.2M, its value under the old curve -
 * the pick market's internal spread is what needed fixing, not its overall
 * level.
 */
const VALUE_UNIT_AS_FRACTION_OF_CAP = 0.93;

/**
 * A player's talent score: current production plus a discounted share of what
 * he has not reached yet.
 *
 * **Age is not in here.** It used to be, multiplied into the score before the
 * score hit the logistic, which compounded a 35% age discount into a 96% one -
 * the exact defect `ageAdjustedMarketValueCents` documents as fixed for
 * salaries. Left in place it gave 56 of 537 rostered players a trade value of
 * exactly zero, including Curry, Durant, LeBron and Harden. Age belongs on the
 * money, and the callers apply it there.
 */
export function talentScore(
  overallRating: number,
  potentialRating: number,
  upsideWeight: number,
): number {
  return overallRating + Math.max(0, potentialRating - overallRating) * upsideWeight;
}

/** What a talent score is worth in trade, before age, injury or contract. */
export function tradeValueCents(score: number, season: number): number {
  const unit =
    Number(getSeasonCapRules(season).salaryCapCents) * VALUE_UNIT_AS_FRACTION_OF_CAP;
  return unit / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)));
}
