/**
 * Real NBA retirement rates aren't published as a clean per-age curve, so
 * this is a hand-tuned approximation, not fitted data: retirement risk is
 * zero below 33, climbs ~8%/year after that, is higher for players already
 * struggling to hold a rating, and is forced at 41 so no player ages
 * indefinitely. Deliberately conservative (not aggressive) - without a
 * draft system yet (see docs/ARCHITECTURE.md), retirement only shrinks the
 * league's talent pool, so a slow, realistic rate keeps leagues playable
 * for many seasons rather than emptying rosters out quickly.
 */
const RETIREMENT_RISK_START_AGE = 33;
const FORCED_RETIREMENT_AGE = 41;
const AGE_RISK_PER_YEAR = 0.08;
const MAX_PROBABILITY = 0.95;

export function retirementProbability(age: number, overallRating: number): number {
  if (age >= FORCED_RETIREMENT_AGE) return 1;
  if (age < RETIREMENT_RISK_START_AGE) return 0;

  const ageFactor = (age - RETIREMENT_RISK_START_AGE) * AGE_RISK_PER_YEAR;
  const ratingFactor = overallRating < 60 ? 0.15 : overallRating < 70 ? 0.05 : 0;
  return Math.min(MAX_PROBABILITY, ageFactor + ratingFactor);
}

export function shouldRetire(age: number, overallRating: number, rng: () => number): boolean {
  return rng() < retirementProbability(age, overallRating);
}
