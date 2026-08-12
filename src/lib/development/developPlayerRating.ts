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

/**
 * How much of his remaining ceiling a young player converts in one season, at
 * the two ends of `developmentTrait`.
 *
 * **Prospects used to be unable to fail.** Growth was
 * `randomIntInclusive(rng, 1, ...)` wrapped in `Math.max(1, ...)`, so the floor
 * was +1 every season: a player under 27 with headroom could not stagnate,
 * could not regress, and could not bust. Measured over 500 prospects per draft
 * slot, the bust rate was 0% at every slot - a pick-30 prospect became an 82
 * with certainty, and every class delivered around thirty future 80+ players
 * against a real five to eight. That is the engine that inflated the league to
 * 221 players at 80+ by season twenty. See docs/DEVELOPMENT_AUDIT.md, D-P0-1.
 *
 * A rate of 0 is a genuine bust: he never closes the gap to his ceiling.
 */
/**
 * How much of his *scouted* ceiling a player's real ceiling turns out to be.
 *
 * **Potential was certainty, and that is what inflated the league.** Growth
 * could not fail (D-P0-1), so every prospect reached the number on his scouting
 * report. Draft classes arrive with a mean potential near 83 into a league whose
 * median is 71, which meant intake was better than the population every single
 * year - and the league drifted to 221 players at 80+ by season twenty against a
 * real 82. See docs/DEVELOPMENT_AUDIT.md, D-P0-2.
 *
 * The lever is the ceiling, not the growth rate. An earlier attempt slowed
 * growth instead and doubled the inflation, because the players with the most
 * headroom grew fastest; a second attempt split prospects into busted and
 * not-busted and went bimodal, inflating or collapsing with nothing between.
 *
 * A scouting report is an estimate, so treat it as one. A player's real ceiling
 * is a fraction of his scouted potential, drawn once and stable for his whole
 * career: most fall well short, a few reach it. That produces busts and stops
 * the inflation with the same change, because a prospect who is 97 on paper and
 * 80 in reality neither becomes a star nor raises the league's talent floor.
 */
/**
 * How reliably a scouting report holds up, by how good the report is.
 *
 * A single floor for everyone could not separate the top of the league from the
 * middle: lowering it produced genuine busts and a correct count of 80+ players
 * but drained the 90+ population to five by season twenty, while raising it held
 * the stars and flooded the middle. Every band moved together.
 *
 * Scouting is not uniformly uncertain, and that is the lever. A consensus star
 * is identified by everyone and rarely turns out to be nothing; a mid-first flier
 * is a genuine coin-flip. Making reliability scale with the report itself keeps
 * the star pipeline intact while letting the middle of the draft actually fail -
 * which is both truer to real drafts and the only way found to move the two
 * bands independently. See docs/DEVELOPMENT_AUDIT.md, D-P0-1.
 */
const RELIABILITY_AT_LOW_POTENTIAL = 0.35;
const RELIABILITY_AT_HIGH_POTENTIAL = 0.85;
const LOW_POTENTIAL_ANCHOR = 70;
const HIGH_POTENTIAL_ANCHOR = 97;
const MAX_CEILING_REALIZATION = 1.0;

/**
 * The real ceiling a player converges to, from his scouted potential and a
 * trait that is stable across his career.
 *
 * Deterministic from the id, so a career arc is identical on replay and needs
 * no schema column. Never below the rating he already has - a scouting miss
 * caps a player, it does not un-develop him.
 */
export function effectiveCeiling(
  overallRating: number,
  potentialRating: number,
  trait: number,
): number {
  // A better report is a more reliable one - see RELIABILITY_AT_HIGH_POTENTIAL.
  const reportQuality = clamp01(
    (potentialRating - LOW_POTENTIAL_ANCHOR) / (HIGH_POTENTIAL_ANCHOR - LOW_POTENTIAL_ANCHOR),
  );
  const floor =
    RELIABILITY_AT_LOW_POTENTIAL +
    reportQuality * (RELIABILITY_AT_HIGH_POTENTIAL - RELIABILITY_AT_LOW_POTENTIAL);
  const realization = floor + clamp01(trait) * (MAX_CEILING_REALIZATION - floor);

  // Anchored to the rating floor, not to what the player is rated today.
  // Measuring the shortfall from his *current* rating makes the ceiling chase
  // him upward every season - an asymptote toward full potential, which is
  // precisely the certainty this replaces.
  const ceiling = MIN_RATING + (potentialRating - MIN_RATING) * realization;

  // A scouting miss caps a player; it never un-develops one. A ceiling below
  // where he already is simply means he is finished growing.
  return Math.max(overallRating, Math.round(ceiling));
}

