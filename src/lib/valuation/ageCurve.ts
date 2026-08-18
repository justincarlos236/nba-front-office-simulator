/**
 * Approximates how age affects a player's market value beyond their current
 * on-court performance: teams pay a premium for a young player's likely
 * improvement and remaining prime years, and apply a discount for
 * decline/injury risk in older players, even at identical current production.
 *
 * This is a hand-tuned heuristic curve (peak at age 27, gentle rise before,
 * accelerating falloff after), not a fitted regression - a reasonable stand-in
 * documented as such. See docs/SYSTEMS.md for the model's scope.
 *
 * It is load-bearing: `computePlayerTradeValue`, `priceContractCents`,
 * `computeDraftPickTradeValue` and the re-signing model all multiply through
 * it, so its shape is felt anywhere a player is valued.
 */
const PEAK_AGE = 27;

/**
 * The past-peak discount, as `DISCOUNT_LINEAR * y + DISCOUNT_QUADRATIC * y²`
 * where `y` is years past peak.
 *
 * **This used to be a hinge, and the hinge was the defect.** The old form was
 * `y * 0.02 + max(0, y - 5) * 0.03`, so the annual discount tripled from 2% to
 * 5% the moment a player turned 32 and stayed flat on either side. Value fell
 * 2% at 31 and 5.6% at 33 - a cliff at one specific birthday, in a model that
 * every trade, contract and re-signing decision multiplies through. See
 * docs/audits/CONTRACT_AUDIT.md C-P2-4.
 *
 * Real decline accelerates; it does not switch gears. These coefficients are
 * solved to pass through the old curve's two defensible anchors - 0.90 at age
 * 32 and 0.50 at age 40 - so the endpoints are unchanged and only the path
 * between them is smooth. The annual drop now grows continuously from about
 * 1.1% at 28 to 6.6% at 40, and no single birthday costs more than its
 * neighbours.
 *
 * Largest departure from the old curve is +5.3% at ages 36-37, which is the
 * middle of the band the hinge over-punished.
 */
const DISCOUNT_LINEAR = 0.008462;
const DISCOUNT_QUADRATIC = 0.002308;

/** A veteran is never worthless; below this, age has taken all it can. */
const MIN_MULTIPLIER = 0.4;

/** Cap so a teenager is not valued as some multiple of a superstar. */
const MAX_MULTIPLIER = 1.15;
const PRE_PEAK_BONUS_PER_YEAR = 0.015;

export function ageValueMultiplier(age: number): number {
  const distanceFromPeak = age - PEAK_AGE;

  if (distanceFromPeak <= 0) {
    // Young players: mild bonus that grows the further they are from peak.
    return Math.min(MAX_MULTIPLIER, 1 + Math.abs(distanceFromPeak) * PRE_PEAK_BONUS_PER_YEAR);
  }

  const yearsPastPeak = distanceFromPeak;
  const discount =
    DISCOUNT_LINEAR * yearsPastPeak + DISCOUNT_QUADRATIC * yearsPastPeak * yearsPastPeak;
  return Math.max(MIN_MULTIPLIER, 1 - discount);
}
