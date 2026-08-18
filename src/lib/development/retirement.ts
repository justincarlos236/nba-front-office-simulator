/**
 * Real NBA retirement rates aren't published as a clean per-age curve, so
 * this is a hand-tuned approximation, not fitted data: retirement risk is
 * zero below 33, climbs ~8%/year after that, is higher for players already
 * struggling to hold a rating, and is forced at 41 so no player ages
 * indefinitely. The rate was set conservatively while there was still no
 * draft, so that attrition could not drain a league with no way to refill
 * it. The draft has since shipped, and the 20-season harness in
 * `longSave.invariant.test.ts` checks that intake and attrition now
 * actually balance rather than assuming it.
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

/**
 * How much being good slows the age curve.
 *
 * **Quality used to be able to hurt a player and never help him.**
 * `ratingFactor` below adds risk for anyone under 72 and contributes nothing
 * above it, so a 91-rated forward at 35 faced exactly the odds of a 75-rated
 * one - and elite players were retiring in their mid-thirties while still
 * playing at an All-NBA level. That is not how careers end. Marginal players
 * are pushed out of the league; great ones choose when to leave, and mostly
 * choose later.
 *
 * Keyed to the SUPERSTAR and STAR cutoffs in `playerValueTier.ts` rather than
 * new numbers, so "good enough to outlast your age" means the same thing here
 * as everywhere else in the app.
 *
 * `FORCED_RETIREMENT_AGE` is untouched and still absolute - this changes how
 * likely a player is to reach 41, never whether 41 ends it.
 */
const SUPERSTAR_AGE_RISK_MULTIPLIER = 0.35;
const STAR_AGE_RISK_MULTIPLIER = 0.6;

function ageRiskMultiplier(overallRating: number): number {
  if (overallRating >= 90) return SUPERSTAR_AGE_RISK_MULTIPLIER;
  if (overallRating >= 80) return STAR_AGE_RISK_MULTIPLIER;
  return 1;
}

export function retirementProbability(age: number, overallRating: number, morale?: number): number {
  if (age >= FORCED_RETIREMENT_AGE) return 1;
  if (age < RETIREMENT_RISK_START_AGE) return 0;

  const ageFactor =
    (age - RETIREMENT_RISK_START_AGE) * AGE_RISK_PER_YEAR * ageRiskMultiplier(overallRating);
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
