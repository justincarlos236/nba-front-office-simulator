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

// Player Development Coach effect (Phase 15a) - a real, modest nudge, not
// a second growth-curve. 72 (this codebase's standard "average/neutral"
// anchor) means no effect at all - an unhired slot behaves exactly as this
// function always did.
const DEV_COACH_QUALITY_ANCHOR = 72;
const DEV_COACH_BONUS_PER_QUALITY_POINT = 0.03;

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
  /** 60-99, defaults to the neutral anchor (no Head Coach/Dev Coach hired yet behaves exactly as before this parameter existed). */
  developmentCoachQuality?: number;
}

export function developPlayerRating({
  overallRating,
  potentialRating,
  age,
  rng,
  developmentCoachQuality = DEV_COACH_QUALITY_ANCHOR,
}: DevelopPlayerRatingInput): number {
  const room = potentialRating - overallRating;
  const coachBonus =
    (developmentCoachQuality - DEV_COACH_QUALITY_ANCHOR) * DEV_COACH_BONUS_PER_QUALITY_POINT;

  if (age <= YOUNG_DEVELOPMENT_AGE_CEILING && room > 0) {
    const growth = randomIntInclusive(rng, 1, Math.min(4, room));
    const coachedGrowth = Math.max(1, Math.min(room, Math.round(growth + coachBonus)));
    return Math.min(potentialRating, overallRating + coachedGrowth);
  }

  if (age < DECLINE_START_AGE) {
    // Prime years: small natural variance, no directional bias.
    const drift = randomIntInclusive(rng, -1, 1);
    return clampRating(overallRating + drift);
  }

  // Past peak: decline accelerates the further past 30 a player is. A good
  // development coach helps a vet stay sharp, slightly dampening (never
  // reversing) the decline.
  const yearsPastDeclineStart = age - DECLINE_START_AGE;
  const baseDecline = 1 + Math.floor(yearsPastDeclineStart / 3);
  const decline = Math.max(0, randomIntInclusive(rng, baseDecline, baseDecline + 2) - coachBonus);
  return clampRating(overallRating - decline);
}
