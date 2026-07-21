/**
 * Applies one season's worth of aging to a player's rating. Not a fitted
 * regression - a hand-tuned curve consistent in shape with the valuation
 * model's `ageValueMultiplier` (peak in the late 20s, accelerating decline
 * after 30), but expressed as a rating delta instead of a value multiplier
 * since this actually mutates `LeaguePlayer.overallRating` between seasons.
 */
const YOUNG_DEVELOPMENT_AGE_CEILING = 26;
const DECLINE_START_AGE = 30;
const MIN_RATING = 60;
const MAX_RATING = 99;

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function clampRating(value: number): number {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, value));
}

export interface DevelopPlayerRatingInput {
  overallRating: number;
  potentialRating: number;
  /** The player's age entering the season being simulated next. */
  age: number;
  rng: () => number;
}

export function developPlayerRating({
  overallRating,
  potentialRating,
  age,
  rng,
}: DevelopPlayerRatingInput): number {
  const room = potentialRating - overallRating;

  if (age <= YOUNG_DEVELOPMENT_AGE_CEILING && room > 0) {
    const growth = randomIntInclusive(rng, 1, Math.min(4, room));
    return Math.min(potentialRating, overallRating + growth);
  }

  if (age < DECLINE_START_AGE) {
    // Prime years: small natural variance, no directional bias.
    const drift = randomIntInclusive(rng, -1, 1);
    return clampRating(overallRating + drift);
  }

  // Past peak: decline accelerates the further past 30 a player is.
  const yearsPastDeclineStart = age - DECLINE_START_AGE;
  const baseDecline = 1 + Math.floor(yearsPastDeclineStart / 3);
  const decline = randomIntInclusive(rng, baseDecline, baseDecline + 2);
  return clampRating(overallRating - decline);
}
