import type { PayrollTier } from "./payrollTier";

/**
 * Ordered 0-5, matching the 0-6 actual-outcome scale in
 * `seasonEvaluation.ts` (an outcome index equal to an expectation's own
 * index exactly *meets* it) - see that module for how the two line up.
 */
export type ExpectationLevel =
  | "DEVELOP_YOUNG_PLAYERS"
  | "COMPETE_FOR_PLAY_IN"
  | "MAKE_PLAYOFFS"
  | "WIN_PLAYOFF_SERIES"
  | "DEEP_PLAYOFF_RUN"
  | "CHAMPIONSHIP_CONTENTION";

export const EXPECTATION_LEVEL_ORDER: ExpectationLevel[] = [
  "DEVELOP_YOUNG_PLAYERS",
  "COMPETE_FOR_PLAY_IN",
  "MAKE_PLAYOFFS",
  "WIN_PLAYOFF_SERIES",
  "DEEP_PLAYOFF_RUN",
  "CHAMPIONSHIP_CONTENTION",
];

export const EXPECTATION_LEVEL_LABEL: Record<ExpectationLevel, string> = {
  DEVELOP_YOUNG_PLAYERS: "Develop young players",
  COMPETE_FOR_PLAY_IN: "Compete for a Play-In spot",
  MAKE_PLAYOFFS: "Make the playoffs",
  WIN_PLAYOFF_SERIES: "Win a playoff series",
  DEEP_PLAYOFF_RUN: "Make a deep playoff run",
  CHAMPIONSHIP_CONTENTION: "Compete for a championship",
};

// Each payroll tier's expectation before any roster-quality adjustment -
// spending sets the baseline, per the design brief ("payroll should be an
// important factor, but not necessarily the only factor").
const BASE_INDEX_BY_TIER: Record<PayrollTier, number> = {
  MODEST: 0,
  MODERATE: 2,
  SIGNIFICANT: 3,
  EXTREME: 4,
};

// Team strengths above/below these move the expectation a level in either
// direction.
//
// **These are on the TEAM-STRENGTH scale, not the player-rating scale**, and
// that distinction was the bug. They were set to 80/65 by analogy with
// `playerValueTier.ts`'s STAR/ROTATION boundaries - but a team strength is a
// weighted roster average, which is far more tightly clustered than any single
// player's rating. Against the old weights the league ran 73.0-78.8, so
// **neither threshold was reachable**: no roster was ever elite and none was
// ever weak, and this function silently returned the payroll tier's base index
// for all 30 teams in every save.
//
// Re-weighting `computeTeamStrength` (docs/TEAM_STRENGTH_AUDIT.md) moved the
// range to 75.5-85.0 and turned a dead threshold into an over-firing one: 22 of
// 30 teams cleared 80. Both are now set from the measured distribution - elite
// is roughly the top five rosters, weak roughly the bottom five.
//
// They are scale-dependent by nature and must be re-derived whenever
// `computeTeamStrength`'s weights change. `scripts/team-strength-audit.ts`
// prints the distribution.
const ELITE_ROSTER_STRENGTH_THRESHOLD = 82.6;
const WEAK_ROSTER_STRENGTH_THRESHOLD = 78.7;

/**
 * Sets a preseason expectation from payroll tier + roster quality - an
 * expensive roster that's genuinely elite gets held to a title standard;
 * an expensive roster that's actually mediocre (bad contracts) gets some
 * benefit of the doubt; a cheap roster that's surprisingly good earns a
 * bump up from the baseline "develop young players" ask.
 */
export function computeExpectationLevel(
  payrollTier: PayrollTier,
  teamStrength: number,
): ExpectationLevel {
  let index = BASE_INDEX_BY_TIER[payrollTier];

  if (teamStrength >= ELITE_ROSTER_STRENGTH_THRESHOLD) index += 1;
  else if (teamStrength <= WEAK_ROSTER_STRENGTH_THRESHOLD) index -= 1;

  index = Math.max(0, Math.min(EXPECTATION_LEVEL_ORDER.length - 1, index));
  return EXPECTATION_LEVEL_ORDER[index];
}
