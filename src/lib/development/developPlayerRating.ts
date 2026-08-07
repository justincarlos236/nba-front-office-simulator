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

// Rotation Management: real playing time nudges development, same "modest,
// neutral-anchored" pattern as the dev-coach bonus above. 24 MPG ("a
// regular rotation player") is the neutral anchor - a player with no real
// minutes data (undefined) behaves exactly as this function always did.
const MINUTES_ANCHOR = 24;
const MINUTES_BONUS_PER_MPG = 0.05;
const MINUTES_BONUS_CAP = 1.5;

// Player Morale & Personality System: a third modest, neutral-anchored
// nudge, same shape as the two above. 70 (LeaguePlayer.morale's own
// default) means no effect at all - a player who has never had a real
// morale event behaves exactly as this function always did.
const MORALE_ANCHOR = 70;
const MORALE_BONUS_PER_POINT = 0.03;
const MORALE_BONUS_CAP = 1.5;

// Finances as a Gameplay Pillar (Phase 4) - the Player Development
// department (was "facilities investment"). A fourth modest, neutral-
// anchored nudge. The input is departmentQualityDelta (src/lib/finances/
// departments.ts), 0 at STANDARD (no effect), positive for HIGH/MAXIMUM,
// negative for LOW/MINIMAL. A wider cap than the old 3-level facilities
// lever ever had - a real specialization commitment (MAXIMUM) should read
// as a genuinely bigger payoff than the old PREMIUM did.
const PLAYER_DEVELOPMENT_BONUS_PER_POINT = 0.06;
const PLAYER_DEVELOPMENT_BONUS_CAP = 1.0;

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
  /** This season's real average minutes played, if any - omitted behaves exactly as before this parameter existed (no effect). */
  minutesPerGame?: number;
  /** LeaguePlayer.morale, if known - omitted behaves exactly as before this parameter existed (no effect). */
  morale?: number;
  /** Player Development department quality delta (departmentQualityDelta) - 0/omitted behaves exactly as before this parameter existed (no effect). */
  playerDevelopmentDelta?: number;
}

export function developPlayerRating({
  overallRating,
  potentialRating,
  age,
  rng,
  developmentCoachQuality = DEV_COACH_QUALITY_ANCHOR,
  minutesPerGame,
  morale,
  playerDevelopmentDelta,
}: DevelopPlayerRatingInput): number {
  const room = potentialRating - overallRating;
  const coachBonus =
    (developmentCoachQuality - DEV_COACH_QUALITY_ANCHOR) * DEV_COACH_BONUS_PER_QUALITY_POINT;
  // A young player who actually played meaningful minutes develops faster
  // than one who never got on the floor; a veteran playing heavy minutes
  // stays sharper (slightly dampens decline) than one glued to the bench.
  const minutesBonus =
    minutesPerGame === undefined
      ? 0
      : Math.max(
          -MINUTES_BONUS_CAP,
          Math.min(MINUTES_BONUS_CAP, (minutesPerGame - MINUTES_ANCHOR) * MINUTES_BONUS_PER_MPG),
        );
  // A happy player is a little more locked in and coachable; a miserable
  // one is a little harder to develop and fades a little faster.
  const moraleBonus =
    morale === undefined
      ? 0
      : Math.max(
          -MORALE_BONUS_CAP,
          Math.min(MORALE_BONUS_CAP, (morale - MORALE_ANCHOR) * MORALE_BONUS_PER_POINT),
        );
  // A well-funded Player Development department (weight room, training
  // tech, individualized workouts) helps a young player grow and a vet
  // stay sharp; a starved one does the opposite.
  const playerDevelopmentBonus =
    playerDevelopmentDelta === undefined
      ? 0
      : Math.max(
          -PLAYER_DEVELOPMENT_BONUS_CAP,
          Math.min(
            PLAYER_DEVELOPMENT_BONUS_CAP,
            playerDevelopmentDelta * PLAYER_DEVELOPMENT_BONUS_PER_POINT,
          ),
        );

  if (age <= YOUNG_DEVELOPMENT_AGE_CEILING && room > 0) {
    const growth = randomIntInclusive(rng, 1, Math.min(4, room));
    const coachedGrowth = Math.max(
      1,
      Math.min(
        room,
        Math.round(growth + coachBonus + minutesBonus + moraleBonus + playerDevelopmentBonus),
      ),
    );
    return Math.min(potentialRating, overallRating + coachedGrowth);
  }

  if (age < DECLINE_START_AGE) {
    // Prime years: small natural variance, no directional bias.
    const drift = randomIntInclusive(rng, -1, 1);
    return clampRating(overallRating + drift);
  }

  // Past peak: decline accelerates the further past 30 a player is. A good
  // development coach - or real, heavy playing time, or good morale -
  // helps a vet stay sharp, slightly dampening (never reversing) the
  // decline.
  const yearsPastDeclineStart = age - DECLINE_START_AGE;
  const baseDecline = 1 + Math.floor(yearsPastDeclineStart / 3);
  const decline = Math.max(
    0,
    randomIntInclusive(rng, baseDecline, baseDecline + 2) -
      coachBonus -
      minutesBonus -
      moraleBonus -
      playerDevelopmentBonus,
  );
  return clampRating(overallRating - decline);
}
