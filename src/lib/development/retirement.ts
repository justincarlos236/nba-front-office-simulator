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

// Player Morale & Personality System: a demoralized aging veteran is a
// little more likely to walk away; an unusually happy one holds on a
// little longer. Only ever applied once a player is already in the
// at-risk age band above - an unhappy 25-year-old isn't close to
// retiring regardless of morale. 70 (LeaguePlayer.morale's default) means
// no effect at all.
const MORALE_RETIREMENT_ANCHOR = 70;
const MORALE_RETIREMENT_RISK_PER_POINT = 0.002;

export function retirementProbability(age: number, overallRating: number, morale?: number): number {
  if (age >= FORCED_RETIREMENT_AGE) return 1;
  if (age < RETIREMENT_RISK_START_AGE) return 0;

  const ageFactor = (age - RETIREMENT_RISK_START_AGE) * AGE_RISK_PER_YEAR;
  // Cutoffs re-tied to the ROTATION/STARTER tier boundaries (playerValueTier.ts)
  // on the 60-99 rating scale, same relationship the old 60/70 cutoffs had
  // to the old scale's tier boundaries.
  const ratingFactor = overallRating < 65 ? 0.15 : overallRating < 72 ? 0.05 : 0;
  const moraleFactor =
    morale === undefined
      ? 0
      : (MORALE_RETIREMENT_ANCHOR - morale) * MORALE_RETIREMENT_RISK_PER_POINT;
  return Math.min(MAX_PROBABILITY, Math.max(0, ageFactor + ratingFactor + moraleFactor));
}

export function shouldRetire(
  age: number,
  overallRating: number,
  rng: () => number,
  morale?: number,
): boolean {
  return rng() < retirementProbability(age, overallRating, morale);
}