/**
 * A player's development trait, 0 (his ceiling is barely above where he already
 * is) to 1 (he reaches his scouting report). Stable for his whole career -
 * per-season randomness averages out over six development years and would let
 * every prospect reach his ceiling anyway, which is the defect this replaces.
 */
export function developmentTraitFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const NEUTRAL_DEVELOPMENT_TRAIT = 0.5;

/** Share of the remaining climb a young player covers in a season, before noise. */
const GROWTH_PACE = 0.5;
const MAX_GROWTH_PER_SEASON = 6;

/**
 * How much being elite slows decline, at the top of the scale.
 *
 * **Decline used to be absolute.** A 99 and a 70 lost the same 1-3 points at
 * age 30, so nothing about being elite slowed the fall: of 400 players rated 95
 * at 27, 6% were still elite at 34 and 0% at 35. The seeded league opens with
 * LeBron at 40, Durant at 37, Curry at 37 and Kawhi at 34 - four players the
 * model said could not exist. Real elite athletes age far better than
 * replacement-level ones. See D-P1-1.
 */
const ELITE_DECLINE_DAMPING = 0.55;
const ELITE_DAMPING_FLOOR_RATING = 75; // below this, no damping at all
const ELITE_DAMPING_FULL_RATING = 99;

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  /**
   * 0-1, stable for this player's whole career - see `developmentTraitFromId`.
   * Decides how much of his scouted potential is real. Omitted behaves as the
   * league-average scouting outcome.
   */
  developmentTrait?: number;
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
  developmentTrait,
}: DevelopPlayerRatingInput): number {
  // The scouting report is an estimate; this is what it was actually worth.
  const realCeiling = effectiveCeiling(
    overallRating,
    potentialRating,
    developmentTrait ?? NEUTRAL_DEVELOPMENT_TRAIT,
  );
  const room = realCeiling - overallRating;
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
    // The share of his remaining ceiling this player converts. Driven by a
    // trait that is stable across his whole career, because per-season
    // randomness averages out over six development years and would let every
    // prospect reach his ceiling anyway - which is exactly the defect this
    // replaces.
    // Pace scales with how far he still has to climb, capped so nobody jumps a
    // tier in one summer. A flat 1-4 meant a prospect with a genuine 95 ceiling
    // gained ~17 points over seven years and stalled in the high 80s - he could
    // never actually arrive, so the league's top drained no matter how the
    // ceiling was set. The ceiling decides who can be great; this decides
    // whether the ones who can, get there in time.
    const pace = Math.max(1, Math.min(MAX_GROWTH_PER_SEASON, Math.round(room * GROWTH_PACE)));
    const growth = randomIntInclusive(rng, 1, Math.min(pace, Math.max(1, room)));

    const applied = Math.max(
      1,
      Math.min(
        room,
        Math.round(growth + coachBonus + minutesBonus + moraleBonus + playerDevelopmentBonus),
      ),
    );
    return Math.min(realCeiling, overallRating + applied);
  }

  if (age < DECLINE_START_AGE) {
    // Prime years: small natural variance, no directional bias.
    const drift = randomIntInclusive(rng, -1, 1);
    const drifted = clampRating(overallRating + drift);
    // A young player who has already reached his ceiling lands here too, and
    // an upward drift would walk him straight past it - so the ceiling still
    // binds until he is out of the development band.
    return age <= YOUNG_DEVELOPMENT_AGE_CEILING ? Math.min(drifted, realCeiling) : drifted;
  }

  // Past peak: decline accelerates the further past 30 a player is. A good
  // development coach - or real, heavy playing time, or good morale -
  // helps a vet stay sharp, slightly dampening (never reversing) the
  // decline.
  const yearsPastDeclineStart = age - DECLINE_START_AGE;
  const baseDecline = 1 + Math.floor(yearsPastDeclineStart / 3);
  // Elite players age better. Scaled by rating rather than applied flat, so a
  // league can still contain a 37-year-old star - see ELITE_DECLINE_DAMPING.
  const eliteness = clamp01(
    (overallRating - ELITE_DAMPING_FLOOR_RATING) /
      (ELITE_DAMPING_FULL_RATING - ELITE_DAMPING_FLOOR_RATING),
  );
  const rolled = randomIntInclusive(rng, baseDecline, baseDecline + 2);
  const decline = Math.max(
    0,
    rolled * (1 - ELITE_DECLINE_DAMPING * eliteness) -
      coachBonus -
      minutesBonus -
      moraleBonus -
      playerDevelopmentBonus,
  );
  return clampRating(Math.round(overallRating - decline));
}
