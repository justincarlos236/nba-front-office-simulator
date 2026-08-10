/**
 * Approximates how age affects a player's market value beyond their current
 * on-court performance: teams pay a premium for a young player's likely
 * improvement and remaining prime years, and apply a discount for
 * decline/injury risk in older players, even at identical current production.
 *
 * This is a hand-tuned heuristic curve (peak at age 27, gentle rise before,
 * steeper falloff after), not a fitted regression - a reasonable stand-in
 * documented as such. See docs/SYSTEMS.md for the model's scope.
 */
const PEAK_AGE = 27;

export function ageValueMultiplier(age: number): number {
  const distanceFromPeak = age - PEAK_AGE;

  if (distanceFromPeak <= 0) {
    // Young players: mild bonus that grows the further they are from peak,
    // capped so a teenager isn't valued as some multiple of a superstar.
    return Math.min(1.15, 1 + Math.abs(distanceFromPeak) * 0.015);
  }

  // Past peak: accelerating discount for decline/injury risk.
  const yearsPastPeak = distanceFromPeak;
  const discount = yearsPastPeak * 0.02 + Math.max(0, yearsPastPeak - 5) * 0.03;
  return Math.max(0.4, 1 - discount);
}
